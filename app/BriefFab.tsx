"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const BASE = "/Olle-pwa-";

export default function BriefFab(){
  const pathname=usePathname();
  const [signedIn,setSignedIn]=useState(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSignedIn(Boolean(data.session)));
    const {data}=supabase.auth.onAuthStateChange((_e,session)=>setSignedIn(Boolean(session)));
    return()=>data.subscription.unsubscribe();
  },[]);

  if(!signedIn || pathname.endsWith("/brief")) return null;

  return <a href={`${BASE}/brief/`} aria-label="Kör dagens brief" style={{position:"fixed",left:18,bottom:18,zIndex:50,minHeight:48,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 18px",borderRadius:999,background:"#f4f6f8",color:"#11151a",border:"1px solid rgba(255,255,255,.65)",boxShadow:"0 14px 34px rgba(0,0,0,.35)",textDecoration:"none",fontWeight:800,fontSize:14}}>Kör brief</a>;
}
