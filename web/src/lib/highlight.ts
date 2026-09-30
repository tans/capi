import hljs from "highlight.js/lib/core";

import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import http from "highlight.js/lib/languages/http";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

let registered = false;

const languages: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash,
  css,
  go,
  http,
  java,
  javascript,
  json,
  php,
  python,
  ruby,
  typescript,
  xml,
  yaml,
};

/** Map display labels / aliases onto registered grammar names. */
const aliases: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  js: "javascript",
  node: "javascript",
  "node.js": "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  html: "xml",
  svg: "xml",
  curl: "bash",
  md: "bash",
};

/** Rendered verbatim — used for endpoint listings and other plain output. */
const verbatim = new Set([
  "plaintext",
  "plain",
  "text",
  "txt",
  "endpoints",
  "log",
]);

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureRegistered() {
  if (registered) return;
  for (const [name, grammar] of Object.entries(languages)) {
    hljs.registerLanguage(name, grammar);
  }
  registered = true;
}

export function highlight(code: string, language?: string) {
  ensureRegistered();
  const key = (language ?? "").toLowerCase();

  if (verbatim.has(key)) return escapeHtml(code);

  const resolved = aliases[key] ?? key;

  if (resolved && hljs.getLanguage(resolved)) {
    try {
      return hljs.highlight(code, { language: resolved, ignoreIllegals: true })
        .value;
    } catch {
      /* fall through to plain text */
    }
  }

  return hljs.highlightAuto(code).value;
}
