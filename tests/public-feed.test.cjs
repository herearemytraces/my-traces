const test = require("node:test");
const assert = require("node:assert/strict");
const Feed = require("../public-feed.js");

const PUBLISHED = "2026-10-05T08:00:00.000Z";
const RECEIVED = "2026-10-05T09:00:00.000Z";
const item = () => ({ id: "a0123456789abcde", kind: "thought", text: "An original thought.\nPreserve its words.", published_at: PUBLISHED });
const payload = () => ({ schema: Feed.SCHEMA, language: "original", published_at: PUBLISHED, current: item(), entries: [item()], calendar: { year: 2026, month: 10, days: [{ date: "2026-10-05", count: 1 }] }, presence: { mode: "reflecting", is_sleeping: false, age_days: 18, total: 2810, artifacts: 2 } });
const response = value => ({ ok: true, json: async () => value });
const memory = initial => {
  const contents = new Map(Object.entries(initial || {}));
  return { contents, getItem: key => contents.get(key) ?? null, setItem: (key, value) => contents.set(key, value) };
};

test("projection preserves original publication prose and parameter values", () => {
  assert.deepEqual(Feed.project(payload()), payload());
  assert.equal(Feed.project(payload()).current.text, item().text);
  assert.equal(Object.isFrozen(Feed.project(payload()).entries), true);
});

test("projection drops arbitrary nested structures before rendering or caching", async () => {
  const data = payload();
  data.health = { opaque: "EXTRA_TOP" };
  data.current.extra = { opaque: "EXTRA_CURRENT" };
  data.entries[0].extra = { opaque: "EXTRA_ENTRY" };
  data.calendar.days[0].extra = "EXTRA_DAY";
  data.presence.extra = "EXTRA_PRESENCE";
  data.notice = "EXTRA_NOTICE";
  const storage = memory();
  const store = Feed.createStore({ storage, fetchImpl: async () => response(data), now: () => RECEIVED });
  const state = await store.refresh();
  assert.equal(state.status, "live");
  assert.doesNotMatch(JSON.stringify(state), /EXTRA_/);
  assert.doesNotMatch(storage.getItem(Feed.CACHE_KEY), /EXTRA_/);
});

test("raw source snapshots and an incompatible contract are rejected", () => {
  assert.throws(() => Feed.project({ schema_version: 3, state: {}, feed: { items: [] } }));
  assert.throws(() => Feed.project({ ...payload(), schema: "traces.exhibition.v2" }));
  assert.throws(() => Feed.project({ ...payload(), language: "translated" }));
});

test("unsafe optional flags reject whole publications and individual entries", () => {
  assert.throws(() => Feed.project({ ...payload(), safety: { contains_restricted: true } }));
  assert.throws(() => Feed.project({ ...payload(), safety: { approved: false } }));
  const data = payload();
  data.entries[0].safety = { contains_restricted: true };
  assert.throws(() => Feed.project(data));
  assert.deepEqual(Feed.project({ ...payload(), safety: { approved: true, contains_restricted: false } }), payload());
});

test("real dates, calendar month boundaries, and publication timestamps are validated", () => {
  for (const published_at of ["yesterday", "2026-02-30T08:00:00.000Z", "2026-10-05T25:00:00Z", "2026-10-05T08:00:00+03:00"]) {
    assert.throws(() => Feed.project({ ...payload(), published_at }));
  }
  const data = payload();
  data.calendar.days[0].date = "2026-11-05";
  assert.throws(() => Feed.project(data));
  data.calendar.days[0].date = "2026-10-32";
  assert.throws(() => Feed.project(data));
});

test("published absence is retained even when the archive has entries", () => {
  const data = payload();
  data.current = null;
  const projected = Feed.project(data);
  assert.equal(projected.current, null);
  assert.equal(projected.entries.length, 1);
});

test("unbounded prose, incompatible IDs, and duplicate archive IDs are rejected", () => {
  const data = payload();
  data.current.text = "x".repeat(16001);
  assert.throws(() => Feed.project(data));
  data.current = { ...item(), id: "filesystem-like-id" };
  assert.throws(() => Feed.project(data));
  data.current = item();
  data.entries.push(item());
  assert.throws(() => Feed.project(data));
});

test("original parameters have strict scalar bounds", () => {
  for (const presence of [{ total: -1 }, { artifacts: 1.5 }, { is_sleeping: "false" }, { mode: "x".repeat(81) }]) {
    assert.throws(() => Feed.project({ ...payload(), presence }));
  }
});

test("denied storage cannot discard a successful live publication", async () => {
  const storage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const store = Feed.createStore({ storage, fetchImpl: async () => response(payload()), now: () => RECEIVED });
  assert.equal(store.read().status, "missing");
  const result = await store.refresh();
  assert.equal(result.status, "live");
  assert.equal(result.received_at, RECEIVED);
  assert.equal(result.published_at, PUBLISHED);
});

test("transport failure retains cached source and receipt dates", async () => {
  const storage = memory({ [Feed.CACHE_KEY]: JSON.stringify({ version: 1, feed: payload(), received_at: RECEIVED }) });
  const store = Feed.createStore({ storage, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(store.read().status, "cached");
  const result = await store.refresh();
  assert.equal(result.status, "cached");
  assert.equal(result.error, "unavailable");
  assert.equal(result.received_at, RECEIVED);
  assert.equal(result.published_at, PUBLISHED);
});

test("invalid new payload cannot replace the last valid publication", async () => {
  let live = payload();
  const store = Feed.createStore({ storage: memory(), fetchImpl: async () => response(live), now: () => RECEIVED });
  await store.refresh();
  live = { schema_version: 3, state: { current: "extra" } };
  const result = await store.refresh();
  assert.equal(result.status, "cached");
  assert.deepEqual(result.feed, payload());
});

test("older raw caches and incompatible new caches are never reused", () => {
  const old = memory({ "traces.snapshot.v1": JSON.stringify({ state: { raw: "extra" } }) });
  assert.equal(Feed.createStore({ storage: old }).read().feed, null);
  const incompatible = memory({ [Feed.CACHE_KEY]: JSON.stringify({ version: 1, feed: { schema_version: 3 }, received_at: RECEIVED }) });
  assert.equal(Feed.createStore({ storage: incompatible }).read().feed, null);
});

test("the deadline bounds a fetch that ignores abort", async () => {
  let signal;
  const before = Date.now();
  await assert.rejects(Feed.request("/api/exhibition", { timeoutMs: 10, fetchImpl: (_url, options) => { signal = options.signal; return new Promise(() => {}); } }), /timed out/);
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - before < 1000);
});

test("the deadline also bounds a stalled JSON body", async () => {
  await assert.rejects(Feed.request("/api/exhibition", { timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), /timed out/);
});

test("concurrent refreshes share one request and subscriptions tolerate view errors", async () => {
  let resolve;
  let count = 0;
  const store = Feed.createStore({ storage: null, now: () => RECEIVED, fetchImpl: () => { count++; return new Promise(done => { resolve = done; }); } });
  let notices = 0;
  const remove = store.subscribe(() => { notices++; });
  store.subscribe(() => { throw new Error("view error"); });
  const first = store.refresh();
  const second = store.refresh();
  assert.equal(first, second);
  assert.equal(count, 1);
  resolve(response(payload()));
  assert.equal((await first).status, "live");
  assert.equal(notices, 1);
  remove();
});
