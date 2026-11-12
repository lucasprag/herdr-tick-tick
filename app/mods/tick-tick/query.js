// The view query language, sections and sorting. Pure: no Herdr imports, so
// `node --test` can load it as is.
//
//   list:smile list:"Family stuff"   in a list (name contains), list:inbox
//   due:today due:overdue,tomorrow   by due date (today includes overdue)
//   pri:high,medium                  priority: high, medium, low, none
//   tag:errands                      has a tag
//   other words                      in the title
//
// Tokens separated by spaces must all hold; commas mean any of; a leading `-`
// negates; quotes keep spaces in a value.

// TickTick's priority numbers.
export const PRIORITIES = { none: 0, low: 1, medium: 3, high: 5 };
export const PRIORITY_LABELS = { 5: "High", 3: "Medium", 1: "Low", 0: "None" };

// The app's date sections, in order. `due:` values are the same words.
export const DATE_SECTIONS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "Next 7 Days" },
  { key: "later", label: "Later" },
  { key: "none", label: "No Date" },
];
const DUE_VALUES = ["overdue", "today", "tomorrow", "week", "later", "none"];

export const SORTS = [
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due date" },
  { key: "title", label: "Title" },
  { key: "manual", label: "Manual" },
];
export const DEFAULT_SORT = "priority";

// The help table, as the help page and README show it.
export const SYNTAX = [
  ['list:smile  list:"Side work"', "in a list whose name contains it; list:inbox for the Inbox"],
  ["due:today", "due today or overdue, like TickTick's Today"],
  ["due:overdue,tomorrow", "due: overdue, today, tomorrow, week (the next 7 days, overdue too), later, none"],
  ["pri:high,medium", "priority: high, medium, low, none"],
  ["tag:errands", "has the tag"],
  ["any other word", "in the title"],
];

// ---- dates ------------------------------------------------------------------

const DAY_MS = 86400000;

/** Milliseconds for TickTick's "2026-03-05T00:00:00.000+0000", or null. By
 *  hand: Date.parse doesn't take an offset without a colon everywhere. */
export function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):?(\d{2}))?$/.exec(String(text ?? ""));
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const offset = m[8] ? (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10])) * 60000 : 0;
  return utc - offset;
}

/** A calendar day here (local time) as a whole number, for comparing days. */
export function dayNumber(ms) {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Today's day number. */
export const today = () => dayNumber(Date.now());

/** The task's due day (local), falling back to its start; null when it has none. */
export function dueDay(task) {
  const ms = parseDate(task?.dueDate) ?? parseDate(task?.startDate);
  return ms === null ? null : dayNumber(ms);
}

/** The date section a task falls in. */
export function dateSection(task, now) {
  const d = dueDay(task);
  if (d === null) return "none";
  const diff = d - now;
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 6) return "week";
  return "later";
}

function dueMatches(value, task, now) {
  const d = dueDay(task);
  if (value === "none") return d === null;
  if (d === null) return false;
  const diff = d - now;
  if (value === "overdue") return diff < 0;
  if (value === "today") return diff <= 0;
  if (value === "tomorrow") return diff === 1;
  if (value === "week") return diff <= 6;
  return diff > 6; // later
}

// ---- tokens -----------------------------------------------------------------

/** Splits on spaces outside double quotes. Quotes stay in the token. */
export function tokenize(text) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of String(text ?? "")) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Splits a value on commas outside quotes and drops the quotes. */
export function splitValues(text) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim()).filter(Boolean);
}

const PREFIXES = [["list:", "list"], ["due:", "due"], ["pri:", "priority"], ["tag:", "tag"]];

/** One token: { neg, kind, values }. Anything without a known prefix is a title word. */
export function readToken(raw) {
  let text = raw;
  let neg = false;
  if (text.length > 1 && text.startsWith("-")) {
    neg = true;
    text = text.slice(1);
  }
  const lower = text.toLowerCase();
  for (const [prefix, kind] of PREFIXES) {
    if (lower.startsWith(prefix) && text.length > prefix.length) return { neg, kind, values: splitValues(text.slice(prefix.length)) };
  }
  return { neg, kind: "title", values: splitValues(text) };
}

class QueryError extends Error {}

const has = (text, part) => String(text ?? "").toLowerCase().includes(part.toLowerCase());

// One token as a test of (task, ctx), ctx = { listName(task), today }.
function tokenTest(tok) {
  const { kind, values } = tok;
  if (!values.length) throw new QueryError(`Nothing after the ${kind} prefix`);
  switch (kind) {
    case "list":
      return (task, ctx) => values.some((v) => (v.toLowerCase() === "inbox" ? String(task.projectId).startsWith("inbox") : has(ctx.listName(task), v)));
    case "due": {
      const keys = values.map((v) => {
        const k = v.toLowerCase();
        if (!DUE_VALUES.includes(k)) throw new QueryError(`Unknown due "${v}" (${DUE_VALUES.join(", ")})`);
        return k;
      });
      return (task, ctx) => keys.some((k) => dueMatches(k, task, ctx.today));
    }
    case "priority": {
      const nums = values.map((v) => {
        const n = PRIORITIES[v.toLowerCase()];
        if (n === undefined) throw new QueryError(`Unknown priority "${v}" (high, medium, low, none)`);
        return n;
      });
      return (task) => nums.includes(task.priority ?? 0);
    }
    case "tag":
      return (task) => values.some((v) => (task.tags ?? []).some((t) => t.toLowerCase() === v.toLowerCase()));
    default:
      return (task) => values.some((v) => has(task.title, v));
  }
}

