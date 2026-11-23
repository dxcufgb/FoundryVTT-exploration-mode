/**
 * The out-of-movement marker: a small "no entry" badge in the top-right corner of a token that has used all its
 * movement this round (see isSpent in movement.js). Everyone who can see the token sees it, while the limits are
 * on. It is a child of the Token placeable, so it moves with the token and is gone when the token is redrawn
 * (refreshToken puts it back). Nothing here may throw into a canvas refresh.
 */
import { MODULE_ID } from "./util.js";
import { limitsOn, isLimitedToken } from "./state.js";
import { isSpent } from "./movement.js";

const KEY = Symbol(`${MODULE_ID}.spentMarker`);
/** Drawn at this radius and scaled to the token. */
const RADIUS = 16;

function drawMarker() {
  const g = new PIXI.Graphics();
  g.lineStyle(2, 0x1a1a1a, 0.9).beginFill(0xc0392b, 0.95).drawCircle(0, 0, RADIUS).endFill();
  g.lineStyle(0).beginFill(0xffffff, 1).drawRoundedRect(-RADIUS * 0.6, -RADIUS * 0.18, RADIUS * 1.2, RADIUS * 0.36, 2).endFill();
  g.eventMode = "none";
  g.zIndex = 1000;
  return g;
}

/** Shows, places or removes the marker of one token. */
export function refreshMarker(token) {
  try {
    if (!token || token.destroyed) return;
    const doc = token.document;
    const show = !!doc?.parent && limitsOn(doc.parent) && isLimitedToken(doc) && isSpent(doc);
    let marker = token[KEY];
    if (marker?.destroyed) marker = token[KEY] = null;
    if (!show) {
      if (marker) {
        marker.destroy();
        token[KEY] = null;
      }
      return;
    }
    if (!marker) marker = token[KEY] = token.addChild(drawMarker());
    const size = Math.max(14, Math.min(token.w, token.h) * 0.3);
    marker.scale.set(size / (RADIUS * 2));
    marker.position.set(token.w - size * 0.35, size * 0.35);
  } catch (err) {
    console.error(`${MODULE_ID} | out-of-movement marker`, err);
  }
}

/** Refreshes the markers of every token on the canvas (the state, round or a combat changed). */
export function refreshAllMarkers() {
  for (const token of canvas?.tokens?.placeables ?? []) refreshMarker(token);
}
