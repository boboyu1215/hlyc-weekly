<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { wkLabel, getCurrentYearWeek } from '@/utils/date';
import { ROLE_LABELS } from '@/config/constants';
import UserManagementDialog from '@/components/UserManagementDialog.vue';

const route  = useRoute();
const router = useRouter();
const appStore  = useAppStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();

const showUserManagement = ref(false);
const showUserMenu = ref(false);   // 用户胶囊下拉菜单

getCurrentYearWeek(); // 初始化用

// ── 导航 Tab 定义（精简版：去掉设置和数据管理）──
const allTabs = [
  { path: '/weekly',   label: '项目周报' },
  { path: '/charts',   label: '可视化看板' },
  { path: '/overview', label: '项目总览' },
  { path: '/meeting',  label: '本周会议' },
  { path: '/users',    label: '录入数据', requireDirector: true },
  { path: '/board',    label: '黑板报' },
  { path: '/archive',  label: '归档项目' },
  { path: '/history',  label: '历史记录' },
];

const tabs = computed(() =>
  allTabs.filter(t => !t.requireDirector || authStore.isDirector)
);

// 是否显示周导航（仅周报/看板/会议页）
const showWeekNav = computed(() =>
  ['weekly', 'charts', 'meeting'].includes(route.name as string)
);

// ── Tab 指示器 ──
const tabsEl      = ref<HTMLElement | null>(null);
const indicatorBar = ref<HTMLElement | null>(null);

function updateIndicator() {
  const container = tabsEl.value;
  const bar = indicatorBar.value;
  if (!container || !bar) return;
  const activeBtn = container.querySelector('.tab.on') as HTMLElement;
  if (!activeBtn) { bar.style.opacity = '0'; return; }
  bar.style.left    = activeBtn.offsetLeft + 'px';
  bar.style.width   = activeBtn.offsetWidth + 'px';
  bar.style.opacity = '1';
}

// ── Tab 拖拽滚动 ──
let isDragging = false, startX = 0, scrollLeft = 0;
function onDragStart(e: MouseEvent) {
  isDragging = true;
  const el = tabsEl.value!;
  startX = e.pageX - el.offsetLeft;
  scrollLeft = el.scrollLeft;
  el.classList.add('is-dragging');
}
function onDragMove(e: MouseEvent) {
  if (!isDragging) return;
  e.preventDefault();
  const el = tabsEl.value!;
  el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX);
}
function onDragEnd() {
  isDragging = false;
  tabsEl.value?.classList.remove('is-dragging');
}

// ── 周切换 ──
function prevWk() { appStore.prevWeek(); }
function nextWk() { appStore.nextWeek(); }

// ── 主题 ──
function toggleTheme() { appStore.toggleTheme(); }

// ── 用户菜单 ──
function openUserManagement() {
  if (!authStore.isDirector) { alert('只有总监可以管理用户'); return; }
  showUserManagement.value = true;
  showUserMenu.value = false;
}
function goToSettings() {
  router.push('/settings');
  showUserMenu.value = false;
}
function goToImport() {
  router.push('/import');
  showUserMenu.value = false;
}
function handleLogout() {
  if (confirm('确认退出当前用户？')) {
    authStore.logout();
    showUserMenu.value = false;
  }
}
function handleLogin() {
  authStore.showLoginDialog = true;
}

// 点击外部关闭菜单
function onDocClick(e: MouseEvent) {
  const el = document.getElementById('user-menu-wrap');
  if (el && !el.contains(e.target as Node)) showUserMenu.value = false;
}

// ── 同步 ──
const emit = defineEmits<{ openSyncDialog: [] }>();
function openSyncPanel() { emit('openSyncDialog'); }

// ── 同步状态样式 ──
const syncLabelClass = computed(() => ({
  '_sync_label': true,
  ['sync-' + syncStore.syncStatusType]: true,
}));

function isTabActive(path: string) { return route.path === path; }

// ── @提醒 ──
const mentions = ref<Array<{id: string; noteId: string; text: string; from: string; createdAt: number}>>([]);
const showMentions = ref(false);
const mentionBadge = computed(() => mentions.value.length);

function getReadKey() {
  return `mentions_read_${authStore.currentUser || ''}`;
}
function getReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(getReadKey()) || '[]')); } catch { return new Set(); }
}
function markAllRead() {
  const readIds = getReadIds();
  mentions.value.forEach(m => readIds.add(m.id));
  localStorage.setItem(getReadKey(), JSON.stringify([...readIds]));
  mentions.value = [];
  showMentions.value = false;
}
function goToBoard() {
  markAllRead();
  router.push('/board');
}
function goToWeekly() {
  markAllRead();
  router.push('/weekly');
  showMentions.value = false;
}

async function fetchMentions() {
  if (!authStore.currentUser) return;
  try {
    const res = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_mentions', data: { user: authStore.currentUser } })
    });
    const data = await res.json();
    const readIds = getReadIds();
    mentions.value = (data.mentions || []).filter((m: any) =>
      !readIds.has(m.id)
    );
  } catch {}
}

