import { redirect } from "next/navigation";

import { getDictionary } from "@/lib/i18n";

export default async function DocsIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getDictionary(locale).docs;
  void t;
  redirect(`/${locale}/docs/guides`);
}
