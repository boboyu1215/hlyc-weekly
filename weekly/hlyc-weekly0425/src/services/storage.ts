/**
 * 存储服务
 * 完全匹配原始系统的localStorage逻辑
 */

import type {
  Project,
  WeeksData,
  WeeklySnapshot,
  ActivityLog,
  UserRegistry,
  QueueItem,
  TaskItem,
  Meeting
} from '@/core/types';
import { STORAGE_KEYS, SNAP_CONTENT_FIELDS } from '@/config/constants';
import { wkKey } from '@/utils/date';

export class StorageService {
  private static instance: StorageService;

  private constructor() {}

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  // ==================== 项目相关 ====================

  /**
   * 加载项目列表 - LP()
   */
  loadProjects(): Project[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * 保存项目列表 - SP()
   */
  saveProjects(projects: Project[]): void {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }

  /**
   * 获取单个项目
   */
  getProject(id: number): Project | undefined {
    const projects = this.loadProjects();
    return projects.find(p => p.id === id);
  }

  /**
   * 更新项目
   */
  updateProject(id: number, updates: Partial<Project>): void {
    const projects = this.loadProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      projects[index] = { ...projects[index], ...updates };
      this.saveProjects(projects);
    }
  }

  /**
   * 删除项目
   */
  deleteProject(id: number): void {
    const projects = this.loadProjects();
    const filtered = projects.filter(p => p.id !== id);
    this.saveProjects(filtered);
  }

  // ==================== 周报相关 ====================

