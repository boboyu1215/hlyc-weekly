<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import type { UserRole } from '@/core/types';
import { ROLE_LABELS } from '@/config/constants';

const authStore = useAuthStore();

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 添加成员
const showAddForm = ref(false);
const newMemberName = ref('');

// 用户列表
const users = computed(() => {
  return Object.entries(authStore.userRegistry).map(([name, user]) => {
    const { name: _n, ...rest } = user;
    return { name, ...rest };
  });
});

// 角色选项（三级权限体系）
const roleOptions: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: '管理员', color: '#8b5cf6' },
  { value: 'member', label: '成员', color: '#3b82f6' },
  { value: 'guest', label: '访客', color: '#6b7280' }
];

// 职务选项
const titleOptions = ['总监', '研策负责人', '筹备负责人', '普通成员'];

// 获取角色标签（支持新旧值）
function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] || role;
}

// 获取角色颜色
function getRoleColor(role: UserRole): string {
  return roleOptions.find(r => r.value === role)?.color || '#6b7280';
}

// 添加成员（匹配旧系统 auth.js addMember）
function addMember() {
  if (!authStore.isDirector) {
    alert('只有管理员可以添加成员');
    return;
  }
  const name = newMemberName.value.trim();
  if (!name) {
    alert('请输入成员姓名');
    return;
  }
  if (authStore.userRegistry[name]) {
    alert(`「${name}」已在系统中`);
    return;
  }
  authStore.addUser(name);
  newMemberName.value = '';
  showAddForm.value = false;
}

// 删除成员（匹配旧系统 auth.js deleteUser，需密码确认）
function deleteUser(name: string) {
  if (!authStore.isDirector) {
    alert('只有管理员可以删除成员');
    return;
  }
  const pwd = prompt(`删除用户「${name}」需要输入管理密码：`);
  if (pwd !== '1234') {
    if (pwd !== null) alert('密码错误');
    return;
  }
  if (confirm(`确定删除用户「${name}」？此操作不可恢复！`)) {
    authStore.deleteUser(name);
  }
}

// 更新用户角色
function updateRole(name: string, newRole: UserRole) {
  if (!authStore.isDirector) {
    alert('只有管理员可以修改用户角色');
    return;
  }

  if (confirm(`确定将 ${name} 的角色修改为 ${getRoleLabel(newRole)} 吗？`)) {
    authStore.updateUserRole(name, newRole);
  }
}

// 更新用户单个字段（工号、职务等）
function updateUserField(name: string, field: string, value: string) {
  if (!authStore.isDirector) return;

  const user = authStore.userRegistry[name];
  if (!user) return;

  (user as any)[field] = value;
  authStore.importUserRegistry({ ...authStore.userRegistry });
}

// 关闭对话框
function close() {
  emit('close');
  showAddForm.value = false;
  newMemberName.value = '';
}
</script>

