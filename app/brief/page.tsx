"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type BriefingItem={id:string;title:string;content?:string|null;category:string;priority:number};
type OngoingItem={id:string;title:string;status:string;follow_up_at?:string|null;due_at?:string|null;updated_at:string};
type ProjectItem={id:string;title:string;status:string;next_step?:string|null;due_at?:string|null;updated_at:string};

function localDateString(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function shortDate(value?:string|null){if(!value)return "";const d=new Date(value);if(Number.isNaN(d.getTime()))return "";return d.toLocaleDateString("sv-SE",{day:"numeric",month:"short"});}
function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d.getTime();}
function daysFromToday(value?:string|null){if(!value)return null;const d=new Date(value);if(Number.isNaN(d.getTime()))return null;d.setHours(0,0,0,0);return Math.round((d.getTime()-startOfToday())/86400000);}
function dateBadge(value?:string|null){const days=daysFromToday(value);if(days===null)return "";if(days<0)return `FÖRSENAD ${Math.abs(days)}d`;if(days===0)return "IDAG";if(days===1)return "IMORGON";return shortDate(value).toUpperCase();}
function ageDays(value:string){const d=new Date(value);if(Number.isNaN(d.getTime()))return 0;return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}

export default function BriefPage(){
  const [briefing,setBriefing]=useState<BriefingItem[]>([]);
  const [ongoing,setOngoing]=useState<OngoingItem[]>([]);
  const [projects,setProjects]=useState<ProjectItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{(async()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){setError("Logga in i Rogge Hub först.");setLoading(false);return;}
    const today=localDateString();
    const [b,o,p]=await Promise.all([
      supabase.from("briefing_items").select("id,title,content,category,priority").eq("briefing_date",today).eq("is_done",false).order("priority",{ascending:true}).limit(8),
      supabase.from("ongoing").select("id,title,status,follow_up_at,due_at,updated_at").in("status",["open","waiting"]).order("updated_at",{ascending:false}).limit(30),
      supabase.from("projects").select("id,title,status,next_step,due_at,updated_at").in("status",["active","waiting"]).order("updated_at",{ascending:false}).limit(20),
    ]);
    const first=b.error||o.error||p.error;
    if(first){setError(first.message);setLoading(false);return;}
    setBriefing((b.data??[]) as BriefingItem[]);setOngoing((o.data??[]) as OngoingItem[]);setProjects((p.data??[]) as ProjectItem[]);setLoading(false);
  })();},[]);

  const top=useMemo(()=>{
    const rows=[...briefing.map(x=>({title:x.title,score:x.priority})),...ongoing.slice(0,5).map((x,i)=>({title:x.title,score:10+i})),...projects.filter(x=>x.next_step).slice(0,5).map((x,i)=>({title:x.next_step as string,score:20+i}))];
    return rows.filter((x,i,a)=>a.findIndex(y=>y.title===x.title)===i).sort((a,b)=>a.score-b.score).slice(0,3);
  },[briefing,ongoing,projects]);

  const waiting=ongoing
    .filter(x=>x.status==="waiting")
    .sort((a,b)=>{
      const ad=a.follow_up_at||a.due_at; const bd=b.follow_up_at||b.due_at;
      if(ad&&bd)return new Date(ad).getTime()-new Date(bd).getTime();
      if(ad)return -1;if(bd)return 1;
      return new Date(a.updated_at).getTime()-new Date(b.updated_at).getTime();
    }).slice(0,6);

  const followUps=ongoing.filter(x=>x.follow_up_at).sort((a,b)=>new Date(a.follow_up_at as string).getTime()-new Date(b.follow_up_at as string).getTime()).slice(0,5);

  const risk=ongoing
    .filter(x=>x.status==="open"&&!x.follow_up_at&&!x.due_at)
    .sort((a,b)=>new Date(a.updated_at).getTime()-new Date(b.updated_at).getTime())
    .slice(0,6);

  const blockedProjects=projects.filter(x=>x.status==="waiting").slice(0,5);
  const startWith=top[0]?.title??"Ingen tydlig förstauppgift ännu — lägg in dagens viktigaste sak.";

  return <main style={{minHeight:"100vh",background:"#090b0e",color:"#fff",padding:20}}><div style={{maxWidth:760,margin:"0 auto"}}>
    <a href="/Olle-pwa-/" style={{color:"#d9dde1",textDecoration:"none"}}>← Rogge Hub</a>
    <section style={{marginTop:18,padding:22,borderRadius:28,border:"1px solid #2d333a",background:"linear-gradient(150deg,#171a1f,#0d0f12)"}}>
      <div style={{fontSize:11,letterSpacing:".22em",fontWeight:800,color:"#cbd1d8"}}>O.L.L.E. · DAGENS BRIEF</div>
      <h1 style={{margin:"10px 0 6px",fontSize:30}}>God morgon, Rogge.</h1>
      <p style={{margin:0,color:"#e2e6ea"}}>Det viktiga först. Resten får vänta.</p>
    </section>
    {loading&&<p style={{color:"#dce1e6"}}>Läser dagens läge…</p>}
    {error&&<div style={{marginTop:14,padding:14,border:"1px solid #6d3333",borderRadius:16,color:"#ffdada"}}>{error}</div>}
    {!loading&&!error&&<section style={{display:"grid",gap:12,marginTop:16}}>
      <Card title="1. Viktigast idag">{top.length?top.map((x,i)=><Row key={x.title}>{i+1}. {x.title}</Row>):<Empty>Inget prioriterat ännu.</Empty>}</Card>
      <Card title="2. Dagens tider"><Empty>Outlook är anslutet till O.L.L.E. i ChatGPT. Appens egen Graph-koppling läggs på i ett senare integrationssteg.</Empty></Card>
      <Card title="3. Uppföljningar">{followUps.length?followUps.map(x=><Row key={x.id}><span>{x.title}</span>{x.follow_up_at&&<Badge>{dateBadge(x.follow_up_at)}</Badge>}</Row>):<Empty>Inga daterade uppföljningar just nu.</Empty>}</Card>
      <Card title="4. Väntar på — äldst/akut först">{waiting.length?waiting.map(x=>{const date=x.follow_up_at||x.due_at;return <Row key={x.id}><span>{x.title}</span>{date?<Badge>{dateBadge(date)}</Badge>:<Badge>{ageDays(x.updated_at)}d väntat</Badge>}</Row>}):<Empty>Inga poster med status väntar.</Empty>}</Card>
      <Card title="5. Blockerat">{blockedProjects.length?blockedProjects.map(x=><Row key={x.id}><span>{x.title}{x.next_step?` · ${x.next_step}`:""}</span>{x.due_at&&<Badge>{dateBadge(x.due_at)}</Badge>}</Row>):<Empty>Inga projekt är markerade som väntande.</Empty>}</Card>
      <Card title="6. Risk att glömma — äldst först">{risk.length?risk.map(x=><Row key={x.id}><span>{x.title}</span><Badge>{ageDays(x.updated_at)}d utan datum</Badge></Row>):<Empty>Inga lösa trådar utan uppföljningsdatum hittades.</Empty>}</Card>
      <div style={{padding:18,borderRadius:20,background:"#f3f5f7",color:"#11151a"}}><div style={{fontSize:11,letterSpacing:".18em",fontWeight:800,color:"#59616a"}}>O.L.L.E. REKOMMENDERAR</div><div style={{fontSize:22,fontWeight:800,marginTop:8}}>Börja med detta:</div><p style={{fontSize:17,lineHeight:1.45,marginBottom:0}}>{startWith}</p></div>
    </section>}
  </div></main>;
}

function Card({title,children}:{title:string;children:React.ReactNode}){return <div style={{padding:16,borderRadius:20,border:"1px solid #2d333a",background:"#121519"}}><div style={{fontWeight:800,marginBottom:10}}>{title}</div><div style={{display:"grid",gap:8}}>{children}</div></div>}
function Row({children}:{children:React.ReactNode}){return <div style={{padding:12,borderRadius:14,background:"#1a1e23",color:"#f4f6f8",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>{children}</div>}
function Badge({children}:{children:React.ReactNode}){return <span style={{fontSize:11,fontWeight:800,letterSpacing:".04em",whiteSpace:"nowrap",padding:"5px 8px",borderRadius:999,background:"#2a3037",color:"#eef2f5"}}>{children}</span>}
function Empty({children}:{children:React.ReactNode}){return <div style={{color:"#cbd1d8",lineHeight:1.45}}>{children}</div>}
