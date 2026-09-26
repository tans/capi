import type { Channel } from "./types";
import type { ImageProtocolConfig } from "./image-protocol";

/**
 * Editable projection of a stored channel for the dashboard channel panel.
 * Editing is field-by-field, so the panel never sees persisted bookkeeping fields.
 */
export type ChannelDraft = {
  id: number;
  name: string;
  type: Channel["type"];
  baseUrl: string;
  models: string[];
  groups: string[];
  priority: number;
  weight: number;
  status: Channel["status"];
  autoBan: boolean;
  multiKeyMode: Channel["multiKeyMode"];
  modelMapping: Record<string, string>;
  headers: Record<string, string>;
  paramOverride: Record<string, unknown>;
  tag: string;
  videoSubmitPath: string;
  videoStatusPath: string;
  evaluatePath: string;
  evaluateProtocol: NonNullable<Channel["evaluateProtocol"]>;
  imageProtocolConfig?: ImageProtocolConfig | null;
  /** Stored upstream keys, masked or counted — never edited in place. */
  keyCount: number;
  /** Set when the channel was disabled automatically after upstream failures. */
  lastError?: string;
};

export function toChannelDraft(channel: Channel): ChannelDraft {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    baseUrl: channel.baseUrl,
    models: channel.models,
    groups: channel.groups,
    priority: channel.priority,
    weight: channel.weight,
    status: channel.status,
    autoBan: channel.autoBan,
    multiKeyMode: channel.multiKeyMode,
    modelMapping: channel.modelMapping ?? {},
    headers: channel.headers ?? {},
    paramOverride: channel.paramOverride ?? {},
    tag: channel.tag ?? "",
    videoSubmitPath: channel.videoSubmitPath ?? "",
    videoStatusPath: channel.videoStatusPath ?? "",
    evaluatePath: channel.evaluatePath ?? "",
    evaluateProtocol: channel.evaluateProtocol ?? "generic",
    imageProtocolConfig: channel.imageProtocolConfig ?? null,
    keyCount: channel.keys.length,
    lastError: channel.lastError,
  };
}