// 登录后开始轮询
let mentionTimer: ReturnType<typeof setInterval> | null = null;
watch(() => authStore.currentUser, (u) => {
  if (mentionTimer) clearInterval(mentionTimer);
  if (u) {
    fetchMentions();
    mentionTimer = setInterval(fetchMentions, 30000);
  } else {
    mentions.value = [];
  }
}, { immediate: true });

onMounted(() => {
  nextTick(updateIndicator);
  document.addEventListener('click', onDocClick);
});

onUnmounted(() => {
  if (mentionTimer) clearInterval(mentionTimer);
});
</script>

<template>
  <header class="topbar">
    <div class="topinner">

      <!-- Logo -->
      <div class="logo">华力集团 · 研策部<em>周报系统</em></div>

      <!-- 同步状态 -->
      <span :class="syncLabelClass" class="sync-clickable" @click="openSyncPanel">
        {{ syncStore.syncStatusText }}
      </span>

      <!-- Tab 导航 -->
      <div class="tabs-wrap">
        <div
          class="tabs-scroll"
          ref="tabsEl"
          @mousedown="onDragStart"
          @mousemove="onDragMove"
          @mouseup="onDragEnd"
          @mouseleave="onDragEnd"
        >
          <a
            v-for="tab in tabs"
            :key="tab.path"
            :href="tab.path"
            class="tab"
            :class="{ on: isTabActive(tab.path) }"
            @click.prevent="router.push(tab.path)"
          >{{ tab.label }}</a>
        </div>
        <div class="tab-indicator">
          <div class="tab-indicator-bar" ref="indicatorBar"></div>
        </div>
      </div>

      <!-- 周切换器 -->
      <div v-if="showWeekNav" class="week-sw">
        <button class="wb" @click="prevWk">‹</button>
        <div class="wl" :class="{ 'wl-current': appStore.isCurrentWeek }">
          {{ wkLabel(appStore.yr, appStore.wk) }}
        </div>
        <button class="wb" @click="nextWk">›</button>
      </div>

      <!-- @提醒铃铛 -->
      <div v-if="authStore.isLoggedIn" style="position:relative;flex-shrink:0">
        <button
          class="icon-btn"
          @click="showMentions = !showMentions"
          title="@我的消息"
        >🔔</button>
        <span
          v-if="mentionBadge > 0"
          style="position:absolute;top:-4px;right:-4px;background:#e53935;color:#fff;
                 border-radius:10px;font-size:10px;padding:0 4px;min-width:16px;
                 text-align:center;line-height:16px;pointer-events:none"
        >{{ mentionBadge }}</span>

        <!-- 消息弹窗 -->
        <div
          v-if="showMentions"
          style="position:absolute;top:36px;right:0;width:280px;
                 background:var(--card);border:1px solid var(--bdr);
                 border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);
                 z-index:999;overflow:hidden"
          @click.stop
        >
          <div style="padding:10px 12px;border-bottom:1px solid var(--bdr);
                      display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;font-weight:600">@我的消息</span>
            <button
              v-if="mentions.length > 0"
              @click="markAllRead"
              style="font-size:11px;color:var(--gold);background:none;border:none;cursor:pointer"
            >全部已读</button>
          </div>
          <div v-if="mentions.length === 0"
               style="padding:20px;text-align:center;color:var(--t3);font-size:13px">
            暂无未读消息
          </div>
          <div v-else style="max-height:300px;overflow-y:auto">
            <div
              v-for="m in mentions"
              :key="m.id"
              @click="m.source === 'board' ? goToBoard() : goToWeekly()"
              style="padding:10px 12px;border-bottom:1px solid var(--bdr);
                     cursor:pointer;transition:background .1s"
              onmouseover="this.style.background='var(--bg)'"
              onmouseout="this.style.background=''"
            >
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                <span style="font-size:11px;padding:1px 6px;border-radius:4px;
                             background:var(--bg);color:var(--t2)">
                  {{ m.source === 'board' ? '📌 黑板报' : '📋 周报' }}
                </span>
                <span style="font-size:11px;color:var(--t3)">{{ m.from }} 提到了你</span>
              </div>
              <div style="font-size:13px;color:var(--t1);line-height:1.4;
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                {{ m.text }}
              </div>
              <div style="font-size:11px;color:var(--t3);margin-top:3px">
                {{ m.createdAt ? new Date(m.createdAt).toLocaleString('zh-CN') : '' }}
              </div>
            </div>
          </div>
          <div style="padding:8px 12px;text-align:center;border-top:1px solid var(--bdr);
                      display:flex;justify-content:center;gap:16px">
            <button @click="goToBoard"
                    style="font-size:12px;color:var(--gold);background:none;border:none;cursor:pointer">
              📌 黑板报 →
            </button>
            <button @click="goToWeekly"
                    style="font-size:12px;color:var(--gold);background:none;border:none;cursor:pointer">
              📋 周报 →
            </button>
          </div>
        </div>
      </div>

      <!-- 主题切换 -->
      <button
        class="icon-btn"
        @click="toggleTheme"
        :title="appStore.theme === 'dark' ? '切换到亮色' : '切换到暗色'"
      >{{ appStore.theme === 'dark' ? '🌙' : '☀️' }}</button>

      <!-- 用户胶囊 + 下拉菜单 -->
      <div id="user-menu-wrap" class="user-capsule-wrap" v-if="authStore.isLoggedIn">
        <button class="user-capsule" @click="showUserMenu = !showUserMenu">
          <span class="user-avatar">{{ authStore.currentUser?.slice(0,1) }}</span>
          <span class="user-name">{{ authStore.currentUser }}</span>
          <span v-if="authStore.isDirector" class="user-role-tag">总监</span>
          <span class="user-caret">▾</span>
        </button>

        <!-- 下拉菜单 -->
        <div class="user-dropdown" v-if="showUserMenu">
          <button
            v-if="authStore.isDirector"
            class="dropdown-item"
            @click="openUserManagement"
          >👥 用户管理</button>
          <button class="dropdown-item" @click="goToImport">📦 数据管理</button>
          <button class="dropdown-item" @click="goToSettings">⚙ 系统设置</button>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item danger" @click="handleLogout">退出登录</button>
        </div>
      </div>

      <!-- 未登录 -->
      <button v-else class="text-btn" @click="handleLogin">登录</button>

    </div>

    <!-- 用户管理对话框 -->
    <UserManagementDialog
      :show="showUserManagement"
      @close="showUserManagement = false"
    />
  </header>
