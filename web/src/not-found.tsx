import Link from "next/link";
import { localeHref, type Locale } from "@/lib/i18n/config";

export function NotFoundPage({ locale }: { locale: Locale }) {
  return <section className="container-page py-20"><h1 className="display-2">{locale === "zh" ? "找不到此页面" : "Page not found"}</h1><p className="mt-4 text-muted-foreground">{locale === "zh" ? "请检查链接，或从文档目录继续浏览。" : "Check the link or continue from the documentation index."}</p><Link className="btn btn-sm mt-6" href={localeHref(locale, "/docs")}>{locale === "zh" ? "浏览文档" : "Browse documentation"}</Link></section>;
}
