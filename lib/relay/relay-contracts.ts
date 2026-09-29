import type { RelayRegistry } from "./store";
import type { ApiKey, Channel } from "./types";

export type ChatRequestBody = {
  model: string;
  messages?: { role: string; content: unknown }[];
  stream?: boolean;
  max_tokens?: number;
  [key: string]: unknown;
};

export type RelayContext = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  pinnedChannelId: number | null;
  requestId: string;
  body: ChatRequestBody;
};

export type UpstreamUsage = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
};

export type ResponsesRelayContext = {
  registry: RelayRegistry;
  apiKey: ApiKey;
  pinnedChannelId: number | null;
  requestId: string;
  body: Record<string, unknown> & { model: string; stream?: boolean };
};

export type ForwardChannelInput = {
  ctx: RelayContext;
  channel: Channel;
  group: string;
  retryCount: number;
  upstreamKey: string;
  isBillable: boolean;
  requestModel: string;
};
