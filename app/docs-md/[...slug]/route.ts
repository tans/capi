import { getEndpoint } from "@/lib/api-spec";
import { getDoc } from "@/lib/docs";

/** Raw markdown for a docs page or API endpoint, for the "View Markdown" link. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const path = (slug ?? []).join("/");
  const headers = {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "public, max-age=3600",
  };

  if (path.startsWith("api/")) {
    const endpoint = getEndpoint(path.replace(/^api\//, ""));
    if (endpoint) {
      const body = [
        `# ${endpoint.title}`,
        "",
        endpoint.summary,
        "",
        `\`${endpoint.method} ${endpoint.path}\``,
        "",
        "## Overview",
        "",
        endpoint.overview,
        "",
        "## Parameters",
        "",
        ...endpoint.params.map(
          (p) =>
            `- \`${p.name}\` (${p.type})${p.required ? " — required" : ""}: ${p.description}`,
        ),
        "",
        "## Example",
        "",
        "```" + (endpoint.example[0]?.language ?? "bash"),
        endpoint.example[0]?.code ?? "",
        "```",
        "",
        "## Response",
        "",
        "```json",
        endpoint.responseBody,
        "```",
        "",
      ].join("\n");

      return new Response(body, { headers });
    }
  } else {
    const doc = getDoc(path);
    if (doc) return new Response(doc.body, { headers });
  }

  return new Response("Not found", { status: 404 });
}
