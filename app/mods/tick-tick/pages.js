// Settings (views), help (the query syntax) and the first-run page (no token
// in the Keychain, or TickTick refused it).

import { div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState } from "gpui-base";
import { run } from "herdr";
import { SYNTAX, parseQuery } from "./query.js";
import * as ticktick from "./ticktick.js";
import { icon, iconButton, button } from "./ui.js";

function pageHeader(view, t, title, extra) {
  return h_flex().h(42).flex_none().pl(6).pr(8).gap(6).items_center().border_b(1).border_color(t.border)
    .child(iconButton(t, `tt-back-${title}`, "chevron-left", (_e, cx) => view.back(cx), { tip: "Back" }))
    .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(title))
    .when(Boolean(extra), (el) => el.child(extra));
}

// ---- settings ---------------------------------------------------------------

let nextId = 0;

/** A view being edited: its inputs. Call from init or a handler, never render. */
export function newDraftView(v, cx) {
  const id = v.id ?? `v${Date.now().toString(36)}${(nextId++).toString(36)}`;
  const name = InputState.new({ placeholder: "Name", value: v.name ?? "" });
  const query = InputState.new({ placeholder: "list:smile due:today pri:high", value: v.query ?? "" });
  name.on("change", (_e, cx) => cx.notify());
  query.on("change", (_e, cx) => cx.notify());
  return { id, name, query, sort: v.sort };
}

function input(t, id, state, mono) {
  return h_flex().id(id).h(30).px(8).items_center().border_1().border_color(t.input).bg(t.background)
    .on_click(() => state.focus())
    .child(Input.new(state).flex_1().h_full().text_size(12.5).text_color(t.foreground)
      .when(Boolean(mono), (el) => el.font_family("JetBrains Mono")));
}

function draftView(view, t, d, index, count) {
  const move = (delta) => (_e, cx) => {
    const list = view.draft.views;
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    cx.notify();
  };
  const error = parseQuery(d.query.value()).error;
  return v_flex().id(`tt-draft-${d.id}`).p(10).gap(6).border_1().border_color(t.border)
    .child(h_flex().gap(4).items_center()
      .child(div().flex_1().min_w(0).child(input(t, `tt-name-${d.id}`, d.name)))
      .child(index > 0 ? iconButton(t, `tt-up-${d.id}`, "chevron-up", move(-1), { tip: "Move up" }) : div().size(26))
      .child(index < count - 1 ? iconButton(t, `tt-down-${d.id}`, "chevron-down", move(1), { tip: "Move down" }) : div().size(26))
      .child(count > 1
        ? iconButton(t, `tt-delete-${d.id}`, "trash", (_e, cx) => { view.draft.views.splice(index, 1); cx.notify(); }, { tip: "Delete view" })
        : div().size(26)))
    .child(input(t, `tt-query-${d.id}`, d.query, true))
    .when(Boolean(error), (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(error)));
}

function toggle(t, id, label, on, onClick) {
  return h_flex().id(id).h(30).gap(8).items_center().cursor_pointer().on_click(onClick)
    .child(div().size(14).flex_none().flex().items_center().justify_center().border_1()
      .border_color(on ? t.accent : t.input).bg(on ? t.accent : t.chrome)
      .when(on, (el) => el.child(icon("check").size(11).text_color(t.accent_foreground))))
    .child(div().text_size(12.5).text_color(t.foreground).child(label));
}

export function settingsPage(view, t) {
  const views = view.draft.views;
  const invalid = views.some((d) => parseQuery(d.query.value()).error);
  return v_flex().size_full().min_h(0)
    .child(pageHeader(view, t, "Settings"))
    .child(v_flex().id("tt-settings").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(14)
      .child(v_flex().gap(8)
        .child(h_flex().items_center()
          .child(div().flex_1().text_size(12).font_semibold().text_color(t.foreground).child("Views"))
          .child(iconButton(t, "tt-hett-from-settings", "help", (_e, cx) => { view.page = "help"; view.helpBack = "settings"; cx.notify(); }, { tip: "Query syntax" })))
        .child(div().text_size(11.5).text_color(t.dim).child("Each view is a tab: a name and a query. The help (?) lists the query syntax."))
        .children(views.map((d, i) => draftView(view, t, d, i, views.length)))
        .child(h_flex().child(button(t, "tt-add-draft", "Add a view", (_e, cx) => {
          const v = newDraftView({ name: "New view", query: "" }, cx);
          view.draft.views.push(v);
          v.name.focus();
          cx.notify();
        }, { icon: "plus" })))))
    .child(h_flex().flex_none().px(14).py(10).gap(8).justify_end().items_center().border_t(1).border_color(t.border)
      .when(invalid, (el) => el.child(div().flex_1().text_size(11.5).text_color(t.blocked).child("Fix the query errors to save.")))
      .child(button(t, "tt-cancel", "Cancel", (_e, cx) => view.back(cx)))
      .child(button(t, "tt-save", "Save", (_e, cx) => { if (!invalid) view.saveSettings(cx); }, { solid: !invalid })));
}

