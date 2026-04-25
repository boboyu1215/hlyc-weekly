/**
 * 日期工具函数
 * 完全匹配原始系统的ISO周计算逻辑
 */

import type { YearWeek } from '@/core/types';

/**
 * 计算ISO周
 * @param d 日期对象或日期字符串
 * @returns {yr, wk} 年份和周数
 */
export function isoWk(d: Date | string): YearWeek {
  const date = typeof d === 'string' ? new Date(d) : new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const yr = date.getFullYear();
  const wk = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { yr, wk };
}

/**
 * 生成周键
 * @param yr 年份
 * @param wk 周数
 * @returns 格式：2024-W15
 */
export function wkKey(yr: number, wk: number): string {
  return `${yr}-W${String(wk).padStart(2, '0')}`;
}

/**
 * 生成周标签
 * @param yr 年份
 * @param wk 周数
 * @returns 格式：2024年 第15周
 */
export function wkLabel(yr: number, wk: number): string {
  return `${yr}年 第${wk}周`;
}

/**
 * 获取周的日期范围
 * @param yr 年份
 * @param wk 周数
 * @returns 格式：4月8日-4月14日
 */
export function wkRange(yr: number, wk: number): string {
  const jan4 = new Date(yr, 0, 4);
  const offset = ((jan4.getDay() + 6) % 7);
  const week1Monday = new Date(yr, 0, 4 - offset);
  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (wk - 1) * 7);
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);

  const formatDate = (d: Date) => {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return `${formatDate(targetMonday)}-${formatDate(targetSunday)}`;
}

/**
 * 解析周键
 * @param key 周键，格式：2024-W15
 * @returns {yr, wk}
 */
export function parseWkKey(key: string): YearWeek {
  const match = key.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week key: ${key}`);
  }
  return {
    yr: parseInt(match[1], 10),
    wk: parseInt(match[2], 10)
  };
}

/**
 * 获取当前年周
 */
export function getCurrentYearWeek(): YearWeek {
  return isoWk(new Date());
}

/**
 * 获取上一周
 */
export function getPrevWeek(yr: number, wk: number): YearWeek {
  const jan4 = new Date(yr, 0, 4);
  const offset = ((jan4.getDay() + 6) % 7);
  const week1Monday = new Date(yr, 0, 4 - offset);
  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (wk - 1) * 7);
  targetMonday.setDate(targetMonday.getDate() - 7);
  return isoWk(targetMonday);
}

/**
 * 获取下一周
 */
export function getNextWeek(yr: number, wk: number): YearWeek {
  const jan4 = new Date(yr, 0, 4);
  const offset = ((jan4.getDay() + 6) % 7);
  const week1Monday = new Date(yr, 0, 4 - offset);
  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (wk - 1) * 7);
  targetMonday.setDate(targetMonday.getDate() + 7);
  return isoWk(targetMonday);
}

/**
 * 格式化日期为 YYYY/MM/DD
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * 检查是否应该显示下一周（周五及之后，即 getDay() >= 5）
 * 周五进入"下周模式"，周六日同理
 */
export function shouldShowNextWeek(date: Date = new Date()): boolean {
  return date.getDay() >= 5;
}

/**
 * @deprecated 使用 shouldShowNextWeek 代替
 */
export function isFriday(date: Date = new Date()): boolean {
  return date.getDay() === 5;
}
