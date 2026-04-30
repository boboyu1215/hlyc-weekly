/**
 * 同步状态管理
 * 完全匹配旧系统 sync.js 的字段级合并、乐观锁、离线队列去重逻辑
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { StorageService } from '@/services/storage';
import apiClient from '@/services/api';
import { SNAP_CONTENT_FIELDS } from '@/config/constants';
import type { QueueItem, SyncStatus, WeeklySnapshot } from '@/core/types';

const storage = StorageService.getInstance();

// 队列去重 key 生成器（匹配旧系统 _queueAdd 的 id 去重逻辑）
function queueDedupeKey(action: string, data: any): string {
  // 对 snapshot 操作：action+weekKey+projectId 去重
  if (data?.weekKey && data?.projectId) {
    return `${action}:${data.weekKey}:${data.projectId}`;
  }
  // 对 project 操作：action+id 去重
  if (data?.id !== undefined) {
    return `${action}:project:${data.id}`;
  }
  // 其他：不精确去重
  return `${action}:${JSON.stringify(data)}`;
}

export const useSyncStore = defineStore('sync', () => {
  // 同步状态
  const syncStatus = ref<SyncStatus>({
    online: navigator.onLine,
    syncing: false,
    lastSync: null,
    pendingCount: 0,
    error: null
  });

  // 离线队列
  const offlineQueue = ref<QueueItem[]>([]);

  // 同步状态文本（供 UI 显示）
  const syncStatusText = ref('本地模式');
  const syncStatusType = ref<'local' | 'sync' | 'saving' | 'saved' | 'err' | 'pending'>('local');

  // ── 智能轮询状态 ──
  let _pollTimer: ReturnType<typeof setInterval> | null = null;
  let _pollInterval = 5000;       // 当前轮询间隔（毫秒），初始 5s
  let _noChangeCount = 0;         // 连续无变化次数
  const POLL_MIN = 5000;          // 最小间隔 5s
  const POLL_MAX = 30000;         // 最大间隔 30s
  const POLL_STEP = 5000;         // 每次递增 5s
  const NO_CHANGE_THRESHOLD = 3;  // 连续 N 次无变化后开始退避
  let _hasNewData = false;        // 是否有新数据需要提示用户刷新
  let _pollEnabled = true;        // 是否启用轮询（SettingsView 控制）

  // 初始化
  function initSync() {
    offlineQueue.value = storage.loadQueue();
    syncStatus.value.pendingCount = offlineQueue.value.length;

    // 监听在线状态
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // 计算属性
  const hasPendingChanges = computed(() => {
    return offlineQueue.value.length > 0;
  });

  const queueLength = computed(() => {
    return offlineQueue.value.length;
  });

  // 同步状态显示（匹配旧系统 showSyncStatus）
  function setSyncStatus(state: 'local' | 'sync' | 'saving' | 'saved' | 'err' | 'pending') {
    syncStatusType.value = state;
    const labels: Record<string, string> = {
      local: '本地模式', sync: '已同步', saving: '同步中…',
      saved: '已同步', err: '同步失败', pending: '有未提交'
    };
    syncStatusText.value = labels[state] || '本地模式';
  }

  // 在线状态变化
  function handleOnline() {
    syncStatus.value.online = true;
    setSyncStatus('saving');
    syncNow().then(() => {
      setSyncStatus('sync');
    }).catch(() => {
      setSyncStatus('err');
    });
  }

  function handleOffline() {
    syncStatus.value.online = false;
    setSyncStatus('pending');
  }

  // 添加到队列（带去重，匹配旧系统 _queueAdd）
  function addToQueue(action: string, data: any) {
    const dedupeKey = queueDedupeKey(action, data);

    // 去重：相同 key 覆盖旧条目
    const existingIdx = offlineQueue.value.findIndex(
      item => queueDedupeKey(item.action, item.data) === dedupeKey
    );

    const item: QueueItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      action,
      data,
      timestamp: Date.now(),
      retries: 0
    };

    if (existingIdx >= 0) {
      offlineQueue.value[existingIdx] = item;
    } else {
      offlineQueue.value.push(item);
    }

    storage.saveQueue(offlineQueue.value);
    syncStatus.value.pendingCount = offlineQueue.value.length;
    setSyncStatus('pending');
  }

  // 从队列移除
  function removeFromQueue(id: string) {
    offlineQueue.value = offlineQueue.value.filter(item => item.id !== id);
    storage.saveQueue(offlineQueue.value);
    syncStatus.value.pendingCount = offlineQueue.value.length;
  }

  // 立即同步（处理离线队列）
  async function syncNow() {
    if (!syncStatus.value.online || syncStatus.value.syncing) {
      return;
    }

    if (!apiClient.isConfigured()) {
      syncStatus.value.error = 'API未配置';
      return;
    }

    syncStatus.value.syncing = true;
    syncStatus.value.error = null;
    setSyncStatus('saving');

    try {
      const itemsToProcess = [...offlineQueue.value];

      for (const item of itemsToProcess) {
        try {
          let result;

          switch (item.action) {
            case 'saveSnapshot':
              result = await apiClient.saveWeeklySnapshot(
                item.data.weekKey,
                item.data.projectId,
                item.data.snapshot
              );
              break;

            case 'updateProject':
              result = await apiClient.updateProject(
                item.data.id,
                item.data.project
              );
              break;

            case 'createProject':
              result = await apiClient.createProject(item.data.project);
              break;

            case 'deleteProject':
              result = await apiClient.deleteProject(item.data.id);
              break;

            case 'addActivityLog':
              result = await apiClient.addActivityLog(item.data.log);
              break;

            default:
              console.warn('未知的同步操作:', item.action);
              continue;
          }

          if (result.success) {
            removeFromQueue(item.id);
          } else {
            throw new Error(result.error || '同步失败');
          }
        } catch (error) {
          console.error('同步项目失败:', item.action, error);
          // 不移除，保留在队列中等待下次重试（不设重试上限，匹配旧系统行为）
          // 更新重试计数
          item.retries++;
          storage.saveQueue(offlineQueue.value);
          // 遇到失败立即停止，不继续处理后续条目（匹配旧系统 _flushOfflineQueue 的 break）
          break;
        }
      }

      if (offlineQueue.value.length === 0) {
        syncStatus.value.lastSync = Date.now();
        setSyncStatus('saved');
      }
    } catch (error) {
      syncStatus.value.error = error instanceof Error ? error.message : '同步失败';
      setSyncStatus('err');
    } finally {
      syncStatus.value.syncing = false;
    }
  }

  // 下载远程数据（合并式，匹配旧系统 doRefresh）
  async function pullFromServer() {
    if (!apiClient.isConfigured()) {
      throw new Error('API未配置');
    }

    setSyncStatus('saving');

    try {
      // 获取项目列表 → 直接覆盖（旧系统行为）
      const projectsResult = await apiClient.getProjects();
      if (projectsResult.success && projectsResult.data) {
        storage.saveProjects(projectsResult.data);
      }

      // 拉取所有项目snap数据，合并到本地hlzc_w（必须在 projects 之后，依赖 projectIds）
      try {
        const projects = JSON.parse(localStorage.getItem('hlzc_p') || '[]')
        const projectIds: number[] = projects.map((p: any) => p.id)
        const localRaw = localStorage.getItem('hlzc_w')
        const local: Record<string, Record<string, any>> = localRaw
          ? JSON.parse(localRaw)
          : {}

        for (const projId of projectIds) {
          try {
            const res = await apiClient.post('/api', {
              action: 'query',
              query: { prefix: `snap_${projId}` }
            })
            const remoteData = res?.[0]?.data
            if (!remoteData || typeof remoteData !== 'object') continue

            for (const [weekKey, remoteSnap] of Object.entries(remoteData)) {
              if (!weekKey.match(/^20\d\d-W\d+$/)) continue
              if (!local[weekKey]) local[weekKey] = {}
              const localSnap = local[weekKey][projId]
              const remoteTs = (remoteSnap as any)?._ts ?? 0
              const localTs = localSnap?._ts ?? 0
              // 检查本地是否有未提交的更新
              const pendingKey = `hlzc_pending_submit`
              const pendingRaw = localStorage.getItem(pendingKey)
              const pendingIds: number[] = pendingRaw ? JSON.parse(pendingRaw) : []
              const hasPending = pendingIds.includes(Number(projId))

              if (hasPending && localTs > remoteTs) {
                // 本地有未提交且比远端新，保留本地
              } else if (remoteTs >= localTs) {
                // 远端较新或相等，用远端覆盖
                local[weekKey][projId] = remoteSnap
              }
            }
          } catch(e) {
            console.warn(`[Sync] 拉取proj ${projId} 失败`, e)
          }
        }

        localStorage.setItem('hlzc_w', JSON.stringify(local))
        console.log('[Sync] 全量数据拉取完成')
      } catch (e) {
        console.warn('[Sync] 拉取数据失败', e)
      }

      // 获取用户注册表 → 直接覆盖
      const usersResult = await apiClient.getUserRegistry();
      if (usersResult.success && usersResult.data) {
        storage.saveUserRegistry(usersResult.data);
      }

      // 获取活动日志 → 直接覆盖（旧系统行为）
      const logsResult = await apiClient.getActivityLog(100);
      if (logsResult.success && logsResult.data) {
        storage.saveActivityLog(logsResult.data);
      }

      setSyncStatus('sync');
      syncStatus.value.lastSync = Date.now();
      return true;
    } catch (error) {
      console.error('下载数据失败:', error);
      setSyncStatus('err');
      throw error;
    }
  }

  // 提交项目（带乐观锁，匹配旧系统 submitProject）
  async function submitProject(projId: number, submitter?: string): Promise<boolean | 'queued'> {
    if (!apiClient.isConfigured()) {
      throw new Error('云端未配置');
    }

    const t = new Date().toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const now = Date.now();

    // 收集该项目本周所有快照
    const weeks = storage.loadWeeks();
    const localSnap: Record<string, WeeklySnapshot> = {};
    for (const [wk, wkData] of Object.entries(weeks)) {
      if (wkData[projId] !== undefined) {
        localSnap[wk] = wkData[projId];
      }
    }

    if (!syncStatus.value.online) {
      // 离线：入队等待
      addToQueue('submitProject', {
        projectId: projId,
        snapshot: localSnap,
        _v: now,
        _updatedBy: submitter,
        _updatedAt: t
      });
      return 'queued';
    }

    setSyncStatus('saving');

    try {
      // 获取远程版本
      const remoteId = `snap_${projId}`;
      const remoteRec = await apiClient.getWeeklySnapshot(projId);
      const remoteData = (remoteRec.success && remoteRec.data) ? remoteRec.data : {};

      // 合并本地和远程快照
      const mergedSnap: Record<string, WeeklySnapshot> = {};
      const allWks = new Set([...Object.keys(localSnap), ...Object.keys(remoteData)]);

      for (const wk of allWks) {
        const local = localSnap[wk] || null;
        const remote = remoteData[wk] || null;

        if (local && remote) {
          mergedSnap[wk] = stampSnap(mergeSnapshot(local, remote), submitter, t);
        } else if (local) {
          mergedSnap[wk] = stampSnap(local, submitter, t);
        } else {
          mergedSnap[wk] = remote;
        }
      }

      // 写回本地
      const allWeeks = storage.loadWeeks();
      for (const [wk, snap] of Object.entries(mergedSnap)) {
        if (!allWeeks[wk]) allWeeks[wk] = {};
        allWeeks[wk][projId] = snap;
      }
      storage.saveWeeks(allWeeks);

      // 上传到云端
      const result = await apiClient.fullSync({
        weeks: mergedSnap,
        _projId: projId,
        _v: now,
        _updatedBy: submitter,
        _updatedAt: t
      });

      if (!result.success) {
        throw new Error(result.error || '提交失败');
      }

      // 清除待提交标记
      storage.removePendingSubmit(projId);
      setSyncStatus('saved');
      syncStatus.value.lastSync = Date.now();
      return true;
    } catch (error) {
      console.warn('submit error:', error);
      setSyncStatus('err');
      throw error;
    }
  }

  // 上传本地数据
  async function pushToServer() {
    if (!apiClient.isConfigured()) {
      throw new Error('API未配置');
    }

    setSyncStatus('saving');

    try {
      const localData = {
        projects: storage.loadProjects(),
        weeks: storage.loadWeeks(),
        userRegistry: storage.loadUserRegistry(),
        activityLog: storage.loadActivityLog()
      };

      const result = await apiClient.fullSync(localData);

      if (!result.success) {
        throw new Error(result.error || '上传失败');
      }

      setSyncStatus('saved');
      syncStatus.value.lastSync = Date.now();
      return true;
    } catch (error) {
      console.error('上传数据失败:', error);
      setSyncStatus('err');
      throw error;
    }
  }

  /**
   * 字段级合并快照（完全匹配旧系统 _mergeSnap）
   * 规则：
   *   - 本地空 + 远程非空：用远程（risk===''和decision==='无'特殊处理）
   *   - 本地非空 + 远程空：用本地
   *   - 双方非空：按 _fieldTs 时间戳取新值
   *   - status/stage 始终保留本地值
   */
  function mergeSnapshot(local: WeeklySnapshot, remote: WeeklySnapshot): WeeklySnapshot {
    if (!remote) return { ...local };

    const merged: WeeklySnapshot = { ...remote };

    for (const field of SNAP_CONTENT_FIELDS) {
      const lv = (local as any)[field];
      const rv = (remote as any)[field];
      const localEmpty = lv === undefined || lv === null || lv === '';
      const remoteEmpty = rv === undefined || rv === null || rv === '';

      if (localEmpty && !remoteEmpty) {
        // 本地空、远程非空 → 一般用远程
        // 特殊处理：risk==='' 或 decision==='无' 视为用户主动清空
        if ((field === 'risk' && lv === '') || (field === 'decision' && lv === '无')) {
          (merged as any)[field] = lv;
        } else {
          (merged as any)[field] = rv;
        }
      } else if (!localEmpty && remoteEmpty) {
        // 本地非空、远程空 → 保留本地
        (merged as any)[field] = lv;
      } else if (!localEmpty && !remoteEmpty) {
        // 双方非空 → 按 _fieldTs 时间戳比较
        const lts = (local._fieldTs && local._fieldTs[field]) || local._ts || 0;
        const rts = (remote._fieldTs && remote._fieldTs[field]) || remote._ts || 0;
        (merged as any)[field] = lts >= rts ? lv : rv;
      } else {
        (merged as any)[field] = '';
      }
    }

    // status 和 stage 始终保留本地值（匹配旧系统）
    if (local.status) (merged as any).status = local.status;
    if (local.stage !== undefined && local.stage !== null) (merged as any).stage = local.stage;

    return merged;
  }

  // 清空队列
  function clearQueue() {
    offlineQueue.value = [];
    storage.saveQueue([]);
    syncStatus.value.pendingCount = 0;
  }

  // ==================== 智能轮询 ====================

  /**
   * 单次轮询（匹配旧系统 _startPollOnly 的 setInterval 回调）
   * 轻量检测：只拉项目和活动日志，发现变化则提示用户刷新
   */
  async function pollOnce(): Promise<void> {
    if (!apiClient.isConfigured() || !syncStatus.value.online) return;

    try {
      const [projRes, actRes] = await Promise.all([
        apiClient.getProjects(),
        apiClient.getActivityLog(100)
      ]);

      let changed = false;

      // 比较项目列表
      if (projRes.success && projRes.data) {
        const remoteStr = JSON.stringify(projRes.data);
        const localStr = JSON.stringify(storage.loadProjects());
        if (remoteStr !== localStr) {
          changed = true;
          // 直接更新本地项目列表（旧系统行为）
          storage.saveProjects(projRes.data);
        }
      }

      // 比较活动日志
      if (actRes.success && actRes.data) {
        const remoteStr = JSON.stringify(actRes.data);
        const localStr = JSON.stringify(storage.loadActivity());
        if (remoteStr !== localStr) {
          changed = true;
          storage.saveActivityLog(actRes.data);
        }
      }

      if (changed) {
        _noChangeCount = 0;
        _pollInterval = POLL_MIN; // 有变化重置间隔
        _hasNewData = true;
        setSyncStatus('pending');
      } else {
        _noChangeCount++;
        if (_noChangeCount >= NO_CHANGE_THRESHOLD) {
          // 连续无变化 → 退避
          _pollInterval = Math.min(_pollInterval + POLL_STEP, POLL_MAX);
        }
        if (syncStatusType.value !== 'pending') {
          setSyncStatus('sync');
        }
      }
    } catch (error) {
      // 轮询失败不改变状态，静默重试
      console.warn('[Poll] 轮询失败:', error);
    }
  }

  /**
   * 启动智能轮询（匹配旧系统 _startPollOnly）
   */
  function startPolling(): void {
    if (_pollTimer) return;
    if (!_pollEnabled) return;
    console.log('[Poll] 启动轮询，间隔:', _pollInterval);
    _pollTimer = setInterval(pollOnce, _pollInterval);
  }

  /**
   * 停止轮询
   */
  function stopPolling(): void {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
      console.log('[Poll] 停止轮询');
    }
  }

  /**
   * 重置轮询间隔（页面可见性变化时调用）
   */
  function resetPollInterval(): void {
    _pollInterval = POLL_MIN;
    _noChangeCount = 0;
    if (_pollTimer) {
      stopPolling();
      startPolling();
    }
  }

  /**
   * 设置轮询开关（SettingsView autoSync 控制此值）
   */
  function setPollingEnabled(enabled: boolean): void {
    _pollEnabled = enabled;
    if (enabled) {
      resetPollInterval();
    } else {
      stopPolling();
    }
  }

  /**
   * 是否有新数据待刷新
   */
  function consumeNewDataFlag(): boolean {
    if (_hasNewData) {
      _hasNewData = false;
      setSyncStatus('sync');
      return true;
    }
    return false;
  }

  // 同步对话框由 App.vue + SyncDialog.vue 组件层管理
  // 此方法已废弃，保留为空以兼容旧引用
  function openSyncDialog() {
    // sync dialog is now handled by App.vue + SyncDialog.vue
  }

  return {
    syncStatus,
    syncStatusText,
    syncStatusType,
    offlineQueue,
    hasPendingChanges,
    queueLength,
    initSync,
    addToQueue,
    removeFromQueue,
    syncNow,
    pullFromServer,
    pushToServer,
    submitProject,
    mergeSnapshot,
    clearQueue,
    openSyncDialog,
    setSyncStatus,
    startPolling,
    stopPolling,
    resetPollInterval,
    setPollingEnabled,
    consumeNewDataFlag
  };
});

/**
 * 为快照打时间戳（匹配旧系统 _stampSnap）
 */
function stampSnap(snap: WeeklySnapshot, submitter?: string, submitTime?: string): WeeklySnapshot {
  const now = Date.now();
  const fieldTs = snap._fieldTs ? { ...snap._fieldTs } : {};

  for (const field of SNAP_CONTENT_FIELDS) {
    const v = (snap as any)[field];
    const hasValue = v !== undefined && v !== null && v !== '' &&
      !(Array.isArray(v) && v.length === 0);
    if (hasValue) {
      fieldTs[field] = now;
    }
  }

  const stamped: WeeklySnapshot = { ...snap, _ts: now, _fieldTs: fieldTs };

  // 将提交人写入快照本身，供卡片右上角显示
  if (submitter) {
    stamped._updatedBy = submitter;
    stamped._updatedAt = submitTime || '';
  }

  return stamped;
}
