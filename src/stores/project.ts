/**
 * 项目状态管理
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { StorageService } from '@/services/storage';
import type { Project } from '@/core/types';

const storage = StorageService.getInstance();

export const useProjectStore = defineStore('project', () => {
  // 项目列表
  const projects = ref<Project[]>([]);

  // 是否显示归档项目
  const showArchived = ref(false);

  // 加载项目
  function loadProjects() {
    projects.value = storage.loadProjects();
  }

  // 保存项目
  function saveProjects() {
    storage.saveProjects(projects.value);
  }

  // 计算属性：活跃项目
  const activeProjects = computed(() => {
    return projects.value.filter(p => !p.archived);
  });

  // 计算属性：归档项目
  const archivedProjects = computed(() => {
    return projects.value.filter(p => p.archived);
  });

  // 计算属性：显示的项目列表
  const displayProjects = computed(() => {
    return showArchived.value ? archivedProjects.value : activeProjects.value;
  });

  // 获取项目
  function getProject(id: number): Project | undefined {
    return projects.value.find(p => p.id === id);
  }

  // 添加项目
  function addProject(project: Project) {
    projects.value.push(project);
    saveProjects();
  }

  // 更新项目
  function updateProject(id: number, updates: Partial<Project>) {
    const index = projects.value.findIndex(p => p.id === id);
    if (index !== -1) {
      projects.value[index] = { ...projects.value[index], ...updates };
      saveProjects();
    }
  }

  // 删除项目
  function deleteProject(id: number) {
    projects.value = projects.value.filter(p => p.id !== id);
    saveProjects();
  }

  // 归档项目
  function archiveProject(id: number) {
    updateProject(id, { archived: true });
  }

  // 恢复项目
  function restoreProject(id: number) {
    updateProject(id, { archived: false });
  }

  // 更新项目排序
  function updateProjectOrder(orderedIds: number[]) {
    orderedIds.forEach((id, index) => {
      updateProject(id, { sortOrder: index });
    });
  }

  // 生成新项目ID
  function generateProjectId(): number {
    if (projects.value.length === 0) return 1;
    return Math.max(...projects.value.map(p => p.id)) + 1;
  }

  // 导入项目数据
  function importProjects(data: Project[]) {
    projects.value = data;
    saveProjects();
  }

  // 导入周报数据
  function importWeeks(data: any) {
    storage.saveWeeks(data);
  }

  // 获取周报数据
  const weeks = computed(() => storage.loadWeeks());

  return {
    projects,
    weeks,
    showArchived,
    activeProjects,
    archivedProjects,
    displayProjects,
    loadProjects,
    saveProjects,
    getProject,
    addProject,
    updateProject,
    deleteProject,
    archiveProject,
    restoreProject,
    updateProjectOrder,
    generateProjectId,
    importProjects,
    importWeeks
  };
});
