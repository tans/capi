"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

type M = { id: string; name: string; email: string; role: string; status: string };

export function MemberManager({ workspaceId, locale = "en", initial, initialInvites, canManage, canTransfer }: { workspaceId: string; locale?: Locale; initial: M[]; initialInvites: { id: string; email: string; role: string; expiresAt: number }[]; canManage: boolean; canTransfer?: boolean }) {
  const d = getDictionary(locale).dashboard.components.members;
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState(initial);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [busyMembers, setBusyMembers] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [notice, setNotice] = useState("");
  const [invites, setInvites] = useState(initialInvites);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    setInviteBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || d.addError);
      setInviteLink(`${location.origin}/${locale}/invite/accept?token=${data.token}`);
      setInvites((current) => [{ id: data.id, email, role: inviteRole, expiresAt: data.expiresAt }, ...current.filter((invite) => invite.email.toLowerCase() !== email.trim().toLowerCase())]);
      setEmail("");
      setInviteOpen(false);
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : d.addError);
    } finally {
      setInviteBusy(false);
    }
  }

  async function transfer(member: M) {
    if (transferBusy || !confirm(d.transferConfirm)) return;
    setTransferBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transfer_owner" }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message || result.error || d.transferError); }
      location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : d.transferError);
      setTransferBusy(false);
    }
  }

  async function change(member: M, role?: string) {
    if (busyMembers.includes(member.id)) return;
    setBusyMembers((current) => [...current, member.id]);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, { method: role ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" }, body: role ? JSON.stringify({ role }) : undefined });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message || result.error || d.updateError); }
      setNotice(role ? d.roleUpdated : d.removed);
      setRows((current) => role ? current.map((row) => row.id === member.id ? { ...row, role } : row) : current.filter((row) => row.id !== member.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : d.updateError);
    } finally {
      setBusyMembers((current) => current.filter((id) => id !== member.id));
    }
  }

  return <div className="flex flex-col gap-5">
    {canManage && <div className="flex justify-end">
      <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-8 px-3 border-transparent bg-brand text-brand-foreground hover:bg-brand-hover" type="button" onClick={() => { setInviteError(""); setInviteOpen(true); }}>＋ {d.invite}</button>
      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!inviteBusy) { setInviteOpen(open); if (open) setInviteError(""); } }}>
        <DialogContent closeLabel={locale === "zh" ? "关闭" : "Close"}>
          <DialogHeader>
            <DialogTitle>{d.invite}</DialogTitle>
            <DialogDescription>{locale === "zh" ? "输入成员邮箱并选择工作区角色。" : "Enter a member's email and choose their workspace role."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={add} className="grid gap-4">
            <label className="form-control"><span className="label-text mb-2 text-sm">{d.emailPlaceholder}</span><input className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm" type="email" placeholder={d.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={inviteBusy} autoFocus /></label>
            <label className="form-control"><span className="label-text mb-2 text-sm">{d.roleColumn}</span><select className="h-9 w-full rounded-sm border border-input bg-background px-3 text-sm" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={inviteBusy}><option value="member">{d.member}</option><option value="admin">{d.admin}</option></select></label>
            {inviteError && <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm border-error/30 bg-error/5 text-error" role="alert">{inviteError}</div>}
            <div className="flex justify-end gap-2"><button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50" type="button" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>{locale === "zh" ? "取消" : "Cancel"}</button><button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 border-transparent bg-brand text-brand-foreground hover:bg-brand-hover" type="submit" disabled={inviteBusy}>{inviteBusy ? (locale === "zh" ? "发送中…" : "Sending…") : d.invite}</button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>}
    {invites.length > 0 && <div className="rounded-lg border border-dashed border-border p-4 text-sm"><div className="font-medium">{d.pending}</div>{invites.map((invite) => <div className="mt-2 flex justify-between" key={invite.id}><span>{invite.email} <span className="inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium border-border bg-transparent text-[10px] px-1.5">{invite.role}</span></span><span className="flex items-center gap-2 text-muted-foreground">{d.expires} {new Date(invite.expiresAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}{canManage && <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent text-error" type="button" onClick={async () => { try { const response = await fetch(`/api/workspaces/${workspaceId}/invites/${invite.id}`, { method: "DELETE" }); if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message || d.updateError); } setInvites((current) => current.filter((item) => item.id !== invite.id)); } catch (cause) { setError(cause instanceof Error ? cause.message : d.updateError); } }}>{d.revoke}</button>}</span></div>)}</div>}
    {inviteLink && <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm border-success/30 bg-success/5 text-success"><span>{d.inviteReady}</span><input className="h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm h-7 text-xs flex-1" value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setError(d.copyError); } }}>{copied ? d.copied : d.copy}</button></div>}
    {error && <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm border-error/30 bg-error/5 text-error">{error}</div>}
    {notice && <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm border-success/30 bg-success/5 text-success">{notice}</div>}
    <div className="overflow-x-auto rounded-lg border border-border bg-card"><table className="w-full border-collapse"><thead><tr><th>{d.memberColumn}</th><th>{d.roleColumn}</th><th>{d.statusColumn}</th><th>{d.actionsColumn}</th></tr></thead><tbody>{rows.map((member) => <tr key={member.id}><td><b>{member.name}</b><div className="text-xs text-muted-foreground">{member.email}</div></td><td><span className="inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium border-border bg-transparent">{member.role}</span></td><td>{member.status}</td><td>{canManage && member.role !== "owner" && <div className="flex gap-2"><select className="h-9 w-full rounded-sm border border-input bg-background px-3 text-sm select-xs" value={member.role} disabled={busyMembers.includes(member.id)} onChange={(event) => void change(member, event.target.value)}><option value="member">{d.member}</option><option value="admin">{d.admin}</option></select>{canTransfer && <button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent" type="button" disabled={transferBusy} onClick={() => void transfer(member)}>{d.makeOwner}</button>}<button className="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 h-7 px-2 text-xs border-transparent bg-transparent text-error" type="button" disabled={busyMembers.includes(member.id)} onClick={() => { if (confirm(d.removeConfirm.replace("{email}", member.email))) void change(member); }}>{d.remove}</button></div>}</td></tr>)}</tbody></table></div>
  </div>;
}
