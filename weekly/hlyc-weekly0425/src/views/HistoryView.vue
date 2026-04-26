<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { StorageService } from '@/services/storage';
import { useAppStore } from '@/stores/app';
import { wkLabel, wkRange, parseWkKey, getCurrentYearWeek } from '@/utils/date';

const storage = StorageService.getInstance();
const router = useRouter();
const appStore = useAppStore();

// 当前年周（用于高亮本周）
const currentWeek = getCurrentYearWeek();

interface WeekRecord {
  key: string;
  yr: number;
  wk: number;
  range: string;
  fullLabel: string;
  dateRange: string;
  r: number;
  y: number;
  g: number;
  isCurrent: boolean;
}

const weekRecords = ref<WeekRecord[]>([]);

onMounted(() => {
  const weeks = storage.loadWeeks();
  const keys = Object.keys(weeks).sort().reverse();
  weekRecords.value = keys.map(k => {
    // 用 parseWkKey 正确解析 "2026-W18" 格式，避免 parseInt("W18") = NaN
    let yr: number, wk: number;
    try {
      const parsed = parseWkKey(k);
      yr = parsed.yr;
      wk = parsed.wk;
    } catch {
      return null; // 跳过格式异常的 key
    }
    const snaps = Object.values(weeks[k] || {}).filter((s: any) => s && typeof s === 'object' && s.status);
    return {
      key: k,
      yr,
      wk,
      range: `${yr} W${String(wk).padStart(2, '0')}`,
      fullLabel: wkLabel(yr, wk),
      dateRange: wkRange(yr, wk),
      r: snaps.filter((s: any) => s.status === 'r').length,
      y: snaps.filter((s: any) => s.status === 'y').length,
      g: snaps.filter((s: any) => s.status === 'g').length,
      isCurrent: yr === currentWeek.yr && wk === currentWeek.wk,
    };
  }).filter(Boolean) as WeekRecord[];
});

function jumpToWeek(yr: number, wk: number) {
  appStore.gotoWeek({ yr, wk });
  // 跳转到周报页并切换到对应周
  router.push('/weekly');
}

// 导出备份（复用 storage.exportAll）
function exportBackup() {
  const json = storage.exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导入数据
function importData() {
  showImportModal.value = true;
  importJson.value = '';
}

const showImportModal = ref(false);
const importJson = ref('');

function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    importJson.value = ev.target?.result as string;
  };
  reader.readAsText(file);
}

function doImport() {
  if (!importJson.value.trim()) {
    alert('请先粘贴 JSON 数据或上传文件');
    return;
  }
  try {
    const data = JSON.parse(importJson.value);
    if (!confirm(`确定导入数据吗？\n项目数: ${data.projects?.length || 0}\n导出时间: ${data.exportTime || '未知'}`)) {
      return;
    }
    storage.importAll(importJson.value);
    alert('导入成功，页面即将刷新');
    location.reload();
  } catch (err) {
    alert('导入失败: ' + (err instanceof Error ? err.message : '文件格式错误'));
  }
}
</script>

<template>
  <div class="io-bar no-print">
    <span class="io-btn" style="cursor:default">☁ 已同步</span>
    <button class="io-btn" @click="exportBackup">📤 导出备份</button>
    <button class="io-btn imp" @click="importData">📥 导入</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="font-size:14px;font-weight:700">历史周报记录</div>
  </div>

  <div v-if="weekRecords.length === 0" class="empty">
    暂无历史数据<br>
    <span style="font-size:11px">提交项目后将在此显示历史记录</span>
  </div>

  <div v-else class="hw">
    <div class="hw-hd">所有周次（点击跳转查阅）</div>
    <div
      v-for="record in weekRecords"
      :key="record.key"
      class="wki"
      :class="{ 'wki-current': record.isCurrent }"
      @click="jumpToWeek(record.yr, record.wk)"
    >
      <div style="flex:1">
        <div class="wki-l">
          {{ record.fullLabel }}
          <span v-if="record.isCurrent" class="wki-now">本周</span>
        </div>
        <div class="wki-sub">{{ record.dateRange }}</div>
      </div>
      <div class="wk-cnt">
        <div v-if="record.r" class="wk-dot r">🔴 {{ record.r }}</div>
        <div v-if="record.y" class="wk-dot y">🟡 {{ record.y }}</div>
        <div v-if="record.g" class="wk-dot g">🟢 {{ record.g }}</div>
      </div>
    </div>
  </div>

  <!-- 导入数据模态框 -->
  <div v-if="showImportModal" class="modal-overlay">
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <div class="modal-title">📥 导入数据</div>
        <button class="modal-close" @click="showImportModal = false">×</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:10px">
          <label class="ff-label" style="display:block;margin-bottom:5px">上传备份文件</label>
          <input type="file" accept=".json" @change="handleImportFile" style="font-size:12px" />
        </div>
        <div class="ff">
          <label class="ff-label">或粘贴 JSON 数据</label>
          <textarea
            v-model="importJson"
            placeholder="将导出的 JSON 数据粘贴到此处…"
            style="width:100%;height:200px;font-size:11px;font-family:monospace;background:var(--bg);border:0.5px solid var(--bdr);border-radius:var(--rr);padding:10px;color:var(--tx);resize:none"
          ></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="bs" @click="showImportModal = false">取消</button>
        <button class="bp" @click="doImport">确认导入</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 使用全局 main.css 类名 */
.wki-current {
  border-left: 3px solid var(--rt) !important;
  background: var(--rb) !important;
}

.wki-now {
  display: inline-block;
  font-size: 10px;
  background: var(--rt);
  color: #fff;
  padding: 1px 6px;
  border-radius: 6px;
  font-weight: 600;
  margin-left: 6px;
  vertical-align: middle;
}

.wki-sub {
  font-size: 11px;
  color: var(--t3);
  margin-top: 2px;
}
</style>
