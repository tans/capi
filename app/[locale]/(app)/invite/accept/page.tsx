"use client";

import { useSearchParams, useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function InviteAcceptPage() {
  const params = useSearchParams();
  const router = useRouter();
  const routeParams = useParams<{ locale: string }>();
  const [state, setState] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) { setState("error"); setMessage("邀请链接无效或已过期"); return; }
    fetch("/api/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.workspaceId) throw new Error(data.error || "无法接受邀请");
        router.replace(`/${routeParams.locale || "zh"}/dashboard/w/${data.workspaceId}`);
      })
      .catch((error: unknown) => { setState("error"); setMessage(error instanceof Error ? error.message : "无法接受邀请"); });
  }, [params, router, routeParams.locale]);

  if (state === "loading") return <div className="mx-auto max-w-lg py-16"><div className="card border border-base-300 bg-base-100"><div className="card-body items-center text-center"><span className="loading loading-spinner loading-md" /><h1 className="text-xl font-semibold">正在加入团队空间</h1><p className="text-sm text-base-content/60">请稍候…</p></div></div></div>;
  return <div className="mx-auto max-w-lg py-16"><div className="card border border-error/30 bg-base-100"><div className="card-body items-center text-center"><h1 className="text-xl font-semibold">无法接受邀请</h1><p className="text-sm text-base-content/60">{message}</p><button className="btn btn-primary btn-sm" onClick={() => router.push(`/${routeParams.locale || "zh"}/dashboard`)}>返回控制台</button></div></div></div>;
}
