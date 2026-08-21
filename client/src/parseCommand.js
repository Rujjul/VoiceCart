const WORD_QTY = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  half: 0.5,
};

const UNIT_ALIASES = {
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  litre: "litre",
  litres: "litre",
  liter: "litre",
  liters: "litre",
  l: "litre",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  packet: "packet",
  packets: "packet",
  pack: "packet",
  packs: "packet",
  bottle: "bottle",
  bottles: "bottle",
  box: "box",
  boxes: "box",
  dozen: "dozen",
  dozens: "dozen",
  piece: "piece",
  pieces: "piece",
  pcs: "pcs",
  pc: "pcs",
};

function splitItems(text) {
  return text
    .split(/\s*(?:,|&| and )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseQtyToken(token) {
  if (!token) return null;
  if (WORD_QTY[token] != null) return WORD_QTY[token];
  const n = Number(token);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

export function parseItemPhrase(phrase) {
  const text = String(phrase ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.?!\s]+$/g, "")
    .replace(/^(please\s+)?(some|the)\s+/i, "");
  if (!text) {
    return { name: "", quantity: 1, unit: "pcs", unitSpecified: false };
  }

  const tokens = text.split(/\s+/);
  let i = 0;
  let quantity = 1;
  let unit = "pcs";
  let unitSpecified = false;

  const qty = parseQtyToken(tokens[0]);
  if (qty != null) {
    quantity = qty;
    i = 1;
  }

  if (tokens[i] && UNIT_ALIASES[tokens[i]]) {
    unit = UNIT_ALIASES[tokens[i]];
    unitSpecified = true;
    i += 1;
  }

  if (tokens[i] === "of") i += 1;

  const name = tokens.slice(i).join(" ").trim();
  return { name, quantity, unit, unitSpecified };
}

export function parseCommand(transcript) {
  const raw = String(transcript ?? "").trim();
  if (!raw) return { action: "add", items: [] };

  const t = raw.toLowerCase().replace(/[.?!\s]+$/g, "").trim();

  const removeMatch = t.match(/^(?:please\s+)?(?:remove|delete|drop)\s+(.+)/i);
  if (removeMatch) {
    return {
      action: "remove",
      items: splitItems(removeMatch[1]).map(parseItemPhrase).filter((item) => item.name),
    };
  }

  const checkMatch = t.match(
    /^(?:please\s+)?(?:check\s+off|check|got|mark)\s+(.+?)(?:\s+as\s+done|\s+done|\s+off)?$/i
  );
  if (checkMatch) {
    const names = checkMatch[1].replace(/\s+(?:as\s+done|done|off)$/i, "");
    return {
      action: "check",
      items: splitItems(names).map(parseItemPhrase).filter((item) => item.name),
    };
  }

  const addMatch = t.match(
    /^(?:please\s+)?(?:add|i need|need|buy|get|pick up)\s+(.+)/i
  );
  const rest = addMatch ? addMatch[1] : t;
  return {
    action: "add",
    items: splitItems(rest).map(parseItemPhrase).filter((item) => item.name),
  };
}
