/**
 * 认证状态管理
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { StorageService } from '@/services/storage';
import apiClient from '@/services/api';
import type { UserRole, User } from '@/core/types';
import { isAdmin } from '@/utils/permission';

const storage = StorageService.getInstance();

export const useAuthStore = defineStore('auth', () => {
  // 当前用户
  const currentUser = ref<string | null>(null);

  // 用户注册表
  const userRegistry = ref<Record<string, User>>({});

  // 登录对话框
  const showLoginDialog = ref(false);

  // 初始化
  async function initAuth() {
    currentUser.value = storage.getCurrentUser();
    userRegistry.value = storage.loadUserRegistry();

    // 如果本地用户注册表为空，从服务器拉取（匹配旧系统 _loadUserRegistry）
    if (Object.keys(userRegistry.value).length === 0) {
      try {
        const res = await apiClient.getUserRegistry();
        if (res.success && res.data) {
          // 服务器返回格式：{ data: { "用户名": { role, joinedAt, ... }, ... } }
          const serverUsers = res.data.data || res.data;
          if (typeof serverUsers === 'object' && !Array.isArray(serverUsers)) {
            // 过滤掉 _updatedAt 等内部字段
            for (const [name, info] of Object.entries(serverUsers)) {
              if (name.startsWith('_')) continue;
              const userInfo = info as any;
              if (typeof userInfo === 'object' && userInfo.role) {
                userRegistry.value[name] = {
                  name,
                  role: userInfo.role,
                  joinedAt: userInfo.joinedAt || Date.now(),
                  lastSeen: userInfo.lastSeen || 0,
                };
              }
            }
            storage.saveUserRegistry(userRegistry.value);
            console.log(`[Auth] 从服务器加载了 ${Object.keys(userRegistry.value).length} 个用户`);
          }
        }
      } catch (e) {
        console.warn('[Auth] 从服务器加载用户注册表失败，使用本地数据', e);
      }
    }

    // 强制登录：未登录则弹出登录框（匹配旧系统 ensureUser）
    if (!currentUser.value) {
      showLoginDialog.value = true;
    }
  }

  // 计算属性：是否已登录
  const isLoggedIn = computed(() => {
    return currentUser.value !== null && currentUser.value !== '';
  });

  // 计算属性：用户角色
  const userRole = computed((): UserRole => {
    if (!currentUser.value) return 'guest';

    // 从注册表获取角色
    const user = userRegistry.value[currentUser.value];
    return user?.role || 'guest';
  });

  // 计算属性：是否是管理员（向后兼容别名）
  const isDirector = computed(() => {
    return isAdmin(currentUser.value || '', userRegistry.value);
  });

  // 计算属性：是否已审核通过（admin 和 member 均视为已审核）
  const isApproved = computed(() => {
    const role = userRole.value;
    return role === 'admin' || role === 'member';
  });

  // 登录
  function login(name: string) {
    currentUser.value = name;
    storage.setCurrentUser(name);

    // 更新最后登录时间
    if (!userRegistry.value[name]) {
      userRegistry.value[name] = {
        name,
        role: 'guest',
        joinedAt: Date.now(),
        lastSeen: Date.now()
      };
    } else {
      userRegistry.value[name].lastSeen = Date.now();
    }

    storage.saveUserRegistry(userRegistry.value);
    showLoginDialog.value = false;
  }

  // 登出
  function logout() {
    currentUser.value = null;
    storage.clearCurrentUser();
  }

  // 检查是否可以编辑项目
  function canEditProject(project: { designOwner: string }): boolean {
    if (!isLoggedIn.value) return false;
    if (isDirector.value) return true;
    if (!isApproved.value) return false;
    return project.designOwner === currentUser.value;
  }

  // 检查是否可以提交周报
  function canSubmitWeekly(): boolean {
    return isLoggedIn.value && isApproved.value;
  }

  // 更新用户角色（仅总监可用）
  function updateUserRole(name: string, role: UserRole) {
    if (!isDirector.value) return;

    if (userRegistry.value[name]) {
      userRegistry.value[name].role = role;
      storage.saveUserRegistry(userRegistry.value);
    }
  }

  // 添加用户（匹配旧系统 auth.js addMember）
  function addUser(name: string) {
    if (!isDirector.value) return;
    if (userRegistry.value[name]) return;

    userRegistry.value[name] = {
      name,
      role: 'guest',
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };
    storage.saveUserRegistry(userRegistry.value);
  }

  // 删除用户（匹配旧系统 auth.js deleteUser）
  function deleteUser(name: string) {
    if (!isDirector.value) return;
    delete userRegistry.value[name];
    storage.saveUserRegistry(userRegistry.value);
  }

  // 导入用户注册表
  function importUserRegistry(data: Record<string, User>) {
    userRegistry.value = data;
    storage.saveUserRegistry(data);
  }

  return {
    currentUser,
    userRegistry,
    showLoginDialog,
    isLoggedIn,
    userRole,
    isDirector,
    isApproved,
    initAuth,
    login,
    logout,
    canEditProject,
    canSubmitWeekly,
    updateUserRole,
    addUser,
    deleteUser,
    importUserRegistry
  };
});
