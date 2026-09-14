/**
 * Chinese copy for the model catalogue.
 *
 * Kept separate from `models-data.ts` so the (large) English dataset stays the
 * single source of truth for identifiers, pricing, and variants — only prose
 * is localised here. Lookups fall back to the English tagline when a slug is
 * missing.
 */
export const modelTaglinesZh: Record<string, string> = {
  claude:
    "通过 CAPI 调用 Anthropic 的 Claude,擅长复杂推理、代码生成、深度分析与超长上下文任务。",
  gpt: "通过 OpenAI 兼容接口调用 GPT 系列旗舰模型,覆盖对话、推理与多模态输入。",
  gemini:
    "调用 Google Gemini,覆盖对话、代码生成、推理与百万级长上下文场景。",
  deepseek:
    "通过 CAPI 调用 DeepSeek:flash 版本快且便宜,pro 版本适合复杂的 Agent 任务。",
  glm: "通过 CAPI 调用智谱 GLM——MIT 许可的 MoE 模型,最高 200K 上下文,开源权重编码能力领先。",
  grok: "xAI 的 Grok 模型,适合实时推理、编码与工具驱动的 Agent 工作流。",
  qwen: "阿里通义千问文本模型,以开源价格提供强大的多语言推理能力。",
  kimi: "月之暗面 Kimi,针对长文档阅读、研究综述与 Agent 检索场景调优。",
  mimo: "小米 MiMo 轻量推理模型,适合高吞吐的分类与信息抽取任务。",
  embedding: "OpenAI 文本向量模型,用于语义检索、召回、聚类与排序工作流。",

  kling:
    "可灵视频生成,支持电影感的文生视频、图生视频、动作控制与数字人片段。",
  "veo-3-1":
    "Google Veo 3.1 支持原生音视频同步生成、视频延长与超分,提示词跟随度高。",
  seedance: "Seedance 2.5 在动作编排与镜头语言控制上表现精准,支持文生与图生视频。",
  hailuo: "MiniMax 海螺视频模型,擅长富有表现力的角色动作与符合物理规律的运动渲染。",
  "minimax-h3": "MiniMax H3 支持高保真长镜头生成,多镜头之间保持一致。",
  runway: "Runway Gen-4 与 Aleph,支持文生视频以及基于指令的视频编辑。",
  luma: "Luma Ray 系列,运动合成平滑,支持关键帧控制与视频改写。",
  pixverse: "PixVerse 擅长风格化视频生成、转场、延长与片段编辑。",
  "wan-video":
    "阿里 Wan 视频模型,支持文生视频、图生视频、语音驱动数字人与视频编辑。",
  happyhorse: "HappyHorse 面向快速草稿迭代与就地编辑的工作流优化。",
  "gemini-omni": "Gemini Omni 提供语音、角色与多模态视频资源,适用于 Agent 媒体流程。",
  omnihuman: "OmniHuman 支持音频驱动数字人,并提供主体检测与人像识别辅助能力。",
  infinitetalk: "InfiniteTalk 用一张人像加一段音频,生成带口型同步的数字人视频。",
  "volcengine-lip-sync":
    "火山引擎口型同步,把已有视频重新对到新音频上,同时保留原始表演。",

  flux: "Black Forest Labs 的 Flux,提供 Dev、Pro、2 Klein 三档,以及 Dev、Pro 的单图编辑。",
  "flux-2": "Flux 2 支持文生图与改图,提示词跟随能力来自 Black Forest Labs。",
  "flux-kontext":
    "Flux Kontext 支持上下文内编辑、局部修改、风格迁移与角色一致性。",
  "gpt-image": "OpenAI GPT Image,支持高指令跟随度的生成与对话式图像编辑。",
  "gpt-image-2":
    "GPT Image 2 在文字渲染、版式控制与多图一致性上比上一代更锐利。",
  "nano-banana": "Nano Banana 是 Google 的快速图像编辑器,用自然语言改动而保持主体不变。",
  seedream: "Seedream 产出高分辨率、忠实于提示词的图像,文字排版表现强。",
  midjourney: "通过 API 使用 Midjourney v7:风格化生成,支持参考图与角色一致性。",
  "ideogram-v3": "Ideogram V3 专为图内可读文字、海报、Logo 与设计稿打造。",
  "imagen-4": "Google Imagen 4,照片级渲染,光照与材质细节准确。",
  "qwen-image": "通义万相支持多语言提示词,文字渲染与版式控制精准。",
  "wan-image": "阿里 Wan 图像模型,支持基础文生图与中文排版渲染。",
  "z-image": "Z-Image 是紧凑快速的生成模型,适合低延迟预览与批量出图。",
  recraft: "Recraft 生成矢量插画、图标集与品牌一致的插图,面向产品团队。",
  "grok-imagine": "Grok Imagine 把简短提示词变风格化静态图,出图快、风格可调。",

  suno: "Suno v5.5 生成含人声、歌词与分轨的完整歌曲——别处没有官方 API。",
  producer: "Producer 生成可循环的垫乐、分轨与自适应配乐,适合游戏与视频。",
  elevenlabs:
    "通过 CAPI 调用 ElevenLabs:语音合成、音效、语音转写与音频分离。",
  "fish-audio":
    "Fish Audio 提供富有表现力的多语言、生产级语音合成,输出 MP3 或 WAV。",
  "gemini-tts":
    "Gemini TTS 支持多说话人对话,可配置音色、口音、语气与节奏。",
  "openai-tts": "OpenAI 语音合成,低延迟流式音色,适合实时助手场景。",
  "openai-transcription":
    "基于 Whisper 的语音转写,支持时间戳、说话人分离与长音频翻译。",

  "topaz-upscale": "Topaz 超分可还原细节、清理边缘,最高支持 4 倍分辨率。",
  "video-utility": "补帧、抠像与去背景等后期工具,接入现有处理流水线。",
};

