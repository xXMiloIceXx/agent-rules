#!/usr/bin/env node
/**
 * setup — the `npx agent-rules` entry point.
 *
 * This is an argument mapper and nothing else.
 *
 * It used to append ignore rules to `.git/info/exclude` itself, on its own initiative. That made
 * the two documented entry points behave differently — `node bin/rules-sync.mjs init` never ignored
 * anything — so whether your rules got pushed depended on which command you happened to type. Worse,
 * it excluded paths that were already tracked, where an ignore rule does nothing at all, so the
 * promise held only until the first time it mattered.
 *
 * Hiding now lives in `rules-sync local`: checked against git, reversible with `--restore`, and the
 * same whichever entry point you use.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(__dirname, 'rules-sync.mjs');

const COMMANDS = ['init', 'sync', 'local', 'migrate', 'learn', 'journal', 'check'];
const args = process.argv.slice(2);
const first = args[0];

// Commands whose project defaults to the current directory when --into is omitted.
const CWD_DEFAULT = new Set(['init', 'sync', 'local']);

let finalArgs;
if (args.includes('--help') || args.includes('-h')) {
  finalArgs = [];
} else if (args.length === 0) {
  // The bare invocation is the "just make it work here, do not add anything to my repository" case
  // this wrapper always meant. It is now an explicit, checked mode instead of a side effect.
  finalArgs = ['local', '--into', '.'];
} else if (COMMANDS.includes(first)) {
  finalArgs = CWD_DEFAULT.has(first) && !args.includes('--into')
    ? [first, '--into', '.', ...args.slice(1)]
    : args;
} else {
  finalArgs = ['local', '--into', '.', ...args];
}

if (finalArgs[0] === 'local' && !finalArgs.includes('--dry-run') && !finalArgs.includes('--restore')) {
  console.log('npx agent-rules → local mode: the rules stay out of git and are never pushed.\n');
  console.log('  Version them in the repository instead:  npx agent-rules init');
  console.log('  Undo the local ignore later:             npx agent-rules local --restore\n');
}

const res = spawnSync(process.execPath, [syncScript, ...finalArgs], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

process.exit(res.status ?? 0);
