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
 *   node bin/rules-sync.mjs local   --into <projectDir> [--restore] [--force] [--dry-run]
 *   node bin/rules-sync.mjs migrate --into <projectDir> [--adopt-index | --replace-index]
 *                                   [--retire] [--point-at-index <rel>]... [--require-clean]
 *                                   [--force] [--dry-run]
 *   node bin/rules-sync.mjs learn   --into <projectDir> --entry <file|-> [--dry-run]
 *   node bin/rules-sync.mjs journal --into <projectDir> [--review | --next]
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
 * `local` is for a repository whose rules must NOT be pushed — one that already carries another
 * tool's rule corpus, or that the user does not want to add files to. It vendors the same tree,
 * but only into paths git does not track, and it hides them through a delimited block in
 * `.git/info/exclude` — which is local to one clone and never committed. It refuses outright when a
 * path it must write is already tracked, because ignore rules do not affect tracked files: the
 * exclude would be a silent no-op and the rules would be pushed anyway. `--restore` removes the
 * block again, leaving the repository exactly as it was found.
 *
 * Foreign rule sets — Laravel Boost's `<laravel-boost-guidelines>` block and `.ai/` tree, another
 * harness's `CLAUDE.md` or `.cursor/rules/` — are reported and never written. We do not own those
 * files, and a tool that rewrites them will not warn us before it does.
 *
 * `learn` and `journal` close the loop: `learn` appends one evidence-gated entry per task to
 * `.agents/journal/`, and `journal` shows what is still waiting to be promoted into a rule.
 *
 * `sync`, `init`, `migrate`, `local` and `learn` need this repository and therefore refuse to run
 * from a vendored copy. `check` deliberately needs nothing: it verifies the vendored files against
 * the project's own lock, which is enough to catch a hand-edit, a deletion, or a partial sync.
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
const JOURNAL_DIR = '.agents/journal';
const INDEX_NAME = 'AGENTS.md';
/** Where the index goes when the root one is not ours to write — `local` mode only. */
const LOCAL_INDEX = '.agents/AGENTS.md';
const INDEX_BACKUP = 'AGENTS.md.pre-migrate.bak';
const MD_MARK = '<!-- GENERATED';
const JS_MARK = '// GENERATED';
/** Delimiters for the block this tool owns inside `.git/info/exclude`. Everything outside it is
 *  someone else's, so the block can be replaced and removed without reading the rest of the file. */
const EXCLUDE_OPEN = '# >>> agent-rules (local mode) >>>';
const EXCLUDE_CLOSE = '# <<< agent-rules (local mode) <<<';

/**
 * Ownership markers belonging to another tool. A file carrying one is not ours: we name the owner
 * and write nothing.
 *
 * Laravel Boost's marker is read off its source: `GuidelineWriter` replaces only the FIRST block
 * between these tags and does so in place, so content outside the block is preserved verbatim and
 * keeps its position. Coexistence is therefore possible — but it depends on a third party's
 * undocumented ordering, and if that ever changes our rules go quiet with no error. So the rule
 * here is stricter than Boost requires: we never write these files at all, and hand the decision
 * to the human with the evidence attached.
 */
const FOREIGN_MARKERS = [
  { owner: 'Laravel Boost', open: '<laravel-boost-guidelines>', close: '</laravel-boost-guidelines>' },
];

/**
 * Paths owned outright by another tool. Reported, never written, never excluded from git.
 *
 * `.agents/` is NOT on this list as a directory, and must not be: Laravel Boost installs skills
 * into `.agents/skills/` for Antigravity, Codex, Amp and Zed, so a blanket `.agents/` ignore would
 * quietly untrack Boost's own files. `local` therefore excludes only the paths this base writes.
 */
const FOREIGN_PATHS = [
  { rel: 'boost.json', owner: 'Laravel Boost', note: 'install-state cache; `boost:install` without flags rewrites it and drops unknown keys' },
  { rel: '.ai', owner: 'Laravel Boost', note: 'rules, guidelines and skills — `.ai/rules/boost/` is deleted on every install or update' },
  { rel: '.mcp.json', owner: 'MCP client', note: 'MCP server config' },
  { rel: 'opencode.json', owner: 'OpenCode', note: 'MCP config' },
  { rel: 'opencode.jsonc', owner: 'OpenCode', note: 'MCP config' },
  { rel: '.cursor', owner: 'Cursor', note: 'rules, skills and MCP config' },
  { rel: '.claude', owner: 'Claude Code', note: 'skills and settings' },
  { rel: '.junie', owner: 'Junie', note: 'skills and MCP config' },
  { rel: '.kiro', owner: 'Kiro', note: 'skills and MCP config' },
  { rel: '.factory', owner: 'Factory Droid', note: 'skills and MCP config' },
  { rel: '.grok', owner: 'Grok Build', note: 'skills and MCP config' },
  { rel: '.pi', owner: 'Pi', note: 'skills' },
  { rel: '.zed', owner: 'Zed', note: 'settings and context servers' },
  { rel: '.amp', owner: 'Amp', note: 'settings and MCP servers' },
  { rel: '.codex', owner: 'Codex', note: 'MCP config' },
  { rel: '.vscode', owner: 'VS Code / Copilot', note: 'MCP servers' },
  { rel: '.github/skills', owner: 'GitHub Copilot', note: 'skills — the rest of .github is the project\'s, so this is matched as a path, not a directory prefix' },
];

