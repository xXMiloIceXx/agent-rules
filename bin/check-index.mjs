#!/usr/bin/env node
/**
 * check-index — every rule file must be reachable from AGENTS.md.
 *
 * This exists because it was violated once. A rule file that nothing routes to is a dead rule:
 * it is never read, so it cannot help, and it silently drifts out of sync with the rules that are
 * read. Rewriting an index dropped eight files' routes in one commit and nothing noticed.
 *
 * Reachability is transitive: AGENTS.md is the root, and every `.md` a reached file mentions is
 * itself reached. Skills under `.agents/skills/` are excluded — the harness discovers those from
 * its own catalogue rather than from the index — and so is retired material under
 * `.agents/legacy/`, which is kept as reference but deliberately not read as rules.
 *
 * Other harness entry points (`CLAUDE.md`, `.cursorrules`, `.geminirules`, …) are reported when
 * they exist and do not mention the index. That report is advisory: another tool may legitimately
 * own such a file, so it never fails the build.
 *
 * This script is vendored into every project by rules-sync and needs no copy of the base.
 *
 * Usage: node .agents/bin/check-index.mjs [--project <dir>]
 */

import fs from 'node:fs';
import path from 'node:path';

const i = process.argv.indexOf('--project');
const ROOT = path.resolve(i === -1 ? process.cwd() : process.argv[i + 1]);
process.chdir(ROOT);

const rel = (p) => p.split(path.sep).join('/');

/**
 * The index is the root `AGENTS.md` unless the project's own lock names another path.
 *
 * `local` mode writes the index to `.agents/AGENTS.md` when the root file belongs to another tool,
 * and records that in the lock — so this script finds it without being told. That matters because
 * CI runs this command with no arguments at all.
 */
function resolveIndex() {
  const flag = process.argv.indexOf('--index');
  if (flag !== -1 && process.argv[flag + 1]) return rel(process.argv[flag + 1]);
  try {
    const lock = JSON.parse(fs.readFileSync('.agents/rules.lock.json', 'utf8'));
    if (typeof lock.index === 'string' && lock.index) return lock.index;
  } catch { /* no lock: fall back to the convention */ }
  return 'AGENTS.md';
}

const INDEX = resolveIndex();
const SEARCH_DIRS = ['.agents/rules', '.agents/shared'];
const SKILLS = '.agents/skills';
/** Retired material: kept in the repository as reference, deliberately not read as rules. */
const LEGACY = '.agents/legacy';
/** Project history, not rules: read when a lesson is promoted, never routed as a rule. */
const JOURNAL = '.agents/journal';
/** Entry points other tools look for. Only the ones that exist are checked. */
const POINTERS = ['.agents/AGENTS.md', '.agents/claude/CLAUDE.md', '.agents/codex/AGENTS.md'];
/**
 * Files that are not the index but still steer an agent. A stale one — one that does not mention
 * the index — is how two rule sets end up active at once. Reported, never fatal: a project may
 * legitimately keep another harness's file for something else.
 */
const ENTRY_POINTS = [
  'CLAUDE.md', 'GEMINI.md', '.geminirules', '.cursorrules', '.windsurfrules',
  '.claude/CLAUDE.md', '.github/copilot-instructions.md',
];
/**
 * Markers belonging to another tool. A file carrying one is not stale — it is someone else's, and
 * reporting it as stale on every run is how a real warning gets ignored. Laravel Boost replaces
 * only its first block, in place, so this file is reported and left alone.
 */
const FOREIGN_MARKERS = [
  { owner: 'Laravel Boost', open: '<laravel-boost-guidelines>' },
];

/** Every markdown file that should be reachable, excluding skills, retired material and the
 *  journal — none of which is read as a rule. */
function universe() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const r = rel(full);
      if (e.isDirectory()) {
        if (r !== rel(SKILLS) && r !== rel(LEGACY) && r !== rel(JOURNAL)) walk(full);
      } else if (e.name.endsWith('.md')) out.push(r);
    }
  };
  walk('.agents');
  return out.sort();
}

