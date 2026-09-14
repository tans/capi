export type Modality =
  | "video"
  | "image"
  | "music"
  | "audio"
  | "text"
  | "utility";

export type ModelVariant = {
  /** The model ID you pass in the API request. */
  id: string;
  name: string;
  /** Short note shown next to the variant, e.g. context window or clip length. */
  detail?: string;
  /** Human-readable price line for this specific variant. */
  price: string;
};

export type ModelEntry = {
  slug: string;
  name: string;
  provider: string;
  modality: Modality;
  /** Modality label rendered as the card badge. */
  badge: string;
  tagline: string;
  /** Cheapest entry point for this family, shown on the catalogue card. */
  priceFrom: { amount: string; unit: string };
  capabilities: string[];
  variants: ModelVariant[];
  featured?: boolean;
};

export const modalityMeta: Record<
  Modality,
  { label: string; badge: string; filter: string; badgeVariant: string }
> = {
  video: { label: "Video", badge: "Video", filter: "VIDEO", badgeVariant: "video" },
  image: { label: "Image", badge: "Image", filter: "IMAGE", badgeVariant: "image" },
  music: { label: "Music", badge: "Music", filter: "MUSIC", badgeVariant: "audio" },
  audio: { label: "Audio", badge: "Audio", filter: "AUDIO & MUSIC", badgeVariant: "audio" },
  text: { label: "Text", badge: "Text", filter: "LLM", badgeVariant: "text" },
  utility: { label: "Utility", badge: "Utility", filter: "UTILITY", badgeVariant: "utility" },
};

