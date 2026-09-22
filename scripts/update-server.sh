#!/usr/bin/env bash
set -Eeuo pipefail

# Publish the current commit to the production bare repository and run the
# server's deployment script. Run this from the local CAPI checkout:
#
#   bun run update:server
#
# Override defaults when necessary:
#   DEPLOY_HOST=... DEPLOY_KEY=... bun run update:server

APP_DIR="${APP_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
BRANCH="${BRANCH:-main}"
DEPLOY_HOST="${DEPLOY_HOST:-token.minapp.xin}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_KEY="${DEPLOY_KEY:-${HOME}/code/ssh/keys/shared_dev_rsa}"
REMOTE_APP="${REMOTE_APP:-/data/capi}"
REMOTE_REPO="${REMOTE_REPO:-/data/capi.git}"
REMOTE_DEPLOY_SCRIPT="${REMOTE_DEPLOY_SCRIPT:-${REMOTE_APP}/deploy.sh}"
REMOTE_HOOK="${REMOTE_HOOK:-${REMOTE_REPO}/hooks/post-receive}"
SERVER="${DEPLOY_USER}@${DEPLOY_HOST}"

log() { printf '[capi-update] %s\n' "$*"; }
fail() { printf '[capi-update] ERROR: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || fail 'git is required'
command -v ssh >/dev/null || fail 'ssh is required'
[[ -r "$DEPLOY_KEY" ]] || fail "SSH key not readable: $DEPLOY_KEY"

cd "$APP_DIR"
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "not a git checkout: $APP_DIR"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || fail "checked out branch is not $BRANCH"
[[ -z "$(git status --porcelain)" ]] || fail 'working tree is not clean; commit or stash changes before deploying'
git diff --check

SSH_OPTIONS=(-i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes)
GIT_SSH_COMMAND="ssh -i '$DEPLOY_KEY' -o IdentitiesOnly=yes -o BatchMode=yes"

log "Checking $SERVER"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "test -d '$REMOTE_APP' && test -f '$REMOTE_DEPLOY_SCRIPT'"
if ssh "${SSH_OPTIONS[@]}" "$SERVER" "test -x '$REMOTE_HOOK'"; then
  REMOTE_HAS_HOOK=true
else
  REMOTE_HAS_HOOK=false
fi

log "Pushing $BRANCH to $SERVER:$REMOTE_REPO"
GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git push "$SERVER:$REMOTE_REPO" "$BRANCH:$BRANCH"

if [[ "$REMOTE_HAS_HOOK" == true ]]; then
  log "Remote post-receive hook completed deployment"
else
  log 'Running the server deployment script'
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "cd '$REMOTE_APP' && bash '$REMOTE_DEPLOY_SCRIPT'"
fi

log "Deployment finished: $(git rev-parse --short HEAD)"
