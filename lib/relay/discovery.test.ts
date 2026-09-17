import { describe, expect, test } from "bun:test";

import { fetchUpstreamModels, modelsEndpoint, parseUpstreamModelIds, type UpstreamModelDiscoveryResult } from "./discovery";

/** 用替身接管全局 fetch，返回还原函数（Bun 的 fetch 类型带 preconnect，故走 unknown 断言）。 */
function stubFetch(handler: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("relay upstream model discovery", () => {
  test("modelsEndpoint appends the models path and tolerates trailing slashes", () => {
    expect(modelsEndpoint("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/models");
    expect(modelsEndpoint("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/models");
    expect(modelsEndpoint(" https://api.openai.com/v1// ")).toBe("https://api.openai.com/v1/models");
  });

  test("parseUpstreamModelIds reads the three OpenAI-compatible payload shapes", () => {
    expect(parseUpstreamModelIds({ data: [{ id: "gpt-4o" }, { id: "gpt-5" }] })).toEqual(["gpt-4o", "gpt-5"]);
    expect(parseUpstreamModelIds({ data: ["gpt-4o", "gpt-5"] })).toEqual(["gpt-4o", "gpt-5"]);
    expect(parseUpstreamModelIds({ models: [{ id: "gpt-4o" }, { name: "claude-3-5-sonnet" }] })).toEqual(["gpt-4o", "claude-3-5-sonnet"]);
  });

  test("parseUpstreamModelIds trims, drops empties and de-duplicates in order", () => {
    expect(parseUpstreamModelIds({
      data: [{ id: " gpt-4o " }, { id: "" }, { name: "   " }, { id: "gpt-4o" }, 7, null, "gpt-5"],
    })).toEqual(["gpt-4o", "gpt-5"]);
    expect(parseUpstreamModelIds({})).toEqual([]);
  });

  test("fetchUpstreamModels requests <baseUrl>/models with the bearer key and caller headers", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const restore = stubFetch(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ data: [{ id: "gpt-4o" }] });
    });
    let result: UpstreamModelDiscoveryResult;
    try {
      result = await fetchUpstreamModels({
        baseUrl: "https://api.openai.com/v1/",
        key: "sk-test",
        headers: { "OpenAI-Organization": "org-1" },
      });
    } finally {
      restore();
    }
    expect(result).toEqual({ ok: true, models: ["gpt-4o"] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/models");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.headers).toEqual({ authorization: "Bearer sk-test", "OpenAI-Organization": "org-1" });
  });

  test("fetchUpstreamModels maps upstream failures to discovery errors", async () => {
    const cases: { handler: (...args: Parameters<typeof fetch>) => Promise<Response>; error: string }[] = [
      { handler: async () => new Response("nope", { status: 401 }), error: "Upstream responded with HTTP 401." },
      { handler: async () => new Response("not json", { status: 200 }), error: "The upstream returned an invalid model list." },
      { handler: async () => Response.json({ data: [] }), error: "The upstream returned no models." },
      { handler: async () => { throw new Error("socket closed"); }, error: "Unable to reach the upstream." },
    ];
    for (const { handler, error } of cases) {
      const restore = stubFetch(handler);
      try {
        expect(await fetchUpstreamModels({ baseUrl: "https://api.example.com/v1", key: "k" })).toEqual({ ok: false, error });
      } finally {
        restore();
      }
    }
  });

  test("fetchUpstreamModels rejects unsafe upstreams before any network call", async () => {
    let calls = 0;
    const restore = stubFetch(async () => {
      calls += 1;
      throw new Error("network must not be reached");
    });
    let results: UpstreamModelDiscoveryResult[];
    try {
      results = [
        await fetchUpstreamModels({ baseUrl: "http://api.example.com/v1", key: "k" }),
        await fetchUpstreamModels({ baseUrl: "https://127.0.0.1:8443/v1", key: "k" }),
        await fetchUpstreamModels({ baseUrl: "https://user:secret@api.example.com/v1", key: "k" }),
      ];
    } finally {
      restore();
    }
    expect(results).toEqual([
      { ok: false, error: "Upstream URL must be public HTTPS and must not include credentials." },
      { ok: false, error: "Upstream URL must be public HTTPS and must not include credentials." },
      { ok: false, error: "Upstream URL must be public HTTPS and must not include credentials." },
    ]);
    expect(calls).toBe(0);
  });
});
