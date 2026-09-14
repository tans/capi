"use client";
import { useState } from "react";
export function ChannelActions({workspaceId,channelId,status,name}:{workspaceId:number;channelId:number;status:number;name:string}) {
 const [editing,setEditing]=useState(false),[value,setValue]=useState(name),[error,setError]=useState("");
 async function act(method:string,body?:object){setError("");const r=await fetch(`/api/workspaces/${workspaceId}/channels${method==='DELETE'?`?id=${channelId}`:''}`,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify({id:channelId,...body}):undefined});if(!r.ok){setError((await r.json().catch(()=>({}))).error||"Unable to update channel");return}location.reload()}
 if(editing)return <div className="flex flex-wrap items-center gap-1"><input className="input input-bordered input-xs w-40" value={value} onChange={e=>setValue(e.target.value)} aria-label="Channel name"/><button className="btn btn-xs btn-primary" disabled={!value.trim()} onClick={()=>act("PATCH",{name:value.trim()})}>Save</button><button className="btn btn-xs btn-ghost" onClick={()=>setEditing(false)}>Cancel</button></div>;
 return <div className="flex flex-wrap items-center gap-1"><button className="btn btn-xs btn-ghost" onClick={()=>setEditing(true)}>Edit</button><button className="btn btn-xs btn-ghost" onClick={()=>act("PATCH",{status:status===1?3:1})}>{status===1?"Disable":"Enable"}</button><button className="btn btn-xs btn-ghost text-error" onClick={()=>{if(confirm("Delete this channel?"))act("DELETE")}}>Delete</button>{error&&<span className="text-xs text-error">{error}</span>}</div>
}