// ---- help -------------------------------------------------------------------

export function helpPage(view, t) {
  const back = (_e, cx) => {
    view.page = view.helpBack ?? "list";
    view.helpBack = null;
    cx.notify();
  };
  const notes = [
    "Tokens separated by spaces must all hold.",
    "Commas in a token mean any of: due:overdue,tomorrow.",
    "A leading - negates: -tag:waiting.",
    'Quote values with spaces: list:"Side work".',
  ];
  return v_flex().size_full().min_h(0)
    .child(h_flex().h(42).flex_none().pl(6).pr(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(iconButton(t, "tt-back-help", "chevron-left", back, { tip: "Back" }))
      .child(div().flex_1().font_semibold().text_color(t.foreground).child("Query syntax")))
    .child(v_flex().id("tt-help").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(12)
      .child(v_flex().gap(3).text_size(12).text_color(t.muted).children(notes.map((n) => div().child(n))))
      .child(v_flex().border_t(1).border_color(t.border)
        .children(SYNTAX.map(([token, meaning], i) => h_flex().id(`tt-syntax-${i}`).py(6).gap(10).items_start()
          .border_b(1).border_color(t.border)
          .child(div().w(150).flex_none().font_family("JetBrains Mono").text_size(11.5).text_color(t.foreground).child(token))
          .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(meaning)))))
      .child(div().text_size(11.5).text_color(t.dim).child(
        "A view on one list shows that list's sections; any other view shows date sections. Sort picks the order inside each section. The search box filters the shown view by title as you type.")));
}

// ---- first run --------------------------------------------------------------

function code(t, text) {
  return div().px(8).py(5).bg(t.background).border_1().border_color(t.border)
    .font_family("JetBrains Mono").text_size(11.5).text_color(t.foreground).child(text);
}

export function setupPage(view, t) {
  const p = view.problem;
  const again = button(t, "tt-check-again", "Check again", (_e, cx) => {
    ticktick.forget();
    view.problem = null;
    view.refresh(cx);
  }, { solid: true });
  const intro = p.kind === "token"
    ? [
      div().text_size(13).font_semibold().text_color(t.foreground).child("Connect TickTick"),
      div().text_size(12).text_color(t.muted).child("The panel reads TickTick with a personal API token, kept in your Keychain. Create one in TickTick's web app: your avatar, Settings, Account, API Token."),
    ]
    : [
      div().text_size(13).font_semibold().text_color(t.foreground).child("TickTick refused the token"),
      div().text_size(12).text_color(t.muted).child("The token in your Keychain was revoked or mistyped. Create a new one in TickTick's web app: your avatar, Settings, Account, API Token."),
    ];
  return v_flex().size_full().min_h(0)
    .child(h_flex().h(42).flex_none().px(14).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().text_color(t.foreground).child("TickTick")))
    .child(v_flex().px(14).py(14).gap(8).children(intro)
      .child(div().text_size(12).text_color(t.muted).child("Then run this in a terminal and paste the token when it asks (it isn't shown or saved in your shell history):"))
      .child(code(t, ticktick.SAVE_TOKEN))
      .when(p.kind !== "token", (el) => el.child(div().text_size(11.5).text_color(t.dim).child(p.message)))
      .child(h_flex().pt(4).gap(8)
        .child(again)
        .child(button(t, "tt-save-token", "Run it in a new tab", () => {
          run("tab.new", { name: "TickTick token", argv: ["/bin/sh", "-c", `${ticktick.SAVE_TOKEN} && echo "Saved. Click Check again in the TickTick panel."; exec "$SHELL"`] });
        }))));
}
