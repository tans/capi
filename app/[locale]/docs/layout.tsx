import { SiteHeader } from "@/components/site-header";
import { resolveLocale } from "@/lib/i18n/server";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);

  return (
    <>
      <SiteHeader locale={locale} />
      <div className="flex-1">{children}</div>
    </>
  );
}
