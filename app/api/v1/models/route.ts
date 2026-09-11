import { models } from "@/lib/models-data";
import { isAuthorized, unauthorized } from "@/lib/mock-api";

/** List every model available to the calling key. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const url = new URL(request.url);
  const modality = url.searchParams.get("modality");
  const provider = url.searchParams.get("provider");

  const filtered = models.filter((model) => {
    if (modality && model.modality !== modality) return false;
    if (provider && model.provider.toLowerCase() !== provider.toLowerCase()) {
      return false;
    }
    return true;
  });

  return Response.json({
    object: "list",
    data: filtered.flatMap((model) =>
      model.variants.map((variant) => ({
        id: variant.id,
        object: "model",
        family: model.slug,
        provider: model.provider,
        modality: model.modality,
        capabilities: model.capabilities,
        price: {
          amount: Number.parseFloat(model.priceFrom.amount),
          unit: model.priceFrom.unit,
          currency: "USD",
        },
      })),
    ),
  });
}
