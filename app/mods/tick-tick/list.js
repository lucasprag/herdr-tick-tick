// The list page: header, filter bar (search, view tabs, add a task, Sort),
// then the view's tasks in sections.

import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Popover } from "gpui-base";
import { SORTS, sections, dueLabel, today, dateSection } from "./query.js";
import { readPrefs, writePrefs, selectedView, setSort } from "./prefs.js";
import { icon, iconButton, checkbox, faint, faintOn } from "./ui.js";

function header(view, t, count) {
  return h_flex().h(42).flex_none().pl(14).pr(8).gap(8).items_center().border_b(1).border_color(t.border)
    .child(div().font_semibold().text_color(t.foreground).child("TickTick"))
    .when(count !== null, (el) => el.child(div().text_size(12).text_color(t.dim).child(String(count))))
    .child(div().flex_1())
    .child(iconButton(t, "tt-help", "help", (_e, cx) => { view.page = "help"; cx.notify(); }, { tip: "Query syntax" }))
    .child(iconButton(t, "tt-settings", "settings", (_e, cx) => view.openSettings(cx), { tip: "Settings" }))
    .child(iconButton(t, "tt-refresh", "refresh", (_e, cx) => view.refresh(cx), { spin: view.busy, size: 13, tip: "Refresh" }));
}

function searchBox(view, t) {
  const hasText = view.search.value().length > 0;
  return h_flex().id("tt-search").h(30).flex_none().px(14).gap(8).items_center().bg(faint(t))
    .on_click(() => view.search.focus())
    .child(icon("search").size(13).flex_none().text_color(t.dim))
    .child(Input.new(view.search).flex_1().h_full().text_size(13).text_color(t.foreground))
    .when(hasText, (el) => el.child(iconButton(t, "tt-search-clear", "x", (_e, cx) => {
      view.search.set_value("");
      cx.notify();
    }, { box: 20, size: 11, tip: "Clear" })));
}

function tabs(view, t, prefs) {
  const current = selectedView(prefs);
  return h_flex().h(28).flex_none().items_center().bg(faint(t))
    .children(prefs.views.map((v) => {
      const on = v.id === current.id;
      const shown = view.tasksOf(v);
      return h_flex().id(`tt-tab-${v.id}`).flex_1().min_w(0).h_full().px(6).gap(5).items_center().justify_center().cursor_pointer()
        .when(on, (el) => el.bg(faintOn(t)))
        .hover((s) => s.bg(faintOn(t)))
        .on_click((_e, cx) => {
          writePrefs({ selected: v.id });
          cx.notify();
        })
        .child(div().min_w(0).truncate().text_size(12).when(on, (el) => el.font_medium()).text_color(on ? t.foreground : t.muted).child(v.name || "Untitled"))
        .child(div().flex_none().text_size(11.5).text_color(t.dim).child(shown.error || !view.data ? "" : String(shown.tasks.length)));
    }))
    .child(iconButton(t, "tt-add-view", "plus", (_e, cx) => view.openSettings(cx, { add: true }), { box: 28, size: 12, tip: "Add a view" }));
}

function sortMenu(view, t, current) {
  return v_flex().id("tt-sort-menu").w(160).py(4).bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12.5)
    .children(SORTS.map((s) => h_flex().id(`tt-sort-${s.key}`).h(28).px(10).gap(8).items_center().cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => {
        setSort(current.id, s.key);
        view.sortOpen = false;
        cx.notify();
      })
      .child(div().size(14).flex_none().child(s.key === current.sort ? icon("check").size(13).text_color(t.foreground) : div()))
      .child(div().text_color(t.foreground).child(s.label))));
}

function addRow(view, t, current) {
  const target = view.addTarget(current);
  const trigger = h_flex().id("tt-sort-trigger").h(28).px(8).gap(6).flex_none().items_center().cursor_pointer()
    .border_1().border_color(t.border).hover((s) => s.bg(t.hover))
    .tooltip("Sort tasks by")
    .child(icon("sort").size(13).flex_none().text_color(t.dim))
    .child(div().text_size(12).text_color(t.muted).child(SORTS.find((s) => s.key === current.sort)?.label ?? "Priority"))
    .child(icon("chevron-down").size(12).flex_none().text_color(t.dim));
  const sort = Popover.new("tt-sort").anchor("top_right")
    .open(view.sortOpen)
    .on_open_change((open, cx) => { view.sortOpen = open; cx.notify(); })
    .trigger(trigger)
    .content(sortMenu(view, t, current));
  const add = h_flex().id("tt-add").flex_1().min_w(0).h(28).px(8).gap(6).items_center().border_1().border_color(t.border)
    .on_click(() => view.add.focus())
    .child(icon("plus").size(13).flex_none().text_color(t.dim))
    .child(Input.new(view.add).flex_1().h_full().text_size(12.5).text_color(t.foreground))
    .when(view.adding, (el) => el.child(icon("refresh").size(12).flex_none().text_color(t.dim).spin(900)))
    .when(Boolean(target) && !view.adding, (el) => el.child(div().flex_none().max_w(90).truncate().text_size(11.5).text_color(t.dim).child(target.name)));
  return h_flex().flex_none().gap(8).items_center()
    .child(add)
    .child(sort);
}

