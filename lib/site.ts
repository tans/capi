export const site = {
  name: "Capi",
  domain: "capi.ai",
  tagline: "Unified AI API for Video, Music, Image & LLMs",
  description:
    "One API key for 240+ AI models: video, image, music and LLM APIs. Use Claude Code, Codex and Cursor. Pay as you go.",
  modelCount: 240,
  apiBase: "https://capi.ai/api/v1",
};

export const modalityNav = [
  { label: "Video", href: "/models?modality=video" },
  { label: "Image", href: "/models?modality=image" },
  { label: "Music", href: "/models?modality=music" },
  { label: "Audio", href: "/models?modality=audio" },
  { label: "LLM", href: "/models?modality=text" },
];

export const mainNav = [
  { label: "Models", href: "/models" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
  { label: "Teams", href: "/teams" },
];

export const toolNav = [
  { label: "MCP", href: "/mcp" },
  { label: "CLI", href: "/cli" },
  { label: "SDK", href: "/sdk" },
  { label: "Skills", href: "/skills" },
  { label: "Playground", href: "/playground" },
  { label: "Dashboard", href: "/dashboard" },
];

export const footerNav: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Model Catalog", href: "/models" },
      { label: "Pricing", href: "/pricing" },
      { label: "Providers", href: "/models#providers" },
      { label: "Playground", href: "/playground" },
      { label: "Teams", href: "/teams" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "SDKs", href: "/sdk" },
      { label: "CLI", href: "/cli" },
      { label: "MCP Server", href: "/mcp" },
      { label: "API Reference", href: "/docs/api" },
    ],
  },
  {
    title: "Guides",
    links: [
      { label: "Quickstart", href: "/docs/guides/quickstart" },
      { label: "Authentication", href: "/docs/guides/authentication" },
      { label: "Task API", href: "/docs/guides/task-api/quickstart" },
      { label: "Callbacks", href: "/docs/guides/task-api/callbacks" },
      { label: "LLM API", href: "/docs/guides/llm-api/quickstart" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Teams", href: "/teams" },
      { label: "Contact", href: "/contact" },
      { label: "Agent Skills", href: "/skills" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];
