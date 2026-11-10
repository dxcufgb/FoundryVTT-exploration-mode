// Self-registration with Dxcufgb's Debug Recorder, in every load order, with a fake Hooks / game.
// The recorder calls Hooks.callAll("dxcufgbs-debug-recorder.ready", api) in its "setup" hook and puts the same api
// on game.modules.get("dxcufgbs-debug-recorder").api in "init".
import { test } from "node:test";
import assert from "node:assert/strict";

const ID = "dxcufgbs-exploration-mode";
const RECORDER = "dxcufgbs-debug-recorder";
let loads = 0;

/** A fresh copy of scripts/debug-recorder.js with fake globals; `recorder` is the module entry (or undefined). */
async function load(recorder) {
  const once = new Map();
  globalThis.Hooks = {
    once: (name, fn) => once.set(name, fn),
    fire: (name, ...args) => { const fn = once.get(name); once.delete(name); fn?.(...args); }
  };
  globalThis.game = { modules: new Map(recorder ? [[RECORDER, recorder]] : []) };
  const mod = await import(`../scripts/debug-recorder.js?load=${++loads}`);
  return { mod, hooks: globalThis.Hooks };
}

/** A fake recorder API that records what the module sends it. */
function fakeApi({ registerResult = true, throws = false } = {}) {
  const api = {
    registrations: [], crumbs: [], recording: false,
    register(id, opts) {
      if (throws) throw new Error("boom");
      api.registrations.push({ id, opts });
      return registerResult;
    },
    breadcrumb(id, key, data) { api.crumbs.push({ id, key, data }); },
    isRecording: () => api.recording
  };
  return api;
}

const snapshot = () => ({ active: true, round: 3 });

test("registers through the recorder's ready hook (fired in setup, before our ready)", async () => {
  const api = fakeApi();
  const { mod, hooks } = await load({ active: true, api });
  hooks.fire(`${RECORDER}.ready`, api);
  assert.equal(api.registrations.length, 1);
  assert.equal(api.registrations[0].id, ID);
  mod.registerDebugRecorder({ snapshot });
  assert.equal(api.registrations.length, 1, "does not register twice");
  assert.deepEqual(api.registrations[0].opts.snapshot(), { active: true, round: 3 }, "uses the snapshot given in ready");
});

test("registers in ready when the recorder's hook was missed", async () => {
  const api = fakeApi();
  const { mod } = await load({ active: true, api });
  mod.registerDebugRecorder({ snapshot });
  assert.equal(api.registrations.length, 1);
  assert.equal(api.registrations[0].id, ID);
  assert.deepEqual(api.registrations[0].opts.snapshot(), { active: true, round: 3 });
});

test("retries in ready when the first register returned false", async () => {
  const api = fakeApi({ registerResult: false });
  const { mod, hooks } = await load({ active: true, api });
  hooks.fire(`${RECORDER}.ready`, api);
  api.register = (id, opts) => { api.registrations.push({ id, opts }); return true; };
  mod.registerDebugRecorder({ snapshot });
  assert.equal(api.registrations.length, 2);
});

test("does nothing without the recorder, or when it is inactive or broken", async () => {
  for (const entry of [undefined, { active: false, api: fakeApi() }, { active: true, api: fakeApi({ throws: true }) }]) {
    const { mod, hooks } = await load(entry);
    // An inactive module runs no code, so it never fires its hook.
    if (entry?.active) assert.doesNotThrow(() => hooks.fire(`${RECORDER}.ready`, entry.api));
    assert.doesNotThrow(() => mod.registerDebugRecorder({ snapshot }));
    assert.doesNotThrow(() => mod.crumb("round.next", { round: 2 }));
    if (entry && !entry.active) assert.equal(entry.api.registrations.length, 0);
  }
});

test("breadcrumbs only while recording, and a throwing snapshot gives {snapshotError}", async () => {
  const api = fakeApi();
  const { mod } = await load({ active: true, api });
  mod.registerDebugRecorder({ snapshot: () => { throw new Error("bad"); } });
  mod.crumb("round.next", { round: 2 });
  assert.equal(api.crumbs.length, 0);
  api.recording = true;
  mod.crumb("round.next", { round: 2 });
  assert.deepEqual(api.crumbs, [{ id: ID, key: "round.next", data: { round: 2 } }]);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(api.registrations[0].opts.snapshot(), { snapshotError: true });
  } finally {
    console.warn = warn;
  }
});
