(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TracesFeed = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const SCHEMA = "traces.exhibition.v1";
  const CACHE_KEY = "traces.exhibition.v1";
  const KINDS = new Set(["thought", "focus", "memory", "restraint", "dream", "artifact", "self", "question", "hypothesis", "contradiction", "world"]);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

  function invalid() { throw new TypeError("Invalid exhibition publication"); }
  function text(value, limit, required = false) {
    if (typeof value !== "string" || value.length > limit || (required && !value.trim())) invalid();
    return value;
  }
  function integer(value, maximum = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) invalid();
    return value;
  }
  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
    const parsed = new Date(value + "T00:00:00.000Z");
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid();
    return value;
  }
  function instant(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) invalid();
    date(value.slice(0, 10));
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== value.slice(0, 19)) invalid();
    return value;
  }

  function safety(value) {
    if (value === undefined) return;
    if (!object(value)) invalid();
    for (const [key, flag] of Object.entries(value)) {
      if ((key.startsWith("contains_") && flag !== false) || (key === "approved" && flag !== true)) invalid();
    }
  }

  // Publications are approved before reaching this contract. Projection removes
  // unrecognized structure; it does not certify the meaning of publication prose.
  function entry(value) {
    if (!object(value)) invalid();
    safety(value.safety);
    const id = text(value.id, 80, true);
    if (!/^[a-f\d]{16,80}$/i.test(id) || !KINDS.has(value.kind)) invalid();
    const result = { id, kind: value.kind, text: text(value.text, 16000, true), published_at: instant(value.published_at) };
    if (value.title !== undefined) result.title = text(value.title, 200);
    if (value.note !== undefined) result.note = text(value.note, 2400);
    return Object.freeze(result);
  }

  function calendar(value) {
    if (!object(value) || !Array.isArray(value.days) || value.days.length > 31) invalid();
    const year = integer(value.year, 9999);
    const month = integer(value.month, 12);
    if (year < 1900 || month < 1) invalid();
    const prefix = String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-";
    const seen = new Set();
    const days = value.days.map(day => {
      if (!object(day)) invalid();
      const publishedDate = date(day.date);
      if (!publishedDate.startsWith(prefix) || seen.has(publishedDate)) invalid();
      seen.add(publishedDate);
      return Object.freeze({ date: publishedDate, count: integer(day.count) });
    }).sort((a, b) => a.date.localeCompare(b.date));
    return Object.freeze({ year, month, days: Object.freeze(days) });
  }

  function presence(value) {
    if (!object(value)) invalid();
    const result = {};
    if (value.mode !== undefined) result.mode = text(value.mode, 80);
    if (value.is_sleeping !== undefined) {
      if (typeof value.is_sleeping !== "boolean") invalid();
      result.is_sleeping = value.is_sleeping;
    }
    for (const key of ["age_days", "total", "artifacts"]) if (value[key] !== undefined) result[key] = integer(value[key]);
    return Object.freeze(result);
  }

  function project(value) {
    if (!object(value) || value.schema !== SCHEMA || value.language !== "original") invalid();
    safety(value.safety);
    if (!Array.isArray(value.entries) || value.entries.length > 256 || !(value.current === null || object(value.current))) invalid();
    const seen = new Set();
    const entries = value.entries.map(item => {
      const projected = entry(item);
      if (seen.has(projected.id)) invalid();
      seen.add(projected.id);
      return projected;
    });
    const result = {
      schema: SCHEMA,
      published_at: instant(value.published_at),
      language: "original",
      current: value.current === null ? null : entry(value.current),
      entries: Object.freeze(entries),
      calendar: calendar(value.calendar),
    };
    if (value.presence !== undefined) result.presence = presence(value.presence);
    return Object.freeze(result);
  }

  async function request(url, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.min(60000, options.timeoutMs)) : 8000;
    if (typeof fetchImpl !== "function") throw new Error("Publication unavailable");
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Publication timed out")); }, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { method: "GET", credentials: "omit", headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Publication unavailable");
          return project(await response.json());
        })(),
        deadline,
      ]);
    } finally { clearTimeout(timer); }
  }

  function browserStorage() {
    try { return globalThis.localStorage; } catch { return null; }
  }
  function createStore(options = {}) {
    const storage = options.storage === undefined ? browserStorage() : options.storage;
    const cacheKey = options.cacheKey || CACHE_KEY;
    const listeners = new Set();
    const now = options.now || (() => new Date().toISOString());
    let current = Object.freeze({ feed: null, status: "missing", received_at: null, published_at: null, error: null });
    let pending = null;
    try {
      const cached = JSON.parse(storage?.getItem(cacheKey) || "null");
      if (object(cached) && cached.version === 1) {
        const feed = project(cached.feed);
        current = Object.freeze({ feed, status: "cached", received_at: instant(cached.received_at), published_at: feed.published_at, error: null });
      }
    } catch { /* An unreadable or incompatible cache is never reused. */ }

    function publish(snapshot) {
      current = Object.freeze(snapshot);
      for (const listener of listeners) { try { listener(current); } catch { /* A view cannot break transport. */ } }
      return current;
    }
    function refresh() {
      if (pending) return pending;
      pending = (async () => {
        try {
          const feed = await request(options.url || "/api/exhibition", options);
          const received_at = instant(now());
          try { storage?.setItem(cacheKey, JSON.stringify({ version: 1, feed, received_at })); } catch { /* Live publications survive storage denial. */ }
          return publish({ feed, status: "live", received_at, published_at: feed.published_at, error: null });
        } catch {
          return publish({ ...current, status: current.feed ? "cached" : "missing", error: "unavailable" });
        } finally { pending = null; }
      })();
      return pending;
    }
    return Object.freeze({
      read: () => current,
      refresh,
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("Listener must be a function");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
  }

  return Object.freeze({ SCHEMA, CACHE_KEY, project, request, createStore });
});
