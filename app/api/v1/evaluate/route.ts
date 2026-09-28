import { evaluateMethodNotAllowed, handleEvaluateRequest } from "@/lib/relay/evaluate-handler";

/**
 * Evaluation 中转：把 { model, state, questions } 转发到上游评测端点。
 *
 * 请求 -> 密钥鉴权（llm.evaluate）-> 请求体校验 -> 模型白名单 -> 预扣费
 *      -> 按「分组 + 模型」选渠道 -> 转发上游 -> 按 usage 结算并记录用量
 *
 * 评测模型（例如 typesafe-ai/jev）不是语言模型，必须用本端点，
 * /api/v1/chat/completions 会被上游拒绝。
 */
export async function POST(request: Request) {
  return handleEvaluateRequest(request);
}

export async function GET() {
  return evaluateMethodNotAllowed("evaluations");
}
