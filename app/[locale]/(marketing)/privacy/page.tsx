import type { Metadata } from "next";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

const en: LegalSection[] = [
  {
    title: "What this policy covers",
    body: [
      "This policy explains what we collect when you use CAPI, why we collect it, how long we keep it, and the choices available to you.",
      "It applies to the API, the dashboard, the documentation site, and any support or billing correspondence you have with us.",
    ],
  },
  {
    title: "Information you provide",
    body: [
      "Account details — the email address and (optionally) the organisation name you give when you create an account.",
      "Support messages — anything you send through the contact form, email, or chat. We use these to respond and to improve the service.",
      "Billing details — when you add credit, our payment processor receives the card or wallet details; CAPI stores only the last four digits and the brand.",
    ],
  },
  {
    title: "Information we collect automatically",
    body: [
      "Request metadata — model IDs, parameters you sent, response sizes, status codes, and how long the request took. We use this to operate the service, prevent abuse, and resolve incidents.",
      "Generated media — the assets produced for you, kept for the lifetime of your account and deletable from the dashboard.",
      "Device and log data — IP address, browser, and timestamps for management endpoints. Logs are retained for 30 days.",
    ],
  },
  {
    title: "Third-party model providers",
    body: [
      "When you call a model, the request is forwarded to the underlying provider. They receive the parameters and the prompt you sent, and the output that they return.",
      "Each provider has its own retention and training policy. We publish a per-model note on the catalog page so you can pick providers that match your obligations.",
    ],
  },
  {
    title: "Use of generated content",
    body: [
      "We do not use the assets you generate to train our own models, and we do not share them with other customers.",
      "Anonymised, aggregated counters (total generations per model, per day) may be used to publish ecosystem stats.",
    ],
  },
  {
    title: "Cookies and local storage",
    body: [
      "We use first-party cookies for session and locale preference. We do not deploy third-party tracking, advertising cookies, or analytics that follow you off the site.",
      "You can clear these at any time from your browser; doing so logs you out and resets your locale back to the default.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "You can export your data and close your account from the dashboard. Closing deletes your keys, generated media, and account record within the retention window below.",
      "If a data-protection regulation gives you additional rights, the support team will honour them regardless of where you live.",
    ],
  },
  {
    title: "Retention",
    body: [
      "Closed accounts: account record and metadata are deleted within 30 days; generated media within 60 days; logs within 30 days.",
      "Open accounts: deleted within 90 days of the last activity. You can request earlier deletion at any time.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about this policy or about your data can be sent to privacy@capi.ai. We answer within five business days.",
    ],
  },
];

const zh: LegalSection[] = [
  {
    title: "本政策的适用范围",
    body: [
      "本政策说明在你使用 CAPI 时我们会收集哪些信息、为什么要收集、保存多久,以及你可以怎么选择。",
      "适用于 API、控制台、文档站,以及你与我们之间任何支持或账单往来。",
    ],
  },
  {
    title: "你主动提供的信息",
    body: [
      "账号资料 —— 创建账号时填写的邮箱地址以及(可选的)组织名称。",
      "支持沟通 —— 通过联系表单、邮件或聊天发送的任何内容,我们仅用于回复你和改进服务。",
      "账单资料 —— 充值时,支付服务商会收到完整的卡片或钱包信息;CAPI 仅保留卡号末四位与卡品牌。",
    ],
  },
  {
    title: "我们自动收集的信息",
    body: [
      "请求元数据 —— 模型 ID、你发送的参数、响应大小、状态码、耗时。我们用这些数据来运营服务、防止滥用并定位问题。",
      "生成的媒体 —— 为你生成的产物,在你账号存续期间保留,你也可以在控制台主动删除。",
      "设备与日志 —— 管理接口上的 IP、浏览器与时间戳。日志默认保留 30 天。",
    ],
  },
  {
    title: "第三方模型提供商",
    body: [
      "当你在 CAPI 中调用某个模型时,请求会被转发到上游提供商。他们会收到你发送的参数与提示,以及他们返回的结果。",
      "每个提供商各自有保留与训练策略。我们在模型目录页面公开了每个模型的备注,方便你按需挑选合适的提供商。",
    ],
  },
  {
    title: "对生成内容的使用",
    body: [
      "我们不会用你生成的资产训练自己的模型,也不会分享给其他客户。",
      "匿名化、聚合后的计数(每日每个模型的生成次数)可能用于发布生态统计。",
    ],
  },
  {
    title: "Cookie 与本地存储",
    body: [
      "我们用第一方 Cookie 来维持会话与语言偏好。不部署任何第三方追踪、广告 Cookie,也不会用跨站分析。",
      "你可以随时在浏览器里清除这些项;清理后会退出登录并把语言还原为默认值。",
    ],
  },
  {
    title: "你的权利",
    body: [
      "你可以在控制台导出数据并关闭账号。关闭后,你的 Key、生成资产以及账号记录会按下文保留窗口删除。",
      "若你所在的数据保护法规赋予你额外权利,支持团队不分地域都会予以尊重。",
    ],
  },
  {
    title: "数据保留",
    body: [
      "已关闭账号:账号记录与元数据在 30 天内删除;生成媒体在 60 天内删除;日志在 30 天内删除。",
      "在用账号:距上次活跃 90 天后删除;你也可以随时申请提前删除。",
    ],
  },
  {
    title: "联系方式",
    body: [
      "关于本政策或你的数据的问题,可以发到 privacy@capi.ai。我们会在五个工作日内回复。",
    ],
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).privacy;
  return { title: t.title, description: t.intro };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).privacy;

  return (
    <LegalDoc
      locale={locale}
      eyebrow={t.eyebrow}
      title={t.title}
      updated={t.updated}
      intro={t.intro}
      sections={locale === "zh" ? zh : en}
    />
  );
}
