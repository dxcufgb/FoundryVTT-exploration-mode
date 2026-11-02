// Pure movement helpers (no Foundry needed): run with `node --test tests/*.test.mjs` (CI "lint").
import { test } from "node:test";
import assert from "node:assert/strict";
import { speedFor, multiplier, firstOverIndex, largestFittingFraction, lerpWaypoint, totalCost } from "../scripts/movement-math.js";

const TYPES = { walk: {}, fly: {}, swim: { walkFallback: true }, climb: { walkFallback: true }, burrow: {} };

test("speedFor uses the action's speed, falling back to walk like the dnd5e ruler", () => {
  const movement = { walk: 30, fly: 60, swim: 0, climb: 15, burrow: 0 };
  assert.equal(speedFor(movement, "walk", TYPES), 30);
  assert.equal(speedFor(movement, "fly", TYPES), 60);
  assert.equal(speedFor(movement, "swim", TYPES), 30, "swim falls back to walk");
  assert.equal(speedFor(movement, "climb", TYPES), 30, "falls back to the larger walk");
  assert.equal(speedFor(movement, "burrow", TYPES), 0, "no fallback: can't burrow");
  assert.equal(speedFor(movement, "jump", TYPES), 30, "not a dnd5e type: walk");
  assert.equal(speedFor(undefined, "walk", TYPES), Infinity);
});

test("multiplier counts the dashes", () => {
  assert.equal(multiplier({}), 1);
  assert.equal(multiplier({ action: true }), 2);
  assert.equal(multiplier({ action: true, bonus: true }), 3);
  assert.equal(multiplier({ bonus: true }), 2);
});

test("firstOverIndex finds where the budget runs out, skipping history", () => {
  const cumulative = [0, 5, 10, 15, 20, 25, 30, 35, 40];
  const allowed = cumulative.map(() => 30);
  assert.equal(firstOverIndex(cumulative, allowed), 7);
  assert.equal(firstOverIndex(cumulative, allowed, 8), 8);
  assert.equal(firstOverIndex(cumulative.slice(0, 7), allowed), -1, "exactly at the limit fits");
  assert.equal(firstOverIndex([0, 50], [Infinity, Infinity]), -1, "teleports are free");
  assert.equal(firstOverIndex([0, 30.0000001], [30, 30]), -1, "float noise fits");
});

test("largestFittingFraction converges on the limit", () => {
  const t = largestFittingFraction(x => x * 47 <= 30);
  assert.ok(t <= 30 / 47 && t > 30 / 47 - 0.001, String(t));
  assert.equal(largestFittingFraction(() => false), 0);
});

test("lerpWaypoint interpolates position and elevation", () => {
  assert.deepEqual(lerpWaypoint({ x: 0, y: 0, elevation: 0 }, { x: 100, y: 50, elevation: 10, action: "fly" }, 0.5),
    { x: 50, y: 25, elevation: 5, action: "fly" });
});

test("totalCost adds the finite costs", () => {
  assert.equal(totalCost([{ cost: 0 }, { cost: 5 }, { cost: 10 }, { cost: Infinity }, {}]), 15);
  assert.equal(totalCost(undefined), 0);
});
