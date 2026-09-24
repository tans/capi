"use client";

import WorkspaceSecurityPage from "../security/page";
import WorkspaceSettings from "../settings/page";

/**
 * Keep routing controls and the audit view together so workspace operators
 * can enable JEV, configure model routing, and inspect its decisions from one
 * workspace menu entry.
 */
export default function WorkspaceRoutingSecurityPage() {
  return (
    <div className="flex flex-col gap-10">
      <WorkspaceSettings />
      <div className="border-t border-border pt-8">
        <WorkspaceSecurityPage />
      </div>
    </div>
  );
}
