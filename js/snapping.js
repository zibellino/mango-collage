// This is a separate grid from the visual one drawn in grid.js — same idea
// (mm-based spacing) but independently configurable, per the plan to make
// both toggleable and independently sized later. For now it's fixed on and
// fixed at 2.5mm.
let enabled = true;
let spacingMm = 2.5;

export function setSnapEnabled(value) {
  enabled = value;
}

export function setSnapSpacingMm(mm) {
  spacingMm = mm;
}

export function snapPoint(x, y) {
  if (!enabled) return { x, y };
  if (spacingMm <= 0) return { x, y };
  return {
    x: Math.round(x / spacingMm) * spacingMm,
    y: Math.round(y / spacingMm) * spacingMm,
  };
}
