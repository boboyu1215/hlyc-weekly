<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { StorageService } from '@/services/storage';
import { STAGES, STATUS_LABELS } from '@/config/constants';
import { wkLabel, wkRange } from '@/utils/date';

const appStore = useAppStore();
const projectStore = useProjectStore();
const storage = StorageService.getInstance();

const stats = computed(() => {
  const projects = projectStore.activeProjects;
  const sc2 = { r: 0, y: 0, g: 0 };
  const sd: number[] = Array(STAGES.length).fill(0);
  const sorted: any[] = [];
  const redProjects: any[] = [];
  const yelProjects: any[] = [];
  const grnProjects: any[] = [];

  projects.forEach(project => {
    const snap = storage.getSnap(appStore.yr, appStore.wk, project.id, projectStore.projects);
    const item = { ...project, ...snap };
    sc2[snap.status]++;
    sd[Math.min(snap.stage, STAGES.length - 1)]++;
    sorted.push(item);
    if (snap.status === 'r') redProjects.push(item);
    else if (snap.status === 'y') yelProjects.push(item);
    else grnProjects.push(item);
  });

  sorted.sort((a, b) => ({ r: 0, y: 1, g: 2 }[a.status] || 0) - ({ r: 0, y: 1, g: 2 }[b.status] || 0));

  const maxSD = Math.max(...sd, 1);

  return { sc2, sd, maxSD, sorted, total: projects.length, redProjects, yelProjects, grnProjects };
});

// 时间轴数据（匹配旧系统 charts.js 的 Gantt 计算逻辑）
const timeline = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const projects = projectStore.activeProjects;

  const items = projects.map(p => {
    const snap = storage.getSnap(appStore.yr, appStore.wk, p.id, projectStore.projects);
    const start = p.startDate ? new Date(p.startDate.replace(/\//g, '-')) : null;
    const end = p.completionDate ? new Date(p.completionDate.replace(/\//g, '-')) : null;
    const dFS = start ? Math.round((today.getTime() - start.getTime()) / 86400000) : null;
    const dTE = end ? Math.round((end.getTime() - today.getTime()) / 86400000) : null;
    return { ...p, status: snap.status || 'g', start, end, dFS, dTE };
  }).filter(p => p.start || p.end);

  if (items.length === 0) return { items: [], todayPct: 50 };

  const allDates = [
    ...items.map(p => p.start).filter(Boolean) as Date[],
    today,
    ...items.map(p => p.end).filter(Boolean) as Date[]
  ];
  const minD = allDates.reduce((a, b) => a < b ? a : b, today);
  const maxD = allDates.reduce((a, b) => a > b ? a : b, today);
  const span = Math.max((maxD.getTime() - minD.getTime()) / 86400000, 1);
  const minS = (minD.getTime() - today.getTime()) / 86400000;
  const todayPct = Math.round(-minS / span * 100);

  const enriched = items.map(p => {
    const cl = p.status === 'r' ? '#b00020' : p.status === 'y' ? '#9a7200' : '#1a6830';
    const s2 = p.start ? Math.max(0, Math.round((-(p.dFS || 0) - minS) / span * 100)) : 0;
    const e2 = p.end ? Math.min(100, Math.round((span - (p.dTE || 0) + (-minS)) / span * 100)) : 70;
    const barL = Math.max(0, Math.min(s2, e2));
    const barR = Math.min(100, Math.max(barL + 2, Math.max(s2, e2)));
    const dc = p.dTE !== null ? (p.dTE <= 30 ? 'var(--rt)' : p.dTE <= 60 ? 'var(--yt)' : 'var(--t3)') : 'var(--t3)';
    return { ...p, cl, barL, barR, dc };
  });

  return { items: enriched, todayPct };
});

function getItemListText(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((i: any) => i.text && i.text.trim()).map((i: any) => i.text).join('；');
  return '';
}

function truncName(name: string, max: number): string {
  return name.length > max ? name.slice(0, max) + '…' : name;
}

// PDF勾选导出
const showPdfPicker = ref(false);
const pdfItems = ref<Array<{projId: number; projName: string; field: string; label: string; text: string; checked: boolean}>>([]);

function openPdfPicker() {
  const items: typeof pdfItems.value = [];
  stats.value.sorted.forEach(p => {
    const snap = storage.getSnap(appStore.yr, appStore.wk, p.id, projectStore.projects);
    // 上周完成
    const output = (() => {
      const items2 = (snap as any).coreOutputItems;
      if (items2 && Array.isArray(items2)) {
        return items2.filter((i: any) => i.text?.trim()).map((i: any) => i.text).join('；');
      }
      return snap.coreOutput || '';
    })();
    if (output && output !== '无') {
      items.push({ projId: p.id, projName: p.name, field: 'coreOutput', label: '上周完成', text: output, checked: true });
    }
    // 本周计划
    const action = getItemListText(snap.coreAction);
    if (action && action !== '无') {
      items.push({ projId: p.id, projName: p.name, field: 'coreAction', label: '本周计划', text: action, checked: true });
    }
    // 风险
    const risk = getItemListText(snap.risk);
    if (risk && risk !== '无') {
      items.push({ projId: p.id, projName: p.name, field: 'risk', label: '风险/卡点', text: risk, checked: true });
    }
    // 跨部门
    const cross = getItemListText(snap.crossDept);
    if (cross && cross !== '无' && cross !== '本周无需跨部门支援') {
      items.push({ projId: p.id, projName: p.name, field: 'crossDept', label: '跨部门支援', text: cross, checked: true });
    }
  });
  pdfItems.value = items;
  showPdfPicker.value = true;
}

function doPdfExport() {
  showPdfPicker.value = false;
  const unchecked = pdfItems.value.filter(i => !i.checked);
  const hiddenEls: HTMLElement[] = [];
  unchecked.forEach(item => {
    const els = document.querySelectorAll(`[data-pdf-item="${item.projId}-${item.field}"]`);
    els.forEach(el => {
      (el as HTMLElement).style.display = 'none';
      hiddenEls.push(el as HTMLElement);
    });
  });
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      hiddenEls.forEach(el => { el.style.display = ''; });
    }, 1000);
  }, 100);
}
</script>