/** Skills directory Boost shares with this base's project-local skills. */
const SHARED_SKILLS = '.agents/skills';

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

// ---------------------------------------------------------------------------------------------
// Ownership — what is ours, what is another tool's, and what git would actually publish.
//
// "Do not upload these" is a claim about git, not about intent, so it is checked against git. An
// ignore rule is a no-op on a tracked file: excluding one hides nothing and the file is pushed
// anyway. That is the failure this section exists to make impossible to hit silently.
// ---------------------------------------------------------------------------------------------

let trackedCache = { project: null, set: null };

/** Every path git tracks in `project`. `undefined` when git cannot answer, so callers can say
 *  "unknown" rather than read a failed command as "nothing is tracked" — the dangerous direction. */
function trackedSet(project) {
  if (trackedCache.project === project) return trackedCache.set;
  let set;
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: project, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    set = new Set(out.split('\0').filter(Boolean).map(posix));
  } catch {
    set = undefined;
  }
  trackedCache = { project, set };
  return set;
}

/** The first tracked path at or under `rel`, or null. */
function trackedUnder(project, rel) {
  const set = trackedSet(project);
  if (!set) return null;
  const clean = posix(rel).replace(/\/+$/, '');
  for (const f of set) if (f === clean || f.startsWith(clean + '/')) return f;
  return null;
}

const excludeFile = (project) => path.join(project, '.git', 'info', 'exclude');

const readExclude = (project) => {
  const p = excludeFile(project);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

/** The span this tool owns inside `.git/info/exclude`, or null. Everything outside it belongs to
 *  someone else and is never read, rewritten or reordered. */
function excludeBlock(text) {
  const open = text.indexOf(EXCLUDE_OPEN);
  if (open === -1) return null;
  const close = text.indexOf(EXCLUDE_CLOSE, open);
  if (close === -1) return null;
  return { start: open, end: close + EXCLUDE_CLOSE.length };
}

const renderExcludeBlock = (rels) => `${EXCLUDE_OPEN}\n${rels.join('\n')}\n${EXCLUDE_CLOSE}`;

function writeExclude(project, rels, { dryRun }) {
  const p = excludeFile(project);
  const current = readExclude(project);
  const block = renderExcludeBlock(rels);
  const span = excludeBlock(current);
  let next;
  if (span) {
    next = current.slice(0, span.start) + block + current.slice(span.end);
  } else {
    const lead = current === '' ? '' : (current.endsWith('\n') ? '\n' : '\n\n');
    next = current + lead + block + '\n';
  }
  if (next === current) return { path: p, changed: false };
  if (!dryRun) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, next, 'utf8');
  }
  return { path: p, changed: true };
}

function removeExclude(project, { dryRun }) {
  const p = excludeFile(project);
  const current = readExclude(project);
  const span = excludeBlock(current);
  if (!span) return { path: p, changed: false };
  let { start, end } = span;
  if (current[end] === '\n') end += 1;
  // Take back exactly the one blank line the block was separated by — not every blank run in the
  // file, which would be someone else's formatting.
  if (start >= 2 && current.slice(start - 2, start) === '\n\n') start -= 1;
  const next = current.slice(0, start) + current.slice(end);
  if (!dryRun) fs.writeFileSync(p, next, 'utf8');
  return { path: p, changed: true };
}

/** Proof rather than assertion: git must report nothing untracked under the paths we hid. */
function verifyHidden(project, rels) {
  try {
    const out = execFileSync(
      'git', ['status', '--porcelain', '--untracked-files=all', '--', ...rels],
      { cwd: project, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return { ok: out === '', output: out };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.message}`.trim() };
  }
}

/** Another tool's rule corpus: a file carrying its marker, or a path it owns. */
function foreignReport(project) {
  const seen = new Set();
  const out = [];
  const push = (e) => {
    const key = `${e.rel}\u0000${e.owner}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const f of FOREIGN_PATHS) {
    if (fs.existsSync(path.join(project, f.rel))) push({ rel: f.rel, owner: f.owner, note: f.note, kind: 'path' });
  }
  const carriers = [...new Set([...ENTRY_POINTS, ...POINTERS, INDEX_NAME, LOCAL_INDEX, 'CLAUDE.md'])]
    .map(posix).sort();
  for (const rel of carriers) {
    const p = path.join(project, rel);
    if (!fs.existsSync(p)) continue;
    let stat, text;
    try { stat = fs.statSync(p); text = stat.isFile() ? fs.readFileSync(p, 'utf8') : ''; } catch { continue; }
    for (const m of FOREIGN_MARKERS) {
      if (text.includes(m.open)) push({ rel, owner: m.owner, note: `carries \`${m.open}\``, kind: 'marker' });
    }
  }
  return out;
}

/**
 * `.agents/skills/` is claimed by both sides: this base routes the project's own skills there, and
 * Laravel Boost installs skills for Antigravity, Codex, Amp and Zed at the same path. Boost deletes
 * and re-copies an installed skill directory, so a project-local skill that shares a name with an
 * installed one is destroyed by the next `boost:update`, and there is no warning when it happens.
 */
function sharedSkills(project) {
  const dir = path.join(project, SHARED_SKILLS);
  if (!fs.existsSync(dir)) return [];
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); }
  catch { return []; }
}

