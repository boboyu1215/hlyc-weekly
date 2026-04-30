<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { StorageService } from '@/services/storage';
import { STAGES, STATUS_LABELS } from '@/config/constants';
import { DEL_PWD } from '@/config/constants';
import { wkLabel, wkRange } from '@/utils/date';
import type { Project, WeeklySnapshot } from '@/core/types';
import draggable from 'vuedraggable';
import SubmitDiffDialog from '@/components/SubmitDiffDialog.vue';
import WeeklyFormDialog from '@/components/WeeklyFormDialog.vue';

const appStore = useAppStore();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();
const storage = StorageService.getInstance();

const showWeeklyDialog = ref(false);
const editingProject = ref<Project | null>(null);
const showPendingConfirm = ref(false);
const showSubmitDialog = ref(false);
const submittingProject = ref<Project | null>(null);

const isNow = computed(() => appStore.isCurrentWeek);

// 当前用户的项目置顶排序：当前用户项目始终排最前，组内再按 sortOrder
const activeProjects = computed({
  get() {
    const user = authStore.currentUser;
    const projects = [...projectStore.activeProjects];
    return projects.sort((a, b) => {
      // 第一优先级：当前用户的项目置顶
      const aMine = user && a.designOwner === user ? 0 : 1;
      const bMine = user && b.designOwner === user ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      // 第二优先级：组内按 sortOrder 排序
      return (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id);
    });
  },
  set(value: Project[]) {
    // 直接按拖动结果更新，不再重排
    projectStore.updateProjectOrder(value.map(p => p.id));
  }
});

function getSnap(project: Project): WeeklySnapshot {
  return storage.getSnap(appStore.yr, appStore.wk, project.id, projectStore.projects);
}

function sc(status: string): string {
  return status === 'r' ? 'r' : status === 'y' ? 'y' : 'g';
}

function editWeekly(project: Project) {
  if (!authStore.isLoggedIn) { authStore.showLoginDialog = true; return; }
  editingProject.value = project;
  showWeeklyDialog.value = true;
}

function handleWeeklySaved() { projectStore.loadProjects(); refreshPending(); }

function askSubmit(project: Project) {
  if (!authStore.isLoggedIn) { authStore.showLoginDialog = true; return; }
  submittingProject.value = project;
  showSubmitDialog.value = true;
}

function handleSubmitDone(success: boolean) {
  if (success) {
    projectStore.loadProjects();
    refreshPending();
  }
  showSubmitDialog.value = false;
}

