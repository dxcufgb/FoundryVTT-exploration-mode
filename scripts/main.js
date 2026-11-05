/**
 * Dxcufgb's Exploration Mode — entry point: settings, hooks, scene controls and the API.
 *
 * API: game.modules.get("dxcufgbs-exploration-mode").api
 *   start(scene?), end(scene?), nextRound(scene?), setPaused(paused, scene?)   GM only; scene defaults to the viewed one
 *   isActive(scene?), getRound(scene?), getState(scene?)                       {active, round, paused}
 *   limitsOn(scene?)                                                            active, not paused, no combat running
 *   getMovement(tokenDoc)   {speed, used, remaining, budget, max, action, dashes: {action, bonus, bonusAvailable}}
 *   canBonusDash(actor), takeDash(tokenDoc, "action"|"bonus"), openPanel()
 * Skip the limit for one move: tokenDoc.move(waypoints, {"dxcufgbs-exploration-mode": {ignoreLimit: true}})
 * Hooks (on every client): dxcufgbsExplorationStart(scene), dxcufgbsExplorationEnd(scene),
 *   dxcufgbsExplorationRound(scene, round), dxcufgbsExplorationDash(tokenDoc, "action"|"bonus") (mover's client)
 * Flags: scene flags[id].state = {active, round, paused}; token flags[id].dash = {round, action, bonus}
 */
import { MODULE_ID, STATE_FLAG, DEFAULT_BONUS_DASH_FEATURES, t, isResponsibleGM } from "./util.js";
import * as state from "./state.js";
import { registerMovementLimit, getMovement, getDashes, patchStats } from "./movement.js";
import { canBonusDash, takeDash, pendingPrompts } from "./dash.js";
import { ExplorationPanel } from "./apps/exploration-panel.js";
import { registerDebugRecorder, crumb } from "./debug-recorder.js";

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function registerSettings() {
  game.settings.register(MODULE_ID, "bonusDashFeatures", {
    name: "DXEM.Settings.BonusDashFeatures.Name",
    hint: "DXEM.Settings.BonusDashFeatures.Hint",
    scope: "world", config: true, type: String, default: DEFAULT_BONUS_DASH_FEATURES,
    onChange: () => ExplorationPanel.refresh()
  });
  game.settings.register(MODULE_ID, "autoOpenPanel", {
    name: "DXEM.Settings.AutoOpenPanel.Name",
    hint: "DXEM.Settings.AutoOpenPanel.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "panelPosition", {
    scope: "client", config: false, type: Object, default: {}
  });
}

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    start: scene => state.start(scene ?? canvas?.scene),
    end: scene => state.end(scene ?? canvas?.scene),
    nextRound: scene => state.nextRound(scene ?? canvas?.scene),
    setPaused: (paused, scene) => state.setPaused(paused, scene ?? canvas?.scene),
    isActive: scene => state.getState(scene ?? canvas?.scene).active,
    getRound: scene => state.getState(scene ?? canvas?.scene).round,
    getState: scene => state.getState(scene ?? canvas?.scene),
    limitsOn: scene => state.limitsOn(scene ?? canvas?.scene),
    getMovement: doc => {
      const tokenDoc = doc?.document ?? doc;
      return tokenDoc ? getMovement(tokenDoc) : null;
    },
    canBonusDash,
    takeDash: (doc, type) => takeDash(doc?.document ?? doc, type),
    openPanel: () => ExplorationPanel.open()
  };
});

Hooks.once("setup", () => {
  if (game.system.id !== "dnd5e") {
    console.warn(`${MODULE_ID} | needs the dnd5e system; movement is not limited in ${game.system.id}.`);
    return;
  }
  registerMovementLimit();
});

/* -------------------------------------------- */
/*  Scene controls                              */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  const order = Math.max(0, ...Object.values(tokens.tools).map(tool => tool.order ?? 0));
  if (game.user.isGM) {
    tokens.tools["dxem-toggle"] = {
      name: "dxem-toggle",
      order: order + 1,
      title: "DXEM.Control.Toggle",
      icon: "fa-solid fa-person-hiking",
      toggle: true,
      visible: true,
      active: state.getState(canvas?.scene).active,
      onChange: (event, active) => (active ? state.start(canvas?.scene) : state.end(canvas?.scene))
    };
  }
  tokens.tools["dxem-panel"] = {
    name: "dxem-panel",
    order: order + 2,
    title: "DXEM.Control.Panel",
    icon: "fa-solid fa-shoe-prints",
    button: true,
    visible: game.user.isGM || state.getState(canvas?.scene).active,
    onChange: () => ExplorationPanel.open()
  };
});

/* -------------------------------------------- */
/*  Reacting to changes                         */
/* -------------------------------------------- */

/** The state of each scene as this client last saw it, to call the hooks once per change. */
const seen = new Map();

