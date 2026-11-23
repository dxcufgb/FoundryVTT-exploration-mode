/**
 * Dashing: the question a player gets when their token's movement runs out, and the dash itself.
 * A token can dash once with its action and, with a listed feature, once with its bonus action per round. The
 * dashes are kept on the token (flags["dxcufgbs-exploration-mode"].dash = {round, action, bonus, spent}); a flag from
 * an older round counts as no dashes, so a new round needs no write per token.
 *
 * `spent` flags a token that has used all its movement this round (its move was cut at the limit, or a move used
 * exactly the rest of it). Only a dash or the next round clears it: undoing a move gives the movement back but the
 * token stays flagged, and while it is flagged a player's moves of it are stopped at the origin. GM moves are never
 * limited, so the GM can still move a flagged token.
 */
import { MODULE_ID, DASH_FLAG, t, escapeHTML, parseNameList } from "./util.js";
import { getState } from "./state.js";
import { getDashes, getMovement, isSpent, limitApplies } from "./movement.js";
import { crumb } from "./debug-recorder.js";

/** Tokens (uuid) that have a dash question open on this client. */
const open = new Set();
/** Tokens (uuid) whose `spent` flag is being written by this client. */
const flagging = new Set();

/** Number of dash questions open (or about to open) on this client. */
export function pendingPrompts() {
  return open.size;
}

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
  crumb("dash.prompt", { choices: choices.length, pending: open.size });
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
  crumb("dash.choice", { choice: ["action", "bonus", "stop"].includes(choice) ? choice : "closed" });
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
  // A dash gives new movement, so it clears the out-of-movement flag
  await writeDashFlag(doc, state.round, { ...dashes, spent: false });
  await ChatMessage.implementation.create({
    content: `<p class="dxem-chat">${t(type === "action" ? "Chat.DashAction" : "Chat.DashBonus", { name: escapeHTML(doc.name) })}</p>`,
    speaker: ChatMessage.implementation.getSpeaker({ token: doc })
  });
  crumb("dash.take", { type, round: state.round });
  Hooks.callAll("dxcufgbsExplorationDash", doc, type);
  return true;
}

/** Writes the token's whole dash flag for this round, as dot paths (the only token flag players write). */
function writeDashFlag(doc, round, { action, bonus, spent }) {
  const base = `flags.${MODULE_ID}.${DASH_FLAG}`;
  return doc.update({ [`${base}.round`]: round, [`${base}.action`]: !!action, [`${base}.bonus`]: !!bonus,
    [`${base}.spent`]: !!spent });
}

/**
 * Flags the token as having used all its movement this round (once the current move has been handled). Never
 * throws: it is called from inside the movement limit.
 */
export function markSpent(doc) {
  try {
    if (!doc?.isOwner || isSpent(doc) || flagging.has(doc.uuid)) return;
    flagging.add(doc.uuid);
    setTimeout(async () => {
      try {
        const state = getState(doc.parent);
        if (!state.active || isSpent(doc)) return;
        await writeDashFlag(doc, state.round, { ...getDashes(doc), spent: true });
        crumb("movement.spent", { round: state.round });
        Hooks.callAll("dxcufgbsExplorationSpent", doc);
      } catch (err) {
        console.error(`${MODULE_ID} | out-of-movement flag`, err);
      } finally {
        flagging.delete(doc.uuid);
      }
    }, 0);
  } catch (err) {
    console.error(`${MODULE_ID} | out-of-movement flag`, err);
  }
}

/**
 * After a move by this user: a limited token whose movement is now used up exactly (the move was not cut, so the
 * limit did not flag it) gets flagged too.
 * @param {TokenDocument} doc
 * @param {User|string} [user]   The user who moved it (moveToken hook)
 */
export function checkSpent(doc, user) {
  try {
    const userId = user?.id ?? user;
    if (userId !== game.user.id || !limitApplies(doc)) return;
    const m = getMovement(doc);
    if (!m.spent && Number.isFinite(m.speed) && m.budget - m.used <= 0.005) markSpent(doc);
  } catch (err) {
    console.error(`${MODULE_ID} | out-of-movement check`, err);
  }
}
