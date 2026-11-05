/**
 * The movement limit.
 *
 * Used movement is the token's recorded movement history: while the limits are on, a player's moves of a limited
 * token are recorded (core only records during combat), the GM clears the history at each new round, and undoing
 * a move gives it back. The limit itself is applied where Foundry constrains a movement path (walls, scene edges):
 * the Token's constrainMovementPath, in the moving client's _preUpdate (preview: false), where the movement is cut
 * for real and the player is asked about dashing (see dash.js). Drag previews (preview: true) are left alone on
 * purpose: Foundry moves the token along the previewed path, so cutting the preview would make every drop fit the
 * budget and the dash question would never come. The dnd5e ruler already colours the path by speed.
 *
 * The movement method (dragging, keyboard, api…) is not passed to constrainMovementPath, so _preUpdate notes it per
 * token while that update is being prepared. Only drag, keyboard and token-config moves by non-GM users are limited;
 * moves by other modules and macros (method "api"), undo and paste are not, and neither is a move made with
 * {"dxcufgbs-exploration-mode": {ignoreLimit: true}} in its options.
 *
 * Nothing here may throw out of a wrapped core method: errors are logged and the move goes through as core made it.
 */
import { MODULE_ID, DASH_FLAG, LIMITED_METHODS, num } from "./util.js";
import { getState, limitsOn, isLimitedToken } from "./state.js";
import { speedFor, multiplier, firstOverIndex, largestFittingFraction, lerpWaypoint, totalCost, EPSILON } from "./movement-math.js";
import { canBonusDash, schedulePrompt } from "./dash.js";
import { crumb } from "./debug-recorder.js";

/** uuid -> {method, ignore} of a token whose movement update is being prepared on this client. */
const moving = new Map();

/* -------------------------------------------- */
/*  Reading a token's movement                  */
/* -------------------------------------------- */

/** The dashes the token has taken this round. A flag from another round counts as none. */
export function getDashes(doc) {
  const flag = doc?.flags?.[MODULE_ID]?.[DASH_FLAG];
  const round = getState(doc?.parent).round;
  if (!flag || Number(flag.round) !== round) return { action: false, bonus: false };
  return { action: !!flag.action, bonus: !!flag.bonus };
}

/** The speed of the token's actor for a movement action (Infinity when the actor has no dnd5e movement). */
export function tokenSpeed(doc, action = doc?.movementAction) {
  return speedFor(doc?.actor?.system?.attributes?.movement, action, CONFIG.DND5E?.movementTypes ?? {});
}

function isTeleport(action) {
  return !!CONFIG.Token.movement.actions[action]?.teleport;
}

/**
 * Movement of a token this round.
 * @returns {{speed: number, used: number, budget: number, remaining: number, max: number, action: string,
 *   dashes: {action: boolean, bonus: boolean, bonusAvailable: boolean}}}
 */
export function getMovement(doc) {
  const action = doc.movementAction;
  const speed = tokenSpeed(doc, action);
  const dashes = getDashes(doc);
  const bonusAvailable = canBonusDash(doc.actor);
  const used = Math.round(totalCost(doc.movementHistory) * 100) / 100;
  const budget = speed * multiplier(dashes);
  const max = speed * (2 + (bonusAvailable ? 1 : 0));
  return {
    speed, used, budget, max, action,
    remaining: Math.max(0, Math.round((budget - used) * 100) / 100),
    dashes: { ...dashes, bonusAvailable }
  };
}

/** Does the limit apply to moves of this token by the current user? */
export function limitApplies(doc) {
  return !game.user.isGM && !!doc?.parent && limitsOn(doc.parent) && isLimitedToken(doc);
}

/* -------------------------------------------- */
/*  Cutting a path at the limit                 */
/* -------------------------------------------- */

const posKeys = ["x", "y", "elevation", "width", "height", "shape"];
const samePosition = (a, b) => posKeys.every(k => (a[k] ?? null) === (b[k] ?? null) || (k === "elevation" && num(a[k]) === num(b[k])));

/** A waypoint to measure: its position and action, and the recorded cost for history waypoints. */
function measureWaypoint(w, { keepCost = false } = {}) {
  const out = { x: w.x, y: w.y, elevation: w.elevation, width: w.width, height: w.height, shape: w.shape, action: w.action,
    terrain: w.terrain ?? null };
  if (keepCost && Number.isFinite(Number(w.cost))) out.cost = Number(w.cost);
  return out;
}

/**
 * Cuts a constrained path where the token's movement for the round runs out.
 * @param {Token} token
 * @param {object[]} path       The path core's constraints allowed (first waypoint is the origin)
 * @param {object} options      The constrain options (preview…)
 * @returns {{path: object[], cut: boolean}}
 */
