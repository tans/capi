export type NavItem = { title: string; slug: string };
export type NavSection = { title: string; items: NavItem[] };

export const docsTabs = [
  { label: "Guides", href: "/docs/guides" },
  { label: "API Reference", href: "/docs/api" },
  { label: "Developer Resources", href: "/docs/resources" },
];

export const guidesNav: NavSection[] = [
  {
    title: "Getting started",
    items: [
      { title: "Quickstart", slug: "guides/quickstart" },
      { title: "Authentication", slug: "guides/authentication" },
    ],
  },
  {
    title: "Task API",
    items: [
      { title: "Quickstart", slug: "guides/task-api/quickstart" },
      { title: "Callbacks", slug: "guides/task-api/callbacks" },
    ],
  },
  {
    title: "LLM API",
    items: [{ title: "Quickstart", slug: "guides/llm-api/quickstart" }],
  },
  {
    title: "Platform Management",
    items: [
      { title: "Quickstart", slug: "guides/platform-management/quickstart" },
    ],
  },
];

export const resourcesNav: NavSection[] = [
  {
    title: "Tooling",
    items: [
      { title: "SDKs", slug: "resources/sdks" },
      { title: "CLI", slug: "resources/cli" },
      { title: "Files", slug: "resources/files" },
    ],
  },
  {
    title: "MCP",
    items: [
      { title: "Overview", slug: "resources/mcp" },
      { title: "Hosted MCP", slug: "resources/mcp/hosted" },
      { title: "Local MCP", slug: "resources/mcp/local" },
    ],
  },
  {
    title: "Tool integrations",
    items: [
      { title: "Claude Code", slug: "resources/tool-integrations/claude-code" },
      { title: "Codex App", slug: "resources/tool-integrations/codex-app" },
      {
        title: "VS Code & Cursor",
        slug: "resources/tool-integrations/claude-code-vscode-cursor",
      },
      {
        title: "GitHub Actions",
        slug: "resources/tool-integrations/claude-code-github-actions",
      },
      { title: "CC Switch", slug: "resources/tool-integrations/cc-switch" },
    ],
  },
  {
    title: "Application practices",
    items: [
      {
        title: "Open WebUI",
        slug: "resources/application-practices/open-webui",
      },
      {
        title: "AnythingLLM",
        slug: "resources/application-practices/anythingllm",
      },
      { title: "LibreChat", slug: "resources/application-practices/librechat" },
      { title: "Chatbox", slug: "resources/application-practices/chatbox" },
      {
        title: "Cherry Studio",
        slug: "resources/application-practices/cherry-studio",
      },
      { title: "LobeChat", slug: "resources/application-practices/lobechat" },
      { title: "NextChat", slug: "resources/application-practices/nextchat" },
      { title: "Jan", slug: "resources/application-practices/jan" },
    ],
  },
];

/** Flat lookup used for prev/next links within a section. */
export function flattenNav(sections: NavSection[]) {
  return sections.flatMap((section) => section.items);
}
