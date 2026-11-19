# TickTick panel

A side panel that lists TickTick tasks next to your terminals. You pick a view from a row of tabs, each a saved query such as `due:today` or `list:smile` with its task count. A search box narrows the view, an "Add a task" box adds to it, and a Sort dropdown orders it. The tasks show in sections, as in TickTick: a one-list view uses that list's sections, and any other view uses date sections. Each line has a checkbox that completes the task. Clicking a task opens its page, which has pickers for list, due date and priority, its checklist, its notes, and a link to TickTick. Everything goes through TickTick's Open API with a personal token from `$TICKTICK_TOKEN`.

## What you see

The panel fills a block, normally a side panel stack about 368px wide. It sits on the theme's `chrome` background at text size 13, and it's flat and square, with rows running edge to edge.

- **Header, 42px tall, with a 1px `border` line below:** "TickTick" (semibold) and the number of tasks shown (12, `dim`). On the right are three 26px icon buttons: help, settings and refresh. Refresh turns once every 900ms while loading.
- **Filter bar**, with 8px between its rows:
  - **Search box**, 30px tall, filled `#ffffff06` (`#00000008` on light themes). It has a magnifier, the placeholder "Search tasks", and an `x` to clear it.
  - **View tabs**, 28px tall, each taking an equal share. Each tab shows its name (12; `foreground` and medium weight when selected) and its count (11.5, `dim`). The selected and hovered tabs get `#ffffff10`. A `+` at the end adds a view.
  - **A 28px row** with two parts:
    - **"Add a task":** a bordered input with a priority flag at its left, in the next task's priority color; clicking it opens the same priority menu as the task page. The target list's name shows dim at its right, or a spinner while it saves.
    - **Sort:** a bordered dropdown with a sort icon, the current sort's label and a chevron. Its 160px menu offers Priority, Due date, Title and Manual, with a check by the current one.
