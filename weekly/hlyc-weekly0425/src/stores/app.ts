/**
 * 应用全局状态
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getCurrentYearWeek, getPrevWeek, getNextWeek, wkKey, shouldShowNextWeek } from '@/utils/date';
import type { YearWeek } from '@/core/types';

export const useAppStore = defineStore('app', () => {
  // 当前年周
  const yr = ref<number>(0);
  const wk = ref<number>(0);

  // 当前页面
  const currentPage = ref<string>('weekly');

  // 主题
  const theme = ref<'light' | 'dark'>('light');

  // 初始化
  function init() {
    const current = getCurrentYearWeek();
    yr.value = current.yr;
    wk.value = current.wk;

    // 从localStorage加载主题
    const savedTheme = localStorage.getItem('hlzc_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      theme.value = savedTheme;
    }
  }

  // 计算属性
  const weekKey = computed(() => wkKey(yr.value, wk.value));

  const isCurrentWeek = computed(() => {
    const current = getCurrentYearWeek();
    // 周五及之后：下一周被视为"当前周"（系统已自动跳转）
    if (shouldShowNextWeek()) {
      const next = getNextWeek(current.yr, current.wk);
      return yr.value === next.yr && wk.value === next.wk;
    }
    return yr.value === current.yr && wk.value === current.wk;
  });

  // 周导航
  function prevWeek() {
    const prev = getPrevWeek(yr.value, wk.value);
    yr.value = prev.yr;
    wk.value = prev.wk;
  }

  function nextWeek() {
    const next = getNextWeek(yr.value, wk.value);
    yr.value = next.yr;
    wk.value = next.wk;
  }

  function gotoCurrentWeek() {
    const current = getCurrentYearWeek();
    yr.value = current.yr;
    wk.value = current.wk;
  }

  function gotoWeek(yw: YearWeek) {
    yr.value = yw.yr;
    wk.value = yw.wk;
  }

  // 主题切换
  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
    localStorage.setItem('hlzc_theme', theme.value);
    applyThemeClass();
  }

  function setTheme(newTheme: 'light' | 'dark') {
    theme.value = newTheme;
    localStorage.setItem('hlzc_theme', newTheme);
    applyThemeClass();
  }

  function applyThemeClass() {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme.value);
  }

  return {
    yr,
    wk,
    currentPage,
    theme,
    weekKey,
    isCurrentWeek,
    init,
    prevWeek,
    nextWeek,
    gotoCurrentWeek,
    gotoWeek,
    toggleTheme,
    setTheme
  };
});
