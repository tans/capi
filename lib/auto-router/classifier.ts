export type ComplexityTier = "light" | "standard" | "advanced";

export function classifyRequest(body: { messages?: { role: string; content: unknown }[] }): ComplexityTier {
  const text = (body.messages ?? []).filter(m => m.role === "user").map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n").slice(-12000).toLowerCase();
  if (/(重构|调试|架构|证明|推导|多步骤|复杂|refactor|debug|architecture|prove|step[- ]by[- ]step|algorithm)/i.test(text)) return "advanced";
  if (/(提取|格式|翻译|总结|改写|分类|extract|format|translate|summarize|rewrite|classify)/i.test(text) && text.length < 2500) return "light";
  return "standard";
}
