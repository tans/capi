import GithubSlugger from "github-slugger";

export type DocPage = { slug: string; title: string; description: string; body: string; readingTime: string };
const sources = import.meta.glob("../../content/docs/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const docs: DocPage[] = Object.entries(sources).map(([path, raw]) => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  const data: Record<string, string> = {};
  for (const line of (frontmatter?.[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
  }
  const body = raw.slice(frontmatter?.[0].length ?? 0).trim();
  const slug = path.replace("../../content/docs/", "").replace(/\.md$/, "");
  return { slug, body, title: data.title ?? slug, description: data.description ?? "", readingTime: `${Math.max(1, Math.round(body.split(/\s+/).length / 200))} min read` };
});
export function getAllDocs() { return docs; }
export function getDoc(slug: string) { return docs.find(doc => doc.slug === slug); }

// Match rehype-slug exactly, including punctuation, Unicode and repeated headings.
export function extractHeadings(body: string) {
  const slugger = new GithubSlugger();
  const headings: { id: string; text: string; level: number }[] = [];
  let fence: string | undefined;
  for (const line of body.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined; continue; }
    if (fence) continue;
    const match = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/[`*_]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
    const id = slugger.slug(text);
    if (match[1].length === 2 || match[1].length === 3) headings.push({ id, text, level: match[1].length });
  }
  return headings;
}
