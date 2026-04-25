<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { StorageService } from '@/services/storage';
import { wkKey } from '@/utils/date';
import apiClient from '@/services/api';
import type { KpiEntry, KpiData, TaskItem } from '@/core/types';

const appStore = useAppStore();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();
const storage = StorageService.getInstance();

// 权限检查
const canAccess = computed(() => authStore.isDirector);

// KPI 数据
interface OverdueItem {
  projId: number;
  projName: string;
  designOwner: string;
  text: string;
  dueDate: string;
  origWk: string;
}

const loading = ref(true);
const overdueList = ref<OverdueItem[]>([]);
const kpiData = ref<KpiData>({});

// 三段式分组
const unhandled = computed(() => {
  return overdueList.value.filter(item => {
    const k = kpiItemKey(item.projId, item.text);
    return !kpiData.value[k];
  });
});

const handled = computed(() => {
  return overdueList.value.filter(item => {
    const k = kpiItemKey(item.projId, item.text);
    const entry = kpiData.value[k];
    return entry && !entry.done;
  });
});

const confirmedPending = computed(() => {
  return Object.entries(kpiData.value)
    .filter(([, v]) => v.confirmed && !v.done)
    .map(([k, v]) => ({ key: k, entry: v }));
});

// 按项目分组
function groupByProject(items: OverdueItem[]) {
  const groups: Record<number, { name: string; owner: string; items: OverdueItem[] }> = {};
  for (const item of items) {
    if (!groups[item.projId]) {
      groups[item.projId] = { name: item.projName, owner: item.designOwner, items: [] };
    }
    groups[item.projId].items.push(item);
  }
  return groups;
}

// KPI item key 生成
function kpiItemKey(projId: number, text: string): string {
  return String(projId) + '__' + text.trim();
}

// HTML 转义
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 加载 KPI 数据
async function loadKpiPanel() {
  if (!canAccess.value) { loading.value = false; return; }

  try {
    const projects = projectStore.activeProjects;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allWeeks = storage.loadWeeks();
    const wkKeys = Object.keys(allWeeks).sort();

    // 尝试从云端加载 KPI 数据
    let cloudKpi: KpiData = {};
    try {
      if (syncStore.syncStatus.online) {
        const res = await apiClient.getDoc('kpi_data');
        if (res.success && res.data?.data) {
          cloudKpi = res.data.data;
        }
      }
    } catch (e) {
      console.warn('[KPI] 云端加载失败，使用本地数据');
    }

    // 合并：云端优先，本地补充
    const localKpi = storage.getKpiData();
    kpiData.value = { ...localKpi, ...cloudKpi };

    // 扫描所有已过截止日的条目
    const overdueMap: Record<string, OverdueItem> = {};

    for (const wk of wkKeys) {
      const wkData = allWeeks[wk];
      if (!wkData) continue;

      for (const proj of projects) {
        const snap = wkData[proj.id];
        if (!snap || !Array.isArray(snap.coreAction)) continue;

        for (const item of snap.coreAction) {
          if (!item || !item.text || !item.text.trim()) continue;
          if (!item.dueDate) continue;
          if ((item as any)._fromKPI) continue; // 排除KPI注入的，避免循环

          const d = new Date(item.dueDate);
          d.setHours(0, 0, 0, 0);

          if (d < today) {
            const k = kpiItemKey(proj.id, item.text);
            if (!overdueMap[k] || wk > overdueMap[k].origWk) {
              overdueMap[k] = {
                projId: proj.id,
                projName: proj.name,
                designOwner: proj.designOwner || '—',
                text: item.text,
                dueDate: item.dueDate,
                origWk: wk,
              };
            }
          }
        }
      }
    }

    overdueList.value = Object.values(overdueMap);
  } catch (error) {
    console.error('[KPI] 加载失败:', error);
  } finally {
    loading.value = false;
  }
}

// 勾选/取消勾选
async function kpiToggle(key: string, checked: boolean, projId: number, text: string) {
  const data = { ...kpiData.value };
  if (checked) {
    if (!data[key]) {
      data[key] = { projId: String(projId), text, newDueDate: '', confirmed: false, done: false };
    }
  } else {
    delete data[key];
    await saveKpiAndApply(data);
  }
  kpiData.value = data;
  await saveKpiAndApply(data);
}

// 设置新截止日期
async function kpiSetDate(key: string, date: string, projId: number, text: string) {
  const data = { ...kpiData.value };
  if (!data[key]) {
    data[key] = { projId: String(projId), text, newDueDate: '', confirmed: false, done: false };
  }
  data[key].newDueDate = date;
  kpiData.value = data;
  await saveKpiAndApply(data);
}

