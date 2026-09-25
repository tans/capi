"use client";

import WorkspaceJevControls from "@/components/dashboard/jev-controls";
import WorkspaceSecurityPage from "../security/page";

export default function WorkspaceRoutingSecurityPage() {
  return (
    <div className="flex flex-col gap-10">
      <WorkspaceJevControls />
      <div className="border-t border-border pt-8">
        <WorkspaceSecurityPage />
      </div>
    </div>
  );
}
