/**
 * Exploration state per scene: flags["dxcufgbs-exploration-mode"].state = {active, round, paused}.
 * Only GM users write it, always as dot-path updates of single keys. The limits are on while the scene is
 * active, not paused and no started combat runs on it (combat pauses the limits without touching the flag).
 */
import { MODULE_ID, STATE_FLAG, t } from "./util.js";
import { crumb } from "./debug-recorder.js";

/** The scene's exploration state, with defaults. */
export function getState(scene = canvas?.scene) {
  const s = scene?.flags?.[MODULE_ID]?.[STATE_FLAG];
  return { active: !!s?.active, round: Math.max(0, Math.trunc(Number(s?.round) || 0)), paused: !!s?.paused };
}

/** A started combat on this scene, or one not linked to any scene. */
export function combatRunning(scene) {
  if (!scene) return false;
  return game.combats.some(c => c.started && (!c.scene || c.scene.id === scene.id));
}

/** Are the movement limits on for this scene right now? */
export function limitsOn(scene) {
  const s = getState(scene);
  return s.active && !s.paused && !combatRunning(scene);
}

/** A token the limits apply to: a creature owned by a player. */
export function isLimitedToken(doc) {
  const actor = doc?.actor;
  if (!actor) return false;
  if (actor.system?.isCreature === false) return false;
  return !!actor.hasPlayerOwner;
}

/** Limited tokens on the scene. */
export function limitedTokens(scene) {
  return scene?.tokens?.filter(isLimitedToken) ?? [];
}

function requireGM() {
  if (game.user.isGM) return true;
  ui.notifications.warn(t("Notify.GMOnly"));
  return false;
}

async function writeState(scene, patch) {
  const update = {};
  for (const [k, v] of Object.entries(patch)) update[`flags.${MODULE_ID}.${STATE_FLAG}.${k}`] = v;
  await scene.update(update);
}

/** The scene's phase as one of the module's fixed values: inactive, paused, combat or limited. */
export function getPhase(scene) {
  const s = getState(scene);
  if (!s.active) return "inactive";
  if (s.paused) return "paused";
  return combatRunning(scene) ? "combat" : "limited";
}

/** Clears the recorded movement of every limited token on the scene, so everyone starts the round fresh. */
export async function clearMovement(scene) {
  const ids = limitedTokens(scene).filter(d => d._source._movementHistory?.length).map(d => d.id);
  if (!ids.length) return;
  await scene.updateEmbeddedDocuments("Token", ids.map(_id => ({ _id })),
    { diff: false, noHook: true, _clearMovementHistory: true });
}

export async function start(scene = canvas?.scene) {
  if (!scene || !requireGM()) return false;
  await clearMovement(scene);
  await writeState(scene, { active: true, round: 1, paused: false });
  crumb("mode.start", { participants: limitedTokens(scene).length, combat: combatRunning(scene) });
  return true;
}

export async function end(scene = canvas?.scene) {
  if (!scene || !requireGM()) return false;
  const { round } = getState(scene);
  await writeState(scene, { active: false, round: 0, paused: false });
  await clearMovement(scene);
  crumb("mode.end", { rounds: round });
  return true;
}

export async function nextRound(scene = canvas?.scene) {
  if (!scene || !requireGM()) return false;
  const s = getState(scene);
  if (!s.active) return false;
  await clearMovement(scene);
  await writeState(scene, { round: s.round + 1 });
  crumb("round.next", { round: s.round + 1, participants: limitedTokens(scene).length });
  return true;
}

export async function setPaused(paused, scene = canvas?.scene) {
  if (!scene || !requireGM()) return false;
  if (!getState(scene).active) return false;
  await writeState(scene, { paused: !!paused });
  crumb("mode.pause", { paused: !!paused });
  return true;
}
