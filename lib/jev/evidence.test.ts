import { describe, expect, test } from "bun:test";

import { buildSecurityEvidence } from "./evidence";

describe("JEV security evidence", () => {
  test("stores a masked credential and a stable fingerprint", () => {
    const evidence = buildSecurityEvidence("token sk-abcdefghijklmnopqrstuvwxyz123456", ["credential"]);
    expect(String((evidence.snippets as string[])[0])).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(String((evidence.fingerprints as string[])[0])).toStartWith("sha256:");
  });
});
