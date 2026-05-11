<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { StorageService } from '@/services/storage';
import { STAGES } from '@/config/constants';
import { wkRange } from '@/utils/date';
import type { WeeklySnapshot, Project, TaskItem } from '@/core/types';

const appStore = useAppStore();
const projectStore = useProjectStore();
const storage = StorageService.getInstance();

// ── Keys ──────────────────────────────────────────────────
const K = {
  logoHdr: 'hlzc_dash2_logo_header',
  logoDnt: 'hlzc_dash2_logo_donut',
  logoSb:  'hlzc_dash2_logo_sidebar',
  hero:    'hlzc_dash2_hero_imgs',
  ol1:     'hlzc_dash2_overlay',
  ol2:     'hlzc_dash2_overlay2',
  avatar:  (name:string) => `hlzc_dash2_avatar_${name}`,
};

// ── Logo & 头像 ───────────────────────────────────────────
const logoHdr = ref(lsGet(K.logoHdr));
const logoDnt = ref(lsGet(K.logoDnt));
const logoSb  = ref(lsGet(K.logoSb));
const avatars = ref<Record<string,string>>({});  // name→base64

function lsGet(k:string){ return localStorage.getItem(k)||''; }
function lsSet(k:string,v:string){ try{ localStorage.setItem(k,v); }catch{} }
function readImg(e:Event, cb:(v:string)=>void){
  const f=(e.target as HTMLInputElement).files?.[0]; if(!f) return;
  const r=new FileReader(); r.onload=ev=>cb(ev.target!.result as string); r.readAsDataURL(f);
  (e.target as HTMLInputElement).value='';
}
function onLogoHdr(e:Event){ readImg(e,v=>{ logoHdr.value=v; lsSet(K.logoHdr,v); }); }
function onLogoDnt(e:Event){ readImg(e,v=>{ logoDnt.value=v; lsSet(K.logoDnt,v); }); }
function onLogoSb (e:Event){ readImg(e,v=>{ logoSb.value=v;  lsSet(K.logoSb, v); }); }
function onAvatar(name:string, e:Event){
  readImg(e,v=>{ avatars.value={...avatars.value,[name]:v}; lsSet(K.avatar(name),v); });
}
function loadAvatars(names:string[]){
  const obj:Record<string,string>={};
  names.forEach(n=>{ const v=lsGet(K.avatar(n)); if(v) obj[n]=v; });
  avatars.value=obj;
}

// ── Overlay 1 ─────────────────────────────────────────────
function loadOL1(){
  try{ const r=localStorage.getItem(K.ol1); if(r) return JSON.parse(r); }catch{}
  return { heroTitle:'', heroLogic:'', pickedLast:[], confirmed:false, lcolWidth:340, heroHeight:220 };
}
function saveOL1(){
  lsSet(K.ol1, JSON.stringify({
    heroTitle:heroTitle.value, heroLogic:heroLogic.value,
    pickedLast:[...picksLast.value], confirmed:confirmed1.value,
    lcolWidth:lcolWidth.value, heroHeight:heroHeight.value,
  }));
}
function loadHeroImgs():string[]{ try{ const r=localStorage.getItem(K.hero); if(r) return JSON.parse(r); }catch{} return []; }
function saveHeroImgs(){ try{ lsSet(K.hero,JSON.stringify(heroImgs.value)); }catch{ try{ lsSet(K.hero,JSON.stringify(heroImgs.value.slice(0,1))); }catch{} } }

// ── Overlay 2 ─────────────────────────────────────────────
function loadOL2(){
  try{ const r=localStorage.getItem(K.ol2); if(r) return JSON.parse(r); }catch{}
  return { focusText:'', pickedPlan:[], pickedGantt:[], confirmed2:false };
}
function saveOL2(){
  lsSet(K.ol2, JSON.stringify({
    focusText:focusText.value, pickedPlan:[...picksPlan.value],
    pickedGantt:[...picksGantt.value], confirmed2:confirmed2.value,
    confirmedGantt:confirmedGantt.value,
  }));
}

// ── 状态 ──────────────────────────────────────────────────
const activeTab  = ref<'last'|'plan'>('last');
const showModal1 = ref(false);
const showModal2 = ref(false);
const confirmed1 = ref(false);
const heroImgs   = ref<string[]>([]);
const heroTitle  = ref('');
const heroLogic  = ref('');
const picksLast  = ref<Set<string>>(new Set());
const lcolWidth  = ref(340);
const heroHeight = ref(220);
const focusText   = ref('');
const picksPlan   = ref<Set<string>>(new Set());
const picksGantt  = ref<Set<number>>(new Set());
const confirmedGantt = ref(false);   // 甘特独立确认
const confirmed2  = ref(false);      // 本周计划独立确认
const ganttPage = ref(0);            // 进度表页码（确认后分页）
const planPage  = ref(0);            // 本周计划页码（确认后分页）
const GANTT_PER_PAGE = ref(8);       // 进度表每页项数（容器高度计算后填入）
const PLAN_PER_PAGE  = ref(10);      // 本周计划每页项数
const sbWidth     = ref(220);        // 左侧边栏宽度（可拖拽）
let dragX=false, dragY=false, dragSb=false;

// ── 周信息 ────────────────────────────────────────────────
const weekLabel    = computed(()=>`${appStore.yr} · W${String(appStore.wk).padStart(2,'0')}`);
const weekRangeStr = computed(()=>wkRange(appStore.yr, appStore.wk));

// ── 核心数据 ─────────────────────────────────────────────
interface PItem extends Project { snap:WeeklySnapshot; stageName:string; designOwner:string; }
const allItems = computed<PItem[]>(()=>
  projectStore.activeProjects.map(p=>{
    const snap=storage.getSnap(appStore.yr,appStore.wk,p.id,projectStore.projects);
    return { ...p, snap, stageName:STAGES[Math.min(snap.stage,STAGES.length-1)]||'平面', designOwner:(p as any).designOwner||'' };
  }).sort((a,b)=>({r:0,y:1,g:2}[a.snap.status]??0)-({r:0,y:1,g:2}[b.snap.status]??0))
);

const stats = computed(()=>{
  const r=allItems.value.filter(i=>i.snap.status==='r').length;
  const y=allItems.value.filter(i=>i.snap.status==='y').length;
  const g=allItems.value.filter(i=>i.snap.status==='g').length;
  const t=allItems.value.length||1;
  return { r,y,g,total:allItems.value.length,rPct:Math.round(r/t*100),yPct:Math.round(y/t*100),gPct:Math.round(g/t*100) };
});

// 决策卡
interface DecCard{ projId:number; projName:string; isY:boolean; risks:TaskItem[]; decisions:TaskItem[]; }
const decCards = computed<DecCard[]>(()=>allItems.value.reduce<DecCard[]>((acc,p)=>{
  const risks=(Array.isArray(p.snap.risk)?p.snap.risk:[]).filter((x:TaskItem)=>x.text?.trim());
  const decisions=(Array.isArray(p.snap.decision)?p.snap.decision:[]).filter((x:TaskItem)=>x.text?.trim());
  if(risks.length||decisions.length) acc.push({projId:p.id,projName:p.name,isY:p.snap.status==='y',risks,decisions});
  return acc;
},[]));

// 上周完成
interface WorkItem{ key:string; projName:string; projId:number; status:string; text:string; dueDate:string; }
const lastItems = computed<WorkItem[]>(()=>{
  const result:WorkItem[]=[];
  allItems.value.forEach(p=>{
    const co:TaskItem[]=(p.snap as any).coreOutputItems||[];
    (Array.isArray(co)?co:[]).filter((x:TaskItem)=>x.text?.trim()).forEach((x:TaskItem,i:number)=>{
      result.push({key:`l_${p.id}_${i}`,projName:p.name,projId:p.id,status:p.snap.status,text:x.text,dueDate:x.dueDate||''});
    });
  });
  return result;
});

// 本周计划
const planItems = computed<WorkItem[]>(()=>{
  const result:WorkItem[]=[];
  allItems.value.forEach(p=>{
    const ca:TaskItem[]=Array.isArray(p.snap.coreAction)?p.snap.coreAction:[];
    ca.filter((x:TaskItem)=>x.text?.trim()).forEach((x:TaskItem,i:number)=>{
      result.push({key:`p_${p.id}_${i}`,projName:p.name,projId:p.id,status:p.snap.status,text:x.text,dueDate:x.dueDate||''});
    });
  });
  return result;
});

// ── 成员工作量（动态从 designOwner 读取）─────────────────
interface MemberStat{ name:string; projCnt:number; actionCnt:number; pct:number; initials:string; }
const memberStats = computed<MemberStat[]>(()=>{
  const ownerMap = new Map<string,{projCnt:number;actionCnt:number}>();
  allItems.value.forEach(p=>{
    const owner=(p.designOwner||'').trim(); if(!owner) return;
    const cur=ownerMap.get(owner)||{projCnt:0,actionCnt:0};
    cur.projCnt++;
    cur.actionCnt+=(Array.isArray(p.snap.coreAction)?p.snap.coreAction:[]).filter((x:TaskItem)=>x.text?.trim()).length;
    ownerMap.set(owner,cur);
  });
  const total=allItems.value.length||1;
  return [...ownerMap.entries()].map(([name,v])=>({
    name, projCnt:v.projCnt, actionCnt:v.actionCnt,
    pct:Math.round(v.projCnt/total*100),
    initials:name.slice(0,1).toUpperCase(),
  })).sort((a,b)=>b.projCnt-a.projCnt);
});

