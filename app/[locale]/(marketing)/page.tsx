import { Faq, FinalCta } from "@/components/home/closing";
import { Hero } from "@/components/home/hero";
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
      <WhyDevelopers locale={locale} />
      <HowItWorks locale={locale} />
      <Faq locale={locale} />
      <FinalCta locale={locale} />
    </>
  );
}