function noteState(scene, { announce = true } = {}) {
  const now = state.getState(scene);
  const before = seen.get(scene.id) ?? { active: false, round: 0, paused: false };
  seen.set(scene.id, now);
  if (!announce) return;
  if (now.active && !before.active) {
    Hooks.callAll("dxcufgbsExplorationStart", scene);
    Hooks.callAll("dxcufgbsExplorationRound", scene, now.round);
    if (scene === canvas?.scene && game.settings.get(MODULE_ID, "autoOpenPanel")) ExplorationPanel.open();
  } else if (!now.active && before.active) {
    Hooks.callAll("dxcufgbsExplorationEnd", scene);
    if (scene === canvas?.scene) ExplorationPanel.close();
  } else if (now.active && now.round !== before.round) {
    Hooks.callAll("dxcufgbsExplorationRound", scene, now.round);
    if (scene === canvas?.scene && !game.user.isGM) ui.notifications.info(t("Notify.NewRound", { round: now.round }));
  }
}

Hooks.once("ready", () => {
  for (const scene of game.scenes) noteState(scene, { announce: false });
  registerDebugRecorder({ snapshot: debugSnapshot });
});

/* -------------------------------------------- */
/*  Debug Recorder (optional)                   */
/* -------------------------------------------- */

/**
 * Runtime state for Dxcufgb's Debug Recorder: counts, booleans and the module's own enum values only. Never token,
 * actor, user, scene or feature names.
 */
function debugSnapshot() {
  const scene = canvas?.scene ?? null;
  const s = state.getState(scene);
  const tokens = state.limitedTokens(scene);
  const dashes = { action: 0, bonus: 0, bonusAvailable: 0, outOfMovement: 0, unknownSpeed: 0 };
  for (const doc of tokens) {
    try {
      const m = getMovement(doc);
      const d = getDashes(doc);
      if (d.action) dashes.action += 1;
      if (d.bonus) dashes.bonus += 1;
      if (m.dashes.bonusAvailable) dashes.bonusAvailable += 1;
      if (!Number.isFinite(m.speed)) dashes.unknownSpeed += 1;
      else if (m.remaining <= 0) dashes.outOfMovement += 1;
    } catch {
      /* a broken token must not break the snapshot */
    }
  }
  return {
    dnd5e: game.system?.id === "dnd5e",
    libWrapper: !!(game.modules.get("lib-wrapper")?.active && globalThis.libWrapper),
    responsibleGM: isResponsibleGM(),
    isGM: !!game.user?.isGM,
    patches: patchStats(),
    activeScenes: game.scenes?.filter(sc => state.getState(sc).active).length ?? 0,
    viewedScene: scene ? {
      active: s.active,
      round: s.round,
      paused: s.paused,
      phase: state.getPhase(scene),
      combatRunning: state.combatRunning(scene),
      participants: tokens.length,
      ...dashes
    } : null,
    dashPromptsPending: pendingPrompts(),
    panelOpen: !!ExplorationPanel.instance?.rendered,
    autoOpenPanel: !!game.settings.get(MODULE_ID, "autoOpenPanel")
  };
}

Hooks.on("canvasReady", () => {
  const scene = canvas.scene;
  if (!scene) return;
  if (state.getState(scene).active && game.settings.get(MODULE_ID, "autoOpenPanel")) ExplorationPanel.open();
  else ExplorationPanel.refresh();
  ui.controls?.render();
});

Hooks.on("updateScene", (scene, changes) => {
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${STATE_FLAG}`)
    && !foundry.utils.hasProperty(changes, `flags.-=${MODULE_ID}`)) return;
  noteState(scene);
  if (scene === canvas?.scene) {
    ExplorationPanel.refresh();
    ui.controls?.render();
  }
});

/** Any change to a token on the viewed scene may change what the panel shows (movement, dashes, speed, name). */
const tokenChanged = doc => {
  if (doc.parent === canvas?.scene) ExplorationPanel.refresh();
};
Hooks.on("updateToken", tokenChanged);
Hooks.on("moveToken", doc => tokenChanged(doc));
Hooks.on("createToken", doc => tokenChanged(doc));
Hooks.on("deleteToken", doc => tokenChanged(doc));
Hooks.on("updateActor", () => ExplorationPanel.refresh());
Hooks.on("createItem", () => ExplorationPanel.refresh());
Hooks.on("deleteItem", () => ExplorationPanel.refresh());
Hooks.on("createActiveEffect", () => ExplorationPanel.refresh());
Hooks.on("deleteActiveEffect", () => ExplorationPanel.refresh());
Hooks.on("updateActiveEffect", () => ExplorationPanel.refresh());

/* -------------------------------------------- */
/*  Combat pauses the limits                    */
/* -------------------------------------------- */

Hooks.on("updateCombat", () => ExplorationPanel.refresh());
Hooks.on("createCombat", () => ExplorationPanel.refresh());
Hooks.on("combatStart", () => ExplorationPanel.refresh());

Hooks.on("deleteCombat", async combat => {
  ExplorationPanel.refresh();
  if (!isResponsibleGM()) return;
  const scene = combat.scene ?? canvas?.scene;
  if (!scene || !state.getState(scene).active || state.combatRunning(scene)) return;
  const resume = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("Combat.ResumeTitle"), icon: "fa-solid fa-person-hiking" },
    content: `<p>${t("Combat.ResumeContent")}</p>`,
    yes: { label: t("Combat.Resume") },
    no: { label: t("Combat.End") },
    rejectClose: false
  });
  crumb("combat.resume", { choice: resume === true ? "resume" : resume === false ? "end" : "closed" });
  if (resume === true) await state.nextRound(scene);
  else if (resume === false) await state.end(scene);
});
