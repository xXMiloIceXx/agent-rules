#!/usr/bin/env node
/**
 * rules-sync — vendor this repository's portable rules into a consuming project, bootstrap a new
 * one, and adopt the base in a project that already has rules of its own.
 *
 * The portable set is `.agents/rules/*.md` in THIS repository plus the two guard scripts, because
 * a consuming project's CI must be able to run `check` without a copy of the base.
 *
 * Usage
 *   node bin/rules-sync.mjs sync    --into <projectDir> [--force] [--dry-run]
 *   node bin/rules-sync.mjs init    --into <projectDir> [--force] [--dry-run]
 *   node bin/rules-sync.mjs migrate --into <projectDir> [--adopt-index | --replace-index]
 *                                   [--retire] [--point-at-index <rel>]... [--require-clean]
 *                                   [--force] [--dry-run]
 *   node .agents/bin/rules-sync.mjs check [--project <projectDir>]
 *
 * `sync` refreshes an existing project: it writes the vendored files and the lock, and never
 * touches anything the base does not own. It fails — loudly, and without writing — when an
 * existing index does not route what it just vendored, because that is a migration, not a sync.
 *
 * `init` does the same and then scaffolds the project-owned files a brand-new project needs for
 * those rules to actually be read — the index, the two overlay files, the entry-point pointers
 * and a guard workflow. An existing file is never overwritten, so `init` is safe to re-run.
 *
 * `migrate` is the one for a project that ALREADY has agent rules (an older corpus, a monolith
 * `CLAUDE.md`, a hand-written index). It vendors the base, adopts or replaces the index (an
 * existing index is backed up, never lost), optionally retires the project's old rule files into
 * `.agents/legacy/`, points other harness entry points at the index, and reports what is left for
 * a human to decide. Nothing project-owned is deleted.
 *
 * `sync`, `init` and `migrate` need this repository and therefore refuse to run from a vendored
 * copy. `check` deliberately needs nothing: it verifies the vendored files against the project's
 * own lock, which is enough to catch a hand-edit, a deletion, or a partial sync.
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
const BIN_DIR = path.join('.agents', 'bin');
const LOCK_NAME = path.join('.agents', 'rules.lock.json');
const LEGACY_DIR = '.agents/legacy';
const INDEX_NAME = 'AGENTS.md';
const INDEX_BACKUP = 'AGENTS.md.pre-migrate.bak';
const MD_MARK = '<!-- GENERATED';
const JS_MARK = '// GENERATED';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');
const relFromRoot = (root, p) => posix(path.relative(root, p));

/** The scripts a project needs in order to guard its own rules. */
const TOOLS = ['rules-sync.mjs', 'check-index.mjs'];

/** Project-owned files `init` scaffolds. Existing files are never overwritten. */
const SCAFFOLD = [
  { template: 'AGENTS.md', to: INDEX_NAME, why: 'the index — without it the rules are never read' },
  { template: 'project-truth.md', to: path.join(RULES_DIR, 'project-truth.md'), why: 'this project\'s stack facts' },
  { template: 'project-conventions.md', to: path.join(RULES_DIR, 'project-conventions.md'), why: 'this project\'s commands and layout' },
  { template: 'workflow-agent-rules.yml', to: path.join('.github', 'workflows', 'agent-rules.yml'), why: 'CI guard steps' },
];

/**
 * Thin pointers other tools look for. They are not rules: each one sends the reader to the root
 * index, so a harness that expects an entry point somewhere else still lands on the single source
 * of truth instead of a stale copy.
 */
const POINTERS = ['.agents/AGENTS.md', '.agents/claude/CLAUDE.md', '.agents/codex/AGENTS.md'];

/**
 * Files that are not the index but still steer an agent. A stale one keeps applying rules the
 * index does not know about — the failure mode that makes "replace the old rules" unfinished.
 */
const ENTRY_POINTS = [
  'CLAUDE.md',
  'GEMINI.md',
  '.geminirules',
  '.cursorrules',
  '.windsurfrules',
  '.claude/CLAUDE.md',
  '.github/copilot-instructions.md',
];

/** Project-owned files beside the rules that are never legacy material. */
const KEEP_PROJECT = new Set([
  ...POINTERS,
  posix(path.join(RULES_DIR, 'project-truth.md')),
  posix(path.join(RULES_DIR, 'project-conventions.md')),
]);

function baseRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: BASE_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

/** A content id for the source file, so a stamp changes only when that file changes. Stamping the
 *  repository revision instead meant every unrelated base commit rewrote every vendored file. */
const sourceId = (body) => sha256(Buffer.from(body)).slice(0, 12);

/** Markdown: the marker goes AFTER the YAML frontmatter, so the frontmatter stays first and
 *  still parses as an activation trigger. */
function stampMarkdown(body, revision, relFrom) {
  const marker =
    `${MD_MARK} FILE — do not edit.\n` +
    `     Source: agent-rules · ${relFrom} · content ${sourceId(body)}\n` +
    `     Generated by rules-sync. See AGENTS.md § "Vendored rules" to update. -->\n`;
  const fm = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return fm ? body.slice(0, fm[0].length) + marker + body.slice(fm[0].length) : marker + body;
}

/** JavaScript: the marker goes after any shebang, and uses line comments. An HTML comment would
 *  be a syntax error here, and a marker before the shebang would break it. */
function stampJs(body, revision, relFrom) {
  const marker =
    `${JS_MARK} FILE — do not edit.\n` +
    `//     Source: agent-rules · ${relFrom} · content ${sourceId(body)}\n` +
    `//     This copy exists so a consuming project's CI can run without the base.\n` +
    `//     Edit the source in the agent-rules repository and re-run sync from there.`;
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
      '       Run `sync`/`init`/`migrate` from the agent-rules repository instead; `check` works here.'
    );
    process.exit(2);
  }
  const items = fs.readdirSync(BASE_RULES).filter((f) => f.endsWith('.md')).sort()
    .map((name) => ({ rel: posix(path.join(RULES_DIR, name)), source: path.join(BASE_RULES, name), stamp: stampMarkdown }));
  for (const tool of TOOLS) {
    items.push({ rel: posix(path.join(BIN_DIR, tool)), source: path.join(BASE_ROOT, 'bin', tool), stamp: stampJs });
  }
  return items;
}

function loadLock(project) {
  const p = path.join(project, LOCK_NAME);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Plan the vendored set, then write it.
 *
 * A conflict is a file the base owns the name of but did not write (a hand-written
 * `.agents/rules/00-core.md`, say). Writing the rest anyway would leave a half-vendored tree whose
 * lock lists only the files that happened to survive — and `check` would report that tree green.
 * So a conflict aborts before anything is written, and `--force` replaces the file only after
 * preserving it as `<file>.bak`.
 */
function applySync(project, { force, dryRun }) {
  const revision = baseRevision();
  const existingLock = loadLock(project);
  const records = plan().map((item) => {
    const relFrom = relFromRoot(BASE_ROOT, item.source);
    const rendered = item.stamp(stripMark(fs.readFileSync(item.source, 'utf8')), revision, relFrom);
    const out = path.join(project, item.rel);
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    const owned = current !== null && (
      current.includes(MD_MARK) || current.includes(JS_MARK) ||
      (existingLock?.files?.[item.rel] && sha256(Buffer.from(current)) === existingLock.files[item.rel])
    );
    return { rel: item.rel, out, rendered, current, owned };
  });

  const total = records.length;
  const conflicts = records.filter((r) => r.current !== null && !r.owned && !force).map((r) => r.rel);
  if (conflicts.length) {
    return { revision, aborted: true, conflicts, written: [], unchanged: [], backups: [], projectOwned: [], lockFiles: {}, total };
  }

  const written = [], unchanged = [], backups = [], lockFiles = {};
  for (const r of records) {
    lockFiles[r.rel] = sha256(Buffer.from(r.rendered));
    if (r.current === r.rendered) { unchanged.push(r.rel); continue; }
    written.push(r.rel);
    if (r.current !== null && !r.owned) backups.push({ rel: r.rel, to: `${r.rel}.bak` });
  }

  const owned = new Set(Object.keys(lockFiles));
  const projectOwned = fs.existsSync(path.join(project, RULES_DIR))
    ? fs.readdirSync(path.join(project, RULES_DIR))
      .filter((f) => f.endsWith('.md') && !owned.has(posix(path.join(RULES_DIR, f)))).sort()
    : [];

  if (!dryRun) {
    const pending = new Set(written);
    for (const r of records) {
      if (!pending.has(r.rel)) continue;
      const bak = `${r.out}.bak`;
      // Keep the first backup: it is the original, hand-written file. A second --force run must
      // not overwrite that evidence with the base's own previous copy.
      if (r.current !== null && !r.owned && !fs.existsSync(bak)) fs.writeFileSync(bak, r.current, 'utf8');
      fs.mkdirSync(path.dirname(r.out), { recursive: true });
      fs.writeFileSync(r.out, r.rendered, 'utf8');
    }
    // No timestamp: the lock must be deterministic for a given revision and set of contents, or a
    // no-op sync would produce a spurious diff every time it ran.
    fs.writeFileSync(path.join(project, LOCK_NAME),
      JSON.stringify({ base: 'agent-rules', revision, files: lockFiles }, null, 2) + '\n', 'utf8');
  }
  return { revision, aborted: false, conflicts: [], written, unchanged, backups, projectOwned, lockFiles, total };
}

function requireInto(argv, usage) {
  const i = argv.indexOf('--into');
  if (i === -1 || !argv[i + 1]) { console.error(usage); process.exit(2); }
  return { project: path.resolve(argv[i + 1]), force: argv.includes('--force'), dryRun: argv.includes('--dry-run') };
}

function requireGit(project, hint) {
  if (!fs.existsSync(path.join(project, '.git'))) {
    console.error(`error: ${project} is not a git repository root (no .git). Refusing to guess.`);
    if (hint) console.error(`       ${hint}`);
    process.exit(2);
  }
}

function substitute(text, project) {
  const name = path.basename(project);
  return text
    .replaceAll('{{PROJECT}}', name)
    .replaceAll('{{BASE}}', posix(BASE_ROOT))
    .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10));
}

