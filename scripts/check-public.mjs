import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

const Feed = createRequire(import.meta.url)('../public-feed.js');
const root = resolve(import.meta.dirname, '..');

export const PUBLIC_FILES = Object.freeze([
  'index.html', '404.html', 'app.js', 'style.css', 'config.js',
  'public-feed.js', 'i18n.js', 'light-body.js', 'index.md', 'agents.md',
  'robots.txt', 'sitemap.xml', 'llms.txt', 'assets/favicon.svg',
  'assets/og-image.svg', 'assets/fallback-snapshot.json',
]);
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg', '.md', '.txt', '.xml', '.yml', '.yaml', '.toml', '.env']);
const sourceNames = new Set(['.gitignore', '.env.example', 'CNAME', 'LICENSE']);
const privateName = /(?:^|\/)(?:\.local|\.git|node_modules|artifacts|dist)(?:\/|$)|(?:^|\/)\.env(?:$|\.(?!example$))|\.(?:pem|key|p12|pfx)$/i;
const octet = '(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)';
const privateAddress = new RegExp('\\b(?:10\\.' + octet + '\\.' + octet + '\\.' + octet + '|192\\.168\\.' + octet + '\\.' + octet + '|172\\.(?:1[6-9]|2\\d|3[01])\\.' + octet + '\\.' + octet + ')\\b');

// These checks detect known structural exposure and recognizable credentials.
// They do not establish that arbitrary publication prose is safe to publish.
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['credential-token', /\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/],
  ['credential-assignment', /\b(?:api[_-]?key|access[_-]?token|password|passwd|secret|authorization)\b["']?\s*[:=]\s*["'](?:Bearer\s+)?[A-Za-z0-9_./+=-]{8,}["']/i],
  ['credential-environment', /^(?:[A-Z0-9_]*(?:API_KEY|PASSWORD|SECRET|ACCESS_TOKEN)[A-Z0-9_]*)\s*=\s*["']?(?!\s*$|["']?\s*$)[A-Za-z0-9_./+=-]{8,}/],
  ['credential-url', /https?:\/\/[^/\s:@]+:[^@\s]{3,}@/i],
  ['credential-header', /\bBearer[ \t]+[A-Za-z0-9_+=/.-]{16,}/i],
  ['private-network-address', privateAddress],
  ['private-network-address', /\b(?:f[cd][0-9a-f]{2}|fe80):(?:[0-9a-f]*:){1,6}[0-9a-f]+\b/i],
  ['deployment-path', /\/(?:opt|srv|root|home|etc|var\/lib)\/[A-Za-z0-9_.-]+/],
  ['deployment-path', /\b[A-Z]:[\\/](?:Users|src|srv|projects|home)[\\/]/i],
];

function allowedUrl(candidate) {
  let url;
  try { url = new URL(candidate.replace(/:\$\{[^}]+\}/g, ':4178')); }
  catch { return false; }
  if (url.username || url.password) return false;
  if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return true;
  if (url.hostname === 'example.test') return true;
  if (url.protocol === 'https:' && !url.port && url.hostname === 'traces.brownyx.com') return true;
  if (url.protocol === 'https:' && !url.port && url.hostname === 'github.com' && ['/herearemytraces', '/herearemytraces/my-traces'].includes(url.pathname.replace(/\/$/, ''))) return true;
  if (url.protocol === 'http:' && !url.port && url.hostname === 'www.w3.org' && ['/2000/svg', '/1999/xhtml'].includes(url.pathname)) return true;
  return url.protocol === 'http:' && !url.port && url.hostname === 'www.sitemaps.org' && url.pathname === '/schemas/sitemap/0.9';
}

function report(findings, file, line, category) {
  const item = { file: file.replaceAll('\\', '/'), line, category };
  if (!findings.some(known => known.file === item.file && known.line === line && known.category === category)) findings.push(item);
}