// 渲染项目快照的四维信息
// 数组字段统一格式：序号. 内容（月｜日），每项一行
function renderDimBody(v: any, emptyText: string): string {
  const empty = emptyText || '无';
  if (!v || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return empty;
  if (typeof v === 'string') return v.trim() || empty;
  if (Array.isArray(v)) {
    return v
      .filter((i: any) => i.text?.trim())
      .map((i: any, idx: number) => {
        const num = idx + 1;
        const due = i.dueDate ? formatDueDate(i.dueDate) : '';
        return due ? `${num}. ${i.text}（${due}）` : `${num}. ${i.text}`;
      })
      .join('\n') || empty;
  }
  return empty;
}

// 横幅专用：简洁显示，只取内容，不加分隔
function renderBannerText(v: any): string {
  if (!v || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.filter((i: any) => i.text?.trim()).map((i: any) => i.text).join('；');
  return '';
}

// 提取 dueDate 中的月和日部分，如 "2026-05-15" → "5｜15"
function formatDueDate(dueDate: string): string {
  if (!dueDate) return '';
  // 支持格式：2026-05-15、2026/05/15、5月15日、05-15 等
  const nums = dueDate.match(/(\d{1,2})[-/月](\d{1,2})/);
  if (nums) return `${parseInt(nums[1])}｜${parseInt(nums[2])}`;
  return dueDate;
}

// 判断字段是否有实质内容（用于决策/风险提示横幅）
function fieldHasContent(v: any): boolean {
  if (!v) return false;
  if (Array.isArray(v)) return v.some((i: any) => i.text?.trim() && i.text.trim() !== '无');
  if (typeof v === 'string') return v.trim() !== '' && v.trim() !== '无';
  return false;
}

// 导出备份（匹配旧系统 app.js 的 exportData 逻辑）
function exportBackup() {
  const json = storage.exportAll();
  // 弹出模态框显示 JSON + 复制按钮 + 下载按钮
  showExportModal.value = true;
  exportJson.value = json;
}

const showExportModal = ref(false);
const exportJson = ref('');

function copyExportJson() {
  navigator.clipboard.writeText(exportJson.value).then(() => {
    alert('已复制到剪贴板');
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = exportJson.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('已复制到剪贴板');
  });
}

function downloadExportJson() {
  const blob = new Blob([exportJson.value], { type: 'application/json' });
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

// 指标统计
const metrics = computed(() => {
  const snaps = activeProjects.value.map(p => getSnap(p));
  return {
    total: snaps.length,
    r: snaps.filter(s => s.status === 'r').length,
    y: snaps.filter(s => s.status === 'y').length,
    g: snaps.filter(s => s.status === 'g').length,
  };
});

// 本周会议数
const meetingCount = computed(() => {
  const weeks = storage.loadWeeks();
  const wk = appStore.weekKey;
  const wkData = weeks[wk];
  return wkData?.__meetings?.length || 0;
});

// 待提交项目ID集合（用 ref + 手动刷新，因为 localStorage 不是 Vue 响应式的）
const pendingSubmits = ref<Set<number>>(storage.loadPendingSubmit());
function refreshPending() { pendingSubmits.value = storage.loadPendingSubmit(); }

// 删除项目（仅总监，匹配旧系统 _deleteProjectConfirm）
function deleteProject(project: Project) {
  if (!authStore.isDirector) return;
  const pwd = prompt('请输入删除密码：');
  if (pwd !== DEL_PWD) {
    alert('删除密码错误');
    return;
  }
  if (!confirm(`确定删除项目「${project.name}」吗？此操作不可恢复。`)) return;

  // 删除项目
  projectStore.deleteProject(project.id);

  // 记录活动
  storage.addActivity({
    type: 'delete',
    user: authStore.currentUser!,
    time: Date.now(),
    desc: `删除项目「${project.name}」`,
    projectId: project.id,
    weekKey: appStore.weekKey
  });
}

// 归档项目（仅总监）
function archiveProject(project: Project) {
  if (!authStore.isDirector) return;
  if (!confirm(`确定归档「${project.name}」吗？归档后将从周报中移除。`)) return;

  projectStore.archiveProject(project.id);

  storage.addActivity({
    type: 'archive',
    user: authStore.currentUser!,
    time: Date.now(),
    desc: `归档项目「${project.name}」`,
    projectId: project.id,
    weekKey: appStore.weekKey
  });
}
// ── 关闭/切换页面时检查未提交数据 ──
function handleBeforeUnload(e: BeforeUnloadEvent) {
  const pending = storage.loadPendingSubmit();
  if (pending.size > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    const pending = storage.loadPendingSubmit();
    if (pending.size > 0) {
      showPendingConfirm.value = true;
    }
  }
}

async function autoSubmitAll() {
  const pending = storage.loadPendingSubmit();
  for (const projectId of pending) {
    const project = projectStore.projects.find((p: any) => p.id === projectId);
    if (project) await askSubmit(project);
  }
  showPendingConfirm.value = false;
}

// 总监点评
const comments = ref<Record<number, string>>({});
const editingComment = ref<number | null>(null);
const commentDraft = ref('');

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  try {
    const res = await fetch('/api', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({action:'get', id:'director_comments'})
    });
    const data = await res.json();
    comments.value = data.comments || {};
  } catch {}
});