/** The pointer stub a harness reads where it expects an instruction file. */
function pointerBody(rel) {
  const up = '../'.repeat(rel.split('/').length - 1);
  return `# Moved — see \`${up}AGENTS.md\`\n\n` +
    `The agent rules for this repository have a single entry point: [\`AGENTS.md\`](${up}AGENTS.md).\n\n` +
    'This file exists only because a tool looks for an instruction file at this path.\n' +
    '**Do not add rules here.** Add them to `AGENTS.md`, or to a file it routes to.\n';
}

function writeIndex(project, { replace, dryRun }) {
  const from = path.join(BASE_ROOT, 'templates', 'AGENTS.md');
  const to = path.join(project, INDEX_NAME);
  const body = substitute(fs.readFileSync(from, 'utf8'), project);
  const current = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null;
  if (current !== null && !replace) return { action: 'kept', backup: null };
  if (current === body) return { action: 'current', backup: null };
  let backup = null;
  if (current !== null) {
    backup = INDEX_BACKUP;
    const bakPath = path.join(project, backup);
    // First backup wins, so a re-run cannot bury the original index under the base's own copy.
    if (!dryRun && !fs.existsSync(bakPath)) fs.writeFileSync(bakPath, current, 'utf8');
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, body, 'utf8');
  }
  return { action: current === null ? 'created' : 'replaced', backup };
}

function scaffoldPointers(project, { dryRun }) {
  const created = [], kept = [];
  for (const rel of POINTERS) {
    const to = path.join(project, rel);
    if (fs.existsSync(to) && fs.readFileSync(to, 'utf8').trim()) { kept.push(rel); continue; }
    created.push(rel);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, pointerBody(rel), 'utf8');
    }
  }
  return { created, kept };
}

function pointAtIndex(project, rels, { dryRun, force }) {
  const done = [], skipped = [];
  for (const rel of rels) {
    const to = path.join(project, rel);
    const exists = fs.existsSync(to);
    if (exists && !force) { skipped.push(rel); continue; }
    if (!dryRun) {
      if (exists) {
        const bak = `${to}.bak`;
        if (!fs.existsSync(bak)) fs.writeFileSync(bak, fs.readFileSync(to));
      }
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, pointerBody(rel), 'utf8');
    }
    done.push(rel);
  }
  return { done, skipped };
}

/** Other harness entry points that exist and do not mention the index. */
function entryPointReport(project) {
  const out = [];
  for (const rel of ENTRY_POINTS) {
    const p = path.join(project, rel);
    if (!fs.existsSync(p)) continue;
    let ok = false;
    try { ok = fs.readFileSync(p, 'utf8').includes(INDEX_NAME); } catch { ok = false; }
    out.push({ rel, ok });
  }
  return out;
}

