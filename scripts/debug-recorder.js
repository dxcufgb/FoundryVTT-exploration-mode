/**
 * Optional integration with Dxcufgb's Debug Recorder (dxcufgbs-debug-recorder).
 *
 * The recorder is NOT a dependency: when it is missing, inactive or broken, everything here does nothing and the
 * module works exactly as without it. When it is there, this module registers a snapshot of its runtime state
 * and leaves breadcrumbs at its main actions while the GM is recording.
 *
 * Privacy: snapshots and breadcrumbs hold only counts, booleans, numbers and this module's own enum values. Never
 * names (tokens, actors, users, scenes, features), chat text, image paths or URLs.
 */

import { MODULE_ID } from "./util.js";

const RECORDER_ID = "dxcufgbs-debug-recorder";

/** The recorder's API once this module is registered with it. */
let recorder = null;
let snapshotFn = () => ({});

/**
 * Leave a breadcrumb (only while the recorder is recording). `data` is a small, flat object without names or text.
 * @param {string} key   dot-namespaced, e.g. "round.next"
 * @param {object} [data]
 */
export function crumb(key, data) {
  try {
    if (recorder?.isRecording?.()) recorder.breadcrumb(MODULE_ID, key, data);
  } catch (err) {
    console.warn(`${MODULE_ID} | debug recorder breadcrumb failed`, err);
  }
}

function snapshot() {
  try {
    return snapshotFn() ?? {};
  } catch (err) {
    console.warn(`${MODULE_ID} | debug recorder snapshot failed`, err);
    return { snapshotError: true };
  }
}

/** Register with the recorder once (whichever of the ready hook or the fallback comes first). */
function connect(rec) {
  if (recorder || !rec || typeof rec.register !== "function") return;
  recorder = rec;
  try {
    rec.register(MODULE_ID, { snapshot });
  } catch (err) {
    console.warn(`${MODULE_ID} | debug recorder registration failed`, err);
  }
}

// Listen from import time, so the recorder's ready hook is never missed whatever the load order.
Hooks.once(`${RECORDER_ID}.ready`, rec => connect(rec));

/**
 * Set the snapshot function and register with the recorder if its API is already there (it became ready
 * before this module's code ran). Call from "ready".
 * @param {{snapshot: () => object}} options
 */
export function registerDebugRecorder({ snapshot: fn } = {}) {
  if (typeof fn === "function") snapshotFn = fn;
  try {
    const mod = game.modules.get(RECORDER_ID);
    if (mod?.active && mod.api) connect(mod.api);
  } catch (err) {
    console.warn(`${MODULE_ID} | debug recorder lookup failed`, err);
  }
}
