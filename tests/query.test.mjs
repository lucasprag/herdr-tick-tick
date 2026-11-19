// Run with: node --test
process.env.TZ = "America/Toronto";

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, parseDate, dayNumber, dueDay, dateSection, sortTasks, sections, findList, tokenize, splitValues, defaultsFor, allDay, dueLabel, oneLine } from "../app/mods/tick-tick/query.js";

// Thursday, Nov 12, 2026, 10:00 in Toronto.
const NOW = dayNumber(Date.UTC(2026, 10, 12, 15));
const LISTS = { p1: "smile", p2: "Family", inbox1: "Inbox" };
const ctx = { listName: (t) => LISTS[t.projectId] ?? "", today: NOW };

const task = (over) => ({ id: "t", projectId: "p1", title: "Task", priority: 0, sortOrder: 0, tags: [], ...over });
// All-day tasks come as local midnight in UTC: Nov 12 in Toronto is 05:00Z.
const due = (day) => `2026-11-${String(day).padStart(2, "0")}T05:00:00.000+0000`;

const q = (text) => {
  const r = parseQuery(text);
  assert.equal(r.error, null, r.error);
  return (t) => r.test(t, ctx);
};

test("dates: TickTick's format, with or without millis and a colon", () => {
  assert.equal(parseDate("2026-11-12T05:00:00.000+0000"), Date.UTC(2026, 10, 12, 5));
  assert.equal(parseDate("2026-11-12T05:00:00+0000"), Date.UTC(2026, 10, 12, 5));
  assert.equal(parseDate("2026-11-12T00:00:00-05:00"), Date.UTC(2026, 10, 12, 5));
  assert.equal(parseDate(""), null);
  assert.equal(parseDate(undefined), null);
});

test("an all-day task is due on its local day", () => {
  assert.equal(dueDay(task({ dueDate: due(12) })), NOW);
  assert.equal(dueDay(task({ startDate: due(13) })), NOW + 1);
  assert.equal(dueDay(task({})), null);
});

test("date sections", () => {
  assert.equal(dateSection(task({ dueDate: due(10) }), NOW), "overdue");
  assert.equal(dateSection(task({ dueDate: due(12) }), NOW), "today");
  assert.equal(dateSection(task({ dueDate: due(13) }), NOW), "tomorrow");
  assert.equal(dateSection(task({ dueDate: due(18) }), NOW), "week");
  assert.equal(dateSection(task({ dueDate: due(19) }), NOW), "later");
  assert.equal(dateSection(task({}), NOW), "none");
});

test("empty query matches everything", () => {
  assert.equal(q("")(task({})), true);
});

test("due:today includes overdue, not tomorrow or no date", () => {
  const today = q("due:today");
  assert.equal(today(task({ dueDate: due(12) })), true);
  assert.equal(today(task({ dueDate: due(1) })), true);
  assert.equal(today(task({ dueDate: due(13) })), false);
  assert.equal(today(task({})), false);
});

test("due: commas, none, and negation", () => {
  assert.equal(q("due:overdue,tomorrow")(task({ dueDate: due(13) })), true);
  assert.equal(q("due:overdue,tomorrow")(task({ dueDate: due(12) })), false);
  assert.equal(q("due:none")(task({})), true);
  assert.equal(q("-due:overdue due:today")(task({ dueDate: due(11) })), false);
  assert.equal(q("-due:overdue due:today")(task({ dueDate: due(12) })), true);
});

test("list: name contains, case-insensitive; inbox", () => {
  assert.equal(q("list:smile")(task({ projectId: "p1" })), true);
  assert.equal(q("list:family")(task({ projectId: "p2" })), true);
  assert.equal(q("list:family")(task({ projectId: "p1" })), false);
  assert.equal(q("list:inbox")(task({ projectId: "inbox1" })), true);
  assert.equal(q("-list:smile")(task({ projectId: "p2" })), true);
  assert.equal(parseQuery("list:smile").list, "smile");
  assert.equal(parseQuery("list:smile,family").list, null);
  assert.equal(parseQuery("-list:smile").list, null);
});

test("priority and tags", () => {
  assert.equal(q("pri:high")(task({ priority: 5 })), true);
  assert.equal(q("pri:high,medium")(task({ priority: 3 })), true);
  assert.equal(q("pri:none")(task({ priority: 0 })), true);
  assert.equal(q("pri:low")(task({ priority: 5 })), false);
  assert.equal(q("tag:Errands")(task({ tags: ["errands"] })), true);
  assert.equal(q("-tag:waiting")(task({ tags: ["waiting"] })), false);
});

test("title words and quotes", () => {
  assert.deepEqual(tokenize(' list:"Side work"  pri:high '), ['list:"Side work"', "pri:high"]);
  assert.deepEqual(splitValues('"Side work",smile'), ["Side work", "smile"]);
  assert.equal(q("dentist")(task({ title: "Call the Dentist" })), true);
  assert.equal(q("dentist")(task({ title: "Groceries" })), false);
});