- **The list** scrolls.
  - **Section header**, 30px, filled faint: a chevron, the name (semibold) and the count (`dim`). Click it to collapse the section; collapsing is remembered per view.
  - **Task line**, 31px, with a `hover` background. From left to right:
    - a 14px checkbox with rounded corners (3), bordered in the priority's color: high `#d52b24`, medium `#faa80c`, low `#4772fa`, none `dim`; checked, it fills with that color and shows a white check
    - the title on one line (12.8, medium, truncates): line breaks become spaces and a Markdown link shows its text
    - "in <parent>" for a subtask
    - the checklist progress `2/5` (11, `dim`)
    - the list's name (11.5, `dim`), only when the view isn't one list
    - the due label (11.5, `muted`; `blocked` when overdue): "Today", "Tomorrow", "Yesterday", a weekday within the week, otherwise "Nov 3" (with the year when it isn't this year), plus "14:30" for a task that isn't all-day.
  - **Empty states** (12, `dim`): "Loading tasks…", "Nothing here. Enjoy the free time.", "No tasks match the search." A query error shows in `blocked`.
- **Task page:**
  - A 42px header with a back chevron, the list's name and an open-in-TickTick button.
  - A checkbox beside the title (15, semibold, 20px lines).
  - Label/value lines with 76px labels in `dim`:
    - List: a picker of every list
    - Section: only when the task is in one
    - Due: a picker with Today, Tomorrow, Next week and No date
    - Priority: a picker with flag icons
    - Tags: bordered chips
  - "Checklist" with a done/total count and a checkbox per item (12.5, 18px lines).
  - "Notes" as plain text, line by line (12.5, 18px lines, "Add notes" in `dim` when empty).
  - The title, each item and the notes edit in place: a click swaps the text for a textarea with the same font, line height and box, so nothing moves. Enter saves a title or an item, Cmd-Enter saves the notes, losing focus saves, Escape cancels.
  - An "Open in TickTick" button.
  - A save error shows in `blocked` under the title.
- **Settings page:**
  - One bordered card per view, with a name input, up/down/delete buttons and the query in JetBrains Mono. A parse error shows under it.
  - "Add a view".
  - Cancel and Save. Save is disabled while any query is invalid.
- **Help page:** the four rules and the token table.
- **First-run page:**
  - "Connect TickTick" (or "TickTick refused the token"), with where to create a token.
  - The `export TICKTICK_TOKEN="your token"` line.
  - A "Check again" button.

## How it behaves

- **Loading:** happens on start, on refresh and every 2 minutes.
  - One call (`GET /project`) gets the lists, skipping closed and NOTE lists.
  - Then, in parallel, `GET /project/inbox/data` and `GET /project/{id}/data` for each list. These return each list's open tasks and its columns (sections).
  - Every view filters that one set in the panel. There are no per-view calls and no 200-task cap.
- **Views:** a query is parsed once and cached. Tabs count their tasks before the search applies; the header count is after it.
- **Add:** Enter creates the task with these fields:
  - **List:** the view's one list, else the Inbox.
  - **Priority:** the one picked with the flag, else the view's single `pri:`, if it has one. The pick resets after each add.
  - **Tags:** the view's `tag:`s.
  - **Due:** all-day today for `due:today`, `overdue` or `week`; all-day tomorrow for `due:tomorrow`.
  - The answer is added to the data at once.
- **Complete:** the line checks itself and dims, the API is told, and 600ms later the line goes. A repeating task makes the panel load again, because its next occurrence comes back.
- **Edits:** these show at once, then take TickTick's answer; a failure puts the old values back and shows the error.
  - Title, priority, due date, checklist and notes are `POST /task/{id}` with `id`, `projectId` and the changed fields; TickTick keeps the rest. Notes are `desc` on a CHECKLIST task and `content` on any other.
  - Moving to another list is `POST /task/move`.
- **Problems:**
  - With no token, or a 401, the first-run page shows.
  - A network failure, a 429 or a 5xx keeps the last tasks and shows a `blocked` line under the header.
- **Commands** (`keys.json` or `herdr-app do`): `tick-tick.refresh`, `.add`, `.search`, `.help`, `.settings`, `.back`, `.view:<name>`, `.add-view:<name>=<query>`.

## Built from

- **One mod, `tick-tick`**, with `mod.json` `{ "place": "none", "title": "TickTick" }`. One `View` (`main.js`) draws five pages: `list.js` (the list), `task.js` (a task), and `pages.js` (settings, help and first run). `ui.js` has the icons, buttons and the checkbox; `prefs.js` has the settings.
- **`query.js`** is pure: no Herdr imports, tested with `node --test`.
  - `parseQuery(text)` returns `{ test(task, ctx), list, error }`, where `ctx = { listName(task), today }`.
  - `sections(tasks, { list, sort, now })` builds the sections.
  - `sortTasks`, `defaultsFor(query)` (what an added task starts with), `allDay(day)`, `dueLabel`, `findList`, and `SYNTAX` for the help.
- **Data** is in `ticktick.js`, using `fetch` with `Authorization: Bearer <token>` against `https://api.ticktick.com/open/v1`. The token comes from `printenv TICKTICK_TOKEN`, else `"${SHELL:-/bin/zsh}" -ic 'printf "<<%s>>" "$TICKTICK_TOKEN"'`; the markers keep out anything the rc files print.
- **Settings** are in shared state under `tick-tick.prefs`: `{ views: [{id, name, query, sort}], selected, collapsed }`. Collapsed keys are `<view id>:<section key>`.
- **Icons** are the mod's own SVGs on a 16px grid: chevrons, search, refresh, help, settings, plus, x, check, external, flag, calendar, list, sort, and `tasks.svg` for a layout button.

## Watch out

- **Priorities are 0, 1, 3, 5** (none, low, medium, high), not 0–4.
- **Dates come as `2026-11-12T05:00:00.000+0000`**, with no colon in the offset. Parse them by hand. Compare calendar days in local time, not instants: an all-day task is local midnight in UTC, and comparing instants puts tomorrow's tasks under Today.
- **The Inbox has no project.** `GET /project` leaves it out, and `/project/inbox/data` has no `project` field. Its real id (`inbox115…`) shows only on its tasks. An empty Inbox gives no id, so match Inbox tasks by the `inbox` prefix. Creating with `projectId: "inbox"` works.
- **`/project/{id}/data` returns only open tasks**, so completed ones need no filtering. Completing is `POST /project/{projectId}/task/{id}/complete`, with an empty answer.
- **Clearing a due date:** send `startDate: null, dueDate: null`. The answer leaves both keys out, so merge it over the optimistic patch, not over the old task.
- **`/task/move` returns `[{id, etag}]`, not the task.** Set `projectId` yourself, and drop `columnId`.
- **Sections need `columnId` on tasks.** The docs' Task definition doesn't list it. It hasn't been checked against a list with sections, so a task without one lands in "No Section".
- **Never write into the mod folder at run time:** a file there reloads the mod.
- **`#ffffff06` vanishes on a light theme;** use `#00000008` there.

## Done when

- `herdr-app check` passes on `mods/tick-tick`, and `node --test` passes in the repo.
- With `TICKTICK_TOKEN` set, the panel shows the Today, Work and Family tabs with counts, and the Today tab lists overdue and today's tasks under Overdue and Today.
- Clicking a checkbox completes the task in TickTick, and it leaves the list.
- Typing a title in Add a task on the Work tab adds it to the Smile list.
- Changing a task's priority on its page recolors its checkbox.
- Clicking a task's title, a checklist item or its notes edits it without moving anything, and the change shows in TickTick.
- Picking High with the flag in Add a task adds a high-priority task.
- With `TICKTICK_TOKEN` unset, Check again shows "Connect TickTick".
