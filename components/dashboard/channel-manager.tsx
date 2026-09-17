"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChannelEditorPanel, type ChannelDiscoveryRequest, type ChannelSubmit } from "@/components/dashboard/channel-editor";
import type { ChannelDraft } from "@/lib/relay/channel-draft";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type Props = {
  workspaceId: number;
  canManage: boolean;
  allowPlatformChannels: boolean;
  locale: Locale;
  channels: ChannelDraft[];
};

export function ChannelManager({ workspaceId, canManage, allowPlatformChannels, locale, channels }: Props) {
  const d = getDictionary(locale).dashboard.components.channels;
  const editor = getDictionary(locale).dashboard.components.channelEditor;
  const t = getDictionary(locale).dashboard.workspace.channels;
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(allowPlatformChannels);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ChannelDraft | null>(null);

  async function request(path: string, method: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return;
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.error === "string" ? payload.error : d.updateError);
  }

  async function updateDefaultChannel(next: boolean) {
    setError("");
    setEnabled(next);
    try {
      await request(`/api/workspaces/${workspaceId}`, "PATCH", { allowPlatformChannels: next });
    } catch (cause) {
      setEnabled(!next);
      setError(cause instanceof Error ? cause.message : d.updateError);
    }
  }

  const endpoint = `/api/workspaces/${workspaceId}/channels`;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium">{d.defaultTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{d.defaultDescription}</p>
          </div>
          {canManage && (
            <Switch
              checked={enabled}
              onCheckedChange={(next) => void updateDefaultChannel(next)}
              aria-label={d.enable}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{enabled ? d.enabled : d.disabled}</p>
      </section>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-medium">{t.myChannels}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.myChannelsDescription}</p>
          </div>
          {canManage && (
            <Button variant="brand" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4" />
              {editor.addTitle}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.upstream}</th>
                <th>{t.models}</th>
                <th>{t.status}</th>
                {canManage && <th className="text-right">{t.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id}>
                  <td className="font-medium">
                    {channel.name}
                    {channel.tag && <span className="badge badge-outline badge-sm ml-2 font-mono text-[10px]">{channel.tag}</span>}
                  </td>
                  <td className="max-w-64 truncate font-mono text-xs">{new URL(channel.baseUrl).host}</td>
                  <td className="text-xs">{channel.models.length ? channel.models.join(", ") : "—"}</td>
                  <td>
                    <span className={cn("badge badge-outline", channel.status === 1 ? "badge-success" : channel.status === 2 ? "badge-warning" : "")}>
                      {channel.status === 1 ? t.enabled : channel.status === 2 ? t.autoDisabled : t.disabled}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" className="btn btn-xs btn-ghost" onClick={() => { setEditing(channel); setOpen(true); }}>{editor.editTitle}</button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={async () => {
                            setError("");
                            try {
                              await request(endpoint, "PATCH", { id: channel.id, status: channel.status === 1 ? 3 : 1 });
                              router.refresh();
                            } catch (cause) {
                              setError(cause instanceof Error ? cause.message : d.updateError);
                            }
                          }}
                        >
                          {channel.status === 1 ? editor.disableChannel : editor.enableChannel}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!channels.length && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="py-10 text-center text-sm text-muted-foreground">{t.empty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ChannelEditorPanel
        open={open}
        onOpenChange={setOpen}
        locale={locale}
        initial={editing}
        onSubmit={async (payload: ChannelSubmit) => {
          await request(endpoint, editing ? "PATCH" : "POST", editing ? { id: editing.id, ...payload } : payload);
          router.refresh();
        }}
        discover={async (input: ChannelDiscoveryRequest) => {
          const response = await fetch(`${endpoint}/models`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : d.updateError);
          return payload.data as string[];
        }}
        onDeleted={async () => {
          await request(`${endpoint}?id=${editing?.id}`, "DELETE");
          router.refresh();
        }}
      />
    </div>
  );
}
