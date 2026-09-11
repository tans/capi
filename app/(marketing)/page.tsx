import {
  Comparison,
  Explore,
  Faq,
  FinalCta,
  ManageAccess,
  TeamCta,
  WhatDevelopersBuild,
} from "@/components/home/closing";
import { DarkSections } from "@/components/home/dark-sections";
import { Hero } from "@/components/home/hero";
import { Showcase } from "@/components/home/showcase";
import {
  DeveloperTools,
  HowItWorks,
  WhyDevelopers,
} from "@/components/home/why-and-steps";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Showcase />
      <WhyDevelopers />
      <HowItWorks />
      <DeveloperTools />
      <DarkSections />
      <WhatDevelopersBuild />
      <ManageAccess />
      <TeamCta />
      <Comparison />
      <Explore />
      <Faq />
      <FinalCta />
    </>
  );
}
