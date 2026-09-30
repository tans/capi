import { models, type ModelEntry } from "@/lib/models-data";
import { getRegistry } from "@/lib/relay";

export async function getPublicAvailableModels(): Promise<ModelEntry[]> {
  const registry = await getRegistry();
  const enabledIds = new Set(
    (await registry.listChannels())
      .filter((channel) => channel.status === 1 && channel.ownerType === "platform")
      .flatMap((channel) => channel.models),
  );

  return models
    .filter((entry) => ["text", "image", "video"].includes(entry.modality) || entry.slug === "jev")
    .map((entry) => ({
      ...entry,
      variants: entry.variants.filter((variant) => enabledIds.has(variant.id)),
    }))
    .filter((entry) => entry.variants.length > 0);
}
