import { Link } from "react-router-dom";
import { BookOpen, LifeBuoy, Mail, MessagesSquare } from "lucide-react";
import { Section, SectionHeading } from "@/components/section";
import { ContactForm } from "@/components/marketing/contact-form";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

/** Public pricing page restored from the Next baseline, with Go billing copy. */
export function PricingPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const pricing = t.pricing;
  const common = t.common;
  const href = (path: string) => localeHref(locale, path);

  return (
    <div>
      <section className="border-b border-border py-14">
        <div className="container-page grid items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="pt-2">
            <span className="eyebrow-solid">{pricing.eyebrow}</span>
            <h1 className="display-1 mt-5 text-foreground">{pricing.title}</h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">{pricing.description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to={href("/signup")} className="btn btn-primary">{common.getApiKey}</Link>
              <Link to={href("/contact")} className="font-mono text-[11px] tracking-wider text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{common.contactSales}</Link>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-6 sm:p-8">
            <p className="eyebrow">{pricing.table.from}</p>
            <p className="mt-4 font-mono text-3xl font-medium tracking-tight text-foreground">{locale === "zh" ? "按实际费率" : "At configured rates"}</p>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{pricing.unitsDescription}</p>
            <Link to={href("/models")} className="mt-6 inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline">{locale === "zh" ? "浏览可用模型" : "Browse available models"} →</Link>
          </div>
        </div>
      </section>

      <Section>
        <SectionHeading eyebrow={pricing.units.eyebrow} title={pricing.units.title} description={pricing.unitsDescription} />
        <div className="mt-10 overflow-x-auto rounded-md border border-border">
          <table className="table table-sm w-full min-w-[620px] text-left">
            <thead className="bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="font-medium">{pricing.table.modality}</th>
                <th className="font-medium">{pricing.table.unit}</th>
                <th className="font-medium">{pricing.table.example}</th>
                <th className="text-right font-medium">{pricing.table.from}</th>
              </tr>
            </thead>
            <tbody>
              {pricing.rows.map((row) => (
                <tr key={row.modality}>
                  <td className="text-foreground">{row.modality}</td>
                  <td className="text-muted-foreground">{row.unit}</td>
                  <td className="font-mono text-xs text-muted-foreground">{row.example}</td>
                  <td className="text-right font-mono text-xs text-foreground">{row.from}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{locale === "zh" ? "表中为示例起价；实际扣费以管理员为工作区配置的模型费率为准。" : "Prices shown are examples. Actual charges use the model rates configured for each workspace."}</p>
      </Section>

      <Section className="border-y border-border bg-muted/20">
        <SectionHeading eyebrow={pricing.included.eyebrow} title={pricing.included.title} description={pricing.includedDescription} />
        <ul className="mt-10 flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {pricing.includedItems.map((item) => <li key={item} className="px-5 py-4 text-sm leading-relaxed text-foreground">{item}</li>)}
        </ul>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {pricing.notes.map((note) => (
            <article key={note.title} className="rounded-md border border-border bg-card p-6">
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{note.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{note.body}</p>
            </article>
          ))}
        </div>
        <aside className="mt-10 rounded-md border border-brand/30 bg-brand-muted/40 p-6 sm:p-8">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{pricing.volume.title}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{pricing.volume.body}</p>
          <Link to={href("/contact")} className="mt-5 inline-flex text-[13px] font-medium text-brand underline-offset-4 hover:underline">{common.contactSales} →</Link>
        </aside>
      </Section>

      <section className="section-rule">
        <div className="container-page py-20">
          <div className="flex flex-col items-center">
            <h2 className="display-2 text-center text-foreground">{pricing.cta.title}</h2>
            <p className="mt-4 max-w-lg text-center text-[15px] text-muted-foreground">{pricing.cta.description}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link to={href("/signup")} className="btn btn-primary">{common.getApiKey}</Link>
              <Link to={href("/docs")} className="btn btn-outline">{common.readTheDocs}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Public teams page restored from the Next baseline. */
export function TeamsPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const teams = t.teams;
  const common = t.common;
  const href = (path: string) => localeHref(locale, path);

  return (
    <div>
      <section className="border-b border-border py-14">
        <div className="container-page grid items-start gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="pt-2">
            <span className="eyebrow-solid">{teams.eyebrow}</span>
            <h1 className="display-1 mt-5 text-foreground">{teams.title}</h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">{teams.description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to={href("/contact")} className="btn btn-primary">{teams.requestPack}</Link>
              <Link to={href("/contact")} className="font-mono text-[11px] tracking-wider text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{common.contactSales}</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.capabilities.slice(0, 4).map((item, index) => (
              <article key={item.title} className="rounded-md border border-border bg-card p-5">
                <p className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-5 text-sm font-semibold tracking-tight text-foreground">{item.title}</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Section>
        <SectionHeading eyebrow={teams.eyebrow} title={teams.controls.title} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.capabilities.map((item, index) => (
            <article key={item.title} className="flex flex-col rounded-md border border-border bg-card p-6">
              <span className="font-mono text-[11px] tracking-wider text-brand">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section className="border-y border-border bg-muted/20">
        <SectionHeading eyebrow={teams.eyebrow} title={teams.security.title} description={teams.security.body} />
        <div className="mt-10 overflow-hidden rounded-md border border-border bg-card">
          {teams.blocks.map((block) => (
            <div key={block.title} className="grid gap-2 border-b border-border px-6 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{block.title}</h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{block.body}</p>
            </div>
          ))}
        </div>
        <Link to={href("/contact")} className="btn btn-outline mt-8">{teams.requestPack}</Link>
      </Section>

      <section className="section-rule">
        <div className="container-page py-20">
          <div className="flex flex-col items-center">
            <h2 className="display-2 text-center text-foreground">{teams.cta.title}</h2>
            <p className="mt-4 max-w-lg text-center text-[15px] text-muted-foreground">{teams.cta.description}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link to={href("/signup")} className="btn btn-primary">{common.getApiKey}</Link>
              <Link to={href("/contact")} className="btn btn-outline">{common.contactSales}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Public contact page restored from the Next baseline. */
export function ContactPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const contact = t.contact;
  const href = (path: string) => localeHref(locale, path);
  const icons = [Mail, MessagesSquare, BookOpen, LifeBuoy];

  return (
    <div>
      <section className="border-b border-border py-14">
        <div className="container-page">
          <div className="max-w-3xl">
            <span className="eyebrow-solid">{contact.eyebrow}</span>
            <h1 className="display-1 mt-5 text-foreground">{contact.title}</h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{contact.description}</p>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div>
            <SectionHeading eyebrow={contact.form.eyebrow} title={contact.form.title} />
            <div className="mt-8"><ContactForm locale={locale} /></div>
          </div>
          <aside>
            <SectionHeading eyebrow={contact.channels.eyebrow} title={contact.channels.title} />
            <div className="mt-8 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              {contact.channelItems.map((channel, index) => {
                const Icon = icons[index] ?? Mail;
                const isDocsCard = index === 2;
                const isEmail = channel.meta.includes("@");
                return (
                  <div key={channel.title} className="flex gap-3.5 px-5 py-4">
                    <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tracking-tight text-foreground">{channel.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{channel.body}</p>
                      {isDocsCard ? (
                        <Link to={href("/docs")} className="mt-2 block font-mono text-[11px] text-brand underline-offset-4 hover:underline">{channel.meta}</Link>
                      ) : isEmail ? (
                        <a href={`mailto:${channel.meta}`} className="mt-2 block break-all font-mono text-[11px] text-brand underline-offset-4 hover:underline">{channel.meta}</a>
                      ) : (
                        <p className="mt-2 break-all font-mono text-[11px] text-brand">{channel.meta}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 rounded-md border border-border bg-muted/40 p-5">
              <p className="text-[13px] font-medium text-foreground">{contact.responseTimes.title}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{contact.responseTimes.body}</p>
            </div>
          </aside>
        </div>
      </Section>
    </div>
  );
}