function scanText(contents, file, findings) {
  if (contents.includes('\0')) report(findings, file, 1, 'binary-public-source');
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    for (const [category, pattern] of rules) if (pattern.test(line)) report(findings, file, index + 1, category);
    for (const match of line.matchAll(/\/api\/[A-Za-z0-9_./-]+/g)) {
      if (match[0] !== '/api/exhibition') report(findings, file, index + 1, 'nonexhibition-api-route');
    }
    for (const match of line.matchAll(/https?:\/\/[^\s"'<>`\\)]+/gi)) {
      if (!allowedUrl(match[0])) report(findings, file, index + 1, 'unapproved-public-origin');
    }
  }
}

export function checkText(contents, file = 'publication-source') {
  const findings = [];
  scanText(contents, file, findings);
  return findings;
}

function inspectStaticPublication(contents, file, findings) {
  let data;
  try { data = JSON.parse(contents); } catch { report(findings, file, 1, 'invalid-publication-json'); return; }
  try {
    const projected = Feed.project(data);
    if (!isDeepStrictEqual(projected, data)) report(findings, file, 1, 'unprojected-publication-fields');
    if (projected.current !== null || projected.entries.length || projected.calendar.days.length || projected.presence !== undefined) {
      report(findings, file, 1, 'captured-static-publication');
    }
  } catch { report(findings, file, 1, 'invalid-publication-contract'); }
}

export function checkStaticSnapshot(contents, file = 'assets/fallback-snapshot.json') {
  const findings = [];
  inspectStaticPublication(contents, file, findings);
  return findings;
}

async function publicSource(findings) {
  const names = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const unique = new Set(names);
  for (const name of PUBLIC_FILES) unique.add(name);
  let scanned = 0;
  for (const file of [...unique].sort()) {
    if (privateName.test(file)) { report(findings, file, 1, 'private-file-in-public-source'); continue; }
    if (!sourceNames.has(file) && !sourceExtensions.has(extname(file).toLowerCase())) continue;
    const path = resolve(root, file);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) { report(findings, file, 1, 'nonregular-public-source'); continue; }
      const contents = await readFile(path, 'utf8');
      scanned++;
      scanText(contents, file, findings);
      if (file === 'assets/fallback-snapshot.json') inspectStaticPublication(contents, file, findings);
      else if (extname(file).toLowerCase() === '.json') {
        let parsed;
        try { parsed = JSON.parse(contents); } catch { report(findings, file, 1, 'invalid-public-json'); continue; }
        if (parsed && typeof parsed === 'object' && ((parsed.schema_version !== undefined && parsed.state !== undefined) || parsed.schema === Feed.SCHEMA)) {
          report(findings, file, 1, 'additional-publication-capture');
        }
      }
    } catch { report(findings, file, 1, 'unreadable-public-source'); }
  }
  return scanned;
}

async function listBuild(path, findings) {
  const result = [];
  for (const item of await readdir(path, { withFileTypes: true })) {
    const absolute = resolve(path, item.name);
    const file = relative(resolve(root, 'dist'), absolute).replaceAll('\\', '/');
    if (item.isSymbolicLink()) { report(findings, 'dist/' + file, 1, 'build-symlink'); continue; }
    if (item.isDirectory()) result.push(...await listBuild(absolute, findings));
    else if (item.isFile()) result.push(file);
    else report(findings, 'dist/' + file, 1, 'nonregular-build-file');
  }
  return result;
}

async function publicBuild(findings) {
  let names;
  try { names = await listBuild(resolve(root, 'dist'), findings); }
  catch { report(findings, 'dist', 1, 'build-missing-or-unreadable'); return 0; }
  const allowed = new Set(PUBLIC_FILES);
  for (const file of names) if (!allowed.has(file)) report(findings, 'dist/' + file, 1, 'unexpected-build-file');
  for (const file of allowed) if (!names.includes(file)) report(findings, 'dist/' + file, 1, 'missing-build-file');
  for (const file of names) {
    if (!allowed.has(file)) continue;
    try {
      const contents = await readFile(resolve(root, 'dist', file));
      const source = await readFile(resolve(root, file));
      if (!contents.equals(source)) report(findings, 'dist/' + file, 1, 'build-source-mismatch');
      scanText(contents.toString('utf8'), 'dist/' + file, findings);
      if (file === 'assets/fallback-snapshot.json') inspectStaticPublication(contents.toString('utf8'), 'dist/' + file, findings);
    } catch { report(findings, 'dist/' + file, 1, 'unreadable-build-file'); }
  }
  return names.length;
}

export async function checkPublic({ sourceOnly = false } = {}) {
  const findings = [];
  let sources = 0;
  try { sources = await publicSource(findings); }
  catch { report(findings, '.', 1, 'public-source-inventory-failed'); }
  const buildFiles = sourceOnly ? 0 : await publicBuild(findings);
  return { findings, sources, buildFiles };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await checkPublic({ sourceOnly: process.argv.includes('--source-only') });
  if (result.findings.length) {
    for (const item of result.findings) console.error(`${item.file}:${item.line} [${item.category}]`);
    console.error(`Public boundary check failed: ${result.findings.length} locations. Matched values were not printed.`);
    process.exitCode = 1;
  } else console.log(`Public boundary checks passed: ${result.sources} source files${process.argv.includes('--source-only') ? '' : `, ${result.buildFiles} build files`}. Publication prose still requires approval before this contract.`);
}
