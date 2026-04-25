<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSyncStore } from '@/stores/sync';

const syncStore = useSyncStore();
const closing = ref(false);

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 待同步队列详情
const queueItems = computed(() => syncStore.offlineQueue);

// 快捷操作
async function handleSyncNow() {
  await syncStore.syncNow();
}

function handleClearQueue() {
  if (confirm('确定清空所有待同步项？未上传的操作将丢失。')) {
    syncStore.clearQueue();
  }
}

function handleClose() {
  closing.value = true;
  setTimeout(() => {
    closing.value = false;
    emit('close');
  }, 150);
}

// 操作描述映射
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'save-snapshot': '保存周报',
    'save-project': '更新项目',
    'delete-project': '删除项目',
    'save-meeting': '保存会议',
    'delete-meeting': '删除会议',
    'save-kpi': '更新KPI',
    'save-user': '更新用户',
  };
  return map[action] || action;
}

function formatQueueTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sync-fade">
      <div v-if="show" class="sync-overlay" @click.self="handleClose">
        <Transition name="sync-slide">
          <div v-if="show" class="sync-dialog" :class="{ closing }">
            <div class="sync-header">
              <span class="sync-title">同步状态</span>
              <button class="sync-close" @click="handleClose">✕</button>
            </div>

            <!-- 状态概览 -->
            <div class="sync-summary">
              <div class="summary-item">
                <span class="summary-dot" :class="syncStore.syncStatus.online ? 'dot-online' : 'dot-offline'"></span>
                <span class="summary-label">{{ syncStore.syncStatus.online ? '在线' : '离线' }}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">上次同步</span>
                <span class="summary-value">
                  {{ syncStore.syncStatus.lastSync
                    ? new Date(syncStore.syncStatus.lastSync).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '从未' }}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">待同步</span>
                <span class="summary-value" :class="{ 'has-pending': queueItems.length > 0 }">
                  {{ queueItems.length }} 项
                </span>
              </div>
            </div>

            <!-- 快捷操作 -->
            <div class="sync-actions">
              <button
                class="bp btn-sm"
                @click="handleSyncNow"
                :disabled="syncStore.syncStatus.syncing"
              >
                {{ syncStore.syncStatus.syncing ? '同步中...' : '立即同步' }}
              </button>
              <button
                class="bs btn-sm"
                @click="handleClearQueue"
                :disabled="queueItems.length === 0"
              >
                清空队列
              </button>
            </div>

            <!-- 待同步队列详情 -->
            <div v-if="queueItems.length > 0" class="sync-queue">
              <div class="queue-title">待同步队列</div>
              <div class="queue-list">
                <div v-for="item in queueItems.slice(0, 10)" :key="item.id" class="queue-item">
                  <span class="queue-action">{{ actionLabel(item.action) }}</span>
                  <span v-if="item.data?.weekKey" class="queue-detail">{{ item.data.weekKey }}</span>
                  <span class="queue-time">{{ formatQueueTime(item.timestamp) }}</span>
                  <span v-if="item.retries > 0" class="queue-retry" title="重试次数">×{{ item.retries }}</span>
                </div>
                <div v-if="queueItems.length > 10" class="queue-more">
                  还有 {{ queueItems.length - 10 }} 项...
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else class="sync-empty">
              <span>队列清空，本地数据已全部同步</span>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sync-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.2);
  z-index: 1000;
  display: flex;
  justify-content: center;
  padding-top: 50px;
}

.sync-dialog {
  width: 320px;
  max-height: 420px;
  background: var(--card);
  border: 0.5px solid var(--bdr);
  border-radius: var(--r);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sync-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--bdr);
}

.sync-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--tx);
}

.sync-close {
  width: 22px; height: 22px;
  border: none;
  background: var(--bg);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--t3);
  transition: all 0.15s;
}

.sync-close:hover {
  background: var(--bdr);
  color: var(--tx);
}

/* 状态概览 */
.sync-summary {
  display: flex;
  gap: 16px;
  padding: 10px 14px;
  background: var(--bg);
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}

.summary-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-online { background: var(--gt); }
.dot-offline { background: var(--rt); }

.summary-label {
  color: var(--t3);
}

.summary-value {
  color: var(--tx);
  font-weight: 600;
}

.summary-value.has-pending {
  color: var(--gold);
}

/* 快捷操作 */
.sync-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
}

/* 队列列表 */
.sync-queue {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px 10px;
}

.queue-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--t3);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--bg);
  border-radius: var(--rr);
  font-size: 11px;
}

.queue-action {
  color: var(--tx);
  font-weight: 600;
  flex-shrink: 0;
}

.queue-detail {
  color: var(--t3);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-time {
  color: var(--t3);
  opacity: 0.7;
  flex-shrink: 0;
}

.queue-retry {
  color: var(--rt);
  font-size: 10px;
  flex-shrink: 0;
}

.queue-more {
  text-align: center;
  font-size: 11px;
  color: var(--t3);
  padding: 4px;
}

/* 空状态 */
.sync-empty {
  padding: 16px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--t3);
}

/* 过渡动画 */
.sync-fade-enter-active,
.sync-fade-leave-active {
  transition: opacity 0.15s;
}
.sync-fade-enter-from,
.sync-fade-leave-to {
  opacity: 0;
}

.sync-slide-enter-active {
  transition: transform 0.2s ease-out, opacity 0.15s;
}
.sync-slide-leave-active {
  transition: transform 0.15s ease-in, opacity 0.1s;
}
.sync-slide-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.96);
}
.sync-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
</style>
