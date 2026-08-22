const STORAGE_KEY = "voicecart.history";

function itemKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore quota / private-mode failures; in-memory state still works this session.
  }
}

export function recordPurchases(history, names) {
  const next = { ...history };
  let changed = false;

  for (const raw of names) {
    const key = itemKey(raw);
    if (!key) continue;
    const prev = next[key];
    next[key] = {
      name: prev?.name || String(raw).trim(),
      count: (Number(prev?.count) || 0) + 1,
    };
    changed = true;
  }

  if (!changed) return history;
  saveHistory(next);
  return next;
}

export function recommendFromHistory(history, listedNames, limit = 5) {
  const listed = new Set(
    listedNames.map((name) => itemKey(name)).filter(Boolean)
  );

  return Object.values(history)
    .filter(
      (entry) =>
        entry?.name &&
        Number(entry.count) > 0 &&
        !listed.has(itemKey(entry.name))
    )
    .sort(
      (a, b) =>
        Number(b.count) - Number(a.count) ||
        String(a.name).localeCompare(String(b.name))
    )
    .slice(0, limit);
}