test("errors name the bad value", () => {
  assert.match(parseQuery("pri:urgent").error, /Unknown priority "urgent"/);
  assert.match(parseQuery("due:someday").error, /Unknown due "someday"/);
  assert.equal(parseQuery("pri:urgent").test, null);
});

test("sort by priority: high first, then due date, no date last", () => {
  const list = [
    task({ id: "a", priority: 0, dueDate: due(12) }),
    task({ id: "b", priority: 5 }),
    task({ id: "c", priority: 5, dueDate: due(14) }),
    task({ id: "d", priority: 3 }),
  ];
  assert.deepEqual(sortTasks(list).map((t) => t.id), ["c", "b", "d", "a"]);
  assert.deepEqual(sortTasks(list, "due").map((t) => t.id), ["a", "c", "b", "d"]);
});

test("sort by title and manual order", () => {
  const list = [task({ id: "a", title: "b", sortOrder: 2 }), task({ id: "b", title: "a", sortOrder: -5 })];
  assert.deepEqual(sortTasks(list, "title").map((t) => t.id), ["b", "a"]);
  assert.deepEqual(sortTasks(list, "manual").map((t) => t.id), ["b", "a"]);
});

test("sections: dates by default, empty ones left out", () => {
  const s = sections([task({ id: "a", dueDate: due(1) }), task({ id: "b", dueDate: due(12) }), task({ id: "c", dueDate: due(1), priority: 5 })], { now: NOW });
  assert.deepEqual(s.map((g) => g.label), ["Overdue", "Today"]);
  assert.deepEqual(s[0].tasks.map((t) => t.id), ["c", "a"]);
});

test("sections: a list's own, in order, No Section last", () => {
  const list = { columns: [{ id: "k2", name: "Later", sortOrder: 2 }, { id: "k1", name: "Now", sortOrder: 1 }] };
  const s = sections([task({ id: "a", columnId: "k2" }), task({ id: "b", columnId: "k1" }), task({ id: "c" })], { list, now: NOW });
  assert.deepEqual(s.map((g) => g.label), ["Now", "Later", "No Section"]);
});

test("findList: exact name first, then contains; inbox", () => {
  const projects = [{ id: "1", name: "Smile Ops" }, { id: "2", name: "smile" }, { id: "inbox1", name: "Inbox", inbox: true }];
  assert.equal(findList(projects, "Smile").id, "2");
  assert.equal(findList(projects, "ops").id, "1");
  assert.equal(findList(projects, "inbox").id, "inbox1");
  assert.equal(findList(projects, "nope"), null);
});

test("defaultsFor: what a task added in a view starts with", () => {
  assert.deepEqual(defaultsFor("due:today"), { list: null, priority: null, tags: [], due: 0 });
  assert.deepEqual(defaultsFor("list:smile pri:high tag:a"), { list: "smile", priority: 5, tags: ["a"], due: null });
  assert.equal(defaultsFor("due:tomorrow").due, 1);
  assert.equal(defaultsFor("list:a,b").list, null);
  assert.equal(defaultsFor("-list:smile").list, null);
});

test("allDay: local midnight, as TickTick writes it", () => {
  assert.deepEqual(allDay(NOW), { startDate: "2026-11-12T05:00:00+0000", dueDate: "2026-11-12T05:00:00+0000", isAllDay: true });
  assert.equal(dueDay({ dueDate: allDay(NOW + 3).dueDate }), NOW + 3);
});

test("dueLabel", () => {
  assert.equal(dueLabel(task({ dueDate: due(12), isAllDay: true }), NOW), "Today");
  assert.equal(dueLabel(task({ dueDate: due(13), isAllDay: true }), NOW), "Tomorrow");
  assert.equal(dueLabel(task({ dueDate: due(11), isAllDay: true }), NOW), "Yesterday");
  assert.equal(dueLabel(task({ dueDate: due(16), isAllDay: true }), NOW), "Mon");
  assert.equal(dueLabel(task({ dueDate: due(3), isAllDay: true }), NOW), "Nov 3");
  assert.equal(dueLabel(task({ dueDate: "2026-11-12T19:30:00.000+0000", isAllDay: false }), NOW), "Today 14:30");
  assert.equal(dueLabel(task({}), NOW), "");
});

test("oneLine", () => {
  assert.equal(oneLine("[Aaron Patterson\n244 likes · 8 replies](https://x.com/a/status/1?s=46)"), "Aaron Patterson 244 likes · 8 replies");
  assert.equal(oneLine("  first\r\n\tsecond  "), "first second");
  assert.equal(oneLine("see [docs](https://a.b) and [x](y)"), "see docs and x");
  assert.equal(oneLine(undefined), "");
});
