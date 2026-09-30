#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(__dirname, 'rules-sync.mjs');

const COMMANDS = ['init', 'sync', 'migrate', 'check'];
const userArgs = process.argv.slice(2);
let finalArgs = userArgs;

const isDryRun = finalArgs.includes("--dry-run");
const isInit = finalArgs.length === 0 || finalArgs[0] === 'init' || (!COMMANDS.includes(finalArgs[0]) && !finalArgs.includes('--help'));

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

// 自动写入项目的私有 .git/info/exclude，实现纯本地隐形 ignore（编辑器自动变灰，不污染项目代码）
if (res.status === 0 && isInit && !isDryRun) {
  const gitInfoDir = path.join(process.cwd(), '.git', 'info');
  const excludePath = path.join(gitInfoDir, 'exclude');
  const entriesToIgnore = ['.agents/', 'AGENTS.md', '.github/workflows/agent-rules.yml'];

  if (fs.existsSync(gitInfoDir)) {
    let existingContent = '';
    if (fs.existsSync(excludePath)) {
      existingContent = fs.readFileSync(excludePath, 'utf8');
    }
    const missing = entriesToIgnore.filter(e => !existingContent.includes(e));
    if (missing.length > 0) {
      const prefix = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n" : "";
      const toAppend = prefix + "\n# AI Agent Rules (private local ignore)\n" + missing.join("\n") + "\n";
      fs.appendFileSync(excludePath, toAppend, 'utf8');
      console.log('\x1b[32m✔ Added rules to .git/info/exclude (clean, zero-commit local ignore — editor will display in grey)\x1b[0m');
    }
  }
}

process.exit(res.status ?? 0);
