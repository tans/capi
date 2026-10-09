import type { Channel } from "./types";
import type { ImageProtocolConfig } from "./image-protocol";
import type { VideoProtocolConfig } from "./video-protocol";

/**
 * Editable projection of a stored channel for the dashboard channel panel.
 * Editing is field-by-field, so the panel never sees persisted bookkeeping fields.
 */
export type ChannelDraft = {
  id: string;
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
  protocolBases: Record<string, string>;
  modelProtocols: Record<string, string>;
  headers: Record<string, string>;
  paramOverride: Record<string, unknown>;
  tag: string;
  videoSubmitPath: string;
  videoStatusPath: string;
  systemonePath: string;
  systemoneProtocol: NonNullable<Channel["systemoneProtocol"]>;
  imageProtocolConfig?: ImageProtocolConfig | null;
  videoProtocolConfig?: VideoProtocolConfig | null;
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
    protocolBases: channel.protocolBases ?? {},
    modelProtocols: channel.modelProtocols ?? {},
    headers: channel.headers ?? {},
    paramOverride: channel.paramOverride ?? {},
    tag: channel.tag ?? "",
    videoSubmitPath: channel.videoSubmitPath ?? "",
    videoStatusPath: channel.videoStatusPath ?? "",
    systemonePath: channel.systemonePath ?? "",
    systemoneProtocol: channel.systemoneProtocol ?? "generic",
    imageProtocolConfig: channel.imageProtocolConfig ?? null,
    videoProtocolConfig: channel.videoProtocolConfig ?? null,
    keyCount: channel.keys.length,
    lastError: channel.lastError,
  };
}
