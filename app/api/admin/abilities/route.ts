import { requireAdmin } from "@/lib/relay/admin";
import { describeRouting, getRegistry } from "@/lib/relay";

/**
 * 路由拓扑：查看「分组 + 模型」下的渠道分层与权重分布。
 *
 *   GET /api/admin/abilities                -> 全部能力表
 *   GET /api/admin/abilities?group=default&model=gpt-5.5 -> 该模型的路由分层
 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied;

  const registry = await getRegistry();
  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const model = url.searchParams.get("model");

  if (group && model) {
    return Response.json({
      group,
      model,
      layers: describeRouting(registry, group, model),
    });
  }

  let abilities = registry.abilities();
  if (group) abilities = abilities.filter((a) => a.group === group);
  if (model) abilities = abilities.filter((a) => a.model === model);

  const groups = new Map<string, string[]>();
  for (const ability of abilities) {
    const list = groups.get(ability.group) ?? [];
    if (!list.includes(ability.model)) list.push(ability.model);
    groups.set(ability.group, list);
  }

  return Response.json({
    object: "list",
    groups: Object.fromEntries(
      [...groups.entries()].map(([g, models]) => [g, models.sort()]),
    ),
    data: abilities,
  });
}