<template>
  <div v-if="show" class="dialog-overlay" @click="close">
    <div class="dialog-content" @click.stop>
      <div class="dialog-header">
        <h2>用户管理</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="dialog-body">
        <div v-if="!authStore.isDirector" class="permission-warning">
          您没有权限管理用户
        </div>

        <!-- 添加成员按钮 -->
        <div v-if="authStore.isDirector" style="margin-bottom:12px;display:flex;gap:8px">
          <button v-if="!showAddForm" class="bp btn-sm" @click="showAddForm = true" style="font-size:12px">＋ 添加成员</button>
          <div v-else style="display:flex;gap:6px;flex:1;align-items:center">
            <input
              v-model="newMemberName"
              type="text"
              placeholder="输入成员姓名"
              class="add-input"
              @keydown.enter="addMember"
              autofocus
            />
            <button class="bp btn-sm" @click="addMember" style="font-size:12px">确认</button>
            <button class="bs btn-sm" @click="showAddForm = false" style="font-size:12px">取消</button>
          </div>
        </div>

        <div class="user-list">
          <div v-if="users.length === 0" class="empty-state">
            暂无用户数据
          </div>

          <div
            v-for="user in users"
            :key="user.name"
            class="user-item"
          >
            <div class="user-info">
              <div class="user-name">
                {{ user.name }}
                <span v-if="user.employeeId" class="emp-id">#{{ user.employeeId }}</span>
              </div>
              <div class="user-meta">
                <span v-if="user.title" class="meta-item meta-title">{{ user.title }}</span>
                <span class="meta-item">
                  注册: {{ new Date(user.joinedAt || Date.now()).toLocaleDateString() }}
                </span>
                <span v-if="user.lastSeen" class="meta-item">
                  登录: {{ new Date(user.lastSeen).toLocaleDateString() }}
                </span>
              </div>
            </div>

            <div class="user-controls">
              <!-- 工号（仅管理员可编辑） -->
              <input
                class="ctrl-input emp-input"
                :value="user.employeeId || ''"
                placeholder="工号"
                :disabled="!authStore.isDirector"
                @change="updateUserField(user.name, 'employeeId', ($event.target as HTMLInputElement).value)"
              />

              <!-- 职务下拉（仅管理员可编辑） -->
              <select
                class="ctrl-select title-select"
                :value="user.title || '普通成员'"
                :disabled="!authStore.isDirector"
                @change="updateUserField(user.name, 'title', ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="t in titleOptions" :key="t" :value="t">{{ t }}</option>
              </select>

              <!-- 权限角色下拉（仅管理员可编辑） -->
              <select
                class="ctrl-select role-select"
                :value="user.role"
                :disabled="!authStore.isDirector"
                :style="{ borderColor: getRoleColor(user.role as UserRole) }"
                @change="(e) => updateRole(user.name, (e.target as HTMLSelectElement).value as UserRole)"
              >
                <option
                  v-for="option in roleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>

              <!-- 删除按钮（仅管理员可见） -->
              <button
                v-if="authStore.isDirector"
                class="del-btn"
                title="删除用户（需管理密码）"
                @click="deleteUser(user.name)"
              >🗑</button>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button @click="close" class="bs btn-sm">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.dialog-content {
  background: var(--card);
  border-radius: var(--r);
  width: 100%;
  max-width: 750px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 0.5px solid var(--bdr);
}

.dialog-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--tx);
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: var(--t3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--bg);
  color: var(--tx);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.permission-warning {
  padding: 10px 12px;
  background: var(--yb);
  color: var(--yt);
  border-radius: var(--rr);
  border: 0.5px solid var(--ybd);
  margin-bottom: 14px;
  font-size: 12px;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--t3);
  font-size: 13px;
}

.user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--bg);
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  transition: all 0.15s;
}

.user-item:hover {
  border-color: var(--gold);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--tx);
  margin-bottom: 4px;
}

.emp-id {
  font-size: 11px;
  font-weight: 400;
  color: var(--t3);
  margin-left: 6px;
}

.user-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 11px;
  color: var(--t3);
}

.meta-title {
  color: var(--gold);
  font-weight: 600;
}

/* 用户控制区 */
.user-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 12px;
}

.ctrl-input,
.ctrl-select {
  padding: 5px 8px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  background: var(--card);
  color: var(--tx);
  font-size: 12px;
  font-family: var(--fn);
  cursor: pointer;
  transition: all 0.15s;
  outline: none;
}

.ctrl-input:hover:not(:disabled),
.ctrl-select:hover:not(:disabled) {
  border-color: var(--gold);
}

.ctrl-input:focus,
.ctrl-select:focus {
  border-color: var(--gold);
}

.ctrl-input:disabled,
.ctrl-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emp-input {
  width: 52px;
  text-align: center;
}

.title-select {
  min-width: 90px;
}

.role-select {
  min-width: 80px;
}

.dialog-footer {
  padding: 12px 20px;
  border-top: 0.5px solid var(--bdr);
  display: flex;
  justify-content: flex-end;
}

/* 添加成员输入框 */
.add-input {
  flex: 1;
  padding: 6px 10px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  background: var(--card);
  color: var(--tx);
  font-size: 13px;
  font-family: var(--fn);
  outline: none;
}

.add-input:focus {
  border-color: var(--gold);
}

/* 删除按钮 */
.del-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--rr);
  background: transparent;
  color: var(--t3);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.5px solid var(--bdr);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.del-btn:hover {
  background: var(--rb);
  color: var(--rt);
  border-color: var(--rbd);
}

@media (max-width: 768px) {
  .dialog-content {
    max-width: 100%;
    max-height: 90vh;
  }

  .user-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .user-controls {
    margin-left: 0;
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
