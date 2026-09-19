const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const RAMP = ["#EFEBE3","#CFE3D6","#A5CDB8","#5F9E7F","#1F6B4E"];

// status → pill colors (our statuses, design palette)
const PILL = {
  "Researched":{bg:"#F1EEE7",fg:"#5A554C"}, "Drafted":{bg:"#FBF1E3",fg:"#9A6414"},
  "Sent":{bg:"#E6F1EB",fg:"#1F6B4E"}, "Replied":{bg:"#1F6B4E",fg:"#EAF3EE"},
  "Interview":{bg:"#EAEFF3",fg:"#3D5A6C"}, "Offer":{bg:"#1F6B4E",fg:"#EAF3EE"},
  "Closed":{bg:"#F7EDEA",fg:"#9A4A34"},
};
const CSTATE = {
  "Not sent":{bg:"#F1EEE7",fg:"#6E6A63"}, "Draft ready":{bg:"#E6F1EB",fg:"#1F6B4E"},
  "Sent":{bg:"#FBF1E3",fg:"#9A6414"}, "Replied":{bg:"#1F6B4E",fg:"#EAF3EE"},
};
const TINTS = [
  {bg:"#EAEFF3",fg:"#3D5A6C"},{bg:"#E6F1EB",fg:"#1F6B4E"},{bg:"#F7EDEA",fg:"#9A4A34"},
  {bg:"#FBF1E3",fg:"#9A6414"},{bg:"#F1EEE7",fg:"#5A554C"},{bg:"#EDEAF3",fg:"#5B4B8A"},
];

let STATE = { view:"dashboard", jobs:[], statuses:[], settings:null, query:"", statusFilter:"All",
  sortKey:"", sortDir:1, sel:null, selContact:0, mode:"cold", draft:{subject:"",body:""}, report:null };

