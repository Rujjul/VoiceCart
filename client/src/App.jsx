import { useCallback, useEffect, useMemo, useState } from "react";
import { addItem, deleteItem, getItems, getSuggestions, patchItem } from "./api.js";
import { parseCommand, parseItemPhrase } from "./parseCommand.js";
import { useSpeech } from "./useSpeech.js";

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function titleCase(name) {
  return name
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function formatEntry({ name, quantity, unit }) {
  const qty = quantity ?? 1;
  const label = unit && unit !== "pcs" ? `${qty} ${unit}` : String(qty);
  return `${label} ${titleCase(name)}`;
}

export default function App() {
  const [items, setItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Tap the mic, or type to add an item.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getItems();
    setItems(sortItems(next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, groups] = await Promise.all([getItems(), getSuggestions()]);
        if (cancelled) return;
        setItems(sortItems(list));
        setSuggestions(groups);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load the list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = useCallback(
    async (name, options = {}) => {
      const parsed = parseItemPhrase(name);
      const itemName = (options.name ?? parsed.name).trim();
      if (!itemName) return;
      const quantity = options.quantity ?? parsed.quantity ?? 1;
      const unit =
        options.unit ?? (parsed.unitSpecified ? parsed.unit : undefined);
      setBusy(true);
      setError("");
      try {
        await addItem(itemName, { quantity, unit });
        await refresh();
        setStatus(
          `Added ${formatEntry({ name: itemName, quantity, unit: unit || "pcs" })}.`
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [refresh]
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
      setError("");
      try {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          await deleteItem(item.id);
          setStatus(`Removed ${item.name}.`);
        } else {
          await patchItem(item.id, { quantity });
        }
        await refresh();
      } catch (err) {
        setError(err.message);
      }
    },
    [refresh]
  );

  const findByName = useCallback(
    (name) =>
      items.find((item) => item.name.toLowerCase() === name.toLowerCase()),
    [items]
  );

  const applyVoice = useCallback(
    async (transcript) => {
      const { action, items: parsed } = parseCommand(transcript);
      if (!parsed.length) {
        setStatus(`Heard “${transcript}” — nothing to add.`);
        return;
      }

      setBusy(true);
      setError("");
      try {
        if (action === "add") {
          for (const entry of parsed) {
            await addItem(entry.name, {
              quantity: entry.quantity ?? 1,
              unit: entry.unitSpecified ? entry.unit : undefined,
            });
          }
          await refresh();
          setStatus(`Added ${parsed.map(formatEntry).join(", ")}.`);
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
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [findByName, refresh]
  );

  const { supported, listening, interim, toggle } = useSpeech(applyVoice);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  const onSearchSubmit = async (event) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    await handleAdd(value);
    setQuery("");
  };

  const listedIds = new Set(items.map((item) => item.name.toLowerCase()));

  return (
    <div className="page">
      <header className="header">
        <p className="eyebrow">Shopping list</p>
        <h1>VoiceCart</h1>
        <p className="lede">A quiet, voice-first list. Speak, search, or tap.</p>
      </header>

      <form className="search" onSubmit={onSearchSubmit}>
        <label htmlFor="search">Search or add</label>
        <input
          id="search"
          type="search"
          placeholder="Search the list, or press Enter to add"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </form>

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
        ) : null}
        <p className="status">
          {!supported
            ? "Speech is not supported in this browser. Use search or suggestions."
            : listening
              ? interim || "Listening…"
              : status}
        </p>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="list-block" aria-label="Shopping list">
        <div className="section-head">
          <h2>List</h2>
          <span>{items.filter((item) => !item.checked).length} remaining</span>
        </div>
        {filtered.length === 0 ? (
          <p className="empty">
            {items.length === 0
              ? "Tap the mic or search to add."
              : "No items match that search."}
          </p>
        ) : (
          <ul className="list">
            {filtered.map((item) => (
              <li key={item.id} className={item.checked ? "checked" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleToggle(item)}
                  />
                  <span className="item-copy">
                    <span className="item-name">
                      {item.name}
                      <span className="item-qty"> {item.quantity ?? 1}</span>
                    </span>
                    <span className="item-unit">{item.unit || "pcs"}</span>
                  </span>
                </label>
                <div className="item-actions">
                  <QtyControls
                    quantity={item.quantity ?? 1}
                    name={item.name}
                    onChange={(qty) => handleSetQuantity(item, qty)}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => handleRemove(item)}
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="suggestions" aria-label="Suggestions">
        <div className="section-head">
          <h2>Suggestions</h2>
        </div>
        {suggestions.map((group) => (
          <div key={group.category} className="group">
            <h3>{group.category}</h3>
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
    </div>
  );
}

function QtyControls({ quantity, name, onChange }) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next === quantity) {
      setDraft(String(quantity));
      return;
    }
    onChange(next);
  };

  return (
    <div className="qty" aria-label={`Quantity for ${name}`}>
      <button
        type="button"
        className="qty-btn"
        onClick={() => onChange(quantity - 1)}
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
        onClick={() => onChange(quantity + 1)}
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
