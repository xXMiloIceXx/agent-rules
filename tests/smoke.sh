#!/usr/bin/env bash
#
# The smoke tests, in one file.
#
# They used to live inline in `.github/workflows/validate-rules.yml`, which meant they could only be
# run by pushing. Every assertion below is a promise this tool makes in its README, so the point is
# that each one fails loudly when the promise stops being true.
#
# Run from the repository root: `bash tests/smoke.sh`
#
# Every fixture is a scratch git repository under a temp directory. Nothing touches this checkout.

set -euo pipefail

pass() { echo "  ok   $*"; }
fail() { echo "  FAIL $*"; exit 1; }

echo "=== init: vendor the rules and scaffold what makes them reachable ==="
{
  scratch="$(mktemp -d)"
  git init -q "$scratch"
  node bin/rules-sync.mjs init --into "$scratch" > /dev/null
  node bin/rules-sync.mjs sync --into "$scratch" > /dev/null
  node "$scratch/.agents/bin/rules-sync.mjs" check --project "$scratch" > /dev/null
  node "$scratch/.agents/bin/check-index.mjs" --project "$scratch" > /dev/null

  test -f "$scratch/AGENTS.md"
  test -f "$scratch/.agents/rules/project-truth.md"
  test -f "$scratch/.agents/AGENTS.md"
  test -f "$scratch/.agents/claude/CLAUDE.md"
  test -f "$scratch/.agents/codex/AGENTS.md"
  # No placeholder may survive into a scaffolded file.
  ! grep -rq '{{' "$scratch/AGENTS.md" "$scratch/.agents/rules/project-truth.md"
  # A second sync must be a no-op, or every refresh produces a diff in every project.
  node bin/rules-sync.mjs sync --into "$scratch" --dry-run | grep -q 'already up to date'
  pass "init, sync and both guards"
}

echo "=== migrate: adopt a project that already has rules of its own ==="
{
  legacy="$(mktemp -d)/legacy-project"
  git init -q "$legacy"
  mkdir -p "$legacy/.agents/shared"
  printf '# Old index\n\nRead `.agents/rules/old.md` for everything.\n' > "$legacy/AGENTS.md"
  printf '# Old corpus\n' > "$legacy/.agents/shared/permissions.md"

  # A sync must not claim success while the project's index routes nothing it wrote.
  if node bin/rules-sync.mjs sync --into "$legacy" > /dev/null 2>&1; then
    fail "sync reported success against a foreign index"
  fi
  pass "sync refuses an index that routes nothing it wrote"

  node bin/rules-sync.mjs migrate --into "$legacy" --replace-index --retire > /dev/null
  node "$legacy/.agents/bin/check-index.mjs" --project "$legacy" > /dev/null
  node "$legacy/.agents/bin/rules-sync.mjs" check --project "$legacy" > /dev/null
  test -f "$legacy/AGENTS.md.pre-migrate.bak"
  grep -q 'old.md' "$legacy/AGENTS.md.pre-migrate.bak"
  test -f "$legacy/.agents/legacy/shared/permissions.md"
  ! test -f "$legacy/.agents/shared/permissions.md"
  pass "migrate adopted the index, kept the original, retired the corpus"

  # A name collision aborts BEFORE writing: no lock, no sibling, no damage.
  conflict="$(mktemp -d)/conflict-project"
  git init -q "$conflict"
  mkdir -p "$conflict/.agents/rules"
  printf '# hand written rules\n' > "$conflict/.agents/rules/00-core.md"
  if node bin/rules-sync.mjs sync --into "$conflict" > /dev/null 2>&1; then
    fail "sync did not refuse a hand-written rule file"
  fi
  ! test -f "$conflict/.agents/rules.lock.json"
  ! test -f "$conflict/.agents/rules/01-security.md"
  grep -q 'hand written rules' "$conflict/.agents/rules/00-core.md"
  pass "a name collision writes nothing at all"

  node bin/rules-sync.mjs migrate --into "$conflict" --force --replace-index > /dev/null
  grep -q 'hand written rules' "$conflict/.agents/rules/00-core.md.bak"
  node "$conflict/.agents/bin/check-index.mjs" --project "$conflict" > /dev/null
  pass "--force replaces it but keeps the original"
}