export const models: ModelEntry[] = [
  /* ------------------------------- Language ------------------------------- */
  {
    slug: "claude",
    name: "Claude",
    provider: "Anthropic",
    modality: "text",
    badge: "Text",
    tagline:
      "Claude API access for Anthropic's LLM across complex reasoning, code, analysis, and extended-context tasks.",
    priceFrom: { amount: "0.0006", unit: "1K tokens" },
    capabilities: ["Chat", "Tool use", "Vision", "Long context"],
    featured: true,
    variants: [
      { id: "claude-opus-5", name: "Claude Opus 5", detail: "200K context", price: "$5.00 / 1M input tokens" },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", detail: "200K context", price: "$3.00 / 1M input tokens" },
      { id: "claude-haiku-4", name: "Claude Haiku 4", detail: "200K context", price: "$0.60 / 1M input tokens" },
    ],
  },
  {
    slug: "gpt",
    name: "GPT",
    provider: "OpenAI",
    modality: "text",
    badge: "Text",
    tagline:
      "OpenAI's flagship reasoning and chat models through the OpenAI-compatible chat completions endpoint.",
    priceFrom: { amount: "0.0005", unit: "1K tokens" },
    capabilities: ["Chat", "Responses API", "Tool use", "Vision"],
    variants: [
      { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", detail: "400K context", price: "$6.00 / 1M input tokens" },
      { id: "gpt-5.6", name: "GPT-5.6", detail: "400K context", price: "$2.50 / 1M input tokens" },
      { id: "gpt-5-mini", name: "GPT-5 mini", detail: "200K context", price: "$0.50 / 1M input tokens" },
    ],
  },
  {
    slug: "gemini",
    name: "Gemini",
    provider: "Google",
    modality: "text",
    badge: "Text",
    tagline:
      "Gemini API access for Google's multimodal LLM across chat, code generation, reasoning, and long-context tasks.",
    priceFrom: { amount: "0.0003", unit: "1K tokens" },
    capabilities: ["Chat", "Streaming", "Vision", "1M context"],
    variants: [
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", detail: "1M context", price: "$1.25 / 1M input tokens" },
      { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash", detail: "1M context", price: "$0.30 / 1M input tokens" },
    ],
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    provider: "DeepSeek",
    modality: "text",
    badge: "Text",
    tagline:
      "DeepSeek API access via CAPI — flash for fast, low-cost work; pro for complex agentic tasks.",
    priceFrom: { amount: "0.0004", unit: "1K tokens" },
    capabilities: ["Chat", "Reasoning", "Tool use"],
    variants: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", detail: "128K context", price: "$0.55 / 1M input tokens" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", detail: "128K context", price: "$0.14 / 1M input tokens" },
    ],
  },
  {
    slug: "glm",
    name: "GLM",
    provider: "Z.ai",
    modality: "text",
    badge: "Text",
    tagline:
      "Z.ai GLM API access via CAPI — MIT-licensed MoE models with up to 200K context, leading open-weight coding benchmarks.",
    priceFrom: { amount: "0.0001", unit: "1K tokens" },
    capabilities: ["Chat", "Coding", "Tool use"],
    variants: [
      { id: "glm-5", name: "GLM-5", detail: "200K context", price: "$0.40 / 1M input tokens" },
      { id: "glm-5-air", name: "GLM-5 Air", detail: "200K context", price: "$0.10 / 1M input tokens" },
    ],
  },
  {
    slug: "grok",
    name: "Grok",
    provider: "xAI",
    modality: "text",
    badge: "Text",
    tagline:
      "xAI Grok models for real-time reasoning, coding, and tool-driven agent workflows.",
    priceFrom: { amount: "0.0003", unit: "1K tokens" },
    capabilities: ["Chat", "Reasoning", "Live search"],
    variants: [
      { id: "grok-5", name: "Grok 5", detail: "256K context", price: "$3.00 / 1M input tokens" },
      { id: "grok-5-mini", name: "Grok 5 mini", detail: "256K context", price: "$0.30 / 1M input tokens" },
    ],
  },
  {
    slug: "qwen",
    name: "Qwen",
    provider: "Alibaba",
    modality: "text",
    badge: "Text",
    tagline:
      "Alibaba Qwen text models offering strong multilingual reasoning at open-weight pricing.",
    priceFrom: { amount: "0.0002", unit: "1K tokens" },
    capabilities: ["Chat", "Multilingual", "Tool use"],
    variants: [
      { id: "qwen-4-max", name: "Qwen 4 Max", detail: "256K context", price: "$1.60 / 1M input tokens" },
      { id: "qwen-4-turbo", name: "Qwen 4 Turbo", detail: "128K context", price: "$0.20 / 1M input tokens" },
    ],
  },
  {
    slug: "kimi",
    name: "Kimi",
    provider: "Moonshot AI",
    modality: "text",
    badge: "Text",
    tagline:
      "Moonshot AI Kimi models tuned for long-document reading, research synthesis, and agentic search.",
    priceFrom: { amount: "0.0002", unit: "1K tokens" },
    capabilities: ["Chat", "Long context", "Research"],
    variants: [
      { id: "kimi-k3", name: "Kimi K3", detail: "256K context", price: "$0.60 / 1M input tokens" },
      { id: "kimi-k3-turbo", name: "Kimi K3 Turbo", detail: "128K context", price: "$0.15 / 1M input tokens" },
    ],
  },
  {
    slug: "mimo",
    name: "MiMo",
    provider: "Xiaomi",
    modality: "text",
    badge: "Text",
    tagline:
      "Xiaomi MiMo lightweight reasoning models for high-throughput classification and extraction.",
    priceFrom: { amount: "0.0001", unit: "1K tokens" },
    capabilities: ["Chat", "Classification", "JSON mode"],
    variants: [
      { id: "mimo-7b", name: "MiMo 7B", detail: "128K context", price: "$0.08 / 1M input tokens" },
    ],
  },
  {
    slug: "embedding",
    name: "Embedding",
    provider: "OpenAI",
    modality: "text",
    badge: "Text",
    tagline:
      "OpenAI text embeddings for semantic search, retrieval, clustering, and ranking workflows.",
    priceFrom: { amount: "0.0000", unit: "1K tokens" },
    capabilities: ["Embeddings", "Retrieval", "Clustering"],
    variants: [
      { id: "text-embedding-4-large", name: "Embedding 4 Large", detail: "3072 dims", price: "$0.13 / 1M tokens" },
      { id: "text-embedding-4-small", name: "Embedding 4 Small", detail: "1536 dims", price: "$0.02 / 1M tokens" },
    ],
  },

  /* --------------------------------- Video -------------------------------- */
  {
    slug: "kling",
    name: "Kling",
    provider: "Kuaishou",
    modality: "video",
    badge: "Video",
    tagline:
      "Kling video generation for cinematic text-to-video, image-to-video, motion control, and avatar clips.",
    priceFrom: { amount: "0.070", unit: "second" },
    capabilities: ["Text to video", "Image to video", "Motion control", "Avatar"],
    featured: true,
    variants: [
      { id: "kling-v3-turbo-text-to-video", name: "Kling v3 Turbo", detail: "5s · 720p", price: "$0.07 / second" },
      { id: "kling-v3-pro-text-to-video", name: "Kling v3 Pro", detail: "10s · 1080p", price: "$0.14 / second" },
      { id: "kling-v2.1", name: "Kling v2.1", detail: "5s · 720p", price: "$0.09 / second" },
    ],
  },
  {
    slug: "veo-3-1",
    name: "Veo 3.1",
    provider: "Google",
    modality: "video",
    badge: "Video",
    tagline:
      "Google Veo 3.1 for native audio-video generation, extension, and upscaling with strong prompt adherence.",
    priceFrom: { amount: "0.150", unit: "second" },
    capabilities: ["Text to video", "Extend video", "Upscale", "Native audio"],
    featured: true,
    variants: [
      { id: "veo-3.1-text-to-video", name: "Veo 3.1", detail: "8s · 1080p", price: "$0.15 / second" },
      { id: "veo-3.1-fast", name: "Veo 3.1 Fast", detail: "8s · 720p", price: "$0.06 / second" },
      { id: "veo-3.1-extend-video", name: "Veo 3.1 Extend", detail: "adds 7s", price: "$1.05 / call" },
    ],
  },
  {
    slug: "seedance",
    name: "Seedance",
    provider: "Bytedance",
    modality: "video",
    badge: "Video",
    tagline:
      "Seedance 2.5 delivers precise choreography and camera control for text- and image-driven video.",
    priceFrom: { amount: "0.090", unit: "second" },
    capabilities: ["Text to video", "Image to video", "Camera control"],
    featured: true,
    variants: [
      { id: "seedance-2.5-text-to-video", name: "Seedance 2.5", detail: "5s · 1080p", price: "$0.09 / second" },
      { id: "seedance-2.0-lite", name: "Seedance 2.0 Lite", detail: "5s · 720p", price: "$0.04 / second" },
    ],
  },
  {
    slug: "hailuo",
    name: "Hailuo",
    provider: "MiniMax",
    modality: "video",
    badge: "Video",
    tagline:
      "MiniMax Hailuo video models for expressive character motion and physics-aware rendering.",
    priceFrom: { amount: "0.060", unit: "second" },
    capabilities: ["Text to video", "Image to video"],
    variants: [
      { id: "hailuo-3-text-to-video", name: "Hailuo 3", detail: "6s · 1080p", price: "$0.06 / second" },
      { id: "hailuo-3-image-to-video", name: "Hailuo 3 I2V", detail: "6s · 1080p", price: "$0.07 / second" },
    ],
  },
  {
    slug: "minimax-h3",
    name: "MiniMax H3",
    provider: "MiniMax",
    modality: "video",
    badge: "Video",
    tagline:
      "MiniMax H3 for high-fidelity long-form generation with multi-shot consistency.",
    priceFrom: { amount: "0.080", unit: "second" },
    capabilities: ["Text to video", "Image to video", "Multi-shot"],
    variants: [
      { id: "minimax-h3-text-to-video", name: "MiniMax H3", detail: "10s · 1080p", price: "$0.08 / second" },
    ],
  },
  {
    slug: "runway",
    name: "Runway",
    provider: "Runway",
    modality: "video",
    badge: "Video",
    tagline:
      "Runway Gen-4 and Aleph for text-to-video generation and instruction-based video editing.",
    priceFrom: { amount: "0.120", unit: "second" },
    capabilities: ["Text to video", "Extend video", "Video editing"],
    variants: [
      { id: "runway-gen-4-text-to-video", name: "Gen-4", detail: "5s · 1080p", price: "$0.12 / second" },
      { id: "runway-aleph-edit-video", name: "Aleph Edit", detail: "per edit", price: "$0.90 / call" },
    ],
  },
  {
    slug: "luma",
    name: "Luma",
    provider: "Luma",
    modality: "video",
    badge: "Video",
    tagline:
      "Luma Ray models for smooth motion synthesis, keyframe control, and video modification.",
    priceFrom: { amount: "0.055", unit: "second" },
    capabilities: ["Text to video", "Image to video", "Modify video"],
    variants: [
      { id: "luma-ray-3-text-to-video", name: "Ray 3", detail: "5s · 1080p", price: "$0.055 / second" },
      { id: "luma-modify-video", name: "Ray 3 Modify", detail: "per edit", price: "$0.45 / call" },
    ],
  },
  {
    slug: "pixverse",
    name: "PixVerse",
    provider: "PixVerse",
    modality: "video",
    badge: "Video",
    tagline:
      "PixVerse for stylised video generation, transitions, extension, and clip editing.",
    priceFrom: { amount: "0.045", unit: "second" },
    capabilities: ["Text to video", "Transitions", "Extend video"],
    variants: [
      { id: "pixverse-v6-text-to-video", name: "PixVerse V6", detail: "5s · 1080p", price: "$0.045 / second" },
      { id: "pixverse-transition-video", name: "Transition", detail: "per transition", price: "$0.30 / call" },
    ],
  },
  {
    slug: "wan-video",
    name: "Wan Video",
    provider: "Alibaba",
    modality: "video",
    badge: "Video",
    tagline:
      "Alibaba Wan video models for text-to-video, image-to-video, speech-driven avatars, and editing.",
    priceFrom: { amount: "0.035", unit: "second" },
    capabilities: ["Text to video", "Image to video", "Speech to video"],
    variants: [
      { id: "wan-3.0-text-to-video", name: "Wan 3.0", detail: "5s · 1080p", price: "$0.05 / second" },
      { id: "wan-3.0-turbo", name: "Wan 3.0 Turbo", detail: "5s · 720p", price: "$0.035 / second" },
      { id: "wan-speech-to-video", name: "Wan Speech to Video", detail: "per clip", price: "$0.60 / call" },
    ],
  },
  {
    slug: "happyhorse",
    name: "HappyHorse",
    provider: "Alibaba",
    modality: "video",
    badge: "Video",
    tagline:
      "HappyHorse video models optimised for fast draft iterations and edit-in-place workflows.",
    priceFrom: { amount: "0.030", unit: "second" },
    capabilities: ["Text to video", "Image to video", "Edit video"],
    variants: [
      { id: "happyhorse-text-to-video", name: "HappyHorse", detail: "5s · 720p", price: "$0.03 / second" },
      { id: "happyhorse-edit-video", name: "HappyHorse Edit", detail: "per edit", price: "$0.25 / call" },
    ],
  },
  {
    slug: "gemini-omni",
    name: "Gemini Omni",
    provider: "Google",
    modality: "video",
    badge: "Video",
    tagline:
      "Gemini Omni API access for voice, character, and multimodal video resources in agent media workflows.",
    priceFrom: { amount: "0.0000", unit: "call" },
    capabilities: ["Voice", "Character", "Multimodal"],
    variants: [
      { id: "gemini-omni-video", name: "Gemini Omni", detail: "per render", price: "$0.00 / call" },
    ],
  },
  {
    slug: "omnihuman",
    name: "OmniHuman",
    provider: "Bytedance",
    modality: "video",
    badge: "Video",
    tagline:
      "OmniHuman audio-to-video avatars with subject detection and human identification helpers.",
    priceFrom: { amount: "0.200", unit: "call" },
    capabilities: ["Audio to video", "Subject detection", "Avatars"],
    variants: [
      { id: "omnihuman-audio-to-video", name: "OmniHuman", detail: "per clip", price: "$0.20 / call" },
      { id: "omnihuman-subject-detection", name: "Subject Detection", detail: "per image", price: "$0.01 / call" },
    ],
  },
  {
    slug: "infinitetalk",
    name: "InfiniteTalk",
    provider: "MeiGen-AI",
    modality: "video",
    badge: "Video",
    tagline:
      "InfiniteTalk turns a single portrait plus audio into a talking-head video with lip sync.",
    priceFrom: { amount: "0.180", unit: "call" },
    capabilities: ["Audio to video", "Lip sync", "Portrait"],
    variants: [
      { id: "infinitetalk-audio-to-video", name: "InfiniteTalk", detail: "per clip", price: "$0.18 / call" },
    ],
  },
  {
    slug: "volcengine-lip-sync",
    name: "Lip Sync",
    provider: "Bytedance",
    modality: "video",
    badge: "Video",
    tagline:
      "Volcengine lip sync re-dubs an existing video to new audio while preserving the original performance.",
    priceFrom: { amount: "0.120", unit: "call" },
    capabilities: ["Lip sync", "Dubbing"],
    variants: [
      { id: "volcengine-lip-sync-video", name: "Lip Sync", detail: "per minute", price: "$0.12 / call" },
    ],
  },

  /* --------------------------------- Image -------------------------------- */
  {
    slug: "flux",
    name: "Flux",
    provider: "Black Forest Labs",
    modality: "image",
    badge: "Image",
    tagline:
      "Flux image generation with Dev, Pro, and 2 Klein, plus single-image editing with Dev and Pro.",
    priceFrom: { amount: "0.030", unit: "call" },
    capabilities: ["Text to image", "Edit image", "LoRA"],
    featured: true,
    variants: [
      { id: "flux-pro-1.1", name: "Flux Pro", detail: "1024×1024", price: "$0.040 / call" },
      { id: "flux-dev", name: "Flux Dev", detail: "1024×1024", price: "$0.030 / call" },
      { id: "flux-2-klein", name: "Flux 2 Klein", detail: "1024×1024", price: "$0.020 / call" },
    ],
  },
  {
    slug: "flux-2",
    name: "Flux 2",
    provider: "Black Forest Labs",
    modality: "image",
    badge: "Image",
    tagline:
      "Flux 2 API access for text-to-image and remix-image with strong prompt adherence from Black Forest Labs.",
    priceFrom: { amount: "0.070", unit: "call" },
    capabilities: ["Text to image", "Remix image"],
    variants: [
      { id: "flux-2-text-to-image", name: "Flux 2", detail: "2048×2048", price: "$0.070 / call" },
      { id: "flux-2-remix-image", name: "Flux 2 Remix", detail: "per remix", price: "$0.090 / call" },
    ],
  },
  {
    slug: "flux-kontext",
    name: "Flux Kontext",
    provider: "Black Forest Labs",
    modality: "image",
    badge: "Image",
    tagline:
      "Flux Kontext API access for in-context image editing, local edits, style transfer, and character consistency.",
    priceFrom: { amount: "0.110", unit: "call" },
    capabilities: ["Edit image", "Style transfer", "Character consistency"],
    variants: [
      { id: "flux-kontext-pro", name: "Kontext Pro", detail: "per edit", price: "$0.110 / call" },
      { id: "flux-kontext-max", name: "Kontext Max", detail: "per edit", price: "$0.180 / call" },
    ],
  },
  {
    slug: "gpt-image",
    name: "GPT Image",
    provider: "OpenAI",
    modality: "image",
    badge: "Image",
    tagline:
      "OpenAI GPT Image for instruction-following generation and conversational image editing.",
    priceFrom: { amount: "0.020", unit: "call" },
    capabilities: ["Text to image", "Edit image", "Text rendering"],
    variants: [
      { id: "gpt-image-1-text-to-image", name: "GPT Image", detail: "1024×1024", price: "$0.040 / call" },
      { id: "gpt-image-1-edit-image", name: "GPT Image Edit", detail: "per edit", price: "$0.040 / call" },
    ],
  },
  {
    slug: "gpt-image-2",
    name: "GPT Image 2",
    provider: "OpenAI",
    modality: "image",
    badge: "Image",
    tagline:
      "GPT Image 2 adds sharper text rendering, layout control, and consistent multi-image generation.",
    priceFrom: { amount: "0.030", unit: "call" },
    capabilities: ["Text to image", "Edit image", "Text rendering"],
    featured: true,
    variants: [
      { id: "gpt-image-2-text-to-image", name: "GPT Image 2", detail: "1024×1024", price: "$0.030 / call" },
      { id: "gpt-image-2.5-text-to-image", name: "GPT Image 2.5", detail: "2048×2048", price: "$0.060 / call" },
    ],
  },
  {
    slug: "nano-banana",
    name: "Nano Banana",
    provider: "Google",
    modality: "image",
    badge: "Image",
    tagline:
      "Nano Banana is Google's fast image editor for natural-language edits that keep subjects intact.",
    priceFrom: { amount: "0.025", unit: "call" },
    capabilities: ["Edit image", "Text to image", "Character consistency"],
    featured: true,
    variants: [
      { id: "nano-banana-2-edit-image", name: "Nano Banana 2", detail: "per edit", price: "$0.025 / call" },
      { id: "nano-banana-2-text-to-image", name: "Nano Banana 2 T2I", detail: "1024×1024", price: "$0.025 / call" },
    ],
  },
  {
    slug: "seedream",
    name: "Seedream",
    provider: "Bytedance",
    modality: "image",
    badge: "Image",
    tagline:
      "Seedream produces high-resolution, prompt-faithful images with strong typography.",
    priceFrom: { amount: "0.025", unit: "call" },
    capabilities: ["Text to image", "Image to image", "Text rendering"],
    variants: [
      { id: "seedream-5-text-to-image", name: "Seedream 5", detail: "2048×2048", price: "$0.025 / call" },
      { id: "seedream-4-image-to-image", name: "Seedream 4 I2I", detail: "per edit", price: "$0.030 / call" },
    ],
  },
  {
    slug: "midjourney",
    name: "Midjourney",
    provider: "Midjourney",
    modality: "image",
    badge: "Image",
    tagline:
      "Midjourney v7 through the API — stylised generation with reference and character consistency.",
    priceFrom: { amount: "0.050", unit: "call" },
    capabilities: ["Text to image", "Style reference", "Upscale"],
    variants: [
      { id: "midjourney-v7", name: "Midjourney v7", detail: "1024×1024", price: "$0.050 / call" },
      { id: "midjourney-v7-upscale", name: "v7 Upscale", detail: "per upscale", price: "$0.020 / call" },
    ],
  },
  {
    slug: "ideogram-v3",
    name: "Ideogram V3",
    provider: "Ideogram",
    modality: "image",
    badge: "Image",
    tagline:
      "Ideogram V3 is built for legible in-image typography, posters, logos, and design mockups.",
    priceFrom: { amount: "0.040", unit: "call" },
    capabilities: ["Text to image", "Typography", "Edit image"],
    variants: [
      { id: "ideogram-v3-text-to-image", name: "Ideogram V3", detail: "1024×1024", price: "$0.040 / call" },
    ],
  },
  {
    slug: "imagen-4",
    name: "Imagen 4",
    provider: "Google",
    modality: "image",
    badge: "Image",
    tagline:
      "Google Imagen 4 for photorealistic rendering with accurate lighting and material detail.",
    priceFrom: { amount: "0.040", unit: "call" },
    capabilities: ["Text to image", "Photorealism", "Upscale"],
    variants: [
      { id: "imagen-4-ultra", name: "Imagen 4 Ultra", detail: "2048×2048", price: "$0.060 / call" },
      { id: "imagen-4-fast", name: "Imagen 4 Fast", detail: "1024×1024", price: "$0.020 / call" },
    ],
  },
  {
    slug: "qwen-image",
    name: "Qwen Image",
    provider: "Alibaba",
    modality: "image",
    badge: "Image",
    tagline:
      "Qwen Image supports multilingual prompts with precise text rendering and layout control.",
    priceFrom: { amount: "0.020", unit: "call" },
    capabilities: ["Text to image", "Multilingual", "Editing"],
    variants: [
      { id: "qwen-image-text-to-image", name: "Qwen Image", detail: "1328×1328", price: "$0.020 / call" },
      { id: "qwen-image-edit", name: "Qwen Image Edit", detail: "per edit", price: "$0.025 / call" },
    ],
  },
  {
    slug: "wan-image",
    name: "Wan Image",
    provider: "Alibaba",
    modality: "image",
    badge: "Image",
    tagline:
      "Alibaba Wan image models for foundational text-to-image and Chinese-typography rendering.",
    priceFrom: { amount: "0.018", unit: "call" },
    capabilities: ["Text to image", "Typography"],
    variants: [
      { id: "wan-3.0-text-to-image", name: "Wan 3.0", detail: "1024×1024", price: "$0.018 / call" },
    ],
  },
  {
    slug: "z-image",
    name: "Z-Image",
    provider: "Z.ai",
    modality: "image",
    badge: "Image",
    tagline:
      "Z-Image is a compact, fast generator tuned for low-latency previews and bulk batches.",
    priceFrom: { amount: "0.010", unit: "call" },
    capabilities: ["Text to image", "Fast", "Batch"],
    variants: [
      { id: "z-image-turbo", name: "Z-Image Turbo", detail: "1024×1024", price: "$0.010 / call" },
    ],
  },
  {
    slug: "recraft",
    name: "Recraft",
    provider: "Recraft",
    modality: "image",
    badge: "Image",
    tagline:
      "Recraft generates vector art, icon sets, and brand-consistent illustrations for product teams.",
    priceFrom: { amount: "0.040", unit: "call" },
    capabilities: ["Vector art", "Icons", "Style control"],
    variants: [
      { id: "recraft-v4-raster", name: "Recraft V4", detail: "1024×1024", price: "$0.040 / call" },
      { id: "recraft-v4-vector", name: "Recraft V4 Vector", detail: "SVG", price: "$0.080 / call" },
    ],
  },
  {
    slug: "grok-imagine",
    name: "Grok Imagine",
    provider: "xAI",
    modality: "image",
    badge: "Image",
    tagline:
      "Grok Imagine turns short prompts into stylised stills with quick turnaround and playful aesthetic control.",
    priceFrom: { amount: "0.020", unit: "call" },
    capabilities: ["Text to image", "Style control"],
    variants: [
      { id: "grok-imagine-text-to-image", name: "Grok Imagine", detail: "1024×1024", price: "$0.020 / call" },
    ],
  },

  /* ------------------------------ Music / audio ---------------------------- */
  {
    slug: "suno",
    name: "Suno",
    provider: "Suno",
    modality: "music",
    badge: "Music",
    tagline:
      "Suno v5.5 generates full songs with vocals, lyrics, and stems — no official API available elsewhere.",
    priceFrom: { amount: "0.180", unit: "call" },
    capabilities: ["Text to music", "Lyrics", "Stems"],
    featured: true,
    variants: [
      { id: "suno-v5.5", name: "Suno v5.5", detail: "full song", price: "$0.180 / call" },
      { id: "suno-v5.5-instrumental", name: "Suno v5.5 Instrumental", detail: "full song", price: "$0.150 / call" },
    ],
  },
  {
    slug: "producer",
    name: "Producer",
    provider: "Producer",
    modality: "music",
    badge: "Music",
    tagline:
      "Producer creates loopable beds, stems, and adaptive music cues for games and video.",
    priceFrom: { amount: "0.090", unit: "call" },
    capabilities: ["Text to music", "Loops", "Stems"],
    variants: [
      { id: "producer-v2", name: "Producer v2", detail: "60s cue", price: "$0.090 / call" },
    ],
  },
  {
    slug: "elevenlabs",
    name: "ElevenLabs",
    provider: "ElevenLabs",
    modality: "audio",
    badge: "Audio & Music",
    tagline:
      "ElevenLabs API access for voice synthesis, text-to-speech, sound effects, speech-to-text, and audio isolation.",
    priceFrom: { amount: "0.040", unit: "1K chars" },
    capabilities: ["Text to speech", "Sound effects", "Speech to text", "Isolate audio"],
    featured: true,
    variants: [
      { id: "elevenlabs-tts-v3", name: "TTS v3", detail: "per 1K chars", price: "$0.040 / 1K chars" },
      { id: "elevenlabs-sfx", name: "Sound Effects", detail: "per clip", price: "$0.040 / call" },
      { id: "elevenlabs-isolate", name: "Isolate Audio", detail: "per minute", price: "$0.050 / call" },
    ],
  },
  {
    slug: "fish-audio",
    name: "Fish Audio",
    provider: "Fish Audio",
    modality: "audio",
    badge: "Audio & Music",
    tagline:
      "Fish Audio API access for expressive multilingual and production-grade text-to-speech with managed MP3 or WAV output.",
    priceFrom: { amount: "0.0000", unit: "1K UTF-8 bytes" },
    capabilities: ["Text to speech", "Voice cloning", "Multilingual"],
    variants: [
      { id: "fish-audio-speech-1.5", name: "Speech 1.5", detail: "per 1K bytes", price: "$0.015 / 1K UTF-8 bytes" },
    ],
  },
  {
    slug: "gemini-tts",
    name: "Gemini TTS",
    provider: "Google",
    modality: "audio",
    badge: "Audio & Music",
    tagline:
      "Gemini TTS API access for multi-speaker dialogue with configurable voices, accents, delivery styles, and pacing.",
    priceFrom: { amount: "0.0014", unit: "1K tokens" },
    capabilities: ["Text to speech", "Multi-speaker", "Dialogue"],
    variants: [
      { id: "gemini-3-tts", name: "Gemini 3 TTS", detail: "per 1K tokens", price: "$0.0014 / 1K tokens" },
    ],
  },
  {
    slug: "openai-tts",
    name: "OpenAI TTS",
    provider: "OpenAI",
    modality: "audio",
    badge: "Audio & Music",
    tagline:
      "OpenAI text-to-speech with low-latency streaming voices for real-time assistants.",
    priceFrom: { amount: "0.015", unit: "1K chars" },
    capabilities: ["Text to speech", "Streaming"],
    variants: [
      { id: "openai-tts-2", name: "TTS 2", detail: "per 1K chars", price: "$0.015 / 1K chars" },
    ],
  },
  {
    slug: "openai-transcription",
    name: "Transcription",
    provider: "OpenAI",
    modality: "audio",
    badge: "Audio & Music",
    tagline:
      "Whisper-based speech-to-text with timestamps, diarisation, and translation for long recordings.",
    priceFrom: { amount: "0.006", unit: "minute" },
    capabilities: ["Speech to text", "Timestamps", "Translation"],
    variants: [
      { id: "whisper-v3", name: "Whisper v3", detail: "per minute", price: "$0.006 / minute" },
      { id: "gpt-4o-transcribe", name: "GPT-4o Transcribe", detail: "per minute", price: "$0.010 / minute" },
    ],
  },

  /* -------------------------------- Utility ------------------------------- */
  {
    slug: "topaz-upscale",
    name: "Topaz Upscale",
    provider: "Topaz",
    modality: "utility",
    badge: "Utility",
    tagline:
      "Topaz upscaling restores detail and clean edges in existing video at up to 4× resolution.",
    priceFrom: { amount: "0.050", unit: "call" },
    capabilities: ["Upscale", "Restore", "Denoise"],
    variants: [
      { id: "topaz-upscale-video", name: "Topaz Video Upscale", detail: "per clip", price: "$0.050 / call" },
    ],
  },
  {
    slug: "video-utility",
    name: "Video Utility",
    provider: "Topaz",
    modality: "utility",
    badge: "Utility",
    tagline:
      "Frame interpolation, matting, and background removal helpers for post-production pipelines.",
    priceFrom: { amount: "0.020", unit: "call" },
    capabilities: ["Interpolation", "Matting", "Background removal"],
    variants: [
      { id: "video-interpolate", name: "Frame Interpolation", detail: "per clip", price: "$0.020 / call" },
      { id: "video-matting", name: "Video Matting", detail: "per clip", price: "$0.030 / call" },
    ],
  },
];

