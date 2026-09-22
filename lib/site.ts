import type { Dictionary } from "@/lib/i18n";

export const site = {
  name: "CAPI",
  domain: "capi.minapp.xin",
  modelCount: 240,
  apiBase: "https://capi.minapp.xin/api/v1",
};

/** Navigation entries carry a dictionary key, not a label. */
type NavKey = keyof Dictionary["nav"];

export const modalityNav: { key: NavKey; href: string }[] = [
  { key: "video", href: "/models?modality=video" },
  { key: "image", href: "/models?modality=image" },
  { key: "music", href: "/models?modality=music" },
  { key: "audio", href: "/models?modality=audio" },
  { key: "llm", href: "/models?modality=text" },
];

export const mainNav: { key: NavKey; href: string }[] = [
  { key: "models", href: "/models" },
  { key: "pricing", href: "/pricing" },
  { key: "docs", href: "/docs" },
  { key: "teams", href: "/teams" },
];

export const toolNav: { key: NavKey; href: string }[] = [
  { key: "skills", href: "/skills" },
  { key: "dashboard", href: "/dashboard" },
];

export const footerNav: {
  titleKey: NavKey;
  links: { key: NavKey; href: string }[];
}[] = [
  {
    titleKey: "product",
    links: [
      { key: "modelCatalog", href: "/models" },
      { key: "pricing", href: "/pricing" },
      { key: "providers", href: "/models#providers" },
      { key: "teams", href: "/teams" },
    ],
  },
  {
    titleKey: "developers",
    links: [
      { key: "documentation", href: "/docs" },
      { key: "apiReference", href: "/docs/api" },
    ],
  },
  {
    titleKey: "guides",
    links: [
      { key: "quickstart", href: "/docs/guides/quickstart" },
      { key: "authentication", href: "/docs/guides/authentication" },
      { key: "taskApi", href: "/docs/guides/task-api/quickstart" },
      { key: "callbacks", href: "/docs/guides/task-api/callbacks" },
      { key: "llmApi", href: "/docs/guides/llm-api/quickstart" },
    ],
  },
  {
    titleKey: "company",
    links: [
      { key: "teamsAndCompany", href: "/teams" },
      { key: "contact", href: "/contact" },
      { key: "agentSkills", href: "/skills" },
    ],
  },
  {
    titleKey: "legal",
    links: [
      { key: "terms", href: "/terms" },
      { key: "privacy", href: "/privacy" },
    ],
  },
];
