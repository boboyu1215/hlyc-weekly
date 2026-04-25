<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useSyncStore } from '@/stores/sync';
import { isFriday, getNextWeek, shouldShowNextWeek } from '@/utils/date';
import { StorageService } from '@/services/storage';
import AppHeader from '@/components/layout/AppHeader.vue';
import LoginDialog from '@/components/LoginDialog.vue';
import SyncDialog from '@/components/SyncDialog.vue';

const appStore = useAppStore();
const authStore = useAuthStore();
const projectStore = useProjectStore();
const syncStore = useSyncStore();
const storage = StorageService.getInstance();

// 活动日志（底部活动流）
const activityLogs = ref<any[]>([]);
const showSyncDialog = ref(false);

function loadActivity() {
  activityLogs.value = storage.loadActivity().slice(0, 30);
}

// 全局刷新按钮（轮询检测到变化时显示，匹配旧系统 _showRefreshPrompt）
const showRefreshBanner = computed(() => {
  return syncStore.syncStatusType === 'pending';
});

function doRefresh() {
  // 匹配旧系统 doRefresh：重新加载项目列表 + 活动日志
  projectStore.loadProjects();
  loadActivity();
  syncStore.consumeNewDataFlag();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    // 页面重新可见 → 重置轮询间隔
    syncStore.resetPollInterval();
    // 重新加载项目列表（轮询可能已经更新了本地数据）
    projectStore.loadProjects();
    loadActivity();
  }
}

// beforeunload 未保存数据警告（匹配旧系统 app.js beforeunload）
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (syncStore.queueLength > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
}

// 格式化活动时间（相对时间）
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return diffMin + '分钟前';
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + '小时前';
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + '天前';
  return d.toLocaleDateString('zh-CN');
}

onMounted(() => {
  appStore.init();
  authStore.initAuth();
  projectStore.loadProjects();
  syncStore.initSync();
  loadActivity();

  // 周五及之后自动跳转下周（匹配旧系统 app.js L17-28）
  if (shouldShowNextWeek()) {
    const next = getNextWeek(appStore.yr, appStore.wk);
    appStore.yr = next.yr;
    appStore.wk = next.wk;
  }

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

    <div class="shell"><div class="content"><RouterView /></div></div>

    <!-- 底部活动流（匹配旧系统 app.js activity bar） -->
    <div v-if="activityLogs.length > 0" class="activity-bar">
      <div class="activity-scroll">
        <div v-for="log in activityLogs" :key="log.time" class="activity-item">
          <span class="activity-user">{{ log.user }}</span>
          <span class="activity-desc">{{ log.desc }}</span>
          <span class="activity-time">{{ formatTime(log.time) }}</span>
        </div>
      </div>
    </div>

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

/* 底部活动流（匹配旧系统 activity bar） */
.activity-bar {
  background: var(--card);
  border-top: 0.5px solid var(--bdr);
  padding: 6px 0;
  flex-shrink: 0;
}

.activity-scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 0 16px;
  scrollbar-width: thin;
}

.activity-scroll::-webkit-scrollbar {
  height: 3px;
}

.activity-scroll::-webkit-scrollbar-thumb {
  background: var(--bdr);
  border-radius: 2px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--t3);
}

.activity-user {
  color: var(--gold);
  font-weight: 700;
}

.activity-desc {
  color: var(--t2);
}

.activity-time {
  color: var(--t3);
  opacity: 0.7;
}
</style>
