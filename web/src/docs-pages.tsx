import { Navigate, useLocation } from "react-router-dom";
import { GuidesPage } from "./docs-guides";
import { ResourcesPage } from "./docs-resources";
import { ApiPage } from "./docs-api";
import { NotFoundPage } from "./not-found";
import type { Locale } from "@/lib/i18n/config";
import { useEffect } from "react";
import { getDoc } from "@/lib/docs";
import { getEndpoint } from "@/lib/api-spec";
import { getDictionary } from "@/lib/i18n";

export default function DocsPages({ locale }: { locale: Locale }) {
  const location = useLocation();
  const path = location.pathname.replace(/^\/(en|zh)\/docs\/?/, "");
  useEffect(() => {
    if (!location.hash) { window.scrollTo({ top: 0, behavior: "instant" }); return; }
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [path, location.hash]);
  useEffect(() => {
    const doc = getDoc(path);
    const endpoint = path.startsWith("api/") ? getEndpoint(path.slice(4)) : undefined;
    const section = path as "guides" | "api" | "resources";
    const overview = ["guides", "api", "resources"].includes(section) ? getDictionary(locale).docs[`${section}Overview`] : undefined;
    document.title = `${doc?.title ?? endpoint?.title ?? overview?.title ?? (locale === "zh" ? "文档" : "Documentation")} | CAPI`;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) { description = document.createElement("meta"); description.name = "description"; document.head.append(description); }
    description.content = doc?.description ?? endpoint?.summary ?? overview?.description ?? "";
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `/${locale}/docs/${path}`;
    for (const alternate of document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')) alternate.href = `/${alternate.hreflang === "zh-CN" ? "zh" : "en"}/docs/${path}`;
    return () => { document.title = "CAPI"; if (description) description.content = ""; };
  }, [path, locale]);
  if (!path) return <Navigate to={`/${locale}/docs/guides`} replace />;
  const [section, ...parts] = path.split("/").filter(Boolean);
  const slug = parts.length ? parts : undefined;
  if (section === "guides") return <GuidesPage key={path} locale={locale} slug={slug} />;
  if (section === "resources") return <ResourcesPage key={path} locale={locale} slug={slug} />;
  if (section === "api") return <ApiPage key={path} locale={locale} slug={slug} />;
  return <NotFoundPage locale={locale} />;
}
