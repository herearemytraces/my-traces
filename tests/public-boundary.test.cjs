const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const gateReady = import('../scripts/check-public.mjs');

async function hasCategory(sample, category) {
  const { checkText } = await gateReady;
  const findings = checkText(sample, 'synthetic-probe');
  assert.ok(findings.some(item => item.category === category));
  for (const item of findings) {
    assert.deepEqual(Object.keys(item).sort(), ['category', 'file', 'line']);
    assert.equal(item.file, 'synthetic-probe');
  }
}

test('public gate recognizes credential assignment without revealing matched values', async () => {
  await hasCategory(['pass', 'word="', 'a'.repeat(12), '"'].join(''), 'credential-assignment');
});

test('public gate recognizes environment credentials', async () => {
  await hasCategory(['ART_API_', 'KEY=', 'b'.repeat(30)].join(''), 'credential-environment');
});

test('public gate recognizes private key headers', async () => {
  await hasCategory(['-----BEGIN ', 'OPENSSH PRIVATE ', 'KEY-----'].join(''), 'private-key');
});

test('public gate recognizes access token patterns', async () => {
  await hasCategory('ghp_' + 'c'.repeat(30), 'credential-token');
});

test('public gate recognizes private ten-range addresses', async () => {
  await hasCategory(['10', '42', '0', '9'].join('.'), 'private-network-address');
});

test('public gate recognizes private one-ninety-two-range addresses', async () => {
  await hasCategory(['192', '168', '0', '4'].join('.'), 'private-network-address');
});

test('public gate recognizes only the private portion of the one-seventy-two range', async () => {
  await hasCategory(['172', '20', '0', '4'].join('.'), 'private-network-address');
  const { checkText } = await gateReady;
  assert.deepEqual(checkText(['172', '32', '0', '4'].join('.')), []);
});

test('public gate recognizes private IPv6 addresses', async () => {
  await hasCategory(['fd00', '', '4'].join(':'), 'private-network-address');
});

test('public gate recognizes deployment paths in either operating system', async () => {
  await hasCategory(['/', 'opt', '/', 'service'].join(''), 'deployment-path');
  await hasCategory(['C:', 'Users', 'person'].join(String.fromCharCode(92)), 'deployment-path');
});

test('public gate rejects arbitrary integration routes and unapproved origins', async () => {
  await hasCategory(['/api/', 'private-diagnostics'].join(''), 'nonexhibition-api-route');
  await hasCategory('https://' + ['engine', 'example', 'invalid'].join('.'), 'unapproved-public-origin');
  await hasCategory(['/api/exhibition', '/', 'private-diagnostics'].join(''), 'nonexhibition-api-route');
});

test('public gate recognizes credentials embedded in a URL', async () => {
  await hasCategory(['https://', 'name', ':', 'synthetic', '@', 'example.test'].join(''), 'credential-url');
});

test('neutral exhibition code and loopback preview URLs pass', async () => {
  const { checkText } = await gateReady;
  assert.deepEqual(checkText('fetch("/api/exhibition", { credentials: "omit" });'), []);
  assert.deepEqual(checkText(['http://', '127', '.', '0', '.', '0', '.', '1', ':4178/api/exhibition'].join('')), []);
  assert.deepEqual(checkText('const fixture = { unknown: { health: "synthetic extra field" } };'), []);
  assert.deepEqual(checkText('https://example.test/fixture'), []);
  assert.deepEqual(checkText('http://www.w3.org/2000/svg'), []);
  assert.deepEqual(checkText('http://www.sitemaps.org/schemas/sitemap/0.9'), []);
});

test('static fallback must contain only strictly projected fields', async () => {
  const { checkStaticSnapshot } = await gateReady;
  const fallback = JSON.parse(await readFile(resolve(__dirname, '../assets/fallback-snapshot.json'), 'utf8'));
  assert.deepEqual(checkStaticSnapshot(JSON.stringify(fallback)), []);
  const findings = checkStaticSnapshot(JSON.stringify({ ...fallback, extra: 'synthetic field' }));
  assert.ok(findings.some(item => item.category === 'unprojected-publication-fields'));
});

test('a captured publication cannot be committed as the static fallback', async () => {
  const { checkStaticSnapshot } = await gateReady;
  const fallback = JSON.parse(await readFile(resolve(__dirname, '../assets/fallback-snapshot.json'), 'utf8'));
  fallback.entries = [{ id: 'a'.repeat(16), kind: 'thought', text: 'Synthetic publication prose', published_at: fallback.published_at }];
  const findings = checkStaticSnapshot(JSON.stringify(fallback));
  assert.ok(findings.some(item => item.category === 'captured-static-publication'));
});
