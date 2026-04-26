<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { StorageService } from '@/services/storage';
import { STAGES, STATUS_LABELS } from '@/config/constants';
import { wkLabel, wkRange } from '@/utils/date';
import apiClient from '@/services/api';
import type { Project, WeeklySnapshot } from '@/core/types';

const router = useRouter();
const appStore = useAppStore();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();
const storage = StorageService.getInstance();

const showArchived = ref(false);

const isNow = computed(() => appStore.isCurrentWeek);

const activeProjects = computed(() =>
  projectStore.activeProjects.sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id))
);

const archivedProjects = computed(() =>
  projectStore.archivedProjects.sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id))
);

function getSnap(project: Project): WeeklySnapshot {
  return storage.getSnap(appStore.yr, appStore.wk, project.id, projectStore.projects);
}

function sc(status: string): string {
  return status === 'r' ? 'r' : status === 'y' ? 'y' : 'g';
}

// HTML 转义
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 项目信息网格
function getProjectFields(p: Project): Array<[string, string]> {
  return [
    ['面积', p.area],
    ['筹备负责人', p.prepOwner],
    ['研策负责人', p.designOwner],
    ['设计启动', p.startDate],
    ['方案完成', p.schemeDate],
    ['设计完成', p.designDate],
    ['进场时间', p.siteDate],
    ['竣工时间', p.completionDate],
    ['开业时间', p.openDate],
  ];
}

// 提交项目信息到云端（匹配旧系统 submitProjectInfo）
async function submitProjectInfo(projId: number) {
  if (!syncStore.syncStatus.online) {
    syncStore.addToQueue('updateProject', { id: projId });
    alert('网络不可用，已存入本地队列，恢复后自动同步');
    return;
  }

  syncStore.setSyncStatus('saving');
  try {
    const p = projectStore.getProject(projId);
    if (!p) { alert('项目不存在'); return; }

    // 使用 syncStore 提交
    await syncStore.syncNow();
    syncStore.setSyncStatus('saved');
    setTimeout(() => syncStore.setSyncStatus('sync'), 2000);
  } catch (e) {
    syncStore.setSyncStatus('err');
    alert('提交失败：' + (e instanceof Error ? e.message : '未知错误'));
  }
}

// 编辑项目
function editProject(project: Project) {
  router.push(`/users?id=${project.id}`);
}

// 删除项目
async function deleteProject(project: Project) {
  if (!authStore.isDirector) return;
  if (!confirm(`确定删除「${project.name}」？此操作不可恢复！`)) return;

  const pwd = prompt('请输入管理员密码：');
  if (pwd !== '1234') {
    alert('密码错误');
    return;
  }

  try {
    projectStore.deleteProject(project.id);
    const result = await apiClient.deleteProject(project.id);
    if (!result.success) throw new Error(result.error);
  } catch (e) {
    alert('删除失败：' + (e instanceof Error ? e.message : '网络错误'));
  }
}

// 恢复归档项目
function restoreProject(project: Project) {
  if (!confirm('将该项目从归档中释放，恢复到在建项目？')) return;
  projectStore.restoreProject(project.id);
}
</script>

