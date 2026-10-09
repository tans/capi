"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Download, FlaskConical, LoaderCircle, Trash2, Upload, X } from "lucide-react";

import { api } from "@/api";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { Currency } from "@/lib/relay/currency";

type EvalRun = {
  id: string;
  kind: string;
  model: string;
  overall_score?: number;
  metrics: Record<string, any>;
  raw?: string;
  cost_micros: number;
  created_at: string;
};

type Props = {
  workspaceId: string;
  locale: Locale;
  currency: Currency;
  models: string[];
};

const money = (micros: number, currency: Currency) => `${currency.symbol}${(micros / 1_000_000).toFixed(4)}`;
const scoreText = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "—");
const timeText = (value: string, locale: Locale) => new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");

type PerfAttempt = { ttft_ms?: number; total_ms?: number; output_tokens?: number; tps?: number; error?: string; output?: string };
type IntelTask = { id: string; category: string; prompt: string; pass: boolean; detail?: string; output?: string };

function PerfMetrics({ perf, t }: { perf: any; t: any }) {
  const attempts: PerfAttempt[] = Array.isArray(perf?.attempts) ? perf.attempts : [];
  return <div className="flex flex-col gap-3">
    {perf?.avg_ttft_ms != null || perf?.avg_ms != null || perf?.avg_tps != null ? (
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="badge badge-ghost">{t.avg} TTFT {perf.avg_ttft_ms != null ? `${perf.avg_ttft_ms} ms` : "—"}</span>
        <span className="badge badge-ghost">{t.avg} {t.total} {perf.avg_ms != null ? `${perf.avg_ms} ms` : "—"}</span>
        <span className="badge badge-ghost">{t.avg} {t.tps} {perf.avg_tps != null ? perf.avg_tps : "—"}</span>
      </div>
    ) : null}
    <div className="overflow-x-auto"><table className="table table-sm">
      <thead><tr><th>#</th><th>{t.ttft}</th><th>{t.total}</th><th>{t.tps}</th><th>{t.tokens}</th><th>{t.error}</th></tr></thead>
      <tbody>{attempts.map((attempt, index) => (
        <tr key={index}>
          <td>{index + 1}</td>
          <td>{attempt.ttft_ms != null ? `${attempt.ttft_ms} ms` : "—"}</td>
          <td>{attempt.total_ms != null ? `${attempt.total_ms} ms` : "—"}</td>
          <td>{attempt.tps != null ? attempt.tps : "—"}</td>
          <td>{attempt.output_tokens != null ? attempt.output_tokens : "—"}</td>
          <td className="max-w-xs truncate text-error" title={attempt.error}>{attempt.error || "—"}</td>
        </tr>
      ))}</tbody>
    </table></div>
  </div>;
}

function IntelMetrics({ intel, t }: { intel: any; t: any }) {
  const tasks: IntelTask[] = Array.isArray(intel?.tasks) ? intel.tasks : [];
  const [open, setOpen] = useState<string | null>(null);
  return <div className="flex flex-col gap-3">
    {typeof intel?.passed === "number" ? <span className="badge badge-ghost">{t.score}: {intel.passed}/{intel.total}</span> : null}
    <div className="overflow-x-auto"><table className="table table-sm">
      <thead><tr><th>{t.task}</th><th>{t.category}</th><th>{t.result}</th><th>{t.detail}</th><th><span className="sr-only">·</span></th></tr></thead>
      <tbody>{tasks.map(task => (
        <FragmentRow key={task.id} task={task} t={t} open={open === task.id} onToggle={() => setOpen(open === task.id ? null : task.id)} />
      ))}</tbody>
    </table></div>
  </div>;
}