function sectionHeader(view, t, key, label, count, collapsed) {
  return h_flex().id(`tt-section-${key}`).h(30).flex_none().px(14).gap(8).items_center().cursor_pointer().bg(faint(t))
    .hover((s) => s.bg(faintOn(t)))
    .on_click((_e, cx) => {
      const c = readPrefs().collapsed;
      writePrefs({ collapsed: collapsed ? c.filter((k) => k !== key) : [...c, key] });
      cx.notify();
    })
    .child(icon(collapsed ? "chevron-right" : "chevron-down").size(12).flex_none().text_color(t.dim))
    .child(div().font_semibold().text_color(t.foreground).child(label))
    .child(div().text_size(12).text_color(t.dim).child(String(count)));
}

function taskLine(view, t, task, opts) {
  const done = view.completing.has(task.id);
  const items = task.items ?? [];
  const due = dueLabel(task, opts.now);
  const late = dateSection(task, opts.now) === "overdue";
  const parent = task.parentId ? view.taskById(task.parentId) : null;
  return h_flex().id(`tt-task-${task.id}`).h(31).flex_none().pl(10).pr(14).gap(6).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .when(done, (el) => el.opacity(0.5))
    .on_click((_e, cx) => view.openTask(task.id, cx))
    .child(checkbox(t, `tt-check-${task.id}`, task.priority ?? 0, (_e, cx) => {
      cx.stop_propagation();
      view.complete(task, cx);
    }, { done, tip: "Complete" }))
    .child(h_flex().flex_1().min_w(0).gap(6).items_center()
      .child(div().min_w(0).truncate().text_size(12.8).font_medium().text_color(t.foreground).child(task.title || "Untitled"))
      .when(Boolean(parent), (el) => el.child(div().flex_none().max_w(110).truncate().text_size(11.5).text_color(t.dim).child(`in ${parent.title}`)))
      .when(items.length > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim)
        .child(`${items.filter((i) => i.status).length}/${items.length}`))))
    .when(opts.showList, (el) => el.child(div().flex_none().max_w(90).truncate().text_size(11.5).text_color(t.dim).child(view.listName(task))))
    .when(Boolean(due), (el) => el.child(div().flex_none().text_size(11.5).text_color(late ? t.blocked : t.muted).child(due)));
}

function note(t, text, color) {
  return div().px(14).py(12).text_size(12).text_color(color ?? t.dim).child(text);
}

function body(view, t, prefs, current, shown) {
  if (!view.data) return note(t, "Loading tasks…");
  if (shown.error) return note(t, shown.error, t.blocked);
  const q = view.search.value().trim().toLowerCase();
  const tasks = q ? shown.tasks.filter((x) => String(x.title ?? "").toLowerCase().includes(q)) : shown.tasks;
  if (!tasks.length) return note(t, q ? "No tasks match the search." : "Nothing here. Enjoy the free time.");
  const now = today();
  const collapsed = new Set(prefs.collapsed);
  const lines = [];
  for (const s of sections(tasks, { list: shown.list, sort: current.sort, now })) {
    // Collapsed per view: a section key alone repeats across views.
    const key = `${current.id}:${s.key}`;
    const folded = collapsed.has(key);
    lines.push(sectionHeader(view, t, key, s.label, s.tasks.length, folded));
    if (!folded) for (const task of s.tasks) lines.push(taskLine(view, t, task, { now, showList: !shown.list }));
  }
  return v_flex().id("tt-list").flex_1().min_h(0).overflow_y_scrollbar().children(lines);
}

export function listPage(view, t, prefs) {
  const current = selectedView(prefs);
  const shown = view.tasksOf(current);
  const q = view.search.value().trim().toLowerCase();
  const count = view.data && !shown.error
    ? (q ? shown.tasks.filter((x) => String(x.title ?? "").toLowerCase().includes(q)).length : shown.tasks.length)
    : null;
  return v_flex().size_full().min_h(0)
    .child(header(view, t, count))
    .when(Boolean(view.banner), (el) => el.child(div().px(14).py(6).flex_none().text_size(11.5).text_color(t.blocked)
      .border_b(1).border_color(t.border).child(view.banner)))
    .child(v_flex().flex_none().gap(8)
      .child(searchBox(view, t))
      .child(tabs(view, t, prefs))
      .child(addRow(view, t, current)))
    .child(div().h(4).flex_none())
    .child(body(view, t, prefs, current, shown));
}
