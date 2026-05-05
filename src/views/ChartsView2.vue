<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { StorageService } from '@/services/storage';
import { STAGES } from '@/config/constants';
import { wkRange } from '@/utils/date';
import type { WeeklySnapshot, Project, TaskItem } from '@/core/types';

const appStore     = useAppStore();
const projectStore = useProjectStore();
const storage      = StorageService.getInstance();

// ── LocalStorage Keys ─────────────────────────────────────
const LOGO_HDR_KEY   = 'hlzc_dash2_logo_header';
const LOGO_DNT_KEY   = 'hlzc_dash2_logo_donut';
const LOGO_SB_KEY    = 'hlzc_dash2_logo_sidebar';   // 第二屏左栏Logo
const OL_KEY         = 'hlzc_dash2_overlay';
const OL2_KEY        = 'hlzc_dash2_overlay2';        // 第二屏overlay
const HERO_IMG_KEY   = 'hlzc_dash2_hero_imgs';

// ── Logo ──────────────────────────────────────────────────
const logoHdrSrc = ref(localStorage.getItem(LOGO_HDR_KEY) || '');
const logoDntSrc = ref(localStorage.getItem(LOGO_DNT_KEY) || '');
const logoSbSrc  = ref(localStorage.getItem(LOGO_SB_KEY)  || '');

function onLogoHdr(e: Event) { readImg(e, v => { logoHdrSrc.value = v; ls(LOGO_HDR_KEY, v); }); }
function onLogoDnt(e: Event) { readImg(e, v => { logoDntSrc.value = v; ls(LOGO_DNT_KEY, v); }); }
function onLogoSb (e: Event) { readImg(e, v => { logoSbSrc.value  = v; ls(LOGO_SB_KEY,  v); }); }
function readImg(e: Event, cb: (v:string)=>void) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  const r = new FileReader(); r.onload = ev => cb(ev.target!.result as string); r.readAsDataURL(f);
  (e.target as HTMLInputElement).value = '';
}
function ls(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }

// ── Tab ───────────────────────────────────────────────────
const activeTab = ref<'last'|'plan'>('last');