/**
 * Rule files under `.agents/` that the base did not write and the index does not own: the old
 * corpus, a hand-written rule, a playbook kept from before the migration. They are candidates for
 * retirement, not deletions — `--retire` moves them under `.agents/legacy/`, where they stay
 * readable in the repository but stop competing with the index.
 */
function findLegacyRules(project, lockFiles) {
  const owned = new Set(Object.keys(lockFiles ?? {}));
  const out = [];
  const walk = (dir, relDir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = posix(path.join(relDir, e.name));
      if (e.isDirectory()) {
        if (rel === '.agents/skills' || rel === LEGACY_DIR) continue;
        walk(path.join(dir, e.name), rel);
      } else if (e.name.endsWith('.md') && !owned.has(rel) && !KEEP_PROJECT.has(rel)) {
        out.push(rel);
      }
    }
  };
  walk(path.join(project, '.agents'), '.agents');
  return out.sort();
}

function retireLegacy(project, rels, { dryRun }) {
  const moved = [], refused = [];
  for (const rel of rels) {
    const from = path.join(project, rel);
    const to = path.join(project, LEGACY_DIR, rel.slice('.agents/'.length));
    if (fs.existsSync(to)) { refused.push(rel); continue; }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
    }
    moved.push(`${rel} → ${relFromRoot(project, to)}`);
  }
  return { moved, refused };
}

/** Run the project's own vendored guard — the same command CI runs — so "migrate ok" means
 *  "CI will be green", not "the script thinks it did the right thing". */
function runIndexCheck(project) {
  const checker = path.join(project, BIN_DIR, 'check-index.mjs');
  if (!fs.existsSync(checker)) return { ok: false, output: `${posix(path.join(BIN_DIR, 'check-index.mjs'))} is missing` };
  try {
    const output = execFileSync(process.execPath, [checker, '--project', project], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { ok: true, output };
  } catch (err) {
    return { ok: false, status: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() };
  }
}

function reportSync(project, r, dryRun) {
  console.log(`base    : ${BASE_ROOT}  (${r.revision})`);
  console.log(`project : ${project}`);
  console.log(`mode    : ${dryRun ? 'dry-run' : 'write'}${r.force ? ' +force' : ''}\n`);
  const show = (label, arr) => { if (arr?.length) console.log(`${label} (${arr.length}):\n  ${arr.join('\n  ')}\n`); };
  show(dryRun ? 'would write' : 'written', r.written);
  show('already up to date', r.unchanged);
  show('project-owned (left alone)', r.projectOwned);
  if (r.backups?.length) show('replaced, original kept as .bak', r.backups.map((b) => `${b.rel} → ${b.to}`));
  show('CONFLICT — same name, not previously vendored (use --force to replace, after a backup)', r.conflicts);
}

function reportIndexFail(project, verdict, { migration }) {
  console.log('The project\'s own guard rejects the result:\n');
  console.log(verdict.output.split('\n').map((l) => '  ' + l).join('\n'));
  console.log('\nThe vendored files are correct; the INDEX is what does not route them.');
  if (migration) {
    console.log('Adopt the base index (an existing one is backed up, never lost):');
    console.log(`  node bin/rules-sync.mjs migrate --into "${project}" --replace-index --retire`);
  } else {
    console.log(`  node bin/rules-sync.mjs migrate --into "${project}" --adopt-index --replace-index`);
  }
  console.log('Or add the missing rows to AGENTS.md by hand, then re-run:');
  console.log('  node .agents/bin/check-index.mjs');
}

function reportEntryPoints(project, { strict }) {
  const entries = entryPointReport(project);
  const stale = entries.filter((e) => !e.ok);
  if (!entries.length) return { stale };
  console.log(`other entry points (${entries.length}):`);
  for (const e of entries) {
    console.log(`  ${e.ok ? 'ok   ' : 'STALE'} ${e.rel}${e.ok ? ' — points at AGENTS.md' : ' — does not mention AGENTS.md'}`);
  }
  if (stale.length) {
    console.log('  A stale entry point keeps applying its own rules beside the index.');
    console.log('  Fold anything still true into the overlay, then point the file at the index');
    console.log('  (--force replaces it and keeps the original as .bak):');
    console.log(`  node bin/rules-sync.mjs migrate --into "${project}" --point-at-index ${stale[0].rel} --force`);
    if (strict) console.log('  (--require-clean: this is a failure until every entry point is resolved)');
  }
  console.log('');
  return { stale };
}

function cmdSync(argv) {
  const { project, force, dryRun } = requireInto(argv, 'usage: rules-sync sync --into <projectDir> [--force] [--dry-run]');
  requireGit(project, 'Use `init` to bootstrap a new project, or `migrate` for one that has rules already.');
  const r = applySync(project, { force, dryRun });
  r.force = force;
  reportSync(project, r, dryRun);
  if (r.conflicts.length) {
    console.log('Nothing was written: a conflicting file is not the base\'s to overwrite by default.');
    console.log('Review the files above, then either delete/move them or re-run with --force (which backs each one up).');
    process.exit(1);
  }
  console.log(`ok — ${r.total} file(s) accounted for.`);
  if (dryRun) return;

  const verdict = runIndexCheck(project);
  if (!verdict.ok) {
    console.log('');
    reportIndexFail(project, verdict, { migration: true });
    process.exit(1);
  }
  console.log('index   : ok — every vendored rule is reachable from AGENTS.md.');
}

/**
 * Write the project-owned files the rules need in order to be read: the index, the two overlays
 * beside the vendored rules, and the CI guard. Never overwrites — these are the project's.
 *
 * `includeIndex: false` leaves the index to the caller, so `migrate` can report which of
 * create/keep/replace it actually did instead of finding the file already scaffolded.
 */
function scaffoldProject(project, { dryRun, includeIndex = true }) {
  const created = [], kept = [], unresolved = [];
  for (const s of SCAFFOLD) {
    if (!includeIndex && s.to === INDEX_NAME) continue;
    const from = path.join(BASE_ROOT, 'templates', s.template);
    const to = path.join(project, s.to);
    if (!fs.existsSync(from)) { unresolved.push(`${s.template} (template missing in the base)`); continue; }
    if (fs.existsSync(to)) { kept.push(s.to); continue; }
    const body = substitute(fs.readFileSync(from, 'utf8'), project);
    if (body.includes('{{')) unresolved.push(`${s.to} (placeholder left unsubstituted)`);
    created.push(s.to);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, body, 'utf8');
    }
  }
  return { created, kept, unresolved };
}