  /**
   * 加载周报数据 - LW()
   */
  loadWeeks(): WeeksData {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WEEKS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  /**
   * 保存周报数据 - SW()
   */
  saveWeeks(weeks: WeeksData): void {
    localStorage.setItem(STORAGE_KEYS.WEEKS, JSON.stringify(weeks));
  }

  /**
   * 获取快照 - getSnap()
   * 完整匹配旧系统三级继承逻辑：
   *   1. 本周有 _savedWk 原生快照 → 直接返回（追加跨周继承保护）
   *   2. 本周有旧版快照（无_savedWk但有内容）→ 向下兼容，视为原生
   *   3. 无该周快照 → 向前找最近可靠基础，提取顺延/延误项，其余清空
   */
  getSnap(yr: number, wk: number, pid: number, projects: Project[]): WeeklySnapshot {
    const weeks = this.loadWeeks();
    const k = wkKey(yr, wk);
    const own = weeks[k] && weeks[k][pid];
    const p = projects.find(x => x.id === pid);
    const defStatus = p ? (p.defStatus || 'g') : 'g';
    const defStage = p ? (p.defStage || 0) : 0;
    const blank: WeeklySnapshot = {
      status: defStatus as any, stage: defStage,
      risk: [], coreOutput: '', coreAction: [],
      decision: [], crossDept: [], next: '',
      incident: '', knowledge: ''
    };

    // 情况1：本周有 _savedWk 原生快照 → 返回原生数据
    if (own !== undefined && own._savedWk === k) {
      return this._resolveStatus(this._mergeCarryItems(own, k, pid, weeks));
    }

    // 情况2：本周有旧版快照（无_savedWk）且有实质内容 → 向下兼容
    if (own !== undefined && own._savedWk === undefined && !own._inherited) {
      if (this._snapHasContent(own)) {
        return this._resolveStatus(this._mergeCarryItems(own, k, pid, weeks));
      }
    }

    // 情况3：无该周快照 → 向前找最近可靠基础，提取顺延/延误项
    const sorted = Object.keys(weeks).filter(x => x < k).sort();
    let baseSnap: WeeklySnapshot | null = null;

    for (let i = sorted.length - 1; i >= 0; i--) {
      const ws = weeks[sorted[i]];
      if (!ws || ws[pid] === undefined) continue;
      const c = ws[pid];
      if (c._inherited) continue; // 跳过继承视图，防止链式污染
      if (c._savedWk !== undefined || this._snapHasContent(c)) {
        baseSnap = { ...c };
        break;
      }
    }

    if (!baseSnap) return blank;

    // 从基础快照的 coreAction 中提取顺延项和延误项
    const carryItems = this._extractCarryItems(baseSnap.coreAction, yr, wk);

    // 继承视图：清空所有内容，只保留顺延/延误项
    return {
      status: this._resolveStatus({ ...baseSnap, risk: [], decision: [] }).status,
      stage: baseSnap.stage !== undefined ? baseSnap.stage : defStage,
      coreOutput: '',
      coreAction: carryItems,
      risk: [],
      decision: [],
      crossDept: [],
      knowledge: '',
      incident: '',
      next: '',
      _inherited: true,
    };
  }

  /**
   * 判断快照是否有实质内容
   */
  private _snapHasContent(snap: WeeklySnapshot): boolean {
    if ((typeof snap.coreOutput === 'string' && snap.coreOutput.trim())) return true;
    if (Array.isArray(snap.coreAction) && snap.coreAction.some(i => i && i.text && i.text.trim())) return true;
    if (typeof snap.coreAction === 'string' && (snap.coreAction as any).trim()) return true;
    return false;
  }

  /**
   * 从基础快照的 coreAction 中提取需要带入本周的条目
   * 生命周期规则（以完成时间 dueDate 为准）：
   *   截止日在本周周一之前 → 丢弃
   *   截止日在本周或更远未来 → 继承显示，标「顺延」或「延误」
   *   没有 dueDate → 不继承
   */
  private _extractCarryItems(coreAction: TaskItem[] | undefined, yr: number, wk: number): TaskItem[] {
    if (!Array.isArray(coreAction)) return [];
    const thisMonday = this._getMonday(yr, wk);
    const result: TaskItem[] = [];

    for (const item of coreAction) {
      if (!item || !item.text || !item.text.trim()) continue;
      if (!item.dueDate) continue;

      const d = new Date(item.dueDate);
      d.setHours(0, 0, 0, 0);

      // 截止日在本周周一之前 → 已过期，丢弃
      if (d < thisMonday) continue;

      // 继承显示：_fromKPI 来的标「延误」，普通事项标「顺延」
      result.push({
        ...item,
        _carryover: !(item as any)._fromKPI,
        _overdue: !!(item as any)._fromKPI,
      });
    }
    return result;
  }

  /**
   * 合并跨周继承保护：
   * 对于有原生快照的周，从上一个原生快照中提取 dueDate >= 本周周一 的事项
   * 若本周快照里没有同名事项则追加
   */
  private _mergeCarryItems(ownSnap: WeeklySnapshot, k: string, pid: number, weeks: WeeksData): WeeklySnapshot {
    const parsed = k.match(/(\d{4})-W(\d+)/);
    if (!parsed) return ownSnap;
    const yr = +parsed[1], wk = +parsed[2];

    // 找上一个原生基础快照
    const sorted = Object.keys(weeks).filter(x => x < k).sort();
    let baseSnap: WeeklySnapshot | null = null;

    for (let i = sorted.length - 1; i >= 0; i--) {
      const ws = weeks[sorted[i]];
      if (!ws || ws[pid] === undefined) continue;
      const c = ws[pid];
      if (c._inherited) continue;
      if (c._savedWk !== undefined || this._snapHasContent(c)) {
        baseSnap = c;
        break;
      }
    }
    if (!baseSnap) return ownSnap;

    const carryItems = this._extractCarryItems(baseSnap.coreAction, yr, wk);
    if (!carryItems.length) return ownSnap;

    const ownTexts = new Set(
      (Array.isArray(ownSnap.coreAction) ? ownSnap.coreAction : [])
        .map(i => (i.text || '').trim()).filter(Boolean)
    );

    const toAdd = carryItems.filter(i => !ownTexts.has((i.text || '').trim()));
    if (!toAdd.length) return ownSnap;

    return {
      ...ownSnap,
      coreAction: [...(Array.isArray(ownSnap.coreAction) ? ownSnap.coreAction : []), ...toAdd],
    };
  }

  /**
   * 修正快照 status：risk/decision 都为空/无 且 status='r' → 降回 'g'
   */
  private _resolveStatus(snap: WeeklySnapshot): WeeklySnapshot {
    if (!snap || snap.status !== 'r') return snap;
    const hasRisk = this._fieldHasRealContent(snap.risk);
    const hasDec = this._fieldHasRealContent(snap.decision);
    if (hasRisk || hasDec) return snap;
    return { ...snap, status: 'g' as any };
  }

  /**
   * 判断字段是否有实质内容（排除空值、空数组、"无"、纯空白）
   */
  private _fieldHasRealContent(v: any): boolean {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) {
      return v.some(item =>
        item && typeof item.text === 'string' &&
        item.text.trim() !== '' && item.text.trim() !== '无'
      );
    }
    if (typeof v === 'string') {
      const s = v.trim();
      return s !== '' && s !== '无' && s !== '—';
    }
    return false;
  }