// ── Screen1 Overlay ───────────────────────────────────────
function loadOL() {
  try { const r = localStorage.getItem(OL_KEY); if (r) return JSON.parse(r); } catch {}
  return { heroTitle:'', heroLogic:'', pickedLast:[], confirmed:false, lcolWidth:340, heroHeight:220 };
}
function saveOL() {
  try { localStorage.setItem(OL_KEY, JSON.stringify({
    heroTitle: heroTitle.value, heroLogic: heroLogic.value,
    pickedLast: [...picksLast.value], confirmed: confirmed1.value,
    lcolWidth: lcolWidth.value, heroHeight: heroHeight.value,
  })); } catch {}
}
function loadHeroImages(): string[] { try { const r = localStorage.getItem(HERO_IMG_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveHeroImages() { try { localStorage.setItem(HERO_IMG_KEY, JSON.stringify(heroImages.value)); } catch { try { localStorage.setItem(HERO_IMG_KEY, JSON.stringify(heroImages.value.slice(0,1))); } catch {} } }

// ── Screen2 Overlay ───────────────────────────────────────
function loadOL2() {
  try { const r = localStorage.getItem(OL2_KEY); if (r) return JSON.parse(r); } catch {}
  return { focusText:'', pickedPlan:[], confirmed2:false };
}
function saveOL2() {
  try { localStorage.setItem(OL2_KEY, JSON.stringify({
    focusText: focusText.value,
    pickedPlan: [...picksPlan.value],
    confirmed2: confirmed2.value,
  })); } catch {}
}

// ── 响应式状态 Screen1 ────────────────────────────────────
const showModal1 = ref(false);
const confirmed1 = ref(false);
const heroImages = ref<string[]>([]);
const heroTitle  = ref('');
const heroLogic  = ref('');
const picksLast  = ref<Set<string>>(new Set());
const lcolWidth  = ref(340);
const heroHeight = ref(220);
let dragX = false, dragY = false;

// ── 响应式状态 Screen2 ────────────────────────────────────
const showModal2 = ref(false);
const confirmed2 = ref(false);
const focusText  = ref('');      // 重点项目手动输入
const picksPlan  = ref<Set<string>>(new Set());

// ── 周信息 ────────────────────────────────────────────────
const weekLabel    = computed(() => `${appStore.yr} · W${String(appStore.wk).padStart(2,'0')}`);
const weekRangeStr = computed(() => wkRange(appStore.yr, appStore.wk));

// ── 核心数据 ─────────────────────────────────────────────
interface PItem extends Project { snap: WeeklySnapshot; stageName: string; }
const allItems = computed<PItem[]>(() =>
  projectStore.activeProjects.map(p => {
    const snap = storage.getSnap(appStore.yr, appStore.wk, p.id, projectStore.projects);
    return { ...p, snap, stageName: STAGES[Math.min(snap.stage, STAGES.length-1)] || '平面' };
  }).sort((a,b) => ({r:0,y:1,g:2}[a.snap.status]??0) - ({r:0,y:1,g:2}[b.snap.status]??0))
);

const stats = computed(() => {
  const r = allItems.value.filter(i=>i.snap.status==='r').length;
  const y = allItems.value.filter(i=>i.snap.status==='y').length;
  const g = allItems.value.filter(i=>i.snap.status==='g').length;
  const t = allItems.value.length||1;
  return { r, y, g, total:allItems.value.length, rPct:Math.round(r/t*100), yPct:Math.round(y/t*100), gPct:Math.round(g/t*100) };
});

// 需要决策的问题
interface DecCard { projId:number; projName:string; isY:boolean; risks:TaskItem[]; decisions:TaskItem[]; }
const decCards = computed<DecCard[]>(() => allItems.value.reduce<DecCard[]>((acc,p)=>{
  const risks     = (Array.isArray(p.snap.risk)     ? p.snap.risk     : []).filter((x:TaskItem)=>x.text?.trim());
  const decisions = (Array.isArray(p.snap.decision) ? p.snap.decision : []).filter((x:TaskItem)=>x.text?.trim());
  if (risks.length || decisions.length) acc.push({ projId:p.id, projName:p.name, isY:p.snap.status==='y', risks, decisions });
  return acc;
}, []));

// 上周完成
interface WorkItem { key:string; projName:string; status:string; text:string; dueDate:string; }
const lastItems = computed<WorkItem[]>(() => {
  const result:WorkItem[] = [];
  allItems.value.forEach(p => {
    const co:TaskItem[] = (p.snap as any).coreOutputItems || [];
    (Array.isArray(co)?co:[]).filter((x:TaskItem)=>x.text?.trim()).forEach((x:TaskItem,i:number)=>{
      result.push({ key:`l_${p.id}_${i}`, projName:p.name, status:p.snap.status, text:x.text, dueDate:x.dueDate||'' });
    });
  });
  return result;
});

// 本周计划
const planItems = computed<WorkItem[]>(() => {
  const result:WorkItem[] = [];
  allItems.value.forEach(p => {
    const ca:TaskItem[] = Array.isArray(p.snap.coreAction) ? p.snap.coreAction : [];
    ca.filter((x:TaskItem)=>x.text?.trim()).forEach((x:TaskItem,i:number)=>{
      result.push({ key:`p_${p.id}_${i}`, projName:p.name, status:p.snap.status, text:x.text, dueDate:x.dueDate||'' });
    });
  });
  return result;
});

// ── 研策负责人工作量统计 ──────────────────────────────────
const DIRS = ['张建波','冷耀秋','Kenbe'];
const dirStats = computed(() => DIRS.map(name => {
  const myProjects = allItems.value.filter(p => {
    const owner = (p as any).researchOwner || (p as any).strategyOwner || '';
    return owner === name || owner.includes(name);
  });
  const projCnt   = myProjects.length;
  const actionCnt = myProjects.reduce((s,p) => s + (Array.isArray(p.snap.coreAction) ? p.snap.coreAction.filter((x:TaskItem)=>x.text?.trim()).length : 0), 0);
  const totalProj = allItems.value.length || 1;
  const pct = Math.round(projCnt / totalProj * 100);
  return { name, projCnt, actionCnt, pct };
}));

// ── 甘特图数据 ────────────────────────────────────────────
const ganttData = computed(() => {
  const today = new Date(); today.setHours(0,0,0,0);
  const items = allItems.value.map(p => {
    const parseD = (s:string|undefined) => { if (!s) return null; const d = new Date(s.replace(/\//g,'-')); return isNaN(d.getTime()) ? null : d; };
    const start = parseD((p as any).startDate);
    const end   = parseD((p as any).completionDate);
    const dTE   = end ? Math.round((end.getTime()-today.getTime())/86400000) : null;
    return { id:p.id, name:p.name, status:p.snap.status, start, end, dTE };
  });

  // 时间轴范围
  const validStarts = items.filter(i=>i.start).map(i=>i.start!.getTime());
  const validEnds   = items.filter(i=>i.end).map(i=>i.end!.getTime());
  const rangeStart  = validStarts.length ? new Date(Math.min(...validStarts)) : new Date(today.getFullYear(), today.getMonth()-3, 1);
  const rangeEnd    = validEnds.length   ? new Date(Math.max(...validEnds))   : new Date(today.getFullYear(), today.getMonth()+9, 1);
  const span = rangeEnd.getTime() - rangeStart.getTime() || 1;

  const todayPct = Math.max(0, Math.min(100, (today.getTime()-rangeStart.getTime())/span*100));

  const rows = items.map(p => {
    const barL = p.start ? Math.max(0,(p.start.getTime()-rangeStart.getTime())/span*100) : 0;
    const barR = p.end   ? Math.min(100,(p.end.getTime()-rangeStart.getTime())/span*100) : (p.start ? barL+30 : 60);
    let dteLabel = '待定', dteColor = '#aaa';
    if (p.dTE !== null) {
      if (p.dTE < 0) { dteLabel=`超期${Math.abs(p.dTE)}天`; dteColor='#E03B30'; }
      else if (p.dTE <= 30) { dteLabel=`${p.dTE}天`; dteColor='#F59E0B'; }
      else { dteLabel=`${p.dTE}天`; dteColor='#34C759'; }
    }
    return { ...p, barL, barR, dteLabel, dteColor, noDates:!p.start&&!p.end };
  });

  // 格式化轴标签（每3个月一个刻度）
  const axisLabels: {label:string; pct:number}[] = [];
  const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cur <= rangeEnd) {
    const pct = (cur.getTime()-rangeStart.getTime())/span*100;
    if (pct >= 0 && pct <= 100) axisLabels.push({ label:`${cur.getFullYear()}.${cur.getMonth()+1}`, pct });
    cur.setMonth(cur.getMonth()+3);
  }

  return { rows, todayPct, axisLabels };
});

// ── 勾选逻辑 Screen1 ──────────────────────────────────────
const isPicked1   = (k:string) => picksLast.value.has(k);
const dispLast    = computed(()=>lastItems.value.filter(i=>picksLast.value.has(i.key)));
function togglePick1(k:string) { picksLast.value.has(k)?picksLast.value.delete(k):picksLast.value.add(k); saveOL(); }

// ── 勾选逻辑 Screen2 ──────────────────────────────────────
const isPicked2   = (k:string) => picksPlan.value.has(k);
const dispPlan    = computed(()=>planItems.value.filter(i=>picksPlan.value.has(i.key)));
function togglePick2(k:string) { picksPlan.value.has(k)?picksPlan.value.delete(k):picksPlan.value.add(k); saveOL2(); }

// ── 确认 Screen1 ──────────────────────────────────────────
function doConfirm1() { confirmed1.value=true; showModal1.value=false; saveOL(); nextTick(()=>reflow1()); }
function resetConfirm1() { confirmed1.value=false; saveOL(); }

// ── 确认 Screen2 ──────────────────────────────────────────
function doConfirm2() { confirmed2.value=true; showModal2.value=false; saveOL2(); nextTick(()=>reflow2()); }
function resetConfirm2() { confirmed2.value=false; saveOL2(); }

// ── Hero 图片 ─────────────────────────────────────────────
const fileInput = ref<HTMLInputElement|null>(null);
function heroClick()     { if (!heroImages.value.length) fileInput.value?.click(); }
function triggerUpload() { fileInput.value?.click(); }
function onFile(e:Event) {
  const f=(e.target as HTMLInputElement).files?.[0]; if(!f||heroImages.value.length>=3) return;
  const r=new FileReader(); r.onload=ev=>{heroImages.value.push(ev.target!.result as string);saveHeroImages();nextTick(()=>reflow1());};
  r.readAsDataURL(f); (e.target as HTMLInputElement).value='';
}
function hDel() { if(heroImages.value.length){heroImages.value.pop();saveHeroImages();nextTick(()=>reflow1());} }

// ── 拖拽（Screen1）────────────────────────────────────────
function onDragXDown() { dragX=true; document.body.style.cursor='col-resize'; }
function onDragYDown() { dragY=true; document.body.style.cursor='row-resize'; }
function onMouseMove(e:MouseEvent) {
  if(!dragX&&!dragY) return;
  if(dragX){ const b=document.getElementById('body1'); if(b) lcolWidth.value=Math.max(260,Math.min(e.clientX-b.getBoundingClientRect().left-16,480)); }
  if(dragY){ const rc=document.getElementById('rcol1'); if(rc) heroHeight.value=Math.max(140,Math.min(e.clientY-rc.getBoundingClientRect().top,rc.offsetHeight-120)); }
  reflow1();
}
function onMouseUp() { dragX=false; dragY=false; document.body.style.cursor='default'; saveOL(); }

// ── Reflow Screen1 ────────────────────────────────────────
function reflow1() {
  nextTick(()=>{
    const rcol=document.getElementById('rcol1'); const wa=document.getElementById('wa1');
    if(!rcol||!wa) return;
    const workH=rcol.offsetHeight-heroHeight.value-16; if(workH>0) wa.style.height=workH+'px';
    wa.querySelectorAll<HTMLElement>('.work-card').forEach(card=>{
      const hdrH=card.querySelector<HTMLElement>('.card-hdr')?.offsetHeight||50;
      const listEl=card.querySelector<HTMLElement>('.wi-list,.disp-list'); if(!listEl) return;
      const items=listEl.querySelectorAll<HTMLElement>('.wi,.disp-item'); if(!items.length) return;
      if(!confirmed1.value){ const per=Math.max(32,Math.floor((workH-hdrH-28)/items.length)); items.forEach(it=>{it.style.height=per+'px';it.style.alignItems='center';}); }
      else { items.forEach(it=>{it.style.height='auto';it.style.minHeight='34px';it.style.alignItems='flex-start';it.style.padding='5px 8px';}); }
    });
  });
}

// ── Reflow Screen2 ────────────────────────────────────────
function reflow2() {
  nextTick(()=>{
    const wa=document.getElementById('wa2'); if(!wa) return;
    const listEl=wa.querySelector<HTMLElement>('.wi-list,.disp-list'); if(!listEl) return;
    const items=listEl.querySelectorAll<HTMLElement>('.wi,.disp-item'); if(!items.length) return;
    const card=wa.querySelector<HTMLElement>('.work-card'); if(!card) return;
    const hdrH=card.querySelector<HTMLElement>('.card-hdr')?.offsetHeight||50;
    const avail=wa.offsetHeight-hdrH-28;
    if(!confirmed2.value){ const per=Math.max(30,Math.floor(avail/items.length)); items.forEach(it=>{it.style.height=per+'px';it.style.alignItems='center';}); }
    else { items.forEach(it=>{it.style.height='auto';it.style.minHeight='32px';it.style.alignItems='flex-start';it.style.padding='4px 8px';}); }
  });
}

// ── 环形图 ────────────────────────────────────────────────
function drawDonut(id:string) {
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

// 研策负责人小环形图
function drawMiniRing(id:string, pct:number, color:string) {
  const canvas=document.getElementById(id) as HTMLCanvasElement; if(!canvas) return;
  const ctx=canvas.getContext('2d')!; ctx.clearRect(0,0,48,48);
  const cx=24,cy=24,r=20,lw=4;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle='rgba(0,0,0,0.06)'; ctx.lineWidth=lw; ctx.stroke();
  if(pct>0){ ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+(Math.PI*2*pct/100)); ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.stroke(); }
}

// ── 初始化 ────────────────────────────────────────────────
onMounted(()=>{
  const ol=loadOL(); const ol2=loadOL2();
  logoHdrSrc.value=localStorage.getItem(LOGO_HDR_KEY)||'';
  logoDntSrc.value=localStorage.getItem(LOGO_DNT_KEY)||'';
  logoSbSrc.value =localStorage.getItem(LOGO_SB_KEY)||'';
  heroImages.value=loadHeroImages();
  heroTitle.value=ol.heroTitle||''; heroLogic.value=ol.heroLogic||'';
  picksLast.value=new Set(ol.pickedLast||[]); confirmed1.value=ol.confirmed||false;
  lcolWidth.value=ol.lcolWidth||340; heroHeight.value=ol.heroHeight||220;
  focusText.value=ol2.focusText||'';
  picksPlan.value=new Set(ol2.pickedPlan||[]); confirmed2.value=ol2.confirmed2||false;
  nextTick(()=>{ drawDonut('donut1'); reflow1(); });
  window.addEventListener('resize',()=>{ reflow1(); reflow2(); });
});
onUnmounted(()=>window.removeEventListener('resize',()=>{}));

watch(activeTab, (tab)=>{
  nextTick(()=>{
    if(tab==='last'){ drawDonut('donut1'); reflow1(); }
    else { const ds=dirStats.value; ds.forEach((_,i)=>drawMiniRing(`ring${i}`,ds[i].pct,['#E03B30','#F59E0B','#34C759'][i])); reflow2(); }
  });
});

// ── 工具 ─────────────────────────────────────────────────
function nm(n:string,len=7){ return n.length>len?n.slice(0,len)+'…':n; }
function fmtDate(d:string){ if(!d) return ''; const m=d.match(/(\d{4})-(\d{2})-(\d{2})/); return m?`${parseInt(m[2])}/${parseInt(m[3])}`:d; }
</script>

<template>
<div class="slide" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">

<!-- ═══ HEADER ═══ -->
<div class="hdr">
  <div class="hl">
    <div class="logo-box" title="上传顶栏Logo">
      <img v-if="logoHdrSrc" :src="logoHdrSrc" class="logo-img" alt="">
      <span v-else class="logo-hint">LOGO</span>
      <input type="file" accept="image/*" class="logo-input" @change="onLogoHdr">
    </div>
    <div class="hd-sep"></div>
    <div><div class="hd-cn">华力集团 研策部周报</div><div class="hd-en">RESEARCH &amp; STRATEGY DEPT · WEEKLY REPORT</div></div>
  </div>
  <div class="hr">
    <span class="wbadge">{{ weekLabel }}</span>
    <span class="wdate">{{ weekRangeStr }}</span>
    <!-- Tab 切换 -->
    <div class="tab-group">
      <button :class="['tab-btn', activeTab==='last'&&'active']" @click="activeTab='last'">📋 上周总结</button>
      <button :class="['tab-btn', activeTab==='plan'&&'active']" @click="activeTab='plan'">🗓 本周计划</button>
    </div>
    <template v-if="activeTab==='last'">
      <button v-if="confirmed1" class="hbtn" @click="resetConfirm1">重新选择</button>
      <button class="cfm-btn" @click="showModal1=true">确认选项 →</button>
      <button class="hbtn" @click="triggerUpload">＋ 图片</button>
      <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFile">
    </template>
    <template v-else>
      <button v-if="confirmed2" class="hbtn" @click="resetConfirm2">重新选择</button>
      <button class="cfm-btn" @click="showModal2=true">确认选项 →</button>
    </template>
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
          <div v-for="(item,i) in [{lbl:'需决策/卡住',val:stats.r,pct:stats.rPct,c:'#E03B30'},{lbl:'需关注',val:stats.y,pct:stats.yPct,c:'#F59E0B'},{lbl:'正常推进',val:stats.g,pct:stats.gPct,c:'#34C759'}]" :key="i" class="stat-row">
            <div class="stat-label">
              <div class="stat-name"><div class="stat-dot" :style="{background:item.c}"></div>{{item.lbl}}</div>
              <div class="stat-val">{{item.val}}</div>
            </div>
            <div class="prog-track"><div class="prog-fill" :style="{width:item.pct+'%',background:item.c}"></div></div>
          </div>
        </div>
        <div class="donut-wrap" title="点击上传饼图Logo">
          <img v-if="logoDntSrc" :src="logoDntSrc" class="donut-logo" alt="">
          <canvas id="donut1" width="116" height="116"></canvas>
          <input type="file" accept="image/*" class="donut-input" @change="onLogoDnt">
        </div>
      </div>
      <div class="total-badge"><span class="tot-label">在建项目</span><span class="tot-val">{{stats.total}} 个</span></div>
    </div>

    <!-- 需要决策的问题 -->
    <div class="dec-card glass">
      <div class="card-hdr"><span class="card-icon">🚨</span><span class="card-title">需要决策的问题</span></div>
      <div class="dec-list">
        <div v-for="card in decCards" :key="card.projId" :class="['dc',card.isY?'y':'']">
          <div class="dc-name">{{card.projName}}</div>
          <div v-for="(x,i) in card.risks" :key="'r'+i" class="dc-row"><span class="dc-lbl dc-lbl-risk">卡点</span><span class="dc-txt">{{x.text}}</span></div>
          <div v-for="(x,i) in card.decisions" :key="'d'+i" class="dc-row"><span class="dc-lbl dc-lbl-dec">决策</span><span class="dc-txt dc-act">{{x.text}}</span></div>
        </div>
        <div v-if="!decCards.length" class="dec-empty">本周无需决策项目 ✓</div>
      </div>
    </div>
  </div>

  <div class="resizer-x" @mousedown="onDragXDown"></div>

  <div class="rcol" id="rcol1">
    <!-- 图片区 -->
    <div class="hero-zone glass-dk" :style="{height:heroHeight+'px'}" @click="heroClick">
      <div class="hero-hdr-bar"><span>🖼</span><span class="hero-hd-title">上周项目图片精选</span></div>
      <div v-if="heroImages.length" class="hero-imgs">
        <div v-for="(s,i) in heroImages" :key="i" class="hero-img-wrap"><img :src="s" alt=""></div>
      </div>
      <div v-else class="hero-empty"><div class="hero-empty-icon">＋</div><div class="hero-empty-txt">点击上传图片（最多3张并排）</div></div>
      <div v-if="heroImages.length" class="hero-cap">
        <div class="hero-cap-tag">上周视觉聚焦</div>
        <div class="hero-cap-title" contenteditable="true" @click.stop @input="(e)=>{heroTitle=(e.target as HTMLElement).innerText;saveOL()}">{{heroTitle}}</div>
        <div class="hero-cap-logic" contenteditable="true" @click.stop @input="(e)=>{heroLogic=(e.target as HTMLElement).innerText;saveOL()}">{{heroLogic}}</div>
      </div>
      <div v-if="heroImages.length" class="hero-acts" @click.stop>
        <div v-if="heroImages.length<3" class="h-btn" @click="triggerUpload">＋图片</div>
        <div class="h-btn del" @click="hDel">删除</div>
      </div>
    </div>

    <div class="resizer-y" @mousedown="onDragYDown"></div>

    <!-- 上周完成工作 -->
    <div id="wa1" class="work-area">
      <div class="work-card glass">
        <div class="card-hdr">
          <span class="card-icon">🧠</span><span class="card-title">上周核心完成工作</span>
          <div v-if="!confirmed1 && picksLast.size" class="wc-cnt">已选 {{picksLast.size}} 项</div>
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
          <div v-if="!dispLast.length" class="list-empty">未选择任何条目</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══ SCREEN 2：本周计划 ═══ -->
<div v-show="activeTab==='plan'" class="body body2">

  <!-- 左侧边栏 -->
  <div class="sidebar glass-dk">
    <!-- Logo -->
    <div class="sb-logo-wrap" title="上传研策部Logo">
      <img v-if="logoSbSrc" :src="logoSbSrc" class="sb-logo-img" alt="">
      <div v-else class="sb-logo-hint">研策部<br>LOGO</div>
      <input type="file" accept="image/*" class="logo-input" @change="onLogoSb">
    </div>

    <!-- 重点项目（手动输入） -->
    <div class="sb-focus">
      <div class="sb-section-lbl">本周重点项目</div>
      <div
        class="sb-focus-text"
        contenteditable="true"
        @input="(e)=>{focusText=(e.target as HTMLElement).innerText;saveOL2()}"
        :data-placeholder="!focusText?'点击输入重点项目…':''"
      >{{focusText}}</div>
    </div>

    <!-- 研策负责人工作量 -->
    <div class="sb-dirs">
      <div class="sb-section-lbl">研策负责人</div>
      <div v-for="(d,i) in dirStats" :key="d.name" class="sb-dir-item">
        <div class="sb-dir-ring-wrap">
          <canvas :id="'ring'+i" width="48" height="48"></canvas>
          <div class="sb-dir-pct">{{d.pct}}%</div>
        </div>
        <div class="sb-dir-info">
          <div class="sb-dir-name">{{d.name}}</div>
          <div class="sb-dir-big">{{d.projCnt}} <span class="sb-dir-unit">项目</span></div>
          <div class="sb-dir-small">{{d.actionCnt}} 条本周任务</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 右侧主区 -->
  <div class="main-area">
    <!-- 甘特图 -->
    <div class="gantt-card glass">
      <div class="card-hdr"><span class="card-icon">📅</span><span class="card-title">项目时间轴</span></div>
      <!-- 轴标签 -->
      <div class="gantt-axis">
        <div class="gantt-axis-names"></div>
        <div class="gantt-axis-track">
          <div v-for="(ax,i) in ganttData.axisLabels" :key="i" class="gantt-axis-label" :style="{left:ax.pct+'%'}">{{ax.label}}</div>
          <!-- 今日线 -->
          <div class="gantt-today-line" :style="{left:ganttData.todayPct+'%'}"></div>
        </div>
        <div class="gantt-axis-dte">距竣工</div>
      </div>
      <!-- 行 -->
      <div class="gantt-rows">
        <div v-for="row in ganttData.rows" :key="row.id" class="gantt-row">
          <div class="gantt-name" :title="row.name">{{nm(row.name,9)}}</div>
          <div class="gantt-track">
            <div
              class="gantt-bar"
              :class="row.noDates?'no-date':''"
              :style="{left:row.barL+'%',width:(row.barR-row.barL)+'%',background:row.noDates?'rgba(0,0,0,0.06)':({r:'#E03B30',y:'#F59E0B',g:'#34C759'}[row.status]||'#aaa')+'88',borderColor:({r:'#E03B30',y:'#F59E0B',g:'#34C759'}[row.status]||'#aaa')}"
            ></div>
            <div class="gantt-today-bar" :style="{left:ganttData.todayPct+'%'}"></div>
          </div>
          <div class="gantt-dte" :style="{color:row.dteColor}">{{row.dteLabel}}</div>
        </div>
        <div v-if="!ganttData.rows.length" class="list-empty">暂无项目数据</div>
      </div>
      <div class="gantt-note">红线=今天 · 红=超期 · 橙=30天内 · 绿=正常 · 灰=待定</div>
    </div>

    <!-- 本周计划 -->
    <div id="wa2" class="work-area2">
      <div class="work-card glass">
        <div class="card-hdr">
          <span class="card-icon">📋</span><span class="card-title">本周重点工作计划</span>
          <div v-if="!confirmed2 && picksPlan.size" class="wc-cnt">已选 {{picksPlan.size}} 项</div>
          <div v-if="confirmed2" class="wc-cnt">共 {{dispPlan.length}} 项</div>
          <span class="col-hint">截止时间</span>
        </div>
        <div v-if="!confirmed2" class="wi-list">
          <div v-for="it in planItems" :key="it.key" :class="['wi',isPicked2(it.key)&&'picked']" @click="togglePick2(it.key)">
            <div :class="['wi-chk',isPicked2(it.key)&&'checked']">{{isPicked2(it.key)?'✓':''}}</div>
            <div :class="['wi-badge',it.status]">{{nm(it.projName)}}</div>
            <div class="wi-txt">{{it.text}}</div>
            <div class="wi-date">{{fmtDate(it.dueDate)}}</div>
          </div>
          <div v-if="!planItems.length" class="list-empty">暂无本周计划</div>
        </div>
        <div v-else class="disp-list">
          <div v-for="it in dispPlan" :key="it.key" class="disp-item">
            <div :class="['di-badge',it.status]">{{nm(it.projName)}}</div>
            <div class="di-txt">{{it.text}}</div>
            <div class="di-date">{{fmtDate(it.dueDate)}}</div>
          </div>
          <div v-if="!dispPlan.length" class="list-empty">未选择任何条目</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══ MODAL 1 ═══ -->
<Teleport to="body">
  <div v-if="showModal1" class="overlay show" @click.self="showModal1=false">
    <div class="modal glass">
      <div class="modal-title">📋 确认上周完成工作</div>
      <div class="modal-sub">确认后页面自动排版展示。</div>
      <div class="modal-sec">
        <div class="modal-sec-lbl">🧠 上周核心完成工作</div>
        <div class="modal-list">
          <div v-for="it in dispLast" :key="it.key" class="modal-item">
            <span class="modal-proj">{{it.projName}}</span>{{it.text}}
            <span v-if="it.dueDate" class="modal-date">{{fmtDate(it.dueDate)}}</span>
          </div>
          <div v-if="!dispLast.length" class="modal-empty">未选择任何条目</div>
        </div>
      </div>
      <div class="modal-btns">
        <button class="m-cancel" @click="showModal1=false">返回修改</button>
        <button class="m-ok" @click="doConfirm1">✓ 确认提交</button>
      </div>
    </div>
  </div>
</Teleport>

<!-- ═══ MODAL 2 ═══ -->
<Teleport to="body">
  <div v-if="showModal2" class="overlay show" @click.self="showModal2=false">
    <div class="modal glass">
      <div class="modal-title">🗓 确认本周工作计划</div>
      <div class="modal-sub">确认后页面自动排版展示。</div>
      <div class="modal-sec">
        <div class="modal-sec-lbl">📋 本周重点工作计划</div>
        <div class="modal-list">
          <div v-for="it in dispPlan" :key="it.key" class="modal-item">
            <span class="modal-proj">{{it.projName}}</span>{{it.text}}
            <span v-if="it.dueDate" class="modal-date">{{fmtDate(it.dueDate)}}</span>
          </div>
          <div v-if="!dispPlan.length" class="modal-empty">未选择任何条目</div>
        </div>
      </div>
      <div class="modal-btns">
        <button class="m-cancel" @click="showModal2=false">返回修改</button>
        <button class="m-ok" @click="doConfirm2">✓ 确认提交</button>
      </div>
    </div>
  </div>
</Teleport>

</div>
</template>

<style scoped>
/* ── 全局变量 ── */
.slide {
  --text-main:#1d1d1f; --text-sec:#86868b; --accent-red:#E03B30; --accent-yellow:#F59E0B; --accent-green:#34C759;
  --radius-card:20px; --radius-inner:12px;
  width:1280px; height:720px; flex-shrink:0; position:relative; overflow:hidden;
  background:radial-gradient(circle at 50% 0%,#f4f2ee 0%,#e5e0d8 100%);
  display:flex; flex-direction:column;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang SC",Arial,sans-serif;
  -webkit-font-smoothing:antialiased; color:var(--text-main);
  border-radius:28px; box-shadow:0 30px 80px rgba(0,0,0,0.15);
}
.slide::before{ content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
  background:radial-gradient(circle at -10% 20%,rgba(255,255,255,.8) 0%,transparent 50%),radial-gradient(circle at 110% 80%,rgba(255,255,255,.6) 0%,transparent 50%); }
.glass { background:rgba(255,255,255,.62); backdrop-filter:blur(40px) saturate(180%); -webkit-backdrop-filter:blur(40px) saturate(180%); border:1px solid rgba(255,255,255,.8); box-shadow:0 2px 20px rgba(0,0,0,.06); }
.glass-dk { background:rgba(20,20,22,.68); backdrop-filter:blur(40px) saturate(200%); -webkit-backdrop-filter:blur(40px) saturate(200%); border:1px solid rgba(255,255,255,.12); }
* { scrollbar-width:none; -ms-overflow-style:none; }
*::-webkit-scrollbar { display:none; }

/* ── HEADER ── */
.hdr { position:relative; z-index:10; height:54px; flex-shrink:0; background:rgba(244,242,238,.75); backdrop-filter:blur(30px); -webkit-backdrop-filter:blur(30px); border-bottom:1px solid rgba(255,255,255,.5); display:flex; align-items:center; justify-content:space-between; padding:0 20px; gap:12px; }
.hl { display:flex; align-items:center; gap:14px; }
.logo-box { width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,.5); border:1px solid rgba(0,0,0,.05); display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; cursor:pointer; position:relative; }
.logo-img { width:100%; height:100%; object-fit:cover; display:block; }
.logo-hint { font-size:8px; color:var(--text-sec); font-weight:600; text-align:center; }
.logo-input { position:absolute; inset:0; opacity:0; cursor:pointer; z-index:10; }
.hd-sep { width:1px; height:22px; background:rgba(0,0,0,.1); flex-shrink:0; }
.hd-cn { font-size:16px; font-weight:800; letter-spacing:-.3px; }
.hd-en { font-size:8px; font-weight:600; color:var(--text-sec); letter-spacing:.2em; margin-top:1px; text-transform:uppercase; }
.hr { display:flex; align-items:center; gap:8px; }
.wbadge { font-size:12px; font-weight:800; background:#fff; padding:4px 12px; border-radius:999px; box-shadow:0 2px 8px rgba(0,0,0,.04); }
.wdate { font-size:11px; color:var(--text-sec); }
.tab-group { display:flex; gap:2px; background:rgba(0,0,0,.05); border-radius:12px; padding:3px; }
.tab-btn { font-size:11px; font-weight:600; padding:5px 14px; border-radius:9px; border:none; background:transparent; color:var(--text-sec); cursor:pointer; transition:all .2s; white-space:nowrap; }
.tab-btn.active { background:#fff; color:var(--text-main); font-weight:700; box-shadow:0 2px 8px rgba(0,0,0,.08); }
.hbtn { font-size:11px; font-weight:600; padding:5px 12px; border-radius:999px; border:none; background:rgba(0,0,0,.04); color:var(--text-sec); cursor:pointer; }
.cfm-btn { font-size:11px; font-weight:700; padding:5px 16px; border-radius:999px; border:none; background:linear-gradient(135deg,#1d1d1f,#434347); color:#fff; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.2); }

/* ── BODY 通用 ── */
.body { position:relative; z-index:1; display:flex; flex:1; padding:10px; gap:0; overflow:hidden; min-height:0; }
.lcol { display:flex; flex-direction:column; gap:10px; flex-shrink:0; min-height:0; }
.rcol { display:flex; flex-direction:column; flex:1; min-width:0; overflow:hidden; }
.resizer-x { width:14px; cursor:col-resize; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.resizer-x::after { content:''; width:3px; height:32px; background:rgba(0,0,0,.08); border-radius:3px; }
.resizer-y { height:12px; cursor:row-resize; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.resizer-y::after { content:''; height:3px; width:32px; background:rgba(255,255,255,.2); border-radius:3px; }

/* ── 卡片通用 ── */
.card-hdr { display:flex; align-items:center; gap:8px; flex-shrink:0; margin-bottom:10px; }
.card-icon { font-size:16px; }
.card-title { font-size:14px; font-weight:800; letter-spacing:-.3px; flex:1; }
.col-hint { font-size:10px; color:var(--text-sec); font-weight:700; margin-left:auto; }

/* ── 健康度 ── */
.health-card { border-radius:var(--radius-card); padding:14px 16px; flex-shrink:0; }
.health-inner { display:flex; align-items:stretch; gap:10px; height:110px; }
.health-stats { flex:1; display:flex; flex-direction:column; justify-content:space-between; }
.stat-row { display:flex; flex-direction:column; gap:3px; }
.stat-label { display:flex; justify-content:space-between; align-items:flex-end; }
.stat-name { font-size:10px; font-weight:600; color:var(--text-sec); display:flex; align-items:center; gap:5px; }
.stat-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.stat-val { font-size:14px; font-weight:800; line-height:1; }
.prog-track { height:4px; border-radius:999px; background:rgba(0,0,0,.04); overflow:hidden; }
.prog-fill { height:100%; border-radius:999px; transition:width .6s; }
.total-badge { display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid rgba(0,0,0,.06); margin-top:4px; }
.tot-label { font-size:10px; color:var(--text-sec); font-weight:600; }
.tot-val { font-size:14px; font-weight:800; }
.donut-wrap { position:relative; display:flex; align-items:center; justify-content:center; width:110px; height:110px; flex-shrink:0; align-self:center; cursor:pointer; }
.donut-logo { position:absolute; width:58px; height:58px; border-radius:50%; border:3px solid #fff; object-fit:cover; z-index:1; }
#donut1 { position:relative; z-index:2; display:block; pointer-events:none; }
.donut-input { position:absolute; inset:0; opacity:0; cursor:pointer; z-index:10; }

/* ── 决策卡 ── */
.dec-card { border-radius:var(--radius-card); padding:14px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; min-height:0; }
.dec-list { display:flex; flex-direction:column; gap:7px; }
.dc { border-radius:10px; padding:9px 12px; background:rgba(224,59,48,.05); border:1px solid rgba(224,59,48,.15); position:relative; overflow:hidden; display:flex; flex-direction:column; gap:3px; }
.dc::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--accent-red); }
.dc.y { background:rgba(245,158,11,.05); border-color:rgba(245,158,11,.15); }
.dc.y::before { background:var(--accent-yellow); }
.dc-name { font-size:11px; font-weight:800; padding-left:7px; }
.dc-row { display:flex; gap:6px; padding-left:7px; align-items:baseline; }
.dc-lbl { font-size:9px; font-weight:700; min-width:24px; flex-shrink:0; }
.dc-lbl-risk { color:var(--text-sec); }
.dc-lbl-dec { color:var(--accent-red); }
.dc.y .dc-lbl-dec { color:#C27A00; }
.dc-txt { font-size:10px; line-height:1.4; font-weight:500; }
.dc-act { font-weight:700; color:var(--accent-red); }
.dc.y .dc-act { color:#C27A00; }
.dec-empty { font-size:11px; color:var(--text-sec); padding:10px 7px; font-weight:600; }

/* ── Hero ── */
.hero-zone { border-radius:var(--radius-card); overflow:hidden; position:relative; flex-shrink:0; cursor:pointer; }
.hero-hdr-bar { position:absolute; top:0; left:0; right:0; z-index:5; padding:10px 16px; background:linear-gradient(rgba(0,0,0,.5),transparent); display:flex; align-items:center; gap:8px; }
.hero-hd-title { font-size:13px; font-weight:800; color:#fff; text-shadow:0 2px 8px rgba(0,0,0,.3); }
.hero-imgs { display:flex; height:100%; gap:2px; }
.hero-img-wrap { flex:1; min-width:0; height:100%; }
.hero-img-wrap img { width:100%; height:100%; object-fit:cover; display:block; }
.hero-empty { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; background:rgba(255,255,255,.05); }
.hero-empty-icon { font-size:24px; color:rgba(255,255,255,.4); }
.hero-empty-txt { font-size:10px; color:rgba(255,255,255,.5); }
.hero-cap { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.8)); padding:20px 16px 14px; pointer-events:none; }
.hero-cap * { pointer-events:auto; }
.hero-cap-tag { font-size:8px; font-weight:700; color:rgba(255,255,255,.6); margin-bottom:3px; letter-spacing:.1em; text-transform:uppercase; }
.hero-cap-title { font-size:18px; font-weight:800; color:#fff; outline:none; cursor:text; }
.hero-cap-logic { font-size:10px; color:rgba(255,255,255,.8); outline:none; cursor:text; margin-top:3px; line-height:1.4; }
.hero-acts { position:absolute; top:10px; right:12px; display:flex; gap:6px; z-index:6; }
.h-btn { font-size:9px; font-weight:600; padding:3px 9px; border-radius:999px; background:rgba(255,255,255,.2); color:#fff; cursor:pointer; border:1px solid rgba(255,255,255,.3); }
.h-btn.del { background:rgba(224,59,48,.8); }

/* ── 工作区 Screen1 ── */
.work-area { display:flex; flex-direction:column; flex:1; }
.work-card { border-radius:var(--radius-card); padding:14px 18px; display:flex; flex-direction:column; flex:1; overflow:hidden; }
.wi-list { display:flex; flex-direction:column; flex:1; overflow-y:auto; }
.disp-list { display:flex; flex-direction:column; flex:1; overflow:hidden; }
.wi { display:flex; align-items:center; gap:7px; cursor:pointer; border-radius:9px; border:1px solid transparent; transition:all .18s; padding:0 7px; flex-shrink:0; margin-bottom:2px; }
.wi:hover { background:rgba(255,255,255,.5); }
.wi.picked { background:#fff; box-shadow:0 3px 10px rgba(0,0,0,.05); }
.wi-chk { width:15px; height:15px; border-radius:4px; border:1.5px solid rgba(0,0,0,.15); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:800; color:transparent; transition:.18s; }
.wi-chk.checked { background:var(--text-main); border-color:var(--text-main); color:#fff; }
.wi-badge { font-size:9px; font-weight:700; padding:1px 7px; border-radius:5px; flex-shrink:0; white-space:nowrap; }
.wi-badge.r { color:var(--accent-red); background:rgba(224,59,48,.1); }
.wi-badge.y { color:#C27A00; background:rgba(245,158,11,.1); }
.wi-badge.g { color:#1a9e3f; background:rgba(52,199,89,.1); }
.wi-txt { font-size:11px; font-weight:500; color:#3a3a3c; line-height:1.35; flex:1; }
.wi-date,.di-date { font-size:10px; color:var(--text-sec); font-weight:700; padding-left:6px; flex-shrink:0; min-width:32px; text-align:right; }
.wc-cnt { font-size:10px; font-weight:700; padding:2px 9px; border-radius:999px; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,.04); margin-left:6px; }
.disp-item { display:flex; align-items:flex-start; gap:7px; border-radius:9px; background:rgba(255,255,255,.4); border:1px solid rgba(255,255,255,.6); padding:5px 9px; margin-bottom:3px; flex-shrink:0; }
.di-badge { font-size:9px; padding:1px 7px; border-radius:5px; flex-shrink:0; font-weight:700; white-space:nowrap; margin-top:1px; }
.di-badge.r { color:var(--accent-red); background:rgba(224,59,48,.1); }
.di-badge.y { color:#C27A00; background:rgba(245,158,11,.1); }
.di-badge.g { color:#1a9e3f; background:rgba(52,199,89,.1); }
.di-txt { font-size:11px; color:#3a3a3c; line-height:1.45; flex:1; font-weight:600; }
.list-empty { font-size:11px; color:var(--text-sec); padding:14px 4px; }

/* ── BODY2 ── */
.body2 { gap:0; }
.sidebar { width:168px; flex-shrink:0; display:flex; flex-direction:column; gap:0; border-radius:var(--radius-card); overflow:hidden; padding:14px 12px; }
.sb-logo-wrap { width:80px; height:80px; border-radius:14px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden; margin:0 auto 12px; flex-shrink:0; }
.sb-logo-img { width:100%; height:100%; object-fit:cover; display:block; }
.sb-logo-hint { font-size:9px; color:rgba(255,255,255,.5); text-align:center; font-weight:600; }
.sb-section-lbl { font-size:8px; font-weight:800; color:rgba(255,255,255,.45); letter-spacing:.12em; text-transform:uppercase; margin-bottom:6px; }
.sb-focus { margin-bottom:14px; flex-shrink:0; }
.sb-focus-text { font-size:13px; font-weight:800; color:#fff; line-height:1.5; outline:none; cursor:text; min-height:32px; word-break:break-all; }
.sb-focus-text:empty::before { content:attr(data-placeholder); color:rgba(255,255,255,.25); font-weight:400; font-size:11px; }
.sb-dirs { display:flex; flex-direction:column; gap:10px; flex:1; overflow-y:auto; }
.sb-dir-item { display:flex; align-items:center; gap:8px; }
.sb-dir-ring-wrap { position:relative; width:48px; height:48px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.sb-dir-pct { position:absolute; font-size:9px; font-weight:800; color:#fff; }
.sb-dir-info { flex:1; min-width:0; }
.sb-dir-name { font-size:10px; font-weight:700; color:rgba(255,255,255,.9); }
.sb-dir-big { font-size:16px; font-weight:800; color:#fff; line-height:1.1; }
.sb-dir-unit { font-size:9px; font-weight:500; color:rgba(255,255,255,.6); }
.sb-dir-small { font-size:9px; color:rgba(255,255,255,.5); margin-top:1px; }

/* ── 主区 ── */
.main-area { flex:1; display:flex; flex-direction:column; gap:10px; padding-left:10px; min-width:0; overflow:hidden; }

/* ── 甘特图 ── */
.gantt-card { border-radius:var(--radius-card); padding:14px 18px; display:flex; flex-direction:column; height:55%; flex-shrink:0; overflow:hidden; }
.gantt-axis { display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-shrink:0; }
.gantt-axis-names { width:90px; flex-shrink:0; }
.gantt-axis-track { flex:1; position:relative; height:16px; }
.gantt-axis-label { position:absolute; transform:translateX(-50%); font-size:8px; color:var(--text-sec); font-weight:600; white-space:nowrap; }
.gantt-today-line { position:absolute; top:0; bottom:0; width:1px; border-left:1.5px solid rgba(224,59,48,.5); }
.gantt-axis-dte { width:56px; text-align:right; font-size:8px; color:var(--text-sec); font-weight:700; flex-shrink:0; }
.gantt-rows { display:flex; flex-direction:column; gap:4px; flex:1; overflow-y:auto; }
.gantt-row { display:flex; align-items:center; gap:8px; flex-shrink:0; height:22px; }
.gantt-name { width:90px; flex-shrink:0; font-size:10px; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gantt-track { flex:1; height:16px; background:rgba(0,0,0,.04); border-radius:4px; position:relative; overflow:hidden; }
.gantt-bar { position:absolute; top:2px; bottom:2px; border-radius:3px; border:1px solid transparent; }
.gantt-bar.no-date { border-style:dashed; border-color:rgba(0,0,0,.2)!important; background:rgba(0,0,0,.04)!important; }
.gantt-today-bar { position:absolute; top:-3px; bottom:-3px; width:1.5px; background:#E03B30; opacity:.5; }
.gantt-dte { width:56px; text-align:right; font-size:10px; font-weight:700; flex-shrink:0; white-space:nowrap; }
.gantt-note { font-size:9px; color:var(--text-sec); margin-top:4px; flex-shrink:0; }

/* ── 工作区 Screen2 ── */
.work-area2 { flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden; }

/* ── MODAL ── */
.overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.4); backdrop-filter:blur(20px); z-index:200; align-items:center; justify-content:center; }
.overlay.show { display:flex; }
.modal { border-radius:28px; padding:28px; width:540px; max-height:82vh; display:flex; flex-direction:column; gap:14px; box-shadow:0 30px 60px rgba(0,0,0,.15); overflow-y:auto; }
.modal-title { font-size:18px; font-weight:800; letter-spacing:-.5px; }
.modal-sub { font-size:11px; color:var(--text-sec); }
.modal-sec { display:flex; flex-direction:column; gap:7px; }
.modal-sec-lbl { font-size:9px; font-weight:800; color:var(--text-sec); letter-spacing:.1em; text-transform:uppercase; }
.modal-list { display:flex; flex-direction:column; gap:5px; max-height:300px; overflow-y:auto; }
.modal-item { font-size:12px; padding:9px 12px; border-radius:10px; background:rgba(255,255,255,.5); line-height:1.5; display:flex; gap:7px; align-items:baseline; flex-wrap:wrap; }
.modal-proj { font-size:9px; font-weight:700; color:var(--text-sec); flex-shrink:0; background:rgba(0,0,0,.04); padding:1px 6px; border-radius:4px; }
.modal-date { font-size:10px; font-weight:700; color:var(--text-sec); flex-shrink:0; margin-left:auto; }
.modal-empty { font-size:11px; color:var(--text-sec); padding:4px 8px; font-style:italic; }
.modal-btns { display:flex; gap:10px; justify-content:flex-end; margin-top:6px; }
.m-cancel { font-size:12px; font-weight:600; padding:9px 22px; border-radius:999px; border:none; background:rgba(0,0,0,.05); cursor:pointer; }
.m-ok { font-size:12px; font-weight:700; padding:9px 22px; border-radius:999px; border:none; background:var(--text-main); color:#fff; cursor:pointer; }
</style>