// 确认延误
async function kpiConfirm(key: string, projId: number, text: string) {
  const data = { ...kpiData.value };
  const entry = data[key];
  if (!entry || !entry.newDueDate) {
    alert('请先设定新的完成时间');
    return;
  }

  data[key] = {
    ...entry,
    confirmed: true,
    projId: String(projId),
    text,
    projName: projectStore.getProject(projId)?.name || '',
  };

  kpiData.value = data;
  await saveKpiAndApply(data);
  alert('已确认延误，将在对应周显示');
}

// 标记已完成
async function kpiMarkDone(key: string) {
  const data = { ...kpiData.value };
  if (data[key]) {
    data[key] = { ...data[key], done: true, confirmed: false };
  }
  kpiData.value = data;
  await saveKpiAndApply(data);
}

// 移除
async function kpiRemove(key: string) {
  const data = { ...kpiData.value };
  delete data[key];
  kpiData.value = data;
  await saveKpiAndApply(data);
}

// 保存 KPI 数据到本地+云端，并注入快照
async function saveKpiAndApply(data: KpiData) {
  storage.saveKpiData(data);

  // 注入 KPI 项到当前周快照（匹配旧系统 _applyKpiToSnaps）
  await applyKpiToSnaps(data);

  // 云端同步
  if (syncStore.syncStatus.online) {
    try {
      await apiClient.setDoc('kpi_data', {
        data,
        _updatedAt: Date.now(),
        _updatedBy: authStore.currentUser || 'system',
      });
    } catch (e) {
      console.warn('[KPI] 云端同步失败:', e);
    }
  }
}

// 将 KPI 确认的延误项注入当前周快照
async function applyKpiToSnaps(data: KpiData) {
  const projects = projectStore.projects;
  const weeks = storage.loadWeeks();
  const curKey = wkKey(appStore.yr, appStore.wk);

  for (const proj of projects) {
    const confirmedForProj = Object.values(data).filter(
      v => String(v.projId) === String(proj.id) && v.confirmed && !v.done
    );

    if (!weeks[curKey]) (weeks as any)[curKey] = {};
    if (!weeks[curKey][proj.id]) {
      const base = storage.getSnap(appStore.yr, appStore.wk, proj.id, projects);
      weeks[curKey][proj.id] = { ...base, _savedWk: curKey };
    }

    const snap = weeks[curKey][proj.id];
    const existingActions = Array.isArray(snap.coreAction) ? [...snap.coreAction] : [];

    // 清除旧的 KPI 注入条目，重新注入
    const cleaned = existingActions.filter(i => !(i as any)._fromKPI);
    for (const v of confirmedForProj) {
      cleaned.push({ text: v.text, dueDate: v.newDueDate, _fromKPI: true });
    }
    weeks[curKey][proj.id] = { ...snap, coreAction: cleaned };
  }

  storage.saveWeeks(weeks);

  // 同步快照到云端
  if (syncStore.syncStatus.online) {
    try {
      for (const proj of projects) {
        const localSnap: Record<string, any> = {};
        Object.keys(weeks).forEach(wk => {
          if (weeks[wk][proj.id]) localSnap[wk] = weeks[wk][proj.id];
        });
        await apiClient.saveProjectSnapshots(proj.id, localSnap, String(Date.now()));
      }
    } catch (e) {
      console.warn('[KPI] 快照云端同步失败:', e);
    }
  }
}

// 刷新
async function refresh() {
  loading.value = true;
  await loadKpiPanel();
}

// 切换到 KPI tab 时自动加载
watch(() => canAccess.value, (val) => {
  if (val) loadKpiPanel();
});

onMounted(loadKpiPanel);
</script>

