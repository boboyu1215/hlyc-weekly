/**
 * 路由配置
 */

import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  // 注意：Nginx 用 alias /var/www/weekly 把 /weekly 前缀剥离了
  // 所以 Router 的 base 应为 '/'，而非 Vite 的 BASE_URL（'/weekly/'）
  // Vite base 保持 /weekly/ 确保资源路径正确（/weekly/assets/xxx.js）
  history: createWebHistory('/'),
  routes: [
    {
      path: '/',
      redirect: '/weekly'
    },
    {
      path: '/weekly',
      name: 'weekly',
      component: () => import('@/views/WeeklyView.vue'),
      meta: { title: '项目周报' }
    },
    {
      path: '/charts',
      name: 'charts',
      component: () => import('@/views/ChartsView.vue'),
      meta: { title: '可视化看板' }
    },
    {
      path: '/meeting',
      name: 'meeting',
      component: () => import('@/views/MeetingView.vue'),
      meta: { title: '周例会' }
    },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('@/views/OverviewView.vue'),
      meta: { title: '项目总览' }
    },
    {
      path: '/kpi',
      name: 'kpi',
      component: () => import('@/views/KpiView.vue'),
      meta: { title: 'KPI跟踪' }
    },
    {
      path: '/archive',
      name: 'archive',
      component: () => import('@/views/ArchiveView.vue'),
      meta: { title: '归档项目' }
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('@/views/UsersView.vue'),
      meta: { title: '录入数据' }
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: { title: '历史记录' }
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/ImportView.vue'),
      meta: { title: '数据管理' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '系统设置' }
    }
  ]
});

// 路由守卫
router.beforeEach((to) => {
  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - 华力集团研策部周报系统`;
  }
});

export default router;
