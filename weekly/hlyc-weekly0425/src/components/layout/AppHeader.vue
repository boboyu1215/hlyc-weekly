<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { wkLabel, wkRange, getCurrentYearWeek } from '@/utils/date';
import { ROLE_LABELS } from '@/config/constants';
import UserManagementDialog from '@/components/UserManagementDialog.vue';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();

const showUserManagement = ref(false);
const showSyncDialog = ref(false);

// 当前年周（用于周切换器高亮）
const currentWeek = getCurrentYearWeek();

// 按权限过滤 tab（匹配旧系统：KPI 和录入数据 按角色隐藏）
const allTabs = [
  { path: '/weekly', label: '项目周报' },
  { path: '/overview', label: '项目总览' },
  { path: '/charts', label: '可视化看板' },
  { path: '/users', label: '录入数据', requireDirector: true },
  { path: '/meeting', label: '本周会议' },
  { path: '/archive', label: '归档项目' },
  { path: '/history', label: '历史记录' },
  { path: '/import', label: '数据管理' },
];

const tabs = computed(() => {
  return allTabs.filter(tab => {
    if (tab.requireDirector) return authStore.isDirector;
    return true;
  });
});

const settingsTabs = ['/settings'];

// 是否显示周导航
const showWeekNav = computed(() => {
  const name = route.name as string;
  return ['weekly', 'charts', 'meeting'].includes(name);
});

// tab 指示器
const tabsEl = ref<HTMLElement | null>(null);
const indicatorBar = ref<HTMLElement | null>(null);

function updateIndicator() {
  const container = tabsEl.value;
  const bar = indicatorBar.value;
  if (!container || !bar) return;
  const activeBtn = container.querySelector('.tab.on') as HTMLElement;
  if (!activeBtn) { bar.style.opacity = '0'; return; }
  bar.style.left = activeBtn.offsetLeft + 'px';
  bar.style.width = activeBtn.offsetWidth + 'px';
  bar.style.opacity = '1';
}

// tab 拖拽滚动
let isDragging = false;
let startX = 0;
let scrollLeft = 0;

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
  const x = e.pageX - el.offsetLeft;
  el.scrollLeft = scrollLeft - (x - startX);
}
function onDragEnd() {
  isDragging = false;
  tabsEl.value?.classList.remove('is-dragging');
}

// 周切换
function prevWk() { appStore.prevWeek(); }
function nextWk() { appStore.nextWeek(); }

// 主题
function toggleTheme() { appStore.toggleTheme(); }

// 登录
function handleLogin() { authStore.showLoginDialog = true; }

// 登出
function handleLogout() {
  if (authStore.isLoggedIn) {
    if (confirm('确认退出当前用户？')) authStore.logout();
  }
}

// 同步
function handleSync() { syncStore.syncNow(); }

// 同步状态样式（匹配旧系统 showSyncStatus 的 6 种状态）
const syncLabelClass = computed(() => ({
  '_sync_label': true,
  ['sync-' + syncStore.syncStatusType]: true
}));

// 打开用户管理
const emit = defineEmits<{
  openSyncDialog: [];
}>();

function openUserManagement() {
  if (!authStore.isDirector) {
    alert('只有总监可以管理用户');
    return;
  }
  showUserManagement.value = true;
}

function openSyncPanel() {
  emit('openSyncDialog');
}

function goToSettings() { router.push('/settings'); }

function isTabActive(path: string) {
  return route.path === path;
}

// 路由变化时更新指示器
onMounted(() => { nextTick(updateIndicator); });
</script>

