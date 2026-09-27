"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, FileAudio2, FileImage, FileText, FileVideo2, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { interpolate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";

export type WorkspaceFile = {
  id: string;
  filename: string;
  contentType: string;
  bytes: number;
  purpose: string;
  createdAt: number;
  expiresAt: number | null;
};

type Props = {
  workspaceId: number;
  locale: Locale;
  files: WorkspaceFile[];
  hasMore: boolean;
  canManage: boolean;
};

type Filter = "all" | "image" | "video" | "audio" | "document";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function category(file: WorkspaceFile): Filter {
  if (file.contentType.startsWith("image/")) return "image";
  if (file.contentType.startsWith("video/")) return "video";
  if (file.contentType.startsWith("audio/")) return "audio";
  return "document";
}

export function WorkspaceFiles({ workspaceId, locale, files: initialFiles, hasMore: initialHasMore, canManage }: Props) {
  const t = getDictionary(locale).dashboard.workspace.files;
  const [files, setFiles] = useState(initialFiles);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visibleFiles = useMemo(() => files.filter((file) => {
    const matchesFilter = filter === "all" || category(file) === filter;
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || file.filename.toLowerCase().includes(needle) || file.id.toLowerCase().includes(needle);
    return matchesFilter && matchesSearch;
  }), [files, filter, search]);

  const contentUrl = (file: WorkspaceFile) => `/api/workspaces/${workspaceId}/files/${encodeURIComponent(file.id)}/content`;
  const endpoint = `/api/workspaces/${workspaceId}/files`;

  async function refresh() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}?limit=51`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.loadError);
      setFiles(payload.data as WorkspaceFile[]);
      setHasMore(Boolean(payload.hasMore));
    } catch { setError(t.loadError); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    const lastFile = files.at(-1);
    if (!lastFile || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}?limit=50&before=${lastFile.createdAt}&before_id=${encodeURIComponent(lastFile.id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(t.loadError);
      setFiles((current) => [...current, ...(payload.data as WorkspaceFile[]).filter((file) => !current.some((item) => item.id === file.id))]);
      setHasMore(Boolean(payload.hasMore));
    } catch { setError(t.loadError); }
    finally { setBusy(false); }
  }

  async function remove(file: WorkspaceFile) {
    if (!window.confirm(interpolate(t.deleteConfirm, { filename: file.filename }))) return;
    setDeletingId(file.id); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete file.");
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setNotice(t.deleted);
    } catch { setError(t.deleteError); }
    finally { setDeletingId(null); }
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id); setNotice(t.copied);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1600);
    } catch { setError(t.copyError); }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t.all }, { id: "image", label: t.images }, { id: "video", label: t.videos }, { id: "audio", label: t.audio }, { id: "document", label: t.documents },
  ];

  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-base-content/65">{t.description}</p>
      </div>
      <button className="btn btn-sm btn-outline" type="button" onClick={() => void refresh()} disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{t.refresh}
      </button>
    </div>

    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="input input-sm flex w-full items-center gap-2 sm:max-w-sm">
        <FileText aria-hidden="true" className="size-4 text-base-content/50" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} />
      </label>
      <div role="group" aria-label={t.title} className="join max-w-full overflow-x-auto">
        {filters.map((item) => <button key={item.id} type="button" className={`btn btn-sm join-item ${filter === item.id ? "btn-active" : "btn-outline"}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
    </div>

    <div className="flex items-center justify-between text-sm text-base-content/60">
      <span>{interpolate(t.count, { count: visibleFiles.length })}</span>
      {busy && <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />{t.loading}</span>}
    </div>

    {visibleFiles.length === 0 ? <div className="rounded-md border border-dashed border-base-300 px-6 py-14 text-center">
      <FileImage className="mx-auto size-8 text-base-content/35" aria-hidden="true" />
      <p className="mt-3 text-sm text-base-content/65">{files.length === 0 ? t.empty : t.noMatches}</p>
    </div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visibleFiles.map((file) => {
        const type = category(file);
        const mediaUrl = contentUrl(file);
        const Icon = type === "image" ? FileImage : type === "video" ? FileVideo2 : type === "audio" ? FileAudio2 : FileText;
        return <article key={file.id} className="overflow-hidden rounded-md border border-base-300 bg-base-100">
          <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-base-200">
            {type === "image" ? <a href={mediaUrl} target="_blank" rel="noreferrer" className="flex size-full items-center justify-center"><img src={mediaUrl} alt={file.filename} loading="lazy" className="size-full object-contain" /></a>
              : type === "video" ? <video className="size-full object-contain" src={mediaUrl} controls preload="metadata" aria-label={file.filename} />
              : type === "audio" ? <div className="w-full px-4"><Icon className="mx-auto mb-5 size-9 text-base-content/45" aria-hidden="true" /><audio className="w-full" src={mediaUrl} controls preload="metadata" /></div>
              : <div className="flex flex-col items-center gap-2 px-4 text-center text-base-content/50"><Icon className="size-10" aria-hidden="true" /><span className="text-xs">{file.contentType}</span></div>}
          </div>
          <div className="p-3.5">
            <h2 className="truncate text-sm font-medium" title={file.filename}>{file.filename}</h2>
            <p className="mt-1 truncate text-xs text-base-content/55" title={file.id}>{file.id}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-base-content/60">
              <span>{formatBytes(file.bytes)} <span aria-hidden="true">·</span> {file.contentType.split("/")[1]?.toUpperCase()}</span>
              <span>{file.expiresAt ? new Date(file.expiresAt).toLocaleDateString(locale) : t.permanent}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-base-200 pt-3">
              <a className="btn btn-xs btn-outline" href={`${mediaUrl}?download=1`} download><Download className="size-3.5" />{t.download}</a>
              <button className="btn btn-xs btn-ghost" type="button" onClick={() => void copyId(file.id)} aria-label={t.copyId}>
                {copiedId === file.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{t.copyId}
              </button>
              {canManage && <button className="btn btn-xs btn-ghost text-error" type="button" disabled={deletingId === file.id} onClick={() => void remove(file)}>
                {deletingId === file.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}{t.delete}
              </button>}
            </div>
          </div>
        </article>;
      })}
    </div>}

    {hasMore && filter === "all" && !search.trim() && <div className="flex justify-center"><button className="btn btn-sm btn-outline" type="button" onClick={() => void loadMore()} disabled={busy}>{t.loadMore}</button></div>}
  </section>;
}
