/**
 * 周报维度渲染工具函数
 * 从 WeeklyView.vue 提取，供 WeeklyFormDialog 预览模式复用
 */

/** 提取 dueDate 中的月和日部分，如 "2026-05-15" → "5.15" */
export function formatDueDate(dueDate: string): string {
  if (!dueDate) return '';
  const full = dueDate.match(/\d{4}[-/](\d{1,2})[-/](\d{1,2})/);
  if (full) return `${parseInt(full[1])}.${parseInt(full[2])}`;
  const nums = dueDate.match(/(\d{1,2})[-/月](\d{1,2})/);
  if (nums) return `${parseInt(nums[1])}.${parseInt(nums[2])}`;
  return dueDate;
}

/** 维度正文渲染（序号+内容+日期），用于预览模式 */
export function renderDimBody(v: any, emptyText: string): string {
  const empty = emptyText || '无';
  if (!v || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return empty;
  if (typeof v === 'string') return v.trim() || empty;
  if (Array.isArray(v)) {
    return v
      .filter((i: any) => i.text?.trim())
      .map((i: any, idx: number) => {
        const num = idx + 1;
        const due = i.dueDate ? formatDueDate(i.dueDate) : '';
        return due ? `${num}. ${i.text}（${due}）` : `${num}. ${i.text}`;
      })
      .join('\n') || empty;
  }
  return empty;
}

/** 横幅简洁显示（只取内容，用；分隔），用于 App.vue 横幅 */
export function renderBannerText(v: any): string {
  if (!v || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.filter((i: any) => i.text?.trim()).map((i: any) => i.text).join('；');
  return '';
}