/**
 * Chinese copy for `variant.detail` strings.
 *
 * Most details are pure notation (`1024×1024`, `SVG`) and are left alone —
 * only the ones that read as English prose are translated. Anything missing
 * falls back to the original.
 */
export const modelDetailZh: Record<string, string> = {
  "per 1K chars": "每 1K 字符",
  "per 1K tokens": "每 1K token",
  "per 1K bytes": "每 1K 字节",
  "per image": "每张图",
  "per clip": "每个片段",
  "per edit": "每次编辑",
  "per render": "每次渲染",
  "per remix": "每次混音",
  "per transition": "每次转场",
  "per minute": "每分钟",
  "per second": "每秒",
  "full song": "整首歌曲",
  "adds 7s": "增加 7 秒",
  "60s cue": "60 秒提示",
  "128K context": "128K 上下文",
  "200K context": "200K 上下文",
  "256K context": "256K 上下文",
  "400K context": "400K 上下文",
  "1M context": "1M 上下文",
  "1536 dims": "1536 维",
  "3072 dims": "3072 维",
  "5s · 720p": "5 秒 · 720p",
  "5s · 1080p": "5 秒 · 1080p",
  "6s · 1080p": "6 秒 · 1080p",
  "8s · 720p": "8 秒 · 720p",
  "8s · 1080p": "8 秒 · 1080p",
  "10s · 1080p": "10 秒 · 1080p",
};

/** Translate a `detail` string, falling back to the original when unknown. */
export function localizeDetail(detail: string, locale: "en" | "zh") {
  if (locale !== "zh") return detail;
  return modelDetailZh[detail] ?? detail;
}

/** Billing-unit suffixes, longest match first so token units win over bare tokens. */
const PRICE_UNITS: [RegExp, string][] = [
  [/\/ 1M input tokens/, " / 100 万输入 token"],
  [/\/ 1M tokens/, " / 100 万 token"],
  [/\/ 1K UTF-8 bytes/, " / 1K UTF-8 字节"],
  [/\/ 1K chars/, " / 1K 字符"],
  [/\/ 1K tokens/, " / 1K token"],
  [/\/ second/, " / 秒"],
  [/\/ minute/, " / 分钟"],
  [/\/ call/, " / 次调用"],
];

/**
 * Localise the unit suffix of a price string. The amount and currency symbol
 * are left untouched — only the denominator changes.
 */
export function localizePrice(price: string, locale: "en" | "zh") {
  if (locale !== "zh") return price;
  for (const [pattern, replacement] of PRICE_UNITS) {
    if (pattern.test(price)) return price.replace(pattern, replacement);
  }
  return price;
}
