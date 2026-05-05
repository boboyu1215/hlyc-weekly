<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSyncStore } from '@/stores/sync';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import apiClient from '@/services/api';

const syncStore = useSyncStore();
const authStore = useAuthStore();
const projectStore = useProjectStore();

// API配置
const apiConfig = ref({
  baseUrl: apiClient.getBaseUrl() || '',
  apiKey: apiClient.getApiKey() || ''
});

const apiConfigured = computed(() => apiClient.isConfigured());

// 同步设置（接入实际逻辑）
const autoSync = ref(true);
const syncInterval = ref(5); // 分钟（仅作 UI 显示，实际轮询间隔由 sync store 内部退避策略控制）

// 数据统计
const dataStats = computed(() => {
  const projects = projectStore.projects;
  const activeProjects = projects.filter(p => !p.archived);
  const archivedProjects = projects.filter(p => p.archived);

  return {
    totalProjects: projects.length,
    activeProjects: activeProjects.length,
    archivedProjects: archivedProjects.length,
    pendingSync: syncStore.queueLength
  };
});

// 保存API配置
function saveApiConfig() {
  apiClient.configure(apiConfig.value.baseUrl, apiConfig.value.apiKey);
  alert('API配置已保存');
}

// 测试连接
async function testConnection() {
  if (!apiConfigured.value) {
    alert('请先配置API');
    return;
  }

  try {
    const result = await apiClient.testConnection();
    if (result.success) {
      alert('连接成功！');
    } else {
      alert('连接失败: ' + result.error);
    }
  } catch (error) {
    alert('连接失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
}

// 立即同步
async function syncNow() {
  try {
    await syncStore.syncNow();
    alert('同步完成');
  } catch (error) {
    alert('同步失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
}

// 下载数据
async function pullData() {
  if (!confirm('这将用服务器数据覆盖本地数据，确定继续？')) {
    return;
  }

  try {
    await syncStore.pullFromServer();
    // 重新加载数据
    projectStore.loadProjects();
    alert('数据下载完成');
  } catch (error) {
    alert('下载失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
}

// 上传数据
async function pushData() {
  if (!confirm('这将用本地数据覆盖服务器数据，确定继续？')) {
    return;
  }

  try {
    await syncStore.pushToServer();
    alert('数据上传完成');
  } catch (error) {
    alert('上传失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
}

// 导出数据
function exportData() {
  const data = {
    projects: projectStore.projects,
    weeks: projectStore.weeks,
    userRegistry: authStore.userRegistry,
    exportTime: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导入数据
function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);

        if (!confirm(`确定导入数据吗？\n项目数: ${data.projects?.length || 0}\n导出时间: ${data.exportTime || '未知'}`)) {
          return;
        }

        // 导入数据
        if (data.projects) {
          projectStore.importProjects(data.projects);
        }
        if (data.weeks) {
          projectStore.importWeeks(data.weeks);
        }
        if (data.userRegistry) {
          authStore.importUserRegistry(data.userRegistry);
        }

        alert('数据导入成功');
        location.reload();
      } catch (error) {
        alert('导入失败: ' + (error instanceof Error ? error.message : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// 清空数据
function clearAllData() {
  if (!confirm('警告：这将清空所有本地数据，此操作不可恢复！\n\n确定继续？')) {
    return;
  }

  if (!confirm('最后确认：真的要清空所有数据吗？')) {
    return;
  }

  localStorage.clear();
  alert('数据已清空，页面即将刷新');
  location.reload();
}

// ── Google Drive 备份 ──
const gdrive = ref({
  loaded: false,
  authorized: false,
  folderId: '',
  lastSync: '',
  lastResult: null as any,
  syncing: false,
  enabled: true
});

async function loadGdriveStatus() {
  try {
    const res = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'backup_status' })
    });
    const data = await res.json();
    gdrive.value = { ...gdrive.value, loaded: true, ...data };
  } catch {}
}

async function backupNow() {
  gdrive.value.syncing = true;
  try {
    const res = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'backup_now' })
    });
    const data = await res.json();
    if (data.ok) {
      alert('备份成功');
      await loadGdriveStatus();
    } else {
      alert('备份失败: ' + (data.error || '未知错误'));
    }
  } catch {
    alert('备份失败');
  } finally {
    gdrive.value.syncing = false;
  }
}

onMounted(() => loadGdriveStatus());
</script>

<template>
  <div class="settings-view">
    <div class="view-header">
      <h2 class="view-title">系统设置</h2>
    </div>

    <div class="settings-container">
      <!-- API配置 -->
      <section class="settings-section">
        <h3 class="section-title">云端同步配置</h3>
        <div class="section-content">
          <div class="form-group">
            <label>API地址</label>
            <input
              v-model="apiConfig.baseUrl"
              type="text"
              placeholder="https://your-api.com"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>API密钥</label>
            <input
              v-model="apiConfig.apiKey"
              type="password"
              placeholder="输入API密钥"
              class="form-input"
            />
          </div>
          <div class="button-group">
            <button @click="saveApiConfig" class="bp btn-sm">保存配置</button>
            <button @click="testConnection" class="bs btn-sm" :disabled="!apiConfigured">
              测试连接
            </button>
          </div>
          <div v-if="apiConfigured" class="status-badge success">✓ 已配置</div>
          <div v-else class="status-badge warning">⚠ 未配置</div>
        </div>
      </section>

      <!-- 同步设置 -->
      <section class="settings-section">
        <h3 class="section-title">同步设置</h3>
        <div class="section-content">
          <div class="form-group">
            <label class="checkbox-label">
              <input
                :checked="autoSync"
                @change="syncStore.setPollingEnabled(($event.target as HTMLInputElement).checked); autoSync = ($event.target as HTMLInputElement).checked"
                type="checkbox"
              />
              <span>自动同步</span>
            </label>
            <span style="font-size:11px;color:var(--t3);margin-left:4px">
              {{ autoSync ? '已启用（智能退避 5s~30s）' : '已关闭' }}
            </span>
          </div>
          <div class="form-group">
            <label>轮询策略</label>
            <div style="font-size:12px;color:var(--t2);padding:6px 10px;background:var(--bg);border-radius:var(--rr)">
              初始 5 秒，连续 3 次无变化后递增至 30 秒上限。检测到数据变化自动重置为 5 秒。
            </div>
          </div>
          <div class="sync-status">
            <div class="status-item">
              <span class="label">同步状态:</span>
              <span class="value">{{ syncStore.syncStatusText }}</span>
            </div>
            <div class="status-item">
              <span class="label">在线状态:</span>
              <span :class="['value', syncStore.syncStatus.online ? 'online' : 'offline']">
                {{ syncStore.syncStatus.online ? '在线' : '离线' }}
              </span>
            </div>
            <div class="status-item">
              <span class="label">待同步:</span>
              <span class="value">{{ syncStore.queueLength }} 项</span>
            </div>
            <div class="status-item">
              <span class="label">上次同步:</span>
              <span class="value">
                {{ syncStore.syncStatus.lastSync
                  ? new Date(syncStore.syncStatus.lastSync).toLocaleString()
                  : '从未同步' }}
              </span>
            </div>
          </div>
          <div class="button-group">
            <button
              @click="syncNow"
              class="bp btn-sm"
              :disabled="!apiConfigured || syncStore.syncStatus.syncing"
            >
              {{ syncStore.syncStatus.syncing ? '同步中...' : '立即同步' }}
            </button>
            <button
              @click="pullData"
              class="bs btn-sm"
              :disabled="!apiConfigured"
            >
              下载数据
            </button>
            <button
              @click="pushData"
              class="bs btn-sm"
              :disabled="!apiConfigured"
            >
              上传数据
            </button>
          </div>
        </div>
      </section>

      <!-- 数据备份 -->
      <section class="settings-section">
        <h3 class="section-title">数据备份</h3>
        <div class="section-content">
          <div class="backup-desc">
            系统每周一凌晨 2:00 自动将全量周报和黑板报数据备份到 Google Drive 云端，防止数据丢失。
          </div>
          <div class="sync-status" v-if="gdrive.loaded">
            <div class="status-item">
              <span class="label">云端连接:</span>
              <span :class="['value', gdrive.authorized ? 'online' : 'offline']">
                {{ gdrive.authorized ? '已连接' : '未连接' }}
              </span>
            </div>
            <div class="status-item">
              <span class="label">上次备份:</span>
              <span class="value">
                {{ gdrive.lastSync ? new Date(gdrive.lastSync).toLocaleString('zh-CN') : '暂无' }}
              </span>
            </div>
            <div class="status-item" v-if="gdrive.lastResult">
              <span class="label">备份概况:</span>
              <span class="value">
                共 {{ gdrive.lastResult.count }} 条记录
              </span>
            </div>
          </div>
          <div class="button-group" style="margin-top:10px">
            <button
              @click="backupNow"
              class="bp btn-sm"
              :disabled="gdrive.syncing"
            >
              {{ gdrive.syncing ? '备份中…' : '手动备份' }}
            </button>
            <button
              @click="loadGdriveStatus"
              class="bs btn-sm"
            >
              刷新
            </button>
          </div>
        </div>
      </section>

      <!-- 数据管理 -->
      <section class="settings-section">
        <h3 class="section-title">数据管理</h3>
        <div class="section-content">
          <div class="data-stats">
            <div class="stat-item">
              <div class="stat-value">{{ dataStats.totalProjects }}</div>
              <div class="stat-label">总项目数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ dataStats.activeProjects }}</div>
              <div class="stat-label">活跃项目</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ dataStats.archivedProjects }}</div>
              <div class="stat-label">归档项目</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ dataStats.pendingSync }}</div>
              <div class="stat-label">待同步</div>
            </div>
          </div>
          <div class="button-group">
            <button @click="exportData" class="bp btn-sm">导出数据</button>
            <button @click="importData" class="bs btn-sm">导入数据</button>
            <button @click="clearAllData" class="btn-danger">清空数据</button>
          </div>
        </div>
      </section>

      <!-- 用户信息 -->
      <section class="settings-section">
        <h3 class="section-title">用户信息</h3>
        <div class="section-content">
          <div class="user-info">
            <div class="info-item">
              <span class="label">当前用户:</span>
              <span class="value">{{ authStore.currentUser || '未登录' }}</span>
            </div>
            <div class="info-item">
              <span class="label">用户角色:</span>
              <span class="value">{{ authStore.userRole || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">权限级别:</span>
              <span class="value">
                {{ authStore.isDirector ? '管理员' : authStore.isApproved ? '成员' : '访客' }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="settings-section">
        <h3 class="section-title">关于</h3>
        <div class="section-content">
          <div class="about-info">
            <p><strong>华力研策周报系统</strong></p>
            <p>版本: 3.0.0 (Vue 3 + TypeScript)</p>
            <p>构建时间: 2025-04-25</p>
            <p class="copyright">© 2025 华力研策. All rights reserved.</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 16px;
  max-width: 900px;
  margin: 0 auto;
}

.view-header {
  margin-bottom: 16px;
}

.view-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--gold);
}

