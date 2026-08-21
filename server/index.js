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

async function loadItems() {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
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

  const items = await loadItems();
  const existing = items.find(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    res.json(existing);
    return;
  }

  const item = {
    id: randomUUID(),
    name,
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
