// The task page, pushed over the list: one task, with pickers for its list,
// due date and priority, its checklist and its notes.

import { div } from "gpui-kit";
import { v_flex, h_flex, Popover } from "gpui-base";
import { PRIORITY_LABELS, dueLabel, dateSection, today, allDay } from "./query.js";
import { taskUrl } from "./ticktick.js";
import { icon, iconButton, button, flag, checkbox } from "./ui.js";

const PRIORITY_ORDER = [5, 3, 1, 0];

function header(view, t, task) {
  return h_flex().h(42).flex_none().pl(6).pr(8).gap(6).items_center().border_b(1).border_color(t.border)
    .child(iconButton(t, "tt-back", "chevron-left", (_e, cx) => view.back(cx), { tip: "Back" }))
    .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(task ? view.listName(task) : "Task"))
    .when(Boolean(task), (el) => el
      .child(iconButton(t, "tt-open", "external", (_e, cx) => cx.open_url(taskUrl(task)), { tip: "Open in TickTick" })));
}

function field(t, label, value) {
  return h_flex().min_h(26).gap(10).items_center().text_size(12.5)
    .child(div().w(76).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).child(value));
}

const plain = (t, text, color) => div().min_w(0).truncate().text_color(color ?? t.foreground).child(text);

function picker(view, t, kind, value, menu) {
  const trigger = h_flex().id(`tt-pick-${kind}`).min_h(24).px(6).ml(-6).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover)).child(value);
  return Popover.new(`tt-picker-${kind}`).anchor("top_left")
    .open(view.picker === kind)
    .on_open_change((open, cx) => {
      view.picker = open ? kind : null;
      cx.notify();
    })
    .trigger(trigger)
    .content(view.picker === kind ? menu() : div());
}

function menuFrame(t, id, children) {
  return v_flex().id(id).w(220).max_h(320).py(4).overflow_y_scrollbar()
    .bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12.5).children(children);
}

function option(t, id, current, content, onPick) {
  return h_flex().id(id).h(28).flex_none().px(10).gap(8).items_center().cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => onPick(cx))
    .child(h_flex().flex_1().min_w(0).gap(8).items_center().children(content))
    .when(current, (el) => el.child(icon("check").size(12).flex_none().text_color(t.foreground)));
}

function priorityMenu(view, t, task) {
  return menuFrame(t, "tt-priority-picker", PRIORITY_ORDER.map((p) => option(t, `tt-priority-${p}`, p === (task.priority ?? 0),
    [flag(t, p), plain(t, PRIORITY_LABELS[p])],
    (cx) => view.change(task, { priority: p }, cx))));
}

function dueMenu(view, t, task) {
  const now = today();
  const days = [["Today", 0], ["Tomorrow", 1], ["Next week", 7]];
  return menuFrame(t, "tt-due-picker", [
    ...days.map(([label, d]) => option(t, `tt-due-${d}`, false, [icon("calendar").size(13).flex_none().text_color(t.dim), plain(t, label)],
      (cx) => view.change(task, { ...allDay(now + d), timeZone: view.timeZone }, cx))),
    option(t, "tt-due-none", !task.dueDate && !task.startDate, [div().size(13).flex_none(), plain(t, "No date", t.muted)],
      (cx) => view.change(task, { startDate: null, dueDate: null, isAllDay: true }, cx)),
  ]);
}

function listMenu(view, t, task) {
  return menuFrame(t, "tt-list-picker", view.data.lists.map((l) => option(t, `tt-list-${l.id}`, l === view.listOf(task),
    [icon("list").size(13).flex_none().text_color(l.color ?? t.dim), plain(t, l.name)],
    (cx) => view.moveTo(task, l.id, cx))));
}

function checklist(view, t, task) {
  const items = [...(task.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return v_flex().gap(2)
    .child(h_flex().gap(6).items_center().pt(6)
      .child(div().text_size(12).font_semibold().text_color(t.foreground).child("Checklist"))
      .child(div().text_size(12).text_color(t.dim).child(`${items.filter((i) => i.status).length}/${items.length}`)))
    .children(items.map((item) => h_flex().id(`tt-item-${item.id}`).min_h(26).gap(6).items_center()
      .child(checkbox(t, `tt-item-check-${item.id}`, 0, (_e, cx) => {
        const next = (task.items ?? []).map((i) => (i.id === item.id ? { ...i, status: i.status ? 0 : 1 } : i));
        view.change(task, { items: next }, cx);
      }, { done: Boolean(item.status) }))
      .child(div().flex_1().min_w(0).text_size(12.5).text_color(item.status ? t.dim : t.foreground).child(item.title || ""))));
}

export function taskPage(view, t) {
  const task = view.taskById(view.detailId);
  if (!task) {
    return v_flex().size_full().min_h(0).child(header(view, t, null))
      .child(div().px(14).py(12).text_size(12).text_color(t.dim).child("This task is done, or no longer here."));
  }
  const now = today();
  const due = dueLabel(task, now);
  const late = dateSection(task, now) === "overdue";
  const column = view.listOf(task)?.columns?.find((c) => c.id === task.columnId);
  const notes = String(task.content || task.desc || "").trim();
  return v_flex().size_full().min_h(0)
    .child(header(view, t, task))
    .child(v_flex().id("tt-task").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(10)
      .child(h_flex().gap(6).items_start()
        .child(checkbox(t, "tt-task-check", task.priority ?? 0, (_e, cx) => view.complete(task, cx), { done: view.completing.has(task.id), tip: "Complete" }))
        .child(div().flex_1().min_w(0).pt(2).text_size(15).font_semibold().text_color(t.foreground).child(task.title || "Untitled")))
      .when(Boolean(view.editError), (el) => el.child(div().text_size(12).text_color(t.blocked).child(view.editError)))
      .child(v_flex().gap(2)
        .child(field(t, "List", picker(view, t, "list",
          h_flex().gap(6).items_center().child(icon("list").size(13).flex_none().text_color(view.listOf(task)?.color ?? t.dim)).child(plain(t, view.listName(task))),
          () => listMenu(view, t, task))))
        .when(Boolean(column), (el) => el.child(field(t, "Section", plain(t, column?.name ?? ""))))
        .child(field(t, "Due", picker(view, t, "due",
          due ? plain(t, due, late ? t.blocked : t.foreground) : plain(t, "No date", t.dim),
          () => dueMenu(view, t, task))))
        .child(field(t, "Priority", picker(view, t, "priority",
          h_flex().gap(6).items_center().child(flag(t, task.priority ?? 0)).child(plain(t, PRIORITY_LABELS[task.priority ?? 0] ?? "None")),
          () => priorityMenu(view, t, task))))
        .when((task.tags ?? []).length > 0, (el) => el.child(field(t, "Tags",
          h_flex().flex_wrap().gap(4).children(task.tags.map((tag) => div().px(6).py(1).border_1().border_color(t.border)
            .text_size(11.5).text_color(t.muted).child(tag)))))))
      .when((task.items ?? []).length > 0, (el) => el.child(checklist(view, t, task)))
      .child(v_flex().gap(4).pt(6)
        .child(div().text_size(12).font_semibold().text_color(t.foreground).child("Notes"))
        .child(notes
          ? v_flex().gap(2).text_size(12.5).text_color(t.muted).children(notes.split("\n").map((line) => div().min_h(16).child(line)))
          : div().text_size(12).text_color(t.dim).child("No notes.")))
      .child(h_flex().pt(8).child(button(t, "tt-open-app", "Open in TickTick", (_e, cx) => cx.open_url(taskUrl(task)), { icon: "external" }))));
}
