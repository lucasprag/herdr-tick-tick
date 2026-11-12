// The panel's only way to TickTick: its Open API (developer.ticktick.com) with
// a personal API token. The token lives in the macOS Keychain; the panel reads
// it from there each start and never writes it anywhere.

import { exec } from "herdr";

const API = "https://api.ticktick.com/open/v1";
export const KEYCHAIN = { service: "herdr-tick-tick", account: "token" };
export const SAVE_TOKEN = `security add-generic-password -U -s ${KEYCHAIN.service} -a ${KEYCHAIN.account} -w`;

// Why a call failed, so the panel can say what to do about it.
//   token: no token in the Keychain     auth: TickTick refused the token
//   network: TickTick unreachable/busy  api: TickTick answered with an error
export class TickTickError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

let token = null;

async function readToken() {
  if (token) return token;
  const r = await exec("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN.service, "-a", KEYCHAIN.account, "-w"]);
  const found = r.stdout.trim();
  if (r.code !== 0 || !found) throw new TickTickError("token", "No TickTick token in the Keychain.");
  return (token = found);
}

/** Forgets the token, so "Check again" reads the Keychain afresh. */
export function forget() {
  token = null;
}

/** One call; resolves with the JSON answer (null when empty), rejects with a TickTickError. */
export async function api(method, path, body) {
  const t = await readToken();
  let r;
  try {
    r = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new TickTickError("network", `TickTick can't be reached right now (${e?.message ?? e}).`);
  }
  const text = await r.text();
  if (r.status === 401) {
    token = null;
    throw new TickTickError("auth", "TickTick didn't accept the token.");
  }
  if (r.status === 429 || r.status >= 500) throw new TickTickError("network", `TickTick is busy (HTTP ${r.status}). Trying again later.`);
  if (!r.ok) {
    let message = text.trim().split("\n")[0];
    try {
      const j = JSON.parse(text);
      message = j.errorMessage || j.message || j.error || message;
    } catch {}
    throw new TickTickError("api", `${message || "TickTick returned an error"} (HTTP ${r.status})`);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new TickTickError("api", "Couldn't read TickTick's answer.");
  }
}

// ---- reading ----------------------------------------------------------------

const enc = encodeURIComponent;

function list(project, data, inbox = false) {
  return {
    id: project.id,
    name: project.name,
    color: project.color ?? null,
    sortOrder: project.sortOrder ?? 0,
    inbox,
    columns: data?.columns ?? [],
  };
}

/**
 * Every open task in every list: { lists, tasks }. One call for the lists,
 * then one per list (and the Inbox) in parallel; views filter the result.
 */
export async function everything() {
  const projects = ((await api("GET", "/project")) ?? []).filter((p) => !p.closed && (p.kind ?? "TASK") === "TASK");
  const [inbox, ...datas] = await Promise.all([
    api("GET", "/project/inbox/data"),
    ...projects.map((p) => api("GET", `/project/${enc(p.id)}/data`)),
  ]);
  const inboxId = inbox?.project?.id ?? inbox?.tasks?.[0]?.projectId ?? "inbox";
  const lists = [list({ id: inboxId, name: "Inbox", sortOrder: -Infinity }, inbox, true), ...projects.map((p, i) => list(p, datas[i]))];
  const tasks = [inbox, ...datas].flatMap((d) => d?.tasks ?? []).filter((t) => (t.status ?? 0) === 0);
  return { lists, tasks };
}

// ---- writing ----------------------------------------------------------------

/** Marks a task done. */
export async function complete(task) {
  await api("POST", `/project/${enc(task.projectId)}/task/${enc(task.id)}/complete`);
}

/** Changes a task: `patch` holds the fields to set. Resolves with the task as saved. */
export async function update(task, patch) {
  const saved = await api("POST", `/task/${enc(task.id)}`, { id: task.id, projectId: task.projectId, ...patch });
  return saved ?? { ...task, ...patch };
}

/** Moves a task to another list. */
export async function move(task, toProjectId) {
  await api("POST", "/task/move", [{ fromProjectId: task.projectId, toProjectId, taskId: task.id }]);
  return { ...task, projectId: toProjectId, columnId: undefined };
}

/** Adds a task: { title, projectId, priority?, dueDate?, isAllDay?, columnId? }. */
export async function create(fields) {
  return api("POST", "/task", fields);
}

/** The task in TickTick's web app. */
export const taskUrl = (task) => `https://ticktick.com/webapp/#p/${task.projectId}/tasks/${task.id}`;