/** One record per journal entry: the destination it claims, and whether it was ever promoted. */
function journalEntries() {
  if (!fs.existsSync(JOURNAL)) return [];
  const out = [];
  for (const f of fs.readdirSync(JOURNAL).filter((n) => n.endsWith('.md')).sort()) {
    const text = fs.readFileSync(path.join(JOURNAL, f), 'utf8');
    for (const chunk of text.split(/^## /m).slice(1)) {
      const [heading, ...rest] = chunk.split(/\r?\n/);
      const body = rest.join('\n');
      const m = body.match(/^-\s*Destination:\s*(.*)$/m);
      out.push({
        heading: heading.trim(),
        destination: (m ? m[1] : '').replace(/`/g, '').trim(),
        promoted: /^-\s*Promoted:/m.test(body),
      });
    }
  }
  return out;
}

/** Retired files, so the count is visible rather than silently missing from the universe. */
function archived() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) out.push(rel(full));
    }
  };
  walk(LEGACY);
  return out.sort();
}

/** Paths a file mentions. Bare filenames resolve against the rule directories. */
function references(text) {
  const out = new Set();
  for (const m of text.matchAll(/`([A-Za-z0-9_./\-]+\.md)`/g)) {
    const p = m[1];
    if (p.startsWith('.agents/')) { out.add(p); continue; }
    if (p.includes('/') || p.startsWith('.')) continue;
    for (const dir of SEARCH_DIRS) if (fs.existsSync(path.join(dir, p))) out.add(rel(path.join(dir, p)));
  }
  return [...out];
}

/** The root entry point may belong to another tool even when this project routes its rules
 *  elsewhere — which is exactly why it routes them elsewhere. Say who owns it, so the `root:` line
 *  above reads as a decision rather than an accident. */
function foreignRootOwner() {
  const root = 'AGENTS.md';
  if (!fs.existsSync(root) || root === INDEX) return null;
  const text = fs.readFileSync(root, 'utf8');
  const owner = FOREIGN_MARKERS.find((m) => text.includes(m.open));
  return owner ? owner.owner : null;
}

if (!fs.existsSync(INDEX)) {
  console.error(`error: no ${INDEX} in ${ROOT} — the index is what makes the rules reachable.`);
  console.error('       A project with vendored rules but no index has rules nothing reads.');
  process.exit(2);
}

const files = universe();
const reached = new Set([INDEX]);
const missing = [];
const queue = [INDEX];

while (queue.length) {
  const current = queue.shift();
  let text;
  try { text = fs.readFileSync(current, 'utf8'); }
  catch { missing.push(current); continue; }
  for (const ref of references(text)) {
    if (!fs.existsSync(ref)) { missing.push(ref); continue; }
    if (!reached.has(ref)) { reached.add(ref); queue.push(ref); }
  }
}

const pointers = POINTERS.filter((p) => fs.existsSync(p));
const unreachable = files.filter((f) => !reached.has(f));
const deadPointers = pointers.filter((p) => !reached.has(p));
const retired = archived();

console.log(`root     : ${INDEX}`);
console.log(`files    : ${files.length} (excluding ${SKILLS} and ${JOURNAL})`);
console.log(`reached  : ${files.filter((f) => reached.has(f)).length}`);
if (retired.length) console.log(`retired  : ${retired.length} file(s) under ${LEGACY}/ — kept as reference, not read as rules`);

const rootOwner = foreignRootOwner();
if (rootOwner) {
  console.log(`note     : the root AGENTS.md carries a ${rootOwner} marker, so it is not this`);
  console.log('           project\'s index and nothing here rewrites it. The rules are routed from');
  console.log(`           ${INDEX} instead, which is what the lock records.`);
}

console.log('\n=== skills referenced by rule files exist ===');
const skillNames = new Set();
for (const f of reached) {
  if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/[Ss]kill[s]? `([a-z0-9-]+)`/g)) skillNames.add(m[1]);
}
let bad = 0;
for (const s of [...skillNames].sort()) {
  const p = `${SKILLS}/${s}/SKILL.md`;
  if (fs.existsSync(p)) console.log(`  ok   ${s}`);
  else { console.log(`  BAD  ${s} — ${p} does not exist`); bad++; }
}
if (!skillNames.size) console.log('  (none referenced)');

console.log('\n=== reachability ===');
for (const f of files) {
  if (reached.has(f)) console.log(`  ok   ${f}`);
  else console.log(`  DEAD ${f} — nothing routes to it`);
}
for (const p of pointers) console.log(`  ${reached.has(p) ? 'ok  ' : 'DEAD'} ${p}`);

if (missing.length) {
  console.log('\n=== referenced paths that do not exist ===');
  for (const m of [...new Set(missing)].sort()) console.log(`  MISSING ${m}`);
}

// Advisory only. Whether another harness's entry point is legitimate is a project decision, so
// this never fails the build — but a stale one is how two rule sets stay active at once, which is
// exactly what a migration is meant to end.
console.log('\n=== other entry points (advisory) ===');
const entryPoints = ENTRY_POINTS.filter((p) => fs.existsSync(p));
const staleEntries = [], foreignEntries = [];
for (const p of entryPoints) {
  let text = '';
  try { text = fs.readFileSync(p, 'utf8'); } catch { text = ''; }
  if (text.includes(INDEX)) { console.log(`  ok      ${p}`); continue; }
  const owner = FOREIGN_MARKERS.find((m) => text.includes(m.open));
  if (owner) {
    console.log(`  THEIRS  ${p} — ${owner.owner} owns this file (carries \`${owner.open}\`)`);
    foreignEntries.push({ rel: p, owner: owner.owner });
    continue;
  }
  console.log(`  STALE   ${p} — does not mention ${INDEX}`);
  staleEntries.push(p);
}
if (!entryPoints.length) console.log('  (none)');
if (foreignEntries.length) {
  console.log(`\n  ${foreignEntries.length} file(s) above belong to another tool and are never rewritten here.`);
  console.log('  That tool replaces only the block between its own markers, in place, so a row added');
  console.log('  OUTSIDE that block survives its next update — but adding it is your decision, not this');
  console.log('  script\'s, because the file is not ours. Add the row yourself if you want this index read.');
}
if (staleEntries.length) {
  console.log('\n  Not a failure — another tool may own these files. But a stale entry point keeps');
  console.log('  applying rules this index does not know about. Point it at the index, or fold its');
  console.log('  rules into the overlay and delete it. From the agent-rules repository:');
  console.log(`    node bin/rules-sync.mjs migrate --into <project> --point-at-index ${staleEntries[0]}`);
}

// The journal is the project's own history, not rules, so it never fails the build. But an entry
// whose destination was never promoted is a lesson that was recorded and then lost, and that is
// worth repeating on every run until someone resolves it.
console.log('\n=== journal (advisory) ===');
const journal = journalEntries();
if (!journal.length) {
  console.log(`  (no entries under ${JOURNAL}/)`);
} else {
  const pending = journal.filter((e) => e.destination && e.destination !== 'journal' && !e.promoted);
  console.log(`  ${journal.length} entr${journal.length === 1 ? 'y' : 'ies'}, ${pending.length} awaiting promotion`);
  for (const e of pending) console.log(`  PENDING ${e.heading} → ${e.destination}`);
  if (pending.length) {
    console.log('  Fold the lesson into the target file, then stamp it from the agent-rules repository:');
    console.log('    node bin/rules-sync.mjs journal --into <project> --promote <id> --to <path>');
  }
}

const problems = unreachable.length + missing.length + bad + deadPointers.length;
console.log(`\nRESULT: ${problems === 0 ? 'all checks passed' : problems + ' problem(s)'}`);
process.exit(problems === 0 ? 0 : 1);
