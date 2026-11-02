/**
 * Pure helpers for the movement limit (no Foundry globals), so they can be tested in Node.
 */

/** Small tolerance for floating point costs (Foundry rounds measurements to 0.01 at most). */
export const EPSILON = 1e-6;

/**
 * The speed for a dnd5e movement action, like the dnd5e token ruler works it out: the action's own speed,
 * or at least the walking speed when the action can fall back to walking (or isn't a dnd5e movement type,
 * such as jump or crawl).
 * @param {object} movement       actor.system.attributes.movement
 * @param {string} action         The token movement action
 * @param {object} movementTypes  CONFIG.DND5E.movementTypes
 */
export function speedFor(movement, action, movementTypes = {}) {
  if (!movement) return Infinity;
  let speed = Number(movement[action]) || 0;
  const type = movementTypes[action];
  if (!type || type.walkFallback) speed = Math.max(speed, Number(movement.walk) || 0);
  return Math.max(0, speed);
}

/** How many speeds' worth a token may move this round: 1, plus one per dash taken. */
export function multiplier(dashes) {
  return 1 + (dashes?.action ? 1 : 0) + (dashes?.bonus ? 1 : 0);
}

/**
 * The first index whose cumulative cost goes over what is allowed there, or -1 when the whole path fits.
 * @param {number[]} cumulative  Cumulative cost at each waypoint (from the start of the round)
 * @param {number[]} allowed     What may be spent by each waypoint (Infinity for free moves such as teleports)
 * @param {number} [from=0]      The first index to check (earlier ones are history that already happened)
 */
export function firstOverIndex(cumulative, allowed, from = 0) {
  for (let i = Math.max(0, from); i < cumulative.length; i++) {
    if (cumulative[i] > allowed[i] + EPSILON) return i;
  }
  return -1;
}

/**
 * Binary search for the largest fraction t in [0, 1] of a segment that still fits.
 * @param {(t: number) => boolean} fits  Whether the point at fraction t of the segment fits the budget
 * @param {number} [steps=14]
 */
export function largestFittingFraction(fits, steps = 14) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A point at fraction t between two waypoints (x, y and elevation interpolated). */
export function lerpWaypoint(a, b, t) {
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    elevation: (a.elevation ?? 0) + ((b.elevation ?? a.elevation ?? 0) - (a.elevation ?? 0)) * t
  };
}

/** Sum of the finite `cost` values of measured waypoints (the movement used so far). */
export function totalCost(waypoints) {
  let sum = 0;
  for (const w of waypoints ?? []) {
    const c = Number(w?.cost);
    if (Number.isFinite(c)) sum += c;
  }
  return sum;
}
