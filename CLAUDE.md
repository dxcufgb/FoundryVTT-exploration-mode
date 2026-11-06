# Dxcufgb's Exploration Mode

FoundryVTT v13 module (id `dxcufgbs-exploration-mode`, the install folder must have the same name) for the dnd5e
system (5.x). The GM starts Exploration Mode on a scene: rounds without initiative, every player token moves at the
same time, limited to its speed per round, with Dash prompts (action, and bonus action for listed features) and a
hard stop after that. No build step, no npm dependencies, no hard module dependencies (libWrapper is used when active).

## Layout
- `scripts/main.js` – entry point: settings (`bonusDashFeatures` world, `autoOpenPanel` client, `panelPosition`
  hidden client), `api`, the movement patches in `setup` (dnd5e only), Token-controls tools (GM toggle, panel
  button), the start/end/round hooks (called on every client from `updateScene`), panel refreshes, and the
  end-of-combat question (responsible GM).
- `scripts/state.js` – the scene state `flags[id].state = {active, round, paused}`; `limitsOn` (active, not paused,
  no started combat on the scene), `isLimitedToken` (player-owned creature), `start` / `end` / `nextRound` /
  `setPaused` (GM only) and `clearMovement` (clears limited tokens' movement history in one update).
- `scripts/movement.js` – the limit. Wraps (libWrapper or by hand) on `CONFIG.Token.documentClass` /
  `objectClass`: `_shouldRecordMovementHistory` (record a player's moves while the limits are on), `_preUpdate`
  (notes the movement method per token for the constrain step) and `constrainMovementPath` (cuts the path where the
  round's movement runs out and asks about dashing, on the real move only: a drag preview is never cut, because
  Foundry moves the token along the preview and every drop would then fit). `getMovement` and `getDashes`.
- `scripts/movement-math.js` – pure helpers (speed per action like the dnd5e ruler, dash multiplier, where a path
  goes over, gridless binary search). Tested in Node.
- `scripts/dash.js` – `canBonusDash` (feature items and active effects by name, not spells), the dash question
  (DialogV2, one at a time per token), `takeDash` (dot-path update of the token's `dash` flag, chat line, hook).
- `scripts/debug-recorder.js` – optional integration with Dxcufgb's Debug Recorder (`dxcufgbs-debug-recorder`, not a
  dependency): `crumb(key, data)` breadcrumbs (no-op unless it is recording) and `registerDebugRecorder({ snapshot })`,
  called in `ready` with `debugSnapshot` from `main.js`.
- `scripts/apps/exploration-panel.js` + `templates/exploration-panel.hbs` – the floating panel (one instance,
  debounced re-render, no inputs, position in the `panelPosition` client setting).
- `tests/*.test.mjs` – node:test checks run by CI through `.github/foundry-module.json` (`lint`). Not shipped.
- `.github/workflows/ci.yml` / `release.yml` – thin callers of `dxcufgb/foundry-module-ci`; identical in every
  module, do not edit here.

## Invariants
- Used movement = the token's recorded movement history (`movementHistory` costs). The GM clears it at start, each
  new round and the end; undo refunds it. Nothing else stores movement.
- The limit is applied only in `constrainMovementPath` on the moving client; it must never throw (log and return
  core's result). GM users, API/undo/paste moves and moves with `{[MODULE_ID]: {ignoreLimit: true}}` are never
  limited.
- Only GM users write the scene `state` flag; players write only their own token's `dash` flag, as dot paths. A
  `dash` flag from another round counts as no dashes, so a new round never writes to every token.
- Debug-recorder integration is optional (the module works the same without it, and a recorder error must never
  break it); snapshot/breadcrumb data must never contain names, free text, image paths or URLs (only counts,
  booleans, numbers and the module's own enum values).
- Stable names (used by other modules): API members, hook names `dxcufgbsExploration{Start,End,Round,Dash}`, flag
  names `state` / `dash` and their keys, the `ignoreLimit` move option, setting ids.

## Conventions
- `MODULE_ID` must equal `id` in `module.json`; every visible setting needs a Name and Hint in `lang/en.json`.
  UI strings are under `DXEM.*` (the test checks every key used).
- Update the wiki (not `README.md`, which only has the install steps and links to the wiki) when features, settings or the API change.
