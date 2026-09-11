import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocsBreadcrumb, DocsShell } from "@/components/docs/docs-shell";
import { DocPageView } from "@/components/docs/doc-page-view";
import { guidesNav, flattenNav } from "@/lib/docs-nav";
import { getAllDocs, getDoc } from "@/lib/docs";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

export function generateStaticParams() {
  return getAllDocs()
    .filter((doc) => doc.slug.startsWith("guides/"))
    .map((doc) => ({ slug: doc.slug.replace(/^guides\//, "").split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!slug || slug.length === 0) {
    const t = getDictionary(locale).docs.guidesOverview;
    return { title: t.title, description: t.description };
  }

  const doc = getDoc(`guides/${slug.join("/")}`);
  if (!doc) return { title: "Not found" };
  return { title: doc.title, description: doc.description };
}

function Overview({
  locale,
  localePrefix,
}: {
  locale: Locale;
  localePrefix: string;
}) {
  const dict = getDictionary(locale);
  const t = dict.docs.guidesOverview;
  const sidebarLabels = {
    search: dict.docs.sidebar.searchPlaceholder,
    noResults: dict.docs.sidebar.noResults,
    groups: dict.docs.tabs,
  };

  return (
    <DocsShell
      menuLabel={dict.docs.sidebar.menu}
      localePrefix={localePrefix}
      sidebarLabels={sidebarLabels}
    >
      <DocsBreadcrumb
        items={[
          { label: dict.nav.documentation, href: `${localePrefix}/docs` },
          { label: t.title },
        ]}
      />
      <h1 className="display-1 mt-5 text-foreground">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        {t.description}
      </p>

      <div className="mt-12 flex flex-col gap-10">
        {guidesNav.map((section) => (
          <div key={section.title}>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              {section.title}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.items.map((item) => {
                const doc = getDoc(item.slug);
                return (
                  <a
                    key={item.slug}
                    href={`${localePrefix}/docs/${item.slug}`}
                    className="rounded-md border border-border px-4 py-4 transition-colors hover:border-neutral-300"
                  >
                    <p className="text-[14px] font-semibold tracking-tight text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {doc?.description ?? t.description}
                    </p>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DocsShell>
  );
}

export default async function GuidesPage({
  params,
}: {
  params: Promise<{ locale: string; slug?: string[] }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const { slug } = await params;
  const localePrefix = `/${locale}`;
  const dict = getDictionary(locale);

  if (!slug || slug.length === 0) {
    return <Overview locale={locale} localePrefix={localePrefix} />;
  }

  const docSlug = `guides/${slug.join("/")}`;
  const doc = getDoc(docSlug);
  if (!doc) notFound();

  const sectionTitle =
    guidesNav.find((section) =>
      section.items.some((item) => item.slug === docSlug),
    )?.title ?? dict.docs.guidesOverview.title;

  const flat = flattenNav(guidesNav);
  const index = flat.findIndex((item) => item.slug === docSlug);

  return (
    <DocPageView
      doc={doc}
      slug={docSlug}
      localePrefix={localePrefix}
      locale={locale}
      contentNotice={dict.docs.contentNotice}
      sidebarLabels={{
        search: dict.docs.sidebar.searchPlaceholder,
        noResults: dict.docs.sidebar.noResults,
        groups: dict.docs.tabs,
      }}
      breadcrumb={[
        { label: dict.nav.documentation, href: `${localePrefix}/docs` },
        {
          label: sectionTitle,
          href: `${localePrefix}/docs/guides`,
        },
        { label: doc.title },
      ]}
      prev={index > 0 ? flat[index - 1] : undefined}
      next={index >= 0 && index < flat.length - 1 ? flat[index + 1] : undefined}
      ui={{
        previous: dict.common.previous,
        next: dict.common.next,
        copyPage: dict.common.copyPage,
        viewMarkdown: dict.common.viewMarkdown,
        onThisPage: dict.docs.sidebar.onThisPage,
        menuLabel: dict.docs.sidebar.menu,
      }}
    />
  );
}

export const dynamic = "force-static";
