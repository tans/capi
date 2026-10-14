import { useEffect, useMemo, useState } from "react";
import { Download, Image as ImageIcon, Loader2, Play, RefreshCw, Video } from "lucide-react";
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
  const [mode, setMode] = useState<"image" | "video">("image");
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

  useEffect(() => { if (!keyId && keys[0]) setKeyId(keys[0].id); }, [keyId, keys]);
  useEffect(() => { if (!model && models[0]) setModel(models[0]); }, [model, models]);
  const loadRecords = async () => {
    try { const result = await api<FilesResponse>(`/api/workspaces/${workspaceId}/files?pageSize=100`); setRecords(result.data.filter(file => file.purpose === "generated_image" || file.purpose === "generated_video")); } catch { /* the main form remains usable */ }
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
      <section className="card card-border rounded-xl bg-card"><div className="card-body gap-5 p-5">
        <div className="tabs tabs-boxed bg-muted/50"><button className={`tab ${mode === "image" ? "tab-active" : ""}`} onClick={() => setMode("image")}><ImageIcon className="mr-2 size-4" />{zh ? "图片生成" : "Image"}</button><button className={`tab ${mode === "video" ? "tab-active" : ""}`} onClick={() => setMode("video")}><Video className="mr-2 size-4" />{zh ? "视频生成" : "Video"}</button></div>
        <label className="flex flex-col gap-1.5 text-sm font-medium"><span>{zh ? "API Key" : "API key"}</span><select className="select select-bordered h-10 w-full text-sm" value={keyId} onChange={event => setKeyId(event.target.value)}><option value="">{zh ? "选择 API Key" : "Select an API key"}</option>{keys.filter(key => key.enabled && (mode === "image" ? key.scopes.includes("image.generate") || key.scopes.includes("*") : key.scopes.includes("video.generate") || key.scopes.includes("*"))).map(key => <option key={key.id} value={key.id}>{key.name} · {key.secret.slice(0, 18)}…</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium"><span>{zh ? "模型" : "Model"}</span><select className="select select-bordered h-10 w-full text-sm" value={model} onChange={event => setModel(event.target.value)}>{models.map(value => <option key={value} value={value}>{value}</option>)}{!models.length && <option value="">{zh ? "请配置模型或手动输入" : "Configure a model first"}</option>}</select></label>
        {mode === "video" && <fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">{zh ? "参考图（可选）" : "Reference images (optional)"}</legend>{records.filter(file => file.content_type.startsWith("image/")).length ? <div className="grid grid-cols-4 gap-2">{records.filter(file => file.content_type.startsWith("image/")).slice(0, 8).map(file => <button type="button" key={file.id} onClick={() => setReferenceFileIds(current => current.includes(file.id) ? current.filter(id => id !== file.id) : [...current, file.id].slice(-4))} className={`overflow-hidden rounded-md border-2 ${referenceFileIds.includes(file.id) ? "border-brand" : "border-border"}`} aria-pressed={referenceFileIds.includes(file.id)}><img src={`/api/workspaces/${workspaceId}/files/${encodeURIComponent(file.id)}/content?preview=1`} alt={file.filename} className="aspect-square size-full object-cover" /></button>)}</div> : <p className="text-xs text-muted-foreground">{zh ? "暂无可用图片，请先在文件中上传。" : "No images available. Upload one in Files first."}</p>}</fieldset>}
        <label className="flex flex-col gap-1.5 text-sm font-medium"><span>{zh ? "提示词" : "Prompt"}</span><textarea className="textarea textarea-bordered min-h-64 w-full resize-y text-sm leading-6" maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={mode === "image" ? (zh ? "描述你想生成的图片…" : "Describe the image you want…") : (zh ? "描述视频内容、镜头和动作…" : "Describe the video, camera and motion…")} /></label>
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{prompt.length}/4000</span><span>{mode === "video" ? (zh ? "视频生成将异步排队" : "Video generation is queued") : (zh ? "默认 1024 × 1024" : "Default 1024 × 1024")}</span></div>
        {error && <p className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error" role="alert">{error}</p>}
        <button className="btn btn-primary mt-auto w-full" disabled={busy || !selectedKey || !model || !prompt.trim()} onClick={() => void generate()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}{busy ? (zh ? "生成中…" : "Generating…") : (zh ? "立即生成" : "Generate")}</button>
      </div></section>
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">{zh ? "队列与生成记录" : "Queue & generation history"}</h2><p className="mt-1 text-sm text-muted-foreground">{zh ? "最新任务显示在前面。" : "Latest activity appears first."}</p></div><button className="btn btn-ghost btn-sm" onClick={() => void loadRecords()}><RefreshCw className="size-4" />{zh ? "刷新" : "Refresh"}</button></div>
        {tasks.length > 0 && <div className="flex flex-col gap-2">{tasks.map(task => <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand-muted/30 p-3" key={task.id}><Loader2 className="size-4 animate-spin text-brand" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.model}</p><p className="text-xs text-muted-foreground">{zh ? "视频生成中" : "Video generation in progress"} · {task.status}</p></div></div>)}</div>}
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">{records.map(file => { const isVideo = file.content_type.startsWith("video/"); const url = fileUrl(file.id); return <article className="card card-border overflow-hidden rounded-xl bg-card" key={file.id}><div className="aspect-video bg-muted">{isVideo ? <video className="size-full object-cover" src={url} controls preload="metadata" /> : <img className="size-full object-cover" src={url} alt={file.filename} loading="lazy" />}</div><div className="flex items-center gap-2 p-3"><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{new Date(file.created_at).toLocaleString(zh ? "zh-CN" : "en-US")}</span><a className="btn btn-ghost btn-xs" href={url} download={file.filename} aria-label={zh ? "下载" : "Download"}><Download className="size-3.5" /></a></div></article>; })}</div>
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