.settings-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-section {
  background: var(--card);
  border: 0.5px solid var(--bdr);
  border-radius: var(--r);
  padding: 16px 20px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--tx);
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 0.5px solid var(--bdr);
}

.section-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-group label {
  font-size: 12px;
  font-weight: 700;
  color: var(--t2);
}

.form-input {
  padding: 7px 10px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  font-size: 13px;
  background: var(--bg);
  color: var(--tx);
  font-family: var(--fn);
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: var(--gold);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--t2);
}

.checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--gold);
}

.button-group {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.btn-danger {
  padding: 8px 13px;
  background: var(--rb);
  color: var(--rt);
  border: 0.5px solid var(--rbd);
  border-radius: var(--rr);
  font-size: 12px;
  font-family: var(--fn);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-danger:hover:not(:disabled) {
  background: var(--rt);
  color: white;
}

.btn-danger:disabled,
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}

.status-badge.success {
  background: var(--gb);
  color: var(--gt);
  border: 0.5px solid var(--gbd);
}

.status-badge.warning {
  background: var(--yb);
  color: var(--yt);
  border: 0.5px solid var(--ybd);
}

.backup-desc {
  font-size: 12px;
  color: var(--t2);
  line-height: 1.6;
}

.sync-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--rr);
}

.status-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.status-item .label {
  color: var(--t3);
}

.status-item .value {
  color: var(--tx);
  font-weight: 700;
}

.status-item .value.online {
  color: var(--gt);
}

.status-item .value.offline {
  color: var(--rt);
}

.data-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: var(--bg);
  border-radius: var(--rr);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--gold);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 11px;
  color: var(--t3);
}

.user-info,
.about-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 0.5px solid var(--bdr);
  font-size: 12px;
}

.info-item:last-child {
  border-bottom: none;
}

.info-item .label {
  color: var(--t3);
}

.info-item .value {
  color: var(--tx);
  font-weight: 700;
}

.about-info p {
  margin: 0;
  color: var(--t2);
  font-size: 12px;
  line-height: 1.8;
}

.about-info p strong {
  color: var(--tx);
  font-size: 13px;
  font-weight: 700;
}

.copyright {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 0.5px solid var(--bdr);
  font-size: 11px !important;
  color: var(--t3) !important;
}

@media (max-width: 768px) {
  .button-group {
    flex-direction: column;
  }

  .data-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