<template>
  <div v-if="!canAccess" class="empty">无权限查看此页面</div>

  <template v-else>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div>
        <div style="font-size:14px;font-weight:700;">📊 KPI 未完成事项跟踪</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px;">
          汇总所有项目已过截止日的本周计划，可登记新完成时间并标记延误
        </div>
      </div>
      <button class="bs" style="font-size:11px;padding:5px 12px;" @click="refresh">🔄 刷新</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" style="text-align:center;padding:32px;color:var(--t3);">加载中…</div>

    <template v-else>
      <!-- 无待处理 -->
      <div v-if="overdueList.length === 0 && confirmedPending.length === 0" class="empty" style="padding:32px;">
        🎉 当前没有已过截止日的未完成事项
      </div>

      <!-- 待处理 -->
      <template v-if="unhandled.length">
        <div style="font-size:12px;font-weight:700;color:var(--rt);margin-bottom:8px;">
          ⚠ 待处理（{{ unhandled.length }}项未登记）
        </div>
        <div v-for="[pid, group] in Object.entries(groupByProject(unhandled))" :key="'u-'+pid" class="kpi-group">
          <div class="kpi-group-hd">
            <div style="font-size:12px;font-weight:700;flex:1;">{{ group.name }}</div>
            <div style="font-size:10px;color:var(--t3);">研策：{{ group.owner }}</div>
          </div>
          <div v-for="item in group.items" :key="'u-'+item.projId+'-'+item.text" class="kpi-item">
            <input
              type="checkbox"
              style="width:15px;height:15px;flex-shrink:0;margin-top:1px;accent-color:var(--gold);cursor:pointer;"
              @change="kpiToggle(kpiItemKey(item.projId, item.text), ($event.target as HTMLInputElement).checked, item.projId, item.text)"
            />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;line-height:1.5;">{{ item.text }}</div>
              <div style="font-size:10px;color:var(--t3);margin-top:2px;">
                原截止：<span style="color:var(--rt);">{{ item.dueDate.replace(/-/g, '/') }}</span> · {{ item.origWk }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 已勾选待确认 -->
      <template v-if="handled.length">
        <div style="font-size:12px;font-weight:700;color:var(--yt);margin:14px 0 8px;">
          📝 已勾选待确认（{{ handled.length }}项）
        </div>
        <div v-for="[pid, group] in Object.entries(groupByProject(handled))" :key="'h-'+pid" class="kpi-group">
          <div class="kpi-group-hd">
            <div style="font-size:12px;font-weight:700;flex:1;">{{ group.name }}</div>
            <div style="font-size:10px;color:var(--t3);">研策：{{ group.owner }}</div>
          </div>
          <div v-for="item in group.items" :key="'h-'+item.projId+'-'+item.text" class="kpi-item">
            <input
              type="checkbox"
              checked
              style="width:15px;height:15px;flex-shrink:0;margin-top:1px;accent-color:var(--gold);cursor:pointer;"
              @change="kpiToggle(kpiItemKey(item.projId, item.text), ($event.target as HTMLInputElement).checked, item.projId, item.text)"
            />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;line-height:1.5;">{{ item.text }}</div>
              <div style="font-size:10px;color:var(--t3);margin-top:2px;">
                原截止：<span style="color:var(--rt);">{{ item.dueDate.replace(/-/g, '/') }}</span> · {{ item.origWk }}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
              <input
                type="date"
                :value="kpiData[kpiItemKey(item.projId, item.text)]?.newDueDate || ''"
                :min="new Date().toISOString().slice(0, 10)"
                style="font-size:11px;padding:3px 6px;border:0.5px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--tx);font-family:var(--fn);width:130px;"
                @change="kpiSetDate(kpiItemKey(item.projId, item.text), ($event.target as HTMLInputElement).value, item.projId, item.text)"
              />
              <button
                class="bp"
                style="font-size:10px;padding:3px 10px;white-space:nowrap;"
                @click="kpiConfirm(kpiItemKey(item.projId, item.text), item.projId, item.text)"
              >确认延误</button>
            </div>
          </div>
        </div>
      </template>

      <!-- 已确认延误 -->
      <template v-if="confirmedPending.length">
        <div style="margin-top:16px;background:var(--rb);border:0.5px solid var(--rbd);border-radius:var(--r);padding:12px 14px;">
          <div style="font-size:12px;font-weight:700;color:var(--rt);margin-bottom:8px;">
            📌 已确认延误，将在对应周显示（{{ confirmedPending.length }}项）
          </div>
          <div
            v-for="{ key, entry } in confirmedPending"
            :key="'c-'+key"
            style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--rbd);font-size:11px;"
          >
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;">{{ entry.text }}</div>
              <div style="color:var(--t3);font-size:10px;margin-top:1px;">
                新截止：<strong style="color:var(--rt);">{{ (entry.newDueDate || '').replace(/-/g, '/') }}</strong>
                <span v-if="entry.projName"> · {{ entry.projName }}</span>
              </div>
            </div>
            <button
              style="font-size:10px;padding:3px 10px;background:none;border:0.5px solid var(--gt);color:var(--gt);border-radius:4px;cursor:pointer;font-family:var(--fn);white-space:nowrap;"
              @click="kpiMarkDone(key)"
            >✓ 已完成</button>
            <button
              style="font-size:10px;padding:3px 8px;background:none;border:0.5px solid var(--bdr);color:var(--t3);border-radius:4px;cursor:pointer;font-family:var(--fn);"
              @click="kpiRemove(key)"
            >移除</button>
          </div>
        </div>
      </template>
    </template>
  </template>
</template>

<style scoped>
.kpi-group {
  background: var(--card);
  border: 0.5px solid var(--bdr);
  border-radius: var(--r);
  margin-bottom: 8px;
  overflow: hidden;
}

.kpi-group-hd {
  padding: 8px 14px;
  background: var(--gl);
  border-bottom: 0.5px solid var(--bdr);
  display: flex;
  align-items: center;
  gap: 8px;
}

.kpi-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 0.5px solid var(--bdr);
}

.kpi-item:last-child {
  border-bottom: none;
}
</style>
