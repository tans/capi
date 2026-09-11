import type { Dictionary } from "./en";

const zh: Dictionary = {
  meta: {
    title: "Capi - 统一的 AI API:视频、音乐、图像与大语言模型",
    description:
      "一个 API Key 调用 240+ AI 模型:视频、图像、音乐与大模型 API。支持 Claude Code、Codex 与 Cursor。按量付费。",
    titleTemplate: "%s | Capi",
  },

  common: {
    getApiKey: "获取 API Key",
    openDashboard: "打开控制台",
    readTheDocs: "阅读文档",
    contactUs: "联系我们",
    contactSales: "联系销售",
    learnMore: "了解更多",
    view: "查看",
    viewAll: "查看全部",
    browse: "浏览",
    copy: "复制",
    copied: "已复制",
    copyCode: "复制代码",
    copyPage: "复制本页",
    viewMarkdown: "查看 Markdown",
    search: "搜索",
    searchModels: "搜索模型...",
    reset: "重置",
    signIn: "登录",
    sendAnother: "再发一条",
    previous: "上一页",
    next: "下一页",
    from: "起价",
    modelsCount: "个模型",
    switchLanguage: "切换语言",
    allRightsReserved: "保留所有权利。",
    homeAria: "Capi 首页",
    notificationsAria: "通知",
    accountAria: "账号",
    openMenuAria: "打开菜单",
    menuTitle: "菜单",
    platformLabel: "平台",
    feedback: "反馈",
    footerTagline: "一个 API 接入所有 AI 模型——视频、图像、音乐、音频与大语言模型。",
  },

  nav: {
    video: "视频",
    image: "图像",
    music: "音乐",
    audio: "音频",
    llm: "大模型",
    models: "模型",
    pricing: "价格",
    docs: "文档",
    teams: "团队",
    mcp: "MCP",
    cli: "CLI",
    sdk: "SDK",
    skills: "技能",
    playground: "调试台",
    dashboard: "控制台",
    product: "产品",
    developers: "开发者",
    guides: "指南",
    company: "公司",
    legal: "法律",
    modelCatalog: "模型目录",
    providers: "提供商",
    documentation: "文档",
    sdks: "SDK",
    mcpServer: "MCP 服务",
    apiReference: "API 参考",
    quickstart: "快速开始",
    authentication: "身份认证",
    taskApi: "任务 API",
    callbacks: "回调",
    llmApi: "大模型 API",
    agentSkills: "Agent 技能",
    teamsAndCompany: "团队",
    contact: "联系",
    terms: "服务条款",
    privacy: "隐私政策",
  },

  home: {
    hero: {
      eyebrow: "统一 AI API 平台",
      titleA: "一个 API 接入",
      titleAccent: "视频、音乐、图像",
      titleB: "与大语言模型",
      description:
        "一个 API Key 调用 240+ AI 模型:视频、图像、音乐与大模型 API。支持 Claude Code、Codex 与 Cursor。按量付费。",
      enterprise: "企业需求?",
      diagramClients: "客户端",
      diagramModels: "模型",
      diagramOneKey: "1 个 Key",
      diagramStable: "更稳定",
      diagramCheaper: "成本更低",
      diagramMoreModels: "+233 个模型",
      yourApp: "你的应用",
      diagramAlt: "客户端用一个 Key 接入 Capi,Capi 路由到 240+ 个模型",
    },
    showcase: {
      promptPrefix: "正在挑视频模型?",
      promptLink: "对比 Seedance 2.5、Kling v3 与 Veo 3.1 的 API",
      eyebrow: "精选案例",
      title: "用 Capi 构建",
      tags: {
        video: "视频",
        image: "图像",
        music: "音乐",
      },
      captions: {
        kling: "Kling 视频",
        veo: "Veo 3 视频",
        seedance: "火焰编舞",
        flux: "Flux 图像",
        midjourney: "Midjourney 图像",
        suno: "Wide Open Sky",
      },
      wallTitle: "200+ 模型 · 10+ AI 服务,统一在一个 API 之下",
    },
    why: {
      title: "开发者为什么选择 Capi",
      subtitle: "多模型 AI 基础设施里那些枯燥的部分,我们替你处理。",
      allModelsTitle: "所有模型,一个 API",
      allModelsBody:
        "用一个 API Key 调用视频、音乐、图像和大模型——包括别处没有官方 API 的 Suno,以及 Kling 视频生成。",
      productionTitle: "面向生产环境",
      productionBody:
        "为生产负载而建:异步任务管理、webhook 回调、自动重试,以及可预期的按额度计费。提供 Python、Node.js、PHP、Java、Ruby、Go 六种 SDK。",
      pricingTitle: "透明的价格",
      pricingBody:
        "只为实际用量付费,没有订阅费,没有隐藏费用。调用之前就能看到每次生成的确切成本。",
    },
    how: {
      badge: "使用流程",
      title: "三步完成第一次生成",
      steps: [
        {
          title: "获取 API Key",
          body: "注册账号,在控制台生成一个免费 API Key。不需要信用卡。",
        },
        {
          title: "挑选模型",
          body: "浏览模型目录,按模态和提供商筛选,复制模型 ID。",
        },
        {
          title: "调用 API",
          body: "带上提示词和模型 ID 发一个 POST 请求。Capi 负责路由到提供商、管理异步生命周期,并返回结构化 JSON。",
        },
      ],
    },
    tools: {
      title: "开发者工具",
      kinds: {
        cli: "MCP + CLI",
        mcp: "MCP",
        extension: "扩展",
      },
      description:
        "通过 MCP 服务或可安装的 Agent 技能,让 Claude Code、Codex、Gemini CLI 等编程 Agent 用上 200+ 模型。",
      explore: "探索开发者工具",
    },
    modalities: {
      title: "每个 AI 模型,同一个 API",
      description: "三行代码,生成视频、创作音乐或产出一张图像。",
      countSuffix: "个模型",
    },
    playground: {
      badge: "试用 Capi",
      title: "调试台",
      model: "模型",
      prompt: "提示词",
      promptPlaceholder: "描述你想生成的内容...",
      duration: "时长",
      aspectRatio: "画面比例",
      estimated: "预估费用:",
      generate: "生成",
      signInPrefix: "登录后即可使用 Capi 生成。",
      resultPlaceholder: "生成结果会显示在这里",
    },
    endpoints: {
      title: "几分钟内开始构建",
      description: "直接调用 REST 接口、使用 SDK,或者交给你的编程 Agent。",
    },
    build: {
      title: "开发者用 Capi 构建什么",
      cases: [
        {
          title: "AI 驱动的应用",
          body: "把图像、视频和音乐生成能力接进你的产品,不用逐个管理提供商账号。一个 API Key、一份账单、一种 webhook 格式。",
        },
        {
          title: "Agent 工作流",
          body: "让 Claude Code、Codex、Gemini CLI 等编程 Agent 通过 MCP 服务或可安装技能访问 240+ 模型。",
        },
        {
          title: "批量媒体流水线",
          body: "借助异步任务管理和 webhook 回调,批量生成上千个图像、视频或音频文件。轮询或等待,CLI 与 SDK 都支持。",
        },
        {
          title: "多模型方案验证",
          body: "不必分别注册账号就能横向对比各提供商的效果。从 Kling 换到 Veo 再换到 Seedance,只需要改一个参数。",
        },
      ],
    },
    manage: {
      title: "管理 API 访问所需的一切",
      description:
        "给每个项目独立的 API Key、预算与权限,并实时监控整个组织的用量。",
      cards: [
        {
          title: "面向生产环境",
          body: "为生产负载而建:异步任务管理、webhook 回调、自动重试,以及可预期的按额度计费。提供 Python、Node.js、PHP、Java、Ruby、Go 六种 SDK。",
        },
        {
          title: "访问控制",
          body: "把 Key 限制在特定模型或模态范围内。吊销即时生效,且不影响其他 Key。可为临时访问设置过期时间。",
        },
        {
          title: "用量分析",
          body: "团队控制台把 API Key、用量、成本追踪和访问状态集中在一个工作区里。",
        },
      ],
    },
    team: {
      title: "正在带着团队一起做?",
      description: "企业接入、系统集成和技术问题,我们都可以帮上忙。",
    },
    comparison: {
      title: "Capi 与其他方案对比",
      feature: "对比项",
      capi: "Capi",
      openrouter: "OpenRouter",
      direct: "直连官方 API",
      varies: "视情况而定",
      rows: {
        modalities: "模态覆盖",
        models: "模型数量",
        pricing: "价格",
        sdks: "SDK",
        cli: "CLI",
        mcp: "MCP 服务",
        skills: "Agent 技能",
        async: "异步 + Webhook",
      },
      values: {
        modalities: "视频、图像、音乐、音频、大模型",
        modalitiesAlt: "仅大模型",
        modalitiesDirect: "每家各自为政",
        models: "240+",
        modelsAlt: "300+(仅大模型)",
        modelsDirect: "单一提供商",
        pricing: "便宜 15-25%",
        pricingAlt: "市场价",
        pricingDirect: "官方价",
        sdks: "6 种语言",
        sdksAlt: "2 种语言",
        sdksDirect: "视情况而定",
        yes: "支持",
        no: "不支持",
        varies: "视情况而定",
      },
    },
    explore: {
      eyebrow: "探索",
      title: "开发者工具",
      cards: [
        {
          title: "MCP 服务",
          body: "把 Claude Code、Cursor 以及其他兼容 MCP 的 Agent 接到 160+ 模型上。",
        },
        {
          title: "CLI",
          body: "在终端里运行 AI 模型,输出以 JSON 优先。",
        },
        {
          title: "SDK",
          body: "Python、Node.js、PHP、Java、Ruby、Go 六种 SDK,方便程序化接入。",
        },
        {
          title: "模型目录",
          body: "浏览全部 200+ 模型的价格、参数与代码示例。",
        },
      ],
    },
    faq: {
      eyebrow: "常见问题",
      title: "常见问题解答",
      items: [
        {
          q: "如何开始使用 Capi?",
          a: "在 capi.ai 注册免费账号,在控制台生成 API Key,然后发出第一个 API 请求。不需要信用卡。快速开始不到 10 分钟——装一个 SDK,把 API Key 写进环境变量,就可以调用任意模型接口。模型目录里列出了每个可用模型的参数、价格和代码示例。",
        },
        {
          q: "Capi 提供哪些 AI 模型?",
          a: "Capi 覆盖五大模态、共 240+ 模型:视频(Kling、Veo、Seedance、Hailuo、Runway、Wan)、图像(GPT Image、Nano Banana、Flux、Midjourney、Seedream)、音乐(Suno、Producer)、音频(ElevenLabs、Fish Audio、Gemini TTS、Whisper),以及大语言模型(Claude、GPT、Gemini、DeepSeek、GLM、Qwen)。",
        },
        {
          q: "Capi 的计费方式是怎样的?",
          a: "按额度、按量付费。每个模型在调用之前就会展示单价——大模型按每百万 token,视频按秒,图像按次,语音按每千字符。没有订阅费,没有月度低消,每次响应都会带上实际结算金额。",
        },
        {
          q: "是否提供 SDK 和开发者工具?",
          a: "提供。官方 SDK 覆盖 Python、Node.js、PHP、Java、Ruby、Go,都带完整类型定义和内置的任务轮询。此外还有 JSON 优先输出的 CLI、面向编程 Agent 的 MCP 服务,以及可安装的 Agent 技能。",
        },
        {
          q: "生成失败会怎么处理?",
          a: "失败的生成不计费。预扣的额度会自动退回,任务里会带上结构化的错误信息和提供商的失败原因,你可以重试或改走其他模型。",
        },
        {
          q: "Capi 如何支持异步媒体生成?",
          a: "视频、音乐和耗时的图像任务都是异步的。提交任务后立即返回任务 ID;你可以轮询任务接口、用 SDK 提供的等待方法,或者传入 callback_url 在结果就绪时接收带签名的 webhook。",
        },
        {
          q: "可以把 Capi 接给编程 Agent 用吗?",
          a: "可以。Capi 提供 MCP 服务,让 Claude Code、Codex、Cursor、Windsurf、Gemini CLI 访问完整模型目录,另外还有可安装、面向具体任务的 Agent 技能。",
        },
        {
          q: "Capi 兼容 OpenAI 的 API 格式吗?",
          a: "兼容。大模型侧提供与 OpenAI 一致的 /v1/chat/completions、/v1/responses、/v1/embeddings、/v1/moderations 接口,现有 OpenAI 客户端只要改 base URL 和 API Key 就能用。此外还有 Anthropic Messages 和 Gemini generateContent 的兼容路由。",
        },
        {
          q: "需要分别注册各家 AI 厂商的账号吗?",
          a: "不需要。提供商关系由 Capi 维护,你只需要一个账号和一个 API Key。计费、限流、重试和 webhook 在所有提供商之间是统一的。",
        },
        {
          q: "Capi 提供怎样的支持与 SLA?",
          a: "自助账号包含文档、状态订阅和邮件支持。团队版与企业版额外提供专属支持渠道、自定义限流,以及带优先级路由的合同化可用性 SLA。",
        },
      ],
    },
    cta: {
      title: "准备好开始构建了吗?",
      description: "领取免费 API Key,几分钟内产出第一个结果。",
    },
  },

  models: {
    eyebrow: "模型目录",
    title: "探索 {count} 个 AI 模型",
    description:
      "浏览、对比并接入最适合的视频、图像、音乐、音频与文本生成模型——全部通过同一个 API。",
    available: "所有模型均可用 · 价格实时更新",
    wallTitle: "领先的 AI 模型,同一个 API",
    filters: {
      all: "全部",
      llm: "大模型",
      image: "图像",
      video: "视频",
      audio: "音频与音乐",
      utility: "工具类",
      provider: "提供商",
      sort: "排序",
      sortRecommended: "推荐排序",
      sortName: "名称 A–Z",
      sortPrice: "价格从低到高",
    },
    empty: {
      title: "没有符合条件的模型",
      body: "换一个模态,或者清掉提供商筛选试试。",
    },
    card: {
      from: "起价",
    },
    detail: {
      backToModels: "模型",
      by: "提供方",
      capabilities: "能力",
      availableModels: "可用模型",
      availableModelsHint: "把下面任意一个 ID 填进",
      availableModelsHintSuffix: "字段。",
      modelId: "模型 ID",
      detailColumn: "说明",
      priceColumn: "价格",
      pricingStartsAt: "价格起点",
      pricingNote:
        "只为实际用量付费。每次响应都会返回从余额中结算的确切金额——没有订阅,没有低消。",
      quickstart: "快速开始",
      moreModels: "更多{modality}模型",
    },
    bottom: {
      title: "不确定该选哪个模型?",
      description:
        "每个模型页面都列出了确切的模型 ID、按单位计价的价格,以及可直接复制的请求示例。想横向对比效果,可以去",
      descriptionSuffix: "调试台。",
    },
  },

  docs: {
    sidebar: {
      searchPlaceholder: "搜索",
      noResults: "没有匹配“{query}”的页面。",
      menu: "文档目录",
      onThisPage: "本页内容",
    },
    tabs: {
      guides: "指南",
      api: "API 参考",
      resources: "开发者资源",
    },
    groups: {
      gettingStarted: "入门",
      taskApi: "任务 API",
      llmApi: "大模型 API",
      platformManagement: "平台管理",
      tooling: "工具链",
      mcp: "MCP",
      toolIntegrations: "工具集成",
      applicationPractices: "应用实践",
      apiReference: "API 参考",
      platform: "平台",
      account: "账户",
      task: "任务",
    },
    guidesOverview: {
      title: "指南",
      description: "在使用 API 参考之前,先了解 Capi 的核心工作流程。",
    },
    resourcesOverview: {
      title: "开发者资源",
      description:
        "SDK、工具链与集成指南,帮你在自己的语言、编辑器和现有应用里使用 Capi。",
      fallbackDescription: "阅读该指南了解更多。",
      englishOnly: "此页面目前仅提供英文版本。",
    },
    apiOverview: {
      title: "API 参考",
      description:
        "Capi 暴露的全部接口,按能力分组。每个页面都会说明参数、可直接运行的请求,以及确切的响应结构。",
      allEndpoints: "全部接口",
    },
    api: {
      overview: "概述",
      parameters: "参数",
      requestBody: "请求体",
      notes: "说明",
      example: "示例",
      name: "名称",
      type: "类型",
      description: "说明",
      baseUrl: "Base URL",
      apiVersion: "API 版本",
      authentication: "认证方式",
      taskApiQuickstart: "任务 API 快速开始",
    },
    contentNotice:
      "此页正文目前仅提供英文版本,我们正在陆续补充中文翻译。界面与导航已完成中文化。",
  },

  mcp: {
    eyebrow: "MCP 服务",
    title: "让你的编程 Agent 用上所有模型",
    description:
      "一个 MCP 服务把整个目录——视频、图像、音乐、音频和大模型——暴露给 Claude Code、Codex、Cursor 以及任何兼容 MCP 的 Agent。",
    meta: "兼容所有 MCP 客户端",
    targets: { eyebrow: "接入目标", title: "适配你已经在用的 Agent" },
    targetsDescription:
      "注册一次,Agent 就获得完整目录。不需要装 SDK,也不用自定义工具定义。",
    clients: [
      { title: "Claude Code", body: "MCP 加上可安装的 Agent 技能。", meta: "MCP + CLI" },
      { title: "Codex", body: "一条命令,工具即刻可用。", meta: "MCP" },
      { title: "Cursor", body: "在 mcpServers 下加一条配置。", meta: "MCP" },
      { title: "VS Code", body: "按工作区定义的 MCP 服务。", meta: "MCP" },
      { title: "Windsurf", body: "与 Cursor 写法一致。", meta: "MCP" },
      { title: "Gemini CLI", body: "通过命令行注册。", meta: "MCP" },
    ],
    tools: { eyebrow: "工具", title: "Agent 可以调用什么", tool: "工具", purpose: "用途" },
    toolRows: [
      { name: "list_models", body: "按模态、提供商或能力搜索模型目录。" },
      { name: "get_model", body: "获取单个模型的完整参数结构与价格。" },
      { name: "generate", body: "创建生成任务并等待结果返回。" },
      { name: "get_task", body: "轮询异步任务的状态与输出。" },
      { name: "get_balance", body: "读取该 Key 的剩余额度。" },
    ],
    setup: { eyebrow: "接入", title: "三步接好" },
    setupSteps: [
      {
        title: "创建受限的 Key",
        body: "在控制台生成一个 Key,并限制为 Agent 实际需要的模态。",
      },
      {
        title: "注册 MCP 服务",
        body: "Claude Code、Codex、Gemini CLI 各一条命令。Cursor 与 VS Code 用 JSON 配置。",
      },
      {
        title: "直接要素材",
        body: "描述你想要的素材,Agent 会自己选模型、生成、等待并返回链接。",
      },
    ],
    safety: [
      {
        title: "收敛 Key 权限",
        body: "MCP 服务以所给 Key 的权限行事。只授予 Agent 真正需要的模态。",
      },
      {
        title: "给花费设上限",
        body: "传入 --max-cost 让单次调用不超过阈值,并在 Key 上设置月度预算。",
      },
      {
        title: "预期会有重试",
        body: "Agent 会重试失败的步骤。视频模型是最贵的场景——默认建议关掉。",
      },
    ],
    explore: { eyebrow: "探索", title: "相关开发者工具" },
    exploreCards: [
      { title: "CLI", body: "在终端里获得同样的能力,输出以 JSON 优先。" },
      { title: "SDK", body: "六种语言,完整类型定义,内置任务轮询。" },
      { title: "Agent 技能", body: "把工作流和模型打包在一起,保证输出一致。" },
      { title: "模型目录", body: "浏览每个模型的价格与代码示例。" },
    ],
    cta: {
      title: "给你的 Agent 配上浏览器和工作室",
      description:
        "装上 MCP 服务,你的编程 Agent 就能按需生成视频、图像、音乐和语音。",
    },
  },

  cli: {
    eyebrow: "CLI",
    title: "在终端里运行任何模型",
    description:
      "Capi CLI 与 REST 接口能力一致,输出以 JSON 优先,方便配合 jq,也能干净地在脚本和 CI 里调用。",
    commands: { eyebrow: "命令", title: "可以执行什么", command: "命令", purpose: "用途" },
    rows: [
      { name: "capi models list", body: "列出模型目录,可按模态和提供商筛选。" },
      { name: "capi image generate", body: "生成一张图像并打印输出链接。" },
      { name: "capi video generate", body: "提交视频任务,阻塞直到完成。" },
      { name: "capi tasks get <id>", body: "查看任务的状态、进度和费用。" },
      { name: "capi balance", body: "打印剩余额度。" },
      { name: "capi auth login", body: "把 Key 存进本地配置文件。" },
    ],
    usage: { eyebrow: "用法", title: "为脚本而生" },
    features: [
      { title: "JSON 优先", body: "所有命令都向 stdout 输出结构化 JSON,管道给 jq 很安全。" },
      { title: "退出码规范", body: "失败时返回非零退出码,并在 stderr 给出机器可读的错误。" },
      { title: "零配置可用", body: "没有配置文件时,直接从环境变量读取 CAPI_API_KEY。" },
      { title: "感知流式", body: "对话类命令默认流式输出 token,可用 --no-stream 改为缓冲。" },
    ],
    cta: {
      title: "安装 CLI",
      description: "一条命令装好,然后在 shell 里直接生成图像和视频。",
    },
  },

  sdk: {
    eyebrow: "SDK",
    title: "适配各种技术栈的 SDK",
    description:
      "六种语言的官方客户端。每个都封装了 REST 接口、提供带类型的错误,并处理异步任务轮询,让你不必再写重试逻辑。",
    languages: { eyebrow: "语言", title: "六个客户端,同一种形态" },
    languagesDescription:
      "一个客户端、按模态划分的命名空间、带类型的错误,以及 wait() 辅助方法。学会一个就等于全会。",
    clients: [
      { title: "Python", body: "同步与 asyncio 客户端,内置任务轮询。" },
      { title: "Node.js", body: "同时提供 ESM 与 CJS 构建,含 TypeScript 类型声明。" },
      { title: "Go", body: "支持 context,请求与响应都带类型。" },
      { title: "PHP", body: "兼容 PSR-18 的 HTTP 客户端。" },
      { title: "Ruby", body: "符合语言习惯的关键字参数写法。" },
      { title: "Java", body: "提供 Maven 与 Gradle 依赖,链式请求构建。" },
    ],
    options: { eyebrow: "配置", title: "客户端选项", option: "选项", behaviour: "行为" },
    optionRows: [
      { name: "api_key", body: "省略时读取 CAPI_API_KEY。" },
      { name: "base_url", body: "可指向代理或 mock 服务。" },
      { name: "timeout", body: "单次请求超时时间(秒)。" },
      { name: "max_retries", body: "遇到 429 与 5xx 时按退避策略重试。" },
      { name: "poll_interval", body: "wait() 的初始轮询间隔。" },
    ],
    features: [
      { title: "带类型的错误", body: "各语言统一的异常层级,携带状态码、错误码与提供商原文。" },
      { title: "自动重试", body: "429 与 5xx 按指数退避重试,并遵守 Retry-After。" },
      { title: "完整类型定义", body: "响应端到端都有类型,编辑器能自动补全模型 ID 和参数。" },
      { title: "支持流式", body: "大模型路由直接透传增量 token,SDK 层不做缓冲。" },
    ],
    errorTitle: "错误处理",
    compatTitle: "无缝兼容 OpenAI",
    cta: {
      title: "装上 SDK 直接开工",
      description:
        "六种语言、同一套 API 能力,加上任务辅助方法,让你专注在产品而不是管线上。",
    },
  },

  skills: {
    eyebrow: "Agent 技能",
    title: "打包给编程 Agent 的工作流",
    description:
      "技能会固定模型、提示词骨架和输出路径,所以同一个需求每次都能产出同一类素材——对团队里每个开发者都一样。",
    primaryCta: "浏览模型目录",
    why: { eyebrow: "为什么要用技能", title: "把模型选择变成可评审的产物" },
    whyDescription:
      "没有技能时,每次生成都是一次临时决定:哪个模型、多大尺寸、什么提示词。有了技能,这些选择被提交进仓库,像其他改动一样被评审。",
    whyCards: [
      { title: "输出一致", body: "提示词骨架、模型和画面比例都在技能里,所以这次的活动素材和上次看起来是一套。" },
      { title: "天然可评审", body: "改技能就是提一个 PR。品牌和法务可以在生成之前就看到会产出什么。" },
      { title: "实际更省钱", body: "固定的模型与尺寸,能避免日常工作中误调昂贵的视频模型。" },
      { title: "可组合", body: "技能调用 MCP 服务提供的工具,因此可以串联生成、下载和落盘。" },
    ],
    install: { eyebrow: "安装", title: "三步得到可复用的工作流" },
    installSteps: [
      { title: "添加技能", body: "技能按项目安装,所以约束会跟着仓库一起走。" },
      { title: "评审方案", body: "技能里声明了模型、尺寸和输出路径。提交之后对所有人都生效。" },
      { title: "调用它", body: "在 Agent 里按名字调用,它会填好提示词骨架并写出文件。" },
    ],
    catalogue: { eyebrow: "技能清单", title: "目前可用的技能" },
    catalogueItems: [
      { title: "brand-imagery", meta: "图像 · 品牌", body: "符合品牌风格的产品与营销视觉——固定模型、画面比例和提示词骨架。" },
      { title: "release-video", meta: "视频 · 发布", body: "根据变更日志产出短视频预告,分镜和文案语气保持一致。" },
      { title: "voiceover", meta: "音频 · 旁白", body: "把脚本转成旁白,同一系列使用同一个音色。" },
      { title: "doc-diagrams", meta: "图像 · 文档", body: "与文档配色和线条粗细一致的示意图风格图像。" },
      { title: "social-crops", meta: "图像 · 社媒", body: "一张主视觉,按各渠道比例裁切并重新构图。" },
      { title: "podcast-beds", meta: "音乐 · 音频", body: "为固定栏目生成可循环、节奏与情绪一致的垫乐。" },
    ],
    cta: {
      title: "把工作流打包一次",
      description:
        "定义好模型、风格和落盘位置,然后让每个开发者都能产出符合规范的素材。",
    },
  },

  pricing: {
    eyebrow: "价格",
    title: "只为实际生成的内容付费",
    description:
      "没有订阅,没有低消。每个模型在你调用之前都会公布单价,每次响应都会报告从余额中结算的确切金额。",
    units: { eyebrow: "计价单位", title: "按每种模态最自然的单位计费" },
    unitsDescription:
      "你不会为一个几乎不用的模型支付固定费用。视频按秒、图像按次、大模型按 token 计费。",
    table: {
      modality: "模态",
      unit: "计价单位",
      example: "示例模型",
      from: "起价",
    },
    rows: [
      { modality: "视频", unit: "每秒", example: "Veo 3.1 Fast", from: "$0.06" },
      { modality: "图像", unit: "每次调用", example: "GPT Image 2", from: "$0.03" },
      { modality: "音乐", unit: "每首", example: "Suno v5.5", from: "$0.18" },
      { modality: "音频", unit: "每千字符", example: "ElevenLabs TTS v3", from: "$0.04" },
      { modality: "大模型", unit: "每百万输入 token", example: "GPT-5.6", from: "$2.50" },
      { modality: "向量嵌入", unit: "每百万 token", example: "Embedding 4 Large", from: "$0.13" },
    ],
    included: { eyebrow: "包含", title: "基础费率里已经包含" },
    includedDescription:
      "平台能力不是付费档位。Key 管理、回调、SDK 和用量分析对每个账号都开放。",
    includedItems: [
      "不限数量的 API Key,每个都可以单独设预算与权限",
      "异步任务管理,含自动重试与失败退款",
      "带签名投递的 webhook 回调",
      "六种语言的 SDK、CLI,以及 MCP 服务",
      "用量分析与按 Key 的成本追踪",
    ],
    notes: [
      { title: "失败的生成不计费", body: "如果提供商失败或拦截了请求,预扣额度会被释放。只为真正交付的输出付费。" },
      { title: "不在 token 上做文章", body: "每个模型的输入与输出价格都公开,所以你能在发请求之前就算出成本。" },
      { title: "用预算做护栏", body: "给每个 Key 设月度上限。触顶后请求返回 402,而不是悄悄继续花钱。" },
      { title: "面向团队的批量条款", body: "团队版与企业版提供自定义限流、开票结算,以及合同化的可用性 SLA。" },
    ],
    volume: {
      title: "用量规模比较大?",
      body: "高量承诺可以享受更低的单价和专属吞吐。把你们的工作负载形态告诉我们。",
    },
    cta: {
      title: "从免费额度开始",
      description:
        "注册账号、生成 Key,在正式投入之前先看清每次调用到底花多少钱。",
    },
  },

  teams: {
    eyebrow: "团队",
    title: "让每个项目都有自己的 Key、预算和限制",
    description:
      "一个工作区覆盖整个组织:隔离花费、约束访问,并且看清额度到底花在了哪里。",
    requestPack: "索取资料",
    controls: { eyebrow: "管控能力", title: "多模型基础设施需要多租户护栏" },
    capabilities: [
      { title: "每个项目一个 Key", body: "为每个服务、环境、客户发放独立 Key。轮换或吊销其中一个不影响其他部分。" },
      { title: "预算即硬性上限", body: "给 Key 绑定月度上限。触顶后请求返回 402,而不是悄悄超支。" },
      { title: "细粒度权限", body: "把 Key 限制在特定模态或模型族,前端用的 Key 就够不到账单相关的接口。" },
      { title: "用量分析", body: "按 Key、模型、模态和时间区间拆解花费。可导出 CSV,也能通过 API 读取。" },
      { title: "账号席位管理", body: "邀请工程师加入,并用角色区分账单权限与 Key 发放权限。" },
      { title: "审计日志", body: "每次管理操作都会记录操作方 Key、目标对象、时间戳和来源地址。" },
    ],
    blocks: [
      { title: "程序化发放", body: "管理 Key 可以签发受限的普通 Key,因此客户接入不需要有人在控制台点按钮。" },
      { title: "两类凭据互相隔离", body: "管理 Key 不能发起生成,生成 Key 不能管理密钥。任何一侧泄露都能把影响控制住。" },
      { title: "企业级条款", body: "自定义限流、开票结算、SSO、私网接入选项,以及合同化的可用性 SLA。" },
    ],
    security: {
      title: "需要安全评审材料?",
      body: "我们可以提供架构说明、数据流图和留存策略。",
    },
    cta: {
      title: "把 Capi 推到整个组织",
      description: "先从一个项目开始,随着铺开再逐步加上 Key、预算和席位。",
    },
  },

  contact: {
    eyebrow: "联系我们",
    title: "和团队聊一聊",
    description:
      "企业接入、批量价格、技术集成或者安全评审——告诉我们你的需求,我们会转给对的人。",
    form: { eyebrow: "咨询", title: "给我们留言" },
    channels: { eyebrow: "其他方式", title: "其他联系渠道" },
    channelItems: [
      { title: "邮件", body: "账号、账单和一般性问题。", meta: "hello@capi.ai" },
      { title: "技术支持", body: "所有账号都包含,含免费账号。", meta: "support@capi.ai" },
      { title: "文档", body: "大部分集成问题在那里已经有答案。", meta: "阅读文档" },
      { title: "状态页", body: "各提供商的实时可用性与故障历史。", meta: "status.capi.ai" },
    ],
    responseTimes: {
      title: "响应时效",
      body: "免费与按量付费账号会在一个工作日内回复。团队版与企业版有专属渠道,响应目标更短。",
    },
    fields: {
      name: "称呼",
      namePlaceholder: "张明",
      email: "企业邮箱",
      emailPlaceholder: "you@example.com",
      company: "公司",
      companyPlaceholder: "选填",
      topic: "咨询主题",
      message: "我们能帮上什么?",
      messagePlaceholder: "介绍一下工作负载、预计用量,以及是否有合规要求。",
      submit: "发送消息",
      replyNote: "我们会在一个工作日内回复。",
    },
    topics: [
      "企业接入",
      "批量价格",
      "技术集成",
      "安全评审",
      "其他",
    ],
    validation: {
      name: "请告诉我们你的称呼。",
      email: "请填写有效的邮箱地址。",
      message: "简单描述一下工作负载,方便我们转给对的人。",
    },
    success: {
      title: "收到,我们会尽快联系你。",
      body: "这个表单是演示用的,不会真的发送内容。在生产环境里,它会提交到你们的 CRM 或内部接口,并把企业咨询转给解决方案工程师。",
    },
  },

  playground: {
    eyebrow: "调试台",
    title: "拼一个请求,看看它的样子",
    description:
      "选一个模态、挑一个模型,查看它接受哪些参数、调用大概要花多少钱。这个版本只是界面预览,不会真的发起生成。",
    tabs: {
      video: "视频",
      image: "图像",
      music: "音乐",
      audio: "音频",
      text: "大模型",
    },
    fields: {
      model: "模型",
      prompt: "提示词",
      promptPlaceholder: "描述你想生成的内容...",
      duration: "时长",
      aspectRatio: "画面比例",
      estimated: "预估费用:",
      generate: "生成",
      signInPrefix: "登录后即可使用 Capi 生成。",
      resultPlaceholder: "生成结果会显示在这里",
      parameters: "参数",
      requestPreview: "请求预览",
    },
  },

  auth: {
    login: {
      title: "登录 Capi",
      description: "使用你的工作邮箱继续。",
      submit: "登录",
      noAccount: "还没有账号?",
      createOne: "立即注册",
    },
    signup: {
      title: "创建账号",
      description: "注册即送免费额度,不需要信用卡。",
      submit: "创建账号",
      hasAccount: "已经有账号了?",
      signIn: "去登录",
    },
    fields: {
      email: "邮箱",
      emailPlaceholder: "you@example.com",
      password: "密码",
      passwordPlaceholder: "至少 8 位",
      name: "姓名",
      namePlaceholder: "张明",
    },
    validation: {
      email: "请输入有效的邮箱地址。",
      password: "密码至少需要 8 位。",
      name: "请输入你的姓名。",
    },
    demoNote: "这是界面演示,没有接真实认证。提交后会直接进入控制台。",
    backToSite: "返回官网",
  },

  dashboard: {
    label: "控制台",
    nav: {
      overview: "概览",
      keys: "API Key",
      usage: "用量",
      models: "模型",
      settings: "设置",
    },
    overview: {
      title: "概览",
      subtitle: "账号 acct_4821 · 最近 14 天的用量。",
      manageKeys: "管理 Key",
      getStarted: "快速开始",
      kpis: {
        balance: "余额",
        spend: "本月花费",
        requests: "请求数",
        successRate: "成功率",
      },
      kpiNotes: {
        balance: "已充值 $20.00",
        spend: "已过 14 天",
        requests: "今日 1,284 次",
        successRate: "比上周低 0.4%",
      },
      dailySpend: "每日花费",
      costByModel: "各模型花费",
      recentActivity: "最近活动",
      table: {
        task: "任务",
        modality: "模态",
        status: "状态",
        cost: "费用",
        when: "时间",
      },
      status: {
        completed: "已完成",
        processing: "处理中",
        failed: "失败",
      },
      when: {
        twoMinutes: "2 分钟前",
        fourteenMinutes: "14 分钟前",
        eighteenMinutes: "18 分钟前",
        fortyOneMinutes: "41 分钟前",
        oneHour: "1 小时前",
      },
    },
    keys: {
      title: "API Key",
      description:
        "按服务或环境分别创建 Key,这样轮换其中一个时不会影响其他部分。",
      create: "创建 Key",
      createTitle: "新建 API Key",
      creating: "创建",
      cancel: "取消",
      name: "名称",
      namePlaceholder: "web-prod-images",
      scopes: "权限范围",
      budget: "月度预算(USD)",
      budgetPlaceholder: "500",
      perMonth: "/ 月",
      secretOnce: "请立刻复制这个密钥——它只会显示一次。Capi 只保存哈希值。",
      dismiss: "知道了",
      table: {
        name: "名称",
        key: "密钥",
        scopes: "权限范围",
        budget: "预算",
        created: "创建时间",
        lastUsed: "最近使用",
        actions: "操作",
      },
      reveal: "显示",
      hide: "隐藏",
      revoke: "吊销",
      never: "从未",
      noBudget: "不限",
      revoked: "已吊销",
      footnote:
        "吊销即时生效。这个演示只在内存里保存 Key,刷新页面就会重置。",
      scopeOptions: {
        image: "image.generate",
        video: "video.generate",
        music: "music.generate",
        llm: "llm.chat",
        billing: "billing.read",
      },
      validation: {
        name: "请给这个 Key 起个名字。",
      },
    },
    usage: {
      title: "用量",
      subtitle: "当前计费周期的花费与请求量。",
      thisPeriod: "本周期",
      requests: "请求数",
      avgCost: "单次请求均价",
      topModels: "花费最高的模型",
      byModality: "按模态",
      byKey: "按 Key",
      dailySpend: "每日花费",
      total: "合计",
      exportHint: "可以在接口里导出完整明细为 CSV,或者程序化读取:",
      table: {
        model: "模型",
        requests: "请求数",
        spend: "花费",
        share: "占比",
        modality: "模态",
        tokens: "Token",
      },
      modalities: {
        video: "视频",
        image: "图像",
        text: "大模型",
        music: "音乐",
        audio: "音频",
        embeddings: "向量",
      },
    },
    models: {
      title: "模型",
      description:
        "当前账号可以调用的全部模型,以及适用的确切费率。可用范围取决于 Key 的权限。",
      openCatalog: "打开完整目录",
      table: {
        modelId: "模型 ID",
        family: "系列",
        modality: "模态",
        detail: "说明",
        rate: "费率",
      },
      footnote: "{count} 个模型 ID,分属 {families} 个系列。各模态的计费方式见",
      footnotePricing: "价格页",
      footnoteSuffix: "。",
    },
    settings: {
      title: "设置",
      description: "账号信息与通知偏好。",
      account: "账号",
      accountDescription: "挂在当前工作区下的信息。",
      accountName: "账号名称",
      accountEmail: "账单邮箱",
      accountId: "账号 ID",
      plan: "套餐",
      planValue: "按量付费",
      notifications: "通知",
      notificationsDescription:
        "选择 Capi 通过邮件通知你的内容。改动仅作用于当前工作区。",
      notifyTaskFailed: "生成失败",
      notifyTaskFailedBody: "任务重试后仍失败时邮件通知我,并附上提供商给出的原因。",
      notifyBudget: "预算阈值",
      notifyBudgetBody: "某个 Key 达到月度预算的 80% 和 100% 时邮件通知我。",
      notifyWeekly: "每周摘要",
      notifyWeeklyBody: "每周一发一份花费、用量与热门模型的汇总。",
      notifyProduct: "产品动态",
      notifyProductBody: "偶尔发送新模型与平台变更的通知邮件。",
      danger: "危险操作",
      dangerDescription:
        "关闭账号会吊销所有 Key,并把所有已生成的媒体排入删除队列。",
      closeAccount: "关闭账号",
      saved: "偏好已保存",
      save: "保存偏好",
    },
  },

  terms: {
    eyebrow: "法律",
    title: "服务条款",
    updated: "2026 年 3 月 14 日",
    intro:
      "本条款约束你对 Capi API、控制台及相关服务的使用。创建账号即表示你同意这些条款。",
  },
  privacy: {
    eyebrow: "法律",
    title: "隐私政策",
    updated: "2026 年 3 月 14 日",
    intro:
      "本政策说明你在使用 Capi 时我们会收集哪些信息、为什么收集、保留多久,以及你有哪些选择。",
  },
};

export default zh;
