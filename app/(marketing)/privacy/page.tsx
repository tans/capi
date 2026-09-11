import type { Metadata } from "next";

import { LegalDoc } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Capi collects, uses, and retains data.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Privacy Policy"
      updated="14 March 2026"
      intro="This policy explains what we collect when you use Capi, why we collect it, how long we keep it, and the choices available to you."
      sections={[
        {
          title: "What we collect",
          body: [
            "Account data: your email address, organisation name, billing details, and the settings you configure.",
            "Usage data: which models you call, request and response metadata (timestamps, latency, token counts), and the cost settled for each call.",
            "Technical data: IP address, user agent, and API key identifiers, retained for security and abuse prevention.",
          ],
        },
        {
          title: "Prompts and generated media",
          body: [
            "Prompts, input assets, and generated outputs are transmitted to the upstream model provider in order to fulfil your request. They are processed transiently and are not used by us to train models.",
            "Generated media is stored for the retention window of your plan so that output URLs remain resolvable. Uploaded input assets are deleted after thirty days unless attached to a saved project.",
            "You can delete any generated file before its scheduled expiry through the API or the dashboard.",
          ],
        },
        {
          title: "How we use data",
          body: [
            "To operate the service: routing requests, metering usage, settling billing, and delivering callbacks.",
            "To secure the service: detecting abuse, enforcing rate limits, and investigating incidents.",
            "To improve the service: aggregate, de-identified statistics about model reliability and latency. You can opt out of aggregate analytics on a Team plan.",
          ],
        },
        {
          title: "Legal bases",
          body: [
            "Where the GDPR applies, we rely on contract performance for operating your account, legitimate interests for security and service improvement, and legal obligation for tax and accounting records.",
            "Consent is used only for optional communications such as product announcements; you can withdraw it at any time.",
          ],
        },
        {
          title: "Sub-processors",
          body: [
            "We share data with the upstream model providers needed to fulfil each request, with cloud infrastructure hosting, and with payment and email providers acting on our instructions.",
            "A current list of sub-processors, with their processing locations, is available to enterprise customers on request. We give notice before adding a sub-processor that processes personal data.",
          ],
        },
        {
          title: "Retention",
          body: [
            "Account and billing records are retained for the life of the account and for the period required by tax law afterwards.",
            "Request metadata is retained for ninety days for abuse investigation, then reduced to aggregate counters.",
            "Generated media follows the plan retention schedule: seven days on Free, ninety days on pay-as-you-go, one year on Team.",
          ],
        },
        {
          title: "Your rights",
          body: [
            "You can access, correct, export, or delete your account data from the dashboard, and you can request a machine-readable export through the API.",
            "Deleting your account removes personal data from active systems immediately and from backups within thirty days. Billing records required by law are retained in redacted form.",
          ],
        },
        {
          title: "Security",
          body: [
            "Traffic is encrypted in transit, API keys are stored hashed, and access to production systems is limited and logged.",
            "We notify affected customers without undue delay if a breach is likely to result in a risk to their rights.",
          ],
        },
        {
          title: "Contact",
          body: [
            "Questions about this policy, or requests relating to your data, can be sent to privacy@capi.ai. We respond within thirty days.",
            "Where the GDPR applies, you also have the right to lodge a complaint with your local supervisory authority.",
          ],
        },
      ]}
    />
  );
}

export const dynamic = "force-static";
