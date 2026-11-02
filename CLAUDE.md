# Dxcufgb's Exploration Mode

FoundryVTT v13 module (id `dxcufgbs-exploration-mode`, the install folder must have the same name) for the dnd5e
system (5.x). The GM starts Exploration Mode on a scene: rounds without initiative, every player token moves at the
same time, limited to its speed per round, with Dash prompts (action, and bonus action for listed features) and a
hard stop after that. No build step, no npm dependencies, no hard module dependencies.

## Layout
- `scripts/main.js` – entry point: settings, hooks, `api`.
- `scripts/util.js` – `MODULE_ID`, `t()`, `escapeHTML`, `isResponsibleGM`.
- `tests/*.test.mjs` – node:test consistency checks run by CI through `.github/foundry-module.json` (`lint`). Not
  shipped.
- `.github/workflows/ci.yml` / `release.yml` – thin callers of `dxcufgb/foundry-module-ci`; identical in every
  module, do not edit here.

## Conventions
- `MODULE_ID` must equal `id` in `module.json`; every visible setting needs a Name and Hint in `lang/en.json`.
  UI strings are under `DXEM.*`.
- Update `README.md` when features, settings or the API change.
