"use client";

import * as React from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { cn } from "@/lib/utils";

type ApiKey = {
  id: string;
  name: string;
  secret: string;
  scopes: string[];
  budget: string;
  created: string;
  lastUsed: string;
};

type KeysDict = Dictionary["dashboard"]["keys"];



export function KeyManager({
  dict,
}: {
  dict: KeysDict;
}) {
  const [keys, setKeys] = React.useState<ApiKey[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<Record<string, string>>({});
  const [draft, setDraft] = React.useState({ name: "", scopes: "image.generate", budget: "" });
  const [error, setError] = React.useState("");
  React.useEffect(() => { void fetch("/api/user/keys").then(async (r) => { if (!r.ok) throw new Error("Unable to load keys"); const d = await r.json() as { data?: ApiKey[] }; setKeys(d.data ?? []); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load keys")); }, []);
  async function reveal(id: string) {
    if (revealed[id]) { setRevealed((current) => { const next = { ...current }; delete next[id]; return next; }); return; }
    const response = await fetch(`/api/user/keys/${encodeURIComponent(id)}`);
    if (!response.ok) { setError("Unable to reveal key"); return; }
    const data = await response.json() as { secret: string }; setRevealed((current) => ({ ...current, [id]: data.secret }));
  }
  async function copy(key: ApiKey) {
    const secret = revealed[key.id];
    if (!secret) { await reveal(key.id); return; }
    try { await navigator.clipboard.writeText(secret); setCopiedId(key.id); window.setTimeout(() => setCopiedId(null), 1600); } catch { /* clipboard unavailable */ }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) { setError(dict.validation.name); return; }
    setError("");
    const response = await fetch("/api/user/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: draft.name.trim(), scopes: draft.scopes, budget: draft.budget.trim() }) });
    if (!response.ok) { setError("Unable to create key"); return; }
    const created = await response.json() as ApiKey;
    setKeys((current) => [created, ...current]); setDraft({ name: "", scopes: "image.generate", budget: "" }); setCreating(false);
  }
  async function revoke(id: string) {
    const response = await fetch(`/api/user/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setKeys((current) => current.filter((key) => key.id !== id));
  }




  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {dict.title}
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {dict.description}
          </p>
        </div>
        <Button
          variant={creating ? "outline" : "brand"}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? (
            dict.cancel
          ) : (
            <>
              <Plus className="size-4" />
              {dict.create}
            </>
          )}
        </Button>
      </div>

      {creating ? (
        <form
          onSubmit={create}
          className="grid gap-5 rounded-md border border-border bg-card p-6 sm:grid-cols-3"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-name">{dict.name}</Label>
            <Input
              id="key-name"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder={dict.namePlaceholder}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-scopes">{dict.scopes}</Label>
            <Input
              id="key-scopes"
              value={draft.scopes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, scopes: e.target.value }))
              }
              placeholder="image.generate, video.generate"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="key-budget">{dict.budget}</Label>
            <Input
              id="key-budget"
              value={draft.budget}
              onChange={(e) =>
                setDraft((d) => ({ ...d, budget: e.target.value }))
              }
              placeholder={dict.budgetPlaceholder}
            />
          </div>

          {error ? (
            <p className="text-[12px] text-destructive sm:col-span-3">
              {error}
            </p>
          ) : null}

          <div className="sm:col-span-3">
            <Button type="submit" variant="brand">
              {dict.create}
            </Button>
            <p className="mt-3 text-[12px] text-muted-foreground">
              {dict.secretOnce}
            </p>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{dict.table.name}</TableHead>
                <TableHead>{dict.table.key}</TableHead>
                <TableHead>{dict.table.scopes}</TableHead>
                <TableHead>{dict.table.budget}</TableHead>
                <TableHead>{dict.table.lastUsed}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-[13px] text-muted-foreground"
                  >
                    {dict.empty}
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium text-foreground">
                      {key.name}
                      <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                        {key.created}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">
                      {revealed[key.id] ?? key.secret}
                      <button
                        type="button"
                        onClick={() => void reveal(key.id)}
                        className="ml-2 text-[11px] text-brand underline-offset-4 hover:underline"
                      >
                        {revealed[key.id] ? dict.hide : dict.reveal}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-[3px] bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {scope}
                          </span>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {key.budget}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {key.lastUsed}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copy(key)}
                          aria-label={dict.table.key}
                          className={cn(
                            "rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {copiedId === key.id ? (
                            <Check className="size-4 text-emerald-600" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => revoke(key.id)}
                          aria-label={dict.revoke}
                          className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">{dict.footnote}</p>
    </div>
  );
}
