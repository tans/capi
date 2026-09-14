import type { Metadata } from "next";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/server";

const en: LegalSection[] = [
  {
    title: "The agreement",
    body: [
      "These terms form a binding agreement between you and CAPI covering your use of the API, the dashboard, and any related software or documentation.",
      "If you accept these terms on behalf of an organisation, you confirm that you have authority to bind that organisation, and \"you\" refers to it.",
    ],
  },
  {
    title: "Accounts and credentials",
    body: [
      "You are responsible for the security of your API keys. Keep them out of version control and client-side code, and rotate any key that may have been disclosed.",
      "Activity performed with your credentials is attributed to your account, including usage incurred by coding agents you connect.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "You may not use the service to generate content that is unlawful, infringing, or that violates the policy of the upstream model provider.",
      "You may not attempt to circumvent rate limits, budgets, or content filters, or resell raw access in a way that misrepresents the service.",
    ],
  },
  {
    title: "Generated output",
    body: [
      "As between you and CAPI, you own the output you generate, subject to the upstream provider's terms for the model you called.",
      "You are responsible for ensuring you hold the rights needed for any input you supply, including reference images, audio, and video.",
    ],
  },
  {
    title: "Third-party providers",
    body: [
      "CAPI routes requests to third-party model providers. Their availability, output quality, and content policies are outside our control.",
      "When a provider fails or filters a request, the reserved credit is released and the task reports the provider's reason.",
    ],
  },
  {
    title: "Billing",
    body: [
      "The service is credit-based and billed in arrears for measured usage. Unit prices are published per model before you call it.",
      "Budgets and rate limits may be applied per key. Reaching a budget cap causes requests to fail rather than continue accruing charges.",
    ],
  },
  {
    title: "Availability and support",
    body: [
      "Self-serve accounts are provided without a contractual uptime commitment. Team and enterprise plans may include a service level agreement.",
      "We may modify or discontinue individual models as upstream providers change their offerings, and will give notice where practical.",
    ],
  },
  {
    title: "Liability",
    body: [
      "The service is provided on an as-is basis. To the extent permitted by law, our aggregate liability is limited to the fees you paid in the twelve months preceding the claim.",
      "We are not liable for indirect or consequential losses, including lost profits or lost data.",
    ],
  },
  {
    title: "Termination",
    body: [
      "You may close your account at any time. We may suspend or terminate access for material breach of these terms, or where required by law.",
      "On termination, keys are revoked and generated media is scheduled for deletion according to the retention schedule of your plan.",
    ],
  },
];

const zh: LegalSection[] = [
  {
    title: "协议范围",
    body: [
      "本条款构成你与 CAPI 之间具有约束力的协议,涵盖你对 API、控制台以及任何相关软件或文档的使用。",
      "如果你代表某一组织接受本条款,则表示你确认有权代表该组织作出承诺,条款中的“你”指该组织。",
    ],
  },
  {
    title: "账号与凭据",
    body: [
      "你有责任保管好自己的 API Key。不要把 Key 提交到版本库或写进客户端代码;一旦怀疑泄露,请立即轮换。",
      "使用你的凭据发起的操作都计入你的账号,包括你所接入的编程 Agent 产生的用量。",
    ],
  },
  {
    title: "可接受的使用方式",
    body: [
      "不得使用本服务生成违法、侵权,或违反上游模型提供商政策的内容。",
      "不得尝试绕过限流、预算或内容过滤,也不得以误导他人的方式转售原始访问能力。",
    ],
  },
  {
    title: "生成结果",
    body: [
      "在你与 CAPI 之间,你拥有所生成内容的所有权,但仍需遵守你所调用模型的上游提供商条款。",
      "你需要自行确保对所提供的任何输入(包括参考图、音频和视频)拥有必要权利。",
    ],
  },
  {
    title: "第三方提供商",
    body: [
      "CAPI 会把请求路由到第三方模型提供商。其可用性、输出质量与内容政策不受我们控制。",
      "当提供商失败或拦截请求时,预扣额度会被释放,任务中会给出提供商的原因。",
    ],
  },
  {
    title: "计费",
    body: [
      "本服务按额度计费,按实际用量后付。每个模型在调用之前都会公布单价。",
      "每个 Key 可以有独立的预算与限流。达到预算上限时,请求会失败而不是继续产生费用。",
    ],
  },
  {
    title: "可用性与支持",
    body: [
      "自助账号不附带合同化的可用性承诺。团队版与企业版可以包含服务等级协议。",
      "因上游提供商调整产品,我们可能会修改或下线个别模型,并在可行的情况下提前通知。",
    ],
  },
  {
    title: "责任限制",
    body: [
      "本服务按“现状”提供。在法律允许的范围内,我们的累计责任以索赔发生前十二个月内你实际支付的费用为上限。",
      "我们不对间接损失或后果性损失负责,包括利润损失与数据丢失。",
    ],
  },
  {
    title: "终止",
    body: [
      "你可以随时关闭账号。若你实质性违反本条款,或法律另有要求,我们可以暂停或终止你的访问权限。",
      "终止后,所有 Key 会被吊销,已生成的媒体会按你所购买套餐的留存周期排入删除队列。",
    ],
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(locale).terms;
  return { title: t.title, description: t.intro };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await resolveLocale(params)) as Locale;
  const t = getDictionary(locale).terms;

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
