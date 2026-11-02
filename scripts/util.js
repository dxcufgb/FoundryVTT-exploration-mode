export const MODULE_ID = "dxcufgbs-exploration-mode";
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

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

/** The one GM client that does world-level writes. */
export function isResponsibleGM() {
  return game.user.isGM && !!game.users.activeGM?.isSelf;
}
