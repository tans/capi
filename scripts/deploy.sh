#!/usr/bin/env bash
set -Eeuo pipefail

die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }
usage() { printf 'Usage: %s <minapp|jisuhudong|both> [--dry-run] [git-ref]\n' "$0"; }

[[ $# -gt 0 ]] || { usage; exit 2; }
if [[ "$1" == -h || "$1" == --help ]]; then usage; exit 0; fi
target=$1
shift
dry_run=false
ref=origin/main
ref_set=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    -h|--help) usage; exit 0 ;;
    *) [[ "$ref_set" == false ]] || die 'specify one Git ref at most'; ref=$arg; ref_set=true ;;
  esac
done
case "$target" in
  minapp|jisuhudong|both) ;;
  *) usage >&2; die "unknown target: $target" ;;
esac

repo=$(git rev-parse --show-toplevel)
cd "$repo"
for tool in git npm go ssh rsync curl; do
  command -v "$tool" >/dev/null || die "$tool is required"
done
git fetch --quiet origin main
commit=$(git rev-parse --verify "$ref^{commit}") || die "cannot resolve $ref"
git merge-base --is-ancestor "$commit" origin/main || die 'release ref must be in origin/main history'
version=${commit:0:12}
tmp=$(mktemp -d "${TMPDIR:-/tmp}/capi-release.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
src="$tmp/src"
mkdir -p "$src"

printf 'Building CAPI %s from %s\n' "$version" "$commit"
git archive "$commit" | tar -x -f - -C "$src"
(cd "$src" && npm --prefix web ci && npm --prefix web run build)
(cd "$src" && go vet -tags webui_dist ./... && go test -tags webui_dist ./...)
mkdir -p "$tmp/release"
(cd "$src" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -tags webui_dist -trimpath \
  -ldflags="-s -w -X main.version=$commit" -o "$tmp/release/capi" ./cmd/capi)
chmod 0755 "$tmp/release/capi"
(cd "$src" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
  -ldflags="-s -w" -o "$tmp/release/capi-admin" ./cmd/capi-admin)
chmod 0755 "$tmp/release/capi-admin"
if [[ "$dry_run" == true ]]; then
  printf 'Dry run passed; would deploy %s to %s. Servers unchanged.\n' "$version" "$target"
  exit 0
fi

verify_public() {
  local base=$1 path
  for path in /api/healthz /api/readyz /api/public/brand /api/public/models /docs; do
    curl --retry 5 --retry-delay 2 --retry-all-errors --connect-timeout 10 \
      -fsS "$base$path" -o /dev/null || return 1
  done
}

deploy_minapp() {
  local host=token.minapp.xin public=https://capi.minapp.xin
  printf '\nDeploying %s to %s\n' "$version" "$public"
  rsync -e ssh "$tmp/release/capi" "$host:/tmp/capi-$version"
  rsync -e ssh "$tmp/release/capi-admin" "$host:/tmp/capi-admin-$version"
  ssh "$host" bash -s -- "$version" <<'REMOTE'
set -Eeuo pipefail
v=$1; base=/data/capi; release="$base/releases/$v"
dropin=/etc/systemd/system/capi.service.d/override.conf; state="$base/.deploy"
mkdir -p "$state" "$base/bin"
install -o root -g root -m 0755 "/tmp/capi-admin-$v" "$base/bin/capi-admin"
pid=$(systemctl show capi.service -p MainPID | sed 's/^MainPID=//')
old=$(readlink -f "/proc/$pid/exe")
[[ -x "$old" ]] || { echo 'Cannot locate active binary.' >&2; exit 1; }
if [[ "$(readlink -f "/proc/$pid/exe")" == "$release/capi" ]]; then
  echo "Release $v is already active."
  exit 0
fi
cp -p "$dropin" "$state/override-$v.previous"
while IFS= read -r -d '' entry; do
  case "$entry" in CAPI_*=*) export "$entry" ;; esac
done <"/proc/$pid/environ"
cd "$base"
backup=$("$old" backup)
case "$backup" in /*) ;; *) backup="$base/$backup" ;; esac
test -s "$backup/capi.sqlite"
echo "Verified backup: $backup"
if [[ -e "$release" ]]; then
  [[ -x "$release/capi" ]] && cmp -s "/tmp/capi-$v" "$release/capi" || { echo "Existing release differs: $release" >&2; exit 1; }
  rm -f "/tmp/capi-$v"
else
  mkdir -p "$release"
  install -o root -g root -m 0755 "/tmp/capi-$v" "$release/capi"
  rm -f "/tmp/capi-$v"
fi
switched=false
rollback() {
  rc=$?
  if [[ $rc -ne 0 && "$switched" == true ]]; then
    cp -p "$state/override-$v.previous" "$dropin"
    systemctl daemon-reload
    systemctl restart capi.service || true
  fi
}
trap rollback EXIT
printf '[Service]\nExecStart=\nExecStart=%s serve\n' "$release/capi" >"$dropin.tmp"
chmod 0644 "$dropin.tmp"
mv -f "$dropin.tmp" "$dropin"
switched=true
systemctl daemon-reload
systemctl restart capi.service
ok=false
for _ in $(seq 1 30); do
  if curl --noproxy '*' -fsS http://127.0.0.1:3210/api/healthz >/dev/null \
    && curl --noproxy '*' -fsS http://127.0.0.1:3210/api/readyz >/dev/null; then
    ok=true
    break
  fi
  sleep 2
done
[[ "$ok" == true ]]
systemctl is-active --quiet capi.service
switched=false
REMOTE
  if ! verify_public "$public"; then
    ssh "$host" bash -s -- "$version" <<'REMOTE'
set -Eeuo pipefail
v=$1; base=/data/capi; dropin=/etc/systemd/system/capi.service.d/override.conf
cp -p "$base/.deploy/override-$v.previous" "$dropin"
systemctl daemon-reload
systemctl restart capi.service
REMOTE
    die 'public check failed; minapp rolled back'
  fi
  printf 'Verified %s\n' "$public"
}

deploy_jisuhudong() {
  local host=room.minapp.xin public=https://capi.jisuhudong.com
  printf '\nDeploying %s to %s\n' "$version" "$public"
  ssh "$host" bash -s -- "$version" <<'REMOTE'
set -Eeuo pipefail
v=$1; base=/data/capi; ops="$base/ops"
test "$(uname -m)" = x86_64
df -Pk "$base" | awk 'NR==2 { if ($4 < 1048576) exit 1 }' || { echo 'Less than 1 GiB free on /data/capi.' >&2; exit 1; }
[[ -z "$(git -C "$ops" status --porcelain)" ]] || { echo 'Private ops repo has changes; refusing deploy.' >&2; exit 1; }
REMOTE
ssh "$host" mkdir -p /data/capi/.deploy /data/capi/bin
  rsync -e ssh "$tmp/release/capi" "$host:/tmp/capi-$version"
  rsync -e ssh "$tmp/release/capi-admin" "$host:/tmp/capi-admin-$version"
  ssh "$host" bash -s -- "$version" <<'REMOTE'
set -Eeuo pipefail
v=$1; base=/data/capi; release="$base/releases/$v"; ops="$base/ops"
compose="$ops/compose.yaml"; state="$base/.deploy"
mkdir -p "$base/bin"
install -o root -g root -m 0755 "/tmp/capi-admin-$v" "$base/bin/capi-admin"
if grep -q "^    image: capi:$v$" "$compose"; then
  echo "Release $v is already selected in Compose."
  exit 0
fi
cd "$ops"
backup=$(docker exec capi-production /app/capi backup)
case "$backup" in
  /app/data/backups/*) host_backup="/data/capi/data/backups/${backup#/app/data/backups/}" ;;
  *) echo "Unexpected container backup path: $backup" >&2; exit 1 ;;
esac
test -s "$host_backup/capi.sqlite"
echo "Verified backup: $backup"
if [[ -e "$release" ]]; then
  [[ -x "$release/capi" ]] && cmp -s "/tmp/capi-$v" "$release/capi" || { echo "Existing release differs: $release" >&2; exit 1; }
  rm -f "/tmp/capi-$v"
else
  mkdir -p "$release"
  install -o root -g root -m 0755 "/tmp/capi-$v" "$release/capi"
  rm -f "/tmp/capi-$v"
fi
ca_bundle=
for candidate in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem; do
  if [[ -s "$candidate" ]]; then ca_bundle=$candidate; break; fi
done
[[ -n "$ca_bundle" ]] || { echo 'No supported host CA bundle found.' >&2; exit 1; }
cp "$ca_bundle" "$release/ca-certificates.crt"
cat >"$release/Dockerfile.go" <<'EOF'
FROM scratch
WORKDIR /app
COPY --chown=1000:1000 capi /app/capi
COPY ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
USER 1000:1000
EXPOSE 3210
VOLUME ["/app/data"]
ENTRYPOINT ["/app/capi"]
CMD ["serve"]
EOF
chmod 0644 "$release/Dockerfile.go" "$release/ca-certificates.crt"
grep -q '^    image: capi:' "$compose"
grep -q '^      context: /data/capi/releases/' "$compose"
cp -p "$compose" "$state/compose-$v.previous"
docker build --pull -t "capi:$v" -f "$release/Dockerfile.go" "$release"
sed -E "s#^    image: capi:.*#    image: capi:$v#; s#^      context: /data/capi/releases/.*#      context: $release#" \
  "$state/compose-$v.previous" >"$compose.tmp"
mv -f "$compose.tmp" "$compose"
switched=false
rollback() {
  rc=$?
  if [[ $rc -ne 0 && "$switched" == true ]]; then
    cp -p "$state/compose-$v.previous" "$compose"
    docker compose -p ops -f "$compose" up -d --no-deps --force-recreate capi || true
  fi
}
trap rollback EXIT
switched=true
docker compose -p ops -f "$compose" up -d --no-deps --force-recreate capi
ok=false
for _ in $(seq 1 30); do
  health=$(docker inspect --format '{{.State.Health.Status}}' capi-production 2>/dev/null || true)
  if [[ "$health" == healthy ]] && curl --noproxy '*' -fsS http://127.0.0.1:3210/api/healthz >/dev/null && curl --noproxy '*' -fsS http://127.0.0.1:3210/api/readyz >/dev/null; then
    ok=true
    break
  fi
  sleep 2
done
[[ "$ok" == true ]]
git add compose.yaml
git -c user.name='CAPI Deploy' -c user.email='deploy@localhost' commit -m "Deploy CAPI $v" >/dev/null
switched=false
REMOTE
  if ! verify_public "$public"; then
    ssh "$host" bash -s -- "$version" <<'REMOTE'
set -Eeuo pipefail
v=$1; base=/data/capi; ops="$base/ops"; compose="$ops/compose.yaml"
cp -p "$base/.deploy/compose-$v.previous" "$compose"
docker compose -p ops -f "$compose" up -d --no-deps --force-recreate capi
git -C "$ops" add compose.yaml
git -C "$ops" -c user.name='CAPI Deploy' -c user.email='deploy@localhost' commit -m "Rollback CAPI $v after public check failure" >/dev/null
REMOTE
    die 'public check failed; jisuhudong rolled back'
  fi
  printf 'Verified %s\n' "$public"
}

case "$target" in
  minapp) deploy_minapp ;;
  jisuhudong) deploy_jisuhudong ;;
  both) deploy_minapp; deploy_jisuhudong ;;
esac
