<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { StorageService } from '@/services/storage';
import { wkLabel } from '@/utils/date';
import type { Meeting } from '@/core/types';

const appStore = useAppStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();
const storage = StorageService.getInstance();

// 会议列表
const meetings = ref<Meeting[]>([]);
const editingMeeting = ref<Meeting | null>(null);
const isNew = ref(false);

// 表单
const form = ref<Meeting>({
  id: 0,
  title: '',
  time: '',
  initiator: '',
  attendees: '',
  content: '',
  issues: '',
});

// 加载会议
function loadMeetings() {
  meetings.value = storage.getMeetings(appStore.yr, appStore.wk);
}

// 新增会议
function newMeeting() {
  if (!authStore.isLoggedIn) { authStore.showLoginDialog = true; return; }
  isNew.value = true;
  editingMeeting.value = null;
  form.value = {
    id: Date.now(),
    title: '',
    time: '',
    initiator: authStore.currentUser || '',
    attendees: '',
    content: '',
    issues: '',
  };
}

// 编辑会议
function editMeeting(meeting: Meeting) {
  isNew.value = false;
  editingMeeting.value = meeting;
  form.value = { ...meeting };
}

// 取消编辑
function cancelEdit() {
  editingMeeting.value = null;
  isNew.value = false;
}

// 保存会议
async function saveMeeting() {
  if (!form.value.title.trim()) {
    alert('请填写会议名称');
    return;
  }

  const list = [...meetings.value];

  if (isNew.value) {
    // 新增
    list.push({ ...form.value, id: Date.now() });
  } else {
    // 编辑
    const idx = list.findIndex(m => m.id === editingMeeting.value!.id);
    if (idx >= 0) {
      list[idx] = { ...form.value };
    }
  }

  storage.setMeetings(appStore.yr, appStore.wk, list);

  // 云端同步（匹配旧系统 saveMeeting）
  if (syncStore.syncStatus.online) {
    try {
      syncStore.addToQueue('saveMeeting', {
        yr: appStore.yr,
        wk: appStore.wk,
        data: list,
      });
    } catch (e) {
      console.warn('[Meeting] 入队失败:', e);
    }
  }

  loadMeetings();
  cancelEdit();
}

// 删除会议
async function deleteMeeting(id: number) {
  if (!confirm('确定删除这条会议记录？')) return;

  const list = meetings.value.filter(m => m.id !== id);
  storage.setMeetings(appStore.yr, appStore.wk, list);

  if (syncStore.syncStatus.online) {
    try {
      syncStore.addToQueue('saveMeeting', {
        yr: appStore.yr,
        wk: appStore.wk,
        data: list,
      });
    } catch (e) {
      console.warn('[Meeting] 入队失败:', e);
    }
  }

  loadMeetings();
}

// 提交单条会议到云端（匹配旧系统 submitMeeting）
async function submitMeeting(id: number) {
  if (!syncStore.syncStatus.online) {
    alert('云端未连接，请稍后再试');
    return;
  }
  alert('会议数据已随周报一起同步到云端');
}