/* ------------------------------ derived helpers ---------------------------- */

export const providers = Array.from(
  new Set(models.map((m) => m.provider)),
).sort((a, b) => a.localeCompare(b));

export function modelsByModality(modality: Modality) {
  return models.filter((m) => m.modality === modality);
}

export function getModel(slug: string) {
  return models.find((m) => m.slug === slug);
}

export function getVariant(modelSlug: string, variantId: string) {
  return getModel(modelSlug)?.variants.find((v) => v.id === variantId);
}

export const modalityCounts = {
  all: models.length,
  text: modelsByModality("text").length,
  image: modelsByModality("image").length,
  video: modelsByModality("video").length,
  audio:
    modelsByModality("audio").length + modelsByModality("music").length,
  utility: modelsByModality("utility").length,
};

export const modelFilterTabs = [
  { key: "all", label: "ALL", count: modalityCounts.all },
  { key: "text", label: "LLM", count: modalityCounts.text },
  { key: "image", label: "IMAGE", count: modalityCounts.image },
  { key: "video", label: "VIDEO", count: modalityCounts.video },
  { key: "audio", label: "AUDIO & MUSIC", count: modalityCounts.audio },
  { key: "utility", label: "UTILITY", count: modalityCounts.utility },
] as const;

export const featuredModels = models.filter((m) => m.featured);

/** Endpoint list shown in the catalogue hero code panel. */
export const endpointSnippets = [
  { method: "POST", path: "/v1/chat/completions", note: "# LLM" },
  { method: "POST", path: "/v1/images/generations", note: "# Image" },
  { method: "POST", path: "/v1/kling/text_to_video", note: "# Video" },
  { method: "POST", path: "/v1/audio/speech", note: "# TTS" },
  { method: "POST", path: "/v1/audio/transcriptions", note: "# STT" },
  { method: "POST", path: "/v1/suno/text_to_music", note: "# Music" },
];