function cmdInit(argv) {
  const { project, force, dryRun } = requireInto(argv, 'usage: rules-sync init --into <projectDir> [--force] [--dry-run]');

  const exists = fs.existsSync(project);
  if (exists) {
    const entries = fs.readdirSync(project);
    const isRepo = fs.existsSync(path.join(project, '.git'));
    // A lock file proves sync/init has already run here, so re-running is safe. A directory
    // holding only our own artefacts is equally recognisable.
    const alreadyManaged = fs.existsSync(path.join(project, LOCK_NAME));
    const onlyOurs = entries.every((e) => e === '.agents' || e === 'AGENTS.md' || e === '.github');
    if (entries.length && !isRepo && !alreadyManaged && !onlyOurs && !force) {
      console.error(`error: ${project} exists, has no .git, and is not empty (${entries.slice(0, 5).join(', ')}…).`);
      console.error('       Refusing to scaffold into a directory that may not be the intended target.');
      console.error('       Re-run with --force if it is, or use `migrate` for an existing repository.');
      process.exit(2);
    }
  } else if (!dryRun) {
    fs.mkdirSync(project, { recursive: true });
  }

  const r = applySync(project, { force, dryRun });
  r.force = force;

  const { created, kept, unresolved } = scaffoldProject(project, { dryRun });
  const pointers = scaffoldPointers(project, { dryRun });

  reportSync(project, r, dryRun);
  console.log(`${dryRun ? 'would scaffold' : 'scaffolded'} (${created.length}):`);
  for (const c of created) console.log(`  ${c}`);
  if (pointers.created.length) {
    console.log(`${dryRun ? 'would create' : 'created'} entry-point pointer(s) (${pointers.created.length}):`);
    for (const c of pointers.created) console.log(`  ${c}`);
  }
  if (kept.length) {
    console.log(`\nalready present, left untouched (${kept.length}):`);
    for (const k of kept) console.log(`  ${k}`);
  }
  if (unresolved.length) {
    console.log(`\nWARNING (${unresolved.length}):`);
    for (const u of unresolved) console.log(`  ${u}`);
  }

  if (r.conflicts.length) {
    console.log('\nNothing was written: a conflicting file is not the base\'s to overwrite by default.');
    console.log('Review the files above, then either delete/move them or re-run with --force (which backs each one up).');
    process.exit(1);
  }

  console.log(`
ok — ${r.total} vendored file(s) and ${created.length + pointers.created.length} project-owned file(s) accounted for.`);
  if (dryRun) return;

  const verdict = runIndexCheck(project);
  if (!verdict.ok) {
    console.log('');
    console.log('This project already had agent rules of its own, and its index does not route what the');
    console.log('base just vendored — read the report below, then adopt the base index.');
    reportIndexFail(project, verdict, { migration: true });
    process.exit(1);
  }

  console.log(`
Next:
  1. Fill in ${posix(path.join(RULES_DIR, 'project-truth.md'))} — read the manifests, do not guess.
  2. Fill in ${posix(path.join(RULES_DIR, 'project-conventions.md'))} — the real commands and layout.
  3. Route the project's own skills from AGENTS.md, if it has any (the base vendors rules, never skills).
  4. Run: node .agents/bin/check-index.mjs   (every rule file and pointer must be reachable)
  5. Commit. The rules now work from a fresh clone with no install.`);
}

