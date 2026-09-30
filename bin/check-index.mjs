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
 * its own catalogue rather than from the index.
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

const INDEX = 'AGENTS.md';
const SEARCH_DIRS = ['.agents/rules', '.agents/shared'];
const SKILLS = '.agents/skills';
/** Entry points other tools look for. Only the ones that exist are checked. */
const POINTERS = ['.agents/AGENTS.md', '.agents/claude/CLAUDE.md', '.agents/codex/AGENTS.md'];

const rel = (p) => p.split(path.sep).join('/');

/** Every markdown file that should be reachable, excluding skills. */
function universe() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (rel(full) !== rel(SKILLS)) walk(full); }
      else if (e.name.endsWith('.md')) out.push(rel(full));
    }
  };
  walk('.agents');
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

console.log(`root     : ${INDEX}`);
console.log(`files    : ${files.length} (excluding ${SKILLS})`);
console.log(`reached  : ${files.filter((f) => reached.has(f)).length}`);

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

const problems = unreachable.length + missing.length + bad + deadPointers.length;
console.log(`\nRESULT: ${problems === 0 ? 'all checks passed' : problems + ' problem(s)'}`);
process.exit(problems === 0 ? 0 : 1);
