#!/usr/bin/env node
/**
 * validate-rules — dependency-free checks for this rules repository.
 *
 * Runs in CI with nothing installed, so it deliberately does not use a YAML library; the
 * frontmatter this repository uses is a flat list of `key: value` pairs, which is all the
 * parser below needs.
 *
 * Checks
 *  1. `.agents/rules/` contains no nested directories — Antigravity ignores nested rule files
 *     unless they are registered in rules.json, so a silently-dead rule is a real failure mode.
 *  2. Every `.md` in that directory opens with frontmatter that parses, has a valid `trigger`,
 *     a `description`, and `globs` when the trigger is `glob`.
 *  3. Source files are NOT stamped — the GENERATED marker belongs only in consuming projects.
 *  4. `.agents/rules.json` parses and its `inherits` / `entries` are arrays.
 *  5. Every `.agents/...` path referenced by the root AGENTS.md exists.
 *
 * Exits 1 with a readable report on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const RULES_DIR = path.join('.agents', 'rules');
const TRIGGERS = new Set(['always_on', 'model_decision', 'glob', 'manual']);
const MARKERS = ['<!-- GENERATED', '// GENERATED'];

const problems = [];
const fail = (msg) => problems.push(msg);

/** Parse the flat `key: value` frontmatter block this repository uses. */
function parseFrontmatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!block) return null;
  const out = {};
  for (const raw of block[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) return { __unparsable: line };
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.length > 1 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

console.log('=== 1) rules directory is flat ===');
if (!fs.existsSync(RULES_DIR)) {
  fail(`missing ${RULES_DIR}`);
} else {
  for (const e of fs.readdirSync(RULES_DIR, { withFileTypes: true })) {
    if (e.isDirectory()) fail(`nested directory "${e.name}" — Antigravity would ignore its rules`);
  }
}

console.log('=== 2) frontmatter parses with a usable trigger ===');
const files = fs.existsSync(RULES_DIR)
  ? fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.md')).sort()
  : [];
if (!files.length) fail(`no rule files found in ${RULES_DIR}`);
for (const f of files) {
  const text = fs.readFileSync(path.join(RULES_DIR, f), 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm) { fail(`${f}: no frontmatter (Antigravity would silently discard it)`); continue; }
  if (fm.__unparsable) { fail(`${f}: unparsable frontmatter line "${fm.__unparsable}"`); continue; }
  const issues = [];
  if (!TRIGGERS.has(fm.trigger)) issues.push(`invalid trigger=${JSON.stringify(fm.trigger)}`);
  if (!fm.description) issues.push('missing description');
  if (fm.trigger === 'model_decision' && !fm.description) issues.push('model_decision requires a description');
  if (fm.trigger === 'glob' && !fm.globs && !fm.glob) issues.push('glob requires globs');
  if (issues.length) fail(`${f}: ${issues.join('; ')}`);
  else console.log(`  ok   ${f.padEnd(24)} trigger=${fm.trigger}`);
}

console.log('=== 3) sources are not stamped ===');
for (const f of files) {
  const text = fs.readFileSync(path.join(RULES_DIR, f), 'utf8');
  if (MARKERS.some((m) => text.includes(m))) fail(`${f}: carries a GENERATED marker — this is a source file`);
}
console.log(`  ok   ${files.length} source file(s) carry no marker`);

console.log('=== 4) rules.json parses ===');
try {
  const j = JSON.parse(fs.readFileSync(path.join('.agents', 'rules.json'), 'utf8'));
  if (!Array.isArray(j.inherits) || !Array.isArray(j.entries)) fail('rules.json: inherits and entries must be arrays');
  else console.log('  ok   rules.json');
} catch (err) {
  fail(`rules.json: ${err.message}`);
}

console.log('=== 5) paths referenced by AGENTS.md exist ===');
const index = fs.readFileSync('AGENTS.md', 'utf8');
const refs = new Set();
for (const m of index.matchAll(/`(\.agents\/[A-Za-z0-9_\-.\/]+)`/g)) refs.add(m[1]);
for (const r of [...refs].sort()) {
  if (!fs.existsSync(r)) fail(`AGENTS.md references a missing path: ${r}`);
}
console.log(`  checked ${refs.size} reference(s)`);

console.log('=== 6) every rule file is reachable from AGENTS.md ===');
{
  const reached = new Set(['AGENTS.md']);
  const queue = ['AGENTS.md'];
  while (queue.length) {
    const current = queue.shift();
    let text = '';
    try { text = fs.readFileSync(current, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/`([A-Za-z0-9_./\-]+\.md)`/g)) {
      const p = m[1];
      const candidates = p.startsWith('.agents/') ? [p] : (p.includes('/') ? [] : [`${RULES_DIR.replace(/\\/g, '/')}/${p}`]);
      for (const c of candidates) if (fs.existsSync(c) && !reached.has(c)) { reached.add(c); queue.push(c); }
    }
  }
  const dead = [];
  for (const f of files) {
    const rel = `${RULES_DIR.replace(/\\/g, '/')}/${f}`;
    if (reached.has(rel)) console.log(`  ok   ${rel}`);
    else { console.log(`  DEAD ${rel} — nothing routes to it`); dead.push(f); }
  }
  if (dead.length) fail(`unreachable rule file(s): ${dead.join(', ')}`);
}

console.log('=== 7) templates/AGENTS.md routes every rule ===');
{
  const tpl = path.join('templates', 'AGENTS.md');
  if (!fs.existsSync(tpl)) {
    fail('templates/AGENTS.md is missing — `init` would scaffold an index that routes nothing');
  } else {
    const text = fs.readFileSync(tpl, 'utf8');
    const unRouted = files.filter((f) => !text.includes(f));
    if (unRouted.length) {
      for (const m of unRouted) console.log(`  MISSING ${m}`);
      fail(`templates/AGENTS.md does not route: ${unRouted.join(', ')} — every project created with init would have a dead rule`);
    } else {
      console.log(`  ok   all ${files.length} rule file(s) referenced`);
    }
  }
}

console.log('=== 8) templates/AGENTS.md is safe to scaffold ===');
{
  const tpl = path.join('templates', 'AGENTS.md');
  if (fs.existsSync(tpl)) {
    const text = fs.readFileSync(tpl, 'utf8');
    // The base vendors rules, never skills. A skill name in the template would fail
    // check-index.mjs in every project `init` creates, because that skill does not exist there.
    const skills = [...text.matchAll(/[Ss]kill[s]? `([a-z0-9-]+)`/g)].map((m) => m[1]);
    if (skills.length) {
      for (const s of skills) console.log(`  NAMED ${s}`);
      fail(`templates/AGENTS.md names skill(s) ${skills.join(', ')} — the base vendors no skills, so every scaffolded project would fail check-index`);
    } else {
      console.log('  ok   names no skill the base would have to vendor');
    }
    // `init` creates the entry-point pointers, and check-index.mjs requires the index to reach
    // them. If the template stops mentioning one, every freshly scaffolded project fails.
    const pointers = ['.agents/AGENTS.md', '.agents/claude/CLAUDE.md', '.agents/codex/AGENTS.md'];
    const unmentioned = pointers.filter((p) => !text.includes(p));
    if (unmentioned.length) fail(`templates/AGENTS.md does not mention the pointer file(s) ${unmentioned.join(', ')} — check-index would report them DEAD in every scaffolded project`);
    else console.log(`  ok   mentions all ${pointers.length} pointer file(s)`);
  }
}

console.log('=== 9) the journal obeys its own gate ===');
{
  const dir = path.join('.agents', 'journal');
  // Deliberately duplicated rather than imported: this script runs with nothing installed, and a
  // check that shares the implementation it checks cannot catch a change to that implementation.
  const DESTINATIONS = /^(journal|project-truth|project-conventions|(base|stack|project):[A-Za-z0-9._/-]+)$/;
  const REQUIRED = ['Id', 'Trigger', 'Change', 'Evidence', 'Lesson', 'Destination'];
  let entries = 0;
  if (!fs.existsSync(dir)) {
    console.log('  (no journal yet)');
  } else {
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      for (const chunk of text.split(/^## /m).slice(1)) {
        entries++;
        const [heading, ...rest] = chunk.split(/\r?\n/);
        const body = rest.join('\n');
        const field = (k) => {
          const m = body.match(new RegExp(`^-\\s*${k}\\s*:\\s*(.*)$`, 'm'));
          return m ? m[1].trim() : '';
        };
        const where = `${name} · ${heading.trim()}`;
        const missing = REQUIRED.filter((k) => !field(k));
        if (missing.length) { fail(`journal ${where}: missing ${missing.join(', ')}`); continue; }
        const destination = field('Destination').replace(/`/g, '');
        if (!DESTINATIONS.test(destination)) {
          fail(`journal ${where}: Destination "${destination}" is not a known destination`);
          continue;
        }
        // The gate. A lesson with no evidence may be recorded, but it may not be routed anywhere.
        if (destination !== 'journal' && !/`[^`]+`/.test(field('Evidence'))) {
          fail(`journal ${where}: Destination is ${destination} but Evidence carries no backticked command or path`);
        }
        const promoted = body.match(/^-\s*Promoted:\s*`([^`]+)`/m);
        if (promoted && !fs.existsSync(promoted[1])) {
          fail(`journal ${where}: promoted into ${promoted[1]}, which does not exist`);
        }
        if (promoted && destination === 'journal') {
          fail(`journal ${where}: promoted, but Destination is journal — a lesson with no destination cannot be promoted`);
        }
      }
    }
    console.log(`  ok   ${entries} entr${entries === 1 ? 'y' : 'ies'}, all fields present, gate respected`);
  }
}

console.log('=== 10) the local ignore has exactly one implementation ===');
{
  // `bin/setup.mjs` used to append to `.git/info/exclude` on its own, which meant the same project
  // behaved differently depending on which documented entry point was used, and the promise was
  // never checked against git. It is a mapper now; the hiding lives in rules-sync `local`.
  const setup = path.join('bin', 'setup.mjs');
  if (!fs.existsSync(setup)) {
    fail('bin/setup.mjs is missing — `npx agent-rules` would not work');
  } else {
    const text = fs.readFileSync(setup, 'utf8');
    const writes = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'createWriteStream', 'unlinkSync'].filter((f) => text.includes(f));
    if (writes.length) {
      fail(`bin/setup.mjs writes files itself (${writes.join(', ')}) — the local ignore must have one implementation, in rules-sync \`local\`, where it is checked against git`);
    } else {
      console.log('  ok   bin/setup.mjs maps arguments only');
    }
    for (const cmd of ['local', 'learn', 'journal']) {
      if (!text.includes(`'${cmd}'`)) fail(`bin/setup.mjs does not know the \`${cmd}\` command — it would be misread as flags`);
    }
    console.log('  ok   bin/setup.mjs knows every command');
  }
}

console.log('=== 11) CI runs the smoke tests that exist ===');
{
  // The smoke tests used to be inline in the workflow, so they could only be run by pushing. They
  // live in tests/smoke.sh now, which is only an improvement if the workflow actually calls it —
  // and if the file it calls is there.
  const wf = path.join('.github', 'workflows', 'validate-rules.yml');
  const smoke = path.join('tests', 'smoke.sh');
  if (!fs.existsSync(smoke)) {
    fail('tests/smoke.sh is missing — the promises in the README would be untested');
  } else if (!fs.existsSync(wf)) {
    fail(`${wf} is missing — nothing runs the smoke tests`);
  } else {
    const text = fs.readFileSync(wf, 'utf8');
    if (!text.includes('tests/smoke.sh')) fail(`${wf} does not run tests/smoke.sh`);
    else console.log('  ok   CI runs tests/smoke.sh');
    if (!text.includes('bin/validate-rules.mjs')) fail(`${wf} does not run this script`);
    else console.log('  ok   CI runs this script');
  }
}

if (problems.length) {
  console.log('\nFAILED:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nRESULT: all checks passed');