echo "=== local: vendor without publishing, beside another tool's rule set ==="
{
  foreign="$(mktemp -d)/boost-project"
  git init -q "$foreign"
  mkdir -p "$foreign/.ai/rules" "$foreign/.agents/skills/pest"
  printf '{"version":1}\n' > "$foreign/boost.json"
  printf '# Laravel rules\n' > "$foreign/.ai/rules/laravel.md"
  printf '<?php // installed skill\n' > "$foreign/.agents/skills/pest/SKILL.md"
  printf '# Laravel 12\n\n<laravel-boost-guidelines>\nUse Pest.\n</laravel-boost-guidelines>\n' > "$foreign/AGENTS.md"
  git -C "$foreign" add -A 2>/dev/null
  git -C "$foreign" -c user.email=a@b -c user.name=t commit -qm init
  # The copy lives OUTSIDE the fixture: an untracked file inside it would make the "git sees
  # nothing of ours" assertion below fail for the wrong reason.
  cp "$foreign/AGENTS.md" "$(dirname "$foreign")/AGENTS.md.orig"

  node bin/rules-sync.mjs local --into "$foreign" > /dev/null

  cmp -s "$foreign/AGENTS.md" "$(dirname "$foreign")/AGENTS.md.orig" \
    || fail "local mode modified a file another tool owns"
  pass "the foreign AGENTS.md comes back byte-identical"

  test -f "$foreign/.agents/AGENTS.md"
  grep -q '"index": ".agents/AGENTS.md"' "$foreign/.agents/rules.lock.json"
  pass "the index moved beside the rules and the lock records where"

  # Boost installs skills at .agents/skills too, so only the paths this base writes may be hidden.
  git -C "$foreign" ls-files --error-unmatch .agents/skills/pest/SKILL.md > /dev/null
  pass "Boost's own skill directory is still tracked"

  test -z "$(git -C "$foreign" status --porcelain)"
  pass "git sees nothing of ours — nothing here can be pushed"

  node bin/rules-sync.mjs sync --into "$foreign" > /dev/null
  grep -q '"index": ".agents/AGENTS.md"' "$foreign/.agents/rules.lock.json"
  pass "a refresh stays local instead of quietly becoming a committed project"

  # An ignore rule does nothing to a tracked file, so this must refuse rather than report a hide it
  # did not achieve.
  tracked="$(mktemp -d)/tracked-project"
  git init -q "$tracked"
  mkdir -p "$tracked/.agents/rules"
  printf '# hand written\n' > "$tracked/.agents/rules/00-core.md"
  git -C "$tracked" add -A 2>/dev/null
  git -C "$tracked" -c user.email=a@b -c user.name=t commit -qm init
  if node bin/rules-sync.mjs local --into "$tracked" > /dev/null 2>&1; then
    fail "local mode accepted a project whose rules are already tracked"
  fi
  test -z "$(git -C "$tracked" status --porcelain)"
  pass "local mode refuses a tracked tree and writes nothing"

  node bin/rules-sync.mjs local --into "$foreign" --restore > /dev/null
  ! grep -q 'agent-rules (local mode)' "$foreign/.git/info/exclude"
  pass "--restore removes the block and deletes nothing"
}

echo "=== journal: the loop from entry to promotion ==="
{
  project="$(mktemp -d)/journal-project"
  git init -q "$project"
  node bin/rules-sync.mjs init --into "$project" > /dev/null

  good="$(mktemp -d)/good.md"
  printf -- '- Trigger: the report page took 4s with 200 rows\n- Change: ReportController::index eager-loads lines.article\n- Evidence: `php artisan test --filter=ReportQueryTest`\n- Lesson: a query inside a Blade loop costs N\n- Destination: project-conventions\n- Direction: the export path has the same shape\n' > "$good"
  node bin/rules-sync.mjs learn --into "$project" --task "n+1 in the report query" --entry "$good" > /dev/null
  ls "$project/.agents/journal/"*.md > /dev/null
  pass "a valid entry is recorded"

  # A destination other than the journal requires a backticked command or path. This is the gate:
  # a lesson with no evidence may be recorded, but it may never become a rule.
  bad="$(mktemp -d)/bad.md"
  printf -- '- Trigger: it felt slow\n- Change: nothing yet\n- Evidence: it seemed bad\n- Lesson: performance matters\n- Destination: base:.agents/rules/13-performance.md\n' > "$bad"
  if node bin/rules-sync.mjs learn --into "$project" --task "vibes" --entry "$bad" > /dev/null 2>&1; then
    fail "the evidence gate let an unproven lesson through"
  fi
  test "$(grep -c '^## ' "$project/.agents/journal/"*.md)" -eq 1
  pass "the evidence gate refuses an unproven promotion"

  # The journal is history, not an old rule corpus.
  node bin/rules-sync.mjs migrate --into "$project" --retire > /dev/null
  ls "$project/.agents/journal/"*.md > /dev/null
  ! test -d "$project/.agents/legacy/journal"
  pass "--retire leaves the journal where it is"

  # A lesson filed and forgotten is the one outcome this loop exists to prevent.
  node bin/rules-sync.mjs journal --into "$project" --review | grep -q 'PENDING'
  pass "an unpromoted destination is visible"

  id="$(sed -n 's/^- Id: `\(.*\)`$/\1/p' "$project/.agents/journal/"*.md | head -1)"
  test -n "$id"
  node bin/rules-sync.mjs journal --into "$project" --promote "$id" --to .agents/rules/project-conventions.md > /dev/null
  grep -q '^- Promoted:' "$project/.agents/journal/"*.md
  node bin/rules-sync.mjs journal --into "$project" --review | grep -q 'nothing awaiting promotion'
  pass "promotion stamps the entry and clears it from the queue"

  node "$project/.agents/bin/check-index.mjs" --project "$project" > /dev/null
  node "$project/.agents/bin/rules-sync.mjs" check --project "$project" > /dev/null
  pass "both guards still pass with the journal present"
}

echo
echo "ALL SMOKE TESTS PASSED"
