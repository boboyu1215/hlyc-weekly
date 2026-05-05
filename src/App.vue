<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useSyncStore, pullAll } from '@/stores/sync';
import { getNextWeek } from '@/utils/date';
import { StorageService } from '@/services/storage';
import AppHeader from '@/components/layout/AppHeader.vue';
import LoginDialog from '@/components/LoginDialog.vue';
import SyncDialog from '@/components/SyncDialog.vue';

const appStore = useAppStore();
const authStore = useAuthStore();
const projectStore = useProjectStore();
const syncStore = useSyncStore();
const storage = StorageService.getInstance();

const showSyncDialog = ref(false);

// 全局刷新按钮（轮询检测到变化时显示，匹配旧系统 _showRefreshPrompt）
const showRefreshBanner = computed(() => {
  return syncStore.syncStatusType === 'pending';
});

function doRefresh() {
  // 匹配旧系统 doRefresh：重新加载项目列表
  projectStore.loadProjects();
  syncStore.consumeNewDataFlag();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    // pollOnce 会自动拉取最新数据
    projectStore.loadProjects();
    syncStore.startPolling();
  } else {
    syncStore.stopPolling();
  }
}

// beforeunload 未保存数据警告（匹配旧系统 app.js beforeunload）
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (syncStore.queueLength > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
}

// 页面是否已就绪（pullFromServer 完成后才渲染主内容）
const ready = ref(false);

onMounted(async () => {
  appStore.init();
  authStore.initAuth();
  syncStore.initSync();

  // 先从云端拉取全量数据
  try {
    await pullAll();
  } catch (e) {
    console.warn('[App] 初始化拉取失败，使用本地数据', e);
  }

  projectStore.loadProjects(); // 读已更新的hlzc_p渲染项目列表

  // 周五及之后自动跳转下周（init 之后执行，确保覆盖 init 设置的当前周）
  const day = new Date().getDay();
  const isWeekend = day === 0 || day >= 5; // 周五=5 周六=6 周日=0
  if (isWeekend) {
    const next = getNextWeek(appStore.yr, appStore.wk);
    appStore.gotoWeek(next);
  }

  ready.value = true;

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // beforeunload 警告
  window.addEventListener('beforeunload', handleBeforeUnload);

  // 启动智能轮询（延迟 2s 启动，等待初始化完成）
  setTimeout(() => {
    syncStore.startPolling();
  }, 2000);
});

onBeforeUnmount(() => {
  // 清理
  syncStore.stopPolling();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<template>
  <div id="app">
    <AppHeader @openSyncDialog="showSyncDialog = true" />

    <!-- 全局刷新按钮（轮询检测到变化时显示，匹配旧系统 _showRefreshPrompt） -->
    <div v-if="showRefreshBanner" class="refresh-banner">
      <span class="refresh-text">有同事更新了数据</span>
      <button class="refresh-btn" @click="doRefresh">刷新</button>
    </div>

    <div class="shell"><div class="content"><RouterView v-if="ready" /></div></div>

    <LoginDialog />
    <SyncDialog :show="showSyncDialog" @close="showSyncDialog = false" />
  </div>
</template>

<style>
/* 全局样式由 main.css 统一提供，此处仅保留 App 骨架 */
.app-main {
  flex: 1;
  overflow-y: auto;
}

/* 全局刷新按钮（匹配旧系统 _showRefreshPrompt 的 io-bar 样式） */
.refresh-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--yb);
  border-bottom: 0.5px solid var(--ybd);
  animation: fadeIn 0.3s;
}

.refresh-text {
  font-size: 12px;
  color: var(--yt);
  font-weight: 600;
}

.refresh-btn {
  padding: 4px 14px;
  background: var(--gold);
  color: #fff;
  border: none;
  border-radius: var(--rr);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: var(--fn);
  transition: all 0.15s;
}

.refresh-btn:hover {
  background: var(--gm);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
