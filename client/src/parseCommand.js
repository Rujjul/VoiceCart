import { categoryOf } from "./categories.js";
import { defaultUnit, isWeakUnit, normalizeUnit, UNIT_ALIASES } from "./units.js";

const WORD_QTY = {
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
  thirty: 30,
  forty: 40,
  fifty: 50,
  half: 0.5,
};

const SKIP_TOKENS = new Set([
  "of",
  "to",
  "for",
  "on",
  "my",
  "list",
  "the",
  "some",
  "please",
  "also",
]);

function parseQtyToken(token) {
  if (!token) return null;
  if (WORD_QTY[token] != null) return WORD_QTY[token];
  const n = Number(token);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

export function titleCase(name) {
  return String(name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function cleanSpeech(raw) {
  let t = String(raw ?? "").toLowerCase();
  t = t.replace(/[’']/g, "'");
  t = t.replace(/[.,!?]+/g, " ");
  t = t.replace(/\bhalf[-\s]?dozen\b/g, "6");
  t = t.replace(/\b(um+|uh+|erm+|er+|ah+|hmm+)\b/g, " ");
  t = t.replace(/\b(like|please|maybe|just|also|actually|basically|literally)\b/g, " ");
  t = t.replace(/\b(can you|could you|would you|will you|can we|could we)\b/g, " ");
  t = t.replace(/\b(i think|i guess|i feel like)\b/g, " ");
  t = t.replace(/\b(i need|i want|i'd like|i would like|i gotta|i have to)\b/g, " ");
  t = t.replace(/\b(give me|get me)\b/g, " ");
  t = t.replace(/\bput\b/g, " ");
  t = t.replace(/\b(on my list|to my list|from my list|from the list|onto my list|on the list)\b/g, " ");
  t = t.replace(/\b(for me|thanks|thank you)\b/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function splitItems(text) {
  return text
    .split(/\s*(?:,|&| and )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isUnitToken(token, next) {
  if (UNIT_ALIASES[token]) return true;
  if (!isWeakUnit(token)) return false;
  return !next || next === "of" || Boolean(UNIT_ALIASES[next]);
}

export function parseItemPhrase(phrase) {
  const text = cleanSpeech(phrase).replace(/[.?!\s]+$/g, "");
  if (!text) {
    return {
      name: "",
      item: "",
      quantity: 1,
      unit: "pcs",
      unitSpecified: false,
      category: "other",
    };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  let quantity = 1;
  let qtyFound = false;
  let unit = null;
  const nameTokens = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];

    if (SKIP_TOKENS.has(token)) continue;

    if (token === "a" || token === "an") {
      if (!qtyFound) {
        quantity = 1;
        qtyFound = true;
      }
      continue;
    }

    if (token === "dozen" || token === "dozens") {
      quantity = (qtyFound ? quantity : 1) * 12;
      qtyFound = true;
      if (!unit) unit = "pcs";
      continue;
    }

    const qty = parseQtyToken(token);
    if (qty != null && !qtyFound) {
      quantity = qty;
      qtyFound = true;
      continue;
    }

    if (isUnitToken(token, next) && !unit) {
      unit = UNIT_ALIASES[token] || (isWeakUnit(token) ? "g" : null);
      continue;
    }

    if (isWeakUnit(token) && next && next !== "of") {
      nameTokens.push(token);
      continue;
    }

    nameTokens.push(token);
  }

  const name = titleCase(nameTokens.join(" "));
  const category = categoryOf(name);
  const unitSpecified = Boolean(unit);
  return {
    name,
    item: name,
    quantity,
    unit: unit || defaultUnit(),
    unitSpecified,
    category,
  };
}

function stripAction(text, pattern) {
  return text.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

export function parseCommand(transcript) {
  const cleaned = cleanSpeech(transcript);
  if (!cleaned) return { action: "add", items: [] };

  let action = "add";
  let rest = cleaned;

  if (/\b(remove|delete|drop|take off)\b/.test(cleaned)) {
    action = "remove";
    rest = stripAction(cleaned, /\b(remove|delete|drop|take off)\b/g);
  } else if (/\bcheck off\b/.test(cleaned) || /\bmark\b/.test(cleaned) || /\bgot\b/.test(cleaned)) {
    action = "check";
    rest = stripAction(cleaned, /\b(check off|check|got|mark|as done|done|off)\b/g);
  } else if (/\b(update|set|change)\b/.test(cleaned)) {
    action = "update";
    rest = stripAction(cleaned, /\b(update|set|change)\b/g);
  } else {
    rest = stripAction(cleaned, /\b(add|buy|get|pick up|need|want)\b/g);
  }

  const items = splitItems(rest)
    .map(parseItemPhrase)
    .filter((item) => item.name);

  return { action, items };
}

export function parseShoppingCommand(transcript) {
  const { action, items } = parseCommand(transcript);
  if (!items.length) return null;
  const first = items[0];
  return {
    action,
    item: first.item,
    quantity: first.quantity,
    unit: first.unit,
    category: first.category,
    unitSpecified: first.unitSpecified,
    items,
  };
}

export function looksLikePhrase(name) {
  const text = String(name ?? "").toLowerCase();
  return (
    /\b(of|packet|packets|kilo|kilos|dozen|bottle|bottles|roll|rolls|kg|ml)\b/.test(text) ||
    /^(a|an|the|add|please)\s/.test(text) ||
    /^\d/.test(text)
  );
}

export { normalizeUnit };
