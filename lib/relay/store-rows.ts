import type { ApiKey, Channel, Group } from "./types";

export type ChannelConfig = Omit<Channel, "id" | "ownerType" | "workspaceId" | "usedQuota" | "responseTime" | "createdTime">;
export type KeyConfig = Omit<ApiKey, "id" | "userId" | "workspaceId" | "key" | "budgetLimitQuota" | "budgetSpentQuota" | "createdTime" | "accessedTime">;
export type ChannelRow = {
  id: number;
  owner_type: Channel["ownerType"];
  workspace_id: number | null;
  config: string;
  used_quota: number;
  response_time: number;
  created_time: number;
};
export type KeyRow = {
  id: number;
  user_id: number;
  workspace_id: number;
  key_hash: string;
  key_prefix: string;
  config: string;
  budget_limit_units: number | null;
  budget_spent_units: number;
  created_time: number;
  accessed_time: number;
};

export function channelFromRow(row: ChannelRow): Channel {
  return {
    ...JSON.parse(row.config) as ChannelConfig,
    id: row.id,
    ownerType: row.owner_type,
    ...(row.workspace_id === null ? {} : { workspaceId: row.workspace_id }),
    usedQuota: row.used_quota,
    responseTime: row.response_time,
    createdTime: row.created_time,
  };
}

export function keyFromRow(row: KeyRow): ApiKey {
  const config = JSON.parse(row.config) as KeyConfig;
  return {
    ...config,
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    key: row.key_prefix,
    secret: config.secret,
    budgetLimitQuota: row.budget_limit_units,
    budgetSpentQuota: row.budget_spent_units,
    createdTime: row.created_time,
    accessedTime: row.accessed_time,
  };
}

export type GroupRow = {
  id: number;
  name: string;
  display_name: string;
  ratio: number;
  description: string;
  status: Group["status"];
  created_at: number;
};

export function groupFromRow(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    ratio: row.ratio,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