<template>
  <div class="print-hd">
    <h1>华力集团 · 研策部项目总览</h1>
    <p>{{ wkLabel(appStore.yr, appStore.wk) }}（{{ wkRange(appStore.yr, appStore.wk) }}）</p>
  </div>

  <div class="io-bar no-print">
    <button v-if="isNow" class="io-btn" @click="$router.push('/users')">＋ 新增项目</button>
  </div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
    <div style="font-size:14px;font-weight:700;">项目总览</div>
    <div style="font-size:12px;color:var(--t3);">
      在建 {{ activeProjects.length }} · 归档 {{ archivedProjects.length }}
    </div>
  </div>

  <!-- 在建项目 -->
  <div class="sh">
    <div class="sh-t">在建项目（{{ activeProjects.length }}）</div>
  </div>

  <div v-if="activeProjects.length === 0" class="empty">暂无在建项目</div>

  <div v-for="p in activeProjects" :key="p.id" class="ov-card">
    <div class="ov-top">
      <div class="ov-nm">{{ esc(p.name) }}</div>
      <div class="badge" :class="sc(getSnap(p).status)">
        <div class="dot" :class="sc(getSnap(p).status)"></div>
        {{ STATUS_LABELS[getSnap(p).status] || '' }}
      </div>
    </div>
    <div class="ov-grid">
      <div v-for="[label, value] in getProjectFields(p)" :key="label" class="og">
        <div class="og-lb">{{ label }}</div>
        <div class="og-vl">{{ esc(value || '无') }}</div>
      </div>
    </div>
    <div class="ov-stages">
      <div
        v-for="(stage, idx) in STAGES"
        :key="idx"
        class="ss"
        :class="{ dn: idx < getSnap(p).stage, ac: idx === getSnap(p).stage }"
      ></div>
    </div>
    <div class="ov-stage-lbl">当前阶段：<span>{{ STAGES[getSnap(p).stage] || '无' }}</span></div>

    <!-- 操作按钮 -->
    <div class="io-bar no-print" style="justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr);">
      <button v-if="isNow" class="io-btn" @click="submitProjectInfo(p.id)">☁ 项目提交</button>
      <button class="bs" style="font-size:11px;padding:4px 9px;" @click="editProject(p)">编辑项目信息</button>
      <button v-if="authStore.isDirector" class="bd" style="font-size:11px;padding:4px 9px;" @click="deleteProject(p)">删除</button>
    </div>
  </div>

  <!-- 归档项目 -->
  <div v-if="archivedProjects.length" style="margin-top:16px;">
    <div class="arch-toggle" @click="showArchived = !showArchived">
      <span>{{ showArchived ? '▾' : '▸' }}</span>已归档项目（{{ archivedProjects.length }}）
    </div>
    <div v-if="showArchived">
      <div v-for="p in archivedProjects" :key="p.id" class="ov-card">
        <div class="ov-top">
          <div class="ov-nm">{{ esc(p.name) }}</div>
          <div class="badge arch">已归档</div>
        </div>
        <div class="ov-grid">
          <div v-for="[label, value] in getProjectFields(p)" :key="label" class="og">
            <div class="og-lb">{{ label }}</div>
            <div class="og-vl">{{ esc(value || '无') }}</div>
          </div>
        </div>
        <div class="ov-stages">
          <div
            v-for="(stage, idx) in STAGES"
            :key="idx"
            class="ss"
            :class="{ dn: idx < getSnap(p).stage, ac: idx === getSnap(p).stage }"
          ></div>
        </div>
        <div class="ov-stage-lbl">当前阶段：<span>{{ STAGES[getSnap(p).stage] || '无' }}</span></div>
        <div v-if="isNow" class="io-bar no-print" style="justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr);">
          <button class="bs" style="font-size:11px;padding:4px 9px;" @click="restoreProject(p)">释放归档</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov-card {
  background: var(--card);
  border: 0.5px solid var(--bdr);
  border-radius: var(--r);
  padding: 14px 18px;
  margin-bottom: 8px;
}

.ov-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ov-nm {
  font-size: 13px;
  font-weight: 700;
}

.ov-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}

.og {
  padding: 4px 0;
}

.og-lb {
  font-size: 10px;
  color: var(--t3);
}

.og-vl {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx);
}

.ov-stage-lbl {
  font-size: 11px;
  color: var(--t2);
  margin-top: 6px;
}

.arch-toggle {
  font-size: 12px;
  font-weight: 700;
  color: var(--t2);
  padding: 8px 0;
  cursor: pointer;
  user-select: none;
}

.badge.arch {
  background: var(--bg);
  color: var(--t3);
  border: 0.5px solid var(--bdr);
}

@media (max-width: 768px) {
  .ov-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
