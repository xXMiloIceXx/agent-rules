#!/usr/bin/env node
/**
 * rules-sync — vendor this repository's portable rules into a consuming project.
 *
 * The portable set is `.agents/rules/*.md` in THIS repository, plus this script itself,
 * because a consuming project's CI must be able to run `check` without a copy of the base.
 *
 * A consuming project receives copies of those files (each stamped with a GENERATED marker)
 * plus `.agents/rules.lock.json` recording the base revision and a sha256 per vendored file.
 * Anything in the project that the base does not own is project-owned and never touched.
 *
 * Usage
 *   node bin/rules-sync.mjs sync  --into <projectDir> [--force] [--dry-run]
 *   node .agents/bin/rules-sync.mjs check [--project <projectDir>]
 *
 * `sync` needs this repository, so it refuses to run from a vendored copy. `check` deliberately
 * does not need it: it verifies the vendored files against the project's own lock, which is
 * enough to catch a hand-edit, a deletion, or a partial sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const BASE_ROOT = path.resolve(path.dirname(SELF), '..');
const BASE_RULES = path.join(BASE_ROOT, '.agents', 'rules');

const RULES_DIR = path.join('.agents', 'rules');
const TOOL_DIR = path.join('.agents', 'bin');
const TOOL_NAME = 'rules-sync.mjs';
const LOCK_NAME = path.join('.agents', 'rules.lock.json');
const MD_MARK = '<!-- GENERATED';
const JS_MARK = '// GENERATED';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

function baseRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: BASE_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

/** Markdown: the marker goes AFTER the YAML frontmatter, so the frontmatter stays first
 *  and Antigravity still parses it as an activation trigger. */
function stampMarkdown(body, revision, relFrom) {
  const marker =
    `${MD_MARK} FILE — do not edit.\n` +
    `     Source: agent-rules@${revision} · ${relFrom}\n` +
    `     Edit the source and re-run: node .agents/bin/${TOOL_NAME} sync --into <this project> -->\n`;
  const fm = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return fm ? body.slice(0, fm[0].length) + marker + body.slice(fm[0].length) : marker + body;
}

/** JavaScript: the marker goes after any shebang, and uses line comments. An HTML comment
 *  would be a syntax error here. */
