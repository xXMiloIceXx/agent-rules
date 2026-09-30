#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(__dirname, 'rules-sync.mjs');

const COMMANDS = ['init', 'sync', 'migrate', 'check'];
const userArgs = process.argv.slice(2);
let finalArgs = userArgs;

if (finalArgs.length === 0) {
  finalArgs = ['init', '--into', '.'];
} else if (!COMMANDS.includes(finalArgs[0])) {
  finalArgs = ['init', '--into', '.', ...finalArgs];
} else if ((finalArgs[0] === 'init' || finalArgs[0] === 'sync') && !finalArgs.includes('--into')) {
  finalArgs = [finalArgs[0], '--into', '.', ...finalArgs.slice(1)];
}

const res = spawnSync(process.execPath, [syncScript, ...finalArgs], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

process.exit(res.status ?? 0);