function cmdMigrate(argv) {
  const { project, force, dryRun } = requireInto(argv, 'usage: rules-sync migrate --into <projectDir> [--adopt-index | --replace-index] [--retire] [--require-clean] [--force] [--dry-run]');
  const adoptIndex = argv.includes('--adopt-index');
  const replaceIndex = argv.includes('--replace-index');
  const retire = argv.includes('--retire');
  const requireClean = argv.includes('--require-clean');
  const pointAt = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--point-at-index' && argv[i + 1]) pointAt.push(argv[i + 1]);

  requireGit(project, '`migrate` adopts the base in an existing repository; a new one wants `init`.');

  // applySync first: from a vendored copy this is what refuses, and it should refuse before
  // anything else has been printed. reportSync then prints the header exactly once.
  const r = applySync(project, { force, dryRun });
  r.force = force;
  reportSync(project, r, dryRun);
  if (r.conflicts.length) {
    console.log('Nothing was written: these files carry the base\'s names but were written by hand.');
    console.log('Read them, fold anything project-specific into the overlay, then re-run with --force:');
    console.log('  each replaced file is preserved as <file>.bak.');
    process.exit(1);
  }

  // The index this base adopts routes the two overlay files beside the vendored rules, so they
  // have to exist — an adopted index that references a missing file fails the project's own guard.
  const scaffold = scaffoldProject(project, { dryRun, includeIndex: false });
  if (scaffold.created.length) {
    console.log(`${dryRun ? 'would scaffold' : 'scaffolded'} project-owned file(s) (${scaffold.created.length}):`);
    for (const c of scaffold.created) console.log(`  ${c}`);
    console.log('');
  }
  if (scaffold.kept.length) {
    console.log(`project-owned, kept: ${scaffold.kept.join(', ')}\n`);
  }

  // Index adoption. Replacing one is destructive by nature, so it is opt-in and always backed up.
  const existed = fs.existsSync(path.join(project, INDEX_NAME));
  let index = { action: 'none', backup: null };
  if (replaceIndex || !existed) index = writeIndex(project, { replace: true, dryRun });
  else if (adoptIndex) index = writeIndex(project, { replace: false, dryRun });
  const labels = {
    created: 'created — this project had no index',
    replaced: `replaced (original kept as ${INDEX_BACKUP})`,
    kept: 'kept — an index already exists (--replace-index overwrites it, after a backup)',
    current: 'kept — already the templated index',
    none: 'kept — an index already exists (--replace-index overwrites it, after a backup)',
  };
  console.log(`index   : ${labels[index.action]}\n`);

  const pointers = scaffoldPointers(project, { dryRun });
  if (pointers.created.length) {
    console.log(`${dryRun ? 'would create' : 'created'} entry-point pointer(s) (${pointers.created.length}):`);
    for (const c of pointers.created) console.log(`  ${c}`);
    console.log('');
  }
  if (pointAt.length) {
    const pointed = pointAtIndex(project, pointAt, { dryRun, force });
    if (pointed.done.length) {
      console.log(`${dryRun ? 'would point' : 'pointed'} at ${INDEX_NAME} (${pointed.done.length}):`);
      for (const p of pointed.done) console.log(`  ${p}`);
    }
    if (pointed.skipped.length) {
      console.log(`already exist, left alone (--force replaces, after a backup): ${pointed.skipped.join(', ')}`);
    }
    console.log('');
  }

  // The old corpus. Retiring moves it out of the rule dirs; it never deletes anything.
  const legacy = findLegacyRules(project, r.lockFiles);
  if (legacy.length) {
    console.log(`rule files the base did not write (${legacy.length}):`);
    for (const l of legacy) console.log(`  ${l}`);
    if (retire) {
      const retired = retireLegacy(project, legacy, { dryRun });
      if (retired.moved.length) {
        console.log(`\n${dryRun ? 'would retire' : 'retired'} into ${LEGACY_DIR}/ (${retired.moved.length}):`);
        for (const m of retired.moved) console.log(`  ${m}`);
        console.log('  Nothing was deleted — they stay in the repository as reference, out of the rule paths.');
      }
      if (retired.refused.length) {
        console.log(`\ncould not retire (already present in ${LEGACY_DIR}/): ${retired.refused.join(', ')}`);
      }
      // A row in an index the project kept can outlive the file it names. Say so here rather than
      // letting it surface later as an unexplained MISSING from the guard.
      const keptIndex = path.join(project, INDEX_NAME);
      const indexText = fs.existsSync(keptIndex) ? fs.readFileSync(keptIndex, 'utf8') : '';
      const dangling = legacy.filter((rel) => indexText.includes(rel));
      if (dangling.length) {
        console.log(`\n  ${INDEX_NAME} still references ${dangling.length} retired path(s) — point those rows at ${LEGACY_DIR}/`);
        console.log('  or delete them, or the guard will report them MISSING:');
        for (const d of dangling) console.log(`    ${d} → ${LEGACY_DIR}/${d.slice('.agents/'.length)}`);
      }
    } else {
      console.log('  Fold anything project-specific into .agents/rules/project-truth.md or');
      console.log('  project-conventions.md first, then retire the rest with --retire.');
    }
    console.log('');
  }

  const entries = reportEntryPoints(project, { strict: requireClean });
  if (!dryRun) {
    const verdict = runIndexCheck(project);
    if (verdict.ok) {
      console.log('result  : ok — every rule file and pointer is reachable from AGENTS.md.');
    } else {
      console.log('result  : FAILED — the index does not route everything.\n');
      reportIndexFail(project, verdict, { migration: true });
      process.exit(1);
    }
  }

  const remaining = (legacy.length && !retire ? legacy.length : 0) + entries.stale.length;
  if (requireClean && remaining) {
    console.log(`\n--require-clean: ${remaining} unresolved item(s) — the migration is not finished.`);
    process.exit(1);
  }
  if (remaining) {
    console.log(`\n${remaining} item(s) still need a human decision (see above). Re-run with --require-clean to gate on them.`);
  }
  console.log('\nNext:');
  console.log('  1. Fold the old corpus\'s project-specific facts into .agents/rules/project-truth.md');
  console.log('     and project-conventions.md — a rule you delete is a rule you lose.');
  console.log('  2. Route the project\'s own skills from AGENTS.md (the base vendors rules, never skills).');
  console.log('  3. Run: node .agents/bin/check-index.mjs && node .agents/bin/rules-sync.mjs check');
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
else if (cmd === 'init') cmdInit(rest);
else if (cmd === 'migrate') cmdMigrate(rest);
else if (cmd === 'check') cmdCheck(rest);
else {
  console.error('usage:\n' +
    '  rules-sync sync    --into <projectDir> [--force] [--dry-run]\n' +
    '  rules-sync init    --into <projectDir> [--force] [--dry-run]\n' +
    '  rules-sync migrate --into <projectDir> [--adopt-index | --replace-index] [--retire]\n' +
    '                     [--point-at-index <rel>]... [--require-clean] [--force] [--dry-run]\n' +
    '  rules-sync check [--project <projectDir>]');
  process.exit(2);
}
