import { evaluateMethodNotAllowed, handleEvaluateRequest } from "@/lib/relay/evaluate-handler";

/** TypeSafe System One-compatible typed decision endpoint. */
export async function POST(request: Request) {
  return handleEvaluateRequest(request, { systemOne: true });
}

export async function GET() {
  return evaluateMethodNotAllowed("System One");
}