// ── 甘特图数据 ────────────────────────────────────────────
const ganttRows = computed(()=>{
  const today=new Date(); today.setHours(0,0,0,0);
  const parseD=(s:string|undefined)=>{ if(!s) return null; const d=new Date(String(s).replace(/\//g,'-')); return isNaN(d.getTime())?null:d; };

  // 确认后只显示勾选项目；未确认时全部显示
  const source = (confirmedGantt.value && picksGantt.value.size>0)
    ? allItems.value.filter(p=>picksGantt.value.has(p.id))
    : allItems.value;

  const rawRows = source.map(p=>{
    let start=parseD((p as any).startDate);
    // 末日优先取开业时间 openDate；无则降级竣工时间 completionDate
    let end=parseD((p as any).openDate) || parseD((p as any).completionDate);
    // 防御：end 若早于 start，互换之
    if(start && end && end.getTime() < start.getTime()){ const tmp=start; start=end; end=tmp; }
    const doneDays=start?Math.round((today.getTime()-start.getTime())/86400000):null;
    const dTE=end?Math.round((end.getTime()-today.getTime())/86400000):null;
    const openStr=(p as any).openDate||(p as any).completionDate||'';
    const owner=p.designOwner||'';
    return {id:p.id,name:p.name,status:p.snap.status,start,end,doneDays,dTE,completionStr:openStr,owner};
  });

  // 时间轴范围：本年度 + 跨年延展段
  const curYear = today.getFullYear();
  const yearStart = new Date(curYear, 0, 1);
  const yearEnd   = new Date(curYear, 11, 31, 23, 59, 59);

  // 收集超本年度之最远开业日，以决定延展段年数
  const allValidE=allItems.value
    .map(p=>parseD((p as any).openDate)||parseD((p as any).completionDate))
    .filter((d):d is Date=>!!d).map(d=>d.getTime());
  const maxEndYear = allValidE.length
    ? Math.max(curYear, new Date(Math.max(...allValidE)).getFullYear())
    : curYear;
  const extYears: number[] = [];
  for(let y = curYear+1; y <= maxEndYear; y++) extYears.push(y);

  // 主轴：年初 → 年末；延展：每年占容器 8%
  const mainPctEnd = extYears.length > 0 ? 100 - extYears.length * 8 : 100; // 主轴占多少百分比
  const extPctEach = extYears.length > 0 ? 8 : 0;

  const rStart = yearStart;
  const rEnd   = yearEnd;
  const span = (rEnd.getTime() - rStart.getTime()) || 1;
  const spanDays = span / 86400000;

  // 时间→主轴百分比（仅本年内）
  const timeToMainPct = (t: number) => {
    if(t < rStart.getTime()) return 0;
    if(t > rEnd.getTime())   return mainPctEnd;
    return ((t - rStart.getTime()) / span) * mainPctEnd;
  };
  // 时间→总轴百分比（含延展段）
  const timeToFullPct = (t: number) => {
    const d = new Date(t);
    const y = d.getFullYear();
    if(y <= curYear) return timeToMainPct(t);
    const idx = extYears.indexOf(y);
    if(idx < 0) return mainPctEnd + extYears.length * extPctEach;
    // 在该年内之相对位置
    const ys = new Date(y, 0, 1).getTime();
    const ye = new Date(y, 11, 31, 23, 59, 59).getTime();
    const frac = Math.max(0, Math.min(1, (t - ys) / (ye - ys)));
    return mainPctEnd + idx * extPctEach + frac * extPctEach;
  };

  // 轴标签：主轴按周（本年），延展段按年
  const isoWeek=(d:Date)=>{
    const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const day=t.getUTCDay()||7;
    t.setUTCDate(t.getUTCDate()+4-day);
    const yStart=new Date(Date.UTC(t.getUTCFullYear(),0,1));
    return Math.ceil(((t.getTime()-yStart.getTime())/86400000+1)/7);
  };
  const weeks = Math.ceil(spanDays/7);
  const step = weeks<=24 ? 1 : weeks<=48 ? 2 : weeks<=96 ? 4 : 8;
  const axisMarks:{label:string;pct:number;isYear?:boolean}[]=[];
  const cur=new Date(rStart);
  cur.setDate(cur.getDate()-((cur.getDay()+6)%7));
  let idx=0;
  while(cur<=rEnd){
    const pct=timeToMainPct(cur.getTime());
    if(pct>=-1 && pct<=mainPctEnd+1 && idx%step===0){
      axisMarks.push({label:`W${isoWeek(cur)}`,pct:Math.max(0,pct)});
    }
    cur.setDate(cur.getDate()+7);
    idx++;
  }
  // 延展段年标
  extYears.forEach((y, i) => {
    axisMarks.push({label:`${y}年`,pct: mainPctEnd + i * extPctEach + extPctEach/2,isYear:true});
  });

  const todayPct = timeToFullPct(today.getTime());

  const mappedRows=rawRows.map(r=>{
    // 兜底：若无 start 或 end，仍生成可见条
    const sTime = r.start ? r.start.getTime() : today.getTime() - 14*86400000;
    const eTime = r.end   ? r.end.getTime()   : today.getTime() + 30*86400000;
    let barL=Math.max(0,Math.min(100,timeToFullPct(sTime)));
    let barR=Math.max(0,Math.min(100,timeToFullPct(eTime)));
    if(barR<barL+1) barR=barL+1; // 保证至少 1% 可视宽度
    // 主区/延展区分割：mainPctEnd 处
    const mainEnd = mainPctEnd;
    // 主条段
    const mainBarL = Math.min(barL, mainEnd);
    const mainBarR = Math.min(barR, mainEnd);
    // 延展条段
    const extBarL = Math.max(barL, mainEnd);
    const extBarR = Math.max(barR, mainEnd);
    // 已过/未来：以今日为界（仅在主条段内分；延展段一律半透）
    const tPct=todayPct;
    const donePctL=mainBarL;
    const donePctR=Math.max(mainBarL,Math.min(mainBarR,tPct));
    const futurePctL=Math.max(mainBarL,Math.min(mainBarR,tPct));
    const futurePctR=mainBarR;
    // 文字右锚点：今日线（若在条内）或主条右端
    const labelAnchorPct = (tPct>=mainBarL && tPct<=mainBarR) ? tPct : mainBarR;
    // 条尾位置：贴主条右端（不入延展段）
    const tailAnchor = mainBarR;
    const tailInside = tailAnchor > 80;
    let dteLabel='待定',dteColor='#999';
    if(r.dTE!==null){
      if(r.dTE<0){dteLabel=`超期${Math.abs(r.dTE)}天`;dteColor='#E03B30';}
      else if(r.dTE<=30){dteLabel=`${r.dTE}天`;dteColor='#F59E0B';}
      else{dteLabel=`${r.dTE}天`;dteColor='#10b981';}
    }
    const doneTxt=r.doneDays!==null?(r.doneDays<0?'未开始':`已进行${r.doneDays}天`):'—';
    const noDates=!r.start && !r.end;
    return {...r,barL,barR,mainBarL,mainBarR,extBarL,extBarR,donePctL,donePctR,futurePctL,futurePctR,labelAnchorPct,tailAnchor,tailInside,dteLabel,dteColor,doneTxt,noDates};
  });

  return {rows:mappedRows,todayPct,axisMarks,mainPctEnd,extYears};
});

// ── KPI 指标（侧栏底部） ──────────────────────────────────
const kpiStats = computed(()=>{
  const today=new Date(); today.setHours(0,0,0,0);
  const total=allItems.value.length||1;

  // 1. 上周计划完成率：coreOutputItems 含日期者 / coreAction 总数
  let outDone=0, planTotal=0;
  allItems.value.forEach(p=>{
    const co=(p.snap as any).coreOutputItems||[];
    if(Array.isArray(co)) outDone+=co.filter((x:TaskItem)=>x.text?.trim()).length;
    const ca=p.snap.coreAction;
    if(Array.isArray(ca)) planTotal+=ca.filter((x:TaskItem)=>x.text?.trim()).length;
  });
  const completionPct = planTotal>0 ? Math.round(outDone/(outDone+planTotal)*100) : 0;

  // 2. 项目健康率：绿灯 / 总
  const healthPct = stats.value.gPct;

  // 3. 临期预警率：30天内开业 / 总
  let imminent=0;
  allItems.value.forEach(p=>{
    const end=(p as any).openDate||(p as any).completionDate;
    if(end){
      const d=new Date(String(end).replace(/\//g,'-'));
      if(!isNaN(d.getTime())){
        const dTE=Math.round((d.getTime()-today.getTime())/86400000);
        if(dTE>=0 && dTE<=30) imminent++;
      }
    }
  });
  const imminentPct = Math.round(imminent/total*100);

  // 4 关键指标
  const newTasks = planTotal;
  let overdue=0;
  allItems.value.forEach(p=>{
    const end=(p as any).openDate||(p as any).completionDate;
    if(end){
      const d=new Date(String(end).replace(/\//g,'-'));
      if(!isNaN(d.getTime()) && d.getTime() < today.getTime()) overdue++;
    }
  });
  const decisionCnt = decCards.value.reduce((s,c)=>s+c.decisions.length,0);
  let riskCnt=0;
  allItems.value.forEach(p=>{
    const r=p.snap.risk;
    if(Array.isArray(r)) riskCnt+=r.filter((x:TaskItem)=>x.text?.trim()).length;
  });

  return {
    completionPct, healthPct, imminentPct,
    newTasks, overdue, decisionCnt, riskCnt
  };
});


const isPicked1=(k:string)=>picksLast.value.has(k);
const isPicked2=(k:string)=>picksPlan.value.has(k);
const isGanttPicked=(id:number)=>picksGantt.value.has(id);
const dispLast=computed(()=>lastItems.value.filter(i=>picksLast.value.has(i.key)));
const dispPlan=computed(()=>planItems.value.filter(i=>picksPlan.value.has(i.key)));

// 分页
const ganttPageCount = computed(()=> {
  if(!confirmedGantt.value) return 1;
  return Math.max(1, Math.ceil(ganttRows.value.rows.length / GANTT_PER_PAGE.value));
});
const ganttPagedRows = computed(()=>{
  if(!confirmedGantt.value) return ganttRows.value.rows;
  const start = ganttPage.value * GANTT_PER_PAGE.value;
  return ganttRows.value.rows.slice(start, start + GANTT_PER_PAGE.value);
});
const planPageCount = computed(()=> {
  if(!confirmed2.value) return 1;
  return Math.max(1, Math.ceil(dispPlan.value.length / PLAN_PER_PAGE.value));
});
const planPagedItems = computed(()=>{
  if(!confirmed2.value) return dispPlan.value;
  const start = planPage.value * PLAN_PER_PAGE.value;
  return dispPlan.value.slice(start, start + PLAN_PER_PAGE.value);
});

watch([confirmedGantt, ()=>ganttRows.value.rows.length], ()=>{ ganttPage.value = 0; });
watch([confirmed2, ()=>dispPlan.value.length], ()=>{ planPage.value = 0; });
function togglePick1(k:string){ picksLast.value.has(k)?picksLast.value.delete(k):picksLast.value.add(k); saveOL1(); }
function togglePick2(k:string){ picksPlan.value.has(k)?picksPlan.value.delete(k):picksPlan.value.add(k); saveOL2(); }
function toggleGantt(id:number){ picksGantt.value.has(id)?picksGantt.value.delete(id):picksGantt.value.add(id); saveOL2(); }

// ── 确认 ──────────────────────────────────────────────────
function doConfirmGantt(){ confirmedGantt.value=true; saveOL2(); }
function resetGantt(){ confirmedGantt.value=false; picksGantt.value=new Set(); saveOL2(); }
function doConfirm1(){ confirmed1.value=true; showModal1.value=false; saveOL1(); nextTick(reflow1); }
function doConfirm2(){ confirmed2.value=true; showModal2.value=false; saveOL2(); nextTick(reflow2); }
function resetConfirm1(){ confirmed1.value=false; saveOL1(); }
function resetConfirm2(){ confirmed2.value=false; saveOL2(); }

// ── Hero ──────────────────────────────────────────────────
const fileInput=ref<HTMLInputElement|null>(null);
function heroClick(){ if(!heroImgs.value.length) fileInput.value?.click(); }
function triggerUpload(){ fileInput.value?.click(); }
function onFile(e:Event){
  const f=(e.target as HTMLInputElement).files?.[0]; if(!f||heroImgs.value.length>=3) return;
  const r=new FileReader(); r.onload=ev=>{ heroImgs.value.push(ev.target!.result as string); saveHeroImgs(); nextTick(reflow1); };
  r.readAsDataURL(f); (e.target as HTMLInputElement).value='';
}
function hDel(){ if(heroImgs.value.length){ heroImgs.value.pop(); saveHeroImgs(); nextTick(reflow1); } }

// ── 拖拽 ──────────────────────────────────────────────────
function onDragXDown(){ dragX=true; document.body.style.cursor='col-resize'; }
function onDragYDown(){ dragY=true; document.body.style.cursor='row-resize'; }
function onDragSbDown(){ dragSb=true; document.body.style.cursor='col-resize'; }
function onMouseMove(e:MouseEvent){
  if(!dragX&&!dragY&&!dragSb) return;
  if(dragX){ const b=document.getElementById('body1'); if(b) lcolWidth.value=Math.max(260,Math.min(e.clientX-b.getBoundingClientRect().left-16,480)); }
  if(dragY){ const rc=document.getElementById('rcol1'); if(rc) heroHeight.value=Math.max(140,Math.min(e.clientY-rc.getBoundingClientRect().top,rc.offsetHeight-120)); }
  if(dragSb){ const b=document.getElementById('body2el'); if(b) sbWidth.value=Math.max(180,Math.min(e.clientX-b.getBoundingClientRect().left-6,320)); }
  reflow1();
}
function onMouseUp(){ dragX=false; dragY=false; dragSb=false; document.body.style.cursor='default'; saveOL1(); }

// ── Reflow ────────────────────────────────────────────────
function reflow1(){
  nextTick(()=>{
    const rcol=document.getElementById('rcol1'); const wa=document.getElementById('wa1');
    if(!rcol||!wa) return;
    const workH=rcol.offsetHeight-heroHeight.value-16; if(workH>0) wa.style.height=workH+'px';
    wa.querySelectorAll<HTMLElement>('.work-card').forEach(card=>{
      const hdrH=card.querySelector<HTMLElement>('.card-hdr')?.offsetHeight||50;
      const listEl=card.querySelector<HTMLElement>('.wi-list,.disp-list'); if(!listEl) return;
      const items=listEl.querySelectorAll<HTMLElement>('.wi,.disp-item'); if(!items.length) return;
      if(!confirmed1.value){ const per=Math.max(32,Math.floor((workH-hdrH-28)/items.length)); items.forEach(it=>{it.style.height=per+'px';it.style.alignItems='center';}); }
      else{ items.forEach(it=>{it.style.height='auto';it.style.minHeight='34px';it.style.alignItems='flex-start';it.style.padding='5px 8px';}); }
    });
  });
}
function reflow2(){
  nextTick(()=>{
    // 本周计划：测算每页项数
    const wa=document.getElementById('wa2');
    if(wa){
      const card=wa.querySelector<HTMLElement>('.work-card');
      if(card){
        const hdrH=card.querySelector<HTMLElement>('.card-hdr')?.offsetHeight||50;
        const avail=wa.offsetHeight-hdrH-28;
        // 确认后：行高 24（条 20 + 间距 4），算每页能容多少
        if(confirmed2.value){
          const perPage = Math.max(1, Math.floor(avail / 24));
          PLAN_PER_PAGE.value = perPage;
        } else {
          // 勾选前：固定行高 32，可滚
          const listEl=card.querySelector<HTMLElement>('.wi-list');
          if(listEl){
            const items=listEl.querySelectorAll<HTMLElement>('.wi');
            items.forEach(it=>{it.style.height='32px';it.style.alignItems='center';});
          }
        }
      }
    }
    // 进度表：测算每页项数
    const ga=document.getElementById('gantt-card');
    if(ga){
      const hdrH=ga.querySelector<HTMLElement>('.card-hdr')?.offsetHeight||50;
      const headH=ga.querySelector<HTMLElement>('.gantt-head')?.offsetHeight||30;
      const noteH=ga.querySelector<HTMLElement>('.gantt-note')?.offsetHeight||14;
      const avail=ga.offsetHeight-hdrH-headH-noteH-28;
      if(confirmedGantt.value){
        // 确认后行高 ~24px（20 + 间距 4）
        const perPage = Math.max(1, Math.floor(avail / 24));
        GANTT_PER_PAGE.value = perPage;
      }
    }
  });
}

// ── 环形图 ────────────────────────────────────────────────
function drawDonut(id:string){
  const canvas=document.getElementById(id) as HTMLCanvasElement; if(!canvas) return;
  const ctx=canvas.getContext('2d')!; ctx.clearRect(0,0,116,116);
  const cx=58,cy=58,segs=28,gap=0.055,ba=(Math.PI*2)/segs;
  const {r,y,g,total}=stats.value; if(!total) return;
  const rS=Math.round(r/total*segs),yS=Math.round(y/total*segs),gS=Math.round(g/total*segs);
  let ang=-Math.PI/2;
  for(let i=0;i<segs;i++){ctx.beginPath();ctx.arc(cx,cy,44,ang+gap,ang+ba-gap);ctx.arc(cx,cy,36,ang+ba-gap,ang+gap,true);ctx.closePath();ctx.fillStyle=i<rS?'#E03B30':i<rS+yS?'#F59E0B':'rgba(0,0,0,0.06)';ctx.fill();ang+=ba;}
  ang=-Math.PI/2;
  for(let i=0;i<segs;i++){ctx.beginPath();ctx.arc(cx,cy,56,ang+gap,ang+ba-gap);ctx.arc(cx,cy,48,ang+ba-gap,ang+gap,true);ctx.closePath();ctx.fillStyle=i<gS?'#34C759':'rgba(0,0,0,0.06)';ctx.fill();ang+=ba;}
}

// 成员小环形图
function drawMemberRing(id:string, pct:number, color:string){
  const c=document.getElementById(id) as HTMLCanvasElement; if(!c) return;
  const ctx=c.getContext('2d')!; ctx.clearRect(0,0,42,42);
  ctx.beginPath(); ctx.arc(21,21,17,0,Math.PI*2); ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=3.5; ctx.stroke();
  if(pct>0){
    ctx.beginPath(); ctx.arc(21,21,17,-Math.PI/2,-Math.PI/2+(Math.PI*2*pct/100));
    ctx.strokeStyle=color; ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.stroke();
  }
}

// ── 初始化 ────────────────────────────────────────────────
onMounted(()=>{
  const ol1=loadOL1(); const ol2=loadOL2();
  heroImgs.value=loadHeroImgs();
  heroTitle.value=ol1.heroTitle||''; heroLogic.value=ol1.heroLogic||'';
  picksLast.value=new Set(ol1.pickedLast||[]); confirmed1.value=ol1.confirmed||false;
  lcolWidth.value=ol1.lcolWidth||340; heroHeight.value=ol1.heroHeight||220;
  focusText.value=ol2.focusText||'';
  picksPlan.value=new Set(ol2.pickedPlan||[]); confirmed2.value=ol2.confirmed2||false;
  picksGantt.value=new Set((ol2.pickedGantt||[]).map(Number));
  confirmedGantt.value=ol2.confirmedGantt||false;
  nextTick(()=>{ drawDonut('donut1'); reflow1(); });
  window.addEventListener('resize',()=>{ reflow1(); reflow2(); });
});
onUnmounted(()=>window.removeEventListener('resize',()=>{}));

watch(activeTab, tab=>{
  nextTick(()=>{
    if(tab==='last'){ drawDonut('donut1'); reflow1(); }
    else{
      loadAvatars(memberStats.value.map(m=>m.name));
      nextTick(()=>{
        const colors=['#6366f1','#10b981','#f59e0b','#e03b30','#8b5cf6'];
        memberStats.value.forEach((m,i)=>drawMemberRing(`mring${i}`,m.pct,colors[i%colors.length]));
        reflow2();
      });
    }
  });
});

watch([confirmedGantt, confirmed2], ()=>{ reflow2(); });

watch(memberStats, ()=>{
  if(activeTab.value==='plan'){
    loadAvatars(memberStats.value.map(m=>m.name));
  }
},{immediate:false});

// ── 工具 ─────────────────────────────────────────────────
function nm(n:string,len=8){ return n.length>len?n.slice(0,len)+'…':n; }
function fmtDate(d:string){ if(!d) return ''; const m=d.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/); return m?`${m[2]}/${m[3]}`:d; }
function statusGrad(s:string){ return s==='r'?'linear-gradient(90deg,#ff6b6b,#e03b30)':s==='y'?'linear-gradient(90deg,#ffd166,#f59e0b)':'linear-gradient(90deg,#06d6a0,#10b981)'; }
function statusShadow(s:string){ return s==='r'?'rgba(224,59,48,0.35)':s==='y'?'rgba(245,158,11,0.35)':'rgba(16,185,129,0.35)'; }
function ownerColor(name:string){
  const palette=['#6366f1','#10b981','#f59e0b','#e03b30','#8b5cf6'];
  const idx=memberStats.value.findIndex(m=>m.name===name);
  return idx>=0?palette[idx%5]:'#6366f1';
}
</script>

<template>
<div class="slide" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">

<!-- ═══ HEADER ═══ -->
<div class="hdr">
  <div class="hl">
    <div class="logo-box">
      <img v-if="logoHdr" :src="logoHdr" class="logo-img" alt="">
      <span v-else class="logo-hint">LOGO</span>
      <input type="file" accept="image/*" class="logo-input" @change="onLogoHdr">
    </div>
    <div class="hd-sep"></div>
    <div><div class="hd-cn">华力集团 研策部周报</div><div class="hd-en">RESEARCH &amp; STRATEGY DEPT · WEEKLY REPORT</div></div>
  </div>
  <div class="hr">
    <span class="wbadge">{{ weekLabel }}</span>
    <span class="wdate">{{ weekRangeStr }}</span>
    <div class="tab-group">
      <button :class="['tab-btn',activeTab==='last'&&'active']" @click="activeTab='last'">📋 上周总结</button>
      <button :class="['tab-btn',activeTab==='plan'&&'active']" @click="activeTab='plan'">🗓 本周计划</button>
    </div>
    <template v-if="activeTab==='last'">
      <button v-if="confirmed1" class="hbtn" @click="resetConfirm1">重新选择</button>
      <button class="cfm-btn" @click="showModal1=true">确认选项 →</button>
      <button class="hbtn" @click="triggerUpload">＋ 图片</button>
      <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFile">
    </template>
    <!-- 本周计划 Tab：确认按钮移至各区域表头，顶栏仅保留图片按钮 -->
  </div>
</div>

<!-- ═══ SCREEN 1：上周总结 ═══ -->
<div v-show="activeTab==='last'" class="body" id="body1">
  <div class="lcol" :style="{width:lcolWidth+'px'}">
    <!-- 健康度 -->
    <div class="health-card glass" id="hCard1">
      <div class="card-hdr"><span class="card-icon">📊</span><span class="card-title">项目健康度</span></div>
      <div class="health-inner">
        <div class="health-stats">
          <div v-for="(it,i) in [{lbl:'需决策/卡住',val:stats.r,pct:stats.rPct,c:'#E03B30'},{lbl:'需关注',val:stats.y,pct:stats.yPct,c:'#F59E0B'},{lbl:'正常推进',val:stats.g,pct:stats.gPct,c:'#34C759'}]" :key="i" class="stat-row">
            <div class="stat-label"><div class="stat-name"><div class="stat-dot" :style="{background:it.c}"></div>{{it.lbl}}</div><div class="stat-val">{{it.val}}</div></div>
            <div class="prog-track"><div class="prog-fill" :style="{width:it.pct+'%',background:it.c}"></div></div>
          </div>
        </div>
        <div class="donut-wrap" title="点击上传饼图Logo">
          <img v-if="logoDnt" :src="logoDnt" class="donut-logo" alt="">
          <canvas id="donut1" width="116" height="116"></canvas>
          <input type="file" accept="image/*" class="donut-input" @change="onLogoDnt">
        </div>
      </div>
      <div class="total-badge"><span class="tot-label">在建项目</span><span class="tot-val">{{stats.total}} 个</span></div>
    </div>
    <!-- 决策卡 -->
    <div class="dec-card glass">
      <div class="card-hdr"><span class="card-icon">🚨</span><span class="card-title">需要决策的问题</span></div>
      <div class="dec-list">
        <div v-for="c in decCards" :key="c.projId" :class="['dc',c.isY?'y':'']">
          <div class="dc-name">{{c.projName}}</div>
          <div v-for="(x,i) in c.risks" :key="'r'+i" class="dc-row"><span class="dc-lbl r">卡点</span><span class="dc-txt">{{x.text}}</span></div>
          <div v-for="(x,i) in c.decisions" :key="'d'+i" class="dc-row"><span class="dc-lbl d">决策</span><span class="dc-txt dc-act">{{x.text}}</span></div>
        </div>
        <div v-if="!decCards.length" class="dec-empty">本周无需决策项目 ✓</div>
      </div>
    </div>
  </div>

  <div class="resizer-x" @mousedown="onDragXDown"></div>

  <div class="rcol" id="rcol1">
    <div class="hero-zone glass-dk" :style="{height:heroHeight+'px'}" @click="heroClick">
      <div class="hero-hdr-bar"><span>🖼</span><span class="hero-hd-title">上周项目图片精选</span></div>
      <div v-if="heroImgs.length" class="hero-imgs">
        <div v-for="(s,i) in heroImgs" :key="i" class="hero-img-wrap"><img :src="s" alt=""></div>
      </div>
      <div v-else class="hero-empty"><div style="font-size:24px;color:rgba(255,255,255,.3)">＋</div><div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:6px">点击上传图片（最多3张）</div></div>
      <div v-if="heroImgs.length" class="hero-cap">
        <div class="hero-cap-tag">上周视觉聚焦</div>
        <div class="hero-cap-title" contenteditable="true" @click.stop @input="(e)=>{heroTitle=(e.target as HTMLElement).innerText;saveOL1()}">{{heroTitle}}</div>
        <div class="hero-cap-logic" contenteditable="true" @click.stop @input="(e)=>{heroLogic=(e.target as HTMLElement).innerText;saveOL1()}">{{heroLogic}}</div>
      </div>
      <div v-if="heroImgs.length" class="hero-acts" @click.stop>
        <div v-if="heroImgs.length<3" class="h-btn" @click="triggerUpload">＋图片</div>
        <div class="h-btn del" @click="hDel">删除</div>
      </div>
    </div>
    <div class="resizer-y" @mousedown="onDragYDown"></div>
    <div id="wa1" class="work-area">
      <div class="work-card glass">
        <div class="card-hdr">
          <span class="card-icon">🧠</span><span class="card-title">上周核心完成工作</span>
          <div v-if="!confirmed1&&picksLast.size" class="wc-cnt">已选 {{picksLast.size}} 项</div>
          <div v-if="confirmed1" class="wc-cnt">共 {{dispLast.length}} 项</div>
          <span class="col-hint">完成时间</span>
        </div>
        <div v-if="!confirmed1" class="wi-list">
          <div v-for="it in lastItems" :key="it.key" :class="['wi',isPicked1(it.key)&&'picked']" @click="togglePick1(it.key)">
            <div :class="['wi-chk',isPicked1(it.key)&&'checked']">{{isPicked1(it.key)?'✓':''}}</div>
            <div :class="['wi-badge',it.status]">{{nm(it.projName)}}</div>
            <div class="wi-txt">{{it.text}}</div>
            <div class="wi-date">{{fmtDate(it.dueDate)}}</div>
          </div>
          <div v-if="!lastItems.length" class="list-empty">暂无记录</div>
        </div>
        <div v-else class="disp-list">
          <div v-for="it in dispLast" :key="it.key" class="disp-item">
            <div :class="['di-badge',it.status]">{{nm(it.projName)}}</div>
            <div class="di-txt">{{it.text}}</div>
            <div class="di-date">{{fmtDate(it.dueDate)}}</div>
          </div>
          <div v-if="!dispLast.length" class="list-empty">未选择条目</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══ SCREEN 2：本周计划 ═══ -->
<div v-show="activeTab==='plan'" class="body body2" id="body2el">

  <!-- 左侧深色边栏（可拖拽）-->
  <div class="sidebar" :style="{width:sbWidth+'px'}">
    <div class="sb-logo-wrap" title="上传研策部Logo">
      <img v-if="logoSb" :src="logoSb" class="sb-logo-img" alt="">
      <div v-else class="sb-logo-hint">研策部<br>LOGO</div>
      <input type="file" accept="image/*" class="logo-input" @change="onLogoSb">
    </div>

    <div class="sb-focus">
      <div class="sb-sec-lbl">本周重点项目</div>
      <textarea
        class="sb-focus-text"
        v-model="focusText"
        @input="saveOL2"
        placeholder="点击输入重点项目内容…"
        rows="3"
      ></textarea>
    </div>

    <div class="sb-members">
      <div class="sb-sec-lbl">成员工作量</div>
      <!-- 头像一排展示 -->
      <div class="sb-avatar-row">
        <div v-for="(m,i) in memberStats" :key="m.name" class="sb-avatar-item" :title="m.name">
          <div class="sb-avatar-wrap">
            <img v-if="avatars[m.name]" :src="avatars[m.name]" class="sb-avatar-img" alt="">
            <div v-else class="sb-avatar-init" :style="{background:['#6366f1','#10b981','#f59e0b','#e03b30','#8b5cf6'][i%5]}">{{m.initials}}</div>
            <input type="file" accept="image/*" class="logo-input" @change="(e)=>onAvatar(m.name,e)">
          </div>
          <div class="sb-avatar-name">{{nm(m.name,3)}}</div>
        </div>
      </div>
      <!-- 环形图列表 -->
      <div class="sb-ring-list">
        <div v-for="(m,i) in memberStats" :key="m.name" class="sb-ring-item">
          <div class="sb-ring-wrap">
            <canvas :id="'mring'+i" width="42" height="42"></canvas>
            <div class="sb-ring-pct">{{m.pct}}%</div>
          </div>
          <div class="sb-ring-info">
            <div class="sb-ring-name">{{m.name}}</div>
            <div class="sb-ring-big">{{m.projCnt}}<span class="sb-ring-unit"> 项目</span></div>
            <div class="sb-ring-sm">{{m.actionCnt}} 条任务</div>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI 综合指标（总经理视角） -->
    <div class="sb-kpi">
      <div class="sb-kpi-grid sb-kpi-grid-2">
        <div class="sb-kpi-cell">
          <div class="sb-kpi-num">{{kpiStats.newTasks}}</div>
          <div class="sb-kpi-cap">本周任务数</div>
        </div>
        <div class="sb-kpi-cell" :class="{'warn':kpiStats.riskCnt>0}">
          <div class="sb-kpi-num">{{kpiStats.riskCnt}}</div>
          <div class="sb-kpi-cap">风险点</div>
        </div>
      </div>
    </div>
  </div>
  <div class="resizer-sb" @mousedown="onDragSbDown"></div>

  <!-- 右侧主区 -->
  <div class="main-area">

    <!-- 甘特图（图2风格） -->
    <div id="gantt-card" class="gantt-card glass" :class="{'card-confirmed':confirmedGantt}">
      <div class="card-hdr">
        <span class="card-icon-svg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="6" y="13" width="3" height="5" rx="0.5" fill="currentColor"/><rect x="11" y="9" width="3" height="9" rx="0.5" fill="currentColor"/><rect x="16" y="6" width="3" height="12" rx="0.5" fill="currentColor"/></svg>
        </span>
        <span class="card-title">项目进度表</span>
        <span v-if="!confirmedGantt" style="font-size:9px;color:var(--text-sec);margin-left:6px">· 勾选后确认显示</span>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <span v-if="confirmedGantt" style="font-size:11px;color:#10b981;font-weight:700">已确认 {{picksGantt.size}} 项</span>
          <!-- 分页器 -->
          <div v-if="confirmedGantt && ganttPageCount>1" class="pager">
            <button class="pager-btn" :disabled="ganttPage===0" @click="ganttPage--">‹</button>
            <span class="pager-num">{{ganttPage+1}}/{{ganttPageCount}}</span>
            <button class="pager-btn" :disabled="ganttPage>=ganttPageCount-1" @click="ganttPage++">›</button>
          </div>
          <button v-if="confirmedGantt" class="card-hdr-btn ghost" @click="resetGantt">重置</button>
          <button v-if="!confirmedGantt" :disabled="!picksGantt.size" class="card-hdr-btn primary" @click="doConfirmGantt">确认甘特选择 →</button>
        </div>
      </div>
      <!-- 轴 -->
      <div class="gantt-head">
        <div class="gantt-name-col"></div>
        <div class="gantt-track-col" style="position:relative">
          <!-- 网格线 -->
          <div v-for="(ax,i) in ganttRows.axisMarks" :key="i" class="gantt-grid-line" :style="{left:ax.pct+'%'}"></div>
          <!-- 主区/延展区分隔 -->
          <div v-if="ganttRows.extYears.length>0" class="gantt-year-divider" :style="{left:ganttRows.mainPctEnd+'%'}"></div>
          <!-- 轴标签 -->
          <div v-for="(ax,i) in ganttRows.axisMarks" :key="'l'+i" class="gantt-axis-lbl" :class="{'gantt-axis-lbl-year':ax.isYear}" :style="{left:ax.pct+'%'}">{{ax.label}}</div>
          <!-- 今日线标题 -->
          <div class="gantt-today-head" :style="{left:ganttRows.todayPct+'%'}">今天</div>
        </div>
      </div>
      <!-- 行 -->
      <div class="gantt-body" :class="{'gantt-body-confirmed':confirmedGantt,'gantt-body-pickable':!confirmedGantt}">
        <div v-for="row in ganttPagedRows" :key="row.id" class="gantt-row" :class="{'gantt-row-confirmed':confirmedGantt}">
          <!-- 勾选+项目名 -->
          <div class="gantt-name-col">
            <div :class="['g-chk',isGanttPicked(row.id)&&'checked']" @click="toggleGantt(row.id)">{{isGanttPicked(row.id)?'✓':''}}</div>
            <div class="gantt-proj-name" :title="row.name">{{row.name}}</div>
          </div>
          <!-- 时间条 -->
          <div class="gantt-track-col" style="position:relative">
            <!-- 网格线（行内） -->
            <div v-for="(ax,i) in ganttRows.axisMarks" :key="i" class="gantt-row-grid" :style="{left:ax.pct+'%'}"></div>
            <!-- 主区/延展区分隔（行内） -->
            <div v-if="ganttRows.extYears.length>0" class="gantt-year-divider gantt-year-divider-row" :style="{left:ganttRows.mainPctEnd+'%'}"></div>
            <!-- 今日线 -->
            <div class="gantt-today-bar" :style="{left:ganttRows.todayPct+'%'}"></div>
            <!-- 项目条：分段（已过实色 / 未来半透 / 跨年延展虚段） -->
            <template v-if="!row.noDates">
              <!-- 已过部分（深色，主区内） -->
              <div
                v-if="(row.donePctR - row.donePctL) > 0.1"
                class="gantt-bar gantt-bar-done"
                :style="{left:row.donePctL+'%',width:(row.donePctR-row.donePctL)+'%',background:statusGrad(row.status),boxShadow:`0 3px 10px ${statusShadow(row.status)}`}"
              ></div>
              <!-- 未来部分（浅色，主区内） -->
              <div
                v-if="(row.futurePctR - row.futurePctL) > 0.1"
                class="gantt-bar gantt-bar-future"
                :style="{left:row.futurePctL+'%',width:(row.futurePctR-row.futurePctL)+'%',background:statusGrad(row.status),opacity:0.35}"
              ></div>
              <!-- 跨年延展虚条（超本年部分） -->
              <div
                v-if="(row.extBarR - row.extBarL) > 0.1"
                class="gantt-bar gantt-bar-ext"
                :style="{left:row.extBarL+'%',width:(row.extBarR-row.extBarL)+'%',background:statusGrad(row.status),opacity:0.18}"
              ></div>
              <!-- 文字层：右锚于今日线或主条右端 -->
              <div
                class="gantt-label-out"
                :style="{right:(100 - row.labelAnchorPct) + '%'}"
              >Preliminary work</div>
              <div
                class="gantt-label-in"
                :style="{
                  right:(100 - row.labelAnchorPct) + '%',
                  clipPath:'inset(0 ' + (100 - row.labelAnchorPct) + '% 0 ' + row.donePctL + '%)'
                }"
              >Preliminary work</div>
              <!-- 条尾信息：贴主条右端 -->
              <div
                class="gantt-tail"
                :class="{'gantt-tail-inside':row.tailInside}"
                :style="row.tailInside
                  ? {right:(100 - row.tailAnchor) + '%',transform:'translateY(-50%)'}
                  : {left:'calc(' + Math.min(row.tailAnchor,100) + '% + 6px)',transform:'translateY(-50%)'}"
              >
                <span class="gantt-tail-icon" title="已进行天数">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {{row.doneDays!==null && row.doneDays>=0 ? row.doneDays + 'd' : '—'}}
                </span>
                <span class="gantt-tail-icon" title="开业时间">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {{row.completionStr ? fmtDate(row.completionStr) : '待定'}}
                </span>
                <div
                  v-if="row.owner"
                  class="g-owner-av g-owner-av-tail"
                  :style="{background:ownerColor(row.owner)}"
                  :title="row.owner"
                >
                  <img v-if="avatars[row.owner]" :src="avatars[row.owner]" alt="">
                  <span v-else>{{row.owner.slice(0,1)}}</span>
                </div>
              </div>
            </template>
            <div v-else class="gantt-bar-dash">{{row.name}} <span style="opacity:.5">（待定）</span></div>
          </div>
        </div>
        <div v-if="!ganttRows.rows.length" class="list-empty" style="padding:20px">请勾选左侧项目，或暂无数据</div>
      </div>
      <div class="gantt-note">橙线=今天 · 红=超期 · 橙=30天内 · 绿=正常</div>
    </div>

    <!-- 本周计划 -->
    <div id="wa2" class="work-area2">
      <div class="work-card glass" :class="{'card-confirmed':confirmed2}">
        <div class="card-hdr">
          <span class="card-icon-svg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </span><span class="card-title">本周重点工作计划</span>
          <div v-if="!confirmed2&&picksPlan.size" class="wc-cnt">已选 {{picksPlan.size}} 项</div>
          <div v-if="confirmed2" class="wc-cnt">共 {{dispPlan.length}} 项</div>
          <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
            <!-- 分页器 -->
            <div v-if="confirmed2 && planPageCount>1" class="pager">
              <button class="pager-btn" :disabled="planPage===0" @click="planPage--">‹</button>
              <span class="pager-num">{{planPage+1}}/{{planPageCount}}</span>
              <button class="pager-btn" :disabled="planPage>=planPageCount-1" @click="planPage++">›</button>
            </div>
            <span class="col-hint" style="margin-left:0">截止时间</span>
            <button v-if="confirmed2" class="card-hdr-btn ghost" @click="resetConfirm2">重新选择</button>
            <button v-if="!confirmed2" :disabled="!picksPlan.size" class="card-hdr-btn primary" @click="showModal2=true">确认计划 →</button>
          </div>
        </div>
        <div v-if="!confirmed2" class="wi-list">
          <div v-for="it in planItems" :key="it.key" :class="['wi',isPicked2(it.key)&&'picked']" @click="togglePick2(it.key)">
            <div :class="['wi-chk',isPicked2(it.key)&&'checked']">{{isPicked2(it.key)?'✓':''}}</div>
            <div class="wi-pname">{{it.projName}}</div>
            <div class="wi-txt">{{it.text}}</div>
            <div class="wi-date">{{fmtDate(it.dueDate)}}</div>
          </div>
          <div v-if="!planItems.length" class="list-empty">暂无本周计划</div>
        </div>
        <div v-else class="disp-list disp-list-confirmed">
          <div v-for="it in planPagedItems" :key="it.key" class="disp-item disp-item-confirmed">
            <div class="di-pname">{{it.projName}}</div>
            <div class="di-txt">{{it.text}}</div>
            <div class="di-date">{{fmtDate(it.dueDate)}}</div>
          </div>
          <div v-if="!dispPlan.length" class="list-empty">未选择条目</div>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- MODAL 1 -->
<Teleport to="body">
  <div v-if="showModal1" class="overlay show" @click.self="showModal1=false">
    <div class="modal glass">
      <div class="modal-title">📋 确认上周完成工作</div>
      <div class="modal-sub">确认后页面自动排版展示。</div>
      <div class="modal-sec"><div class="modal-sec-lbl">🧠 上周核心完成工作</div>
        <div class="modal-list">
          <div v-for="it in dispLast" :key="it.key" class="modal-item"><span class="modal-proj">{{it.projName}}</span>{{it.text}}<span v-if="it.dueDate" class="modal-date">{{fmtDate(it.dueDate)}}</span></div>
          <div v-if="!dispLast.length" class="modal-empty">未选择任何条目</div>
        </div>
      </div>
      <div class="modal-btns"><button class="m-cancel" @click="showModal1=false">返回修改</button><button class="m-ok" @click="doConfirm1">✓ 确认提交</button></div>
    </div>
  </div>
</Teleport>

<!-- MODAL 2 -->
<Teleport to="body">
  <div v-if="showModal2" class="overlay show" @click.self="showModal2=false">
    <div class="modal glass">
      <div class="modal-title">🗓 确认本周工作计划</div>
      <div class="modal-sub">确认后页面自动排版展示。</div>
      <div class="modal-sec"><div class="modal-sec-lbl">📋 本周重点工作计划</div>
        <div class="modal-list">
          <div v-for="it in dispPlan" :key="it.key" class="modal-item"><span class="modal-proj">{{it.projName}}</span>{{it.text}}<span v-if="it.dueDate" class="modal-date">{{fmtDate(it.dueDate)}}</span></div>
          <div v-if="!dispPlan.length" class="modal-empty">未选择任何条目</div>
        </div>
      </div>
      <div class="modal-btns"><button class="m-cancel" @click="showModal2=false">返回修改</button><button class="m-ok" @click="doConfirm2">✓ 确认提交</button></div>
    </div>
  </div>
</Teleport>

</div>
</template>

<style scoped>
.slide{
  --text-main:#1d1d1f;--text-sec:#86868b;--accent-red:#E03B30;--accent-yellow:#F59E0B;--accent-green:#34C759;
  --radius-card:20px;--radius-inner:12px;
  width:1280px;height:720px;flex-shrink:0;position:relative;overflow:hidden;
  background:linear-gradient(135deg,#f8f7f4 0%,#edeae3 50%,#e8ece9 100%);
  display:flex;flex-direction:column;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;color:var(--text-main);
  border-radius:28px;box-shadow:0 30px 80px rgba(0,0,0,0.12);
}
.glass{background:rgba(255,255,255,.7);backdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%);border:1px solid rgba(255,255,255,.85);box-shadow:0 2px 20px rgba(0,0,0,.05);}
.glass-dk{background:rgba(15,15,20,.72);backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,.1);}
*{scrollbar-width:none;-ms-overflow-style:none;}&::-webkit-scrollbar{display:none;}

/* HEADER */
.hdr{position:relative;z-index:10;height:54px;flex-shrink:0;background:rgba(248,247,244,.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center;justify-content:space-between;padding:0 20px;}
.hl{display:flex;align-items:center;gap:14px;}
.logo-box{width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.6);border:1px solid rgba(0,0,0,.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;cursor:pointer;position:relative;}
.logo-img{width:100%;height:100%;object-fit:cover;display:block;}
.logo-hint{font-size:8px;color:var(--text-sec);font-weight:600;}
.logo-input{position:absolute;inset:0;opacity:0;cursor:pointer;z-index:10;width:100%;height:100%;}
.hd-sep{width:1px;height:22px;background:rgba(0,0,0,.1);flex-shrink:0;}
.hd-cn{font-size:16px;font-weight:800;letter-spacing:-.3px;}
.hd-en{font-size:8px;font-weight:600;color:var(--text-sec);letter-spacing:.2em;margin-top:1px;text-transform:uppercase;}
.hr{display:flex;align-items:center;gap:8px;}
.wbadge{font-size:12px;font-weight:800;background:#fff;padding:4px 12px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.05);}
.wdate{font-size:11px;color:var(--text-sec);}
.tab-group{display:flex;gap:2px;background:rgba(0,0,0,.05);border-radius:12px;padding:3px;}
.tab-btn{font-size:11px;font-weight:600;padding:5px 14px;border-radius:9px;border:none;background:transparent;color:var(--text-sec);cursor:pointer;transition:all .2s;}
.tab-btn.active{background:#fff;color:var(--text-main);font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.08);}
.hbtn{font-size:11px;font-weight:600;padding:5px 12px;border-radius:999px;border:none;background:rgba(0,0,0,.04);color:var(--text-sec);cursor:pointer;}
.cfm-btn{font-size:11px;font-weight:700;padding:5px 16px;border-radius:999px;border:none;background:linear-gradient(135deg,#1d1d1f,#434347);color:#fff;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);}

/* BODY */
.body{position:relative;z-index:1;display:flex;flex:1;padding:10px;gap:0;overflow:hidden;min-height:0;}
.body2{gap:0;}
.lcol{display:flex;flex-direction:column;gap:10px;flex-shrink:0;min-height:0;}
.rcol{display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;}
.resizer-x{width:14px;cursor:col-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.resizer-x::after{content:'';width:3px;height:32px;background:rgba(0,0,0,.08);border-radius:3px;}
.resizer-y{height:12px;cursor:row-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.resizer-y::after{content:'';height:3px;width:32px;background:rgba(255,255,255,.2);border-radius:3px;}

/* 卡片通用 */
.card-hdr{display:flex;align-items:center;gap:8px;flex-shrink:0;margin-bottom:10px;}
.card-icon{font-size:16px;}
.card-icon-svg{display:inline-flex;align-items:center;justify-content:center;color:var(--text-main);}
.card-icon-svg svg{display:block;}
.gantt-tail-icon svg{flex-shrink:0;}
.card-title{font-size:14px;font-weight:800;letter-spacing:-.3px;flex:1;}
.col-hint{font-size:10px;color:var(--text-sec);font-weight:700;margin-left:auto;}

/* 健康度 */
.health-card{border-radius:var(--radius-card);padding:14px 16px;flex-shrink:0;}
.health-inner{display:flex;align-items:stretch;gap:10px;height:110px;}
.health-stats{flex:1;display:flex;flex-direction:column;justify-content:space-between;}
.stat-row{display:flex;flex-direction:column;gap:3px;}
.stat-label{display:flex;justify-content:space-between;align-items:flex-end;}
.stat-name{font-size:10px;font-weight:600;color:var(--text-sec);display:flex;align-items:center;gap:5px;}
.stat-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.stat-val{font-size:14px;font-weight:800;line-height:1;}
.prog-track{height:4px;border-radius:999px;background:rgba(0,0,0,.04);overflow:hidden;}
.prog-fill{height:100%;border-radius:999px;transition:width .6s;}
.total-badge{display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(0,0,0,.06);margin-top:4px;}
.tot-label{font-size:10px;color:var(--text-sec);font-weight:600;}
.tot-val{font-size:14px;font-weight:800;}
.donut-wrap{position:relative;display:flex;align-items:center;justify-content:center;width:110px;height:110px;flex-shrink:0;align-self:center;cursor:pointer;}
.donut-logo{position:absolute;width:56px;height:56px;border-radius:50%;border:3px solid #fff;object-fit:cover;z-index:1;}
#donut1{position:relative;z-index:2;display:block;pointer-events:none;}
.donut-input{position:absolute;inset:0;opacity:0;cursor:pointer;z-index:10;}

/* 决策卡 */
.dec-card{border-radius:var(--radius-card);padding:14px 16px;flex:1;overflow-y:auto;display:flex;flex-direction:column;min-height:0;}
.dec-list{display:flex;flex-direction:column;gap:7px;}
.dc{border-radius:10px;padding:9px 12px;background:rgba(224,59,48,.05);border:1px solid rgba(224,59,48,.15);position:relative;overflow:hidden;display:flex;flex-direction:column;gap:3px;}
.dc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent-red);}
.dc.y{background:rgba(245,158,11,.05);border-color:rgba(245,158,11,.15);}
.dc.y::before{background:var(--accent-yellow);}
.dc-name{font-size:11px;font-weight:800;padding-left:7px;}
.dc-row{display:flex;gap:6px;padding-left:7px;align-items:baseline;}
.dc-lbl{font-size:9px;font-weight:700;min-width:24px;flex-shrink:0;}
.dc-lbl.r{color:var(--text-sec);}
.dc-lbl.d{color:var(--accent-red);}
.dc.y .dc-lbl.d{color:#C27A00;}
.dc-txt{font-size:10px;line-height:1.4;font-weight:500;}
.dc-act{font-weight:700;color:var(--accent-red);}
.dc.y .dc-act{color:#C27A00;}
.dec-empty{font-size:11px;color:var(--text-sec);padding:10px 7px;font-weight:600;}

/* Hero */
.hero-zone{border-radius:var(--radius-card);overflow:hidden;position:relative;flex-shrink:0;cursor:pointer;}
.hero-hdr-bar{position:absolute;top:0;left:0;right:0;z-index:5;padding:10px 16px;background:linear-gradient(rgba(0,0,0,.5),transparent);display:flex;align-items:center;gap:8px;}
.hero-hd-title{font-size:13px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3);}
.hero-imgs{display:flex;height:100%;gap:2px;}
.hero-img-wrap{flex:1;min-width:0;height:100%;}
.hero-img-wrap img{width:100%;height:100%;object-fit:cover;display:block;}
.hero-cap{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.8));padding:20px 16px 14px;pointer-events:none;}
.hero-cap *{pointer-events:auto;}
.hero-cap-tag{font-size:8px;font-weight:700;color:rgba(255,255,255,.6);margin-bottom:3px;letter-spacing:.1em;text-transform:uppercase;}
.hero-cap-title{font-size:18px;font-weight:800;color:#fff;outline:none;cursor:text;}
.hero-cap-logic{font-size:10px;color:rgba(255,255,255,.8);outline:none;cursor:text;margin-top:3px;line-height:1.4;}
.hero-acts{position:absolute;top:10px;right:12px;display:flex;gap:6px;z-index:6;}
.h-btn{font-size:9px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;border:1px solid rgba(255,255,255,.3);}
.h-btn.del{background:rgba(224,59,48,.8);}

/* 工作区 */
.work-area{display:flex;flex-direction:column;flex:1;}
.work-card{border-radius:var(--radius-card);padding:13px 16px;display:flex;flex-direction:column;flex:1;overflow:hidden;}
.wi-list{display:flex;flex-direction:column;flex:1;overflow-y:auto;}
.disp-list{display:flex;flex-direction:column;flex:1;overflow:hidden;}
.disp-list-confirmed{gap:4px;}
.wi{display:flex;align-items:center;gap:7px;cursor:pointer;border-radius:9px;border:1px solid transparent;transition:all .18s;padding:0 7px;flex-shrink:0;margin-bottom:2px;height:32px;}
.wi:hover{background:rgba(255,255,255,.6);}
.wi.picked{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.04);}
.wi-chk{width:15px;height:15px;border-radius:4px;border:1.5px solid rgba(0,0,0,.15);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:transparent;transition:.18s;}
.wi-chk.checked{background:var(--text-main);border-color:var(--text-main);color:#fff;}
.wi-badge{font-size:9px;font-weight:700;padding:1px 7px;border-radius:5px;flex-shrink:0;white-space:nowrap;}
.wi-badge.r{color:var(--accent-red);background:rgba(224,59,48,.1);}
.wi-badge.y{color:#C27A00;background:rgba(245,158,11,.1);}
.wi-badge.g{color:#1a9e3f;background:rgba(52,199,89,.1);}
.wi-txt{font-size:11px;font-weight:500;color:#3a3a3c;line-height:1.35;flex:1;padding-left:6px;}
.wi-pname{font-size:11px;font-weight:700;color:#1d1d1f;flex-shrink:0;white-space:nowrap;padding-right:18px;margin-right:6px;border-right:1px solid rgba(0,0,0,.1);min-width:120px;}
.di-pname{font-size:11px;font-weight:700;color:#1d1d1f;flex-shrink:0;white-space:nowrap;padding-right:18px;margin-right:6px;margin-top:1px;border-right:1px solid rgba(0,0,0,.1);min-width:120px;}
.wi-date,.di-date{font-size:10px;color:var(--text-sec);font-weight:700;padding-left:6px;flex-shrink:0;min-width:32px;text-align:right;}
.wc-cnt{font-size:10px;font-weight:700;padding:2px 9px;border-radius:999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.04);margin-left:6px;}
.pager{display:inline-flex;align-items:center;gap:2px;background:rgba(0,0,0,.05);border-radius:999px;padding:2px;}
.pager-btn{border:none;background:transparent;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:14px;font-weight:600;color:var(--text-main);display:flex;align-items:center;justify-content:center;line-height:1;padding:0;transition:.15s;}
.pager-btn:not(:disabled):hover{background:#fff;}
.pager-btn:disabled{color:rgba(0,0,0,.2);cursor:default;}
.pager-num{font-size:10px;font-weight:700;color:var(--text-main);padding:0 6px;min-width:36px;text-align:center;letter-spacing:.5px;}
.disp-item{display:flex;align-items:flex-start;gap:7px;border-radius:9px;background:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.7);padding:5px 9px;margin-bottom:3px;flex-shrink:0;}
.disp-item-confirmed{align-items:center;height:20px;padding:0 9px;margin-bottom:0;font-size:10px;}
.disp-item-confirmed .di-pname{font-size:10px;padding-right:14px;margin-right:6px;min-width:110px;margin-top:0;}
.disp-item-confirmed .di-txt{font-size:10px;line-height:1;}
.disp-item-confirmed .di-date{font-size:9px;}
.di-badge{font-size:9px;padding:1px 7px;border-radius:5px;flex-shrink:0;font-weight:700;white-space:nowrap;margin-top:1px;}
.di-badge.r{color:var(--accent-red);background:rgba(224,59,48,.1);}
.di-badge.y{color:#C27A00;background:rgba(245,158,11,.1);}
.di-badge.g{color:#1a9e3f;background:rgba(52,199,89,.1);}
.di-txt{font-size:11px;color:#3a3a3c;line-height:1.45;flex:1;font-weight:600;}
.list-empty{font-size:11px;color:var(--text-sec);padding:14px 4px;}
.card-hdr-btn{font-size:10px;font-weight:700;padding:4px 10px;border-radius:999px;border:none;cursor:pointer;transition:all .18s;white-space:nowrap;}
.card-hdr-btn.primary{background:linear-gradient(135deg,#1d1d1f,#434347);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);}
.card-hdr-btn.primary:disabled{background:rgba(0,0,0,.1);color:var(--text-sec);box-shadow:none;cursor:default;}
.card-hdr-btn.ghost{background:rgba(0,0,0,.06);color:var(--text-sec);}
.resizer-sb{width:10px;cursor:col-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.resizer-sb::after{content:'';width:3px;height:32px;background:rgba(255,255,255,.18);border-radius:3px;}

/* ── SIDEBAR ── */
.sidebar{width:220px;flex-shrink:0;background:linear-gradient(160deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:var(--radius-card);display:flex;flex-direction:column;padding:14px 12px;gap:12px;overflow:hidden;}
.sb-logo-wrap{width:72px;height:72px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;overflow:hidden;margin:0 auto;flex-shrink:0;}
.sb-logo-img{width:100%;height:100%;object-fit:cover;display:block;}
.sb-logo-hint{font-size:9px;color:rgba(255,255,255,.45);text-align:center;font-weight:600;line-height:1.4;}
.sb-sec-lbl{font-size:8px;font-weight:800;color:rgba(255,255,255,.38);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;}
.sb-focus{flex-shrink:0;}
.sb-focus-text{font-size:10px;font-weight:600;color:#fff;line-height:1.5;outline:none;cursor:text;width:100%;min-height:46px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:6px 8px;font-family:inherit;resize:vertical;direction:ltr;unicode-bidi:plaintext;}
.sb-focus-text::placeholder{color:rgba(255,255,255,.25);font-weight:400;}
.sb-members{flex:1 1 auto;display:flex;flex-direction:column;overflow:hidden;min-height:0;}
.sb-avatar-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:5px;margin-bottom:14px;justify-items:center;}
.sb-avatar-item{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;}
.sb-avatar-wrap{width:34px;height:34px;border-radius:50%;overflow:hidden;cursor:pointer;position:relative;border:2px solid rgba(255,255,255,.2);}
.sb-avatar-img{width:100%;height:100%;object-fit:cover;display:block;}
.sb-avatar-init{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;}
.sb-avatar-name{font-size:8px;color:rgba(255,255,255,.55);font-weight:600;}
.sb-ring-list{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 8px;flex:1 1 auto;overflow-y:auto;min-height:0;}
.sb-ring-item{display:flex;align-items:center;gap:6px;min-width:0;}
.sb-ring-wrap{position:relative;width:42px;height:42px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.sb-ring-pct{position:absolute;font-size:9px;font-weight:800;color:#fff;}
.sb-ring-info{flex:1;min-width:0;overflow:hidden;}
.sb-ring-name{font-size:10px;font-weight:700;color:rgba(255,255,255,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sb-ring-big{font-size:14px;font-weight:800;color:#fff;line-height:1.1;}
.sb-ring-unit{font-size:8px;color:rgba(255,255,255,.5);font-weight:400;}
.sb-ring-sm{font-size:8px;color:rgba(255,255,255,.45);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* KPI 区块（仅二卡） */
.sb-kpi{flex-shrink:0;border-top:1px solid rgba(255,255,255,.08);padding-top:10px;margin-top:6px;}
.sb-kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;}
.sb-kpi-grid-2{grid-template-columns:repeat(2,1fr);}
.sb-kpi-cell{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:7px 9px;display:flex;flex-direction:column;align-items:flex-start;}
.sb-kpi-cell.warn{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.3);}
.sb-kpi-num{font-size:18px;font-weight:800;color:#fff;line-height:1.1;}
.sb-kpi-cell.warn .sb-kpi-num{color:#fbbf24;}
.sb-kpi-cap{font-size:9px;color:rgba(255,255,255,.6);font-weight:600;margin-top:2px;}

/* ── MAIN AREA ── */
.main-area{flex:1;display:flex;flex-direction:column;gap:10px;padding-left:10px;min-width:0;overflow:hidden;}

/* ── GANTT（图2风格）── */
.gantt-card{border-radius:var(--radius-card);padding:12px 16px;display:flex;flex-direction:column;flex:0 0 56%;overflow:hidden;}
.gantt-head{display:flex;align-items:stretch;gap:0;margin-bottom:6px;flex-shrink:0;height:24px;border-bottom:1px solid rgba(0,0,0,.08);}
.gantt-name-col{width:180px;flex-shrink:0;}
.gantt-track-col{flex:1;min-width:0;position:relative;overflow:hidden;}
.gantt-info-col{width:110px;flex-shrink:0;text-align:right;}
.gantt-grid-line{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.06);}
.gantt-axis-lbl{position:absolute;bottom:2px;font-size:9px;color:var(--text-sec);font-weight:600;transform:translateX(-50%);white-space:nowrap;}
.gantt-today-head{position:absolute;top:0;font-size:9px;color:#f59e0b;font-weight:800;transform:translateX(-50%);white-space:nowrap;background:rgba(255,255,255,.9);padding:0 4px;border-radius:4px;z-index:2;}
.gantt-body{display:flex;flex-direction:column;gap:4px;flex:1;}
.gantt-body-pickable{overflow-y:auto;}
.gantt-body-confirmed{overflow:hidden;}
.gantt-row{display:flex;align-items:stretch;gap:0;height:38px;flex-shrink:0;}
.gantt-row .gantt-track-col{align-self:stretch;height:38px;}
.gantt-row-confirmed{height:24px;}
.gantt-row-confirmed .gantt-track-col{height:24px;}
.gantt-row-confirmed .gantt-name-col{height:24px;}
.gantt-row-confirmed .gantt-row-grid{height:24px;}
.gantt-row-confirmed .gantt-today-bar{height:24px;}
.gantt-row-confirmed .gantt-bar{top:2px;height:20px;border-radius:6px;padding:0 6px;}
.gantt-row-confirmed .gantt-bar-dash{top:2px;height:20px;border-radius:6px;}
.gantt-row-confirmed .gantt-year-divider-row{height:24px;}
.gantt-row-confirmed .gantt-label-out,
.gantt-row-confirmed .gantt-label-in{font-size:10px;}
.gantt-row-confirmed .gantt-tail{gap:6px;}
.gantt-row-confirmed .gantt-tail-icon{font-size:10px;}
.gantt-row-confirmed .g-owner-av-tail{width:22px;height:22px;font-size:10px;}
.gantt-row-confirmed .gantt-proj-name{font-size:11px;}
.gantt-row-confirmed .g-chk{width:12px;height:12px;}
.gantt-name-col{display:flex;align-items:center;gap:5px;height:38px;}
.g-chk{width:14px;height:14px;border-radius:3px;border:1.5px solid rgba(0,0,0,.2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:transparent;cursor:pointer;transition:.15s;background:#fff;}
.g-chk.checked{background:var(--text-main);border-color:var(--text-main);color:#fff;}
.gantt-proj-name{font-size:11px;font-weight:700;color:var(--text-main);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gantt-row-grid{position:absolute;top:0;height:38px;width:1px;background:rgba(0,0,0,.04);}
.gantt-today-bar{position:absolute;top:0;height:38px;width:2px;background:linear-gradient(180deg,#f59e0b,#f59e0b88);z-index:3;border-radius:2px;}
.gantt-bar{position:absolute;top:6px;height:26px;border-radius:8px;display:flex;align-items:center;padding:0 8px;min-width:0;z-index:2;overflow:hidden;}
.gantt-bar-done{z-index:3;}
.gantt-bar-future{z-index:2;border-radius:8px;}
.gantt-bar-ext{z-index:1;border-radius:8px;border:1.5px dashed rgba(0,0,0,0.15);}
.gantt-year-divider{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,0.18);z-index:2;}
.gantt-year-divider-row{height:38px;}
.gantt-axis-lbl-year{font-size:11px;color:var(--text-main);font-weight:800;}
.gantt-bar-name{font-size:10px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;text-shadow:0 1px 3px rgba(0,0,0,.2);letter-spacing:.3px;}
.gantt-bar-right{display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:8px;}
.gantt-owner-floating{display:none;}
.gantt-label-out{position:absolute;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;color:var(--text-sec);white-space:nowrap;padding-right:6px;z-index:3;pointer-events:none;letter-spacing:.3px;}
.gantt-label-in{position:absolute;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;color:#fff;white-space:nowrap;padding-right:6px;z-index:5;pointer-events:none;letter-spacing:.3px;text-shadow:0 1px 2px rgba(0,0,0,.25);}
.gantt-tail{position:absolute;top:50%;z-index:6;display:flex;align-items:center;gap:8px;white-space:nowrap;}
.gantt-tail-inside{padding-right:6px;}
.gantt-tail-inside .gantt-tail-icon{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.3);}
.gantt-tail-icon{font-size:11px;font-weight:700;color:#3a3a3c;display:inline-flex;align-items:center;gap:3px;}
.g-owner-av-tail{width:28px;height:28px;font-size:11px;border:none;box-shadow:0 2px 6px rgba(0,0,0,.18);z-index:7;}
.gantt-owner-chip{display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.2);border-radius:999px;padding:2px 7px 2px 2px;}
.g-owner-av{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden;}
.g-owner-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;}
.gantt-owner-floating .g-owner-name{font-size:9px;font-weight:700;color:var(--text-main);}
.g-owner-name{font-size:9px;font-weight:700;color:#fff;}
.gantt-bar-dash{position:absolute;top:6px;height:26px;left:2%;right:2%;border-radius:8px;border:2px dashed rgba(0,0,0,.2);display:flex;align-items:center;padding:0 10px;font-size:10px;color:var(--text-sec);}
.gantt-info-col{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;padding-left:8px;height:34px;}
.gantt-done-txt{font-size:9px;color:var(--text-sec);font-weight:600;}
.gantt-dte{font-size:9px;font-weight:700;}
.gantt-note{font-size:9px;color:var(--text-sec);margin-top:4px;flex-shrink:0;}

/* 工作区2 */
.work-area2{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}

/* MODAL */
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(20px);z-index:200;align-items:center;justify-content:center;}
.overlay.show{display:flex;}
.modal{border-radius:28px;padding:28px;width:540px;max-height:82vh;display:flex;flex-direction:column;gap:14px;box-shadow:0 30px 60px rgba(0,0,0,.15);overflow-y:auto;}
.modal-title{font-size:18px;font-weight:800;letter-spacing:-.5px;}
.modal-sub{font-size:11px;color:var(--text-sec);}
.modal-sec{display:flex;flex-direction:column;gap:7px;}
.modal-sec-lbl{font-size:9px;font-weight:800;color:var(--text-sec);letter-spacing:.1em;text-transform:uppercase;}
.modal-list{display:flex;flex-direction:column;gap:5px;max-height:300px;overflow-y:auto;}
.modal-item{font-size:12px;padding:9px 12px;border-radius:10px;background:rgba(255,255,255,.5);line-height:1.5;display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;}
.modal-proj{font-size:9px;font-weight:700;color:var(--text-sec);flex-shrink:0;background:rgba(0,0,0,.04);padding:1px 6px;border-radius:4px;}
.modal-date{font-size:10px;font-weight:700;color:var(--text-sec);flex-shrink:0;margin-left:auto;}
.modal-empty{font-size:11px;color:var(--text-sec);padding:4px 8px;font-style:italic;}
.modal-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:6px;}
.m-cancel{font-size:12px;font-weight:600;padding:9px 22px;border-radius:999px;border:none;background:rgba(0,0,0,.05);cursor:pointer;}
.m-ok{font-size:12px;font-weight:700;padding:9px 22px;border-radius:999px;border:none;background:var(--text-main);color:#fff;cursor:pointer;}
</style>
