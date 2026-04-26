<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSyncStore } from '@/stores/sync';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { StorageService } from '@/services/storage';
import { SNAP_CONTENT_FIELDS, FIELD_LABELS } from '@/config/constants';
import apiClient from '@/services/api';
import { useAppStore } from '@/stores/app';
import type { Project, WeeklySnapshot } from '@/core/types';

const props = defineProps<{
  show: boolean;
  project: Project | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submitted', success: boolean): void;
}>();

const syncStore = useSyncStore();
const authStore = useAuthStore();
const projectStore = useProjectStore();
const appStore = useAppStore();
const storage = StorageService.getInstance();

// Diff 结果
interface DiffRow {
  label: string;
  from: string;
  to: string;
}

interface WeekDiff {
  weekKey: string;
  diffs: DiffRow[];
}

const diffLoading = ref(false);
const diffResult = ref<WeekDiff[]>([]);
const hasChanges = ref(false);
const submitLoading = ref(false);
const submitResult = ref<{ success: boolean; queued?: boolean; conflict?: boolean } | null>(null);

// 标准化字段值为可比较的字符串
function fieldVal(field: string, value: any): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) {
    return value.map(i => i?.text || '').filter(Boolean).join('\n');
  }
  return String(value).trim();
}

// 短文本截断
function truncate(s: string, max: number = 28): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// HTML 转义
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 加载 Diff 数据
async function loadDiff() {
  if (!props.project) return;

  diffLoading.value = true;
  diffResult.value = [];
  hasChanges.value = false;
  submitResult.value = null;

  try {
    // 获取远程快照
    const remoteRec = await apiClient.getWeeklySnapshot(props.project.id);
    const remote = (remoteRec.success && remoteRec.data) ? remoteRec.data : {};

    // 获取本地快照
    const localSnap = storage.getProjectWeekSnapshots(props.project.id);

    // 按周对比
    const diffFields = ['status', 'stage', 'risk', 'coreOutput', 'coreAction', 'decision', 'crossDept'];
    // 只对比当前周，历史周已提交无需重复展示
    const currentKey = `${appStore.yr}-W${String(appStore.wk).padStart(2, '0')}`;
    const wkeys = Object.keys(localSnap)
      .filter(k => k === currentKey);

    const result: WeekDiff[] = [];
    let changed = false;

    for (const wk of wkeys) {
      const ls = localSnap[wk];
      const rs = (remote && remote[wk]) ? remote[wk] : {};
      const diffs: DiffRow[] = [];

      for (const k of diffFields) {
        const ov = fieldVal(k, (rs as any)[k]);
        const nv = fieldVal(k, (ls as any)[k]);
        if (ov !== nv) {
          diffs.push({
            label: FIELD_LABELS[k] || k,
            from: ov,
            to: nv,
          });
        }
      }

      if (diffs.length) {
        changed = true;
        result.push({ weekKey: wk, diffs });
      }
    }

    diffResult.value = result;
    hasChanges.value = changed;
  } catch (error) {
    console.error('加载 Diff 失败:', error);
  } finally {
    diffLoading.value = false;
  }
}

// 提交
async function handleSubmit() {
  if (!props.project) return;

  submitLoading.value = true;
  submitResult.value = null;

  try {
    const ok = await syncStore.submitProject(
      props.project.id,
      authStore.currentUser || undefined
    );

    if (ok === 'queued') {
      submitResult.value = { success: true, queued: true };
    } else if (ok === 'CONFLICT') {
      submitResult.value = { success: false, conflict: true };
    } else if (ok) {
      // 更新项目的 _updatedBy 和 _updatedAt
      projectStore.updateProject(props.project.id, {
        _updatedBy: authStore.currentUser || '',
        _updatedAt: new Date().toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      });
      submitResult.value = { success: true };
      emit('submitted', true);
    } else {
      submitResult.value = { success: false };
    }
  } catch (error) {
    submitResult.value = { success: false };
    console.error('提交失败:', error);
  } finally {
    submitLoading.value = false;
  }
}

// 冲突后自动拉取
async function handleConflict() {
  if (!props.project) return;
  try {
    await syncStore.pullFromServer();
    projectStore.loadProjects();
    emit('close');
  } catch (e) {
    console.error('拉取失败:', e);
  }
}

// 关闭
function handleClose() {
  emit('close');
}

