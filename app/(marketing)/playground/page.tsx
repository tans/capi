import type { Metadata } from "next";

import { PageHero, Section } from "@/components/marketing/page-hero";
import { Playground } from "@/components/marketing/playground";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Preview the prompt surface for every modality in the Capi catalog.",
};

export default function PlaygroundPage() {
  return (
    <>
      <PageHero
        eyebrow="Playground"
        title="Compose a request, see the shape"
        description="Pick a modality, choose a model, and see which parameters it accepts and what the call will cost. This build is a UI preview — no generation is performed."
        secondary={{ label: "Read the docs", href: "/docs/guides/quickstart" }}
      />

      <Section>
        <Playground />
      </Section>
    </>
  );
}

export const dynamic = "force-static";