export function cutPath(token, path, options = {}) {
  const doc = token.document;
  const preview = !!options.preview;
  const mult = multiplier(getDashes(doc));

  // The rest of the path, with every grid step and region crossing, so the cut can be exact
  let rest = doc.getCompleteMovementPath(path);
  if (typeof token.createTerrainMovementPath === "function") rest = token.createTerrainMovementPath(rest, { preview });
  rest = rest.map(w => ({ ...w }));
  if (rest.length < 2) return { path, cut: false };

  // History (with its recorded costs) followed by the new path, measured as one so diagonals carry over
  const history = (doc.movementHistory ?? []).map(w => measureWaypoint(w, { keepCost: true }));
  const offset = history.length;
  const tail = rest.map(w => measureWaypoint(w));
  if (offset && !samePosition(history.at(-1), tail[0])) tail[0].action = "displace";
  const combined = history.concat(tail);
  const measure = waypoints => token.measureMovementPath(waypoints, { preview });

  const m = measure(combined);
  const cumulative = m.waypoints.map(w => num(w.cost, Infinity));
  const allowed = combined.map(w => (isTeleport(w.action) ? Infinity : tokenSpeed(doc, w.action) * mult));
  const over = firstOverIndex(cumulative, allowed, offset + 1);
  if (over < 0) return { path, cut: false };

  // Keep everything before the first waypoint that goes over
  const j = over - offset;
  const kept = rest.slice(0, j);

  // Gridless: move part of the way along the segment that goes over
  if (canvas.grid.isGridless && j >= 1) {
    const a = rest[j - 1];
    const b = rest[j];
    const prefix = combined.slice(0, over);
    const fits = t => {
      const p = measureWaypoint(lerpWaypoint(a, b, t));
      const cost = num(measure(prefix.concat([p])).waypoints.at(-1)?.cost, Infinity);
      return cost <= allowed[over] + EPSILON;
    };
    const t = largestFittingFraction(fits);
    if (t > 0) {
      const p = lerpWaypoint(a, b, t);
      p.x = Math.round(p.x);
      p.y = Math.round(p.y);
      kept.push(p);
    }
  }

  // Only the waypoints that mattered, ending exactly where the movement ran out
  const out = kept.filter((w, i) => i === 0 || i === kept.length - 1 || !w.intermediate);
  const end = out.at(-1);
  if (out.length > 1) Object.assign(end, { intermediate: false, explicit: true, checkpoint: true });
  for (const w of out) delete w.cost;
  return { path: out, cut: true };
}

/* -------------------------------------------- */
/*  Wrapped core methods                        */
/* -------------------------------------------- */

/** Notes how this token is being moved, for the constrain step of the same update. */
async function preUpdateWrapper(wrapped, changed, options, user) {
  let tag = null;
  try {
    const mv = options?.movement?.[this.id];
    if (mv || foundry.documents.TokenDocument._isMovementUpdate?.(changed)) {
      const method = mv?.method ?? (options?.isPaste ? "paste" : (options?.isUndo ? "undo" : "api"));
      tag = { method, ignore: !!options?.[MODULE_ID]?.ignoreLimit };
      moving.set(this.uuid, tag);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | movement tag`, err);
    crumb("limit.error", { where: "preUpdate" });
  }
  try {
    return await wrapped(changed, options, user);
  } finally {
    if (tag && moving.get(this.uuid) === tag) moving.delete(this.uuid);
  }
}

function constrainWrapper(wrapped, waypoints, options = {}) {
  const result = wrapped(waypoints, options);
  try {
    // Only the real move is cut (see the header: cutting drag previews would hide the dash question)
    if (options?.preview) return result;
    const doc = this.document;
    if (!limitApplies(doc)) return result;
    const tag = moving.get(doc.uuid);
    if (!tag || tag.ignore || !LIMITED_METHODS.has(tag.method)) return result;
    const [path] = result;
    if (!Array.isArray(path) || path.length < 2) return result;

    // Cut where the movement runs out (possibly at the origin: no movement left) and offer a dash
    const { path: limited, cut } = cutPath(this, path, options);
    if (!cut) return result;
    crumb("limit.cut", { method: tag.method, atOrigin: limited.length < 2, gridless: !!canvas.grid?.isGridless });
    schedulePrompt(doc);
    return [limited, true];
  } catch (err) {
    console.error(`${MODULE_ID} | movement limit`, err);
    crumb("limit.error", { where: "constrain" });
    return result;
  }
}

function recordWrapper(wrapped, ...args) {
  try {
    if (limitApplies(this)) return true;
  } catch (err) {
    console.error(`${MODULE_ID} | record movement`, err);
    crumb("limit.error", { where: "record" });
  }
  return wrapped(...args);
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

const patched = new Set();
/** How the core methods were wrapped: {libWrapper, manual, missing} counts. */
const patchCounts = { libWrapper: 0, manual: 0, missing: 0 };

/** Wrapping and in-flight movement state, for the Debug Recorder snapshot. */
export function patchStats() {
  return { ...patchCounts, movingNow: moving.size };
}

/** Wraps a method with libWrapper when it is active, otherwise by hand (keeping whatever was there before). */
function wrap(target, fn, type) {
  if (patched.has(target)) return;
  patched.add(target);
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    globalThis.libWrapper.register(MODULE_ID, target, fn, type);
    patchCounts.libWrapper += 1;
    return;
  }
  const parts = target.split(".");
  const name = parts.pop();
  const owner = parts.reduce((o, k) => o?.[k], globalThis);
  if (!owner) {
    console.warn(`${MODULE_ID} | cannot wrap ${target}`);
    patchCounts.missing += 1;
    return;
  }
  const own = Object.hasOwn(owner, name) ? owner[name] : null;
  owner[name] = function(...args) {
    const original = own ?? Object.getPrototypeOf(owner)[name];
    return fn.call(this, original.bind(this), ...args);
  };
  patchCounts.manual += 1;
}

/** Called once in "setup", after every system and module has set its Token classes. */
export function registerMovementLimit() {
  wrap("CONFIG.Token.documentClass.prototype._preUpdate", preUpdateWrapper, "WRAPPER");
  wrap("CONFIG.Token.documentClass.prototype._shouldRecordMovementHistory", recordWrapper, "MIXED");
  wrap("CONFIG.Token.objectClass.prototype.constrainMovementPath", constrainWrapper, "WRAPPER");
}
