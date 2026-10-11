/**
 * Version and changelog, parsed from the repo-root CHANGELOG.md at build time
 * (Keep a Changelog format). CHANGELOG.md is the single source of truth; the
 * site changelog page, footer version, and /api/healthz all derive from it or
 * from the same release flow.
 */
import type { DocPage } from "@/lib/docs";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type ChangelogEntry = { version: string; date: string; body: string };

const sources = import.meta.glob("../../../CHANGELOG.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const source = Object.values(sources)[0] ?? "";

const entries: ChangelogEntry[] = [];
let current: ChangelogEntry | null = null;
for (const line of source.split("\n")) {
  const match = /^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?/.exec(line);
  if (match) {
    current = match[1] === "Unreleased" ? null : { version: match[1], date: match[2] ?? "", body: "" };
    if (current) entries.push(current);
  } else if (current) {
    current.body += line + "\n";
  }
}
// Build-time guard: a CHANGELOG without release versions means the parse broke.
if (entries.length === 0) throw new Error("CHANGELOG.md has no release versions");

export const changelog: ChangelogEntry[] = entries;
export const latestVersion = entries[0].version;

/** The changelog rendered as a documentation page. */
export function changelogDoc(locale: Locale): DocPage {
  const t = getDictionary(locale).nav;
  const body = changelog.map(entry => `## ${entry.version}${entry.date ? ` - ${entry.date}` : ""}\n\n${entry.body.trim()}`).join("\n\n");
  return {
    slug: "resources/changelog",
    title: locale === "zh" ? "更新日志" : t.changelog,
    description: locale === "zh" ? "CAPI 的版本发布历史与变更记录。" : "Release history and notable changes for CAPI.",
    body,
    readingTime: `${Math.max(1, Math.round(body.split(/\s+/).length / 200))} min read`,
  };
}
