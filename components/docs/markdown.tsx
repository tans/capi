import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

import { Code, CodeBlock } from "@/components/code-block";
import { cn } from "@/lib/utils";

/** Display label for a fenced code block's language chip. */
function languageLabel(lang: string) {
  const map: Record<string, string> = {
    bash: "SHELL",
    sh: "SHELL",
    shell: "SHELL",
    zsh: "SHELL",
    javascript: "JAVASCRIPT",
    typescript: "TYPESCRIPT",
    python: "PYTHON",
    json: "JSON",
    http: "HTTP",
    yaml: "YAML",
    toml: "TOML",
    go: "GO",
    php: "PHP",
    ruby: "RUBY",
    java: "JAVA",
    xml: "XML",
    html: "HTML",
    text: "TEXT",
  };
  return map[lang.toLowerCase()] ?? lang.toUpperCase();
}

function extractCodeBlock(children: React.ReactNode): {
  lang: string;
  code: string;
} | null {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement(child)) return null;

  const props = child.props as {
    className?: string;
    children?: React.ReactNode;
  };
  const className = props.className ?? "";
  const lang = /language-([\w-]+)/.exec(className)?.[1] ?? "bash";
  const raw = props.children;

  const code = Array.isArray(raw) ? raw.join("") : String(raw ?? "");

  return { lang, code: code.replace(/\n$/, "") };
}

export function Markdown({ body }: { body: string }) {
  return (
    <div className="text-[15px] leading-[1.75] text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          /* ---------------------------------- headings --------------------------------- */
          h1: ({ children }) => (
            <h1 className="display-2 mt-0 mb-4 text-foreground">{children}</h1>
          ),
          h2: ({ children, id }) => (
            <h2
              id={id}
              className="mt-12 mb-4 scroll-mt-32 text-[22px] font-semibold tracking-tight text-foreground"
            >
              {children}
            </h2>
          ),
          h3: ({ children, id }) => (
            <h3
              id={id}
              className="mt-8 mb-3 scroll-mt-32 text-[17px] font-semibold tracking-tight text-foreground"
            >
              {children}
            </h3>
          ),

          /* ---------------------------------- text ------------------------------------- */
          p: ({ children }) => (
            <p className="my-4 text-muted-foreground">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          a: ({ children, href }) => {
            const to = href ?? "#";
            const internal = to.startsWith("/") || to.startsWith("#");
            if (internal) {
              return (
                <Link
                  href={to}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={to}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {children}
              </a>
            );
          },

          /* ---------------------------------- lists ------------------------------------ */
          ul: ({ children }) => (
            <ul className="my-4 flex list-disc flex-col gap-2 pl-5 text-muted-foreground marker:text-neutral-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 flex list-decimal flex-col gap-2 pl-5 text-muted-foreground marker:text-neutral-400">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,

          /* -------------------------------- callouts ---------------------------------- */
          blockquote: ({ children }) => (
            <div className="my-6 rounded-sm border border-brand/20 bg-brand-muted px-5 py-4 text-[14px] text-brand-muted-foreground [&>p]:my-0 [&>p]:text-brand-muted-foreground">
              {children}
            </div>
          ),

          /* --------------------------------- code ------------------------------------- */
          pre: ({ children }) => {
            const block = extractCodeBlock(children);
            if (!block) return <pre>{children}</pre>;

            return (
              <div className="my-5">
                <CodeBlock
                  tabs={[
                    {
                      label: languageLabel(block.lang),
                      language: block.lang,
                      code: block.code,
                    },
                  ]}
                />
              </div>
            );
          },
          code: ({ children, className }) => {
            // Fenced blocks are handled by `pre`; anything with a language
            // class here is inside one, so render it plainly.
            if (className?.includes("language-")) {
              return <code className={className}>{children}</code>;
            }
            return <Code>{children}</Code>;
          },

          /* --------------------------------- tables ----------------------------------- */
          table: ({ children }) => (
            <div className="my-6 overflow-hidden rounded-md border border-border">
              <div className="relative w-full overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  {children}
                </table>
              </div>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/40">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-4 py-3 text-left font-mono text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-4 py-3 align-top text-[13px] text-muted-foreground">
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr className="last:[&>td]:border-0">{children}</tr>
          ),

          /* --------------------------------- rules ------------------------------------ */
          hr: () => <hr className="my-10 border-border" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Renders a docs body inside the standard prose measure.
 */
export function DocBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <Markdown body={body} />
    </div>
  );
}
