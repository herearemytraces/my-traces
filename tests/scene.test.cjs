const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Feed = require("../public-feed.js");
const Copy = require("../i18n.js");

const PUBLISHED = "2026-10-05T08:00:00.000Z";
const RECEIVED = "2026-10-05T09:00:00.000Z";
const prose = {
  title: "An untouched <em>title</em> & \"quotation\"",
  text: "An original thought: <script>example()</script>\n中文原文 & 'unchanged words'.",
  note: "An original note\nwith <img src=x onerror=example()>.",
};
const item = () => ({ id: "a0123456789abcde", kind: "thought", ...prose, published_at: PUBLISHED });
const payload = () => ({
  schema: Feed.SCHEMA,
  language: "original",
  published_at: PUBLISHED,
  current: item(),
  entries: [item()],
  calendar: { year: 2026, month: 10, days: [{ date: "2026-10-05", count: 1 }] },
  presence: { mode: "reflecting<&\"'", is_sleeping: false, age_days: 18, total: 2810, artifacts: 2 },
});
const memory = initial => {
  const contents = new Map(Object.entries(initial || {}));
  return { getItem: key => contents.get(key) ?? null, setItem: (key, value) => contents.set(key, value), contents };
};
const response = value => ({ ok: true, json: async () => value });

// Execute the actual view helpers before browser event wiring. These string sinks
// collect render output; they do not emulate layout, native dialogs or a browser.
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const wiring = source.indexOf("root.addEventListener(");
assert.ok(wiring > 0, "view helpers must precede browser event wiring");
function scene(language, publication, options = {}) {
  const storage = options.storage || memory({
    [Feed.CACHE_KEY]: JSON.stringify({ version: 1, feed: publication, received_at: RECEIVED }),
  });
  const sinks = new Map();
  function sink(selector) {
    if (!sinks.has(selector)) sinks.set(selector, {
      innerHTML: "", textContent: "", dataset: {}, offsetWidth: 0,
      classList: { add() {}, remove() {} },
      querySelector: child => sink(selector + " " + child),
    });
    return sinks.get(selector);
  }
  const window = { TracesCopy: Copy, localStorage: storage };
  const context = vm.createContext({
    window,
    document: { hidden: false, querySelector: selector => selector === "#app-root" ? { querySelector: sink } : null },
    location: { search: "?lang=" + language, pathname: "/", hash: "#/art", origin: "https://example.test" },
    TracesFeed: Feed,
    Intl, URL, URLSearchParams,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  });
  vm.runInContext(source.slice(0, wiring), context, { filename: "app.js" });
  return {
    context, storage,
    evaluate: expression => vm.runInContext(expression, context),
    render() { vm.runInContext("render()", context); },
    zone: name => sink(`[data-zone="${name}"] .zone-content`).innerHTML,
    markup: () => [...sinks.values()].map(value => value.innerHTML + value.textContent).join("\n"),
  };
}
function decodePresentation(value) {
  return value.replace(/<br>/g, "\n").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function content(html, expression) {
  const match = html.match(expression);
  assert.ok(match, "expected publication text container");
  return decodePresentation(match[1]);
}

test("only English and Chinese interfaces exist, and absence describes what is on view", () => {
  assert.deepEqual(Object.keys(Copy).sort(), ["en", "zh"]);
  assert.deepEqual(Object.keys(Copy.en).sort(), Object.keys(Copy.zh).sort());
  for (const key of ["emptyCurrent", "emptyGeneric", "emptySelf", "emptyQuestion", "emptyDream", "emptyArtifact", "emptyMemory", "emptyRestraint", "emptyHypothesis", "emptyContradiction", "emptyWorld", "noDay", "calendarUnknown"]) {
    assert.match(Copy.en[key], /on view/, key);
    assert.match(Copy.zh[key], /此版本中未展示/, key);
  }
});

for (const language of ["en", "zh"]) {
  test(`${language} scene and reading preserve original prose while escaping source markup`, () => {
    const view = scene(language, payload());
    const article = view.evaluate("article(observation.feed.current)");
    const fragment = view.evaluate("fragment(observation.feed.current, 'current', true)");
    assert.equal(content(article, /<h3>([\s\S]*?)<\/h3>/), prose.title);
    assert.equal(content(article, /class="reading-text">([\s\S]*?)<\/p>/), prose.text);
    assert.equal(content(article, /class="secondary">([\s\S]*?)<\/p>/), prose.note);
    assert.equal(content(fragment, /class="entry-title clamp">([\s\S]*?)<\/p>/), prose.title);
    assert.equal(content(fragment, /class="current-text clamp">([\s\S]*?)<\/p>/), prose.text);
    assert.equal(content(fragment, /class="secondary clamp">([\s\S]*?)<\/p>/), prose.note);
    assert.doesNotMatch(article + fragment, /<(?:script|img|em)\b/i);
    assert.match(article, /&lt;script&gt;/);
    assert.match(article, /&lt;img /);
    assert.equal(view.evaluate("observation.feed.current.text"), prose.text);
  });

  test(`${language} presence keeps original mode and boolean values rather than translating them`, () => {
    for (const is_sleeping of [false, true]) {
      const publication = payload();
      publication.presence.is_sleeping = is_sleeping;
      const view = scene(language, publication);
      view.render();
      const cells = [...view.zone("presence").matchAll(/<dd\b([^>]*)>([\s\S]*?)<\/dd>/g)];
      const values = cells.map(match => decodePresentation(match[2]));
      assert.equal(values[0], publication.presence.mode);
      assert.equal(values.at(-1), String(is_sleeping));
      for (const [index, cell] of cells.entries()) {
        const title = cell[1].match(/\btitle="([^"]*)"/);
        assert.ok(title, "each presence value exposes its complete original in the title attribute");
        assert.equal(decodePresentation(title[1]), values[index]);
      }
      assert.match(cells[0][1], /&lt;&amp;&quot;&#39;/);
      assert.doesNotMatch(view.zone("presence"), /<dd\b[^>]*>reflecting</);
      assert.equal(view.evaluate("observation.feed.presence.is_sleeping"), is_sleeping);
    }
  });
}

test("unrecognized source structures reach neither view helpers nor newly written browser cache", async () => {
  const publication = payload();
  publication.extra = { text: "UNSELECTED_TOP" };
  publication.current.extra = { text: "UNSELECTED_CURRENT" };
  publication.entries[0].extra = { text: "UNSELECTED_ENTRY" };
  publication.presence.extra = "UNSELECTED_PRESENCE";
  publication.calendar.extra = "UNSELECTED_CALENDAR";
  publication.calendar.days[0].extra = "UNSELECTED_DAY";
  const storage = memory();
  const transport = Feed.createStore({ storage, fetchImpl: async () => response(publication), now: () => RECEIVED });
  await transport.refresh();
  assert.doesNotMatch(storage.getItem(Feed.CACHE_KEY), /UNSELECTED_/);
  for (const language of ["en", "zh"]) {
    const view = scene(language, null, { storage });
    view.render();
    const article = view.evaluate("article(observation.feed.current)");
    assert.doesNotMatch(view.markup() + article + view.evaluate("JSON.stringify(observation.feed)"), /UNSELECTED_/);
    assert.equal(content(article, /class="reading-text">([\s\S]*?)<\/p>/), prose.text);
  }
});

test("unsupported publication kinds cannot replace or appear beside an approved cached edition", async () => {
  const storage = memory();
  let publication = payload();
  const transport = Feed.createStore({ storage, fetchImpl: async () => response(publication), now: () => RECEIVED });
  await transport.refresh();
  publication = payload();
  publication.entries.push({ ...item(), id: "b0123456789abcde", kind: "unsupported-kind", text: "UNSELECTED_UNSUPPORTED_KIND" });
  const failed = await transport.refresh();
  assert.equal(failed.status, "cached");
  assert.equal(failed.feed.entries.length, 1);
  assert.doesNotMatch(storage.getItem(Feed.CACHE_KEY), /UNSELECTED_|unsupported-kind/);
  const view = scene("zh", null, { storage });
  view.render();
  assert.doesNotMatch(view.markup(), /UNSELECTED_|unsupported-kind/);
});

test("an absent current fragment is not reconstructed from an older archive entry", () => {
  const publication = payload();
  publication.current = null;
  for (const language of ["en", "zh"]) {
    const view = scene(language, publication);
    view.render();
    assert.match(view.zone("current"), /class="absence clamp"/);
    assert.ok(view.zone("current").includes(Copy[language].emptyCurrent));
    assert.doesNotMatch(view.zone("current"), /An original thought/);
    assert.match(view.zone("stream"), /An original thought/);
  }
});

test("offline editions report unknown changes rather than a fabricated zero", () => {
  const storage = memory({
    [Feed.CACHE_KEY]: JSON.stringify({ version: 1, feed: payload(), received_at: RECEIVED }),
    "traces.observation.v2": JSON.stringify({ at: "2026-10-04T09:00:00.000Z", total: 2810 }),
  });
  for (const language of ["en", "zh"]) {
    const view = scene(language, null, { storage });
    assert.equal(view.evaluate("returnNote()"), Copy[language].unknownChanges);
  }
});
