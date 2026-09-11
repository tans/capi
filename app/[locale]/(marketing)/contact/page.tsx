import type { Metadata } from "next";
import { BookOpen, LifeBuoy, Mail, MessagesSquare } from "lucide-react";

import { ContactForm } from "@/components/marketing/contact-form";
import { PageHero, Section } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

const channelIcons = [Mail, MessagesSquare, BookOpen, LifeBuoy];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).contact;
  return { title: t.title, description: t.description };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale).contact;
  const href = (path: string) => localeHref(locale as Locale, path);

  return (
    <>
      <PageHero
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div>
            <SectionHeading eyebrow={t.form.eyebrow} title={t.form.title} />
            <div className="mt-8">
              <ContactForm locale={locale} />
            </div>
          </div>

          <div>
            <SectionHeading
              eyebrow={t.channels.eyebrow}
              title={t.channels.title}
            />
            <div className="mt-8 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
              {t.channelItems.map((channel, i) => {
                const Icon = channelIcons[i] ?? Mail;
                // The documentation card links into the docs section.
                const isDocsCard = i === 2;
                return (
                  <div key={channel.title} className="flex gap-3.5 px-5 py-4">
                    <Icon className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[14px] font-semibold tracking-tight text-foreground">
                        {channel.title}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                        {channel.body}
                      </p>
                      {isDocsCard ? (
                        <a
                          href={href("/docs")}
                          className="mt-2 block font-mono text-[11px] text-brand underline-offset-4 hover:underline"
                        >
                          {channel.meta}
                        </a>
                      ) : (
                        <p className="mt-2 font-mono text-[11px] text-brand">
                          {channel.meta}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-md border border-border bg-muted/40 p-5">
              <p className="text-[13px] font-medium text-foreground">
                {t.responseTimes.title}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {t.responseTimes.body}
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
