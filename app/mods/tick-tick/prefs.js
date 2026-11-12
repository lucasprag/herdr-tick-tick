// The person's choices: views (name, query, sort), the selected one, collapsed
// sections. Kept in Herdr's shared state, not per-copy localStorage, which
// resets when the layout rebuilds.

import { shared, setShared } from "herdr";
import { SORTS, DEFAULT_SORT } from "./query.js";

const PREFS = "tick-tick.prefs";
export const DEFAULT_VIEWS = [
  { id: "today", name: "Today", query: "due:today", sort: DEFAULT_SORT },
  { id: "work", name: "Work", query: "list:smile", sort: DEFAULT_SORT },
  { id: "family", name: "Family", query: "list:family", sort: DEFAULT_SORT },
];

const sortOf = (s) => (SORTS.some((x) => x.key === s) ? s : DEFAULT_SORT);

export function readPrefs() {
  const p = shared(PREFS) ?? {};
  const views = Array.isArray(p.views) && p.views.length
    ? p.views.filter((v) => v && typeof v.id === "string").map((v) => ({ id: v.id, name: String(v.name ?? ""), query: String(v.query ?? ""), sort: sortOf(v.sort) }))
    : DEFAULT_VIEWS;
  return {
    views: views.length ? views : DEFAULT_VIEWS,
    selected: typeof p.selected === "string" ? p.selected : null,
    collapsed: Array.isArray(p.collapsed) ? p.collapsed : [],
  };
}

export function writePrefs(patch) {
  setShared(PREFS, { ...readPrefs(), ...patch });
}

export function selectedView(prefs) {
  return prefs.views.find((v) => v.id === prefs.selected) ?? prefs.views[0];
}

/** Sets one view's sort. */
export function setSort(id, sort) {
  writePrefs({ views: readPrefs().views.map((v) => (v.id === id ? { ...v, sort: sortOf(sort) } : v)) });
}