// research-report confidence levels
const REPORT_LEVELS = {
  high:{label:"High",fg:"#1F6B4E",bg:"#F3F7F4",border:"#DDE9E2",fill:"#1F6B4E",n:4},
  medium:{label:"Medium",fg:"#9A6414",bg:"#FBF7EF",border:"#F0E4CE",fill:"#E08A2B",n:3},
  low:{label:"Low",fg:"#9A4A34",bg:"#FCF6F4",border:"#F0DCD6",fill:"#C08A7A",n:2},
  none:{label:"None",fg:"#6E6A63",bg:"#F7F5F1",border:"#E7E3DA",fill:"#C7C0B5",n:0},
};
function normConf(c){ c=(c||"none").toLowerCase(); return REPORT_LEVELS[c]?c:"none"; }
function looksLikeUrl(s){ return /^https?:\/\//i.test((s||"").trim()); }

// ---------- helpers ----------
async function api(path, opts){ const r=await fetch(path,opts); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; }
function esc(s){ return (s??"").toString().replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function pill(s){ return PILL[s]||PILL["Researched"]; }
function tint(name){ let h=0; for(const ch of name||"") h=(h*31+ch.charCodeAt(0))>>>0; return TINTS[h%TINTS.length]; }
function monogram(name){ const p=(name||"?").trim().split(/\s+/); return ((p[0]?.[0]||"")+(p[1]?.[0]||"")).toUpperCase()||"·"; }
function initials(name){ const p=(name||"?").trim().split(/\s+/); return ((p[0]?.[0]||"")+(p[p.length-1]?.[0]||"")).toUpperCase()||"·"; }
function isoDay(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function daysUntil(s){ if(!s) return null; const d=new Date(s); if(isNaN(d)) return null; d.setHours(0,0,0,0); const t=new Date(); t.setHours(0,0,0,0); return Math.round((d-t)/86400000); }
function fmtAdded(d){ if(!d) return ""; const dt=new Date(d); if(isNaN(dt)) return d; return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`; }
function relDays(d){ const dt=new Date(d); if(isNaN(dt)) return ""; const n=Math.round((Date.now()-dt)/86400000); return n<=0?"today":n===1?"1d ago":n<7?n+"d ago":n<30?Math.round(n/7)+"w ago":Math.round(n/30)+"mo ago"; }
function confInfo(c){ c=(c||"").toLowerCase();
  if(c.includes("high")) return {pct:88,fill:"#1F6B4E",text:"#1F6B4E",label:"High"};
  if(c.includes("med")) return {pct:64,fill:"#E08A2B",text:"#9A6414",label:"Medium"};
  if(c.includes("low")) return {pct:38,fill:"#E08A2B",text:"#9A6414",label:"Low"};
  return {pct:22,fill:"#A8A299",text:"#8A857C",label:"Unrated"}; }
function contactState(job){ const s=job.Status; if(s==="Replied")return"Replied"; if(s==="Sent")return"Sent"; if(job.DraftId||s==="Drafted")return"Draft ready"; return"Not sent"; }
function buildContacts(job){
  const names=(job.Recipient||"").split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  const emails=(job.Email||"").split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  if(!names.length && !emails.length) return []; // no contact — don't fake one
  const st=contactState(job); const n=Math.max(names.length,emails.length); const out=[];
  for(let i=0;i<n;i++) out.push({name:names[i]||emails[i]||"Contact",title:job.RecipientTitle||"",email:emails[i]||"",state:st});
  return out;
}
function toLine(c){ if(c.name&&c.email) return `${c.name} <${c.email}>`; return c.email||c.name||"—"; }
function dueInfo(job){ if(["Closed","Offer"].includes(job.Status)) return null; const d=daysUntil(job.FollowUp); if(d===null) return null;
  if(d<0) return {label:"Overdue",overdue:true}; if(d===0) return {label:"Due today",overdue:true};
  if(d<=6){ const dt=new Date(job.FollowUp); return {label:"Due "+DOW[dt.getDay()]}; } return null; }
function banner(msg,kind){ const b=$("#banner"); b.onclick=null; b.style.cursor=""; if(!msg){b.classList.add("hidden");return;} b.textContent=msg; b.classList.toggle("err",kind==="err"); b.classList.remove("hidden"); }

// ---------- data ----------
async function loadSettings(){
  const r=await api("/api/settings"); STATE.settings=r.settings; STATE.statuses=r.statuses;
  const on=r.settings.oauth.connected;
  $("#conn").innerHTML=`<span class="conn-dot ${on?"":"off"}"></span> ${on?esc(r.settings.oauth.account):"Not connected"}`;
}
async function loadJobs(){
  try{
    const r=await api("/api/jobs");
    let last=""; for(const j of r.jobs){ if(j.Date&&j.Date.trim()) last=j.Date.trim(); else if(last) j.Date=last; }
    STATE.jobs=r.jobs; banner("");
  }catch(e){ STATE.jobs=[]; banner(e.message+"  → open Settings to connect Google & set your Sheet ID.","warn"); }
  renderAll();
}
function renderAll(){ setBadge(); renderView(); }

// ---------- header / nav ----------
function setBadge(){
  const n = STATE.jobs.filter(j=>{ const s=contactState(j); const d=dueInfo(j); return (d&&d.overdue)||s==="Draft ready"; }).length;
  const b=$("#fu-badge"); if(n){ b.textContent=n; b.classList.remove("hidden"); } else b.classList.add("hidden");
}
function switchView(v){
  STATE.view=v;
  if(v!=="report") localStorage.setItem("jmc-view",v); // report is ephemeral — never resume into it on reload
  $$(".nav-tab").forEach(t=>t.classList.toggle("active",t.dataset.view===v));
  $(".hdr").classList.toggle("hidden", v==="report");
  ["dashboard","followups","templates","settings"].forEach(x=>$(`#view-${x}`).classList.toggle("hidden",x!==v));
  $("#view-report").classList.toggle("hidden", v!=="report");
  renderView();
}
function renderView(){ const v=STATE.view;
  if(v==="dashboard") renderDashboard();
  else if(v==="followups") renderFollowups();
  else if(v==="templates") renderTemplates();
  else if(v==="settings") renderSettings();
  else if(v==="report") renderReport();
}

// ---------- dashboard ----------
function statusColorMap(status){ return pill(status); }
function renderDashboard(){
  const jobs=STATE.jobs;
  const by=(s)=>jobs.filter(j=>(j.Status||"Researched")===s).length;
  const total=jobs.length;
  const replied=by("Replied")+by("Interview")+by("Offer");
  const rate=total?Math.round((replied/total)*100):0;
  const interviews=by("Interview"), offers=by("Offer");
  // date-based counts
  const counts={}; for(const j of jobs){ if(!j.Date)continue; const d=new Date(j.Date); if(isNaN(d))continue; counts[isoDay(d)]=(counts[isoDay(d)]||0)+1; }
  const today=new Date(); today.setHours(0,0,0,0);
  const inRange=(from,to)=>{ let n=0; for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)) n+=counts[isoDay(d)]||0; return n; };
  const wkStart=new Date(today); wkStart.setDate(wkStart.getDate()-6);
  const lastWkEnd=new Date(wkStart); lastWkEnd.setDate(lastWkEnd.getDate()-1); const lastWkStart=new Date(lastWkEnd); lastWkStart.setDate(lastWkStart.getDate()-6);
  const thisWeek=inRange(wkStart,today), lastWeek=inRange(lastWkStart,lastWkEnd);
  const todayN=counts[isoDay(today)]||0; const yst=new Date(today); yst.setDate(yst.getDate()-1); const ystN=counts[isoDay(yst)]||0;
  const streak=computeStreak(counts,today);
  const dueToday=jobs.filter(j=>{const d=dueInfo(j);return d&&d.label==="Due today";}).length;

  const stats=[
    {label:"Applications",val:total,unit:"total",sub:`+${thisWeek} this week`,subColor:"#1F6B4E"},
    {label:"Reply rate",val:rate+"%",unit:"",sub:`${replied} replied`,subColor:"#8A857C"},
    {label:"Interviews",val:interviews,unit:"active",sub:offers?`${offers} offer${offers>1?"s":""} next`:"—",subColor:"#8A857C"},
    {label:"Offers",val:offers,unit:offers===1?"open":"",sub:offers?"decision pending":"—",subColor:offers?"#1F6B4E":"#8A857C",color:offers?"#1F6B4E":""},
    {label:"Streak",val:streak,unit:streak===1?"day":"days",sub:"applying activity",subColor:"#8A857C"},
    {label:"Follow-ups",val:dueToday,unit:"due today",sub:dueToday?"needs a nudge":"all clear",subColor:dueToday?"#9A6414":"#8A857C",color:dueToday?"#E08A2B":""},
  ];
  const statsHtml=stats.map(s=>`<div class="stat"><div class="stat-label">${s.label}</div>
    <div class="stat-row"><div class="stat-val" style="${s.color?`color:${s.color}`:""}">${esc(s.val)}</div>${s.unit?`<div class="stat-unit">${s.unit}</div>`:""}</div>
    <div class="stat-sub" style="color:${s.subColor}">${esc(s.sub)}</div></div>`).join("");

  $("#view-dashboard").innerHTML =
    `<section class="stats">${statsHtml}</section>
     <section class="card act">${activityHtml(counts,{thisWeek,lastWeek,todayN,ystN,streak})}</section>
     <section class="card tbl-card" id="tbl-card"></section>`;
  renderTable();
  wireHeatmapTips();
}
function computeStreak(counts,today){ let s=0; const d=new Date(today); if(!(counts[isoDay(d)]>0)) d.setDate(d.getDate()-1); while(counts[isoDay(d)]>0){ s++; d.setDate(d.getDate()-1); } return s; }

function activityHtml(counts,pace){
  const WEEKS=26;
  const end=new Date(); end.setHours(0,0,0,0);
  const start=new Date(end); start.setDate(start.getDate()-7*(WEEKS-1)); start.setDate(start.getDate()-start.getDay());
  const weeks=[]; const cur=new Date(start); while(cur<=end){ const wk=[]; for(let i=0;i<7;i++){wk.push(new Date(cur));cur.setDate(cur.getDate()+1);} weeks.push(wk); }
  let total=0,lastMonth=-1,lastCol=-9; const months=[],cells=[];
  weeks.forEach((wk,w)=>{ const m=wk[0].getMonth(); if(m!==lastMonth){ if(w===0||w-lastCol>=3){ months.push(`<div style="width:16px">${MONTHS[m]}</div>`); lastCol=w; } else months.push(`<div style="width:16px"></div>`); lastMonth=m; } else months.push(`<div style="width:16px"></div>`);
    wk.forEach(d=>{ if(d>end){ cells.push(`<div class="heat-cell" style="visibility:hidden"></div>`); return; } const k=isoDay(d); const n=counts[k]||0; total+=n; const lvl=n===0?0:n<2?1:n<4?2:n<6?3:4;
      cells.push(`<div class="heat-cell" data-tip="${n} action${n===1?"":"s"} · ${MONTHS[d.getMonth()]} ${d.getDate()}" style="background:${RAMP[lvl]}"></div>`); }); });
  const dayLabels=["","Mon","","Wed","","Fri",""].map(d=>`<div>${d}</div>`).join("");
  const legend=RAMP.map(c=>`<div class="cell" style="background:${c}"></div>`).join("");
  const streakTxt=pace.streak?`${pace.streak}-day streak`:"no active streak";
  // pace bars
  const wkMax=Math.max(pace.thisWeek,pace.lastWeek,1), dMax=Math.max(pace.todayN,pace.ystN,1);
  const dW=pace.thisWeek-pace.lastWeek, dD=pace.todayN-pace.ystN;
  const paceBlock=(label,val,unit,a,b,amax,delta,prev,prevLabel)=>{
    const up=delta>=0; const noteColor=up?"#1F6B4E":"#9A6414";
    return `<div class="pace-metric"><div class="pace-label">${label}</div>
      <div class="pace-row"><div class="pace-val">${val}</div><div class="pace-unit">${unit}</div></div>
      <div class="pace-bars"><div class="pace-bar" style="background:#1F6B4E;width:${Math.round(a/amax*100)}%"></div><div class="pace-bar" style="background:#E7E3DA;width:${Math.round(b/amax*100)}%"></div></div>
      <div class="pace-note" style="color:${noteColor}">${up?"+":""}${delta} vs ${prevLabel} (${prev})</div></div>`;
  };
  const avg=(Object.values(counts).reduce((a,b)=>a+b,0)/WEEKS).toFixed(1);
  const bestWeek=Math.max(0,...weeks.map(wk=>wk.reduce((s,d)=>s+(counts[isoDay(d)]||0),0)));
  const paceStat=(label,val,unit)=>`<div class="pace-metric pace-metric-static"><div class="pace-label">${label}</div><div class="pace-row"><div class="pace-val">${val}</div><div class="pace-unit">${unit}</div></div></div>`;
  return `<div class="act-head"><div><div class="act-title">Application activity</div>
      <div class="act-sub">${total} actions logged in the last ${WEEKS} weeks — applications and follow-ups</div></div>
      <div class="act-right"><div class="streak-pill"><div class="dot"></div><span>${streakTxt}</span></div>
        <div class="legend">Less${legend}More</div></div></div>
    <div class="act-body">
      <div class="heat-scroll"><div class="heat-inner">
        <div class="heat-months">${months.join("")}</div>
        <div class="heat-grid-row"><div class="heat-days">${dayLabels}</div><div class="heatmap">${cells.join("")}</div></div>
      </div></div>
      <div class="pace">
        ${paceBlock("This week",pace.thisWeek,pace.thisWeek===1?"application":"applications",pace.thisWeek,pace.lastWeek,wkMax,dW,pace.lastWeek,"last week")}
        ${paceBlock("Today",pace.todayN,pace.todayN===1?"application":"applications",pace.todayN,pace.ystN,dMax,dD,pace.ystN,"yesterday")}
        ${paceStat("Weekly average",avg,"per week")}
        ${paceStat("Best week",bestWeek,"actions")}
      </div>
    </div>`;
}

function renderTable(){
  const chips=["All",...STATE.statuses];
  const chipHtml=chips.map(c=>`<button class="chip-btn ${STATE.statusFilter===c?"active":""}" data-status="${c}">${c}</button>`).join("");
  const cols=[["company","Company",""],["role","Role & note",""],["status","Status",""],["contacts","Contacts",""],["activity","Last activity","flex-end"]];
  const headHtml=cols.map(([k,label,j])=>`<button class="th ${STATE.sortKey===k?"active":""}" data-sort="${k}" style="justify-content:${j||"flex-start"}">${label}<span class="arrow">${STATE.sortKey===k?(STATE.sortDir>0?"▲":"▼"):""}</span></button>`).join("");

  let rows=STATE.jobs.slice();
  const q=STATE.query.toLowerCase();
  if(q) rows=rows.filter(j=>[j.Company,j.Role].join(" ").toLowerCase().includes(q));
  if(STATE.statusFilter!=="All") rows=rows.filter(j=>(j.Status||"Researched")===STATE.statusFilter);
  const key=STATE.sortKey;
  if(key){ rows.sort((a,b)=>{ const va=sortVal(a,key), vb=sortVal(b,key); return (va<vb?-1:va>vb?1:0)*STATE.sortDir; }); }
  else rows.sort((a,b)=>b.rowNumber-a.rowNumber);

  const body = rows.length ? rows.map(j=>rowHtml(j)).join("") : "";
  const empty = rows.length ? "" : `<div class="empty"><div class="plus">+</div><div class="t">No applications match this view</div><div class="d">Clear the filters, or click “Log application” to capture your next one.</div></div>`;
  $("#tbl-card").innerHTML =
    `<div class="tbl-toolbar">
       <div class="search"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.4" stroke="#9A948B" stroke-width="1.4"/><path d="M9.4 9.4L13 13" stroke="#9A948B" stroke-width="1.4" stroke-linecap="round"/></svg>
         <input id="tbl-q" value="${esc(STATE.query)}" placeholder="Search company or role"></div>
       <div class="chips">${chipHtml}</div>
     </div>
     <div class="tbl-scroll"><div class="tbl">
       <div class="tbl-cols tbl-head">${headHtml}</div>
       ${body}
     </div></div>
     ${empty}
     <div class="tbl-foot"><span>${rows.length} of ${STATE.jobs.length} applications</span><span>Synced from Google Sheet</span></div>`;

  const qi=$("#tbl-q"); qi.oninput=()=>{ STATE.query=qi.value; const pos=qi.selectionStart; renderTable(); const nq=$("#tbl-q"); nq.focus(); nq.setSelectionRange(pos,pos); };
  $$("#tbl-card .chip-btn").forEach(b=>b.onclick=()=>{ STATE.statusFilter=b.dataset.status; renderTable(); });
  $$("#tbl-card .th").forEach(b=>b.onclick=()=>{ const k=b.dataset.sort; if(STATE.sortKey===k) STATE.sortDir*=-1; else{STATE.sortKey=k;STATE.sortDir=1;} renderTable(); });
  $$("#tbl-card .tbl-row").forEach(r=>r.onclick=()=>openDrawer(+r.dataset.row));
}
function sortVal(j,k){ if(k==="company")return(j.Company||"").toLowerCase(); if(k==="role")return(j.Role||"").toLowerCase(); if(k==="status")return j.Status||""; if(k==="contacts")return buildContacts(j).length; if(k==="activity")return new Date(j.Date||0).getTime(); return ""; }
function rowHtml(j){
  const t=tint(j.Company); const p=pill(j.Status||"Researched"); const contacts=buildContacts(j); const st=contactState(j);
  const due=dueInfo(j); const needsDraft=st==="Not sent"&&j.Status!=="Closed";
  const noteDot=(due&&due.overdue)?"#E08A2B":"#D6D0C5";
  const cStateLabel = contacts.length===0 ? "no contact" : st==="Not sent"?"no drafts":st==="Draft ready"?"drafts ready":st==="Sent"?"contacted":"replied";
  return `<div class="tbl-cols tbl-row" data-row="${j.rowNumber}">
    <div class="cell"><div class="co"><div class="mono-tile" style="background:${t.bg};color:${t.fg}">${monogram(j.Company)}</div>
      <div style="min-width:0"><div class="co-name">${esc(j.Company)||"—"}</div><div class="added">added ${fmtAdded(j.Date)}</div></div></div></div>
    <div class="cell cell-role"><div class="role">${esc(j.Role)||"—"}</div>
      <div class="note-line"><div class="note-dot" style="background:${noteDot}"></div><div class="note">${esc(j.Notes||j.GapThesis||"")}</div>
      ${needsDraft?`<span class="needs-draft">Needs draft</span>`:""}</div></div>
    <div class="cell"><span class="pill" style="background:${p.bg};color:${p.fg}">${esc(j.Status||"Researched")}</span></div>
    <div class="cell contacts-cell"><span class="n">${contacts.length}</span><span class="s">${cStateLabel}</span></div>
    <div class="cell activity-cell"><span class="a">${relDays(j.Date)}</span>${due?`<span class="due-badge">${due.label}</span>`:""}</div>
  </div>`;
}
function wireHeatmapTips(){
  $$("#view-dashboard .heat-cell").forEach(c=>{
    c.onmouseenter=(e)=>showTip(e,c.dataset.tip); c.onmousemove=(e)=>showTip(e,c.dataset.tip); c.onmouseleave=hideTip;
  });
}
function showTip(e,text){ if(!text)return; let t=$("#tip"); if(!t){ t=document.createElement("div"); t.id="tip"; t.className="tip"; $("#tip-root").appendChild(t);} t.textContent=text; t.style.left=e.clientX+"px"; t.style.top=e.clientY+"px"; }
function hideTip(){ const t=$("#tip"); if(t) t.remove(); }

// ---------- follow-ups ----------
function renderFollowups(){
  const jobs=STATE.jobs;
  const overdue=[],waiting=[],recent=[];
  for(const j of jobs){ if(["Closed","Offer"].includes(j.Status)) continue; const st=contactState(j); const d=dueInfo(j);
    if(d&&d.overdue) overdue.push(j); else if(st==="Draft ready") waiting.push(j); else if(st==="Sent") recent.push(j); }
  const group=(title,tint,items,action,filled)=> items.length?`
    <section class="fu-group"><div class="fu-group-head"><div class="dot" style="background:${tint}"></div><div class="t">${title}</div><div class="c">${items.length}</div></div>
    <div class="fu-list">${items.map(j=>{ const t=tint2(j.Company); const c=buildContacts(j)[0]||{name:"(no contact)",title:""};
      return `<div class="fu-item"><div class="mono-tile" style="width:28px;height:28px;border-radius:8px;background:${t.bg};color:${t.fg}">${monogram(j.Company)}</div>
        <div class="who"><div class="n">${esc(c.name)} · ${esc(j.Company)}</div><div class="r">${esc(c.title||"—")} · ${esc(j.Role)}</div></div>
        <div class="meta">${esc(fuMeta(j))}</div>
        <button class="btn ${filled?"btn-primary":""} btn-sm" data-row="${j.rowNumber}">${action}</button></div>`; }).join("")}</div></section>`:"";
  const html =
    `<div><div class="page-title">Follow-ups</div><div class="page-sub">Every thread the agent is holding open. One click drafts the next message — nothing leaves your account without you.</div></div>`+
    group("Overdue — no reply in a while","#E08A2B",overdue,"Draft follow-up",true)+
    group("Waiting on your approval","#1F6B4E",waiting,"Review draft",false)+
    group("Sent recently — nothing to do yet","#C7C0B5",recent,"Review draft",false);
  const anything=overdue.length||waiting.length||recent.length;
  $("#view-followups").innerHTML = html + (anything?"":`<div class="empty" style="padding:48px 24px"><div class="t">No open threads</div><div class="d">Draft ready or sent contacts will show up here to nudge.</div></div>`);
  $$("#view-followups .fu-item .btn").forEach(b=>b.onclick=()=>openDrawer(+b.dataset.row,{mode:contactState(STATE.jobs.find(j=>j.rowNumber==b.dataset.row))==="Draft ready"?"cold":"followup"}));
}
function tint2(name){ return tint(name); }
function fuMeta(j){ const st=contactState(j); const d=dueInfo(j);
  if(st==="Draft ready") return "Cold draft ready · never sent";
  if(st==="Sent"){ const dd=daysUntil(j.FollowUp); return dd!==null&&dd<0?`Sent · follow-up overdue`:`Sent · follow-up ${d?d.label.toLowerCase():"soon"}`; }
  return "—"; }

// ---------- templates ----------
let TPL=[], TPL_DEFAULT="", tplSel=0;
function templateFill(t,job){ const map={ company:job.Company,role:job.Role,recipient:(buildContacts(job)[STATE.selContact]||{}).name,recipientTitle:job.RecipientTitle,location:job.Location,gap:job.GapThesis,signature:STATE.settings?.sender?.signature||"" };
  const sub=(s)=>(s||"").replace(/\{(\w+)\}/g,(_,k)=>(map[k]??"").toString()); return {subject:sub(t.subject),body:sub(t.body)}; }
function templateOptions(selName){ return (STATE.settings?.templates||[]).map((t,i)=>`<option value="${i}"${t.name===selName?" selected":""}>${esc(t.name||"Untitled")}</option>`).join(""); }
function renderTemplates(){ TPL=JSON.parse(JSON.stringify(STATE.settings?.templates||[])); TPL_DEFAULT=STATE.settings?.defaultTemplateName||""; if(tplSel>=TPL.length) tplSel=TPL.length-1; drawTemplates(); }
async function saveTemplates(){ const st=$("#tpl-status"); try{ const r=await api("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({templates:TPL,defaultTemplateName:TPL_DEFAULT})}); STATE.settings=r.settings; if(st){st.textContent="Saved ✓";setTimeout(()=>st.textContent="",2000);} }catch(e){ if(st)st.textContent="Error: "+e.message; } }
function drawTemplates(){
  const list=TPL.map((t,i)=>`<div class="tpl-card ${i===tplSel?"active":""}" data-i="${i}">
    <div class="tpl-card-top"><div class="tpl-card-name">${esc(t.name||"Untitled")}${t.name&&t.name===TPL_DEFAULT?' · <span style="color:#1F6B4E">default</span>':""}</div></div>
    <div class="tpl-card-blurb">${esc((t.subject||"").slice(0,80)||"No subject yet")}</div></div>`).join("")||`<div class="muted" style="padding:10px 0">No templates yet.</div>`;
  const t=TPL[tplSel];
  const editor = t?`
    <div class="tpl-ed-head"><div class="dot"></div><input class="tpl-ed-name" id="ted-name" value="${esc(t.name)}" placeholder="Template name"><span class="tpl-ed-auto">Auto-fills per job</span></div>
    <div class="tpl-ed-body">
      <div class="tpl-subj"><label>Subject</label><input id="ted-subject" value="${esc(t.subject)}" placeholder="{role} at {company} — one thing I noticed"></div>
      <textarea class="tpl-area" id="ted-body" placeholder="Hi {recipient},\n\n…\n\n{signature}">${esc(t.body)}</textarea>
      <div class="tpl-ph">${["{company}","{role}","{recipient}","{recipientTitle}","{location}","{gap}","{signature}"].map(p=>`<span class="ph-chip">${p}</span>`).join("")}</div>
    </div>
    <div class="tpl-ed-foot"><button class="btn btn-primary btn-sm" id="ted-save">Save</button>
      <label class="muted" style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="ted-default" ${t.name&&t.name===TPL_DEFAULT?"checked":""}> Default</label>
      <button class="btn btn-sm" id="ted-del">Delete</button><span class="muted" id="tpl-status"></span></div>`
    :`<div class="empty" style="padding:40px 20px"><div class="t">Select a template</div><div class="d">or create a new one.</div></div>`;
  $("#view-templates").innerHTML=`<div class="tpl-grid">
    <section class="tpl-list"><div class="tpl-list-head"><div class="act-title">Templates</div><button class="btn btn-sm" id="tpl-add">New template</button></div>${list}</section>
    <section class="tpl-editor">${editor}</section></div>`;
  $$("#view-templates .tpl-card").forEach(c=>c.onclick=()=>{tplSel=+c.dataset.i;drawTemplates();});
  $("#tpl-add").onclick=()=>{ TPL.push({name:"New template",subject:"",body:""}); tplSel=TPL.length-1; drawTemplates(); $("#ted-name")?.select(); };
  if(t){
    $("#ted-name").oninput=(e)=>{ if(TPL[tplSel].name===TPL_DEFAULT) TPL_DEFAULT=e.target.value; TPL[tplSel].name=e.target.value; };
    $("#ted-subject").oninput=(e)=>TPL[tplSel].subject=e.target.value;
    $("#ted-body").oninput=(e)=>TPL[tplSel].body=e.target.value;
    $("#ted-default").onchange=(e)=>{ TPL_DEFAULT=e.target.checked?(TPL[tplSel].name||""):""; drawTemplates(); };
    $("#ted-del").onclick=()=>{ TPL.splice(tplSel,1); tplSel=Math.max(0,tplSel-1); drawTemplates(); };
    $("#ted-save").onclick=saveTemplates;
  }
}

// ---------- drawer ----------
function openDrawer(rowNumber,opts={}){ const job=STATE.jobs.find(j=>j.rowNumber===rowNumber); if(!job)return;
  STATE.sel=rowNumber; STATE.selContact=0; STATE.mode=opts.mode||"cold";
  const defName=STATE.settings?.defaultTemplateName||"";
  let subj=job.Subject||"", body=job.EmailBody||"";
  if(!subj&&!body&&defName){ const dt=(STATE.settings?.templates||[]).find(t=>t.name===defName); if(dt){ const f=templateFill(dt,job); subj=f.subject; body=f.body; } }
  STATE.draft={subject:subj,body:body};
  if(STATE.mode==="followup") applyFollowupMode(job,{silent:true});
  renderDrawer();
}
function closeDrawer(){ STATE.sel=null; $("#drawer-root").innerHTML=""; }
function selJob(){ return STATE.jobs.find(j=>j.rowNumber===STATE.sel); }

function timelineOf(job){
  const ev=[]; const st=contactState(job);
  ev.push({label:"Application logged",when:relDays(job.Date),dot:"#D6D0C5"});
  if(job.DraftId) ev.push({label:"Draft created",when:"recent",dot:"#5F9E7F"});
  if(st==="Sent"||st==="Replied") ev.push({label:"Marked sent",when:"recent",dot:"#1F6B4E"});
  if(st==="Replied") ev.push({label:"Replied",when:"recent",dot:"#1F6B4E"});
  let pending=null; if(st==="Not sent") pending="No draft yet — create one below"; else if(st==="Draft ready") pending="Draft in Gmail — waiting for you to send"; else if(st==="Sent"){ const d=daysUntil(job.FollowUp); pending=d!==null&&d<0?"No reply — follow-up due":"Waiting on a reply"; }
  return {ev,pending};
}
function renderDrawer(){
  const job=selJob(); if(!job){ $("#drawer-root").innerHTML=""; return; }
  const t=tint(job.Company); const p=pill(job.Status||"Researched");
  const contacts=buildContacts(job); const jobState=contactState(job);
  const ci=contacts.length?Math.min(STATE.selContact,contacts.length-1):0;
  const c=contacts[ci]||{name:"",title:"",email:"",state:jobState};
  const due=dueInfo(job);
  const tl=timelineOf(job);
  const state=jobState;
  const contactsHtml = contacts.length ? contacts.map((ct,i)=>`<div class="contact-row ${i===ci?"sel":""}" data-ci="${i}">
    <div class="contact-av">${initials(ct.name)}</div>
    <div class="info"><div class="n">${esc(ct.name)}</div><div class="m">${esc(ct.title||"—")}${ct.email?" · "+esc(ct.email):""}</div></div>
    ${ct.state==="Sent"?`<button class="btn btn-sm fu-btn" style="padding:4px 9px">Draft follow-up</button>`:""}
    <span class="pill" style="background:${CSTATE[ct.state].bg};color:${CSTATE[ct.state].fg}">${ct.state}</span></div>`).join("")
    : `<div class="contact-row" style="cursor:default"><div class="contact-av">—</div><div class="info"><div class="m">No contact on this application yet.</div></div></div>`;
  const tlHtml=tl.ev.map(e=>`<div class="tl-row"><div class="tl-rail"><div class="tl-dot" style="background:${e.dot}"></div><div class="tl-line"></div></div>
    <div class="tl-content"><span class="tl-label">${esc(e.label)}</span><span class="tl-when">${esc(e.when)}</span></div></div>`).join("")
    + (tl.pending?`<div class="tl-pending"><div class="d"></div><div class="t">${esc(tl.pending)}</div></div>`:"");
  const actions=drawerActions(state);
  const modeCold=STATE.mode==="cold";
  $("#drawer-root").innerHTML=`
    <div class="scrim" id="scrim"></div>
    <aside class="drawer">
      <div class="dw-head"><div class="dw-mono" style="background:${t.bg};color:${t.fg}">${monogram(job.Company)}</div>
        <div style="flex:1;min-width:0"><div class="dw-co">${esc(job.Company)||"—"}</div><div class="dw-role">${esc(job.Role)||""}</div></div>
        <span class="pill" style="background:${p.bg};color:${p.fg}">${esc(job.Status||"Researched")}</span>
        <button class="dw-close" id="dw-close">×</button></div>
      <div class="dw-body">
        ${(due||job.FollowUp)?`<div class="note-banner"><div class="dot"></div><div class="d" style="color:#7A5210;font-weight:600;font-size:12.5px">${due?esc(due.label):"Follow-up scheduled"}${job.FollowUp?" · follow-up "+esc(job.FollowUp):""}</div></div>`:""}
        <div class="dw-section"><span class="section-label">Contacts</span><div class="contact-list">${contactsHtml}</div></div>
        <div class="dw-section"><span class="section-label">Thread history</span><div class="timeline">${tlHtml}</div></div>
        <div class="composer">
          <div class="comp-head">
            <div class="mode-tabs" ${job.GapThesis&&modeCold?'style="margin-bottom:11px"':'style="margin-bottom:0"'}>
              <button class="mode-tab ${modeCold?"active":""}" data-mode="cold">Cold email</button>
              <button class="mode-tab ${!modeCold?"active":""}" data-mode="followup">Follow-up</button>
              <div class="mode-sep"></div>
              <select class="comp-tpl" id="comp-tpl"><option value="">Template…</option>${templateOptions("")}</select>
            </div>
            ${modeCold&&job.GapThesis?`<div class="comp-title-row"><div class="comp-title">Gap</div><a href="#" id="dw-view-report" style="font-size:11.5px;font-weight:550">View full report ↗</a></div>
            <div class="gap">${esc(job.GapThesis)}</div>`:!modeCold?`<div class="comp-title-row" style="margin:0"><div class="comp-title">Follow-up draft</div></div>`:""}
          </div>
          <div class="comp-fields">
            <div class="comp-field"><label>To</label><span class="to">${esc(toLine(c))}</span></div>
            <div class="comp-field subj"><label>Subject</label><input id="dw-subject" value="${esc(STATE.draft.subject)}" placeholder="Subject line"></div>
          </div>
          <div class="comp-body" id="dw-body" contenteditable="true" data-ph="Compose your email…">${STATE.draft.body||""}</div>
        </div>
      </div>
      <div class="dw-foot"><div class="note"><svg width="11" height="13" viewBox="0 0 11 13" fill="none"><path d="M2.5 5.5V3.6a3 3 0 0 1 6 0v1.9" stroke="#9A948B" stroke-width="1.4"/><rect x="1" y="5.5" width="9" height="6.5" rx="2" fill="#9A948B"/></svg><span id="dw-msg">Saved as a Gmail draft. You press send.</span></div>${actions}</div>
    </aside>`;
  $("#scrim").onclick=closeDrawer; $("#dw-close").onclick=closeDrawer;
  $("#dw-subject").oninput=(e)=>STATE.draft.subject=e.target.value;
  $("#dw-body").oninput=(e)=>{ const el=e.target; if(!el.textContent.trim()&&!el.querySelector("img,ul,ol,li")) el.innerHTML=""; STATE.draft.body=el.innerHTML; };
  $$("#drawer-root .contact-row").forEach(r=>r.onclick=(e)=>{ if(e.target.closest(".fu-btn"))return; STATE.selContact=+r.dataset.ci; renderDrawer(); });
  $$("#drawer-root .fu-btn").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); STATE.mode="followup"; applyFollowupMode(job); renderDrawer(); });
  $$("#drawer-root .mode-tab").forEach(b=>b.onclick=()=>{ const m=b.dataset.mode; if(m===STATE.mode)return; STATE.mode=m; if(m==="followup") applyFollowupMode(job); else { STATE.draft={subject:job.Subject||"",body:job.EmailBody||""}; } renderDrawer(); });
  $("#comp-tpl").onchange=(e)=>{ if(e.target.value==="")return; const t=STATE.settings.templates[+e.target.value]; const f=templateFill(t,job); STATE.draft={subject:f.subject,body:f.body}; renderDrawer(); };
  const viewReportLink=$("#dw-view-report"); if(viewReportLink) viewReportLink.onclick=(e)=>{ e.preventDefault(); const rn=job.rowNumber; closeDrawer(); openReportForRow(rn); };
  wireDrawerActions();
}
function applyFollowupMode(job,opts={}){
  const tpls=STATE.settings?.templates||[]; const fu=tpls.find(t=>/nudge|follow/i.test(t.name))||tpls.find(t=>t.name===STATE.settings?.defaultTemplateName)||tpls[0];
  const base=job.Subject||`${job.Role} at ${job.Company}`;
  const subject = base.startsWith("Re:")?base:`Re: ${base}`;
  let body = STATE.draft.body;
  if(fu){ const f=templateFill(fu,job); body=f.body; }
  STATE.draft={subject,body};
}
function drawerActions(state){
  const b=(label,primary,act)=>`<button class="btn ${primary?"btn-primary":""} btn-sm" data-act="${act}">${label}</button>`;
  if(STATE.mode==="followup") return b("Regenerate",false,"regen")+b("Create follow-up draft",true,"draft")+b("Open in Gmail",false,"gmail");
  if(state==="Not sent") return b("Regenerate",false,"regen")+b("Create Gmail draft",true,"draft");
  if(state==="Draft ready") return b("Regenerate",false,"regen")+b("Mark as sent",false,"sent")+b("Open in Gmail",true,"gmail");
  if(state==="Sent") return b("Mark as replied",false,"replied")+b("Draft follow-up",false,"followup")+b("Open in Gmail",true,"gmail");
  if(state==="Replied") return b("Draft follow-up",false,"followup")+b("Open in Gmail",true,"gmail");
  return b("Open in Gmail",true,"gmail");
}
function wireDrawerActions(){
  $$("#drawer-root .dw-foot [data-act]").forEach(btn=>btn.onclick=async()=>{
    const act=btn.dataset.act; const job=selJob(); const msg=$("#dw-msg");
    try{
      if(act==="gmail"){ window.open("https://mail.google.com/mail/u/0/#drafts","_blank"); return; }
      if(act==="followup"){ STATE.mode="followup"; applyFollowupMode(job); renderDrawer(); return; }
      if(act==="draft"){ msg.textContent="Creating draft…"; const r=await api(`/api/jobs/${job.rowNumber}/draft`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:STATE.draft.subject,html:STATE.draft.body})}); msg.textContent="Gmail draft created ✓"; await refresh(); renderDrawer(); return; }
      if(act==="sent"||act==="replied"){ const status=act==="sent"?"Sent":"Replied"; await api(`/api/jobs/${job.rowNumber}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({Status:status})}); await refresh(); renderDrawer(); return; }
      if(act==="regen"){ closeDrawer(); if(job.JobURL) openReportForNew({jobUrl:job.JobURL}); else openReportForNew({jd:`${job.Role} at ${job.Company}`}); return; }
    }catch(e){ msg.textContent="Error: "+e.message; }
  });
}
async function refresh(){ const r=await api("/api/jobs"); let last=""; for(const j of r.jobs){ if(j.Date&&j.Date.trim())last=j.Date.trim(); else if(last)j.Date=last; } STATE.jobs=r.jobs; setBadge(); if(STATE.view==="dashboard")renderDashboard(); else if(STATE.view==="followups")renderFollowups(); }

// ---------- log application modal ----------
function openLog(){
  modal(`<div class="modal-head"><h3>Log application</h3><button class="dw-close" id="m-close">×</button></div>
    <div class="modal-body" id="m-body">
      <label>Job URL or description</label>
      <textarea class="field" id="m-input" rows="3" placeholder="https://…/jobs/view/…  — or paste the JD"></textarea>
      <div class="row"><button class="btn btn-primary" id="m-ai">✨ Research with AI</button><button class="btn" id="m-manual">Just log it</button></div>
      <p class="muted">AI researches the company + persona and drafts an email (~1–2 min). “Just log it” adds the row without AI.</p>
    </div>`);
  $("#m-close").onclick=closeModal;
  $("#m-ai").onclick=()=>{ const val=$("#m-input").value.trim(); if(!val){$("#m-input").focus();return;} closeModal(); if(looksLikeUrl(val)) openReportForNew({jobUrl:val}); else openReportForNew({jd:val}); };
  $("#m-manual").onclick=showManual;
}
function showManual(){
  $("#m-body").innerHTML=`
    <label>Company</label><input class="field" id="m-company">
    <label>Role</label><input class="field" id="m-role">
    <label>Job URL</label><input class="field" id="m-url">
    <label>Recipient</label><input class="field" id="m-recipient">
    <label>Email</label><input class="field" id="m-email">
    <div class="row"><button class="btn btn-primary" id="m-save">Add to sheet</button><span class="muted" id="m-msg"></span></div>`;
  $("#m-save").onclick=async()=>{ const msg=$("#m-msg"); try{
    await api("/api/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({Company:$("#m-company").value,Role:$("#m-role").value,JobURL:$("#m-url").value,Recipient:$("#m-recipient").value,Email:$("#m-email").value})});
    closeModal(); await refresh(); if(STATE.view==="dashboard")renderDashboard(); }catch(e){ msg.textContent="Error: "+e.message; } };
}
// ---------- research report ----------
function resetReportState(){
  if(STATE.report?.timer) clearInterval(STATE.report.timer);
  if(STATE.report?.pollTimer) clearInterval(STATE.report.pollTimer);
  STATE.report = { phase:"running", jobUrl:"", jd:"", job:{}, rowNumber:null, t:0, timer:null,
    pending:false, pollTimer:null, record:null, ranSeconds:0, researchedAt:"",
    subject:"", body:"", approved:false, draftId:null, failReason:"" };
}
function startReportTimer(){
  STATE.report.t = 0;
  STATE.report.timer = setInterval(()=>{
    const r=STATE.report; if(!r || r.phase!=="running") return;
    r.t++;
    if(r.pending && r.t>240){ // deep-linked run we can't confirm finished — bail out honestly
      stopReportTimer(); if(r.pollTimer){clearInterval(r.pollTimer);r.pollTimer=null;}
      r.phase="failure"; r.failReason="Taking longer than expected — the run may have failed, or it's still finishing in the background. Check the Dashboard, or try again.";
      renderReport(); return;
    }
    updateReportRunningUi();
  },1000);
}
function stopReportTimer(){ if(STATE.report?.timer){clearInterval(STATE.report.timer);STATE.report.timer=null;} }
function updateReportRunningUi(){
  const r=STATE.report;
  if(!r||r.phase!=="running") return;
  const elapsed=$("#rpt-elapsed");
  if(elapsed){
    const mm=Math.floor(r.t/60), ss=String(r.t%60).padStart(2,"0");
    elapsed.textContent=`Elapsed ${mm}:${ss} · typically 60–120s`;
  }
  const stage=Math.min(3,Math.floor(r.t/26));
  $$("#view-report .rpt-step").forEach((step,i)=>{
    const done=i<stage, active=i===stage;
    const dot=step.querySelector(".rpt-step-dot");
    const label=step.querySelector(".rpt-step-label");
    if(dot){
      dot.textContent=done?"✓":"";
      dot.style.background=done?"var(--pine)":active?"#CFE3D6":"#fff";
      dot.style.borderColor=i<=stage?"var(--pine)":"#D6D0C5";
      dot.style.animation=active?"pulseDot 1.2s ease-in-out infinite":"";
    }
    if(label){ label.style.color=i<=stage?"var(--ink)":"var(--ink-faintest)"; label.style.fontWeight=active?650:500; }
  });
}

function openReportForNew({jobUrl,jd}){
  resetReportState();
  STATE.report.jobUrl=jobUrl||""; STATE.report.jd=jd||"";
  switchView("report");
  startReportTimer();
  runReportPipeline();
}
function openReportForRow(rowNumber){
  const job=STATE.jobs.find(j=>j.rowNumber===rowNumber); if(!job) return;
  resetReportState();
  let research={}; try{ research = job.ResearchJSON?JSON.parse(job.ResearchJSON):{}; }catch{ research={}; }
  STATE.report.rowNumber=rowNumber; STATE.report.jobUrl=job.JobURL||"";
  STATE.report.job={company:job.Company,role:job.Role,location:job.Location};
  STATE.report.record=recordFromJob(job,research);
  STATE.report.subject=job.Subject||""; STATE.report.body=job.EmailBody||"";
  STATE.report.ranSeconds=research.ranSeconds||0; STATE.report.researchedAt=research.researchedAt||"";
  STATE.report.phase=(research.flags&&research.flags.length)?"degraded":"success";
  switchView("report");
}
function openReportPending(jobUrl){
  resetReportState();
  STATE.report.jobUrl=jobUrl; STATE.report.pending=true;
  switchView("report");
  startReportTimer();
  pollForPendingReport();
  STATE.report.pollTimer=setInterval(pollForPendingReport,4000);
}
function recordFromJob(job,research){
  return {
    company:job.Company, role:job.Role, location:job.Location,
    recipient:job.Recipient, recipientTitle:job.RecipientTitle,
    recipientConfidence:research.recipientConfidence||"none", recipientReason:research.recipientReason||"",
    email:job.Email, emailConfidence:job.EmailConfidence||"none",
    gapThesis:job.GapThesis||"", gapConfidence:research.gapConfidence||"none",
    signals:research.signals||[], flags:research.flags||[],
    subject:job.Subject||"", emailBody:job.EmailBody||"",
  };
}
async function pollForPendingReport(){
  const r=STATE.report; if(!r||r.phase!=="running") return;
  try{
    const res=await api("/api/jobs");
    let last=""; for(const j of res.jobs){ if(j.Date&&j.Date.trim())last=j.Date.trim(); else if(last)j.Date=last; }
    STATE.jobs=res.jobs; setBadge();
    const match=res.jobs.find(j=>j.JobURL===r.jobUrl && j.Source==="coldpitch-ai");
    if(match){
      if(r.pollTimer){clearInterval(r.pollTimer);r.pollTimer=null;}
      stopReportTimer();
      let research={}; try{ research=match.ResearchJSON?JSON.parse(match.ResearchJSON):{}; }catch{}
      STATE.report.rowNumber=match.rowNumber;
      STATE.report.job={company:match.Company,role:match.Role,location:match.Location};
      STATE.report.record=recordFromJob(match,research);
      STATE.report.subject=match.Subject||""; STATE.report.body=match.EmailBody||"";
      STATE.report.ranSeconds=research.ranSeconds||0; STATE.report.researchedAt=research.researchedAt||"";
      STATE.report.phase=(research.flags&&research.flags.length)?"degraded":"success";
      renderReport();
    }
  }catch(e){ /* transient — keep polling silently */ }
}
async function runReportPipeline(){
  try{
    const r=await api("/api/pipeline",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({jobUrl:STATE.report.jobUrl||undefined, jd:STATE.report.jd||undefined})});
    stopReportTimer();
    if(!r.ok){ STATE.report.phase="failure"; STATE.report.failReason=r.reason||"Could not research this posting."; renderReport(); return; }
    const rec=r.record;
    STATE.report.record=rec; STATE.report.rowNumber=r.rowNumber;
    STATE.report.ranSeconds=r.ranSeconds; STATE.report.researchedAt=r.researchedAt;
    STATE.report.subject=rec.subject||""; STATE.report.body=rec.emailBody||"";
    STATE.report.job={company:rec.company,role:rec.role,location:rec.location};
    const flags=r.flags||rec.flags||[];
    STATE.report.phase=flags.length?"degraded":"success";
    renderReport();
    await refresh();
  }catch(e){
    stopReportTimer();
    STATE.report.phase="failure"; STATE.report.failReason=e.message;
    renderReport();
  }
}

function renderReport(){
  const r=STATE.report; if(!r) return;
  const header=`<div class="rpt-header"><button class="rpt-back" id="rpt-back">← Dashboard</button><div class="rpt-sep"></div><div class="rpt-title">Research report</div></div>`;
  const body = r.phase==="running" ? reportRunningHtml() : r.phase==="failure" ? reportFailureHtml() : reportSuccessHtml();
  $("#view-report").innerHTML = header + body;
  $("#rpt-back").onclick=()=>{ resetReportState(); switchView("dashboard"); };
  wireReportEvents();
}

const REPORT_STEPS=[
  {label:"Reading the posting",detail:"Company, role, location, requirements"},
  {label:"Researching the company",detail:"Docs, changelog, engineering blog, community threads"},
  {label:"Finding the right recipient",detail:"Name, title, address — with a confidence level for each"},
  {label:"Drafting and critiquing",detail:"Writes the email, then reviews it as a skeptical hiring manager"},
];
function reportRunningHtml(){
  const r=STATE.report; const stage=Math.min(3,Math.floor(r.t/26));
  const stepsHtml=REPORT_STEPS.map((s,i)=>{
    const done=i<stage, active=i===stage;
    const dotFill=done?"var(--pine)":active?"#CFE3D6":"#fff";
    const dotRing=i<=stage?"var(--pine)":"#D6D0C5";
    return `<div class="rpt-step"><div class="rpt-step-rail"><div class="rpt-step-dot" style="background:${dotFill};border:1.5px solid ${dotRing};${active?"animation:pulseDot 1.2s ease-in-out infinite":""}">${done?"✓":""}</div><div class="rpt-step-line"></div></div>
      <div class="rpt-step-body"><div class="rpt-step-label" style="color:${i<=stage?"var(--ink)":"var(--ink-faintest)"};font-weight:${active?650:500}">${esc(s.label)}</div><div class="rpt-step-detail">${esc(s.detail)}</div></div></div>`;
  }).join("");
  const mm=Math.floor(r.t/60), ss=String(r.t%60).padStart(2,"0");
  return `<div class="rpt-run">
    <div class="rpt-run-label">Researching</div>
    <div class="rpt-run-co">${esc(r.job.company||"This job")}</div>
    <div class="rpt-run-role"${r.jobUrl&&!r.job.role?` title="${esc(r.jobUrl)}"`:""}>${r.job.role?esc(r.job.role):(r.jobUrl?esc(r.jobUrl):"From the pasted description")}</div>
    <div class="rpt-progress"></div>
    <div class="rpt-steps">${stepsHtml}</div>
    <div class="rpt-run-foot"><div class="note">Runs on its own — leave this page if you like. A banner will show when it's ready.</div><button class="btn" id="rpt-cancel">Cancel</button></div>
    <div class="rpt-elapsed" id="rpt-elapsed">Elapsed ${mm}:${ss} · typically 60–120s</div>
  </div>`;
}
function reportFailureHtml(){
  const r=STATE.report;
  return `<div class="rpt-fail">
    <div class="rpt-fail-tile">✕</div>
    <div class="rpt-fail-title">The agent couldn't finish this one</div>
    <div class="rpt-fail-body">${esc(r.failReason||"Something prevented the research from completing.")}</div>
    <div class="rpt-fail-jd"><textarea id="rpt-jd-paste" placeholder="Paste the job description here"></textarea></div>
    <div class="rpt-fail-actions">
      <button class="btn" id="rpt-log-noresearch">Log without research</button>
      <button class="btn btn-primary" id="rpt-research-text">Research from this text</button>
    </div>
    ${r.jobUrl?`<div class="rpt-fail-url">${esc(r.jobUrl)}</div>`:""}
  </div>`;
}
function reportSuccessHtml(){
  const r=STATE.report; const rec=r.record||{};
  const t=tint(rec.company);
  const confBadge=(level,label)=>{ const L=REPORT_LEVELS[normConf(level)];
    const bars=[0,1,2,3].map(i=>`<div class="conf-bar" style="background:${i<L.n?L.fill:"#E7E3DA"}"></div>`).join("");
    return `<div class="conf-badge" style="border-color:${L.border};background:${L.bg}"><div class="conf-bars">${bars}</div><div><div class="conf-label">${label}</div><div class="conf-level" style="color:${L.fg}">${L.label}</div></div></div>`; };
  const flags=rec.flags||[]; const signals=rec.signals||[]; const hasEmail=!!rec.email;
  const draftNote=r.approved
    ? "Draft created in Gmail. You press send."
    : hasEmail
      ? "Ready to create a Gmail draft. You press send."
      : "Add a recipient email above before you can create a Gmail draft.";
  return `<div class="rpt-body">
    <div class="rpt-summary">
      <div class="rpt-mono" style="background:${t.bg};color:${t.fg}">${monogram(rec.company)}</div>
      <div style="flex:1;min-width:0"><div class="rpt-co">${esc(rec.company)||"—"}</div><div class="rpt-role">${esc(rec.role)||""}${rec.location?" · "+esc(rec.location):""}</div></div>
      <div style="text-align:right">
        ${r.ranSeconds?`<div class="rpt-ran">researched in ${r.ranSeconds}s</div>`:""}
        ${r.jobUrl?`<a class="rpt-view-posting" href="${esc(r.jobUrl)}" target="_blank" rel="noopener">View posting ↗</a>`:""}
      </div>
    </div>

    <div class="conf-badges">
      ${confBadge(rec.recipientConfidence,"Recipient")}
      ${confBadge(rec.emailConfidence,"Email address")}
      ${confBadge(rec.gapConfidence,"Gap thesis")}
    </div>

    <div class="rpt-card">
      <div class="rpt-card-label">Recipient</div>
      <div class="rpt-recipient-row">
        <div style="flex:1;min-width:220px">
          <div class="rpt-recipient-name">${esc(rec.recipient)||"—"}</div>
          <div class="rpt-recipient-title">${esc(rec.recipientTitle)||""}</div>
        </div>
        <div class="rpt-email-col">
          <div class="rpt-card-label" style="margin-bottom:4px">Email address</div>
          ${hasEmail?`<div class="rpt-email-val">${esc(rec.email)}</div>`:`<input class="rpt-email-add" id="rpt-email-input" placeholder="Add an address to send to">`}
        </div>
      </div>
      ${rec.recipientReason?`<div class="rpt-reason"><div class="rpt-reason-label">Reasoning</div><div class="rpt-reason-text">${esc(rec.recipientReason)}</div></div>`:""}
    </div>

    <div class="rpt-card">
      <div class="rpt-card-label">Research findings — the gap</div>
      <div class="rpt-gap">${esc(rec.gapThesis)||"—"}</div>
      ${signals.length?`<div class="rpt-signals">${signals.map(s=>`<div class="rpt-signal"><div class="rpt-signal-dot"></div><div class="rpt-signal-text">${esc(s.text)}</div>${s.sourceUrl?`<a class="rpt-signal-src" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${esc(s.source)}</a>`:`<span class="rpt-signal-src">${esc(s.source)}</span>`}</div>`).join("")}</div>`:""}
    </div>

    ${flags.length?`<div class="rpt-flags">
      <div class="rpt-flags-head"><div class="dot"></div><div class="t">What the agent could not verify</div></div>
      ${flags.map(f=>`<div class="rpt-flag"><div class="rpt-flag-mark">${esc(f.mark||"⚠")}</div><div class="rpt-flag-text">${esc(f.text)}</div>${f.fix?`<button class="rpt-flag-fix" data-fix="${esc(f.fix)}">${esc(f.fix)}</button>`:""}</div>`).join("")}
    </div>`:`<div class="rpt-clean"><div class="dot"></div><div class="t">Everything in this draft traces to a source listed above.</div></div>`}

    <div class="rpt-draft">
      <div class="rpt-draft-head"><div class="l">The draft</div><div style="flex:1"></div><div class="r">Editable — changes are kept</div></div>
      <div class="rpt-draft-body">
        <div class="rpt-draft-field"><label>To</label><span class="rpt-draft-to" style="color:${hasEmail?"var(--ink)":"#9A6414"}">${hasEmail?esc(rec.email):"no recipient yet — add an address above"}</span></div>
        <div class="rpt-draft-field subj"><label>Subject</label><input id="rpt-subject" value="${esc(r.subject)}" placeholder="Subject line"></div>
        <div class="rpt-draft-editable" id="rpt-draft-body" contenteditable="true">${r.body||""}</div>
      </div>
    </div>
  </div>

  <div class="rpt-actionbar"><div class="rpt-actionbar-inner">
    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true"><path d="M2.5 5.5V3.6a3 3 0 0 1 6 0v1.9" stroke="#5A554C" stroke-width="1.4" fill="none"/><rect x="1" y="5.5" width="9" height="6.5" rx="2" fill="#5A554C"/></svg>
    <span class="note">${draftNote}</span>
    <button class="btn" id="rpt-regen">Regenerate research</button>
    <button class="btn btn-primary" id="rpt-approve">${r.approved?"Draft created in Gmail":"Approve · create Gmail draft"}</button>
  </div></div>`;
}
function wireReportEvents(){
  const r=STATE.report; if(!r) return;
  if(r.phase==="running"){
    const cancel=$("#rpt-cancel"); if(cancel) cancel.onclick=()=>{ resetReportState(); switchView("dashboard"); };
  }
  if(r.phase==="failure"){
    $("#rpt-log-noresearch").onclick=async()=>{
      const jd=$("#rpt-jd-paste").value.trim();
      try{
        await api("/api/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({JobURL:r.jobUrl||"",Notes:jd?("Pasted JD: "+jd.slice(0,300)):""})});
        await refresh(); resetReportState(); switchView("dashboard");
      }catch(e){ alert(e.message); }
    };
    $("#rpt-research-text").onclick=()=>{
      const jd=$("#rpt-jd-paste").value.trim(); if(!jd){ $("#rpt-jd-paste").focus(); return; }
      const jobUrl=r.jobUrl;
      STATE.report.jd=jd; STATE.report.jobUrl=jobUrl; STATE.report.phase="running"; STATE.report.pending=false;
      renderReport(); startReportTimer(); runReportPipeline();
    };
  }
  if(r.phase==="success"||r.phase==="degraded"){
    $("#rpt-subject").oninput=(e)=>STATE.report.subject=e.target.value;
    const bodyEl=$("#rpt-draft-body"); if(bodyEl) bodyEl.oninput=(e)=>{ const el=e.target; if(!el.textContent.trim()&&!el.querySelector("img,ul,ol,li")) el.innerHTML=""; STATE.report.body=el.innerHTML; };
    $$(".rpt-flag-fix").forEach(b=>b.onclick=()=>reportFlagFix(b.dataset.fix, r.record.company));
    $("#rpt-regen").onclick=()=>{ const jobUrl=r.jobUrl, jd=r.jd; resetReportState(); STATE.report.jobUrl=jobUrl||""; STATE.report.jd=jd||""; renderReport(); startReportTimer(); runReportPipeline(); };
    $("#rpt-approve").onclick=reportApprove;
  }
}
function reportFlagFix(fix,companyName){
  if(fix==="Attach résumé"){ switchView("settings"); return; }
  if(fix==="Find contact"){ const el=$("#rpt-email-input"); if(el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.focus(); } return; }
  if(fix==="Open portal"){ window.open(`https://www.google.com/search?q=${encodeURIComponent((companyName||"")+" careers")}`,"_blank"); return; }
}
async function reportApprove(){
  const r=STATE.report; const rec=r.record||{};
  const emailInput=$("#rpt-email-input");
  const to=rec.email||(emailInput?emailInput.value.trim():"");
  const msgEl=$(".rpt-actionbar-inner .note");
  if(!to){ if(msgEl) msgEl.textContent="Add a recipient email above before approving."; return; }
  if(!r.rowNumber){ if(msgEl) msgEl.textContent="No row to attach this draft to yet."; return; }
  const btn=$("#rpt-approve"); if(btn){ btn.disabled=true; btn.textContent="Creating…"; }
  try{
    if(!rec.email && to){ await api(`/api/jobs/${r.rowNumber}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({Email:to})}); rec.email=to; }
    const res=await api(`/api/jobs/${r.rowNumber}/draft`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:r.subject,html:r.body})});
    r.approved=true; r.draftId=res.draftId;
    await refresh();
    renderReport();
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent="Approve · create Gmail draft"; }
    if(msgEl) msgEl.textContent="Error: "+e.message;
  }
}

// ---------- settings ----------
function renderSettings(){
  const s=STATE.settings; if(!s)return;
  $("#view-settings").innerHTML=`
    <div><div class="page-title">Settings</div><div class="page-sub">Google connection, sheet, sender, and the AI engine. Secrets stay on your machine.</div></div>
    <div class="settings-grid">
      <section class="set-card">
        <h3>Google connection <button class="help-icon" data-help="google">?</button></h3>
        <p class="muted">Reuses a Google Desktop OAuth client (loopback). Scopes: Sheets + Gmail compose (drafts only).</p>
        <label>Client ID</label><input class="field" id="s-clientId" value="${esc(s.google.clientId)}">
        <label>Client Secret</label><div class="row"><input class="field" id="s-clientSecret" type="${s.google.clientSecret==="********"?"text":"password"}" ${s.google.clientSecret==="********"?'value="••••••••••••" disabled':'placeholder="Paste your client secret"'} style="flex:1"><button class="btn btn-sm ${s.google.clientSecret==="********"?"":"hidden"}" id="s-secret-replace">Replace</button></div>
        <div class="row"><button class="btn btn-sm" id="import-google">Import from coldpitch</button><button class="btn btn-primary btn-sm" id="connect-google">Connect Google</button><span class="muted" id="conn2">${s.oauth.connected?"Connected as "+esc(s.oauth.account):"Not connected"}</span></div>
      </section>
      <section class="set-card">
        <h3>Google Sheet <button class="help-icon" data-help="sheet">?</button></h3>
        <label>Sheet ID</label><input class="field" id="s-sheetId" value="${esc(s.sheet.id)}" placeholder="from the sheet URL /d/THIS/edit">
        <label>Tab name</label><input class="field" id="s-sheetTab" value="${esc(s.sheet.tab)}" placeholder="Sheet1">
      </section>
      <section class="set-card">
        <h3>Sender identity <button class="help-icon" data-help="sender">?</button></h3>
        <p class="muted">Your sending email is your connected Google account${s.oauth.account?" ("+esc(s.oauth.account)+")":""}. First line of the signature is used as your name.</p>
        <label>Signature</label><textarea class="field" id="s-senderSignature" rows="5" placeholder="Jane Doe&#10;Full-stack Developer&#10;jane@gmail.com · +1 …&#10;linkedin.com/in/janedoe">${esc(s.sender.signature||"")}</textarea>
      </section>
      <section class="set-card">
        <h3>AI engine</h3>
        <label>Engine</label><select id="s-engine"><option value="claude-cli"${s.engine==="claude-cli"?" selected":""}>Claude CLI — your Claude subscription (no API key)</option><option value="api"${s.engine==="api"?" selected":""}>Anthropic API key — metered</option></select>
        <label>Résumé path</label><input class="field" id="s-resumePath" value="${esc(s.resumePath)}" placeholder="/Users/…/resume.pdf">
        <label>Anthropic API key</label><input class="field" id="s-anthropicApiKey" type="password" placeholder="only for the API engine">
        <label>Hunter.io key</label><input class="field" id="s-hunterKey" type="password" placeholder="optional — better email verification">
        <label>Follow-up (business days)</label><input class="field" id="s-followUpDays" type="number" value="${s.followUpDays||5}">
      </section>
    </div>
    <div class="row"><button class="btn btn-primary" id="save-settings">Save settings</button><span class="muted" id="save-status"></span></div>`;
  wireSettings();
}
function wireSettings(){
  $("#save-settings").onclick=saveSettings;
  $("#import-google").onclick=async()=>{ try{ const r=await api("/api/settings/import-google",{method:"POST"}); STATE.settings=r.settings; renderSettings(); $("#save-status")&&($("#save-status").textContent="Imported ✓"); }catch(e){ alert(e.message);} };
  $("#connect-google").onclick=()=>{ window.location.href="/api/auth/google"; };
  const rep=$("#s-secret-replace"); if(rep) rep.onclick=()=>{ const sec=$("#s-clientSecret"); sec.disabled=false; sec.type="password"; sec.value=""; sec.placeholder="Paste new client secret"; sec.focus(); rep.classList.add("hidden"); };
  $$("#view-settings .help-icon").forEach(b=>b.onclick=()=>openHelp(b.dataset.help));
}
async function saveSettings(){
  const sec=$("#s-clientSecret");
  const patch={
    google:{ clientId:$("#s-clientId").value, ...(!sec.disabled&&sec.value?{clientSecret:sec.value}:{}) },
    sheet:{ id:$("#s-sheetId").value, tab:$("#s-sheetTab").value||"Sheet1" },
    sender:{ signature:$("#s-senderSignature").value },
    resumePath:$("#s-resumePath").value, engine:$("#s-engine").value, followUpDays:Number($("#s-followUpDays").value)||5,
  };
  if($("#s-anthropicApiKey").value) patch.anthropicApiKey=$("#s-anthropicApiKey").value;
  if($("#s-hunterKey").value) patch.hunterKey=$("#s-hunterKey").value;
  try{ const r=await api("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)}); STATE.settings=r.settings;
    $("#save-status").textContent="Saved ✓"; setTimeout(()=>$("#save-status").textContent="",2000);
    await loadSettings(); await loadJobs();
  }catch(e){ $("#save-status").textContent="Error: "+e.message; }
}

// ---------- help modals ----------
const HELP={
  google:{title:"Get a Google Client ID & Secret",html:`<p class="muted">One-time (~5 min). Create a free Google OAuth “Desktop app” client — only Sheets + Gmail-compose (drafts) scopes.</p>
    <ol class="steps"><li>Open the <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> → create/pick a project.</li>
    <li>Enable <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank">Google Sheets API</a> and <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank">Gmail API</a>.</li>
    <li>OAuth consent screen: External → add your email as a Test user.</li>
    <li>Credentials → Create → OAuth client ID → <b>Desktop app</b>.</li>
    <li>Copy the Client ID + Secret here → Save → Connect Google.</li></ol>
    <p class="muted">Shortcut: “Import from coldpitch” reuses that OAuth client.</p>`},
  sheet:{title:"Set up your tracking Sheet",html:`<ol class="steps"><li>Create a sheet at <a href="https://sheets.new" target="_blank">sheets.new</a>.</li>
    <li>Copy the <b>Sheet ID</b> from the URL (between <code>/d/</code> and <code>/edit</code>).</li>
    <li>Set the <b>Tab name</b> (default Sheet1). Headers are written automatically on first use.</li></ol>`},
  sender:{title:"Sender identity",html:`<p class="muted">The signature is appended to every draft; its first line is used as your name. Email is your connected Google account.</p>`},
};
function openHelp(key){ const h=HELP[key]; if(!h)return; modal(`<div class="modal-head"><h3>${h.title}</h3><button class="dw-close" id="m-close">×</button></div><div class="modal-body">${h.html}</div>`); $("#m-close").onclick=closeModal; }

// ---------- modal plumbing ----------
function modal(inner){ $("#modal-root").innerHTML=`<div class="modal-scrim" id="modal-scrim"></div><div class="modal">${inner}</div>`; $("#modal-scrim").onclick=closeModal; }
function closeModal(){ $("#modal-root").innerHTML=""; }

// ---------- wire ----------
$$(".nav-tab").forEach(t=>t.onclick=()=>switchView(t.dataset.view));
$("#settings-btn").onclick=()=>switchView("settings");
$("#log-btn").onclick=openLog;
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape"){ closeModal(); if(STATE.sel)closeDrawer(); } });

(async function init(){
  let v=localStorage.getItem("jmc-view")||"dashboard"; if(v==="board"||v==="table")v="dashboard";
  await loadSettings();
  await loadJobs();
  const qp=new URLSearchParams(location.search);
  const pendingUrl=qp.get("reportJobUrl");
  if(pendingUrl){ history.replaceState({},"","/"); openReportPending(decodeURIComponent(pendingUrl)); return; }
  switchView(v);
})();
