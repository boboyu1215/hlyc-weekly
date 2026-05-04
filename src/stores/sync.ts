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
  // snap数据版本号（递增触发Vue重渲染）
  const snapVersion = ref(0);

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
  let _pollInterval = 15000;       // 当前轮询间隔（毫秒），默认 15s
  let _noChangeCount = 0;         // 连续无变化次数
  const POLL_MIN = 15000;         // 最小间隔 15s
  const POLL_MAX = 60000;         // 最大间隔 60s（退避上限）
  const POLL_STEP = 5000;         // 每次递增 5s
  const NO_CHANGE_THRESHOLD = 3;  // 连续 N 次无变化后开始退避
  let _hasNewData = false;        // 是否有新数据需要提示用户刷新
  let _pollEnabled = true;        // 是否启用轮询（SettingsView 控制）

  // 各项目云端 _v 版本号缓存，用于 pullSnapshots 节流
  const _remoteVersions: Record<number, number> = {};

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

      // 拉取所有项目snap数据，合并到本地hlzc_w（独立函数，轮询也可复用）
      await pullSnapshots();

      // 获取用户注册表 → 直接覆盖
      const usersResult = await apiClient.getUserRegistry();
      if (usersResult.success && usersResult.data) {
        storage.saveUserRegistry(usersResult.data);
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
      // 1. 拉项目列表并比较
      const projRes = await apiClient.getProjects();
      if (projRes.success && projRes.data) {
        const remoteStr = JSON.stringify(projRes.data);
        const localStr = JSON.stringify(storage.loadProjects());
        if (remoteStr !== localStr) {
          storage.saveProjects(projRes.data);
        }
      }

      // 2. 轻量轮询：只拉版本号
      const res = await fetch('/api/snap_versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json());

      if (!res?.success) return;

      const remoteVersions: Record<string, number> = res.versions;
      const local = storage.loadWeeks();
      const toFetch: Array<{ projId: number; weekKey: string; key: string }> = [];

      for (const [key, remoteTs] of Object.entries(remoteVersions)) {
        const m = key.match(/snap_(\d+)_(20\d\d-W\d+)/);
        if (!m) continue;
        const projId = Number(m[1]);
        const weekKey = m[2];
        const localTs = (local[weekKey]?.[projId] as any)?._ts ?? 0;
        if ((remoteTs ?? 0) > localTs) {
          toFetch.push({ projId, weekKey, key });
        }
      }

      if (toFetch.length === 0) {
        _noChangeCount++;
        if (_noChangeCount >= NO_CHANGE_THRESHOLD) {
          _pollInterval = Math.min(_pollInterval + POLL_STEP, POLL_MAX);
        }
        if (syncStatusType.value !== 'pending') {
          setSyncStatus('sync');
        }
        return;
      }

      console.log(`[Poll] 发现${toFetch.length}个更新，拉取中...`);
      for (const { projId, weekKey, key } of toFetch) {
        try {
          const snapRes = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get', id: key })
          }).then(r => r.json());

          if (!snapRes || Object.keys(snapRes).length === 0) continue;
          if (!local[weekKey]) local[weekKey] = {};
          local[weekKey][projId] = snapRes;
        } catch (e) {
          console.warn(`[Poll] 拉取${key}失败`, e);
        }
      }

      storage.saveWeeks(local);
      window.dispatchEvent(new CustomEvent('weeksDataUpdated'));
      console.log('[Poll] 同步完成，触发页面刷新');
      
      // 直接刷新页面以确保数据更新
      window.location.reload();

      _noChangeCount = 0;
      _pollInterval = POLL_MIN;
      _hasNewData = true;
      setSyncStatus('pending');
      console.log('[Poll] 检测到变化，已同步');
    } catch (error) {
      console.warn('[Poll] pollOnce error:', error);
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

  /**
   * 拉取所有项目snap数据并合并到本地hlzc_w
   * 独立函数，pullFromServer和轮询均可复用
   */
  async function pullSnapshots(): Promise<void> {
    try {
      const projectsRaw = localStorage.getItem('hlzc_p')
      const projects = projectsRaw ? JSON.parse(projectsRaw) : []
      const projectIds: number[] = projects.map((p: any) => p.id)
      if (projectIds.length === 0) return

      const localRaw = localStorage.getItem('hlzc_w')
      const local: Record<string, Record<string, any>> = localRaw
        ? JSON.parse(localRaw)
        : {}

      const pendingRaw = localStorage.getItem('hlzc_pending_submit')
      const pendingIds: number[] = pendingRaw ? JSON.parse(pendingRaw) : []

      for (const projId of projectIds) {
        try {
          // 第一步：读新格式 snap_{projId}_{weekKey}（按周拆分）
          // 拉当前周及前8周，共9周
          const now = new Date()
          const weekKeys: string[] = []
          for (let i = 0; i < 9; i++) {
            const d = new Date(now)
            d.setDate(d.getDate() - i * 7)
            const year = d.getFullYear()
            const week = getISOWeek(d)
            weekKeys.push(`${year}-W${String(week).padStart(2, '0')}`)
          }

          for (const wk of weekKeys) {
            const snapKey = `snap_${projId}_${wk}`
            const res = await apiClient.getWeeklySnapshot2(snapKey)
            if (!res?.success || !res?.data) continue

            const remoteSnap = res.data
            if (!local[wk]) local[wk] = {}

            const hasPending = pendingIds.includes(Number(projId))
            const localSnap = local[wk][projId]
            const remoteTs = remoteSnap?._ts ?? 0
            const localTs = localSnap?._ts ?? 0

            if (hasPending) {
              // 有未提交数据，无论_ts，一律保留本地不覆盖
              continue
            }
            if (remoteTs > localTs) {
              local[wk][projId] = remoteSnap
            }
          }

        } catch (e) {
          console.warn(`[Sync] 拉取proj ${projId} 失败`, e)
        }
      }

      localStorage.setItem('hlzc_w', JSON.stringify(local))
     // snapVersion通过事件通知，不直接引用store
window.dispatchEvent(new CustomEvent('weeksDataUpdated'))
      console.log('[Sync] snap数据拉取完成')
    } catch (e) {
      console.warn('[Sync] pullSnapshots失败', e)
    }
  }

  // ISO周数计算工具函数
  function getISOWeek(date: Date): number {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
    const week1 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
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
    snapVersion,
    offlineQueue,
    hasPendingChanges,
    queueLength,
    initSync,
    addToQueue,
    removeFromQueue,
    syncNow,
    pullFromServer,
    pushToServer,
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

// ============ 核心同步函数（取代 submitProject） ============

// 保存并立即上传云端
export async function saveAndSync(
  projId: number,
  weekKey: string,
  snapData: any,
  submitter: string
): Promise<boolean> {
  try {
    if (!snapData) {
      console.error('[Sync] saveAndSync失败: snapData为空');
      return false;
    }
    const key = `snap_${projId}_${weekKey}`;
    const VALID_FIELDS = new Set([
      'status','stage','coreOutput','coreOutputItems','coreAction',
      'risk','crossDept','decision','next','incident','knowledge',
      '_ts','_fieldTs','_savedWk','_updatedBy','_updatedAt'
    ]);
    const cleaned: Record<string,any> = {};
    for (const [k,v] of Object.entries(snapData)) {
      if (VALID_FIELDS.has(k)) cleaned[k] = v;
    }
    cleaned._updatedBy = submitter;
    cleaned._updatedAt = new Date().toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    cleaned._ts = Date.now();

    // 写入新格式
    await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', id: key, data: cleaned })
    }).then(r => r.json());

    // 同时更新旧格式snap_{projId}（兼容历史查阅）
    const oldRes = await apiClient.getWeeklySnapshot(projId);
    const oldData = (oldRes?.success && oldRes?.data) ? oldRes.data : {};
    oldData[weekKey] = cleaned;
    await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', id: `snap_${projId}`, data: oldData })
    }).then(r => r.json());

    // 写回本地
    const local = storage.loadWeeks();
    if (!local[weekKey]) local[weekKey] = {};
    local[weekKey][projId] = cleaned;
    storage.saveWeeks(local);

    // 通知页面更新
    window.dispatchEvent(new CustomEvent('weeksDataUpdated'));
    return true;
  } catch(e) {
    console.error('[Sync] saveAndSync失败', e);
    return false;
  }
}