<template>
  <header class="topbar">
    <div class="topinner">
      <!-- Logo -->
      <div class="logo">华力集团 · 研策部<em>周报系统</em></div>

      <!-- 同步状态指示器（点击弹出同步面板） -->
      <span :class="syncLabelClass" class="sync-clickable" @click="openSyncPanel">{{ syncStore.syncStatusText }}</span>

      <!-- 标签页导航（与旧版一致：tabs-wrap + tabs-scroll + tab-indicator） -->
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
          <router-link
            to="/settings"
            class="tab"
            :class="{ on: settingsTabs.includes(route.path) }"
          >⚙ 设置</router-link>
        </div>
        <div class="tab-indicator">
          <div class="tab-indicator-bar" ref="indicatorBar"></div>
        </div>
      </div>

      <!-- 周切换器（当前周红色高亮） -->
      <div v-if="showWeekNav" class="week-sw">
        <button class="wb" @click="prevWk">‹</button>
        <div class="wl" :class="{ 'wl-current': appStore.isCurrentWeek }">{{ wkLabel(appStore.yr, appStore.wk) }}</div>
        <button class="wb" @click="nextWk">›</button>
      </div>

      <!-- 用户 badge（含角色图标，匹配旧系统 updateUserBadge） -->
      <div
        v-if="authStore.isLoggedIn"
        id="user-badge"
        :title="ROLE_LABELS[authStore.userRole] || ''"
      >
        {{ authStore.isDirector ? '👑' : '' }} {{ authStore.currentUser }}
      </div>

      <!-- 用户管理按钮（仅总监可见） -->
      <button
        v-if="authStore.isDirector"
        @click="openUserManagement"
        style="font-size:11px;padding:3px 9px;border:0.5px solid var(--gold);background:var(--gl);color:var(--gold);border-radius:12px;cursor:pointer;font-family:var(--fn)"
        title="用户管理"
      >👥 管理</button>

      <!-- 主题切换 -->
      <button
        @click="toggleTheme"
        style="font-size:14px;padding:3px 7px;border:0.5px solid var(--bdr);background:transparent;border-radius:8px;cursor:pointer;line-height:1"
        :title="appStore.theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'"
      >{{ appStore.theme === 'light' ? '🌙' : '☀️' }}</button>

      <!-- 退出按钮 -->
      <button
        v-if="authStore.isLoggedIn"
        @click="handleLogout"
        style="font-size:11px;padding:3px 9px;border:0.5px solid var(--bdr);background:transparent;color:var(--t3);border-radius:12px;cursor:pointer;font-family:var(--fn)"
        title="退出当前用户"
      >退出</button>

      <!-- 未登录时显示登录 -->
      <button
        v-else
        @click="handleLogin"
        style="font-size:11px;padding:3px 9px;border:0.5px solid var(--bdr);background:transparent;color:var(--t3);border-radius:12px;cursor:pointer;font-family:var(--fn)"
        title="登录"
      >登录</button>
    </div>

    <!-- 用户管理对话框 -->
    <UserManagementDialog
      :show="showUserManagement"
      @close="showUserManagement = false"
    />
  </header>
</template>

<style scoped>
/* topbar 使用全局 main.css 中的 .topbar / .topinner / .tab / .wb / .wl 等类 */
/* router-link 需要去掉下划线和默认颜色 */
.tab {
  text-decoration: none;
}

/* 同步状态标签可点击 */
.sync-clickable {
  cursor: pointer;
  transition: filter 0.15s;
}
.sync-clickable:hover {
  filter: brightness(0.92);
}

/* 当前周红色高亮（匹配旧系统） */
.wl-current {
  color: var(--rt) !important;
  font-weight: 700 !important;
}

/* 同步状态指示器（匹配旧系统 showSyncStatus 的样式） */
._sync_label {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.3s;
}

._sync_label.sync-local {
  background: #f0ede4;
  color: #888;
  border: 0.5px solid #88844444;
}

._sync_label.sync-sync {
  background: #e8f5ea;
  color: #1a6830;
  border: 0.5px solid #1a68304444;
}

._sync_label.sync-saving {
  background: #e8f0fe;
  color: #1a56a8;
  border: 0.5px solid #1a56a84444;
}

._sync_label.sync-saved {
  background: #e8f5ea;
  color: #1a6830;
  border: 0.5px solid #1a68304444;
}

._sync_label.sync-err {
  background: #fff0f0;
  color: #b00020;
  border: 0.5px solid #b000204444;
}

._sync_label.sync-pending {
  background: #fffbe6;
  color: #7a5800;
  border: 0.5px solid #7a58004444;
}
</style>
