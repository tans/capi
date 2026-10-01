import { LegalDoc, type LegalSection } from "@/components/marketing/legal";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

const privacy: Record<Locale, LegalSection[]> = {
  en: [
    { title: "What this policy covers", body: ["This draft describes the information involved when using the CAPI API, dashboard, documentation, and support channels.", "It is illustrative product copy. The operator must verify actual data flows and legal requirements before adopting it as a policy."] },
    { title: "Information you provide", body: ["Account details include the email address and name supplied when creating an account.", "Support correspondence is sent by email. The contact form prepares a draft in your email app; it does not submit its contents to a CAPI server. Workspace credit is added by redeeming codes rather than a self-service card payment flow."] },
    { title: "Requests and service records", body: ["CAPI routes model requests to enabled upstream channels and records usage needed to operate billing and the workspace dashboard.", "The exact operational-log fields and retention periods must be confirmed by the service operator before this draft is used as a policy."] },
    { title: "Third-party model providers", body: ["When you call a model, CAPI forwards the request to the configured upstream provider, which processes the prompt and parameters and returns an output.", "Provider data-handling and retention terms differ. Review the provider terms that apply to the channel you use."] },
    { title: "Generated content and files", body: ["Authorized workspace members can browse, download, and delete generated files through the workspace Files page.", "This draft does not establish a fixed automatic-expiry period for generated media. The operator must publish the actual retention policy separately."] },
    { title: "Cookies and locale", body: ["The site uses a first-party session cookie for signed-in access and a locale preference cookie when one is selected.", "The service should document any additional cookies or analytics before this sample is adopted."] },
    { title: "Your requests", body: ["For questions about accessing, correcting, or deleting account data, contact privacy@capi.minapp.xin.", "Available request procedures and response timelines need confirmation from the service operator."] },
    { title: "Retention", body: ["Generated files can be deleted by authorized workspace members. No fixed automatic deletion interval is promised here.", "Retention periods for logs and account records are not specified in this sample and must be confirmed before publication as an operative policy."] },
    { title: "Contact", body: ["Questions about this sample or your data can be sent to privacy@capi.minapp.xin."] },
  ],
  zh: [
    { title: "本政策的适用范围", body: ["本草稿说明使用 CAPI API、控制台、文档和支持渠道时涉及的信息。", "这只是产品原型示例文案。服务运营方需先核实实际数据流和法律要求，再决定是否采用为正式政策。"] },
    { title: "你主动提供的信息", body: ["账号资料包括创建账号时填写的邮箱和姓名。", "支持沟通通过邮件发送。联系表单只会在你的邮件客户端中准备草稿，不会把内容提交到 CAPI 服务器。工作区通过兑换码增加余额，当前没有自助银行卡支付流程。"] },
    { title: "请求与服务记录", body: ["CAPI 会将模型请求转发到已启用的上游渠道，并记录运营计费和工作区控制台所需的用量信息。", "实际运营日志包含的字段及其保留时间，需由服务运营方核实后再写入正式政策。"] },
    { title: "第三方模型提供商", body: ["调用模型时，CAPI 会把请求转发到配置的上游提供商，由其处理提示词和参数并返回结果。", "各提供商的数据处理和保留条款不同。请查看你所用渠道对应的提供商条款。"] },
    { title: "生成内容与文件", body: ["获得授权的工作区成员可以在工作区文件页查看、下载和删除生成文件。", "本草稿不承诺媒体文件会在某个固定期限后自动删除；服务运营方需另行发布实际保留政策。"] },
    { title: "Cookie 与语言偏好", body: ["网站使用第一方会话 Cookie 维持登录，并在选择语言时保存语言偏好 Cookie。", "采用本示例前，服务还应核实并说明是否使用其他 Cookie 或分析工具。"] },
    { title: "数据请求", body: ["如需访问、更正或删除账号数据，可联系 privacy@capi.minapp.xin。", "可受理的请求类型与响应时限需由服务运营方确认。"] },
    { title: "数据保留", body: ["获得授权的工作区成员可以删除生成文件；本草稿不承诺固定的自动删除期限。", "日志和账号记录的保留期限尚未在本示例中确定，正式发布前需由服务运营方核实。"] },
    { title: "联系方式", body: ["关于此示例或你的数据，可以发送邮件至 privacy@capi.minapp.xin。"] },
  ],
};

