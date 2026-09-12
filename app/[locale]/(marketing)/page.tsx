import {
  Comparison,
  Faq,
  FinalCta,
  ManageAccess,
  TeamCta,
  WhatDevelopersBuild,
} from "@/components/home/closing";
import { DarkSections } from "@/components/home/dark-sections";
import { Hero } from "@/components/home/hero";
import { Showcase } from "@/components/home/showcase";
import { HowItWorks, WhyDevelopers } from "@/components/home/why-and-steps";
import { resolveLocale } from "@/lib/i18n/server";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);

  return (
    <>
      <Hero locale={locale} />
      <Showcase locale={locale} />
      <WhyDevelopers locale={locale} />
      <HowItWorks locale={locale} />
      <DarkSections locale={locale} />
      <WhatDevelopersBuild locale={locale} />
      <ManageAccess locale={locale} />
      <TeamCta locale={locale} />
      <Comparison locale={locale} />
      <Faq locale={locale} />
      <FinalCta locale={locale} />
    </>
  );
}
