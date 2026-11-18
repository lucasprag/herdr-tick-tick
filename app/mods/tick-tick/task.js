// The task page, pushed over the list: one task, with pickers for its list,
// due date and priority, its checklist and its notes. The title, checklist
// items and notes edit in place: click one and it turns into an editor of the
// same size.

import { div } from "gpui-kit";
import { v_flex, h_flex, Popover, Textarea } from "gpui-base";
import { PRIORITY_LABELS, dueLabel, dateSection, today, allDay } from "./query.js";
import { taskUrl } from "./ticktick.js";
import { icon, iconButton, button, flag, checkbox, plain, menuFrame, menuOption, priorityMenu } from "./ui.js";

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

function taskPriorityMenu(view, t, task) {
  return priorityMenu(t, "tt-priority-picker", task.priority ?? 0, (p, cx) => view.change(task, { priority: p }, cx));
}

function dueMenu(view, t, task) {
  const now = today();
  const days = [["Today", 0], ["Tomorrow", 1], ["Next week", 7]];
  return menuFrame(t, "tt-due-picker", [
    ...days.map(([label, d]) => menuOption(t, `tt-due-${d}`, false, [icon("calendar").size(13).flex_none().text_color(t.dim), plain(t, label)],
      (cx) => view.change(task, { ...allDay(now + d), timeZone: view.timeZone }, cx))),
    menuOption(t, "tt-due-none", !task.dueDate && !task.startDate, [div().size(13).flex_none(), plain(t, "No date", t.muted)],
      (cx) => view.change(task, { startDate: null, dueDate: null, isAllDay: true }, cx)),
  ]);
}

function listMenu(view, t, task) {
  return menuFrame(t, "tt-list-picker", view.data.lists.map((l) => menuOption(t, `tt-list-${l.id}`, l === view.listOf(task),
    [icon("list").size(13).flex_none().text_color(l.color ?? t.dim), plain(t, l.name)],
    (cx) => view.moveTo(task, l.id, cx))));
}

// Display and editor share the box, font and line height, so a click doesn't
// move anything. Each display line keeps the line height even when empty, as
// the editor does.
function editable(view, t, key, value, opts) {
  const { size, lineHeight, semibold, color, placeholder } = opts;
  const box = div().id(`tt-edit-${key}`).flex_1().min_w(0).text_size(size).line_height(`${lineHeight}px`)
    .when(Boolean(semibold), (el) => el.font_semibold());
  if (view.edit?.key === key) {
    return box
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        view.finishEdit(false, cx);
        cx.stop_propagation();
      })
      .child(Textarea.new(view.edit.state).w_full().text_size(size).line_height(`${lineHeight}px`)
        .when(Boolean(semibold), (el) => el.font_semibold()).text_color(t.foreground));
  }
  const lines = value ? value.split("\n") : [placeholder];
  return box.cursor_text().text_color(value ? color : t.dim)
    .on_click((_e, cx) => view.startEdit(key, value, opts, cx))
    .children(lines.map((line) => div().min_h(lineHeight).child(line)));
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
      .child(editable(view, t, `item-${item.id}`, item.title || "", {
        size: 12.5, lineHeight: 18, color: item.status ? t.dim : t.foreground, placeholder: "Empty item",
        save: (title, cx) => {
          const now = view.taskById(task.id);
          if (!now || !title.trim()) return;
          const next = (now.items ?? []).map((i) => (i.id === item.id ? { ...i, title: title.trim() } : i));
          view.change(now, { items: next }, cx);
        },
      }))));
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
  // TickTick keeps a checklist task's description in `desc`, any other's in `content`.
  const notesField = task.kind === "CHECKLIST" ? "desc" : "content";
  const notes = String(task[notesField] || task.content || task.desc || "").trimEnd();
  return v_flex().size_full().min_h(0)
    .child(header(view, t, task))
    .child(v_flex().id("tt-task").flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(10)
      .child(h_flex().gap(6).items_start()
        .child(checkbox(t, "tt-task-check", task.priority ?? 0, (_e, cx) => view.complete(task, cx), { done: view.completing.has(task.id), tip: "Complete" }))
        .child(div().flex_1().min_w(0).pt(1).child(editable(view, t, "title", task.title || "", {
          size: 15, lineHeight: 20, semibold: true, color: t.foreground, placeholder: "Untitled",
          save: (title, cx) => {
            const now = view.taskById(task.id);
            if (now && title.trim()) view.change(now, { title: title.trim() }, cx);
          },
        }))))
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
          () => taskPriorityMenu(view, t, task))))
        .when((task.tags ?? []).length > 0, (el) => el.child(field(t, "Tags",
          h_flex().flex_wrap().gap(4).children(task.tags.map((tag) => div().px(6).py(1).border_1().border_color(t.border)
            .text_size(11.5).text_color(t.muted).child(tag)))))))
      .when((task.items ?? []).length > 0, (el) => el.child(checklist(view, t, task)))
      .child(v_flex().gap(4).pt(6)
        .child(div().text_size(12).font_semibold().text_color(t.foreground).child("Notes"))
        .child(editable(view, t, "notes", notes, {
          size: 12.5, lineHeight: 18, color: t.muted, placeholder: "Add notes", multiline: true,
          save: (text, cx) => {
            const now = view.taskById(task.id);
            if (now) view.change(now, { [notesField]: text.trimEnd() }, cx);
          },
        })))
      .child(h_flex().pt(8).child(button(t, "tt-open-app", "Open in TickTick", (_e, cx) => cx.open_url(taskUrl(task)), { icon: "external" }))));
}
