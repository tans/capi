import { createHash } from "node:crypto";

const SECRET_PATTERNS = [
  /\b(?:sk|rk|pk|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/g,
  /\b(?:bearer\s+)[A-Za-z0-9._~+\/-]{12,}=*/gi,
  /\b[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
];

function mask(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}${"•".repeat(Math.min(12, value.length - 8))}${value.slice(-4)}`;
}

export function buildSecurityEvidence(text: string, categories: string[]): Record<string, unknown> {
  const snippets = categories.includes("credential")
    ? SECRET_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => mask(match[0]))).slice(0, 3)
    : [];
  return {
    snippets,
    paths: ["user.messages.text"],
    fingerprints: [`sha256:${createHash("sha256").update(text).digest("hex")}`],
    redactionVersion: "v1",
  };
}
