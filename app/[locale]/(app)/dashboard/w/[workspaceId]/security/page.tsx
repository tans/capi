"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

type Incident = { id: number; request_id: string; severity: string; categories: string[]; status: string; detector: string; confidence: number; evidence: Record<string, unknown> | null; created_at: number };
type Decision = { id: number; request_id: string; original_text: string | null; route_intent: string | null; route_complexity: string | null; route_confidence: number | null; security_severity: string; quota_units: number; created_at: number };

export default function WorkspaceSecurityPage() {
  const { workspaceId, locale } = useParams<{ workspaceId: string; locale: Locale }>();
  const t = getDictionary(locale).dashboard;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([fetch(`/api/workspaces/${workspaceId}/security/incidents`).then((response) => response.json()), fetch(`/api/workspaces/${workspaceId}/security/decisions`).then((response) => response.json()), fetch(`/api/workspaces/${workspaceId}`).then((response) => response.json())]).then(([incidentData, decisionData, workspace]) => {
      setIncidents(incidentData.incidents ?? []); setDecisions(decisionData.decisions ?? []); setEnabled(Boolean(workspace.jev?.securityAuditEnabled)); setCanManage(workspace.role === "owner" || workspace.role === "admin");
    });
  }, [workspaceId]);

  async function update(id: number, status: string) {
    if (!canManage) return;
    await fetch(`/api/workspaces/${workspaceId}/security/incidents`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setIncidents((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }

  async function escalate(id: number) {
    if (!canManage) return;
    await fetch(`/api/workspaces/${workspaceId}/security/incidents`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "reviewing", severity: "critical" }) });
    setIncidents((items) => items.map((item) => item.id === id ? { ...item, status: "reviewing", severity: "critical" } : item));
  }

  return <div className="flex flex-col gap-6"><div><h1 className="text-[22px] font-semibold tracking-tight">{t.components.nav.securityAudit}</h1><p className="mt-1 text-sm text-muted-foreground">{enabled ? "Input-only JEV audit for chat and responses." : "JEV security audit is disabled for this workspace."}</p></div><section className="overflow-hidden rounded-md border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="text-[15px] font-semibold">Security incidents</h2><p className="mt-1 text-xs text-muted-foreground">All members can see the list. Only owners and admins can expand evidence.</p></div><div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>Time</th><th>Severity</th><th>Category</th><th>Confidence</th><th>Status</th><th>Action</th></tr></thead><tbody>{incidents.map((incident) => <tr key={incident.id}><td>{new Date(incident.created_at).toLocaleString()}</td><td><span className={`badge ${incident.severity === "critical" || incident.severity === "high" ? "badge-error" : "badge-warning"}`}>{incident.severity}</span></td><td>{incident.categories.join(", ")}</td><td>{Math.round(incident.confidence * 100)}%</td><td>{incident.status}</td><td><button className="btn btn-ghost btn-xs" onClick={() => setOpen(open === incident.id ? null : incident.id)}>{canManage ? (open === incident.id ? "Hide" : "Evidence") : "Details"}</button>{canManage && incident.status === "open" && <><button className="btn btn-ghost btn-xs" onClick={() => void escalate(incident.id)}>Critical</button><button className="btn btn-ghost btn-xs" onClick={() => void update(incident.id, "resolved")}>Resolve</button></>}{open === incident.id && canManage && <pre className="mt-2 max-w-xs whitespace-pre-wrap text-xs">{JSON.stringify(incident.evidence, null, 2)}</pre>}</td></tr>)}{incidents.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No incidents recorded.</td></tr>}</tbody></table></div></section><section className="overflow-hidden rounded-md border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="text-[15px] font-semibold">Route analysis</h2><p className="mt-1 text-xs text-muted-foreground">Recent decisions are retained for 90 days. Aggregates are retained longer.</p></div><div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>Time</th><th>Intent</th><th>Complexity</th><th>Confidence</th><th>Security</th><th>Request text</th></tr></thead><tbody>{decisions.map((decision) => <tr key={decision.id}><td>{new Date(decision.created_at).toLocaleString()}</td><td>{decision.route_intent ?? "-"}</td><td>{decision.route_complexity ?? "-"}</td><td>{decision.route_confidence == null ? "-" : `${Math.round(decision.route_confidence * 100)}%`}</td><td>{decision.security_severity}</td><td className="max-w-md whitespace-pre-wrap text-xs">{decision.original_text ?? "Hidden"}</td></tr>)}{decisions.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No JEV decisions recorded.</td></tr>}</tbody></table></div></section></div>;
}
