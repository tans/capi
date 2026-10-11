#!/usr/bin/env bash
set -Eeuo pipefail

# Tag the release recorded in CHANGELOG.md and publish a GitHub release.
# Run from a clean, up-to-date main checkout, after committing the changelog entry.

cd "$(git rev-parse --show-toplevel)"

version=$(grep -m1 -E '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | sed -E 's/^## \[([^]]+)\].*/\1/')
[[ -n "$version" ]] || { echo "release: no x.y.z version found in CHANGELOG.md" >&2; exit 1; }
tag="v$version"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "release: $tag already exists" >&2
  exit 1
fi

[[ -z "$(git status --porcelain)" ]] || { echo "release: working tree is not clean" >&2; exit 1; }

notes=$(awk -v header="## [$version]" 'index($0, header) == 1 { found=1; next } found && /^## \[/{ exit } found { print }' CHANGELOG.md)
[[ -n "$notes" ]] || { echo "release: no notes found for $version" >&2; exit 1; }

git tag -a "$tag" -m "CAPI $tag"
git push origin "$tag"
gh release create "$tag" --title "CAPI $tag" --notes "$notes"
echo "Released $tag: https://github.com/tans/capi/releases/tag/$tag"
