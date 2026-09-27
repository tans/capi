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
      "Balance is added by redeeming a code. CAPI does not collect card or wallet details through a self-service payment flow.",
    ],
  },
  {
    title: "Information we collect automatically",
    body: [
      "Request metadata — model IDs, parameters you sent, response sizes, status codes, and how long the request took. We use this to operate the service, prevent abuse, and resolve incidents.",
      "Generated images and videos — archived in the workspace Files page and automatically removed after 30 days. You can also delete them earlier from the dashboard.",
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
      "For questions about accessing, correcting, or deleting account data, contact privacy@capi.minapp.xin.",
      "We will handle requests according to the data-protection requirements that apply to the service.",
    ],
  },
  {
    title: "Retention",
    body: [
      "Generated images and videos are automatically deleted 30 days after archiving. Other account and service records are retained as needed to operate the service and meet applicable obligations.",
      "You may contact us to request deletion of data where applicable.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about this policy or your data can be sent to privacy@capi.minapp.xin.",
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
      "余额通过兑换码增加。CAPI 不提供自助支付流程，也不会通过该流程收集银行卡或钱包信息。",
    ],
  },
  {
    title: "我们自动收集的信息",
    body: [
      "请求元数据 —— 模型 ID、你发送的参数、响应大小、状态码、耗时。我们用这些数据来运营服务、防止滥用并定位问题。",
      "生成的图片和视频 —— 自动归档到工作区文件页面,并在归档 30 天后自动清理;你也可以在控制台提前删除。",
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
      "如需访问、更正或删除账号数据,请联系 privacy@capi.minapp.xin。",
      "我们会按照适用于本服务的数据保护要求处理相关请求。",
    ],
  },
  {
    title: "数据保留",
    body: [
      "归档的生成图片和视频会在 30 天后自动删除。其他账号与服务记录会根据服务运营和适用义务需要保留。",
      "你可以在适用情况下联系服务方申请删除数据。",
    ],
  },
  {
    title: "联系方式",
    body: [
      "关于本政策或你的数据,可以发送邮件至 privacy@capi.minapp.xin。",
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
