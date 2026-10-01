import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { MemoryRouter } from "react-router-dom";
import { App } from "./app";
import { getAllDocs } from "@/lib/docs";
import { apiEndpoints, endpointMarkdown } from "@/lib/api-spec";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export const documents = [...getAllDocs(), ...apiEndpoints.map(e => ({slug:`api/${e.slug}`,title:e.title,description:e.summary,body:endpointMarkdown(e)}))];
export const pages = (["en", "zh"] as Locale[]).flatMap(locale => {
  const t = getDictionary(locale).docs;
  return [
    ...documents.map(doc => ({path:`/${locale}/docs/${doc.slug}`,locale,title:doc.title,description:doc.description})),
    ...(["guides", "resources", "api"] as const).map(section => ({path:`/${locale}/docs/${section}`,locale,...t[`${section}Overview`]})),
  ];
});
export const marketingPages = (["en", "zh"] as Locale[]).map(locale => {
  const t = getDictionary(locale);
  return [
    {path:`/${locale}/pricing`,locale,title:t.pricing.title,description:t.pricing.description},
    {path:`/${locale}/teams`,locale,title:t.teams.title,description:t.teams.description},
    {path:`/${locale}/contact`,locale,title:t.contact.title,description:t.contact.description},
    {path:`/${locale}/skills`,locale,title:t.skills.title,description:t.skills.description},
    {path:`/${locale}/privacy`,locale,title:t.privacy.title,description:t.privacy.intro},
    {path:`/${locale}/terms`,locale,title:t.terms.title,description:t.terms.intro},
  ];
}).flat();
export function render(path: string) {
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const target = new Writable({ write(chunk, _encoding, done) { html += chunk.toString(); done(); } });
    target.on("finish", () => resolve(html));
    target.on("error", reject);
    const stream = renderToPipeableStream(<React.StrictMode><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></React.StrictMode>, {
      onAllReady() { stream.pipe(target); },
      onError(error) { reject(error); },
    });
  });
}

export function verifyDocs() {
  const slugs = new Set(documents.map(d => d.slug));
  for (const endpoint of apiEndpoints) {
    JSON.parse(endpoint.responseBody);
    if (endpoint.requestBody) JSON.parse(endpoint.requestBody);
    if (endpoint.path.startsWith("/api/v1")) throw new Error(`Legacy API path: ${endpoint.slug}`);
  }
  for (const doc of documents) {
    for (const match of doc.body.matchAll(/\]\(\/docs\/([^)#?]+)(?:[)#?])/g)) {
      if (!slugs.has(match[1]) && !["guides", "api", "resources"].includes(match[1])) throw new Error(`Broken documentation link: ${doc.slug} → ${match[1]}`);
    }
  }
}
