async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function getItems() {
  return request("/api/items");
}

export function addItem(name, { quantity = 1, unit } = {}) {
  const body = { name, quantity };
  if (unit != null) body.unit = unit;
  return request("/api/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchItem(id, fields) {
  return request(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export function deleteItem(id) {
  return request(`/api/items/${id}`, { method: "DELETE" });
}

export function getSuggestions() {
  return request("/api/suggestions");
}
