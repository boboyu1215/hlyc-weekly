<script setup lang="ts">
import { ref, computed } from 'vue';
import { useProjectStore } from '@/stores/project';
import type { Project } from '@/core/types';

const projectStore = useProjectStore();

const projectFileInput = ref<HTMLInputElement>();
const weekFileInput = ref<HTMLInputElement>();
const fullBackupInput = ref<HTMLInputElement>();

const projectFile = ref<File | null>(null);
const weekFile = ref<File | null>(null);
const fullBackupFile = ref<File | null>(null);

const projectResult = ref<{ success: boolean; message: string } | null>(null);
const weekResult = ref<{ success: boolean; message: string } | null>(null);
const fullBackupResult = ref<{ success: boolean; message: string } | null>(null);

const projectCount = computed(() => projectStore.projects.length);

function handleProjectFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  projectFile.value = target.files?.[0] || null;
  projectResult.value = null;
}
function handleWeekFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  weekFile.value = target.files?.[0] || null;
  weekResult.value = null;
}
function handleFullBackupSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  fullBackupFile.value = target.files?.[0] || null;
  fullBackupResult.value = null;
}

async function readJsonFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => { try { resolve(JSON.parse(e.target?.result as string)); } catch { reject(new Error('JSON解析失败')); } };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

async function importProjectData() {
  if (!projectFile.value) return;
  try {
    const data = await readJsonFile(projectFile.value);
    if (!Array.isArray(data)) throw new Error('数据格式错误');
    projectStore.importProjects(data as Project[]);
    projectResult.value = { success: true, message: `成功导入 ${data.length} 个项目` };
  } catch (e) { projectResult.value = { success: false, message: `导入失败：${(e as Error).message}` }; }
}

function clearAllData() {
  if (!confirm('确定要清空所有数据吗？')) return;
  projectStore.importProjects([]);
  alert('所有数据已清空');
}
</script>

<template>
  <div class="fc">
    <div class="fc-t">数据管理</div>

    <div class="fc-sub">导入项目数据</div>
    <p style="font-size:11px;color:var(--t3);margin-bottom:8px">选择包含项目列表的 JSON 文件</p>
    <input type="file" accept=".json" @change="handleProjectFileSelect" />
    <button class="bp btn-sm" @click="importProjectData" :disabled="!projectFile">导入项目</button>
    <div v-if="projectResult" :class="projectResult.success ? 'status-badge success' : 'notice'" style="margin-top:8px">
      {{ projectResult.message }}
    </div>

    <div class="fc-sub">当前数据状态</div>
    <div style="padding:10px;background:var(--bg);border-radius:var(--rr);font-size:12px;color:var(--t2)">
      项目数量：<strong style="color:var(--gold)">{{ projectCount }}</strong>
    </div>

    <div class="fc-sub" style="color:var(--rt)">危险操作</div>
    <button class="bd" @click="clearAllData">清空所有数据</button>
    <p style="font-size:11px;color:var(--rt);margin-top:6px">此操作将删除所有项目和周报数据，无法恢复！</p>
  </div>
</template>

<style scoped>
/* 使用全局 main.css 的 fc/fc-sub/bp/bd/notice/status-badge 类名 */
</style>
