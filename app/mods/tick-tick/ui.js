// Small pieces every page draws: icons, buttons, the faint band, the task
// checkbox.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";

export const ICONS = "mods/tick-tick";
export const icon = (name) => svg(`${ICONS}/${name}.svg`);

/** Whether the theme is dark, by the panel background's lightness. */
export function isDark(t) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(t.chrome ?? t.background ?? "");
  if (!m) return true;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** The faint fill behind the search box, the tabs and group headers. */
export const faint = (t) => (isDark(t) ? "#ffffff06" : "#00000008");
/** A touch stronger: the selected tab, a pressed toggle. */
export const faintOn = (t) => (isDark(t) ? "#ffffff10" : "#00000010");

/** A square icon button, dim until hovered. `spin` turns the glyph (refresh). */
export function iconButton(t, id, name, onClick, opts = {}) {
  const glyph = icon(name).size(opts.size ?? 14);
  return div().id(id).size(opts.box ?? 26).flex_none().flex().items_center().justify_center()
    .text_color(t.dim).cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .when(Boolean(opts.tip), (el) => el.tooltip(opts.tip))
    .on_click(onClick)
    .child(opts.spin ? glyph.spin(900) : glyph);
}

/** A bordered text button with an optional icon. */
export function button(t, id, label, onClick, opts = {}) {
  return h_flex().id(id).h(opts.h ?? 28).px(10).gap(6).flex_none().items_center().cursor_pointer()
    .border_1().border_color(opts.solid ? t.solid : t.border)
    .bg(opts.solid ? t.solid : t.chrome)
    .text_size(12).text_color(opts.solid ? t.solid_foreground : t.foreground)
    .hover((s) => (opts.solid ? s.opacity(0.88) : s.bg(t.hover)))
    .on_click(onClick)
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon).size(13).flex_none()))
    .child(label);
}

// TickTick's priority colors; no priority follows the theme.
const PRIORITY_COLOR = { 5: "#d52b24", 3: "#faa80c", 1: "#4772fa" };
export const priorityColor = (t, p) => PRIORITY_COLOR[p] ?? t.dim;

/** A priority flag (or a dim one for none). */
export function flag(t, priority, size = 13) {
  return icon("flag").size(size).flex_none().text_color(priorityColor(t, priority));
}

/** A task's checkbox, bordered in its priority's color as in TickTick. */
export function checkbox(t, id, priority, onClick, opts = {}) {
  const color = priorityColor(t, priority);
  return div().id(id).size(opts.box ?? 22).flex_none().flex().items_center().justify_center().cursor_pointer()
    .when(Boolean(opts.tip), (el) => el.tooltip(opts.tip))
    .on_click(onClick)
    .child(div().size(14).rounded(3).border_1().border_color(color)
      .flex().items_center().justify_center()
      .when(!opts.done, (el) => el.hover((s) => s.bg(t.hover)))
      .when(Boolean(opts.done), (el) => el.bg(color).child(icon("check").size(11).text_color("#ffffff"))));
}