function stampJs(body, revision, relFrom) {
  const marker =
    `${JS_MARK} FILE — do not edit.\n` +
    `//     Source: agent-rules@${revision} · ${relFrom}\n` +
    `//     This copy exists so a consuming project's CI can run \`check\` without the base.\n` +
    `//     Edit the source in the agent-rules repository and re-run sync.`;
  const shebang = body.match(/^#![^\n]*\n/);
  return shebang ? shebang[0] + marker + '\n' + body.slice(shebang[0].length) : marker + '\n' + body;
}

const stripMark = (body) =>
  body.replace(/^<!-- GENERATED[\s\S]*?-->\r?\n?/m, '').replace(/^(\s*\/\/ GENERATED[\s\S]*?\n)(?:\/\/[^\n]*\n)*/m, (m) => (m.match(/^#![^\n]*\n/) ? m.match(/^#![^\n]*\n/)[0] : ''));

function plan() {
  if (!fs.existsSync(BASE_RULES)) {
    console.error(
      'error: this looks like a vendored copy of rules-sync.\n' +
      `       ${BASE_RULES} does not exist, so there are no rules to sync.\n` +
      '       Run `sync` from the agent-rules repository instead; `check` works here.'
    );
    process.exit(2);
  }
  const items = fs.readdirSync(BASE_RULES).filter((f) => f.endsWith('.md')).sort()
    .map((name) => ({
      rel: posix(path.join(RULES_DIR, name)),
      source: path.join(BASE_RULES, name),
      stamp: stampMarkdown,
    }));
  items.push({
    rel: posix(path.join(TOOL_DIR, TOOL_NAME)),
    source: SELF,
    stamp: stampJs,
  });
  return items;
}

function loadLock(project) {
  const p = path.join(project, LOCK_NAME);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function cmdSync(argv) {
  const i = argv.indexOf('--into');
  if (i === -1 || !argv[i + 1]) { console.error('usage: rules-sync sync --into <projectDir> [--force] [--dry-run]'); process.exit(2); }
  const project = path.resolve(argv[i + 1]);
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');

  if (!fs.existsSync(path.join(project, '.git'))) {
    console.error(`error: ${project} is not a git repository root (no .git). Refusing to guess.`);
    process.exit(2);
  }

  const revision = baseRevision();
  const existingLock = loadLock(project);
  const items = plan();
  const lockFiles = {};
  const written = [], unchanged = [], conflicts = [];

  for (const item of items) {
    const relFrom = item.source === SELF ? `bin/${TOOL_NAME}` : posix(path.relative(BASE_ROOT, item.source));
    const rendered = item.stamp(stripMark(fs.readFileSync(item.source, 'utf8')), revision, relFrom);
    const out = path.join(project, item.rel);
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    const owned = current !== null && (
      current.includes(MD_MARK) || current.includes(JS_MARK) ||
      (existingLock?.files?.[item.rel] && sha256(Buffer.from(current)) === existingLock.files[item.rel])
    );
    if (current !== null && !owned && !force) { conflicts.push(item.rel); continue; }
    lockFiles[item.rel] = sha256(Buffer.from(rendered));
    if (current === rendered) { unchanged.push(item.rel); continue; }
    written.push(item.rel);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, rendered, 'utf8');
    }
  }

  const owned = new Set(Object.keys(lockFiles));
  const projectOwned = items.length && fs.existsSync(path.join(project, RULES_DIR))
    ? fs.readdirSync(path.join(project, RULES_DIR)).filter((f) => f.endsWith('.md') && !owned.has(posix(path.join(RULES_DIR, f)))).sort()
    : [];

  console.log(`base    : ${BASE_ROOT}  (${revision})`);
  console.log(`project : ${project}`);
  console.log(`mode    : ${dryRun ? 'dry-run' : 'write'}${force ? ' +force' : ''}\n`);
  const show = (label, arr) => { if (arr.length) console.log(`${label} (${arr.length}):\n  ${arr.join('\n  ')}\n`); };
  show(dryRun ? 'would write' : 'written', written);
  show('already up to date', unchanged);
  show('project-owned (left alone)', projectOwned);
  show('CONFLICT — same name, not previously vendored (use --force to replace)', conflicts);

  if (conflicts.length) { console.log('Refusing to write anything: resolve the conflicts above first.'); process.exit(1); }
  if (!dryRun) {
    fs.writeFileSync(path.join(project, LOCK_NAME),
      JSON.stringify({ base: 'agent-rules', revision, syncedAt: new Date().toISOString(), files: lockFiles }, null, 2) + '\n', 'utf8');
  }
  console.log(`ok — ${items.length} file(s) accounted for.`);
}

function cmdCheck(argv) {
  const i = argv.indexOf('--project');
  const project = i === -1 ? process.cwd() : path.resolve(argv[i + 1]);
  const lock = loadLock(project);
  if (!lock) { console.error(`no ${LOCK_NAME} in ${project} — this project has no vendored rules.`); process.exit(2); }
  const entries = Object.entries(lock.files ?? {});
  const problems = [];
  for (const [rel, expected] of entries) {
    const file = path.join(project, rel);
    if (!fs.existsSync(file)) { problems.push(`MISSING   ${rel}`); continue; }
    const actual = sha256(fs.readFileSync(file));
    if (actual !== expected) problems.push(`MODIFIED  ${rel}  (${actual.slice(0, 12)} != lock ${expected.slice(0, 12)})`);
  }
  console.log(`project : ${project}`);
  console.log(`vendored: agent-rules@${lock.revision ?? '?'} · ${entries.length} file(s)`);
  if (problems.length) {
    console.log('\n' + problems.map((p) => '  ' + p).join('\n'));
    console.log('\nVendored files are generated. Edit the source in the agent-rules repository and re-run sync.');
    process.exit(1);
  }
  console.log('ok — every vendored file matches the lock.');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'sync') cmdSync(rest);
else if (cmd === 'check') cmdCheck(rest);
else { console.error('usage:\n  rules-sync sync  --into <projectDir> [--force] [--dry-run]\n  rules-sync check [--project <projectDir>]'); process.exit(2); }
