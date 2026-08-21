import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suggestions } from "./suggestions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const dataFile = join(dataDir, "list.json");
const tmpFile = join(dataDir, "list.json.tmp");
const PORT = process.env.PORT || 3001;

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

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function normalizeUnit(unit) {
  const key = String(unit ?? "").trim().toLowerCase();
  return UNIT_ALIASES[key] || "pcs";
}

function parseQuantity(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function hydrate(item) {
  return {
    ...item,
    quantity: parseQuantity(item.quantity, 1),
    unit: item.unit ? normalizeUnit(item.unit) : "pcs",
  };
}

async function loadItems() {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(hydrate) : [];
  } catch {
    return [];
  }
}

async function saveItems(items) {
  await mkdir(dataDir, { recursive: true });
  const payload = `${JSON.stringify(items, null, 2)}\n`;
  await writeFile(tmpFile, payload, "utf8");
  try {
    await unlink(dataFile);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await rename(tmpFile, dataFile);
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/items", async (_req, res) => {
  const items = await loadItems();
  res.json(items);
});

app.post("/api/items", async (req, res) => {
  const name = normalizeName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const delta = parseQuantity(req.body?.quantity, 1);
  const hasUnit = Object.prototype.hasOwnProperty.call(req.body ?? {}, "unit");
  const items = await loadItems();
  const existing = items.find(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    existing.quantity = parseQuantity(existing.quantity, 1) + delta;
    if (hasUnit) existing.unit = normalizeUnit(req.body.unit);
    await saveItems(items);
    res.json(existing);
    return;
  }

  const item = {
    id: randomUUID(),
    name,
    quantity: delta,
    unit: hasUnit ? normalizeUnit(req.body.unit) : "pcs",
    checked: false,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  await saveItems(items);
  res.status(201).json(item);
});

app.patch("/api/items/:id", async (req, res) => {
  const items = await loadItems();
  const item = items.find((entry) => entry.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (typeof req.body?.checked === "boolean") {
    item.checked = req.body.checked;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "unit")) {
    item.unit = normalizeUnit(req.body.unit);
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "quantity")) {
    const nextQty = Number(req.body.quantity);
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      const remaining = items.filter((entry) => entry.id !== item.id);
      await saveItems(remaining);
      res.status(204).end();
      return;
    }
    item.quantity = nextQty;
  }

  await saveItems(items);
  res.json(item);
});

app.delete("/api/items/:id", async (req, res) => {
  const items = await loadItems();
  const next = items.filter((item) => item.id !== req.params.id);
  if (next.length === items.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await saveItems(next);
  res.status(204).end();
});

app.get("/api/suggestions", (_req, res) => {
  res.json(suggestions);
});

app.listen(PORT, () => {
  console.log(`VoiceCart API on http://localhost:${PORT}`);
});
