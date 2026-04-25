<script setup lang="ts">
import { useProjectStore } from '@/stores/project';
import { useAuthStore } from '@/stores/auth';
import { StorageService } from '@/services/storage';
import { useAppStore } from '@/stores/app';
import { STAGES } from '@/config/constants';
import type { Project } from '@/core/types';

const projectStore = useProjectStore();
const authStore = useAuthStore();
const appStore = useAppStore();
const storage = StorageService.getInstance();

function restoreProject(project: Project) {
  if (!authStore.isDirector) return;
  if (confirm(`将「${project.name}」从归档中释放，恢复到在建项目？`)) {
    projectStore.restoreProject(project.id);
  }
}

function deleteProject(project: Project) {
  if (!authStore.isDirector) return;
  if (confirm(`确定删除「${project.name}」？此操作不可恢复！`)) {
    projectStore.deleteProject(project.id);
  }
}

// 获取归档项目的最后快照阶段
function getArchiveStage(project: Project): number {
  // 查找该项目所有周快照中最后录入的阶段
  const weeks = storage.loadWeeks();
  let lastStage = project.defStage || 0;
  for (const [wk, wkData] of Object.entries(weeks).sort().reverse()) {
    const snap = wkData[project.id];
    if (snap && snap._savedWk && snap.stage !== undefined) {
      lastStage = snap.stage;
      break;
    }
  }
  return lastStage;
}
</script>

<template>
  <div class="io-bar no-print">
    <span class="io-btn" style="cursor:default">☁ 已同步</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">归档项目（{{ projectStore.archivedProjects.length }}）</div>
    <div style="font-size:11px;color:var(--t3)">归档项目可随时释放恢复</div>
  </div>

  <div v-if="projectStore.archivedProjects.length === 0" class="empty">暂无归档项目</div>

  <div
    v-for="project in projectStore.archivedProjects"
    :key="project.id"
    class="arch-card"
  >
    <div class="arch-card-top">
      <div class="arch-card-nm">{{ project.name }}</div>
      <div class="badge arch">已归档</div>
    </div>
    <div class="arch-card-meta">
      <span>开业：{{ project.openDate || '待定' }}</span>
      <span>筹备：{{ project.prepOwner || '—' }}</span>
      <span>研策：{{ project.designOwner || '—' }}</span>
    </div>
    <!-- 阶段进度条（匹配旧系统 archive.js 的阶段显示） -->
    <div class="stages" style="margin:8px 0">
      <div
        v-for="(stage, idx) in STAGES"
        :key="idx"
        class="ss"
        :class="{ dn: idx < getArchiveStage(project), ac: idx === getArchiveStage(project) }"
      ></div>
    </div>
    <div class="ca" style="padding-top:8px;border-top:0.5px solid var(--bdr)">
      <button
        v-if="authStore.isDirector"
        class="bp"
        style="font-size:11px;padding:5px 14px"
        @click="restoreProject(project)"
      >释放回在建</button>
      <button
        v-if="authStore.isDirector"
        class="bd"
        @click="deleteProject(project)"
      >删除</button>
    </div>
  </div>
</template>

<style scoped>
/* 使用全局 main.css 类名 */
</style>
