const en = {
  meta: {
    title: "Capi - Unified AI API for Video, Music, Image & LLMs",
    description:
      "One API key for 240+ AI models: video, image, music and LLM APIs. Use Claude Code, Codex and Cursor. Pay as you go.",
    titleTemplate: "%s | Capi",
  },

  common: {
    getApiKey: "Get API Key",
    openDashboard: "Open Dashboard",
    readTheDocs: "Read the docs",
    contactUs: "Contact Us",
    contactSales: "Contact sales",
    learnMore: "Learn more",
    view: "View",
    viewAll: "View all",
    browse: "Browse",
    copy: "Copy",
    copied: "Copied",
    copyCode: "Copy code",
    copyPage: "Copy page",
    viewMarkdown: "View Markdown",
    search: "Search",
    searchModels: "Search models...",
    reset: "Reset",
    signIn: "Sign in",
    sendAnother: "Send another",
    previous: "Previous",
    next: "Next",
    from: "from",
    modelsCount: "models",
    switchLanguage: "Switch language",
    allRightsReserved: "All rights reserved.",
    homeAria: "Capi home",
    notificationsAria: "Notifications",
    accountAria: "Account",
    openMenuAria: "Open menu",
    menuTitle: "Menu",
    platformLabel: "Platform",
    feedback: "Feedback",
    footerTagline: "One API for every AI model — video, image, music, audio, and LLMs.",
  },

  nav: {
    video: "Video",
    image: "Image",
    music: "Music",
    audio: "Audio",
    llm: "LLM",
    models: "Models",
    pricing: "Pricing",
    docs: "Docs",
    teams: "Teams",
    mcp: "MCP",
    cli: "CLI",
    sdk: "SDK",
    skills: "Skills",
    playground: "Playground",
    dashboard: "Dashboard",
    product: "Product",
    developers: "Developers",
    guides: "Guides",
    company: "Company",
    legal: "Legal",
    modelCatalog: "Model Catalog",
    providers: "Providers",
    documentation: "Documentation",
    sdks: "SDKs",
    mcpServer: "MCP Server",
    apiReference: "API Reference",
    quickstart: "Quickstart",
    authentication: "Authentication",
    taskApi: "Task API",
    callbacks: "Callbacks",
    llmApi: "LLM API",
    agentSkills: "Agent Skills",
    teamsAndCompany: "Teams",
    contact: "Contact",
    terms: "Terms",
    privacy: "Privacy",
  },

  home: {
    hero: {
      eyebrow: "Unified AI API Platform",
      titleA: "Unified AI API for",
      titleAccent: "Video, Music, Image",
      titleB: "& LLMs",
      description:
        "One API key for 240+ AI models: video, image, music and LLM APIs. Use Claude Code, Codex and Cursor. Pay as you go.",
      enterprise: "Enterprise?",
      diagramClients: "Clients",
      diagramModels: "Models",
      diagramOneKey: "1 Key",
      diagramStable: "More stable",
      diagramCheaper: "Lower cost",
      diagramMoreModels: "+233 models",
      yourApp: "Your App",
      diagramAlt:
        "Clients connect to Capi with one key, and Capi routes to 240+ models",
    },
    showcase: {
      promptPrefix: "Choosing a video model?",
      promptLink: "Compare Seedance 2.5, Kling v3, and Veo 3.1 APIs",
      eyebrow: "Featured",
      title: "Made with Capi",
      tags: {
        video: "Video",
        image: "Image",
        music: "Music",
      },
      captions: {
        kling: "Kling Video",
        veo: "Veo 3 Video",
        seedance: "Fire choreography",
        flux: "Flux Image",
        midjourney: "Midjourney Image",
        suno: "Wide Open Sky",
      },
      wallTitle: "200+ Models · 10+ AI services, unified under one API",
    },
    why: {
      title: "Why developers choose Capi",
      subtitle: "The boring parts of multi-model AI infrastructure, handled.",
      allModelsTitle: "All models, one API",
      allModelsBody:
        "Access video, music, image, and LLM models through a single API key — including Suno (no official API available elsewhere) and Kling video generation.",
      productionTitle: "Production ready",
      productionBody:
        "Built for production workloads. Async task management, webhook callbacks, automatic retries, and predictable credit-based billing. SDKs in Python, Node.js, PHP, Java, Ruby, and Go.",
      pricingTitle: "Transparent pricing",
      pricingBody:
        "Pay only for what you use. No subscriptions, no hidden fees. See exactly what each generation costs before you call the API.",
    },
    how: {
      badge: "How it works",
      title: "Three Steps to Your First Generation",
      steps: [
        {
          title: "Get an API Key",
          body: "Sign up and generate a free API key from the dashboard. No credit card required.",
        },
        {
          title: "Pick a Model",
          body: "Browse the model catalog, choose by modality and provider, and copy the model ID.",
        },
        {
          title: "Call the API",
          body: "Send a POST request with your prompt and model ID. Capi routes it to the provider, manages the async lifecycle, and returns structured JSON.",
        },
      ],
    },
    tools: {
      title: "Developer Tools",
      kinds: {
        cli: "MCP + CLI",
        mcp: "MCP",
        extension: "Extension",
      },
      description:
        "Give Claude Code, Codex, Gemini CLI, and other coding agents access to 200+ models through MCP server or installable skills.",
      explore: "Explore developer tools",
    },
    modalities: {
      title: "One API for Every AI Model",
      description:
        "Three lines of code to generate a video, create music, or produce an image.",
      countSuffix: "models",
    },
    playground: {
      badge: "Try Capi",
      title: "Playground",
      model: "Model",
      prompt: "Prompt",
      promptPlaceholder: "Describe what you want to create...",
      duration: "Duration",
      aspectRatio: "Aspect ratio",
      estimated: "Estimated:",
      generate: "Generate",
      signInPrefix: "Sign in to generate with Capi.",
      resultPlaceholder: "Your result will appear here",
    },
    endpoints: {
      title: "Start building in minutes",
      description:
        "Call the REST endpoint directly, use an SDK, or let your coding agent do it.",
    },
    build: {
      title: "What Developers Build with Capi",
      cases: [
        {
          title: "AI-Powered Apps",
          body: "Ship image, video, and music generation into your product without managing provider accounts. One API key, one billing dashboard, one webhook format.",
        },
        {
          title: "Agent Workflows",
          body: "Give Claude Code, Codex, Gemini CLI, and other coding agents access to 240+ models through MCP server or installable skills.",
        },
        {
          title: "Batch Media Pipelines",
          body: "Generate thousands of images, videos, or audio files with async task management and webhook callbacks. Poll or wait — the CLI and SDKs handle both.",
        },
        {
          title: "Multi-Model Prototyping",
          body: "Compare output quality across providers without separate signups. Switch from Kling to Veo to Seedance by changing one parameter.",
        },
      ],
    },
    manage: {
      title: "Everything You Need to Manage API Access",
      description:
        "Give every project its own API key, budget, and permissions. Monitor usage across your organization in real time.",
      cards: [
        {
          title: "Production ready",
          body: "Built for production workloads. Async task management, webhook callbacks, automatic retries, and predictable credit-based billing. SDKs in Python, Node.js, PHP, Java, Ruby, and Go.",
        },
        {
          title: "Access Control",
          body: "Restrict keys to specific models or modalities. Revoke instantly without affecting other keys. Set expiration dates for temporary access.",
        },
        {
          title: "Usage Analytics",
          body: "The team dashboard brings API keys, usage, cost tracking, and access status into one workspace.",
        },
      ],
    },
    team: {
      title: "Building with a team?",
      description:
        "We're here to help with enterprise setup, integrations, and technical questions.",
    },
    comparison: {
      title: "Capi vs Alternatives",
      feature: "Feature",
      capi: "Capi",
      openrouter: "OpenRouter",
      direct: "Direct API",
      varies: "Varies",
      rows: {
        modalities: "Modalities",
        models: "Models",
        pricing: "Pricing",
        sdks: "SDKs",
        cli: "CLI",
        mcp: "MCP Server",
        skills: "Agent Skills",
        async: "Async + Webhooks",
      },
      values: {
        modalities: "Video, Image, Music, Audio, LLM",
        modalitiesAlt: "LLM only",
        modalitiesDirect: "Per provider",
        models: "240+",
        modelsAlt: "300+ (LLM)",
        modelsDirect: "1 provider",
        pricing: "15-25% savings",
        pricingAlt: "Market rate",
        pricingDirect: "Official rate",
        sdks: "6 languages",
        sdksAlt: "2 languages",
        sdksDirect: "Varies",
        yes: "yes",
        no: "no",
        varies: "varies",
      },
    },
    explore: {
      eyebrow: "Explore",
      title: "Developer Tools",
      cards: [
        {
          title: "MCP Server",
          body: "Connect Claude Code, Cursor, and MCP-compatible agents to 160+ models.",
        },
        {
          title: "CLI",
          body: "Run AI models from your terminal with JSON-first output.",
        },
        {
          title: "SDKs",
          body: "Python, Node.js, PHP, Java, Ruby, and Go SDKs for programmatic integration.",
        },
        {
          title: "Model Catalog",
          body: "Browse all 200+ models with pricing, parameters, and code samples.",
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Frequently asked questions",
      items: [
        {
          q: "How do I get started with Capi?",
          a: "Sign up for a free account at capi.ai, generate an API key from the dashboard, and make your first API request. No credit card is required. The quickstart takes under 10 minutes — install an SDK, set your API key as an environment variable, and call any model endpoint. The model catalog shows every available model with its parameters, pricing, and code samples.",
        },
        {
          q: "What AI models are available through Capi?",
          a: "Capi exposes 240+ models across five modalities: video (Kling, Veo, Seedance, Hailuo, Runway, Wan), image (GPT Image, Nano Banana, Flux, Midjourney, Seedream), music (Suno, Producer), audio (ElevenLabs, Fish Audio, Gemini TTS, Whisper), and language models (Claude, GPT, Gemini, DeepSeek, GLM, Qwen).",
        },
        {
          q: "How does Capi pricing work?",
          a: "Capi is credit-based and pay-as-you-go. Every model exposes its unit price before you call it — per 1M tokens for LLMs, per second for video, per call for images, per 1K characters for speech. There are no subscriptions and no monthly minimums, and each response includes the settled cost.",
        },
        {
          q: "Do you offer SDKs and developer tools?",
          a: "Yes. Official SDKs cover Python, Node.js, PHP, Java, Ruby, and Go, each with full type definitions and built-in task polling. There is also a CLI with JSON-first output, an MCP server for coding agents, and installable Agent Skills.",
        },
        {
          q: "What happens when a generation fails?",
          a: "Failed generations are never billed. The reserved credit is refunded and the task carries a structured error with the provider's failure reason, so you can retry or route to a different model.",
        },
        {
          q: "How does Capi handle async media generation?",
          a: "Video, music, and long-running image jobs are asynchronous. Submitting a task returns a task ID immediately; you can poll the task endpoint, wait on the SDK helper, or supply a callback_url to receive a signed webhook when the output is ready.",
        },
        {
          q: "Can I use Capi with AI coding agents?",
          a: "Yes. Capi ships an MCP server that gives Claude Code, Codex, Cursor, Windsurf, and Gemini CLI access to the full model catalog, plus Agent Skills for installable, task-specific workflows.",
        },
        {
          q: "Is Capi compatible with the OpenAI API format?",
          a: "Yes. The LLM surface exposes OpenAI-compatible /v1/chat/completions, /v1/responses, /v1/embeddings, and /v1/moderations endpoints, so existing OpenAI clients work by changing the base URL and API key. There are also Anthropic Messages and Gemini generateContent compatible routes.",
        },
        {
          q: "Do I need separate accounts with each AI provider?",
          a: "No. Capi holds the provider relationships, so you need one account and one API key. Billing, rate limits, retries, and webhooks are unified across every provider.",
        },
        {
          q: "What support and SLA does Capi offer?",
          a: "Self-serve accounts include documentation, status updates, and email support. Team and enterprise plans add a dedicated channel, custom rate limits, and a contractual uptime SLA with priority routing.",
        },
      ],
    },
    cta: {
      title: "Ready to build with AI?",
      description: "Get your free API key and start generating in minutes.",
    },
  },

  models: {
    eyebrow: "Model Catalog",
    title: "Explore {count} AI Models",
    description:
      "Browse, compare, and integrate the best AI models for video, image, music, audio, and text generation — all through one unified API.",
    available: "All models available · Real-time pricing",
    wallTitle: "Leading AI models, one API",
    filters: {
      all: "All",
      llm: "LLM",
      image: "Image",
      video: "Video",
      audio: "Audio & Music",
      utility: "Utility",
      provider: "Provider",
      sort: "Sort",
      sortRecommended: "Recommended",
      sortName: "Name A–Z",
      sortPrice: "Lowest price",
    },
    empty: {
      title: "No models match those filters",
      body: "Try a different modality or clear the provider filter.",
    },
    card: {
      from: "from",
    },
    detail: {
      backToModels: "Models",
      by: "by",
      capabilities: "Capabilities",
      availableModels: "Available models",
      availableModelsHint: "Pass any of these IDs in the",
      availableModelsHintSuffix: "field.",
      modelId: "Model ID",
      detailColumn: "Detail",
      priceColumn: "Price",
      pricingStartsAt: "Pricing starts at",
      pricingNote:
        "Pay only for what you use. Each response returns the exact amount settled against your balance — no subscriptions, no minimums.",
      quickstart: "Quickstart",
      moreModels: "More {modality} models",
    },
    bottom: {
      title: "Not sure which model to pick?",
      description:
        "Every model page lists the exact model IDs, per-unit pricing, and a runnable request you can copy. Compare outputs side by side in the",
      descriptionSuffix: "playground.",
    },
  },

  docs: {
    sidebar: {
      searchPlaceholder: "Search",
      noResults: "No pages match “{query}”.",
      menu: "Documentation menu",
      onThisPage: "On this page",
    },
    tabs: {
      guides: "Guides",
      api: "API Reference",
      resources: "Developer Resources",
    },
    groups: {
      gettingStarted: "Getting started",
      taskApi: "Task API",
      llmApi: "LLM API",
      platformManagement: "Platform Management",
      tooling: "Tooling",
      mcp: "MCP",
      toolIntegrations: "Tool integrations",
      applicationPractices: "Application practices",
      apiReference: "API Reference",
      platform: "Platform",
      account: "Account",
      task: "Task",
    },
    guidesOverview: {
      title: "Guides",
      description:
        "Learn the core Capi workflows before using the API Reference.",
    },
    resourcesOverview: {
      title: "Developer Resources",
      description:
        "SDKs, tooling, and integration guides for using Capi from your language, your editor, and your existing applications.",
      fallbackDescription: "Read the guide to learn more.",
      englishOnly: "This page is currently available in English only.",
    },
    apiOverview: {
      title: "API Reference",
      description:
        "Every endpoint Capi exposes, grouped by capability. Each page documents the parameters, a runnable request, and the exact response shape.",
      allEndpoints: "All endpoints",
    },
    api: {
      overview: "Overview",
      parameters: "Parameters",
      requestBody: "Request body",
      notes: "Notes",
      example: "Example",
      name: "Name",
      type: "Type",
      description: "Description",
      baseUrl: "Base URL",
      apiVersion: "API version",
      authentication: "Authentication",
      taskApiQuickstart: "Task API quickstart",
    },
    contentNotice: "",
  },

  mcp: {
    eyebrow: "MCP Server",
    title: "Give your coding agent every model",
    description:
      "One MCP server exposes the whole catalog — video, image, music, audio, and LLMs — to Claude Code, Codex, Cursor, and any MCP-capable agent.",
    meta: "Works with every MCP client",
    targets: { eyebrow: "Targets", title: "Works with the agents you already use" },
    targetsDescription:
      "Register the server once and the agent gains the full catalog. No SDK, no custom tool definitions.",
    clients: [
      { title: "Claude Code", body: "MCP plus installable agent skills.", meta: "MCP + CLI" },
      { title: "Codex", body: "One command, then tools are available.", meta: "MCP" },
      { title: "Cursor", body: "Config entry under mcpServers.", meta: "MCP" },
      { title: "VS Code", body: "Workspace-scoped server definition.", meta: "MCP" },
      { title: "Windsurf", body: "Same shape as Cursor.", meta: "MCP" },
      { title: "Gemini CLI", body: "Registered through the CLI.", meta: "MCP" },
    ],
    tools: { eyebrow: "Tools", title: "What the agent can call", tool: "Tool", purpose: "Purpose" },
    toolRows: [
      { name: "list_models", body: "Search the catalog by modality, provider, or capability." },
      { name: "get_model", body: "Full parameter schema and pricing for one model." },
      { name: "generate", body: "Create a generation task and wait for the result." },
      { name: "get_task", body: "Poll an async task for status and output." },
      { name: "get_balance", body: "Read the remaining credit balance for the key." },
    ],
    setup: { eyebrow: "Setup", title: "Connected in three steps" },
    setupSteps: [
      {
        title: "Create a scoped key",
        body: "Generate a key in the dashboard and restrict it to the modalities the agent needs.",
      },
      {
        title: "Register the server",
        body: "One command for Claude Code, Codex, and Gemini CLI. Cursor and VS Code use a JSON entry.",
      },
      {
        title: "Ask for media",
        body: "Describe the asset you want. The agent picks a model, generates, waits, and returns the URL.",
      },
    ],
    safety: [
      {
        title: "Scope the key",
        body: "The server acts with the permissions of the key it is given. Grant only the modalities the agent needs.",
      },
      {
        title: "Cap the spend",
        body: "Pass --max-cost so a single call cannot exceed a threshold, and set a monthly budget on the key.",
      },
      {
        title: "Expect retries",
        body: "Agents retry failed steps. Video models are the expensive case — keep them off by default.",
      },
    ],
    explore: { eyebrow: "Explore", title: "Related developer tools" },
    exploreCards: [
      { title: "CLI", body: "The same surface from your terminal, with JSON-first output." },
      { title: "SDKs", body: "Six languages, full type definitions, built-in task polling." },
      { title: "Agent Skills", body: "Package the workflow around the models for consistent output." },
      { title: "Model Catalog", body: "Browse every model with pricing and code samples." },
    ],
    cta: {
      title: "Give your agent a browser and a studio",
      description:
        "Install the MCP server and your coding agent can generate video, images, music, and speech on request.",
    },
  },

  cli: {
    eyebrow: "CLI",
    title: "Run any model from your terminal",
    description:
      "The Capi CLI mirrors the REST surface with JSON-first output, so it composes with jq, shells out cleanly from scripts, and works in CI.",
    commands: { eyebrow: "Commands", title: "What you can run", command: "Command", purpose: "Purpose" },
    rows: [
      { name: "capi models list", body: "List the catalog, filterable by modality and provider." },
      { name: "capi image generate", body: "Generate an image and print the output URL." },
      { name: "capi video generate", body: "Submit a video task; blocks until it finishes." },
      { name: "capi tasks get <id>", body: "Inspect a task's status, progress, and cost." },
      { name: "capi balance", body: "Print the remaining credit balance." },
      { name: "capi auth login", body: "Store a key in the local config file." },
    ],
    usage: { eyebrow: "Usage", title: "Built for scripts" },
    features: [
      { title: "JSON-first", body: "Every command emits structured JSON on stdout, so piping into jq is safe." },
      { title: "Exit codes", body: "Non-zero on failure, with a machine-readable error on stderr." },
      { title: "No config required", body: "Reads CAPI_API_KEY from the environment when no config file exists." },
      { title: "Streaming aware", body: "Chat commands stream tokens by default and can buffer with --no-stream." },
    ],
    cta: {
      title: "Install the CLI",
      description:
        "One command to install, then generate images and video straight from your shell.",
    },
  },

  sdk: {
    eyebrow: "SDKs",
    title: "SDKs for every stack",
    description:
      "Official clients for six languages. Each one wraps the REST API, adds typed errors, and handles async task polling so you never write a retry loop.",
    languages: { eyebrow: "Languages", title: "Six clients, one shape" },
    languagesDescription:
      "A client, per-modality namespaces, typed errors, and a wait() helper. Learn one and you know them all.",
    clients: [
      { title: "Python", body: "Sync and asyncio clients, built-in task polling." },
      { title: "Node.js", body: "ESM and CJS builds with TypeScript declarations." },
      { title: "Go", body: "Context-aware client with typed requests and responses." },
      { title: "PHP", body: "PSR-18 compatible HTTP client." },
      { title: "Ruby", body: "Idiomatic client with keyword arguments." },
      { title: "Java", body: "Maven and Gradle artefacts, builder-style requests." },
    ],
    options: { eyebrow: "Configuration", title: "Client options", option: "Option", behaviour: "Behaviour" },
    optionRows: [
      { name: "api_key", body: "Reads CAPI_API_KEY when omitted." },
      { name: "base_url", body: "Point at a proxy or a mock server." },
      { name: "timeout", body: "Per-request timeout in seconds." },
      { name: "max_retries", body: "Retries on 429 and 5xx with backoff." },
      { name: "poll_interval", body: "Initial wait() poll interval." },
    ],
    features: [
      { title: "Typed errors", body: "One exception hierarchy across languages, carrying status, code, and the provider message." },
      { title: "Automatic retries", body: "429 and 5xx responses retry with exponential backoff and respect Retry-After." },
      { title: "Full type definitions", body: "Responses are typed end to end, so editors autocomplete model IDs and parameters." },
      { title: "Streaming support", body: "LLM routes stream token deltas without buffering at the SDK layer." },
    ],
    errorTitle: "Error handling",
    compatTitle: "Drop-in OpenAI compatibility",
    cta: {
      title: "Install the SDK and ship",
      description:
        "Six languages, one API surface, and task helpers so you can focus on the product rather than the plumbing.",
    },
  },

  skills: {
    eyebrow: "Agent Skills",
    title: "Packaged workflows for coding agents",
    description:
      "A skill pins the model, the prompt scaffold, and the output path, so the same request produces the same kind of asset every time — across every developer on the team.",
    primaryCta: "Browse the catalog",
    why: { eyebrow: "Why skills", title: "Model choice becomes a reviewable artefact" },
    whyDescription:
      "Without a skill, every generation is an ad-hoc decision: which model, which size, which prompt. With one, those choices are committed to the repository and reviewed like any other change.",
    whyCards: [
      { title: "Consistent output", body: "The scaffold, model, and aspect ratio live in the skill, so a launch asset looks like the last one." },
      { title: "Reviewable by default", body: "Changing a skill is a pull request. Brand and legal can see exactly what will be generated before it is." },
      { title: "Cheaper in practice", body: "Pinned models and sizes prevent accidental calls to premium video models during routine work." },
      { title: "Composable", body: "Skills call the MCP server's tools, so a skill can chain generation, download, and file placement." },
    ],
    install: { eyebrow: "Install", title: "Three steps to a repeatable workflow" },
    installSteps: [
      { title: "Add the skill", body: "Skills install per project, so the constraints travel with the repository." },
      { title: "Review the plan", body: "The skill declares its model, size, and output path. Commit it and it applies to everyone." },
      { title: "Invoke it", body: "Call the skill by name in your agent; it fills the prompt scaffold and writes the file." },
    ],
    catalogue: { eyebrow: "Catalogue", title: "Skills available today" },
    catalogueItems: [
      { title: "brand-imagery", meta: "image · brand", body: "Product and marketing visuals in your house style — pinned model, aspect ratio, and prompt scaffold." },
      { title: "release-video", meta: "video · release", body: "Short teaser clips from a changelog, with a consistent shot list and caption tone." },
      { title: "voiceover", meta: "audio · narration", body: "Narration from a script, using one voice consistently across a series." },
      { title: "doc-diagrams", meta: "image · docs", body: "Diagram-style images that match the documentation's palette and stroke weight." },
      { title: "social-crops", meta: "image · social", body: "One master asset, cropped and re-composed for each channel's aspect ratio." },
      { title: "podcast-beds", meta: "music · audio", body: "Loopable music beds at a fixed tempo and mood for a recurring show." },
    ],
    cta: {
      title: "Package your workflow once",
      description:
        "Define the model, the style, and the destination. Then let every developer generate assets that fit.",
    },
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Pay only for what you generate",
    description:
      "No subscriptions and no minimums. Every model publishes its unit price before you call it, and each response reports the exact amount settled against your balance.",
    units: { eyebrow: "Units", title: "Billing follows the natural unit of each modality" },
    unitsDescription:
      "You are never charged a flat rate for a model you barely use. Video bills by the second, images by the call, and LLMs by the token.",
    table: {
      modality: "Modality",
      unit: "Billing unit",
      example: "Example model",
      from: "From",
    },
    rows: [
      { modality: "Video", unit: "per second", example: "Veo 3.1 Fast", from: "$0.06" },
      { modality: "Image", unit: "per call", example: "GPT Image 2", from: "$0.03" },
      { modality: "Music", unit: "per song", example: "Suno v5.5", from: "$0.18" },
      { modality: "Audio", unit: "per 1K characters", example: "ElevenLabs TTS v3", from: "$0.04" },
      { modality: "LLM", unit: "per 1M input tokens", example: "GPT-5.6", from: "$2.50" },
      { modality: "Embeddings", unit: "per 1M tokens", example: "Embedding 4 Large", from: "$0.13" },
    ],
    included: { eyebrow: "Included", title: "Everything in the base rate" },
    includedDescription:
      "The platform features are not a paid tier. Keys, callbacks, SDKs, and analytics ship with every account.",
    includedItems: [
      "Unlimited API keys, each with its own budget and scopes",
      "Async task management with automatic retries and refunds",
      "Webhook callbacks with signed deliveries",
      "SDKs for six languages, CLI, and the MCP server",
      "Usage analytics and per-key cost tracking",
    ],
    notes: [
      { title: "Failed generations are free", body: "If a provider fails or filters a request, the reserved credit is released. You are only billed for delivered output." },
      { title: "No token markup games", body: "Input and output prices are published per model, so you can compute the cost of a request before sending it." },
      { title: "Budgets as guardrails", body: "Set a monthly cap per key. When it is reached, requests return 402 instead of silently spending." },
      { title: "Volume terms for teams", body: "Team and enterprise plans add custom rate limits, invoicing, and a contractual uptime SLA." },
    ],
    volume: {
      title: "Building something large?",
      body: "High-volume commitments qualify for reduced unit pricing and dedicated throughput. Tell us the shape of your workload.",
    },
    cta: {
      title: "Start with free credits",
      description:
        "Create an account, generate a key, and see exactly what each call costs before you commit.",
    },
  },

  teams: {
    eyebrow: "Teams",
    title: "Give every project its own key, budget, and limits",
    description:
      "One workspace for the whole organisation: isolate spend, constrain access, and see where the credits actually go.",
    requestPack: "Request it",
    controls: { eyebrow: "Controls", title: "Multi-model infrastructure needs multi-tenant guardrails" },
    capabilities: [
      { title: "A key per project", body: "Issue a key for every service, environment, and customer. Rotate or revoke one without touching the rest of your setup." },
      { title: "Budgets as hard stops", body: "Attach a monthly cap to a key. When it is reached, requests return 402 rather than silently spending." },
      { title: "Scoped permissions", body: "Restrict a key to specific modalities or model families, so a front-end key cannot reach your billing surface." },
      { title: "Usage analytics", body: "Break spend down by key, model, modality, and time window. Export to CSV or read it through the API." },
      { title: "Seat management", body: "Invite engineers with roles that separate billing access from key provisioning." },
      { title: "Audit log", body: "Every management action is recorded with the acting key, target, timestamp, and source address." },
    ],
    blocks: [
      { title: "Provision programmatically", body: "A management key can mint scoped standard keys, so onboarding a customer does not require a human in the dashboard." },
      { title: "Separate credential classes", body: "Management keys cannot generate work, and generation keys cannot manage keys. A leak is contained either way." },
      { title: "Enterprise terms", body: "Custom rate limits, invoicing, SSO, a private networking option, and a contractual uptime SLA." },
    ],
    security: {
      title: "Need a security review pack?",
      body: "We can share our architecture summary, data-flow diagram, and retention policy.",
    },
    cta: {
      title: "Roll Capi out across the org",
      description:
        "Start with one project, then add keys, budgets, and seats as adoption grows.",
    },
  },

  contact: {
    eyebrow: "Contact",
    title: "Talk to the team",
    description:
      "Enterprise setup, volume pricing, a technical integration, or a security review — tell us what you need and we will route it to the right person.",
    form: { eyebrow: "Enquiry", title: "Send us a message" },
    channels: { eyebrow: "Also", title: "Other channels" },
    channelItems: [
      { title: "Email", body: "For account, billing, and general questions.", meta: "hello@capi.ai" },
      { title: "Technical support", body: "Included with every account, including free.", meta: "support@capi.ai" },
      { title: "Documentation", body: "Most integration questions are already answered.", meta: "Read the docs" },
      { title: "Status", body: "Live provider availability and incident history.", meta: "status.capi.ai" },
    ],
    responseTimes: {
      title: "Response times",
      body: "Free and pay-as-you-go accounts receive a reply within one business day. Team and enterprise plans have a dedicated channel with a shorter target.",
    },
    fields: {
      name: "Name",
      namePlaceholder: "Ada Lovelace",
      email: "Work email",
      emailPlaceholder: "ada@example.com",
      company: "Company",
      companyPlaceholder: "Optional",
      topic: "Topic",
      message: "How can we help?",
      messagePlaceholder:
        "Tell us about the workload, expected volume, and any compliance requirements.",
      submit: "Send message",
      replyNote: "We reply within one business day.",
    },
    topics: [
      "Enterprise setup",
      "Volume pricing",
      "Technical integration",
      "Security review",
      "Something else",
    ],
    validation: {
      name: "Tell us who you are.",
      email: "Enter a valid work email.",
      message: "A sentence or two about the workload helps us route this.",
    },
    success: {
      title: "Thanks — we'll be in touch.",
      body: "This demo form does not send anything. In a production build it would post to your CRM or an internal endpoint, and route enterprise enquiries to a solutions engineer.",
    },
  },

  playground: {
    eyebrow: "Playground",
    title: "Compose a request, see the shape",
    description:
      "Pick a modality, choose a model, and see which parameters it accepts and what the call will cost. This build is a UI preview — no generation is performed.",
    tabs: {
      video: "Video",
      image: "Image",
      music: "Music",
      audio: "Audio",
      text: "LLM",
    },
    fields: {
      model: "Model",
      prompt: "Prompt",
      promptPlaceholder: "Describe what you want to create...",
      duration: "Duration",
      aspectRatio: "Aspect ratio",
      estimated: "Estimated:",
      generate: "Generate",
      signInPrefix: "Sign in to generate with Capi.",
      resultPlaceholder: "Your result will appear here",
      parameters: "Parameters",
      requestPreview: "Request preview",
    },
  },

  auth: {
    login: {
      title: "Sign in to Capi",
      description: "Use your work email to continue.",
      submit: "Sign in",
      noAccount: "Don't have an account?",
      createOne: "Create one",
    },
    signup: {
      title: "Create your account",
      description: "Free starter credits are included. No credit card required.",
      submit: "Create account",
      hasAccount: "Already have an account?",
      signIn: "Sign in",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      passwordPlaceholder: "At least 8 characters",
      name: "Full name",
      namePlaceholder: "Ada Lovelace",
    },
    validation: {
      email: "Enter a valid email address.",
      password: "Password must be at least 8 characters.",
      name: "Enter your name.",
    },
    demoNote:
      "This is a UI demo — authentication is not wired up. Submitting takes you to the dashboard.",
    backToSite: "Back to site",
  },

  dashboard: {
    label: "Dashboard",
    nav: {
      overview: "Overview",
      keys: "API Keys",
      usage: "Usage",
      models: "Models",
      settings: "Settings",
    },
    overview: {
      title: "Overview",
      subtitle: "Account acct_4821 · usage for the last 14 days.",
      manageKeys: "Manage keys",
      getStarted: "Get started",
      kpis: {
        balance: "Balance",
        spend: "Spend this month",
        requests: "Requests",
        successRate: "Success rate",
      },
      kpiNotes: {
        balance: "+$20.00 added",
        spend: "14 days elapsed",
        requests: "1,284 today",
        successRate: "0.4% below last week",
      },
      dailySpend: "Daily spend",
      costByModel: "Cost by model",
      recentActivity: "Recent activity",
      table: {
        task: "Task",
        modality: "Modality",
        status: "Status",
        cost: "Cost",
        when: "When",
      },
      status: {
        completed: "completed",
        processing: "processing",
        failed: "failed",
      },
      when: {
        twoMinutes: "2 minutes ago",
        fourteenMinutes: "14 minutes ago",
        eighteenMinutes: "18 minutes ago",
        fortyOneMinutes: "41 minutes ago",
        oneHour: "1 hour ago",
      },
    },
    keys: {
      title: "API Keys",
      description:
        "Create a key per service or environment so you can rotate one without disrupting the rest.",
      create: "Create key",
      createTitle: "New API key",
      creating: "Create",
      cancel: "Cancel",
      name: "Name",
      namePlaceholder: "web-prod-images",
      scopes: "Scopes",
      budget: "Monthly budget (USD)",
      budgetPlaceholder: "500",
      perMonth: "/ month",
      secretOnce:
        "Copy this secret now — it is shown only once. Capi stores just a hash.",
      dismiss: "Dismiss",
      table: {
        name: "Name",
        key: "Key",
        scopes: "Scopes",
        budget: "Budget",
        created: "Created",
        lastUsed: "Last used",
        actions: "Actions",
      },
      reveal: "Reveal",
      hide: "Hide",
      revoke: "Revoke",
      never: "Never",
      noBudget: "No limit",
      revoked: "revoked",
      footnote:
        "Revocation is immediate. This demo keeps keys in memory only — they reset when the page reloads.",
      scopeOptions: {
        image: "image.generate",
        video: "video.generate",
        music: "music.generate",
        llm: "llm.chat",
        billing: "billing.read",
      },
      validation: {
        name: "Give the key a name.",
      },
    },
    usage: {
      title: "Usage",
      subtitle: "Spend and request volume for the current billing period.",
      thisPeriod: "This period",
      requests: "Requests",
      avgCost: "Avg cost / request",
      topModels: "Top models by spend",
      byModality: "By modality",
      byKey: "By key",
      dailySpend: "Daily spend",
      total: "Total",
      exportHint:
        "Export the full breakdown as CSV from the API, or read it programmatically at",
      table: {
        model: "Model",
        requests: "Requests",
        spend: "Spend",
        share: "Share",
        modality: "Modality",
        tokens: "Tokens",
      },
      modalities: {
        video: "Video",
        image: "Image",
        text: "LLM",
        music: "Music",
        audio: "Audio",
        embeddings: "Embeddings",
      },
    },
    models: {
      title: "Models",
      description:
        "Every model reachable with this account, with the exact rate that applies. Availability is resolved per key scope.",
      openCatalog: "Open full catalog",
      table: {
        modelId: "Model ID",
        family: "Family",
        modality: "Modality",
        detail: "Detail",
        rate: "Rate",
      },
      footnote: "{count} model IDs across {families} families. See",
      footnotePricing: "pricing",
      footnoteSuffix: "for how each modality bills.",
    },
    settings: {
      title: "Settings",
      description: "Account details and notification preferences.",
      account: "Account",
      accountDescription: "Details attached to this workspace.",
      accountName: "Account name",
      accountEmail: "Billing email",
      accountId: "Account ID",
      plan: "Plan",
      planValue: "Pay as you go",
      notifications: "Notifications",
      notificationsDescription:
        "Choose what Capi emails you about. Changes apply to this workspace only.",
      notifyTaskFailed: "Failed generations",
      notifyTaskFailedBody:
        "Email me when a task fails after retries, with the provider's reason.",
      notifyBudget: "Budget thresholds",
      notifyBudgetBody:
        "Email me when a key reaches 80% and 100% of its monthly budget.",
      notifyWeekly: "Weekly digest",
      notifyWeeklyBody: "A Monday summary of spend, volume, and top models.",
      notifyProduct: "Product updates",
      notifyProductBody:
        "Occasional emails about new models and platform changes.",
      danger: "Danger zone",
      dangerDescription:
        "Closing the account revokes every key and schedules all generated media for deletion.",
      closeAccount: "Close account",
      saved: "Preferences saved",
      save: "Save preferences",
    },
  },

  terms: {
    eyebrow: "Legal",
    title: "Terms of Service",
    updated: "14 March 2026",
    intro:
      "These terms govern your use of the Capi API, dashboard, and related services. By creating an account you agree to them.",
  },
  privacy: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    updated: "14 March 2026",
    intro:
      "This policy explains what we collect when you use Capi, why we collect it, how long we keep it, and the choices available to you.",
  },
};

export default en;
export type Dictionary = typeof en;
