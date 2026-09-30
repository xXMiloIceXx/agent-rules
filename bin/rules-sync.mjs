#!/usr/bin/env node
/**
 * rules-sync — vendor this repository's portable rules into a consuming project.
 *
 * The portable set is exactly `.agents/rules/*.md` in THIS repository. A consuming
 * project receives copies of those files (each stamped with a GENERATED header) plus a
 * `.agents/rules.lock.json` recording the base revision and the hash of every vendored
 * file. Files in the project's rules directory that are not part of the base are treated
 * as project-owned and never touched.
 *
 * Usage
 *   node bin/rules-sync.mjs sync  --into <projectDir> [--force] [--dry-run]
 *   node bin/rules-sync.mjs check [--project <projectDir>]
 *
 * Why two modes: `sync` needs this repository present (run it on a dev machine after the
 * base changes). `check` deliberately does not — a consuming project's CI has no copy of
 * this repository, so it verifies the vendored files against its own lock file, which is
 * enough to catch a hand-edit or a missing file.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_RULES = path.join(BASE_ROOT, '.agents', 'rules');
const TARGET_SUBDIR = path.join('.agents', 'rules');
const LOCK_NAME = path.join('.agents', 'rules.lock.json');
const HEADER_START = '<!-- GENERATED';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function baseRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: BASE_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

/** Insert the GENERATED marker immediately AFTER the YAML frontmatter, so the
 *  frontmatter stays the first thing in the file (Antigravity parses it there). */
function stamp(body, revision, name) {
  const marker =
    `${HEADER_START} FILE — do not edit.\n` +
    `     Source: agent-rules@${revision} · .agents/rules/${name}\n` +
    `     Edit the source and re-run: node bin/rules-sync.mjs sync --into <this project> -->\n`;

  const fm = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (fm) return body.slice(0, fm[0].length) + marker + body.slice(fm[0].length);
  return marker + body;
}

function stripStamp(body) {
  return body.replace(/^<!-- GENERATED[\s\S]*?-->\r?\n?/m, '');
}

function listBaseRules() {
  if (!fs.existsSync(BASE_RULES)) {
    console.error(`error: base rules directory not found at ${BASE_RULES}`);
    process.exit(2);
  }
  return fs.readdirSync(BASE_RULES)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

function loadLock(project) {
  const p = path.join(project, LOCK_NAME);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function cmdSync(argv) {
  const intoIdx = argv.indexOf('--into');
  if (intoIdx === -1 || !argv[intoIdx + 1]) {
    console.error('usage: rules-sync sync --into <projectDir> [--force] [--dry-run]');
    process.exit(2);
  }
  const project = path.resolve(argv[intoIdx + 1]);
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');

  if (!fs.existsSync(path.join(project, '.git'))) {
    console.error(`error: ${project} is not a git repository root (no .git). Refusing to guess.`);
    process.exit(2);
  }

  const revision = baseRevision();
  const targetDir = path.join(project, TARGET_SUBDIR);
  const existingLock = loadLock(project);
  const names = listBaseRules();

  console.log(`base    : ${BASE_ROOT}  (${revision})`);
  console.log(`project : ${project}`);
  console.log(`mode    : ${dryRun ? 'dry-run' : 'write'}${force ? ' +force' : ''}`);
  console.log('');

  const lockFiles = {};
  const written = [];
  const conflicts = [];
  const untouched = [];

  for (const name of names) {
    const source = fs.readFileSync(path.join(BASE_RULES, name), 'utf8');
    const rendered = stamp(stripStamp(source), revision, name);
    const outPath = path.join(targetDir, name);
    const prev = existingLock?.files?.[name];
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    const currentOwned = current !== null && (
      // either it matches the previous lock, or it carries our marker
      (prev && sha256(Buffer.from(current)) === prev) || current.includes(HEADER_START)
    );

    if (current !== null && !currentOwned && !force) {
      conflicts.push(name);
      continue;
    }
    lockFiles[name] = sha256(Buffer.from(rendered));
    if (current === rendered) { untouched.push(name); continue; }
    written.push(name);
    if (!dryRun) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(outPath, rendered, 'utf8');
    }
  }

  // Anything else in the target dir belongs to the project.
  const projectOwned = fs.existsSync(targetDir)
    ? fs.readdirSync(targetDir).filter((f) => f.endsWith('.md') && !names.includes(f)).sort()
    : [];

  if (!dryRun && written.length >= 0 && conflicts.length === 0) {
    const lock = {
      base: 'agent-rules',
      revision,
      syncedAt: new Date().toISOString(),
      source: '.agents/rules',
      files: lockFiles,
    };
    fs.writeFileSync(path.join(project, LOCK_NAME), JSON.stringify(lock, null, 2) + '\n', 'utf8');
  }

  const show = (label, arr) => { if (arr.length) console.log(`${label} (${arr.length}):\n  ${arr.join('\n  ')}`); };
  show('would write' , dryRun ? written : []);
  show('written'  , dryRun ? [] : written);
  show('already up to date', untouched);
  show('project-owned (left alone)', projectOwned);
  show('CONFLICT — same name in base and project, not previously vendored (use --force to replace)', conflicts);

  if (conflicts.length) {
    console.log('\nRefusing to write anything: resolve the conflicts above first.');
    process.exit(1);
  }
  console.log(`\nok — ${names.length} vendored file(s) accounted for.`);
}

function cmdCheck(argv) {
  const pIdx = argv.indexOf('--project');
  const project = pIdx === -1 ? process.cwd() : path.resolve(argv[pIdx + 1]);
  const lock = loadLock(project);
  if (!lock) {
    console.error(`no ${LOCK_NAME} in ${project} — this project has no vendored rules.`);
    process.exit(2);
  }
  const problems = [];
  for (const [name, expected] of Object.entries(lock.files ?? {})) {
    const file = path.join(project, TARGET_SUBDIR, name);
    if (!fs.existsSync(file)) { problems.push(`MISSING   ${name}`); continue; }
    const actual = sha256(fs.readFileSync(file));
    if (actual !== expected) problems.push(`MODIFIED  ${name}  (hash ${actual.slice(0, 12)} != lock ${expected.slice(0, 12)})`);
  }
  console.log(`project : ${project}`);
  console.log(`vendored: agent-rules@${lock.revision ?? '?'} · ${Object.keys(lock.files ?? {}).length} file(s)`);
  if (problems.length) {
    console.log('\n' + problems.map((p) => '  ' + p).join('\n'));
    console.log('\nVendored files are generated. Edit the source in the agent-rules repo and re-run sync.');
    process.exit(1);
  }
  console.log('ok — every vendored file matches the lock.');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'sync') cmdSync(rest);
else if (cmd === 'check') cmdCheck(rest);
else {
  console.error('usage:\n  rules-sync sync  --into <projectDir> [--force] [--dry-run]\n  rules-sync check [--project <projectDir>]');
  process.exit(2);
}
