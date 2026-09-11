import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export type DocPage = {
  /** Path under /docs without the extension, e.g. "guides/quickstart". */
  slug: string;
  title: string;
  description: string;
  body: string;
  readingTime: string;
};

function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  if (!raw.startsWith("---")) {
    return { data: {}, body: raw };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };

  const data: Record<string, string> = {};
  for (const line of raw.slice(3, end).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    data[key] = value;
  }

  return { data, body: raw.slice(end + 4).replace(/^\n+/, "") };
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) return [full];
    return [];
  });
}

/** Word count → coarse reading time, matching the docs header copy. */
function estimateReadingTime(body: string) {
  const words = body.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

let cache: Map<string, DocPage> | null = null;

function loadAll(): Map<string, DocPage> {
  if (cache) return cache;

  const map = new Map<string, DocPage>();

  for (const file of walk(DOCS_DIR)) {
    const raw = fs.readFileSync(file, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const slug = path
      .relative(DOCS_DIR, file)
      .replace(/\.(md|mdx)$/, "")
      .split(path.sep)
      .join("/");

    const firstHeading = body.match(/^##\s+(.+)$/m)?.[1];

    map.set(slug, {
      slug,
      title: data.title ?? firstHeading ?? slug,
      description: data.description ?? "",
      body,
      readingTime: estimateReadingTime(body),
    });
  }

  cache = map;
  return map;
}

export function getDoc(slug: string) {
  return loadAll().get(slug);
}

export function getAllDocs() {
  return Array.from(loadAll().values());
}

/** Extract `##` / `###` headings for the right-hand table of contents. */
export function extractHeadings(body: string) {
  const headings: { id: string; text: string; level: number }[] = [];
  let inFence = false;

  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!match) continue;

    const text = match[2].replace(/`/g, "").trim();
    headings.push({
      id: text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
      text,
      level: match[1].length,
    });
  }

  return headings;
}
