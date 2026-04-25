/**
 * 核心类型定义
 * 完全匹配原始系统的数据结构
 */

// 项目状态：红、黄、绿
export type ProjectStatus = 'r' | 'y' | 'g';

// 用户角色
export type UserRole = 'director' | 'manager' | 'curator' | 'supervisor' | 'pending';

// 项目接口
export interface Project {
  id: number;
  name: string;
  area: string;
  startDate: string;
  schemeDate: string;
  designDate: string;
  siteDate: string;
  completionDate: string;
  openDate: string;
  prepOwner: string;
  designOwner: string;
  archived: boolean;
  defStatus: ProjectStatus;
  defStage: number;
  sortOrder?: number;
  _updatedBy?: string;
  _updatedAt?: string;
}

// 任务项
export interface TaskItem {
  text: string;
  dueDate: string;
}

// 周报快照
export interface WeeklySnapshot {
  status: ProjectStatus;
  stage: number;
  risk: TaskItem[];
  coreOutput: string;
  coreAction: TaskItem[];
  decision: TaskItem[];
  crossDept: TaskItem[];
  next?: string;
  incident?: string;
  knowledge?: string;
  _ts?: number;
  _fieldTs?: Record<string, number>;
  _savedWk?: string;
  _inherited?: boolean;       // 继承视图标记（非 boolean 的旧版数据向下兼容）
  _carryover?: boolean;        // 是否为跨周顺延事项标记
  _overdue?: boolean;          // 是否为 KPI 延误事项标记
  _inheritedFrom?: string;     // 继承来源周 key（旧系统 getSnap 继承时标记）
  _fromKPI?: boolean;          // 是否来自 KPI 页面注入
  _updatedBy?: string;         // 最后提交人
  _updatedAt?: string;         // 最后提交时间
}

// 周报数据结构：{weekKey: {projectId: snapshot}}
export interface WeeksData {
  [weekKey: string]: {
    [projectId: string]: WeeklySnapshot;
    __meetings?: Meeting[];
  };
}

// 会议记录（匹配旧系统 meeting.js 数据结构）
export interface Meeting {
  id: number;
  title: string;
  time: string;           // datetime-local
  initiator: string;      // 发起人
  attendees: string;      // 参与人（逗号分隔）
  content: string;        // 主要内容
  issues: string;         // 需要解决的问题
}

// KPI 延误条目（匹配旧系统 kpi.js 数据结构）
export interface KpiEntry {
  projId: string;
  text: string;
  newDueDate: string;     // YYYY-MM-DD
  confirmed: boolean;
  done: boolean;
  projName?: string;      // 用于显示
}

// KPI 数据集合
export interface KpiData {
  [key: string]: KpiEntry;  // key = `${projId}__${text}`
}

// 活动日志
export interface ActivityLog {
  type: 'create' | 'edit' | 'archive' | 'restore' | 'delete' | 'submit';
  user: string;
  time: number;
  desc: string;
  projectId?: number;
  weekKey?: string;
}

// 用户信息
export interface User {
  name: string;
  role: UserRole;
  joinedAt?: number;
  lastSeen?: number;
}

// 用户注册表
export interface UserRegistry {
  [name: string]: User;
}

// 同步状态
export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  lastSync: number | null;
  pendingCount: number;
  error: string | null;
}

// 离线队列项
export interface QueueItem {
  id: string;
  action: string;
  data: any;
  timestamp: number;
  retries: number;
}

// 年周对象
export interface YearWeek {
  yr: number;
  wk: number;
}
