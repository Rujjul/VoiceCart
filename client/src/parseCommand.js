function splitItems(text) {
  return text
    .split(/\s*(?:,|&| and )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseCommand(transcript) {
  const raw = String(transcript ?? "").trim();
  if (!raw) return { action: "add", items: [] };

  const t = raw.toLowerCase().replace(/[.?!\s]+$/g, "").trim();

  const removeMatch = t.match(/^(?:please\s+)?(?:remove|delete|drop)\s+(.+)/i);
  if (removeMatch) {
    return { action: "remove", items: splitItems(removeMatch[1]) };
  }

  const checkMatch = t.match(
    /^(?:please\s+)?(?:check\s+off|check|got|mark)\s+(.+?)(?:\s+as\s+done|\s+done|\s+off)?$/i
  );
  if (checkMatch) {
    const names = checkMatch[1].replace(/\s+(?:as\s+done|done|off)$/i, "");
    return { action: "check", items: splitItems(names) };
  }

  const addMatch = t.match(
    /^(?:please\s+)?(?:add|i need|need|buy|get|pick up)\s+(.+)/i
  );
  if (addMatch) {
    return { action: "add", items: splitItems(addMatch[1]) };
  }

  return { action: "add", items: splitItems(t) };
}