</template>

<style scoped>
.tab { text-decoration: none; }

.sync-clickable { cursor: pointer; transition: filter .15s; }
.sync-clickable:hover { filter: brightness(.92); }

.wl-current { color: var(--rt) !important; font-weight: 700 !important; }

/* 主题切换小图标按钮 */
.icon-btn {
  width: 28px; height: 28px;
  border: 0.5px solid var(--bdr);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: border-color .15s;
}
.icon-btn:hover { border-color: var(--gold); }

/* 用户胶囊 */
.user-capsule-wrap { position: relative; flex-shrink: 0; }
.user-capsule {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 5px;
  border: 0.5px solid var(--bdr);
  border-radius: 20px;
  background: var(--card);
  cursor: pointer;
  font-family: var(--fn);
  transition: border-color .15s, box-shadow .15s;
}
.user-capsule:hover {
  border-color: var(--gold);
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}
.user-avatar {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gold), var(--gm));
  color: #fff;
  font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.user-name {
  font-size: 12px; font-weight: 600;
  color: var(--tx); white-space: nowrap;
}
.user-role-tag {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--gl);
  color: var(--gold);
  border: 0.5px solid var(--gold);
}
.user-caret {
  font-size: 10px; color: var(--t3);
  transition: transform .15s;
}

/* 下拉菜单 */
.user-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 148px;
  background: var(--card);
  border: 0.5px solid var(--bdr);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.10);
  overflow: hidden;
  z-index: 300;
  animation: dropIn .12s ease;
}
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.dropdown-item {
  width: 100%;
  padding: 9px 16px;
  background: none;
  border: none;
  text-align: left;
  font-size: 12px; font-weight: 600;
  color: var(--tx);
  cursor: pointer;
  font-family: var(--fn);
  transition: background .1s;
  display: block;
}
.dropdown-item:hover { background: var(--bg); }
.dropdown-item.danger { color: var(--rt); }
.dropdown-divider {
  height: 0.5px;
  background: var(--bdr);
  margin: 3px 0;
}

/* 未登录按钮 */
.text-btn {
  font-size: 11px; padding: 3px 10px;
  border: 0.5px solid var(--bdr);
  background: transparent; color: var(--t3);
  border-radius: 12px; cursor: pointer;
  font-family: var(--fn);
}

/* 同步状态 */
._sync_label {
  display: inline-block; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 10px;
  white-space: nowrap; flex-shrink: 0; transition: all .3s;
}
._sync_label.sync-local  { background:#f0ede4; color:#888;    border:.5px solid #88884444; }
._sync_label.sync-sync   { background:#e8f5ea; color:#1a6830; border:.5px solid #1a68304444; }
._sync_label.sync-saving { background:#e8f0fe; color:#1a56a8; border:.5px solid #1a56a84444; }
._sync_label.sync-saved  { background:#e8f5ea; color:#1a6830; border:.5px solid #1a68304444; }
._sync_label.sync-err    { background:#fff0f0; color:#b00020; border:.5px solid #b000204444; }
._sync_label.sync-pending{ background:#fffbe6; color:#7a5800; border:.5px solid #7a58004444; }
</style>
