// tick-tick: TickTick tasks in a Herdr side panel.
//
// Everything goes through TickTick's Open API (ticktick.js): one load brings
// every open task of every list, and each view (a tab) is a query over it
// (query.js). Prefs live in Herdr's shared state under "tick-tick.prefs", so
// they survive layout rebuilds. One View, five pages: the list (list.js), a
// task (task.js), settings, help and first-run setup (pages.js).

import { View } from "gpui-kit";
import { v_flex, InputState } from "gpui-base";
import { theme, nextCommand } from "herdr";
import * as ticktick from "./ticktick.js";
import { parseQuery, defaultsFor, findList, allDay, today } from "./query.js";
import { readPrefs, writePrefs, selectedView } from "./prefs.js";
import { listPage } from "./list.js";
import { taskPage } from "./task.js";
import { settingsPage, helpPage, setupPage, newDraftView } from "./pages.js";

const REFRESH_MS = 2 * 60 * 1000; // gently: Herdr keeps hidden copies running
const SPIN_MS = 900;
const GONE_MS = 600; // a completed task stays, checked, this long

export default class TickTickPanel extends View {
  init(_props, cx) {
    this.page = "list"; // list | task | settings | help
    this.data = null; // { lists, tasks }
    this.busy = false;
    this.problem = null; // { kind: "token" | "auth", message }: the setup page
    this.banner = null; // a transient problem (TickTick unreachable); data stays
    this.queries = new Map(); // query text -> parseQuery()
    this.search = InputState.new({ placeholder: "Search tasks" });
    this.search.on("change", (_e, cx) => cx.notify());
    this.add = InputState.new({ placeholder: "Add a task" });
    this.add.on("submit", (_e, cx) => this.addTask(cx));
    this.adding = false;
    this.sortOpen = false;
    this.completing = new Set(); // task ids checked, on their way out
    // The task page.
    this.detailId = null;
    this.picker = null; // "list" | "due" | "priority"
    this.editError = null;
    // Settings.
    this.draft = null;
    try {
      this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      this.timeZone = undefined;
    }

    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    // keys.json / `herdr-app do`: tick-tick.refresh, .open:<id>, .add, .search, .back,
    // .help, .settings, .view:<name>, .add-view:<name>=<query>.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c, cx);
        cx.notify();
      }
    });
  }

  command(c, cx) {
    const i = c.indexOf(":");
    const name = i < 0 ? c : c.slice(0, i);
    const arg = i < 0 ? "" : c.slice(i + 1);
    if (name === "refresh") this.refresh(cx);
    else if (name === "open" && arg) this.openTask(arg, cx);
    else if (name === "back") this.back(cx);
    else if (name === "help") this.page = "help";
    else if (name === "settings") this.openSettings(cx);
    else if (name === "search") { this.page = "list"; this.search.focus(); }
    else if (name === "add") { this.page = "list"; this.add.focus(); }
    else if (name === "view" && arg) {
      const v = readPrefs().views.find((v) => v.name.toLowerCase() === arg.toLowerCase() || v.id === arg);
      if (v) writePrefs({ selected: v.id });
      this.page = "list";
    }
    else if (name === "add-view" && arg.includes("=")) this.addView(arg);
  }

  // `add-view:<name>=<query>`: adds the view and selects it; a view with that
  // name already gets the new query instead.
  addView(arg) {
    const eq = arg.indexOf("=");
    const viewName = arg.slice(0, eq).trim();
    const query = arg.slice(eq + 1).trim();
    if (!viewName || !query) return;
    const views = readPrefs().views;
    const same = views.find((v) => v.name.toLowerCase() === viewName.toLowerCase());
    if (same) {
      writePrefs({ views: views.map((v) => (v === same ? { ...v, query } : v)), selected: same.id });
    } else {
      const base = viewName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "view";
      let id = base;
      for (let n = 2; views.some((v) => v.id === id); n++) id = `${base}-${n}`;
      writePrefs({ views: [...views, { id, name: viewName, query, sort: "priority" }], selected: id });
    }
    this.page = "list";
  }

  // ---- data ---------------------------------------------------------------

  refresh(cx) {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    cx.notify(); // spin the refresh icon now
    const started = Date.now();
    cx.spawn(async (cx) => {
      do {
        this.again = false;
        try {
          this.data = await ticktick.everything();
          this.problem = null;
          this.banner = null;
        } catch (e) {
          if (e?.kind === "token" || e?.kind === "auth") this.problem = { kind: e.kind, message: String(e.message) };
          else this.banner = String(e?.message ?? e);
        }
      } while (this.again);
      cx.notify();
      const left = SPIN_MS - (Date.now() - started);
      if (left > 0) await cx.sleep(left);
      this.busy = false;
      cx.notify();
    });
  }

  parsed(query) {
    let p = this.queries.get(query);
    if (!p) this.queries.set(query, (p = parseQuery(query)));
    return p;
  }

  // Inbox tasks carry the Inbox's real id ("inbox115…"); an empty Inbox
  // doesn't say it, so the Inbox list may only know itself as "inbox".
  listOf(task) {
    const lists = this.data?.lists ?? [];
    if (String(task.projectId).startsWith("inbox")) return lists.find((l) => l.inbox) ?? null;
    return lists.find((l) => l.id === task.projectId) ?? null;
  }

  listName(task) {
    return this.listOf(task)?.name ?? "";
  }

  taskById(id) {
    return this.data?.tasks.find((t) => t.id === id) ?? null;
  }

  /** A view's tasks: { tasks, list, error }; `list` is the one list it shows, if any. */
  tasksOf(v) {
    const p = this.parsed(v.query);
    if (p.error) return { tasks: [], list: null, error: p.error };
    if (!this.data) return { tasks: [], list: null, error: null };
    const ctx = { listName: (t) => this.listName(t), today: today() };
    return {
      tasks: this.data.tasks.filter((t) => p.test(t, ctx)),
      list: p.list ? findList(this.data.lists, p.list) : null,
      error: null,
    };
  }

  /** Where a task added in this view goes: its one list, else the Inbox. */
  addTarget(v) {
    if (!this.data) return null;
    const d = defaultsFor(v.query);
    return findList(this.data.lists, d.list) ?? this.data.lists.find((l) => l.inbox) ?? null;
  }

  // ---- changes ------------------------------------------------------------

  addTask(cx) {
    const title = this.add.value().trim();
    const v = selectedView(readPrefs());
    const target = this.addTarget(v);
    if (!title || !target || this.adding) return;
    const d = defaultsFor(v.query);
    const fields = { title, projectId: target.id };
    if (d.priority !== null) fields.priority = d.priority;
    if (d.tags.length) fields.tags = d.tags;
    if (d.due !== null) Object.assign(fields, allDay(today() + d.due), { timeZone: this.timeZone });
    this.adding = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const saved = await ticktick.create(fields);
        this.add.set_value("");
        if (saved?.id) this.data.tasks.push(saved);
        this.banner = null;
      } catch (e) {
        this.banner = `Couldn't add the task: ${e?.message ?? e}`;
      }
      this.adding = false;
      cx.notify();
    });
  }

  complete(task, cx) {
    if (this.completing.has(task.id)) return;
    this.completing.add(task.id);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await ticktick.complete(task);
        await cx.sleep(GONE_MS);
        // A repeating task comes back with its next date: read it again.
        if (task.repeatFlag) this.refresh(cx);
        else this.data.tasks = this.data.tasks.filter((t) => t.id !== task.id);
        if (this.page === "task" && this.detailId === task.id) this.back(cx);
      } catch (e) {
        this.banner = `Couldn't complete the task: ${e?.message ?? e}`;
      }
      this.completing.delete(task.id);
      cx.notify();
    });
  }

  replace(saved) {
    this.data.tasks = this.data.tasks.map((t) => (t.id === saved.id ? { ...t, ...saved } : t));
  }

  /** Priority, due date or checklist: `patch` holds the Task fields to set. */
  change(task, patch, cx) {
    this.picker = null;
    this.editError = null;
    this.replace({ ...task, ...patch }); // at once; TickTick's answer follows
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.replace(await ticktick.update(task, patch));
      } catch (e) {
        this.replace(task);
        this.editError = `Couldn't save: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  moveTo(task, listId, cx) {
    this.picker = null;
    this.editError = null;
    if (listId === task.projectId) return cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.replace(await ticktick.move(task, listId));
      } catch (e) {
        this.editError = `Couldn't move it: ${e?.message ?? e}`;
      }
      cx.notify();
    });
    cx.notify();
  }

  // ---- pages --------------------------------------------------------------

  openTask(id, cx) {
    this.page = "task";
    this.detailId = id;
    this.picker = null;
    this.editError = null;
    cx.notify();
  }

  back(cx) {
    this.page = "list";
    this.picker = null;
    this.draft = null;
    cx.notify();
  }

  openSettings(cx, opts = {}) {
    const prefs = readPrefs();
    this.draft = { views: prefs.views.map((v) => newDraftView(v, cx)) };
    if (opts.add) {
      const v = newDraftView({ name: "New view", query: "" }, cx);
      this.draft.views.push(v);
      v.name.focus();
    }
    this.page = "settings";
    cx.notify();
  }

  saveSettings(cx) {
    const views = this.draft.views.map((d) => ({ id: d.id, name: d.name.value().trim() || "Untitled", query: d.query.value().trim(), sort: d.sort ?? "priority" }));
    if (!views.length) return;
    const prefs = readPrefs();
    const selected = views.some((v) => v.id === prefs.selected) ? prefs.selected : views[0].id;
    writePrefs({ views, selected });
    this.draft = null;
    this.page = "list";
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const prefs = readPrefs();
    let page;
    if (this.page === "help") page = helpPage(this, t);
    else if (this.page === "settings" && this.draft) page = settingsPage(this, t);
    else if (this.problem) page = setupPage(this, t);
    else if (this.page === "task" && this.detailId) page = taskPage(this, t);
    else page = listPage(this, t, prefs);
    return v_flex().id("tt-root").size_full().min_h(0).bg(t.chrome).overflow_hidden().text_size(13).child(page);
  }
}
