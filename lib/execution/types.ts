export type ExecutorType = "native" | "litellm";

export type ExecutionUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  source: "upstream" | "estimated" | "unavailable";
};

export type ExecutionDeployment = {
  id: string;
  configVersion: number;
  provider: string;
  model: string;
  apiBase: string;
};

export type ExecutionRequest = {
  requestId: string;
  attemptId: string;
  protocol: "chat" | "responses";
  deployment: ExecutionDeployment;
  credentials: { apiKey: string };
  execution: {
    deadlineAt: string;
    connectTimeoutMs: number;
    idleTimeoutMs: number;
  };
  body: Record<string, unknown>;
};