const terms: Record<Locale, LegalSection[]> = {
  en: [
    { title: "The agreement", body: ["This sample is intended to describe use of the CAPI API, dashboard, and related software or documentation.", "It is not an operative agreement. The service operator must approve and replace this draft before relying on it."] },
    { title: "Accounts and credentials", body: ["Keep API keys out of version control and client-side code, and rotate any key that may have been disclosed.", "Requests made with a key use that key's workspace permissions and budget. Account and credential terms require operator review before publication."] },
    { title: "Acceptable use", body: ["Do not use the service to violate applicable law or the policies of an upstream model provider.", "This example does not replace an approved acceptable-use policy or describe every control enforced by the service."] },
    { title: "Inputs and generated output", body: ["You are responsible for having the rights needed to submit prompts, reference images, audio, and video.", "Rights in generated output can depend on the upstream model provider's terms. Obtain legal review before adopting this sample as a contract."] },
    { title: "Third-party providers", body: ["CAPI routes requests to third-party model providers. Their availability, output quality, and content policies are outside the gateway's control.", "A confirmed failed video task releases its reserved balance. An unresolved upstream task remains reserved until its status is reconciled."] },
    { title: "Billing", body: ["Requests are charged against workspace balance using the configured model rate. Workspace balance is added by redeeming a code; CAPI does not process payments.", "Per-key budgets may limit usage. When a budget is exhausted, requests fail instead of continuing to accrue charges."] },
    { title: "Availability and support", body: ["This draft makes no contractual uptime commitment. Any service levels must be agreed separately by the operator.", "Available models can change when upstream providers change their offerings."] },
    { title: "Liability", body: ["Liability allocation and limits are legal terms that require review and approval by the service operator. This sample does not establish an enforceable limit."] },
    { title: "Account closure and termination", body: ["Account suspension, closure, credit handling, and deletion of service records require an operator-approved process.", "This sample does not promise a self-service account-closure feature or a fixed media-retention period."] },
  ],
  zh: [
    { title: "协议范围", body: ["本示例用于说明 CAPI API、控制台及相关软件或文档的使用方式。", "这不是现行协议。服务运营方需审核并替换本草稿后，才能将其作为有效条款使用。"] },
    { title: "账号与凭据", body: ["不要把 API Key 提交到版本库或写入客户端代码；怀疑泄露时应轮换密钥。", "密钥请求受该密钥的工作区权限和预算限制。账号与凭据条款在发布前需要运营方审核。"] },
    { title: "可接受的使用方式", body: ["不得使用本服务违反适用法律或上游模型提供商的政策。", "本示例不能替代经批准的可接受使用政策，也没有描述服务执行的所有控制措施。"] },
    { title: "输入与生成结果", body: ["你需要确保对所提交的提示词、参考图、音频和视频拥有必要权利。", "生成结果的权利可能受上游模型提供商条款影响。将本示例作为合同前需进行法律审核。"] },
    { title: "第三方提供商", body: ["CAPI 会把请求路由到第三方模型提供商，其可用性、输出质量和内容政策不受网关控制。", "确认失败的视频任务会释放预留余额。上游状态未核实的任务会继续预留，直到完成核对。"] },
    { title: "计费", body: ["请求按照工作区配置的模型费率从余额中扣除。工作区通过兑换码增加余额；CAPI 不处理支付。", "每个 Key 可以有独立预算。达到预算上限时，请求会失败而不是继续产生费用。"] },
    { title: "可用性与支持", body: ["本草稿不承诺合同化的可用性指标。任何服务等级都需由运营方另行书面约定。", "上游提供商调整产品时，可用模型可能发生变化。"] },
    { title: "责任限制", body: ["责任分配和责任限额属于法律条款，须由服务运营方审核批准。本示例不构成可执行的责任限额。"] },
    { title: "账号关闭与终止", body: ["账号暂停、关闭、余额处理和服务记录删除都需要运营方批准流程。", "本示例不承诺提供自助关闭账号功能，也不承诺固定的媒体保留期限。"] },
  ],
};

export function PrivacyPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).privacy;
  return <LegalDoc locale={locale} eyebrow={t.eyebrow} title={t.title} updated={t.updated} intro={t.intro} sections={privacy[locale]} />;
}

export function TermsPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).terms;
  return <LegalDoc locale={locale} eyebrow={t.eyebrow} title={t.title} updated={t.updated} intro={t.intro} sections={terms[locale]} />;
}
