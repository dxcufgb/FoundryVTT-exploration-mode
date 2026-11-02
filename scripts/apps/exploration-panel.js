/**
 * The Exploration panel: the round and every player character's movement on the viewed scene, with the GM's
 * round buttons. One instance per client; re-rendered (debounced) when tokens, the scene state or combats change.
 * It has no inputs, so a re-render can't steal focus; its position is kept in a client setting.
 */
import { MODULE_ID, TEMPLATE_PATH, t } from "../util.js";
import { getState, combatRunning, limitedTokens, start, end, nextRound, setPaused } from "../state.js";
import { getMovement } from "../movement.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ExplorationPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static get instance() {
    return ExplorationPanel.#instance;
  }

  static DEFAULT_OPTIONS = {
    id: "dxem-panel",
    classes: ["dxem-panel"],
    tag: "aside",
    window: { title: "DXEM.Title", icon: "fa-solid fa-person-hiking", resizable: false, minimizable: true },
    position: { width: 290, height: "auto" },
    actions: {
      start: ExplorationPanel.#onStart,
      nextRound: ExplorationPanel.#onNextRound,
      pause: ExplorationPanel.#onPause,
      end: ExplorationPanel.#onEnd,
      select: ExplorationPanel.#onSelect
    }
  };

  static PARTS = {
    body: { template: `${TEMPLATE_PATH}/exploration-panel.hbs` }
  };

  /** Opens (or brings to front) the panel. */
  static open() {
    ExplorationPanel.#instance ??= new ExplorationPanel();
    const app = ExplorationPanel.#instance;
    if (app.rendered) {
      app.bringToFront();
      return app;
    }
    const saved = game.settings.get(MODULE_ID, "panelPosition") ?? {};
    const position = {};
    if (Number.isFinite(saved.left)) position.left = saved.left;
    if (Number.isFinite(saved.top)) position.top = saved.top;
    app.render({ force: true, position });
    return app;
  }

  static close() {
    return ExplorationPanel.#instance?.close();
  }

  /** Re-renders the open panel, at most a few times a second. */
  static refresh = foundry.utils.debounce(() => {
    const app = ExplorationPanel.#instance;
    if (app?.rendered) app.render();
  }, 100);

  async _prepareContext() {
    const scene = canvas?.scene ?? null;
    const state = getState(scene);
    const combat = combatRunning(scene);
    const units = scene?.grid?.units || "ft";
    const rows = limitedTokens(scene)
      .filter(doc => game.user.isGM || !doc.hidden)
      .map(doc => {
        const m = getMovement(doc);
        const speedKnown = Number.isFinite(m.speed);
        const pct = speedKnown && m.budget > 0 ? Math.min(100, Math.round((m.used / m.budget) * 100)) : 0;
        return {
          uuid: doc.uuid,
          name: doc.name,
          img: doc.texture?.src || doc.actor?.img,
          owner: doc.isOwner,
          used: m.used,
          budget: speedKnown ? m.budget : "∞",
          remaining: speedKnown ? m.remaining : "∞",
          pct,
          out: speedKnown && m.remaining <= 0,
          action: m.dashes.action,
          bonus: m.dashes.bonus,
          bonusAvailable: m.dashes.bonusAvailable,
          actionLabel: game.i18n.localize(CONFIG.Token.movement.actions[m.action]?.label ?? m.action)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      scene: !!scene,
      active: state.active,
      round: state.round,
      paused: state.paused,
      combat,
      limited: state.active && !state.paused && !combat,
      isGM: game.user.isGM,
      units,
      rows,
      status: !state.active ? t("Panel.Inactive")
        : combat ? t("Panel.Combat")
          : state.paused ? t("Panel.Paused")
            : t("Panel.Round", { round: state.round })
    };
  }

  _onPosition(position) {
    super._onPosition?.(position);
    ExplorationPanel.#savePosition(position);
  }

  static #savePosition = foundry.utils.debounce(position => {
    const { left, top } = position ?? {};
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    game.settings.set(MODULE_ID, "panelPosition", { left, top }).catch(() => {});
  }, 500);

  static async #onStart() {
    await start(canvas?.scene);
  }

  static async #onNextRound() {
    await nextRound(canvas?.scene);
  }

  static async #onPause() {
    await setPaused(!getState(canvas?.scene).paused, canvas?.scene);
  }

  static async #onEnd() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Panel.EndTitle") },
      content: `<p>${t("Panel.EndConfirm")}</p>`,
      rejectClose: false
    });
    if (ok) await end(canvas?.scene);
  }

  /** Clicking a character pans to its token (and controls it when you own it). */
  static #onSelect(event, target) {
    const doc = fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid);
    const token = doc?.object;
    if (!token) return;
    if (doc.isOwner) token.control({ releaseOthers: !event.shiftKey });
    canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
  }
}
