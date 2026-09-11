import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocsBreadcrumb, DocsShell } from "@/components/docs/docs-shell";
import { DocPageView } from "@/components/docs/doc-page-view";
import { guidesNav, flattenNav } from "@/lib/docs-nav";
import { getAllDocs, getDoc } from "@/lib/docs";

export function generateStaticParams() {
  return getAllDocs()
    .filter((doc) => doc.slug.startsWith("guides/"))
    .map((doc) => ({ slug: doc.slug.replace(/^guides\//, "").split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length === 0) return { title: "Guides" };

  const doc = getDoc(`guides/${slug.join("/")}`);
  if (!doc) return { title: "Not found" };
  return { title: doc.title, description: doc.description };
}

function Overview() {
  return (
    <DocsShell>
      <DocsBreadcrumb items={[{ label: "Docs", href: "/docs" }, { label: "Guides" }]} />
      <h1 className="display-1 mt-5 text-foreground">Guides</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Learn the core Capi workflows before using the API Reference.
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
                    href={`/docs/${item.slug}`}
                    className="rounded-md border border-border px-4 py-4 transition-colors hover:border-neutral-300"
                  >
                    <p className="text-[14px] font-semibold tracking-tight text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {doc?.description ??
                        "Read the guide to learn more about this workflow."}
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
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;

  if (!slug || slug.length === 0) return <Overview />;

  const docSlug = `guides/${slug.join("/")}`;
  const doc = getDoc(docSlug);
  if (!doc) notFound();

  const sectionTitle =
    guidesNav.find((section) =>
      section.items.some((item) => item.slug === docSlug),
    )?.title ?? "Guides";

  const flat = flattenNav(guidesNav);
  const index = flat.findIndex((item) => item.slug === docSlug);

  return (
    <DocPageView
      doc={doc}
      slug={docSlug}
      breadcrumb={[
        { label: "Docs", href: "/docs" },
        { label: sectionTitle, href: "/docs/guides" },
        { label: doc.title },
      ]}
      prev={index > 0 ? flat[index - 1] : undefined}
      next={index >= 0 && index < flat.length - 1 ? flat[index + 1] : undefined}
    />
  );
}

export const dynamic = "force-static";