<template>
  <div class="print-hd">
    <h1>华力集团｜研策部可视化周报</h1>
    <p>{{ wkLabel(appStore.yr, appStore.wk) }}（{{ wkRange(appStore.yr, appStore.wk) }}）</p>
  </div>

  <div class="io-bar no-print">
    <span class="io-btn" style="cursor:default">☁ 已同步</span>
    <button class="io-btn" @click="openPdfPicker">📄 导出 PDF</button>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">可视化看板</div>
  </div>

  <!-- 项目健康度总览 -->
  <div class="cc">
    <div class="cc-t">项目健康度总览</div>
    <div class="health-grid">
      <div
        v-for="p in stats.sorted"
        :key="p.id"
        class="hc"
        :class="p.status"
      >
        <div class="hc-nm">{{ p.name }}</div>
        <div class="hc-stage">{{ STAGES[p.stage] || '—' }} 阶段</div>
        <div class="hc-risks">
          <div class="hc-risk">{{ getItemListText(p.risk) || '正常推进' }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 项目状态分布（含项目名标签，匹配旧版） -->
  <div class="cc">
    <div class="cc-t">项目状态分布</div>
    <div class="bch">
      <div v-for="(item, idx) in [
        { lb: '需决策/卡住', cl: '#c0392b', cnt: stats.sc2.r, ps: stats.redProjects },
        { lb: '需关注', cl: '#d4840a', cnt: stats.sc2.y, ps: stats.yelProjects },
        { lb: '正常推进', cl: '#27ae60', cnt: stats.sc2.g, ps: stats.grnProjects }
      ]" :key="idx" class="br" style="align-items:flex-start;margin-bottom:6px">
        <div class="bl" style="padding-top:3px">{{ item.lb }}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px">
          <div style="width:100%;height:20px;background:var(--bdr);border-radius:4px;overflow:hidden">
            <div
              :style="{
                width: (stats.total ? item.cnt / stats.total * 100 : 0) + '%',
                height: '100%',
                background: item.cl,
                borderRadius: '4px',
                transition: 'width .4s',
                display: item.cnt === 0 ? 'none' : ''
              }"
            ></div>
          </div>
          <!-- 项目名标签（匹配旧系统 ps.map） -->
          <div v-if="item.cnt > 0 && item.ps && item.ps.length" style="display:flex;flex-wrap:wrap;gap:3px">
            <span
              v-for="p in item.ps"
              :key="p.id"
              style="font-size:10px;padding:2px 7px;border-radius:3px"
              :style="{ background: item.cl + '22', color: item.cl, border: '0.5px solid ' + item.cl + '55' }"
            >{{ truncName(p.name, 10) }}</span>
          </div>
        </div>
        <div style="min-width:36px;text-align:right;font-size:12px;font-weight:700"
          :style="{ color: item.cnt > 0 ? item.cl : 'var(--t3)' }"
        >{{ item.cnt }} 个</div>
      </div>
    </div>
  </div>

  <!-- 各设计阶段分布 -->
  <div class="cc">
    <div class="cc-t">各设计阶段分布</div>
    <div class="bch">
      <div v-for="(cnt, idx) in stats.sd" :key="idx" class="br" v-show="cnt">
        <div class="bl">{{ STAGES[idx] }}</div>
        <div class="bt" style="height:18px">
          <div class="bf" :style="{ width: Math.round(cnt / stats.maxSD * 100) + '%', background: 'var(--gold)' }"></div>
        </div>
        <div class="bv">{{ cnt }}个</div>
      </div>
      <div v-if="stats.sd.every(v => !v)" class="empty">暂无数据</div>
    </div>
  </div>

  <!-- 项目时间轴（Gantt 图，匹配旧系统 charts.js tlItems） -->
  <div v-if="timeline.items.length" class="cc">
    <div class="cc-t">项目时间轴</div>
    <div class="tlw">
      <div v-for="p in timeline.items" :key="p.id" class="tlr">
        <div class="tln" :title="p.name">{{ truncName(p.name, 13) }}</div>
        <div class="tlt">
          <div class="tlb" :style="{ left: p.barL + '%', width: (p.barR - p.barL) + '%', background: p.cl }"></div>
          <div style="position:absolute;top:-4px;width:1px;height:calc(100% + 8px);border-left:2px dashed var(--rt);opacity:.7;z-index:2" :style="{ left: timeline.todayPct + '%' }"></div>
        </div>
        <div class="tlds" :style="{ color: p.dc }">{{ p.dTE !== null ? p.dTE + '天' : '无' }}</div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--t3);margin-top:7px">虚线=今天 · 数字=距竣工天数</div>
  </div>

  <!-- 本周行动汇总 -->
  <div class="cc">
    <div class="cc-t">本周行动汇总</div>
    <div class="ali">
      <div v-for="(p, idx) in stats.sorted.filter(p => getItemListText(p.coreAction) && getItemListText(p.coreAction) !== '无' && getItemListText(p.coreAction) !== '—')" :key="p.id" class="ai" :data-pdf-item="`${p.id}-coreAction`">
        <div style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--gl);color:var(--gold);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">{{ idx + 1 }}</div>
        <div>
          <div class="badge" :class="p.status" style="font-size:10px;margin-bottom:3px">{{ p.name }}</div>
        </div>
        <div class="at">{{ getItemListText(p.coreAction) }}</div>
      </div>
      <div v-if="!stats.sorted.length" class="empty">暂无数据</div>
    </div>
  </div>

  <!-- 上周完成情况汇总 -->
  <div class="cc">
    <div class="cc-t">上周完成事项</div>
    <div class="ali">
      <template v-for="(p, idx) in stats.sorted" :key="p.id">
        <div
          v-if="(() => { const snap = storage.getSnap(appStore.yr, appStore.wk, p.id, projectStore.projects); const items2 = (snap as any).coreOutputItems; const txt = items2 && Array.isArray(items2) ? items2.filter((i:any)=>i.text?.trim()).map((i:any)=>i.text).join('；') : (snap.coreOutput||''); return txt && txt !== '无'; })()"
          class="ai"
          :data-pdf-item="`${p.id}-coreOutput`"
        >
          <div style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--gl);color:var(--gold);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">{{ idx + 1 }}</div>
          <div><div class="badge" :class="p.status" style="font-size:10px;margin-bottom:3px">{{ p.name }}</div></div>
          <div class="at">{{
            (() => {
              const snap = storage.getSnap(appStore.yr, appStore.wk, p.id, projectStore.projects);
              const items2 = (snap as any).coreOutputItems;
              return items2 && Array.isArray(items2) ? items2.filter((i:any)=>i.text?.trim()).map((i:any)=>i.text).join('；') : (snap.coreOutput||'');
            })()
          }}</div>
        </div>
      </template>
    </div>
  </div>

  <!-- PDF勾选导出弹窗 -->
  <div v-if="showPdfPicker" style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;display:flex;align-items:center;justify-content:center" @click.self="showPdfPicker=false">
    <div style="background:var(--card);border-radius:12px;padding:20px;width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:15px;font-weight:700;margin-bottom:12px">选择导出内容</div>
      <div style="margin-bottom:8px;display:flex;gap:10px">
        <button @click="pdfItems.forEach(i=>i.checked=true)" style="font-size:12px;color:var(--gold);background:none;border:none;cursor:pointer">全选</button>
        <button @click="pdfItems.forEach(i=>i.checked=false)" style="font-size:12px;color:var(--t3);background:none;border:none;cursor:pointer">全不选</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
        <label v-for="item in pdfItems" :key="`${item.projId}-${item.field}`" style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--bg);border-radius:8px;cursor:pointer">
          <input type="checkbox" v-model="item.checked" style="margin-top:2px;flex-shrink:0" />
          <div>
            <div style="font-size:11px;color:var(--gold);font-weight:600;margin-bottom:2px">{{ item.projName }} · {{ item.label }}</div>
            <div style="font-size:12px;color:var(--t2);line-height:1.4">{{ item.text }}</div>
          </div>
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button @click="showPdfPicker=false" style="padding:6px 16px;border:0.5px solid var(--bdr);border-radius:var(--rr);background:var(--bg);cursor:pointer;font-size:13px">取消</button>
        <button @click="doPdfExport()" style="padding:6px 16px;background:var(--gold);color:#fff;border:none;border-radius:var(--rr);cursor:pointer;font-size:13px;font-weight:600">导出 PDF</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 使用全局 main.css 的 cc/cc-t/health-grid/hc/bch/br/bl/bt/bf/bv/ali/ai/at/badge 类名 */
/* 时间轴样式（匹配旧系统 tlw/tlr/tln/tlt/tlb/tlds） */
.tlw { display: flex; flex-direction: column; gap: 8px; }
.tlr { display: flex; align-items: center; gap: 10px; }
.tln { flex-shrink: 0; width: 90px; font-size: 11px; font-weight: 700; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tlt { flex: 1; position: relative; height: 22px; background: var(--bdr); border-radius: 4px; overflow: hidden; }
.tlb { position: absolute; top: 2px; bottom: 2px; border-radius: 3px; transition: all .4s; }
.tlds { flex-shrink: 0; width: 40px; text-align: right; font-size: 11px; font-weight: 700; }
</style>
