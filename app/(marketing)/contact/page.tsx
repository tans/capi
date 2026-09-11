import type { Metadata } from "next";
import { BookOpen, LifeBuoy, Mail, MessagesSquare } from "lucide-react";

import { PageHero, Section } from "@/components/marketing/page-hero";
import { ContactForm } from "@/components/marketing/contact-form";
import { SectionHeading } from "@/components/section";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Talk to us about enterprise setup, volume pricing, integrations, and security reviews.",
};

const channels = [
  {
    icon: Mail,
    title: "Email",
    body: "For account, billing, and general questions.",
    meta: "hello@capi.ai",
  },
  {
    icon: MessagesSquare,
    title: "Technical support",
    body: "Included with every account, including free.",
    meta: "support@capi.ai",
  },
  {
    icon: BookOpen,
    title: "Documentation",
    body: "Most integration questions are already answered.",
    meta: "Read the docs",
    href: "/docs",
  },
  {
    icon: LifeBuoy,
    title: "Status",
    body: "Live provider availability and incident history.",
    meta: "status.capi.ai",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to the team"
        description="Enterprise setup, volume pricing, a technical integration, or a security review — tell us what you need and we will route it to the right person."
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div>
            <SectionHeading eyebrow="Enquiry" title="Send us a message" />
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>

          <div>
            <SectionHeading eyebrow="Also" title="Other channels" />
            <div className="mt-8 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
              {channels.map((channel) => (
                <div key={channel.title} className="flex gap-3.5 px-5 py-4">
                  <channel.icon className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[14px] font-semibold tracking-tight text-foreground">
                      {channel.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {channel.body}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-brand">
                      {channel.meta}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-md border border-border bg-muted/40 p-5">
              <p className="text-[13px] font-medium text-foreground">
                Response times
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Free and pay-as-you-go accounts receive a reply within one
                business day. Team and enterprise plans have a dedicated channel
                with a shorter target.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

export const dynamic = "force-static";