// 登录时全量拉取（使用新格式 snap_{projId}_{weekKey}）
export async function pullAll(): Promise<void> {
  try {
    const projects = JSON.parse(localStorage.getItem('hlzc_p') || '[]');
    const projectIds: number[] = projects.map((p: any) => p.id);
    const local = storage.loadWeeks();

    // 一次拉取所有版本号
    const res = await fetch('/api/snap_versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());

    if (!res?.success) return;

    const remoteVersions: Record<string, number> = res.versions;

    for (const [key, remoteTs] of Object.entries(remoteVersions)) {
      const m = key.match(/snap_(\d+)_(20\d\d-W\d+)/);
      if (!m) continue;
      const projId = Number(m[1]);
      if (!projectIds.includes(projId)) continue;
      const weekKey = m[2];
      const localTs = (local[weekKey]?.[projId] as any)?._ts ?? 0;
      if ((remoteTs ?? 0) <= localTs) continue;

      try {
        const snapRes = await fetch('/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', id: key })
        }).then(r => r.json());

        if (!snapRes || Object.keys(snapRes).length === 0) continue;
        if (!local[weekKey]) local[weekKey] = {};
        local[weekKey][projId] = snapRes;
      } catch(e) {
        console.warn(`[Sync] pullAll 拉取${key}失败`, e);
      }
    }

    storage.saveWeeks(local);
    window.dispatchEvent(new CustomEvent('weeksDataUpdated'));
    console.log('[Sync] 全量拉取完成');
  } catch(e) {
    console.warn('[Sync] pullAll失败', e);
  }
}
