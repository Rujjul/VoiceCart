export const UNIT_ALIASES = {
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  litre: "L",
  litres: "L",
  liter: "L",
  liters: "L",
  l: "L",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  gallon: "gallon",
  gallons: "gallon",
  packet: "packet",
  packets: "packet",
  pack: "pack",
  packs: "pack",
  bottle: "bottle",
  bottles: "bottle",
  box: "box",
  boxes: "box",
  loaf: "loaf",
  loaves: "loaf",
  roll: "roll",
  rolls: "roll",
  piece: "pcs",
  pieces: "pcs",
  pcs: "pcs",
  pc: "pcs",
};

const WEAK_UNITS = new Set(["gram", "grams"]);

const PLURAL = {
  packet: ["packet", "packets"],
  pack: ["pack", "packs"],
  bottle: ["bottle", "bottles"],
  box: ["box", "boxes"],
  loaf: ["loaf", "loaves"],
  gallon: ["gallon", "gallons"],
  lb: ["lb", "lbs"],
  roll: ["roll", "rolls"],
};

export function defaultUnit() {
  return "pcs";
}

export function displayUnit(unit, quantity = 1) {
  const key = unit || "pcs";
  const pair = PLURAL[key];
  if (!pair) return key;
  return Number(quantity) === 1 ? pair[0] : pair[1];
}

export function normalizeUnit(unit) {
  const key = String(unit ?? "").trim().toLowerCase();
  if (WEAK_UNITS.has(key)) return "g";
  return UNIT_ALIASES[key] || null;
}

export function isWeakUnit(token) {
  return WEAK_UNITS.has(token);
}
