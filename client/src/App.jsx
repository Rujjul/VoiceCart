import { useCallback, useEffect, useMemo, useState } from "react";
import { addItem, deleteItem, getItems, getSuggestions, patchItem } from "./api.js";
import { CATEGORIES, categoryMeta, categoryOf } from "./categories.js";
import { looksLikePhrase, parseItemPhrase, parseShoppingCommand, titleCase } from "./parseCommand.js";
import { displayUnit } from "./units.js";
import { useSpeech } from "./useSpeech.js";

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function formatEntry({ name, quantity, unit }) {
  const qty = quantity ?? 1;
  return `${qty} ${displayUnit(unit, qty)} ${titleCase(name)}`;
}

function withCategory(item) {
  const parsed = parseItemPhrase(item.name);
  const messy = looksLikePhrase(item.name);
  const name = messy && parsed.name ? parsed.name : titleCase(item.name);
  const stored = Number(item.quantity);
  const hasStoredQty = Number.isFinite(stored) && stored > 0;
  return {
    ...item,
    name,
    quantity: hasStoredQty ? stored : parsed.quantity || 1,
    unit: item.unit && item.unit !== "pcs" ? item.unit : parsed.unit || "pcs",
    category: parsed.category || categoryOf(name),
  };
}

export default function App() {
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("list");
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getItems();
    setItems(sortItems(next.map(withCategory)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, groups] = await Promise.all([getItems(), getSuggestions()]);
        if (cancelled) return;
        setSuggestions(groups);
        const cleaned = [];
        for (const item of list) {
          if (!looksLikePhrase(item.name)) {
            cleaned.push(item);
            continue;
          }
          const parsed = parseItemPhrase(item.name);
          if (!parsed.name) {
            cleaned.push(item);
            continue;
          }
          const quantity =
            Number(item.quantity) > 1 ? Number(item.quantity) : parsed.quantity;
          const saved = await patchItem(item.id, {
            name: parsed.name,
            quantity,
            unit: parsed.unit,
          });
          cleaned.push(
            saved || { ...item, name: parsed.name, quantity, unit: parsed.unit }
          );
        }
        if (cancelled) return;
        setItems(sortItems(cleaned.map(withCategory)));
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load the list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const findByName = useCallback(
    (name) =>
      items.find((item) => item.name.toLowerCase() === name.toLowerCase()),
    [items]
  );

  const handleAdd = useCallback(
    async (name, options = {}) => {
      const parsed = parseItemPhrase(name);
      const itemName = (options.name ?? parsed.name).trim();
      if (!itemName) return;
      const quantity = Object.prototype.hasOwnProperty.call(options, "quantity")
        ? options.quantity
        : parsed.quantity ?? 1;
      const existing = findByName(itemName);
      const unit =
        options.unit ??
        (parsed.unitSpecified || !existing ? parsed.unit : undefined);
      setBusy(true);
      setError("");
      try {
        if (existing) {
          await patchItem(existing.id, {
            name: itemName,
            quantity: (existing.quantity ?? 1) + quantity,
            ...(unit ? { unit } : {}),
          });
        } else {
          await addItem(itemName, { quantity, unit });
        }
        await refresh();
        setStatus(
          `Added ${formatEntry({ name: itemName, quantity, unit: unit || parsed.unit })}.`
        );
        setTab("list");
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [findByName, refresh]
  );

  const handleToggle = useCallback(
    async (item) => {
      setError("");
      try {
        await patchItem(item.id, { checked: !item.checked });
        await refresh();
      } catch (err) {
        setError(err.message);
      }
    },
    [refresh]
  );

  const handleRemove = useCallback(
    async (item) => {
      setError("");
      try {
        await deleteItem(item.id);
        await refresh();
        setStatus(`Removed ${item.name}.`);
      } catch (err) {
        setError(err.message);
      }
    },
    [refresh]
  );

  const handleSetQuantity = useCallback(
    async (item, nextQty) => {
      const quantity = Number(nextQty);
      if (!Number.isFinite(quantity)) return;
      setError("");
      try {
        if (quantity <= 0) {
          setItems((prev) => prev.filter((entry) => entry.id !== item.id));
          await deleteItem(item.id);
          setStatus(`Removed ${item.name}.`);
          return;
        }
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, quantity } : entry
          )
        );
        await patchItem(item.id, { quantity, name: item.name, unit: item.unit });
      } catch (err) {
        setError(err.message);
        await refresh();
      }
    },
    [refresh]
  );

  const applyVoice = useCallback(
    async (transcript) => {
      const parsedCommand = parseShoppingCommand(transcript);
      const parsed = parsedCommand?.items ?? [];
      if (!parsed.length) {
        setStatus(`Heard “${transcript}” — nothing to add.`);
        return;
      }
      const action = parsedCommand.action;

      setBusy(true);
      setError("");
      try {
        if (action === "add") {
          for (const entry of parsed) {
            const existing = findByName(entry.name);
            if (existing) {
              await patchItem(existing.id, {
                name: entry.name,
                quantity: (existing.quantity ?? 1) + (entry.quantity ?? 1),
                ...(entry.unitSpecified ? { unit: entry.unit } : {}),
              });
            } else {
              await addItem(entry.name, {
                quantity: entry.quantity ?? 1,
                unit: entry.unit,
              });
            }
          }
          await refresh();
          setStatus(`Added ${parsed.map(formatEntry).join(", ")}.`);
          setTab("list");
          return;
        }

        if (action === "update") {
          for (const entry of parsed) {
            const match = findByName(entry.name);
            if (match) {
              await patchItem(match.id, {
                quantity: entry.quantity ?? 1,
                ...(entry.unitSpecified ? { unit: entry.unit } : {}),
              });
            } else {
              await addItem(entry.name, {
                quantity: entry.quantity ?? 1,
                unit: entry.unit,
              });
            }
          }
          await refresh();
          setStatus(`Updated ${parsed.map(formatEntry).join(", ")}.`);
          setTab("list");
          return;
        }

        if (action === "remove") {
          const changed = [];
          const missing = [];
          for (const entry of parsed) {
            const match = findByName(entry.name);
            if (!match) {
              missing.push(titleCase(entry.name));
              continue;
            }
            const nextQty = (match.quantity ?? 1) - (entry.quantity ?? 1);
            if (nextQty <= 0) {
              await deleteItem(match.id);
            } else {
              await patchItem(match.id, { quantity: nextQty });
            }
            changed.push(match.name);
          }
          await refresh();
          const parts = [];
          if (changed.length) parts.push(`Updated ${changed.join(", ")}.`);
          if (missing.length) parts.push(`Could not find ${missing.join(", ")}.`);
          setStatus(parts.join(" ") || "Nothing to remove.");
          setTab("list");
          return;
        }

        const matches = parsed.map((entry) => findByName(entry.name)).filter(Boolean);
        for (const item of matches) {
          await patchItem(item.id, { checked: true });
        }
        await refresh();
        setStatus(
          matches.length
            ? `Checked off ${matches.map((item) => item.name).join(", ")}.`
            : `Could not find ${parsed.map((entry) => titleCase(entry.name)).join(", ")}.`
        );
        setTab("list");
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [findByName, refresh]
  );

  const { supported, listening, interim, toggle } = useSpeech(applyVoice);

  const checkedCount = items.filter((item) => item.checked).length;
  const total = items.length;
  const percent = total ? Math.round((checkedCount / total) * 100) : 0;

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const cat = categoryOf(item.name);
      if (filter !== "all" && cat !== filter) return false;
      if (tab === "search" && q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, query, tab]);

  const grouped = useMemo(() => {
    const buckets = new Map();
    for (const item of visibleItems) {
      const id = categoryOf(item.name);
      if (!buckets.has(id)) buckets.set(id, []);
      buckets.get(id).push(item);
    }
    return CATEGORIES.filter((cat) => buckets.has(cat.id)).map((cat) => ({
      ...cat,
      items: buckets.get(cat.id),
    }));
  }, [visibleItems]);

  const counts = useMemo(() => {
    const next = { all: items.length };
    for (const cat of CATEGORIES) next[cat.id] = 0;
    for (const item of items) next[categoryOf(item.name)] += 1;
    return next;
  }, [items]);

  const listedIds = new Set(items.map((item) => item.name.toLowerCase()));
  const smartCount = suggestions.reduce((sum, group) => sum + group.items.length, 0);

  const onSearchSubmit = async (event) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    await handleAdd(value);
    setQuery("");
  };

  const helper = !supported
    ? "Speech is not supported in this browser. Use search or suggestions."
    : listening
      ? interim || "Listening…"
      : status || 'Tap mic · say "Add 2 bottles of water" or "Remove apples"';

  return (
    <div className="page">
      <header className="header">
        <div className="header-row">
          <div>
            <p className="eyebrow">Voice assistant</p>
            <h1>VoiceCart</h1>
          </div>
          <button type="button" className="lang" aria-label="Language">
            <GlobeIcon />
            Eng
          </button>
        </div>
        <div className="progress-meta">
          <span>
            {checkedCount}/{total || 0} items
          </span>
          <span>{percent}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100">
          <span style={{ width: `${percent}%` }} />
        </div>
      </header>

      <section className="mic-block" aria-label="Voice input">
        {supported ? (
          <button
            type="button"
            className={`mic ${listening ? "listening" : ""}`}
            onClick={toggle}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            <MicIcon />
          </button>
        ) : (
          <div className="mic disabled" aria-hidden="true">
            <MicIcon />
          </div>
        )}
        <p className="status">{helper}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <nav className="tabs" aria-label="Views">
        <button
          type="button"
          className={tab === "list" ? "active" : ""}
          onClick={() => setTab("list")}
        >
          <ClipboardIcon />
          List {total ? <em>{total}</em> : null}
        </button>
        <button
          type="button"
          className={tab === "smart" ? "active" : ""}
          onClick={() => setTab("smart")}
        >
          <SparkleIcon />
          Smart {smartCount ? <em>{smartCount}</em> : null}
        </button>
        <button
          type="button"
          className={tab === "search" ? "active" : ""}
          onClick={() => setTab("search")}
        >
          <SearchIcon />
          Search
        </button>
      </nav>

      {tab !== "smart" ? (
        <div className="filters" role="tablist" aria-label="Categories">
          <button
            type="button"
            className={`chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All {counts.all || 0}
          </button>
          {CATEGORIES.filter((cat) => cat.id !== "other" || counts.other).map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`chip ${filter === cat.id ? "active" : ""}`}
              onClick={() => setFilter(cat.id)}
            >
              <span aria-hidden="true">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "search" ? (
        <form className="search" onSubmit={onSearchSubmit}>
          <label htmlFor="search" className="sr-only">
            Search or add
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search the list, or press Enter to add"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </form>
      ) : null}

      {tab === "smart" ? (
        <section className="smart" aria-label="Suggestions">
          {suggestions.map((group) => (
            <div key={group.category} className="group">
              <CategoryHead id={categoryOf(group.items[0] || group.category)} fallback={group.category} />
              <div className="pills">
                {group.items.map((name) => {
                  const added = listedIds.has(name.toLowerCase());
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`pill ${added ? "added" : ""}`}
                      disabled={busy}
                      onClick={() => handleAdd(name, { quantity: 1 })}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="list-block" aria-label="VoiceCart">
          {visibleItems.length === 0 ? (
            <p className="empty">
              {items.length === 0
                ? "Tap the mic or search to add."
                : "No items match that filter."}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.id} className="group">
                <CategoryHead id={group.id} />
                <ul className="cards">
                  {group.items.map((item) => (
                    <li key={item.id} className={item.checked ? "card checked" : "card"}>
                      <button
                        type="button"
                        className={`check ${item.checked ? "on" : ""}`}
                        onClick={() => handleToggle(item)}
                        aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.name}`}
                      />
                      <div className="item-copy">
                        <span className="item-name">{item.name}</span>
                        <span className="item-measure">
                          {item.quantity ?? 1} {displayUnit(item.unit || "pcs", item.quantity ?? 1)}
                        </span>
                      </div>
                      <QtyControls
                        quantity={item.quantity ?? 1}
                        name={item.name}
                        onChange={(qty) => handleSetQuantity(item, qty)}
                      />
                      <button
                        type="button"
                        className="delete"
                        onClick={() => handleRemove(item)}
                        aria-label={`Remove ${item.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

function CategoryHead({ id, fallback }) {
  const meta = categoryMeta(id);
  return (
    <h2 className="cat-head">
      <span aria-hidden="true">{meta.icon}</span>
      {fallback || meta.label}
      <i />
    </h2>
  );
}

function QtyControls({ quantity, name, onChange }) {
  const qty = Number(quantity) || 0;
  const [draft, setDraft] = useState(String(qty));

  useEffect(() => {
    setDraft(String(qty));
  }, [qty]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next === qty) {
      setDraft(String(qty));
      return;
    }
    onChange(next);
  };

  const bump = (delta) => (event) => {
    event.preventDefault();
    onChange(qty + delta);
  };

  return (
    <div className="qty" aria-label={`Quantity for ${name}`}>
      <button
        type="button"
        className="qty-btn"
        onMouseDown={(event) => event.preventDefault()}
        onClick={bump(-1)}
        aria-label={`Decrease ${name}`}
      >
        −
      </button>
      <input
        className="qty-input"
        type="number"
        min="0"
        step="any"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        aria-label={`${name} quantity`}
      />
      <button
        type="button"
        className="qty-btn"
        onMouseDown={(event) => event.preventDefault()}
        onClick={bump(1)}
        aria-label={`Increase ${name}`}
      >
        +
      </button>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm7-3a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11Z"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c.7 0 2.3 1.7 3 5H9c.7-3.3 2.3-5 3-5Zm-4.1 7h8.2c.10.0.2.5.3 1s-.1.7-.3 1H7.9c-.2-.3-.3-.7-.3-1s.1-.7.3-1Zm.1 4h6c-.7 3.3-2.3 5-3 5s-2.3-1.7-3-5Z"
      />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3h6a2 2 0 0 1 2 2h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1a2 2 0 0 1 2-2Zm0 2v2h6V5H9Zm-3 4v10h12V9H6Z"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2l1.4 6.1L19 10l-5.6 1.9L12 18l-1.4-6.1L5 10l5.6-1.9L12 2Zm7 11 0.8 3.2L23 17l-3.2.8L19 21l-.8-3.2L15 17l3.2-.8L19 13Z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm8.7 12.3 1.4 1.4-3.8 3.8-1.4-1.4 3.8-3.8Z"
      />
    </svg>
  );
}