/**
 * Parses a view's query.
 * Returns { test, list, error }: `test(task, ctx)` says whether a task is in
 * the view (ctx = { listName(task), today }), `list` is the one list the view
 * names, if it names exactly one (its sections head the view, and new tasks
 * go there), `error` a message for the person, with `test` null.
 */
export function parseQuery(text) {
  const tests = [];
  let lists = [];
  try {
    for (const raw of tokenize(text)) {
      const tok = readToken(raw);
      const t = tokenTest(tok);
      tests.push(tok.neg ? (task, ctx) => !t(task, ctx) : t);
      if (tok.kind === "list" && !tok.neg) lists = lists.concat(tok.values);
    }
  } catch (e) {
    if (e instanceof QueryError) return { test: null, list: null, error: e.message };
    throw e;
  }
  return { test: (task, ctx) => tests.every((t) => t(task, ctx)), list: lists.length === 1 ? lists[0] : null, error: null };
}

/**
 * What a task added in this view starts with, so it shows in the view: the
 * one list, one priority, the tags and a due day (today for due:today or
 * due:overdue, tomorrow for due:tomorrow) the query names.
 * Returns { list, priority, tags, due } (due a day offset from today, or null).
 */
export function defaultsFor(text) {
  const out = { list: null, priority: null, tags: [], due: null };
  if (parseQuery(text).error) return out;
  for (const raw of tokenize(text)) {
    const tok = readToken(raw);
    if (tok.neg) continue;
    const vals = tok.values.map((v) => v.toLowerCase());
    if (tok.kind === "list" && tok.values.length === 1) out.list = tok.values[0];
    if (tok.kind === "priority" && vals.length === 1) out.priority = PRIORITIES[vals[0]];
    if (tok.kind === "tag") out.tags.push(...tok.values);
    if (tok.kind === "due") {
      if (vals.some((v) => v === "today" || v === "overdue" || v === "week")) out.due = 0;
      else if (vals.includes("tomorrow")) out.due = 1;
    }
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");

/** TickTick's date text for an instant: "2026-11-12T05:00:00+0000". */
export function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`;
}

/** The fields that make a task due all day on a day number (local midnight). */
export function allDay(day) {
  const d = new Date(day * DAY_MS);
  const date = formatDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime());
  return { startDate: date, dueDate: date, isAllDay: true };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Tomorrow", "Yesterday", "Mon" within the week, else "Nov 3" (and the
 *  year when it isn't this one); a time after it for a task that isn't all day. */
export function dueLabel(task, now) {
  const ms = parseDate(task?.dueDate) ?? parseDate(task?.startDate);
  if (ms === null) return "";
  const d = new Date(ms);
  const diff = dayNumber(ms) - now;
  let text;
  if (diff === 0) text = "Today";
  else if (diff === 1) text = "Tomorrow";
  else if (diff === -1) text = "Yesterday";
  else if (diff > 1 && diff <= 6) text = WEEKDAYS[d.getDay()];
  else {
    text = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    if (d.getFullYear() !== new Date(now * DAY_MS).getUTCFullYear()) text += `, ${d.getFullYear()}`;
  }
  if (task.isAllDay === false) text += ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return text;
}

/** The list a name from a query means: the exact name first, then the first that contains it. */
export function findList(projects, name) {
  if (!name) return null;
  const l = name.toLowerCase();
  if (l === "inbox") return projects.find((p) => p.inbox) ?? null;
  return projects.find((p) => p.name.toLowerCase() === l) ?? projects.find((p) => has(p.name, name)) ?? null;
}

// ---- sorting and sections ---------------------------------------------------

const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
const byPriority = (a, b) => (b.priority ?? 0) - (a.priority ?? 0);
// No due date last.
const byDue = (a, b) => {
  const x = parseDate(a.dueDate) ?? parseDate(a.startDate) ?? Infinity;
  const y = parseDate(b.dueDate) ?? parseDate(b.startDate) ?? Infinity;
  return x === y ? 0 : x < y ? -1 : 1;
};
const byTitle = (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""));

const SORTERS = {
  priority: [byPriority, byDue, byOrder],
  due: [byDue, byPriority, byOrder],
  title: [byTitle],
  manual: [byOrder],
};

/** A sorted copy. */
export function sortTasks(tasks, sort = DEFAULT_SORT) {
  const chain = SORTERS[sort] ?? SORTERS[DEFAULT_SORT];
  return [...tasks].sort((a, b) => {
    for (const f of chain) {
      const r = f(a, b);
      if (r) return r;
    }
    return 0;
  });
}

/**
 * The view's sections, as the app shows them: the list's own sections when
 * the view is one list that has some ("No Section" last), else the date
 * sections. Empty sections are left out; each section is sorted.
 * Returns [{ key, label, tasks }].
 */
export function sections(tasks, { list = null, sort = DEFAULT_SORT, now = today() } = {}) {
  let groups;
  if (list?.columns?.length) {
    const columns = [...list.columns].sort(byOrder);
    groups = [...columns.map((c) => ({ key: `col-${c.id}`, label: c.name, tasks: [] })), { key: "col-none", label: "No Section", tasks: [] }];
    const at = new Map(columns.map((c, i) => [c.id, groups[i]]));
    for (const t of tasks) (at.get(t.columnId) ?? groups[groups.length - 1]).tasks.push(t);
  } else {
    groups = DATE_SECTIONS.map((s) => ({ key: s.key, label: s.label, tasks: [] }));
    const at = new Map(groups.map((g) => [g.key, g]));
    for (const t of tasks) at.get(dateSection(t, now)).tasks.push(t);
  }
  return groups.filter((g) => g.tasks.length).map((g) => ({ ...g, tasks: sortTasks(g.tasks, sort) }));
}