  /**
   * 获取某年某周的周一日期
   */
  private _getMonday(yr: number, wk: number): Date {
    // ISO week: Jan 4 is always in week 1
    const jan4 = new Date(yr, 0, 4);
    const dayOfWeek = jan4.getDay() || 7; // 1=Mon, 7=Sun
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (wk - 1) * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * 设置快照 - setSnap()
   * 写入 _savedWk 标识，清除运行时标记防止链式污染
   */
  setSnap(yr: number, wk: number, pid: number, snap: WeeklySnapshot): void {
    const weeks = this.loadWeeks();
    const k = wkKey(yr, wk);

    if (!weeks[k]) {
      weeks[k] = {};
    }

    // 清除运行时标记，防止链式污染（匹配旧系统行为）
    const cleanSnap = { ...snap };
    delete cleanSnap._inherited;
    delete cleanSnap._carryover;
    delete cleanSnap._overdue;
    delete cleanSnap._fromKPI;
    delete cleanSnap._inheritedFrom;

    // 写入 _savedWk 标识，让 getSnap 知道这是本周自己录入保存的原生快照
    cleanSnap._savedWk = k;

    // 添加时间戳
    cleanSnap._ts = Date.now();

    // 初始化字段时间戳
    if (!cleanSnap._fieldTs) {
      cleanSnap._fieldTs = {};
    }

    // 更新所有内容字段的时间戳
    const now = Date.now();
    SNAP_CONTENT_FIELDS.forEach(field => {
      const v = (cleanSnap as any)[field];
      const hasValue = v !== undefined && v !== null && v !== '' &&
        !(Array.isArray(v) && v.length === 0);
      if (hasValue) {
        cleanSnap._fieldTs![field] = now;
      }
    });

    weeks[k][pid] = cleanSnap;
    this.saveWeeks(weeks);
  }

  /**
   * 字段级合并快照
   * 用于云端同步时的冲突解决
   */
  mergeSnap(localSnap: WeeklySnapshot, remoteSnap: WeeklySnapshot): WeeklySnapshot {
    if (!remoteSnap) return { ...localSnap };

    const merged: WeeklySnapshot = { ...remoteSnap };

    // 对每个内容字段进行时间戳比较
    SNAP_CONTENT_FIELDS.forEach(field => {
      const lts = (localSnap._fieldTs && localSnap._fieldTs[field]) || localSnap._ts || 0;
      const rts = (remoteSnap._fieldTs && remoteSnap._fieldTs[field]) || remoteSnap._ts || 0;

      // 使用时间戳较新的字段值
      if (lts >= rts) {
        (merged as any)[field] = (localSnap as any)[field];
        if (!merged._fieldTs) merged._fieldTs = {};
        merged._fieldTs[field] = lts;
      }
    });

    return merged;
  }

  // ==================== 活动日志 ====================

  /**
   * 加载活动日志
   */
  loadActivity(): ActivityLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVITY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * 保存活动日志
   */
  saveActivity(activity: ActivityLog[]): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(activity));
  }

  /**
   * 加载活动日志（别名）
   */
  loadActivityLog(): ActivityLog[] {
    return this.loadActivity();
  }

  /**
   * 保存活动日志（别名）
   */
  saveActivityLog(activity: ActivityLog[]): void {
    this.saveActivity(activity);
  }

  /**
   * 添加活动日志
   */
  addActivity(log: ActivityLog): void {
    const activity = this.loadActivity();
    activity.unshift(log); // 最新的在前面
    // 只保留最近1000条
    if (activity.length > 1000) {
      activity.splice(1000);
    }
    this.saveActivity(activity);
  }

  // ==================== 用户相关 ====================

  /**
   * 获取当前用户
   */
  getCurrentUser(): string | null {
    return localStorage.getItem(STORAGE_KEYS.USER);
  }

  /**
   * 设置当前用户
   */
  setCurrentUser(name: string): void {
    localStorage.setItem(STORAGE_KEYS.USER, name);
  }

  /**
   * 清除当前用户
   */
  clearCurrentUser(): void {
    localStorage.removeItem(STORAGE_KEYS.USER);
  }

  /**
   * 加载用户注册表
   */
  loadUserRegistry(): UserRegistry {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  /**
   * 保存用户注册表
   */
  saveUserRegistry(registry: UserRegistry): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(registry));
  }

  // ==================== 离线队列 ====================

  /**
   * 加载离线队列
   */
  loadQueue(): QueueItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * 保存离线队列
   */
  saveQueue(queue: QueueItem[]): void {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  }

  /**
   * 添加到离线队列
   */
  addToQueue(item: QueueItem): void {
    const queue = this.loadQueue();
    queue.push(item);
    this.saveQueue(queue);
  }

  /**
   * 从队列中移除
   */
  removeFromQueue(id: string): void {
    const queue = this.loadQueue();
    const filtered = queue.filter(item => item.id !== id);
    this.saveQueue(filtered);
  }

  // ==================== 待提交项目 ====================

  /**
   * 加载待提交项目ID集合
   */
  loadPendingSubmit(): Set<number> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PENDING_SUBMIT);
      const arr = data ? JSON.parse(data) : [];
      return new Set(arr);
    } catch {
      return new Set();
    }
  }

  /**
   * 保存待提交项目ID集合
   */
  savePendingSubmit(pending: Set<number>): void {
    const arr = Array.from(pending);
    localStorage.setItem(STORAGE_KEYS.PENDING_SUBMIT, JSON.stringify(arr));
  }

  /**
   * 添加待提交项目
   */
  addPendingSubmit(pid: number): void {
    const pending = this.loadPendingSubmit();
    pending.add(pid);
    this.savePendingSubmit(pending);
  }

  /**
   * 移除待提交项目
   */
  removePendingSubmit(pid: number): void {
    const pending = this.loadPendingSubmit();
    pending.delete(pid);
    this.savePendingSubmit(pending);
  }

  /**
   * 清空待提交项目
   */
  clearPendingSubmit(): void {
    this.savePendingSubmit(new Set());
  }

  /**
   * 获取某个项目的所有周快照（Diff 对比用，匹配旧系统 LW_proj）
   */
  getProjectWeekSnapshots(pid: number): Record<string, WeeklySnapshot> {
    const weeks = this.loadWeeks();
    const result: Record<string, WeeklySnapshot> = {};
    for (const [wk, wkData] of Object.entries(weeks)) {
      if (wkData && wkData[pid]) {
        result[wk] = wkData[pid];
      }
    }
    return result;
  }

  // ==================== 会议相关 ====================

  /**
   * 获取指定周的会议列表（匹配旧系统 getMeetings）
   */
  getMeetings(yr: number, wk: number): Meeting[] {
    const weeks = this.loadWeeks();
    const k = wkKey(yr, wk);
    return weeks[k]?.__meetings || [];
  }

  /**
   * 保存指定周的会议列表（匹配旧系统 setMeetings）
   */
  setMeetings(yr: number, wk: number, meetings: Meeting[]): void {
    const weeks = this.loadWeeks();
    const k = wkKey(yr, wk);
    if (!weeks[k]) weeks[k] = {};
    weeks[k].__meetings = meetings;
    this.saveWeeks(weeks);
  }

  // ==================== KPI 相关 ====================

  /**
   * 获取 KPI 数据（本地）
   */
  getKpiData(): Record<string, any> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.KPI);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  /**
   * 保存 KPI 数据（本地）
   */
  saveKpiData(data: Record<string, any>): void {
    localStorage.setItem(STORAGE_KEYS.KPI, JSON.stringify(data));
  }

  // ==================== 数据导入导出 ====================

  /**
   * 导出所有数据
   */
  exportAll(): string {
    const data = {
      projects: this.loadProjects(),
      weeks: this.loadWeeks(),
      activity: this.loadActivity(),
      user: this.getCurrentUser(),
      userRegistry: this.loadUserRegistry(),
      exportTime: new Date().toISOString(),
      version: '2.0.0'
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入所有数据
   */
  importAll(jsonString: string): void {
    const data = JSON.parse(jsonString);

    if (data.projects) {
      this.saveProjects(data.projects);
    }
    if (data.weeks) {
      this.saveWeeks(data.weeks);
    }
    if (data.activity) {
      this.saveActivity(data.activity);
    }
    if (data.user) {
      this.setCurrentUser(data.user);
    }
    if (data.userRegistry) {
      this.saveUserRegistry(data.userRegistry);
    }
  }

  /**
   * 清空所有数据
   */
  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
}
