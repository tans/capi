"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

type M = { id: number; name: string; email: string; role: string; status: string };

export function MemberManager({ workspaceId, locale = "en", initial, canManage, canTransfer }: { workspaceId: number; locale?: Locale; initial: M[]; canManage: boolean; canTransfer?: boolean }) {
  const d = getDictionary(locale).dashboard.components.members;
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState(initial);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [notice, setNotice] = useState("");
  const [invites, setInvites] = useState<{ id: number; email: string; role: string; expiresAt: number }[]>([]);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/members`).then((response) => response.json()).then((data) => setInvites(data.invites ?? [])).catch(() => {});
  }, [workspaceId]);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError("");
    setInviteBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || d.addError);
      setInviteLink(`${location.origin}/${locale}/invite/accept?token=${data.token}`);
      setEmail("");
      setInviteOpen(false);
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : d.addError);
    } finally {
      setInviteBusy(false);
    }
  }

  async function transfer(member: M) {
    if (!confirm(d.transferConfirm)) return;
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transfer_owner" }) });
    if (response.ok) location.reload();
    else setError((await response.json()).error || d.transferError);
  }

  async function change(member: M, role?: string) {
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, { method: role ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" }, body: role ? JSON.stringify({ role }) : undefined });
    if (response.ok) {
      setNotice(role ? d.roleUpdated : d.removed);
      setRows(role ? rows.map((row) => row.id === member.id ? { ...row, role } : row) : rows.filter((row) => row.id !== member.id));
    } else setError((await response.json()).error || d.updateError);
  }

  return <div className="flex flex-col gap-5">
    {canManage && <div className="flex justify-end">
      <button className="btn btn-sm btn-primary" type="button" onClick={() => { setInviteError(""); setInviteOpen(true); }}>＋ {d.invite}</button>
      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!inviteBusy) { setInviteOpen(open); if (open) setInviteError(""); } }}>
        <DialogContent closeLabel={locale === "zh" ? "关闭" : "Close"}>
          <DialogHeader>
            <DialogTitle>{d.invite}</DialogTitle>
            <DialogDescription>{locale === "zh" ? "输入成员邮箱并选择工作区角色。" : "Enter a member's email and choose their workspace role."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={add} className="grid gap-4">
            <label className="form-control"><span className="label-text mb-2 text-sm">{d.emailPlaceholder}</span><input className="input input-bordered" type="email" placeholder={d.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={inviteBusy} autoFocus /></label>
            <label className="form-control"><span className="label-text mb-2 text-sm">{d.roleColumn}</span><select className="select select-bordered" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={inviteBusy}><option value="member">{d.member}</option><option value="admin">{d.admin}</option></select></label>
            {inviteError && <div className="alert alert-error py-2 text-sm" role="alert">{inviteError}</div>}
            <div className="flex justify-end gap-2"><button className="btn" type="button" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>{locale === "zh" ? "取消" : "Cancel"}</button><button className="btn btn-primary" type="submit" disabled={inviteBusy}>{inviteBusy ? (locale === "zh" ? "发送中…" : "Sending…") : d.invite}</button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>}
    {invites.length > 0 && <div className="rounded-box border border-dashed border-border p-4 text-sm"><div className="font-medium">{d.pending}</div>{invites.map((invite) => <div className="mt-2 flex justify-between" key={invite.id}><span>{invite.email} <span className="badge badge-ghost badge-xs">{invite.role}</span></span><span className="flex items-center gap-2 text-muted-foreground">{d.expires} {new Date(invite.expiresAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}{canManage && <button className="btn btn-xs btn-ghost text-error" type="button" onClick={async () => { await fetch(`/api/workspaces/${workspaceId}/invites/${invite.id}`, { method: "DELETE" }); setInvites(invites.filter((item) => item.id !== invite.id)); }}>{d.revoke}</button>}</span></div>)}</div>}
    {inviteLink && <div className="alert alert-success py-2 text-sm"><span>{d.inviteReady}</span><input className="input input-bordered input-xs flex-1" value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" className="btn btn-xs" onClick={async () => { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? d.copied : d.copy}</button></div>}
    {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
    {notice && <div className="alert alert-success py-2 text-sm">{notice}</div>}
    <div className="overflow-x-auto rounded-box border border-border bg-card"><table className="table"><thead><tr><th>{d.memberColumn}</th><th>{d.roleColumn}</th><th>{d.statusColumn}</th><th>{d.actionsColumn}</th></tr></thead><tbody>{rows.map((member) => <tr key={member.id}><td><b>{member.name}</b><div className="text-xs text-muted-foreground">{member.email}</div></td><td><span className="badge badge-ghost">{member.role}</span></td><td>{member.status}</td><td>{canManage && member.role !== "owner" && <div className="flex gap-2"><select className="select select-bordered select-xs" value={member.role} onChange={(event) => void change(member, event.target.value)}><option value="member">{d.member}</option><option value="admin">{d.admin}</option></select>{canTransfer && <button className="btn btn-xs btn-ghost" type="button" onClick={() => void transfer(member)}>{d.makeOwner}</button>}<button className="btn btn-xs btn-ghost text-error" type="button" onClick={() => { if (confirm(d.removeConfirm.replace("{email}", member.email))) void change(member); }}>{d.remove}</button></div>}</td></tr>)}</tbody></table></div>
  </div>;
}