// 打开时自动加载 Diff
watch(() => props.show, (val) => {
  if (val && props.project) {
    loadDiff();
  }
});
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal" style="max-width: 640px;">
      <!-- 头部 -->
      <div class="modal-header">
        <div class="modal-title">📤 提交「{{ project?.name || '' }}」</div>
        <button class="modal-close" @click="handleClose">×</button>
      </div>

      <!-- 主体 -->
      <div class="modal-body">
        <!-- 加载中 -->
        <div v-if="diffLoading" style="text-align:center;padding:20px 0;color:var(--t3);font-size:12px;">
          ⏳ 正在对比云端数据…
        </div>

        <!-- Diff 结果 -->
        <template v-else-if="!submitResult">
          <!-- 有变更 -->
          <template v-if="hasChanges">
            <div
              v-for="wd in diffResult"
              :key="wd.weekKey"
            >
              <div class="diff-section-title">📅 {{ wd.weekKey }}</div>
              <div class="diff-proj">
                <div v-for="(d, idx) in wd.diffs" :key="idx" class="diff-row">
                  <span class="diff-field">{{ d.label }}</span>
                  <span class="diff-from">{{ esc(truncate(d.from)) }}</span>
                  <span class="diff-arrow">→</span>
                  <span class="diff-to">{{ esc(truncate(d.to)) }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 无变更 -->
          <div v-else style="color:var(--gt);padding:14px 0;text-align:center;font-size:12px;">
            ✓ 与云端数据一致，无变更内容<br>
            <span style="color:var(--t3);font-size:11px;">仍可点击确认提交以刷新时间戳</span>
          </div>

          <!-- 提交元信息 -->
          <div class="diff-meta">
            提交人：{{ authStore.currentUser || '未登录' }} ·
            {{ new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
          </div>
        </template>

        <!-- 提交结果 -->
        <template v-else>
          <!-- 离线入队 -->
          <div v-if="submitResult.queued" style="text-align:center;padding:20px 0;">
            <div style="font-size:28px;margin-bottom:8px;">📥</div>
            <div style="color:var(--yt);">已存入本地队列</div>
            <div style="font-size:12px;color:var(--t3);margin-top:6px;">网络恢复后自动上传</div>
          </div>

          <!-- 冲突 -->
          <div v-else-if="submitResult.conflict" style="text-align:center;padding:20px 0;">
            <div style="font-size:28px;margin-bottom:8px;">❌</div>
            <div style="color:var(--rt);">提交被拦截：云端数据刚刚已被他人更新！</div>
            <div style="font-size:12px;color:var(--t3);margin:8px 0 16px;">系统将自动为您拉取最新数据，请重新核对后再提交。</div>
            <button class="bp" @click="handleConflict">🔄 拉取最新数据</button>
          </div>

          <!-- 成功 -->
          <div v-else-if="submitResult.success" style="text-align:center;padding:20px 0;">
            <div style="font-size:32px;margin-bottom:8px;">✅</div>
            <div style="color:var(--gt);">提交成功！</div>
            <div style="font-size:12px;color:var(--t3);margin-top:6px;">其他人刷新后即可看到最新数据</div>
          </div>

          <!-- 失败 -->
          <div v-else style="text-align:center;padding:20px 0;">
            <div style="font-size:32px;margin-bottom:8px;">❌</div>
            <div style="color:var(--rt);">提交失败，请检查网络后重试</div>
          </div>
        </template>
      </div>

      <!-- 底部 -->
      <div v-if="!submitResult" class="modal-footer">
        <button class="bs" @click="handleClose">取消</button>
        <button
          class="bp"
          :disabled="diffLoading || submitLoading"
          @click="handleSubmit"
        >
          {{ submitLoading ? '提交中…' : '确认提交' }}
        </button>
      </div>
      <div v-else class="modal-footer">
        <button class="bs" @click="handleClose">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--gold);
  margin: 12px 0 6px;
  padding-bottom: 4px;
  border-bottom: 0.5px solid var(--bdr);
}

.diff-section-title:first-child {
  margin-top: 0;
}

.diff-proj {
  padding: 0 0 4px;
}

.diff-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 0;
  font-size: 11px;
  border-bottom: 0.5px solid var(--bdr);
}

.diff-row:last-child {
  border-bottom: none;
}

.diff-field {
  flex-shrink: 0;
  width: 90px;
  color: var(--t3);
  font-weight: 600;
}

.diff-from {
  flex: 1;
  color: var(--t3);
  text-decoration: line-through;
  word-break: break-all;
}

.diff-arrow {
  flex-shrink: 0;
  color: var(--gold);
  font-weight: 700;
}

.diff-to {
  flex: 1;
  color: var(--tx);
  font-weight: 600;
  word-break: break-all;
}

.diff-meta {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 0.5px solid var(--bdr);
  font-size: 11px;
  color: var(--t3);
  text-align: right;
}
</style>
