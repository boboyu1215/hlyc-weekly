<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { isAdmin } from '@/utils/permission';

const authStore = useAuthStore();

const username = ref('');
const showNotInSystem = ref(false);

function handleLogin() {
  if (!username.value.trim()) {
    alert('请输入用户名');
    return;
  }
  const name = username.value.trim();

  // 检查是否在系统注册表中（匹配旧系统 _showNotInSystemModal）
  const registry = authStore.userRegistry;
  if (!isAdmin(name, registry) && !registry[name]) {
    showNotInSystem.value = true;
    return;
  }

  authStore.login(name);
  username.value = '';
}

function handleForceLogin() {
  // 用户确认后仍以 pending 角色登录
  const name = username.value.trim();
  if (!name) return;
  authStore.login(name);
  username.value = '';
  showNotInSystem.value = false;
}

// 不提供关闭功能 —— 强制登录（匹配旧系统 ensureUser，登录弹窗不可关闭）
// 关闭按钮仅在已登录状态下可用（用于重新登录/切换用户）
</script>

<template>
  <div v-if="authStore.showLoginDialog" :class="['modal-overlay', { 'login-overlay': !authStore.isLoggedIn }]" style="z-index:10000">
    <div class="modal-container">
      <div class="modal-header">
        <div class="login-brand">
          <div class="brand-logo">华力集团</div>
          <div class="brand-sub">研策部周报系统</div>
        </div>
        <!-- 已登录时才显示关闭按钮（切换用户场景） -->
        <button v-if="authStore.isLoggedIn" class="btn-close" @click="authStore.showLoginDialog = false">✕</button>
      </div>

      <div class="modal-body">
        <!-- 未在系统中提示（匹配旧系统 _showNotInSystemModal） -->
        <div v-if="showNotInSystem" class="not-in-system">
          <div class="nis-icon">⚠️</div>
          <div class="nis-title">用户不在系统中</div>
          <div class="nis-desc">
            「{{ username }}」尚未在系统注册表中。登录后将以「待审核」角色运行，需总监授权后才能编辑周报数据。
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="bs" @click="showNotInSystem = false">返回修改</button>
            <button class="bp" @click="handleForceLogin">确认登录</button>
          </div>
        </div>

        <!-- 登录表单 -->
        <form v-else @submit.prevent="handleLogin">
          <div class="form-group">
            <label class="form-label">请输入您的姓名</label>
            <input
              v-model="username"
              type="text"
              class="form-input"
              placeholder="例：张三"
              autofocus
              required
            />
          </div>

          <div class="hint">
            <p>💡 使用说明：</p>
            <ul>
              <li>系统自动识别身份，输入姓名即可</li>
              <li>首次登录需总监授权后方可操作</li>
            </ul>
          </div>
        </form>
      </div>

      <div v-if="!showNotInSystem" class="modal-footer">
        <!-- 已登录时才显示取消按钮（切换用户场景） -->
        <button v-if="authStore.isLoggedIn" type="button" class="btn-secondary" @click="authStore.showLoginDialog = false">
          取消
        </button>
        <button type="button" class="btn-primary" @click="handleLogin">
          登录
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 复用 main.css 中的 .modal-overlay / .modal 全局类，此处仅补充局部差异 */
.modal-container {
  background: var(--card);
  border-radius: var(--r);
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 20px 16px;
  border-bottom: 0.5px solid var(--bdr);
}

/* 品牌化登录头部（匹配旧系统 auth.js 的 login 品牌样式） */
.login-brand {
  display: flex;
  flex-direction: column;
}

.brand-logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--gold);
  letter-spacing: 2px;
}

.brand-sub {
  font-size: 12px;
  color: var(--t3);
  margin-top: 2px;
}

.btn-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: transparent;
  color: var(--t3);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  border: none;
  cursor: pointer;
}

.btn-close:hover {
  background: var(--bg);
  color: var(--tx);
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--t2);
  margin-bottom: 5px;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  font-size: 14px;
  color: var(--tx);
  background: var(--card);
  font-family: var(--fn);
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: var(--gold);
}

.hint {
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--rr);
  font-size: 12px;
  color: var(--t3);
}

.hint p {
  margin: 0 0 6px 0;
  font-weight: 700;
  color: var(--t2);
}

.hint ul {
  margin: 0;
  padding-left: 18px;
}

.hint li {
  margin: 3px 0;
}

/* 未在系统中提示（匹配旧系统 _showNotInSystemModal） */
.not-in-system {
  text-align: center;
  padding: 16px 0;
}

.nis-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

.nis-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--tx);
  margin-bottom: 8px;
}

.nis-desc {
  font-size: 12px;
  color: var(--t3);
  line-height: 1.6;
  text-align: left;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--rr);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 0.5px solid var(--bdr);
}

.btn-primary {
  padding: 8px 18px;
  background: var(--gold);
  color: #fff;
  border-radius: var(--rr);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn-primary:hover {
  background: var(--gm);
}

.btn-secondary {
  padding: 8px 13px;
  background: var(--card);
  color: var(--t2);
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
</style>