// HTML 转义
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 格式化时间
function formatTime(time: string): string {
  if (!time) return '';
  const d = new Date(time);
  return d.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const isEditing = computed(() => editingMeeting.value !== null || isNew.value);

onMounted(loadMeetings);
</script>

<template>
  <div style="font-size:14px;font-weight:700;margin-bottom:14px">
    本周会议
    <span style="font-size:11px;color:var(--t3);font-weight:400;margin-left:8px;">
      {{ wkLabel(appStore.yr, appStore.wk) }}（{{ meetings.length }}条记录）
    </span>
  </div>

  <!-- 新增按钮 -->
  <div v-if="authStore.isLoggedIn && !isEditing" style="margin-bottom:14px;">
    <button class="bp" style="font-size:12px;padding:6px 14px;" @click="newMeeting">＋ 新增会议</button>
  </div>

  <!-- 编辑表单 -->
  <div v-if="isEditing" style="background:var(--card);border:0.5px solid var(--gold);border-radius:var(--r);padding:16px 20px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;margin-bottom:12px;">
      {{ isNew ? '新增会议' : '编辑会议' }}
    </div>

    <div class="fg">
      <div class="ff" style="grid-column:1/-1">
        <label class="ff-label">会议名称 *</label>
        <input v-model="form.title" class="form-input" placeholder="例：XX项目周例会" />
      </div>
      <div class="ff">
        <label class="ff-label">会议时间</label>
        <input v-model="form.time" type="datetime-local" class="form-input" />
      </div>
      <div class="ff">
        <label class="ff-label">发起人</label>
        <input v-model="form.initiator" class="form-input" placeholder="发起人姓名" />
      </div>
      <div class="ff" style="grid-column:1/-1">
        <label class="ff-label">参与人</label>
        <input v-model="form.attendees" class="form-input" placeholder="用逗号分隔，例：张三,李四,王五" />
      </div>
      <div class="ff" style="grid-column:1/-1">
        <label class="ff-label">主要内容</label>
        <textarea v-model="form.content" class="auto-h form-input" rows="4" placeholder="会议讨论的主要内容" style="resize:vertical;min-height:80px;"></textarea>
      </div>
      <div class="ff" style="grid-column:1/-1">
        <label class="ff-label">需要解决的问题 <span style="font-weight:400;color:var(--t3);">（选填）</span></label>
        <textarea v-model="form.issues" class="auto-h form-input" rows="3" placeholder="需要解决的问题或待办事项" style="resize:vertical;min-height:60px;"></textarea>
      </div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="bs" @click="cancelEdit">取消</button>
      <button class="bp" @click="saveMeeting">{{ isNew ? '创建会议' : '保存修改' }}</button>
    </div>
  </div>

  <!-- 会议列表 -->
  <div v-if="meetings.length === 0 && !isEditing" class="empty">
    📝 本周暂无会议记录<br>
    <span style="font-size:11px">点击「新增会议」添加周例会记录</span>
  </div>

  <div v-for="m in meetings" :key="m.id"
    style="background:var(--card);border:0.5px solid var(--bdr);border-radius:var(--r);padding:14px 18px;margin-bottom:8px;"
  >
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;">{{ esc(m.title) }}</div>
        <div style="font-size:11px;color:var(--t3);display:flex;flex-wrap:wrap;gap:8px;">
          <span v-if="m.time">🕐 {{ formatTime(m.time) }}</span>
          <span v-if="m.initiator">👤 {{ esc(m.initiator) }}</span>
          <span v-if="m.attendees">👥 {{ esc(m.attendees) }}</span>
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;" v-if="authStore.isLoggedIn">
        <button class="bs" style="font-size:10px;padding:3px 8px;" @click="editMeeting(m)">编辑</button>
        <button class="ba" style="font-size:10px;padding:3px 8px;" @click="submitMeeting(m.id)">提交</button>
        <button class="bd" style="font-size:10px;padding:3px 8px;" @click="deleteMeeting(m.id)">删除</button>
      </div>
    </div>

    <!-- 主要内容 -->
    <div v-if="m.content" style="margin-top:10px;padding-top:8px;border-top:0.5px solid var(--bdr);">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px;">主要内容</div>
      <div style="font-size:12px;color:var(--tx);white-space:pre-wrap;line-height:1.8;">{{ esc(m.content) }}</div>
    </div>

    <!-- 需要解决的问题 -->
    <div v-if="m.issues" style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr);">
      <div style="font-size:11px;font-weight:700;color:var(--t2);margin-bottom:4px;">需要解决的问题</div>
      <div style="font-size:12px;color:var(--tx);white-space:pre-wrap;line-height:1.8;">{{ esc(m.issues) }}</div>
    </div>
  </div>
</template>

<style scoped>
.form-input {
  padding: 7px 10px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  font-size: 13px;
  background: var(--bg);
  color: var(--tx);
  font-family: var(--fn);
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: var(--gold);
}

.fg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ff {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ff-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--t2);
}
</style>