function reportForeign(project, foreign) {
  if (!foreign.length) return false;
  console.log(`other tools own files here (${foreign.length}) — detected, never written:`);
  for (const f of foreign) console.log(`  ${f.rel.padEnd(28)} ${f.owner}${f.kind === 'marker' ? ` — ${f.note}` : ''}`);
  const names = [...new Set(foreign.map((f) => f.owner))];
  if (names.includes('Laravel Boost')) {
    console.log('  Boost replaces only the first `<laravel-boost-guidelines>` block, in place, and leaves');
    console.log('  content outside it untouched — but that order is Boost\'s to change, so this tool writes');
    console.log('  none of these files. If you want the index routed from one of them, add the row yourself,');
    console.log('  OUTSIDE the marker block. Nothing here was modified.');
  }
  const skills = sharedSkills(project);
  if (skills.length && names.includes('Laravel Boost')) {
    console.log(`  WARNING ${SHARED_SKILLS}/ holds ${skills.length} skill(s) (${skills.slice(0, 3).join(', ')}${skills.length > 3 ? ', …' : ''})`);
    console.log('  and Boost installs skills at that same path. A namesake would be deleted and re-copied');
    console.log('  by the next boost:update. Keep project-local skill names distinct from Boost\'s.');
  }
  console.log('');
  return true;
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
function applySync(project, { force, dryRun, index = INDEX_NAME }) {
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
    // no-op sync would produce a spurious diff every time it ran. `index` records where the entry
    // point actually is, because `local` mode may not be allowed to use the root one.
    fs.writeFileSync(path.join(project, LOCK_NAME),
      JSON.stringify({ base: 'agent-rules', revision, index: posix(index), files: lockFiles }, null, 2) + '\n', 'utf8');
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

function substitute(text, project, indexRel = INDEX_NAME) {
  const name = path.basename(project);
  return text
    .replaceAll('{{PROJECT}}', name)
    .replaceAll('{{BASE}}', posix(BASE_ROOT))
    .replaceAll('{{INDEX}}', posix(indexRel))
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

function scaffoldPointers(project, { dryRun, skip = [] }) {
  const created = [], kept = [];
  for (const rel of POINTERS) {
    if (skip.includes(posix(rel))) continue;
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

/** Other harness entry points: whether each routes to the index, and who owns it when it does not. */
function entryPointReport(project) {
  const out = [];
  for (const rel of ENTRY_POINTS) {
    const p = path.join(project, rel);
    if (!fs.existsSync(p)) continue;
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch { text = ''; }
    const owner = FOREIGN_MARKERS.find((m) => text.includes(m.open));
    out.push({ rel, ok: text.includes(INDEX_NAME), owner: owner ? owner.owner : null });
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
        // Skills are the harness's to discover, legacy is already retired, and the journal is the
        // project's own history — none of them is an old rule corpus to be moved aside.
        if (rel === SHARED_SKILLS || rel === LEGACY_DIR || rel === JOURNAL_DIR) continue;
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
function runIndexCheck(project, indexRel = INDEX_NAME) {
  const checker = path.join(project, BIN_DIR, 'check-index.mjs');
  if (!fs.existsSync(checker)) return { ok: false, output: `${posix(path.join(BIN_DIR, 'check-index.mjs'))} is missing` };
  try {
    const output = execFileSync(process.execPath, [checker, '--project', project, '--index', indexRel], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
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
  const owned = entries.filter((e) => !e.ok && e.owner);
  const stale = entries.filter((e) => !e.ok && !e.owner);
  if (!entries.length) return { stale, owned };
  console.log(`other entry points (${entries.length}):`);
  for (const e of entries) {
    const verdict = e.ok ? 'ok      ' : (e.owner ? 'THEIRS  ' : 'STALE   ');
    console.log(`  ${verdict} ${e.rel}${e.ok ? ' — points at AGENTS.md' : (e.owner ? ` — written by ${e.owner}; this tool will not touch it` : ' — does not mention AGENTS.md')}`);
  }
  if (owned.length) {
    console.log('  Content outside a foreign marker block survives that tool\'s own rewrite, so a row added');
    console.log('  there is safe — but it is your file, so this tool does not write it. To route the index:');
    console.log(`    add a line referencing \`${INDEX_NAME}\` to ${owned[0].rel}, outside any marker block.`);
  }
  if (stale.length) {
    console.log('  A stale entry point keeps applying its own rules beside the index.');
    console.log('  Fold anything still true into the overlay, then point the file at the index');
    console.log('  (--force replaces it and keeps the original as .bak):');
    console.log(`  node bin/rules-sync.mjs migrate --into "${project}" --point-at-index ${stale[0].rel} --force`);
    if (strict) console.log('  (--require-clean: this is a failure until every entry point is resolved)');
  }
  console.log('');
  return { stale, owned };
}

function cmdSync(argv) {
  const { project, force, dryRun } = requireInto(argv, 'usage: rules-sync sync --into <projectDir> [--force] [--dry-run]');
  requireGit(project, 'Use `init` to bootstrap a new project, or `migrate` for one that has rules already.');
  const indexRel = lockedIndex(project);
  const r = applySync(project, { force, dryRun, index: indexRel });
  r.force = force;
  reportSync(project, r, dryRun);
  if (r.conflicts.length) {
    console.log('Nothing was written: a conflicting file is not the base\'s to overwrite by default.');
    console.log('Review the files above, then either delete/move them or re-run with --force (which backs each one up).');
    process.exit(1);
  }
  console.log(`ok — ${r.total} file(s) accounted for.`);
  if (dryRun) return;

  const verdict = runIndexCheck(project, indexRel);
  if (!verdict.ok) {
    console.log('');
    reportIndexFail(project, verdict, { migration: true });
    process.exit(1);
  }
  console.log(`index   : ok — every vendored rule is reachable from ${indexRel}.`);
  // A local project's promise is kept by `.git/info/exclude`, and nothing else re-checks it. Losing
  // that block silently republishes the rules, so every refresh says whether it is still there.
  if (indexRel !== posix(INDEX_NAME)) {
    const span = excludeBlock(readExclude(project));
    console.log(`local   : ${span
      ? '.git/info/exclude still hides the rules; they will not be pushed.'
      : 'WARNING: the ignore block is gone — these rules are visible to git again. Re-run `local`.'}`);
  }
}

/**
 * Write the project-owned files the rules need in order to be read: the index, the two overlays
 * beside the vendored rules, and the CI guard. Never overwrites — these are the project's.
 *
 * `includeIndex: false` leaves the index to the caller, so `migrate` can report which of
 * create/keep/replace it actually did instead of finding the file already scaffolded.
 */
function scaffoldProject(project, { dryRun, indexTo = INDEX_NAME, omitTemplates = [] }) {
  const created = [], kept = [], unresolved = [];
  for (const s of SCAFFOLD) {
    // The index template can be written somewhere other than the root: `local` mode puts it beside
    // the rules when the root file belongs to another tool. `indexTo: null` means the caller owns it.
    const isIndex = s.to === INDEX_NAME;
    if (isIndex && indexTo === null) continue;
    if (omitTemplates.includes(s.template)) continue;
    const target = isIndex ? indexTo : s.to;
    const from = path.join(BASE_ROOT, 'templates', s.template);
    const to = path.join(project, target);
    if (!fs.existsSync(from)) { unresolved.push(`${s.template} (template missing in the base)`); continue; }
    if (fs.existsSync(to)) { kept.push(posix(target)); continue; }
    const body = substitute(fs.readFileSync(from, 'utf8'), project, target);
    if (body.includes('{{')) unresolved.push(`${posix(target)} (placeholder left unsubstituted)`);
    created.push(posix(target));
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

  const indexRel = lockedIndex(project);
  const r = applySync(project, { force, dryRun, index: indexRel });
  r.force = force;

  const { created, kept, unresolved } = scaffoldProject(project, { dryRun, indexTo: indexRel });
  const pointers = scaffoldPointers(project, { dryRun, skip: [indexRel] });

  reportSync(project, r, dryRun);
  reportForeign(project, foreignReport(project));
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

  const verdict = runIndexCheck(project, indexRel);
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

/** The index this project actually uses: whatever its own lock records, else the convention.
 *  `sync` and `init` must respect it — a refresh that silently moved the index back to the root
 *  would turn a local project into a committed one, or leave the rules unreachable. */
function lockedIndex(project) {
  const lock = loadLock(project);
  return lock?.index ? posix(lock.index) : posix(INDEX_NAME);
}

/**
 * The paths this base writes inside `.agents/`, and nothing else.
 *
 * `.agents/skills/` is deliberately absent. Laravel Boost installs skills at exactly that path for
 * Antigravity, Codex, Amp and Zed, so excluding `.agents/` wholesale would untrack another tool's
 * files — the kind of silent damage this mode exists to prevent.
 */
function localOwnedPaths(indexRel) {
  const out = [RULES_DIR, BIN_DIR, JOURNAL_DIR, LOCK_NAME, LEGACY_DIR];
  for (const rel of POINTERS) if (posix(rel) !== indexRel) out.push(rel);
  if (indexRel !== posix(INDEX_NAME)) out.push(indexRel);
  return [...new Set(out.map(posix))].sort();
}

/**
 * Vendor the rules without publishing them.
 *
 * Three things separate this from `init`: nothing is written to a path git already tracks (checked
 * against git, not assumed); the entry point moves to `.agents/AGENTS.md` when the root one belongs
 * to another tool; and the paths are hidden by a delimited block in `.git/info/exclude`, which is
 * local to this clone and therefore cannot itself be the thing that leaks.
 *
 * The trade is stated, not hidden: a fresh clone has no rules at all. That is the point of the mode,
 * and it is why it is not the default.
 */
function cmdLocal(argv) {
  const { project, force, dryRun } = requireInto(
    argv, 'usage: rules-sync local --into <projectDir> [--restore] [--force] [--dry-run]');
  const restore = argv.includes('--restore');
  requireGit(project, 'Local mode is a claim about what git publishes, so it needs git to check.');

  console.log(`project : ${project}`);
  console.log(`mode    : ${dryRun ? 'dry-run' : 'write'}${restore ? ' +restore' : ''}\n`);

  if (restore) {
    const r = removeExclude(project, { dryRun });
    if (!r.changed) { console.log(`no "${EXCLUDE_OPEN}" block in .git/info/exclude — nothing to restore.`); return; }
    console.log(`${dryRun ? 'would remove' : 'removed'} the agent-rules block from .git/info/exclude.`);
    console.log('Nothing was deleted: the files are still on disk and are visible to git again.');
    console.log('Re-run `local` to hide them, or `sync` to version them deliberately.');
    return;
  }

  reportForeign(project, foreignReport(project));

  // The root index is ours only if our own lock says we put it there. A root AGENTS.md we did not
  // write belongs to whoever did — Boost, a cloud agent, a human — and this mode never writes it.
  const lock = loadLock(project);
  const rootExists = fs.existsSync(path.join(project, INDEX_NAME));
  const rootIsOurs = !rootExists || lock?.index === posix(INDEX_NAME);
  const indexRel = rootIsOurs ? posix(INDEX_NAME) : LOCAL_INDEX;

  // Refuse before writing anything. An ignore rule does not apply to a tracked file, so excluding
  // one hides nothing and the rules get committed and pushed anyway — the exact outcome this mode
  // promises to prevent. Failing loudly is the only honest option; there is no flag that fixes it.
  const owned = localOwnedPaths(indexRel);
  const published = owned.map((rel) => ({ rel, hit: trackedUnder(project, rel) })).filter((x) => x.hit);
  if (published.length) {
    console.log(`refusing: ${published.length} path(s) this mode must hide are already tracked by git.\n`);
    for (const p of published) console.log(`  ${p.rel}\n    tracked: ${p.hit}`);
    console.log('\nAn ignore rule does not apply to a tracked file. The exclude would hide nothing and');
    console.log('these rules would be pushed anyway. Two honest ways out:\n');
    console.log(`  git rm -r --cached "${published[0].hit}"      # stop tracking it; the file stays on disk`);
    console.log('  node bin/rules-sync.mjs sync --into "<this project>"   # or version the rules on purpose\n');
    console.log('Nothing was written.');
    process.exit(1);
  }

  const r = applySync(project, { force, dryRun, index: indexRel });
  r.force = force;
  reportSync(project, r, dryRun);
  if (r.conflicts.length) {
    console.log('Nothing was written: a conflicting file is not the base\'s to overwrite by default.');
    process.exit(1);
  }

  // No CI workflow here, and that is not an omission: a workflow file that is hidden from git can
  // never run, and scaffolding one would imply a guard that does not exist.
  const scaffold = scaffoldProject(project, {
    dryRun, indexTo: indexRel, omitTemplates: ['workflow-agent-rules.yml'],
  });
  const pointers = scaffoldPointers(project, { dryRun, skip: [indexRel] });
  const ex = writeExclude(project, owned, { dryRun });

  console.log(`${dryRun ? 'would hide' : 'hidden'} via .git/info/exclude (${owned.length} path(s)):`);
  for (const rel of owned) console.log(`  ${rel}`);
  console.log(`  block: ${EXCLUDE_OPEN} … ${EXCLUDE_CLOSE}${ex.changed ? '' : ' (unchanged)'}\n`);
  if (scaffold.created.length) {
    console.log(`${dryRun ? 'would scaffold' : 'scaffolded'} (${scaffold.created.length}):`);
    for (const c of scaffold.created) console.log(`  ${c}`);
    console.log('');
  }
  if (pointers.created.length) {
    console.log(`${dryRun ? 'would create' : 'created'} pointer(s) (${pointers.created.length}):`);
    for (const c of pointers.created) console.log(`  ${c}`);
    console.log('');
  }
  for (const u of scaffold.unresolved) console.log(`WARNING: ${u}`);

  if (dryRun) { console.log('dry-run: nothing was written.'); return; }

  // Proof, not assertion: ask git what it can still see.
  const hidden = verifyHidden(project, owned);
  if (hidden.ok) {
    console.log('verified: git reports nothing untracked under those paths — they will not be pushed.');
  } else {
    console.log('WARNING: git still sees untracked files under the hidden paths:');
    console.log(hidden.output.split('\n').map((l) => '  ' + l).join('\n'));
    console.log('  The ignore block may be overridden by another rule, or core.excludesFile is winning.');
  }

  console.log(`\nindex   : ${indexRel}${indexRel === posix(LOCAL_INDEX) ? ' (the root AGENTS.md belongs to another tool)' : ''}`);
  if (indexRel === posix(LOCAL_INDEX)) {
    console.log(`  Nothing outside this tool reads that path on its own. If ${INDEX_NAME} is written by`);
    console.log('  another tool, add this row to it YOURSELF, outside any marker block it owns:');
    console.log('');
    console.log(`      | Anything, before the first change | \`${LOCAL_INDEX}\` |`);
    console.log('');
    console.log('  Laravel Boost replaces only its first <laravel-boost-guidelines> block, in place, and');
    console.log('  leaves content outside it untouched — so a row added there survives boost:update. This');
    console.log('  tool still will not write it, because that file is not ours and Boost may change that.');
  } else {
    console.log('  This is the root index, so a harness that reads AGENTS.md finds the rules with no setup.');
  }

  const verdict = runIndexCheck(project, indexRel);
  if (!verdict.ok) {
    console.log('\nThe project\'s own guard rejects the result:\n');
    console.log(verdict.output.split('\n').map((l) => '  ' + l).join('\n'));
    process.exit(1);
  }
  console.log('guard   : ok — every vendored rule is reachable from ' + indexRel + '.');
  console.log(`
Next:
  1. Fill in ${posix(path.join(RULES_DIR, 'project-truth.md'))} — read the manifests, do not guess.
  2. Fill in ${posix(path.join(RULES_DIR, 'project-conventions.md'))} — the real commands and layout.
  3. Undo any time with: node bin/rules-sync.mjs local --into "${project}" --restore

Remember what this mode costs: a fresh clone, a CI runner and a teammate have none of these rules.`);
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
  reportForeign(project, foreignReport(project));
  // Leaving a local ignore block in place after adopting the root index is a trap: `git add -A`
  // skips ignored paths, so the rules would stay out of the commit while everything looks fine.
  if (excludeBlock(readExclude(project))) {
    console.log('WARNING: .git/info/exclude still carries the agent-rules (local mode) block.');
    console.log('         `git add -A` skips ignored paths, so these rules would not be committed.');
    console.log('         Remove it first if this project should version them:');
    console.log(`           node bin/rules-sync.mjs local --into "${project}" --restore\n`);
  }
  if (r.conflicts.length) {
    console.log('Nothing was written: these files carry the base\'s names but were written by hand.');
    console.log('Read them, fold anything project-specific into the overlay, then re-run with --force:');
    console.log('  each replaced file is preserved as <file>.bak.');
    process.exit(1);
  }

  // The index this base adopts routes the two overlay files beside the vendored rules, so they
  // have to exist — an adopted index that references a missing file fails the project's own guard.
  const scaffold = scaffoldProject(project, { dryRun, indexTo: null });
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

  const remaining = (legacy.length && !retire ? legacy.length : 0) + entries.stale.length + entries.owned.length;
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

// ---------------------------------------------------------------------------------------------
// Self-iteration — the journal.
//
// A rule that came from a real failure is the only kind worth keeping, and a failure is forgotten
// within a week unless something writes it down while it is still in front of you. The journal is
// that record: one entry per task, appended, never rewritten, and deliberately NOT a rule file. A
// lesson becomes a rule only after it passes the promotion gate; until then it lives here, where it
// costs no prompt budget and cannot mislead anyone.
//
// The gate is mechanical rather than advisory: a Destination other than `journal` requires an
// Evidence field containing a backticked command or path. A lesson with no evidence can be recorded
// but can never be promoted — which is the whole difference between a rule base that accumulates
// hard-won lessons and one that accumulates plausible-sounding ones.
// ---------------------------------------------------------------------------------------------

const JOURNAL_FIELDS = ['Trigger', 'Change', 'Evidence', 'Lesson', 'Destination'];
/** Where a lesson may go. `base:` and `stack:` name a path in the base repository, so a lesson about
 *  the tool itself has somewhere to land that is not a rule file. */
const DESTINATIONS = /^(journal|project-truth|project-conventions|(base|stack|project):[A-Za-z0-9._/-]+)$/;

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

const journalFile = (project, date) => path.join(project, JOURNAL_DIR, `${date.slice(0, 7)}.md`);

/** The bullet fields of an entry, however the author spaced them. A leading byte-order mark is
 *  stripped: on Windows a BOM is what a plain `Set-Content` writes, and without this the first
 *  line silently stops being a field and the entry is rejected as "missing Trigger". */
function parseEntryFields(text) {
  const fields = {};
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^-\s*([A-Za-z]+)\s*:\s*(.*)$/);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

/** Every entry in the journal, oldest first. The heading carries date and slug; the id is explicit
 *  so promoting an entry is a lookup rather than a fuzzy text match. */
function readJournal(project) {
  const dir = path.join(project, JOURNAL_DIR);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const chunk of text.split(/^## /m).slice(1)) {
      const [heading, ...rest] = chunk.split(/\r?\n/);
      out.push({ rel: posix(path.join(JOURNAL_DIR, name)), heading: heading.trim(), fields: parseEntryFields(rest.join('\n')) });
    }
  }
  return out;
}

const idOf = (entry) => (entry.fields.id ?? '').replace(/`/g, '').trim();

function renderEntry(date, task, fields) {
  const lines = [
    `## ${date} · ${task}`,
    '',
    `- Id: \`${fields.id}\``,
    `- Trigger: ${fields.trigger}`,
    `- Change: ${fields.change}`,
    `- Evidence: ${fields.evidence}`,
    `- Lesson: ${fields.lesson}`,
    `- Destination: ${fields.destination}`,
  ];
  if (fields.direction) lines.push(`- Direction: ${fields.direction}`);
  return lines.join('\n') + '\n';
}

function parseEntryInput(text, { task, date }) {
  const fields = parseEntryFields(text);
  // A task that taught nothing is a real outcome. Forcing the author to invent a lesson is how a
  // journal fills with noise, so `<none>` and a blank Lesson are both accepted — and neither can
  // ever be promoted, because the gate below refuses a destination without evidence.
  if (!fields.lesson || !fields.lesson.trim()) fields.lesson = '<none>';
  const missing = JOURNAL_FIELDS.filter((f) => !fields[f.toLowerCase()]);
  if (missing.length) return { error: `entry is missing: ${missing.join(', ')}` };

  const destination = fields.destination.replace(/`/g, '').trim();
  if (!DESTINATIONS.test(destination)) {
    return { error: `Destination "${destination}" is not one of: journal, project-truth, project-conventions, base:<path>, stack:<path>, project:<path>` };
  }
  // The gate.
  if (destination !== 'journal' && !/`[^`]+`/.test(fields.evidence)) {
    return {
      error: 'Destination is not `journal`, so Evidence must contain a backticked command or path.\n' +
        '       A lesson with no evidence may be recorded with Destination: journal, but it can never\n' +
        '       become a rule — that gate is the only thing separating a lesson from an opinion.',
    };
  }
  return {
    value: {
      id: fields.id?.replace(/`/g, '').trim() || `${date}-${slugify(task)}`,
      trigger: fields.trigger, change: fields.change, evidence: fields.evidence,
      lesson: fields.lesson, destination: `\`${destination}\``, direction: fields.direction ?? '',
    },
  };
}

function cmdLearn(argv) {
  const usage = 'usage: rules-sync learn --into <projectDir> --task "<slug>" --entry <file|-> [--date YYYY-MM-DD] [--dry-run]';
  const { project, dryRun } = requireInto(argv, usage);
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const task = arg('--task');
  const entryPath = arg('--entry');
  if (!task || !entryPath) { console.error(usage); process.exit(2); }
  const date = arg('--date') ?? new Date().toISOString().slice(0, 10);

  let text;
  try {
    text = entryPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(entryPath), 'utf8');
  } catch (err) {
    console.error(`error: cannot read the entry from ${entryPath}: ${err.message}`);
    process.exit(2);
  }

  const parsed = parseEntryInput(text, { task, date });
  if (parsed.error) { console.error(`error: ${parsed.error}`); process.exit(1); }

  const existing = readJournal(project);
  if (existing.some((e) => idOf(e) === parsed.value.id)) {
    console.error(`error: entry id "${parsed.value.id}" already exists in ${JOURNAL_DIR}.`);
    console.error('       Pick a more specific --task, or pass --date to record it on another day.');
    process.exit(1);
  }

  const to = journalFile(project, date);
  const rel = posix(path.relative(project, to));
  const body = renderEntry(date, task, parsed.value);
  console.log(`project : ${project}`);
  console.log(`entry   : ${parsed.value.id}`);
  console.log(`update  : ${rel}\n`);
  console.log(body.split('\n').map((l) => '  ' + l).join('\n'));
  if (parsed.value.destination !== '`journal`') {
    console.log(`\nDestination is ${parsed.value.destination} — promote it with:`);
    console.log(`  node bin/rules-sync.mjs journal --into "${project}" --promote ${parsed.value.id} --to <path>`);
  }
  if (dryRun) { console.log('\ndry-run: nothing was written.'); return; }

  if (!fs.existsSync(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, `# Agent journal — ${date.slice(0, 7)}\n\nOne entry per task, appended and never rewritten. See \`03-iteration.md\`.\n`, 'utf8');
  }
  fs.appendFileSync(to, `\n${body}`, 'utf8');
  console.log(`\nok — appended to ${rel}.`);
}

function cmdJournal(argv) {
  const { project, dryRun } = requireInto(argv, 'usage: rules-sync journal --into <projectDir> [--review | --next | --promote <id> --to <path>]');
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const entries = readJournal(project);
  const promote = arg('--promote');

  if (promote) {
    const to = arg('--to');
    if (!to) { console.error('error: --promote needs --to <path> (the file the lesson was folded into).'); process.exit(2); }
    const entry = entries.find((e) => idOf(e) === promote);
    if (!entry) { console.error(`error: no journal entry with id "${promote}".`); process.exit(1); }
    if (!fs.existsSync(path.join(project, to))) {
      console.error(`error: ${to} does not exist. Promote into a file that is actually there.`);
      process.exit(1);
    }
    const stamp = `- Promoted: \`${posix(to)}\` @ ${new Date().toISOString().slice(0, 10)}`;
    const file = path.join(project, entry.rel);
    const text = fs.readFileSync(file, 'utf8');
    const updated = text.replace(
      new RegExp(`(## ${entry.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n(?:.|\\n)*?)(?=\\n## |$)`, ''),
      (block) => `${block.replace(/\s+$/, '')}\n${stamp}\n`
    );
    if (updated === text) { console.error('error: could not locate the entry to stamp. Nothing was written.'); process.exit(1); }
    if (dryRun) { console.log(`would stamp ${entry.rel}:\n  ${stamp}`); return; }
    fs.writeFileSync(file, updated, 'utf8');
    console.log(`promoted ${promote} → ${to}\n  ${stamp}`);
    console.log('The lesson is now in a file the index routes, which is the only place it can be read.');
    return;
  }

  console.log(`project : ${project}`);
  if (!entries.length) {
    console.log(`journal : empty — nothing in ${JOURNAL_DIR}/ yet.`);
    console.log('\nRecord the next task with:');
    console.log('  node bin/rules-sync.mjs learn --into "<project>" --task "<slug>" --entry <file>');
    return;
  }

  const promoted = (e) => /^-\s*Promoted:/m.test(fs.readFileSync(path.join(project, e.rel), 'utf8'));
  const rows = entries.map((e) => ({
    id: idOf(e), heading: e.heading,
    destination: (e.fields.destination ?? '').replace(/`/g, ''),
    direction: e.fields.direction ?? '',
    promoted: promoted(e),
  }));

  const nextOnly = argv.includes('--next');
  const reviewOnly = argv.includes('--review');
  const shown = nextOnly
    ? rows.filter((r) => r.direction)
    : reviewOnly ? rows.filter((r) => r.destination && r.destination !== 'journal') : rows;

  console.log(`journal : ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}\n`);
  if (nextOnly) {
    console.log('open directions:');
    for (const r of shown) console.log(`  ${r.heading}\n    → ${r.direction}`);
    if (!shown.length) console.log('  (none recorded)');
    return;
  }
  for (const r of shown) {
    const state = r.destination === 'journal' ? 'journal only' : (r.promoted ? 'promoted' : 'PENDING');
    console.log(`  ${state.padEnd(12)} ${r.heading}${r.destination === 'journal' ? '' : `  → ${r.destination}`}`);
  }
  const queue = rows.filter((r) => r.destination && r.destination !== 'journal' && !r.promoted);
  console.log('');
  if (queue.length) {
    console.log(`${queue.length} awaiting promotion. Fold the lesson into the target file, then stamp it:`);
    console.log(`  node bin/rules-sync.mjs journal --into "${project}" --promote ${queue[0].id} --to <path>`);
    console.log('A destination that never gets promoted is a lesson that was recorded and then lost.');
  } else if (reviewOnly) {
    console.log('nothing awaiting promotion.');
  }
  const directions = rows.filter((r) => r.direction).length;
  if (directions && !reviewOnly) console.log(`${directions} entr${directions === 1 ? 'y' : 'ies'} recorded a direction: node bin/rules-sync.mjs journal --into "${project}" --next`);
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
  // A lock that records an index which is no longer there means the rules are unreachable while
  // every individual file still matches. Say so rather than reporting a green check.
  const indexRel = lock.index ?? INDEX_NAME;
  if (!fs.existsSync(path.join(project, indexRel))) problems.push(`MISSING   ${indexRel}  (the index this lock names)`);
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
else if (cmd === 'local') cmdLocal(rest);
else if (cmd === 'migrate') cmdMigrate(rest);
else if (cmd === 'learn') cmdLearn(rest);
else if (cmd === 'journal') cmdJournal(rest);
else if (cmd === 'check') cmdCheck(rest);
else {
  console.error('usage:\n' +
    '  rules-sync sync    --into <projectDir> [--force] [--dry-run]\n' +
    '  rules-sync init    --into <projectDir> [--force] [--dry-run]\n' +
    '  rules-sync local   --into <projectDir> [--restore] [--force] [--dry-run]\n' +
    '  rules-sync migrate --into <projectDir> [--adopt-index | --replace-index] [--retire]\n' +
    '                     [--point-at-index <rel>]... [--require-clean] [--force] [--dry-run]\n' +
    '  rules-sync learn   --into <projectDir> --task "<slug>" --entry <file|-> [--date YYYY-MM-DD]\n' +
    '  rules-sync journal --into <projectDir> [--review | --next | --promote <id> --to <path>]\n' +
    '  rules-sync check [--project <projectDir>]');
  process.exit(2);
}