function FragmentRow({ task, t, open, onToggle }: { task: IntelTask; t: any; open: boolean; onToggle: () => void }) {
  return <>
    <tr>
      <td className="max-w-64 truncate" title={task.prompt}>{task.id}</td>
      <td>{task.category}</td>
      <td>{task.pass ? <span className="badge badge-success badge-soft">{t.pass}</span> : <span className="badge badge-error badge-soft">{t.fail}</span>}</td>
      <td className="max-w-xs truncate" title={task.detail}>{task.detail || "—"}</td>
      <td><button type="button" className="btn btn-ghost btn-xs" onClick={onToggle} aria-expanded={open}>{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
    </tr>
    {open && <tr><td colSpan={5} className="bg-base-200/50">
      <p className="mb-2 text-xs text-muted-foreground">{task.prompt}</p>
      <pre className="whitespace-pre-wrap rounded-box border border-border bg-base-100 p-3 text-xs">{task.output || "—"}</pre>
    </td></tr>}
  </>;
}

function ImportedMetrics({ metrics, raw }: { metrics: Record<string, any>; raw?: string }) {
  const entries = Object.entries(metrics ?? {}).filter(([key]) => key !== "taskSet");
  return <div className="flex flex-col gap-3">
    {entries.length ? <div className="overflow-x-auto"><table className="table table-sm">
      <thead><tr><th>Key</th><th>Value</th></tr></thead>
      <tbody>{entries.map(([key, value]) => (
        <tr key={key}><td className="whitespace-nowrap font-medium">{key}</td>
          <td className="whitespace-pre-wrap text-sm">{typeof value === "object" && value !== null ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-box border border-border bg-base-100 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre> : String(value)}</td></tr>
      ))}</tbody>
    </table></div> : <p className="text-sm text-muted-foreground">—</p>}
    {raw ? <a className="btn btn-outline btn-sm" href={`data:application/json;charset=utf-8,${encodeURIComponent(typeof raw === "string" ? raw : JSON.stringify(raw))}`} download="eval-raw.json"><Download className="size-4" /> Raw</a> : null}
  </div>;
}

export function WorkspaceModelEval({ workspaceId, locale, currency, models }: Props) {
  const t = getDictionary(locale).dashboard.workspace.modelEval;
  const [selected, setSelected] = useState<string[]>([]);
  const [perf, setPerf] = useState(true);
  const [intel, setIntel] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvalRun | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [importNotice, setImportNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await api<{ data: EvalRun[] }>(`/api/workspaces/${workspaceId}/model-eval`);
      setRuns(data.data);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.loadError);
    }
  }, [workspaceId]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const toggleModel = (model: string) => {
    setSelected(previous => previous.includes(model) ? previous.filter(value => value !== model) : [...previous, model].slice(0, 5));
  };

  const run = async () => {
    if (!selected.length || (!perf && !intel) || running) return;
    setRunning(true); setRunError("");
    try {
      await api(`/api/workspaces/${workspaceId}/model-eval/run`, { method: "POST", body: JSON.stringify({ models: selected, tasks: [perf ? "perf" : "", intel ? "intel" : ""] }) });
      window.dispatchEvent(new Event("capi:refresh"));
      await loadRuns();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : t.runError);
    } finally { setRunning(false); }
  };

  const expand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null); setDetail(null);
      return;
    }
    setExpandedId(id); setDetail(null);
    try {
      const data = await api<{ data: EvalRun }>(`/api/workspaces/${workspaceId}/model-eval/${encodeURIComponent(id)}`);
      setDetail(data.data);
    } catch (error) {
      setDetail({ id, kind: "", model: "", metrics: {}, cost_micros: 0, created_at: "" });
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/workspaces/${workspaceId}/model-eval/${encodeURIComponent(id)}`, { method: "DELETE" });
      window.dispatchEvent(new Event("capi:refresh"));
      await loadRuns();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : t.loadError);
    }
  };

  const toggleCompare = (id: string) => {
    setCompare(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id].slice(-2));
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setImportNotice("");
    try {
      const parsed = JSON.parse(await file.text());
      await api(`/api/workspaces/${workspaceId}/model-eval`, { method: "POST", body: JSON.stringify(parsed) });
      setImportNotice(t.importOk);
      window.dispatchEvent(new Event("capi:refresh"));
      await loadRuns();
    } catch (error) {
      setImportNotice(error instanceof Error ? error.message : t.importError);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const compared = runs ? compare.map(id => runs.find(run => run.id === id)).filter((run): run is EvalRun => Boolean(run)) : [];
  const comparable = compared.length === 2 && compared[0].kind === compared[1].kind;

  const renderMetrics = (run: EvalRun) => {
    if (run.kind === "capi") {
      return <div className="flex flex-col gap-6">
        {run.metrics.perf ? <section><h3 className="mb-2 text-sm font-medium">{t.perf}</h3><PerfMetrics perf={run.metrics.perf} t={t.perfColumns} /></section> : null}
        {run.metrics.intel ? <section><h3 className="mb-2 text-sm font-medium">{t.intel}</h3><IntelMetrics intel={run.metrics.intel} t={t} /></section> : null}
      </div>;
    }
    return <ImportedMetrics metrics={run.metrics} raw={run.raw} />;
  };

  return <div className="flex flex-col gap-6">
    <section className="flex flex-col gap-4 rounded-box border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-sm font-medium">{t.models}</p>
          {models.length ? <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {models.map(model => (
              <button key={model} type="button" onClick={() => toggleModel(model)} aria-pressed={selected.includes(model)}
                className={`badge cursor-pointer ${selected.includes(model) ? "badge-primary" : "badge-ghost border border-border"}`}>
                {selected.includes(model) ? <Check className="size-3" /> : null}{model}
              </button>
            ))}
          </div> : <p className="text-sm text-muted-foreground">{t.noModels}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm" checked={perf} onChange={event => setPerf(event.target.checked)} />
            <span>{t.perf}</span><span className="text-xs text-muted-foreground">{t.perfHint}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm" checked={intel} onChange={event => setIntel(event.target.checked)} />
            <span>{t.intel}</span><span className="text-xs text-muted-foreground">{t.intelHint}</span>
          </label>
          <button type="button" className="btn btn-primary btn-sm mt-1" disabled={running || !selected.length || (!perf && !intel)} onClick={() => void run()}>
            {running ? <LoaderCircle className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
            {running ? t.running : t.run}
          </button>
        </div>
      </div>
      {runError && <div role="alert" className="alert alert-error text-sm">{runError}</div>}
    </section>

    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t.history}</h2>
        <span className="text-sm text-muted-foreground">{t.compareHint}</span>
      </div>
      {loadError && <div role="alert" className="alert alert-error text-sm">{loadError}</div>}
      {runs && runs.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t.noRuns}</p>}
      {runs && runs.length > 0 && <div className="overflow-hidden rounded-box border border-border bg-card">
        <div className="overflow-x-auto"><table className="table table-sm">
          <thead><tr>
            <th><span className="sr-only">{t.compare}</span></th>
            <th>{t.kind}</th><th>{t.model}</th><th>{t.score}</th><th>{t.cost}</th><th>{t.when}</th>
            <th><span className="sr-only">·</span></th><th><span className="sr-only">{t.delete}</span></th>
          </tr></thead>
          <tbody>{runs.map(run => (
            <Fragment key={run.id}>
              <tr key={run.id}>
                <td><input type="checkbox" className="checkbox checkbox-sm" checked={compare.includes(run.id)} onChange={() => toggleCompare(run.id)} aria-label={`${t.compare} ${run.id}`} /></td>
                <td><span className={`badge badge-soft ${run.kind === "capi" ? "badge-primary" : "badge-info"}`}>{run.kind}</span></td>
                <td className="max-w-48 truncate font-medium" title={run.model}>{run.model}</td>
                <td>{scoreText(run.overall_score)}</td>
                <td>{run.cost_micros > 0 ? money(run.cost_micros, currency) : "—"}</td>
                <td className="whitespace-nowrap text-muted-foreground">{timeText(run.created_at, locale)}</td>
                <td><button type="button" className="btn btn-ghost btn-xs" onClick={() => void expand(run.id)} aria-expanded={expandedId === run.id}>{expandedId === run.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                <td><button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => void remove(run.id)} aria-label={`${t.delete} ${run.id}`}><Trash2 className="size-4" /></button></td>
              </tr>
              {expandedId === run.id && <tr key={`${run.id}-detail`}><td colSpan={8} className="bg-base-200/40 p-4">
                {detail ? renderMetrics(detail) : <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t.loading}</div>}
              </td></tr>}
            </Fragment>
          ))}</tbody>
        </table></div>
      </div>}
    </section>

    {comparable && <section className="rounded-box border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t.compare}</h2>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCompare([])} aria-label={t.clearCompare}><X className="size-4" /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{compared.map(run => (
        <div key={run.id} className="rounded-box border border-border p-4">
          <p className="mb-2 truncate font-medium" title={run.model}>{run.model}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t.score}</dt><dd>{scoreText(run.overall_score)}</dd>
            <dt className="text-muted-foreground">{t.cost}</dt><dd>{run.cost_micros > 0 ? money(run.cost_micros, currency) : "—"}</dd>
            {run.kind === "capi" && run.metrics.perf ? <>
              <dt className="text-muted-foreground">TTFT</dt><dd>{run.metrics.perf.avg_ttft_ms != null ? `${run.metrics.perf.avg_ttft_ms} ms` : "—"}</dd>
              <dt className="text-muted-foreground">{t.perfColumns.total}</dt><dd>{run.metrics.perf.avg_ms != null ? `${run.metrics.perf.avg_ms} ms` : "—"}</dd>
              <dt className="text-muted-foreground">{t.perfColumns.tps}</dt><dd>{run.metrics.perf.avg_tps != null ? run.metrics.perf.avg_tps : "—"}</dd>
            </> : null}
            {run.kind === "capi" && run.metrics.intel ? <><dt className="text-muted-foreground">{t.intelTasks}</dt><dd>{run.metrics.intel.passed}/{run.metrics.intel.total}</dd></> : null}
            {run.kind !== "capi" ? Object.entries(run.metrics).filter(([key]) => key !== "taskSet" && typeof run.metrics[key] !== "object").slice(0, 8).map(([key, value]) => (
              <Fragment key={key}><dt className="text-muted-foreground">{key}</dt><dd>{String(value)}</dd></Fragment>
            )) : null}
          </dl>
        </div>
      ))}</div>
    </section>}

    <section className="flex flex-col gap-2 rounded-box border border-border bg-card p-5">
      <h2 className="font-semibold">{t.import}</h2>
      <p className="text-sm text-muted-foreground">{t.importHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={event => void importFile(event.target.files?.[0])} />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Upload className="size-4" />{t.importButton}</button>
        {importNotice && <span role={importNotice === t.importOk ? "status" : "alert"} className="text-sm">{importNotice}</span>}
      </div>
    </section>
  </div>;
}
