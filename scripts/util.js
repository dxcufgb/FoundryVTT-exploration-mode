export const MODULE_ID = "dxcufgbs-exploration-mode";
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

/** Scene flag with {active, round, paused}. Written only by GM users. */
export const STATE_FLAG = "state";
/** Token flag with {round, action, bonus}: the dashes taken in that round. Written by the token's owner. */
export const DASH_FLAG = "dash";

/** Movement methods the limit applies to. API moves (other modules, macros), undo and paste are not limited. */
export const LIMITED_METHODS = new Set(["dragging", "keyboard", "config"]);

export const DEFAULT_BONUS_DASH_FEATURES = "Cunning Action, Step of the Wind, Adrenaline Rush, Aggressive, Expeditious Retreat";

/** Localize a DXEM.* key, formatting when data is given. */
export function t(key, data) {
  const full = `DXEM.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The one GM client that does world-level work nobody clicked for (the end-of-combat question). */
export function isResponsibleGM() {
  return game.user.isGM && !!game.users.activeGM?.isSelf;
}

/** Splits the bonus-dash setting into lower-case names. */
export function parseNameList(value) {
  return new Set(String(value ?? "").split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean));
}

/** A finite number, or `fallback`. */
export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
