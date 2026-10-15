import { useEffect, useMemo, useState } from "react";
import { Download, Image as ImageIcon, Loader2, Play, RefreshCw, Upload, Video } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/lib/i18n/config";
import type { WorkspaceDetail } from "@/console-pages";

type Key = { id: string; name: string; secret: string; scopes: string[]; enabled: boolean };
type FileRecord = { id: string; filename: string; content_type: string; purpose: string; created_at: string; expires_at: string | null };
type FilesResponse = { data: FileRecord[]; total: number };
type ImageResult = { url?: string; capi_url?: string; capi_file_id?: string; b64_json?: string };
type VideoTask = { id: string; status: string; model: string; result?: { archive?: { file_id?: string } } };

export function MultimediaWorkspace({ locale, detail }: { locale: Locale; detail: WorkspaceDetail }) {
  const zh = locale === "zh";
  const { id: workspaceId } = detail.workspace;
  const [mode, setMode] = useState<"image" | "video">("video");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [keyId, setKeyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [referenceFileIds, setReferenceFileIds] = useState<string[]>([]);
  const keys = useApiKeys(detail.workspace.id);
  const models = useMemo(() => [...new Set([...detail.models, ...detail.platformModels])], [detail.models, detail.platformModels]);
  const selectedKey = keys.find(key => key.id === keyId);
  const canUpload = selectedKey?.scopes.includes("files.write") || selectedKey?.scopes.includes("workspace.manage") || selectedKey?.scopes.includes("*");

  useEffect(() => { if (!keyId && keys[0]) setKeyId(keys[0].id); }, [keyId, keys]);
  useEffect(() => { if (!model && models[0]) setModel(mode === "video" ? (models.find(value => value === "minimax-h3") ?? models[0]) : (models.find(value => value === "qwen-image-2.1") ?? models[0])); }, [mode, model, models]);
  const loadRecords = async () => {
    try { const result = await api<FilesResponse>(`/api/workspaces/${workspaceId}/files?pageSize=100`); setRecords(result.data.filter(file => file.content_type.startsWith("image/") || file.content_type.startsWith("video/"))); } catch { /* the main form remains usable */ }
  };
  useEffect(() => { void loadRecords(); }, [workspaceId]);
  useEffect(() => {
    if (!tasks.length) return;
    const timer = window.setInterval(async () => {
      const next = await Promise.all(tasks.map(async task => { try { return await api<VideoTask>(`/v1/tasks/${encodeURIComponent(task.id)}`, { headers: { Authorization: `Bearer ${selectedKey?.secret ?? ""}` } }); } catch { return task; } }));
      setTasks(next.filter(task => !["succeeded", "failed"].includes(task.status)));
      if (next.some(task => ["succeeded", "failed"].includes(task.status))) void loadRecords();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [tasks, selectedKey?.secret]);
  const uploadReference = async (file: File) => {
    if (!selectedKey?.secret || busy) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api("/v1/files", { method: "POST", headers: { Authorization: `Bearer ${selectedKey.secret}` }, body });
      await loadRecords();
    } catch (cause) { setError(cause instanceof Error ? cause.message : (zh ? "上传失败，请重试。" : "Upload failed. Try again.")); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (!selectedKey?.secret || !model.trim() || !prompt.trim() || busy) return;
    setBusy(true); setError(""); setImageResults([]);
    try {
      if (mode === "image") {
        const result = await api<{ data: ImageResult[] }>("/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${selectedKey.secret}` }, body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024" }) });
        setImageResults(result.data ?? []);
      } else {
        const task = await api<VideoTask>("/v1/videos", { method: "POST", headers: { Authorization: `Bearer ${selectedKey.secret}` }, body: JSON.stringify({ model, prompt, reference_file_ids: referenceFileIds }) });
        setTasks(current => [task, ...current]);
      }
      setPrompt(""); void loadRecords();
    } catch (cause) { setError(cause instanceof Error ? cause.message : (zh ? "生成失败，请重试。" : "Generation failed. Try again.")); }
    finally { setBusy(false); }
  };
  const fileUrl = (id: string) => `/api/workspaces/${workspaceId}/files/${encodeURIComponent(id)}/content?preview=1`;
  return <div className="flex flex-col gap-4">
    <div><h1 className="text-[22px] font-semibold">{zh ? "多媒体" : "Multimedia"}</h1><p className="mt-1 text-sm text-muted-foreground">{zh ? "生成图片和视频，并查看工作区内的生成结果。" : "Generate images and videos, then review workspace results."}</p></div>
    <div className="grid min-h-[680px] gap-4 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"><div className="flex flex-col gap-5 p-5">
        <div className="flex rounded-md border border-border bg-muted/40 p-1"><button type="button" className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium ${mode === "image" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setMode("image")}><ImageIcon className="mr-2 size-4" />{zh ? "图片生成" : "Image"}</button><button type="button" className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium ${mode === "video" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setMode("video")}><Video className="mr-2 size-4" />{zh ? "视频生成" : "Video"}</button></div>
        <label className="flex flex-col gap-1.5 text-sm font-medium"><span>{zh ? "API Key" : "API key"}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" value={keyId} onChange={event => setKeyId(event.target.value)}><option value="">{zh ? "选择 API Key" : "Select an API key"}</option>{keys.filter(key => key.enabled && (mode === "image" ? key.scopes.includes("image.generate") || key.scopes.includes("*") : key.scopes.includes("video.generate") || key.scopes.includes("*"))).map(key => <option key={key.id} value={key.id}>{key.name} · {key.secret.slice(0, 18)}…</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium"><span>{zh ? "模型" : "Model"}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" value={model} onChange={event => setModel(event.target.value)}>{models.map(value => <option key={value} value={value}>{value}</option>)}{!models.length && <option value="">{zh ? "请配置模型或手动输入" : "Configure a model first"}</option>}</select></label>
        {mode === "video" && <fieldset className="flex flex-col gap-2"><div className="flex items-center justify-between"><legend className="text-sm font-medium">{zh ? "参考图（可选）" : "Reference images (optional)"}</legend><label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"><Upload className="size-3.5" />{zh ? "上传图片" : "Upload image"}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !canUpload} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadReference(file); }} /></label></div>{records.filter(file => file.content_type.startsWith("image/")).length ? <div className="grid grid-cols-4 gap-2">{records.filter(file => file.content_type.startsWith("image/")).slice(0, 8).map(file => <button type="button" key={file.id} onClick={() => setReferenceFileIds(current => current.includes(file.id) ? current.filter(id => id !== file.id) : [...current, file.id].slice(-4))} className={`overflow-hidden rounded-md border-2 ${referenceFileIds.includes(file.id) ? "border-brand" : "border-border"}`} aria-pressed={referenceFileIds.includes(file.id)}><img src={`/api/workspaces/${workspaceId}/files/${encodeURIComponent(file.id)}/content?preview=1`} alt={file.filename} className="aspect-square size-full object-cover" /></button>)}</div> : <p className="text-xs text-muted-foreground">{zh ? "暂无图片，点击上传图片作为参考图。" : "No images yet. Upload one to use as a reference."}</p>}<p className="text-xs text-muted-foreground">{zh ? `已选择 ${referenceFileIds.length}/4 张` : `${referenceFileIds.length}/4 selected`}</p></fieldset>}
        <label className="flex flex-col gap-1.5 text-sm font-medium"><span>{zh ? "提示词" : "Prompt"}</span><textarea className="min-h-64 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 shadow-sm outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20" maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={mode === "image" ? (zh ? "描述你想生成的图片…" : "Describe the image you want…") : (zh ? "描述视频内容、镜头和动作…" : "Describe the video, camera and motion…")} /></label>
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{prompt.length}/4000</span><span>{mode === "video" ? (zh ? "视频生成将异步排队" : "Video generation is queued") : (zh ? "默认 1024 × 1024" : "Default 1024 × 1024")}</span></div>
        {error && <p className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
        <button className="mt-auto inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-transparent bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50" disabled={busy || !selectedKey || !model || !prompt.trim()} onClick={() => void generate()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}{busy ? (zh ? "生成中…" : "Generating…") : (zh ? "立即生成" : "Generate")}</button>
      </div></section>
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">{zh ? "队列与生成记录" : "Queue & generation history"}</h2><p className="mt-1 text-sm text-muted-foreground">{zh ? "最新任务显示在前面。" : "Latest activity appears first."}</p></div><button className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-transparent bg-transparent px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void loadRecords()}><RefreshCw className="size-4" />{zh ? "刷新" : "Refresh"}</button></div>
        {tasks.length > 0 && <div className="flex flex-col gap-2">{tasks.map(task => <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand-muted/30 p-3" key={task.id}><Loader2 className="size-4 animate-spin text-brand" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.model}</p><p className="text-xs text-muted-foreground">{zh ? "视频生成中" : "Video generation in progress"} · {task.status}</p></div></div>)}</div>}
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">{records.map(file => { const isVideo = file.content_type.startsWith("video/"); const url = fileUrl(file.id); return <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" key={file.id}><div className="aspect-video bg-muted">{isVideo ? <video className="size-full object-cover" src={url} controls preload="metadata" /> : <img className="size-full object-cover" src={url} alt={file.filename} loading="lazy" />}</div><div className="flex items-center gap-2 p-3"><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{new Date(file.created_at).toLocaleString(zh ? "zh-CN" : "en-US")}</span><a className="inline-flex size-7 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground" href={url} download={file.filename} aria-label={zh ? "下载" : "Download"}><Download className="size-3.5" /></a></div></article>; })}</div>
        {!records.length && !tasks.length && <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">{zh ? "还没有生成记录。提交第一个图片或视频任务吧。" : "No generation records yet. Submit your first image or video task."}</div>}
      </section>
    </div>
  </div>;
}

function useApiKeys(workspaceId: string): Key[] {
  const [keys, setKeys] = useState<Key[]>([]);
  useEffect(() => { void api<{ data: Key[] }>(`/api/workspaces/${workspaceId}/keys`).then(result => setKeys(result.data)).catch(() => setKeys([])); }, [workspaceId]);
  return keys;
}
