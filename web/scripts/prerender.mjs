import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pages, documents, render, verifyDocs } from "../.prerender/prerender.js";

verifyDocs();
const output = resolve(import.meta.dirname, "../../internal/webui/dist");
const shell = await readFile(resolve(output, "index.html"), "utf8");
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
for (const page of pages) {
  const body = await render(page.path);
  if (!body.includes("<h1")) throw new Error(`Missing document body: ${page.path}`);
  const ids = new Set([...body.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of body.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(match[1])) throw new Error(`Broken heading anchor: ${page.path}#${match[1]}`);
  }
  const file = resolve(output, `.${page.path}/index.html`);
  await mkdir(dirname(file), {recursive:true});
  const html = shell.replace(/lang="[^"]*"/, `lang="${page.locale === "zh" ? "zh-CN" : "en"}"`)
    .replace(/<title>.*?<\/title>/, `<title>${escape(page.title)} | CAPI</title>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
    .replace('</head>', `<meta name="description" content="${escape(page.description)}"><link rel="canonical" href="${page.path}"><link rel="alternate" hreflang="en" href="${page.path.replace(/^\/(en|zh)/, "/en")}"><link rel="alternate" hreflang="zh-CN" href="${page.path.replace(/^\/(en|zh)/, "/zh")}"></head>`);
  await writeFile(file, html);
}
for (const locale of ["en", "zh"]) {
  for (const doc of documents) {
    const file=resolve(output,`${locale}/docs-md/${doc.slug}.md`);
    await mkdir(dirname(file),{recursive:true});
    await writeFile(file,`# ${doc.title}\n\n${doc.body.replace(/^# [^\n]+\n\n/, "") }\n`);
  }
}
console.log(`Verified and prerendered ${pages.length} documentation pages, ${documents.length * 2} Markdown exports`);
