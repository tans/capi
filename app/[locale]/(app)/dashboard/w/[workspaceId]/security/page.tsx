"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";

type Incident = {
  id: number;
  created_at: string;
  severity: "low" | "medium" | "high" | "critical";
  categories: string[];
  confidence: number;
  status: string;
  evidence: unknown;
};

type Decision = {
  id: number;
  created_at: string;
  route_intent: string | null;
  route_complexity: string | null;
  route_confidence: number | null;
  security_severity: string | null;
  can_view_text: boolean;
};

export default function WorkspaceSecurityPage() {
  const { workspaceId, locale } = useParams<{
    workspaceId: string;
    locale: Locale;
  }>();
  const t = getDictionary(locale).dashboard;
  const s = t.components.security;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [routingEnabled, setRoutingEnabled] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [openDecision, setOpenDecision] = useState<number | null>(null);
  const [decisionTexts, setDecisionTexts] = useState<Record<number, string>>({});
  const [loadingDecision, setLoadingDecision] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/workspaces/${workspaceId}/security/incidents`).then(
        (response) => response.json(),
      ),
      fetch(`/api/workspaces/${workspaceId}/security/decisions`).then(
        (response) => response.json(),
      ),
      fetch(`/api/workspaces/${workspaceId}`).then((response) =>
        response.json(),
      ),
    ]).then(([incidentData, decisionData, workspace]) => {
      setIncidents(incidentData.incidents ?? []);
      setDecisions(decisionData.decisions ?? []);
      setAuditEnabled(Boolean(workspace.jev?.securityAuditEnabled));
      setRoutingEnabled(Boolean(workspace.jev?.autoRoutingEnabled));
      setCanManage(workspace.role === "owner" || workspace.role === "admin");
    });
  }, [workspaceId]);

  async function toggleDecision(id: number) {
    if (openDecision === id) {
      setOpenDecision(null);
      return;
    }
    setOpenDecision(id);
    if (Object.hasOwn(decisionTexts, id)) return;
    setLoadingDecision(id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/security/decisions/${id}`);
      if (!response.ok) throw new Error("Failed to load decision text");
      const data = await response.json();
      setDecisionTexts((texts) => ({ ...texts, [id]: data.original_text }));
    } catch {
      setOpenDecision((current) => current === id ? null : current);
    } finally {
      setLoadingDecision((current) => current === id ? null : current);
    }
  }

  async function update(id: number, status: string) {
    if (!canManage) return;
    await fetch(`/api/workspaces/${workspaceId}/security/incidents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setIncidents((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  async function escalate(id: number) {
    if (!canManage) return;
    await fetch(`/api/workspaces/${workspaceId}/security/incidents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "reviewing", severity: "critical" }),
    });
    setIncidents((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, status: "reviewing", severity: "critical" }
          : item,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            {t.components.nav.routingSecurity}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {auditEnabled ? s.enabledDescription : s.disabledDescription}
          </p>
        </div>
        <span
          className={`badge badge-soft ${
            auditEnabled ? "badge-success" : "badge-ghost"
          }`}
        >
          {auditEnabled ? s.enabled : s.disabled}
        </span>
      </div>

      {!auditEnabled && (
        <div
          role="alert"
          className="alert alert-info alert-vertical sm:alert-horizontal"
        >
          <div>
            <h2 className="font-medium">{s.enableTitle}</h2>
            <p className="mt-1 text-sm">{s.enableDescription}</p>
          </div>
          {canManage ? (
            <Link
              className="btn btn-sm"
              href={localeHref(
                locale,
                `/dashboard/w/${workspaceId}/routing-security#jev-security-audit`,
              )}
            >
              {s.enableAudit}
            </Link>
          ) : (
            <span className="text-sm">{s.manageHint}</span>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold">{s.incidents}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.incidentsDescription}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>{s.time}</th>
                <th>{s.severity}</th>
                <th>{s.category}</th>
                <th>{s.confidence}</th>
                <th>{s.status}</th>
                <th>{s.action}</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    {new Date(incident.created_at).toLocaleString(
                      locale === "zh" ? "zh-CN" : "en-US",
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        incident.severity === "critical" ||
                        incident.severity === "high"
                          ? "badge-error"
                          : "badge-warning"
                      }`}
                    >
                      {incident.severity}
                    </span>
                  </td>
                  <td>{incident.categories.join(", ")}</td>
                  <td>{Math.round(incident.confidence * 100)}%</td>
                  <td>{incident.status}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        setOpen(open === incident.id ? null : incident.id)
                      }
                    >
                      {canManage
                        ? open === incident.id
                          ? s.hide
                          : s.evidence
                        : s.details}
                    </button>
                    {canManage && incident.status === "open" && (
                      <>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => void escalate(incident.id)}
                        >
                          {s.markCritical}
                        </button>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => void update(incident.id, "resolved")}
                        >
                          {s.resolve}
                        </button>
                      </>
                    )}
                    {open === incident.id && canManage && (
                      <pre className="mt-2 max-w-xs whitespace-pre-wrap text-xs">
                        {JSON.stringify(incident.evidence, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {s.incidentsEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[15px] font-semibold">{s.routeAnalysis}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {routingEnabled
                ? s.routeEnabledDescription
                : s.routeDisabledDescription}
            </p>
          </div>
          {!routingEnabled && canManage && (
            <Link
              className="link link-hover text-sm"
              href={localeHref(
                locale,
                `/dashboard/w/${workspaceId}/routing-security#jev-routing`,
              )}
            >
              {s.configureRouting}
            </Link>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>{s.time}</th>
                <th>{s.intent}</th>
                <th>{s.complexity}</th>
                <th>{s.confidence}</th>
                <th>{s.security}</th>
                <th>{s.requestText}</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((decision) => (
                <Fragment key={decision.id}>
                  <tr>
                    <td>
                      {new Date(decision.created_at).toLocaleString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}
                    </td>
                    <td>{decision.route_intent ?? "-"}</td>
                    <td>{decision.route_complexity ?? "-"}</td>
                    <td>
                      {decision.route_confidence == null
                        ? "-"
                        : `${Math.round(decision.route_confidence * 100)}%`}
                    </td>
                    <td>{decision.security_severity}</td>
                    <td>
                      {decision.can_view_text ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          aria-label={`${openDecision === decision.id ? s.hide : s.show} ${s.requestText}`}
                          aria-expanded={openDecision === decision.id}
                          onClick={() => void toggleDecision(decision.id)}
                        >
                          {openDecision === decision.id ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{s.hidden}</span>
                      )}
                    </td>
                  </tr>
                  {openDecision === decision.id && (
                    <tr>
                      <td colSpan={6} className="whitespace-pre-wrap break-all text-xs">
                        {loadingDecision === decision.id ? "…" : decisionTexts[decision.id]}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {decisions.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {s.decisionsEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