async function saveComment(projectId: number) {
  const text = commentDraft.value.trim();
  comments.value[projectId] = text;
  editingComment.value = null;
  await fetch('/api', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action:'set', id:'director_comments', data:{ comments: comments.value }})
  });
}

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <div class="print-hd">
    <h1>华力集团｜研策部周报</h1>
    <p>{{ wkLabel(appStore.yr, appStore.wk) }}（{{ wkRange(appStore.yr, appStore.wk) }}）</p>
  </div>

  <div class="io-bar no-print">
    <button class="io-btn" onclick="window.print()">📄 导出 PDF</button>
    <button class="io-btn" @click="exportBackup">📤 导出备份</button>
    <button class="io-btn imp" @click="importData">📥 导入数据</button>
  </div>

  <div class="wkbar">
    <div>
      <div class="wkbar-l">{{ wkLabel(appStore.yr, appStore.wk) }}</div>
      <div class="wkbar-sub">
        {{ wkRange(appStore.yr, appStore.wk) }}
        <span v-if="isNow" style="color:var(--gt);font-weight:700"> · 本周</span>
        <span v-else style="color:var(--t3)"> · 历史查阅</span>
      </div>
    </div>
    <button class="add-btn" @click="$router.push('/users')">＋ 新增项目</button>
  </div>

  <div class="metrics" style="grid-template-columns:repeat(5,1fr)">
    <div class="mc"><div class="lb">重点事项</div><div class="vl">{{ metrics.total }}</div></div>
    <div class="mc"><div class="lb">需决策/卡住</div><div class="vl r">{{ metrics.r }}</div></div>
    <div class="mc"><div class="lb">需关注</div><div class="vl y">{{ metrics.y }}</div></div>
    <div class="mc"><div class="lb">正常推进</div><div class="vl g">{{ metrics.g }}</div></div>
    <div class="mc" style="cursor:pointer" @click="$router.push('/meeting')">
      <div class="lb">本周会议</div>
      <div class="vl" style="color:var(--gold)">{{ meetingCount }}</div>
    </div>
  </div>

  <div class="sh">
    <div class="sh-t">重点事项（{{ metrics.total }}）</div>
    <div class="leg">
      <div class="li"><div class="ls" style="background:var(--rt)"></div>需决策</div>
      <div class="li"><div class="ls" style="background:var(--yt)"></div>需关注</div>
      <div class="li"><div class="ls" style="background:#1a6830"></div>正常</div>
    </div>
  </div>

  <draggable
    v-model="activeProjects"
    class="pgrid"
    item-key="id"
    :animation="200"
    handle=".drag-handle"
    :disabled="!authStore.isDirector"
  >
    <template #item="{ element: project }">
      <div
        class="pc"
        :class="[sc(getSnap(project).status)]"
        :data-id="project.id"
      >
        <!-- 卡片头部 -->
        <div class="pc-top">
          <div v-if="authStore.isDirector" class="drag-handle" title="拖动排序" style="cursor:grab;padding:0 6px 0 0;color:var(--t3);font-size:14px;flex-shrink:0;">⠿</div>
          <div class="pc-nm">
            {{ project.name }}
            <span v-if="authStore.isLoggedIn && project.designOwner === authStore.currentUser"
              style="font-size:10px;background:var(--gold);color:#fff;padding:1px 6px;border-radius:6px;font-weight:600;margin-left:6px;vertical-align:middle">我的</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="badge" :class="sc(getSnap(project).status)">
              <div class="dot" :class="sc(getSnap(project).status)"></div>
              {{ STATUS_LABELS[getSnap(project).status] || '' }}
            </div>
          </div>
        </div>

        <!-- 关键信息 -->
        <div class="pc-keys">
          <div class="pk"><div class="pk-lb">开业时间</div><div class="pk-vl">{{ project.openDate || '待定' }}</div></div>
          <div class="pk"><div class="pk-lb">筹备负责人</div><div class="pk-vl">{{ project.prepOwner || '—' }}</div></div>
          <div class="pk"><div class="pk-lb">研策负责人</div><div class="pk-vl">{{ project.designOwner || '—' }}</div></div>
        </div>

        <!-- 阶段进度 -->
        <div class="stages" style="margin-bottom:9px">
          <div
            v-for="(stage, idx) in STAGES"
            :key="idx"
            class="ss"
            :class="{ dn: idx < getSnap(project).stage, ac: idx === getSnap(project).stage }"
          ></div>
        </div>

        <!-- 决策/风险提示横幅（匹配旧系统 weekly.js 的 notice banners） -->
        <div v-if="fieldHasContent(getSnap(project).decision)" class="notice-banner notice-decision">
          ⚡ 需管理层决策：{{ renderBannerText(getSnap(project).decision) }}
        </div>
        <div v-if="fieldHasContent(getSnap(project).risk)" class="notice-banner notice-risk">
          ⚠ 风险/卡点：{{ renderBannerText(getSnap(project).risk) }}
        </div>

        <!-- 四维信息 -->
        <div class="dims">
          <div class="dim d1">
            <div class="dim-hd" style="color:#2563a8">上周工作完成情况</div>
            <div class="dim-body" style="white-space:pre-wrap">{{
              (() => {
                const snap = getSnap(project);
                const items = (snap as any).coreOutputItems;
                if (items && Array.isArray(items) && items.some((i: any) => i.text?.trim())) {
                  return items
                    .filter((i: any) => i.text?.trim())
                    .map((i: any, idx: number) => {
                      const due = i.dueDate ? formatDueDate(i.dueDate) : '';
                      return due ? `${idx + 1}. ${i.text}（${due}）` : `${idx + 1}. ${i.text}`;
                    })
                    .join('\n') || '无';
                }
                return snap.coreOutput || '无';
              })()
            }}</div>
          </div>
          <div class="dim d2">
            <div class="dim-hd">本周计划</div>
            <div class="dim-body" style="white-space:pre-wrap">{{ renderDimBody(getSnap(project).coreAction, '无') }}</div>
          </div>
          <div class="dim d3">
            <div class="dim-hd" style="color:#b00020">风险 / 卡点</div>
            <div class="dim-body" style="color:#b00020;white-space:pre-wrap">{{ renderDimBody(getSnap(project).risk, '无') }}</div>
          </div>
          <div class="dim d4">
            <div class="dim-hd" style="color:#2563a8">跨部门支援</div>
            <div class="dim-body" style="white-space:pre-wrap">{{ renderDimBody(getSnap(project).crossDept, '本周无需跨部门支援') }}</div>
          </div>
        </div>

        <!-- 操作栏 + 工作点评 -->
        <div class="ca" style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap">

          <!-- 工作点评 -->
          <div v-if="editingComment !== project.id"
            style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden">
            <span style="font-size:12px;color:#1a5c2a;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">
              {{ comments[project.id] || '' }}
            </span>
            <button
              v-if="authStore.isDirector"
              @click="editingComment = project.id; commentDraft = comments[project.id] || ''"
              style="font-size:11px;color:var(--gold);background:none;border:none;cursor:pointer;flex-shrink:0;white-space:nowrap"
            >✏ 工作点评</button>
          </div>
          <div v-else style="flex:1;display:flex;gap:4px;align-items:center;min-width:0">
            <input
              v-model="commentDraft"
              maxlength="100"
              placeholder="工作点评…"
              style="flex:1;font-size:12px;padding:3px 8px;border:0.5px solid var(--gold);border-radius:var(--rr);background:var(--bg);color:var(--tx);outline:none;font-family:inherit;min-width:0"
              @keydown.enter="saveComment(project.id)"
              @keydown.escape="editingComment = null"
            />
            <button @click="saveComment(project.id)"
              style="font-size:11px;background:var(--gold);color:#fff;border:none;border-radius:var(--rr);padding:3px 8px;cursor:pointer;flex-shrink:0">保存</button>
            <button @click="editingComment = null"
              style="font-size:11px;background:none;border:0.5px solid var(--bdr);border-radius:var(--rr);padding:3px 6px;cursor:pointer;color:var(--t3);flex-shrink:0">取消</button>
          </div>

          <!-- 💡未提交 -->
          <div v-if="pendingSubmits.has(project.id)"
            style="display:flex;align-items:center;gap:3px;font-size:11px;color:var(--rt);font-weight:600;flex-shrink:0;white-space:nowrap">
            🔴 未提交
          </div>

          <!-- 操作按钮组 -->
          <div style="display:flex;gap:5px;align-items:center;flex-shrink:0">
            <button class="bs" style="font-size:11px;padding:4px 9px" @click="editWeekly(project)">✏ 更新工作</button>
            <button class="bp" style="font-size:11px;padding:4px 12px;background:var(--gold)" @click="askSubmit(project)">📤 提交</button>
            <button v-if="authStore.isDirector" class="ba" @click="archiveProject(project)">归档</button>
            <button v-if="authStore.isDirector" class="bd" @click="deleteProject(project)">删除</button>
          </div>
        </div>
      </div>
    </template>
  </draggable>

  <div v-if="activeProjects.length === 0" class="empty">本周暂无重点事项</div>

  <!-- 周报编辑对话框 -->
  <WeeklyFormDialog
    :show="showWeeklyDialog"
    :project="editingProject"
    @close="showWeeklyDialog = false"
    @save="handleWeeklySaved"
  />

  <!-- 提交确认 Diff 对话框 -->
  <SubmitDiffDialog
    :show="showSubmitDialog"
    :project="submittingProject"
    @close="showSubmitDialog = false"
    @submitted="handleSubmitDone"
  />

  <!-- 导出备份模态框（匹配旧系统 app.js 的 export modal） -->
  <div v-if="showExportModal" class="modal-overlay" @click.self="showExportModal = false">
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <div class="modal-title">📤 导出备份</div>
        <button class="modal-close" @click="showExportModal = false">×</button>
      </div>
      <div class="modal-body">
        <textarea
          :value="exportJson"
          readonly
          style="width:100%;height:300px;font-size:11px;font-family:monospace;background:var(--bg);border:0.5px solid var(--bdr);border-radius:var(--rr);padding:10px;color:var(--tx);resize:none"
        ></textarea>
      </div>
      <div class="modal-footer">
        <button class="bs" @click="copyExportJson">📋 复制</button>
        <button class="bs" @click="downloadExportJson">💾 下载文件</button>
        <button class="bp" @click="showExportModal = false">关闭</button>
      </div>
    </div>
  </div>

  <!-- 导入数据模态框（匹配旧系统 app.js 的 import modal） -->
  <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
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
  <!-- 未提交数据确认弹窗 -->
  <div v-if="showPendingConfirm" class="modal-overlay">
    <div class="modal" style="max-width:420px;text-align:center">
      <div class="modal-header" style="justify-content:center;border-bottom:none;padding-bottom:0">
        <div style="font-size:36px;margin-bottom:4px">📋</div>
      </div>
      <div class="modal-body" style="padding-top:4px">
        <div style="font-size:16px;font-weight:700;margin-bottom:10px;color:var(--tx)">有数据尚未提交</div>
        <div style="font-size:13px;color:var(--t2);line-height:1.7">
          {{ pendingSubmits.size }} 个项目已更新但未提交到云端。<br>
          提交后团队成员才能看到最新内容。
        </div>
      </div>
      <div class="modal-footer" style="flex-direction:column;gap:8px">
        <button class="bp" style="width:100%;font-size:13px;padding:10px" @click="autoSubmitAll">
          📤 立即提交并继续
        </button>
        <button class="bs" style="width:100%;font-size:13px;padding:10px" @click="showPendingConfirm = false">
          稍后再提交
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 使用全局 main.css 类名 */
.drag-handle {
  user-select: none;
}

/* 决策/风险提示横幅（匹配旧系统样式） */
.notice-banner {
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: var(--rr);
  font-size: 11px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.notice-decision {
  background: var(--yb);
  color: var(--yt);
  border: 0.5px solid var(--ybd);
}

.notice-risk {
  background: var(--rb);
  color: var(--rt);
  border: 0.5px solid var(--rbd);
}
</style>
