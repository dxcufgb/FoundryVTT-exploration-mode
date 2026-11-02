/**
 * Dashing: the question a player gets when their token's movement runs out, and the dash itself.
 * A token can dash once with its action and, with a listed feature, once with its bonus action per round. The
 * dashes are kept on the token (flags["dxcufgbs-exploration-mode"].dash = {round, action, bonus}); a flag from an
 * older round counts as no dashes, so a new round needs no write per token.
 */
import { MODULE_ID, DASH_FLAG, t, escapeHTML, parseNameList } from "./util.js";
import { getState } from "./state.js";
import { getDashes, getMovement } from "./movement.js";

/** Tokens (uuid) that have a dash question open on this client. */
const open = new Set();

/** Does the actor have a feature (or an active effect) from the bonus-action dash list? Spells known don't count. */
export function canBonusDash(actor) {
  if (!actor) return false;
  const names = parseNameList(game.settings.get(MODULE_ID, "bonusDashFeatures"));
  if (!names.size) return false;
  const has = name => names.has(String(name ?? "").trim().toLowerCase());
  if (actor.items?.some(i => i.type === "feat" && has(i.name))) return true;
  for (const effect of actor.appliedEffects ?? []) if (has(effect.name)) return true;
  return false;
}

/** Dashes the token could still take this round. */
export function availableDashes(doc) {
  const { dashes } = getMovement(doc);
  const out = [];
  if (!dashes.action) out.push("action");
  if (dashes.bonusAvailable && !dashes.bonus) out.push("bonus");
  return out;
}

/** Asks about dashing once the current move has been handled (never twice at once for a token). */
export function schedulePrompt(doc) {
  if (open.has(doc.uuid)) return;
  open.add(doc.uuid);
  setTimeout(() => promptDash(doc).catch(err => console.error(`${MODULE_ID} | dash question`, err))
    .finally(() => open.delete(doc.uuid)), 0);
}

/** The dash question. Resolves to "action", "bonus" or null. */
export async function promptDash(doc) {
  const choices = availableDashes(doc);
  if (!choices.length) {
    ui.notifications.warn(t("Notify.NoMovement", { name: doc.name }));
    return null;
  }
  const { speed } = getMovement(doc);
  const units = doc.parent?.grid?.units || "ft";
  const buttons = choices.map((type, i) => ({
    action: type,
    label: t(type === "action" ? "Dash.Action" : "Dash.Bonus"),
    icon: type === "action" ? "fa-solid fa-person-running" : "fa-solid fa-bolt",
    default: i === 0
  }));
  buttons.push({ action: "stop", label: t("Dash.Stop"), icon: "fa-solid fa-hand" });

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Dash.Title"), icon: "fa-solid fa-person-running" },
    classes: ["dxem-dash-dialog"],
    content: `<p>${t("Dash.Content", { name: escapeHTML(doc.name), speed: `${speed} ${escapeHTML(units)}` })}</p>`,
    buttons,
    rejectClose: false
  });
  if (choice !== "action" && choice !== "bonus") return null;
  return (await takeDash(doc, choice)) ? choice : null;
}

/**
 * Takes a dash for the token this round, if it is still available. Posts a chat line.
 * @param {TokenDocument} doc
 * @param {"action"|"bonus"} type
 * @returns {Promise<boolean>}
 */
export async function takeDash(doc, type) {
  if (!["action", "bonus"].includes(type) || !doc?.isOwner) return false;
  const state = getState(doc.parent);
  if (!state.active) return false;
  if (!availableDashes(doc).includes(type)) return false;
  const dashes = getDashes(doc);
  dashes[type] = true;
  const base = `flags.${MODULE_ID}.${DASH_FLAG}`;
  await doc.update({ [`${base}.round`]: state.round, [`${base}.action`]: dashes.action, [`${base}.bonus`]: dashes.bonus });
  await ChatMessage.implementation.create({
    content: `<p class="dxem-chat">${t(type === "action" ? "Chat.DashAction" : "Chat.DashBonus", { name: escapeHTML(doc.name) })}</p>`,
    speaker: ChatMessage.implementation.getSpeaker({ token: doc })
  });
  Hooks.callAll("dxcufgbsExplorationDash", doc, type);
  return true;
}
