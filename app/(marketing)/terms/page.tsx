import type { Metadata } from "next";

import { LegalDoc } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Capi.",
};

export default function TermsPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Terms of Service"
      updated="14 March 2026"
      intro="These terms govern your access to and use of the Capi API, dashboard, SDKs, and related services. By creating an account or calling the API you agree to them."
      sections={[
        {
          title: "The service",
          body: [
            "Capi provides a unified interface to third-party artificial intelligence models. We route your requests to upstream providers, normalise their responses, and bill you for delivered output.",
            "Because the models are operated by third parties, their capabilities, availability, and acceptable-use requirements may change. We publish model availability and pricing in the catalog and update it as providers change their terms.",
          ],
        },
        {
          title: "Your account",
          body: [
            "You are responsible for the security of your API keys and for all activity performed with them. Keys are scoped per project; treat them as credentials and store them in a secret manager rather than in source control.",
            "You must be old enough to form a binding contract in your jurisdiction, and you must provide accurate account information.",
          ],
        },
        {
          title: "Acceptable use",
          body: [
            "You may not use the service to generate unlawful content, to infringe intellectual property, to create sexual content involving minors, or to harass or defraud others.",
            "You may not attempt to circumvent provider safety systems, resell raw API access without a written agreement, or use the service in a way that degrades it for other customers.",
            "Providers apply their own content policies in addition to ours. A request that violates a provider's policy is rejected and is not billed.",
          ],
        },
        {
          title: "Billing",
          body: [
            "The service is credit-based and billed in arrears against your balance. Unit prices are published per model in the catalog, and every response reports the amount settled.",
            "Failed generations are not billed; reserved credits are released automatically. Disputed charges must be raised within thirty days of the invoice date.",
          ],
        },
        {
          title: "Content and outputs",
          body: [
            "You retain ownership of the prompts you submit. Subject to the upstream provider's terms, you own the outputs generated for you, and we claim no licence over them.",
            "Generated media is stored temporarily and served from unguessable URLs. You are responsible for copying anything you need to retain beyond the documented retention window.",
          ],
        },
        {
          title: "Availability",
          body: [
            "We target high availability but do not warrant uninterrupted service for self-serve accounts. Enterprise agreements may include a contractual uptime commitment and service credits.",
            "Scheduled maintenance is announced in advance where practical; provider-side incidents are tracked on the status page.",
          ],
        },
        {
          title: "Liability",
          body: [
            "To the maximum extent permitted by law, our aggregate liability is limited to the amounts you paid in the twelve months preceding the claim.",
            "We are not liable for indirect or consequential loss, including lost profits or lost data arising from model output that you chose to act upon without review.",
          ],
        },
        {
          title: "Termination",
          body: [
            "You may close your account at any time. We may suspend or terminate access for material breach of these terms, for non-payment, or where required by law.",
            "On termination, unused credits are refunded except where the account was closed for breach. Generated files are deleted according to the standard retention schedule.",
          ],
        },
        {
          title: "Changes",
          body: [
            "We may update these terms to reflect changes to the service or the law. Material changes are announced by email or in the dashboard at least thirty days before they take effect.",
            "Continuing to use the service after the effective date constitutes acceptance of the revised terms.",
          ],
        },
      ]}
    />
  );
}

export const dynamic = "force-static";
