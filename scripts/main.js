/**
 * Dxcufgb's Exploration Mode — entry point.
 */
import { MODULE_ID } from "./util.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});
