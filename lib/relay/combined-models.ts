import { getDatabase } from "./store";
import { RelayError } from "./errors";
import { assertModelAllowed } from "./keys";
import type { ApiKey } from "./types";
import { models as catalog } from "../models-data";

export type CombinedModel = { name: string; models: string[] };

const catalogModalities = new Map(catalog.flatMap((entry) => [
  [entry.slug, entry.modality] as const,
  ...entry.variants.map((variant) => [variant.id, entry.modality] as const),
]));
const nonChatAliases = new Set(["typesafe-ai/jev", "codex-auto-review", "nano_banana_2"]);

export function isTextModel(model: string): boolean {
  if (nonChatAliases.has(model)) return false;
  const modality = catalogModalities.get(model);
  return modality === undefined || modality === "text";
}

export async function listCombinedModels(workspaceId: number): Promise<CombinedModel[]> {
  const db = await getDatabase();
  const rows = (await db.query<{ name: string; models: string }, [number]>(
    "SELECT name, models FROM combined_models WHERE workspace_id = ? ORDER BY name COLLATE NOCASE",
  ).all(workspaceId));
  return rows.map((row) => ({ name: row.name, models: JSON.parse(row.models) as string[] }));
}

export async function findCombinedModel(workspaceId: number, name: string): Promise<CombinedModel | null> {
  const db = await getDatabase();
  const row = (await db.query<{ name: string; models: string }, [number, string]>(
    "SELECT name, models FROM combined_models WHERE workspace_id = ? AND name = ?",
  ).get(workspaceId, name));
  return row ? { name: row.name, models: JSON.parse(row.models) as string[] } : null;
}

export function eligibleCombinedModels(apiKey: ApiKey, combined: CombinedModel): string[] {
  const eligible = combined.models.filter((model) => {
    try { assertModelAllowed(apiKey, model); return true; } catch { return false; }
  });
  if (!eligible.length) throw new RelayError(`No models in ${combined.name} are allowed by this API key.`, {
    statusCode: 403, code: "model_not_found", type: "permission_error",
  });
  return eligible;
}

export function validateCombinedModel(input: unknown, reservedNames: readonly string[], reservedMembers: readonly string[] = []): { ok: true; value: CombinedModel } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Expected a model name and ordered model list." };
  const { name, models } = input as Record<string, unknown>;
  if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name)) return { ok: false, error: "Name must contain 1-100 letters, digits, dots, underscores, slashes or hyphens." };
  if (!Array.isArray(models) || models.length < 2 || models.length > 10 || models.some((model) => typeof model !== "string" || !model || model.length > 200)) return { ok: false, error: "Choose 2-10 model IDs in priority order." };
  if (new Set(models).size !== models.length) return { ok: false, error: "Model IDs must be unique." };
  if (reservedNames.some((reserved) => reserved.toLowerCase() === name.toLowerCase())) return { ok: false, error: "Combined model name conflicts with a real model or routing alias." };
  if (models.some((model) => reservedMembers.some((reserved) => reserved.toLowerCase() === model.toLowerCase()))) return { ok: false, error: "A member must be a real model, not a routing alias or another combination." };
  if (models.includes(name)) return { ok: false, error: "A combined model cannot contain itself." };
  if (models.some((model) => !isTextModel(model))) return { ok: false, error: "Combined models support text models only." };
  return { ok: true, value: { name, models: models as string[] } };
}
