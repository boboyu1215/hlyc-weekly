<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import type { UserRole } from '@/core/types';

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
  return Object.entries(authStore.userRegistry).map(([name, user]) => ({
    name,
    ...user
  }));
});

// 角色选项
const roleOptions: { value: UserRole; label: string; color: string }[] = [
  { value: 'director', label: '总监', color: '#8b5cf6' },
  { value: 'manager', label: '经理', color: '#3b82f6' },
  { value: 'curator', label: '策展人', color: '#10b981' },
  { value: 'supervisor', label: '监理', color: '#f59e0b' },
  { value: 'pending', label: '待审核', color: '#6b7280' }
];

// 获取角色标签
function getRoleLabel(role: UserRole): string {
  return roleOptions.find(r => r.value === role)?.label || role;
}

// 获取角色颜色
function getRoleColor(role: UserRole): string {
  return roleOptions.find(r => r.value === role)?.color || '#6b7280';
}

// 添加成员（匹配旧系统 auth.js addMember）
function addMember() {
  if (!authStore.isDirector) {
    alert('只有总监可以添加成员');
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
    alert('只有总监可以删除成员');
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
    alert('只有总监可以修改用户角色');
    return;
  }

  if (confirm(`确定将 ${name} 的角色修改为 ${getRoleLabel(newRole)} 吗？`)) {
    authStore.updateUserRole(name, newRole);
  }
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
          ⚠️ 您没有权限管理用户角色
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
              <div class="user-name">{{ user.name }}</div>
              <div class="user-meta">
                <span class="meta-item">
                  注册时间: {{ new Date(user.joinedAt || user.registeredAt || Date.now()).toLocaleDateString() }}
                </span>
                <span v-if="user.lastSeen || user.lastLogin" class="meta-item">
                  最后登录: {{ new Date(user.lastSeen || user.lastLogin || Date.now()).toLocaleDateString() }}
                </span>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px">
              <div class="user-role">
                <select
                  :value="user.role"
                  @change="(e) => updateRole(user.name, (e.target as HTMLSelectElement).value as UserRole)"
                  :disabled="!authStore.isDirector"
                  class="role-select"
                  :style="{ borderColor: getRoleColor(user.role) }"
                >
                  <option
                    v-for="option in roleOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <!-- 删除按钮（仅总监可见） -->
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
  max-width: 700px;
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
}

.user-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--tx);
  margin-bottom: 4px;
}

.user-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 11px;
  color: var(--t3);
}

.user-role {
  margin-left: 14px;
}

.role-select {
  padding: 6px 10px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  background: var(--card);
  color: var(--tx);
  font-size: 12px;
  font-family: var(--fn);
  cursor: pointer;
  transition: all 0.15s;
  min-width: 100px;
  outline: none;
}

.role-select:hover:not(:disabled) {
  border-color: var(--gold);
}

.role-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.role-select:focus {
  border-color: var(--gold);
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

  .user-role {
    margin-left: 0;
    width: 100%;
  }

  .role-select {
    width: 100%;
  }
}
</style>
