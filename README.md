# Dxcufgb's Exploration Mode

[![Foundry v13](https://img.shields.io/github/v/release/dxcufgb/FoundryVTT-exploration-mode?label=Foundry%20v13&logo=foundryvirtualtabletop&color=ff6400)](https://github.com/dxcufgb/FoundryVTT-exploration-mode/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/dxcufgb/FoundryVTT-exploration-mode/module.zip?label=downloads&color=blue)](https://github.com/dxcufgb/FoundryVTT-exploration-mode/releases)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/dxcufgb)\
[![CI](https://img.shields.io/github/actions/workflow/status/dxcufgb/FoundryVTT-exploration-mode/ci.yml?branch=main&label=CI)](https://github.com/dxcufgb/FoundryVTT-exploration-mode/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/dxcufgb/FoundryVTT-exploration-mode)](LICENSE)
[![System dnd5e](https://img.shields.io/badge/system-dnd5e%205-c53131)](https://foundryvtt.com/packages/dnd5e)

<a href="https://dxcufgb.github.io/FVTT-dev-showcase/"><img src="https://dxcufgb.github.io/FVTT-dev-showcase/assets/img/workshop-badge.png" alt="Dxcufgb's Workshop: every Foundry VTT project, video and changelog in one place" width="650"></a>

Rounds outside combat. The GM starts Exploration Mode and every player moves at the same time, each limited to their character's speed per round. Going further asks whether to Dash with the action, or with the bonus action for characters with Cunning Action, Step of the Wind and similar features, and after that the character can't move again until the next round.

**Foundry VTT:** v13 · **System:** dnd5e 5

## Installation

In Foundry: **Add-on Modules → Install Module**, paste this link into **Manifest URL** at the bottom, and click **Install**:

```
https://github.com/dxcufgb/FoundryVTT-exploration-mode/releases/latest/download/module.json
```

## How to use

1. As the GM, open the **Token controls** and click **Exploration Mode** (the hiking figure). Round 1 starts on the scene you're viewing, and the **Exploration panel** opens for everyone.
2. Players move their tokens as usual, all at the same time. The ruler colours the path green up to their speed, then yellow and red for the distance a dash would cover.
3. When a token is dropped further than it has movement left, it stops exactly at the limit and its player is asked:
   - **Dash (Action)**: one more speed's worth of movement this round.
   - **Dash (Bonus Action)**: only for characters with a feature from the setting below, and only if they haven't used it yet.
   - **Stop here**: the token stays where it stopped. Dragging further asks again, as long as a dash is left.
4. A character with a bonus-action dash feature is asked at the first and at the second limit. Once both dashes are used, the token can't move again this round.
5. The GM clicks **Next round** in the panel: everyone gets their full movement back and their dashes reset.
6. **Pause** lets everyone move freely for a while; **End** turns Exploration Mode off on the scene.

Each dash is posted in chat ("Aria dashes (Bonus Action).") so the GM can see who used their action.

## Features

- **Speed per movement type**: flying uses the fly speed, swimming and climbing fall back to walking speed when the character has no such speed, exactly like the dnd5e ruler.
- **Real path cost**: difficult terrain, region costs and grid diagonals count as Foundry measures them, also across several moves in one round.
- **Undo gives movement back**: undoing a move with Foundry's movement undo refunds it.
- **Gridless scenes**: the token stops at the exact distance, not on the last full square.
- **Who is limited**: player-owned characters moved by a player. The GM moves any token freely, and GM-controlled NPCs are never limited.
- **What isn't limited**: teleports, undo, and moves made by other modules and macros (for example Dxcufgb's Token follower or a Tile triggers teleport).
- **Combat pauses it**: while a combat runs on the scene, movement is free and the panel says so. When the combat ends, the GM is asked whether to resume exploration with a new round or end it.
- **No GM needed to move**: the limit is checked on the player's own client; only starting rounds needs a GM.

### Exploration panel

A small window with the round and every player character on the scene: movement left, used / total this round, the movement type, and two markers for the action and bonus-action dashes (the bonus one only for characters who have the feature). Clicking a character pans to its token and selects it if it's yours. GMs get **Start exploration**, **Next round**, **Pause / Resume** and **End**. Anyone can open it from the shoe-prints button in the Token controls while Exploration Mode is on.

## Settings

| Setting | Scope | What it does |
| --- | --- | --- |
| Bonus-action Dash features | World (GM) | Comma-separated names of features or active effects that let a character Dash as a bonus action. Default: `Cunning Action, Step of the Wind, Adrenaline Rush, Aggressive, Expeditious Retreat`. Feature items and active effects count, spells the character merely knows don't. |
| Open the panel when exploration starts | Client | Opens the Exploration panel when the GM starts Exploration Mode on the scene you're viewing. |

The module doesn't spend resources: a Step of the Wind that costs a Focus Point still needs the point taken off by hand.

## API / integration

```js
const api = game.modules.get("dxcufgbs-exploration-mode").api;

await api.start(scene);           // GM: start Exploration Mode, round 1 (scene defaults to the viewed one) → true/false
await api.nextRound(scene);       // GM: next round: everyone's movement and dashes reset
await api.setPaused(true, scene); // GM: pause (true) or resume (false) the limits
await api.end(scene);             // GM: end Exploration Mode and clear everyone's movement trail

api.isActive(scene);              // is Exploration Mode on for the scene?
api.getRound(scene);              // the round number (0 when off)
api.getState(scene);              // {active, round, paused}
api.limitsOn(scene);              // active, not paused and no combat running on the scene

api.getMovement(token);           // {speed, used, remaining, budget, max, action, dashes: {action, bonus, bonusAvailable}}
api.canBonusDash(actor);          // does the actor have a feature from the bonus-action dash setting?
await api.takeDash(token, "bonus"); // dash for an owned token this round, if still available ("action" or "bonus") → true/false
api.openPanel();                  // open the Exploration panel
```

- The GM-only calls show a warning to players and return `false`. `scene` is optional everywhere and defaults to the scene being viewed.
- `getMovement` takes a TokenDocument or a Token. `speed` is for the token's current movement type, `budget` is speed × (1 + dashes taken), `max` is what the token could reach with every dash it has, `used` is this round's movement so far. A token whose actor has no dnd5e movement data gets `Infinity`.
- `takeDash` posts the chat line and calls the dash hook, just like choosing it in the dialog.

**Moving a token past the limit**

Moves made by other modules and macros (`TokenDocument#move` with the default method) are not limited. To make sure a move that copies a player's drag isn't cut either, add the module's option:

```js
await tokenDoc.move(waypoints, { "dxcufgbs-exploration-mode": { ignoreLimit: true } });
```

**Hooks**

- `Hooks.on("dxcufgbsExplorationStart", scene => …)`: Exploration Mode started on a scene; runs on every client.
- `Hooks.on("dxcufgbsExplorationRound", (scene, round) => …)`: a round began (also round 1 at the start); runs on every client.
- `Hooks.on("dxcufgbsExplorationEnd", scene => …)`: Exploration Mode ended on a scene; runs on every client.
- `Hooks.on("dxcufgbsExplorationDash", (tokenDoc, type) => …)`: a token dashed, `type` is `"action"` or `"bonus"`; runs only on the client of the player who dashed.

**From another module**

The API is set during `init`, so it is ready from `setup` on. Make the integration optional:

```js
Hooks.once("ready", () => {
  const mod = game.modules.get("dxcufgbs-exploration-mode");
  if (!mod?.active) return;   // Exploration Mode not installed or not enabled
  Hooks.on("dxcufgbsExplorationRound", (scene, round) => console.log(`${scene.name}: round ${round}`));
});
```

Add `{ "id": "dxcufgbs-exploration-mode", "type": "module" }` to `relationships.recommends` in your `module.json`.

**Data**

- `flags.dxcufgbs-exploration-mode.state` on Scenes: `{active, round, paused}`. Read it with `scene.getFlag("dxcufgbs-exploration-mode", "state")`; change it through the API.
- `flags.dxcufgbs-exploration-mode.dash` on Tokens: `{round, action, bonus}`, the dashes taken in that round. A flag from an older round means no dashes yet.
- A token's movement this round is its Foundry movement history (`tokenDoc.movementHistory`), which the module records for player tokens while the limits are on and clears at every new round.

## Compatibility

- Needs the dnd5e system (5.x): speeds, movement types and the ruler colours come from it. In other systems the module loads but limits nothing.
- Uses libWrapper when it is active, and works without it.
- Works with midi-qol's token documents.
- Works alongside Dxcufgb's Token follower and Tile triggers: their moves aren't limited.

## License

MIT
