import { useCallback, useEffect, useMemo, useState } from "react";
import { addItem, deleteItem, getItems, getSuggestions, patchItem } from "./api.js";
import { parseCommand } from "./parseCommand.js";
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
    async (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setBusy(true);
      setError("");
      try {
        await addItem(trimmed);
        await refresh();
        setStatus(`Added ${titleCase(trimmed)}.`);
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
        await patchItem(item.id, !item.checked);
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

  const findByName = useCallback(
    (name) =>
      items.find((item) => item.name.toLowerCase() === name.toLowerCase()),
    [items]
  );

  const applyVoice = useCallback(
    async (transcript) => {
      const { action, items: names } = parseCommand(transcript);
      if (!names.length) {
        setStatus(`Heard “${transcript}” — nothing to add.`);
        return;
      }

      setBusy(true);
      setError("");
      try {
        if (action === "add") {
          await Promise.all(names.map((name) => addItem(name)));
          await refresh();
          setStatus(`Added ${names.map(titleCase).join(", ")}.`);
          return;
        }

        if (action === "remove") {
          const matches = names.map(findByName).filter(Boolean);
          await Promise.all(matches.map((item) => deleteItem(item.id)));
          await refresh();
          setStatus(
            matches.length
              ? `Removed ${matches.map((item) => item.name).join(", ")}.`
              : `Could not find ${names.map(titleCase).join(", ")}.`
          );
          return;
        }

        const matches = names.map(findByName).filter(Boolean);
        await Promise.all(matches.map((item) => patchItem(item.id, true)));
        await refresh();
        setStatus(
          matches.length
            ? `Checked off ${matches.map((item) => item.name).join(", ")}.`
            : `Could not find ${names.map(titleCase).join(", ")}.`
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
                  <span>{item.name}</span>
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => handleRemove(item)}
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </button>
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
                    disabled={busy || added}
                    onClick={() => handleAdd(name)}
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
