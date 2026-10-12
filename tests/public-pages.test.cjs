const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Pages = require('../public-pages.js');
const { renderPublicPage, generatePublicPages } = require('../scripts/generate-public-pages.mjs');
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

test('sitemap contains only the chosen public canonical pages', async () => {
  const sitemap = await fs.readFile(path.join(__dirname, '../sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locations, Pages.map(page => new URL(page.path, locations[0]).href));
  assert.doesNotMatch(sitemap, /\?lang=|\/api\/|\.md<|\.txt<|\.json</i);
});

test('each public page has its own indexable metadata and canonical path', async () => {
  const template = await fs.readFile(path.join(__dirname, '../index.html'), 'utf8');
  const titles = new Set();
  for (const page of Pages) {
    const html = renderPublicPage(template, page);
    const canonical = new URL(page.path, 'https://' + ['traces','brownyx','com'].join('.')).href;
    assert.match(html, /<meta name="robots" content="index,follow"\s*\/>/);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}" />`));
    assert.ok(html.includes(`<title>${escapeHtml(page.title)}</title>`));
    assert.ok(html.includes(`<h1>${escapeHtml(page.title)}</h1>`));
    assert.doesNotMatch(html, /noindex|hreflang=/i);
    titles.add(page.title);
  }
  assert.equal(titles.size, Pages.length);
});

test('static package creates canonical route files and keeps /art as a homepage alias', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'traces-pages-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  await fs.copyFile(path.join(__dirname, '../index.html'), path.join(temporary, 'index.html'));
  const outputs = await generatePublicPages(temporary);
  assert.equal(outputs.length, Pages.length + 1);
  for (const page of Pages.slice(1)) {
    const file = path.join(temporary, page.path.slice(1), 'index.html');
    const html = await fs.readFile(file, 'utf8');
    assert.ok(html.includes(`href="${new URL(page.path, aliasOrigin(outputs))}"`));
  }
  const alias = await fs.readFile(path.join(temporary, 'art/index.html'), 'utf8');
  assert.ok(alias.includes(`href="${aliasOrigin(outputs)}"`));
});

function aliasOrigin() {
  return 'https://' + ['traces','brownyx','com'].join('.') + '/';
}

test('machine-readable files remain discoverable through the server header policy', async () => {
  const headers = await fs.readFile(path.join(__dirname, '../_headers'), 'utf8');
  for (const route of ['/api/*', '/*.md', '/*.txt', '/*.json', '/*.xml', '/.well-known/*']) assert.ok(headers.includes(route));
  assert.match(headers, /X-Robots-Tag: noindex, follow/);
});
