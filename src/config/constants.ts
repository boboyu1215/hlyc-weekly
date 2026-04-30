/**
 * 系统常量配置
 * 完全匹配原始系统的配置
 */

// 云端同步配置
export const PROXY_URL = import.meta.env.VITE_API_ENDPOINT || '';
export const ENV_ID = import.meta.env.VITE_ENV_ID || '';

// 删除密码（管理员删除项目时需输入）
export const DEL_PWD = '1234';

// 项目阶段
export const STAGES = [
  '平面',
  '方案（概念）',
  '方案（效果图）',
  '全部方案',
  '业态落位',
  '施工图',
  '软装',
  '照明',
  '家具',
  '材料样板',
  '招采',
  '营建',
  '竣工'
];

// 角色标签（三级权限体系）
export const ROLE_LABELS: Record<string, string> = {
  // 新三级
  'admin':   '管理员',
  'member':  '成员',
  'guest':   '访客',
  // 旧值兼容映射（只读展示用，不再写入）
  'director':   '管理员',
  'manager':    '成员',
  'curator':    '成员',
  'supervisor': '成员',
  'pending':    '待审核',
};

// 状态标签
export const STATUS_LABELS: Record<string, string> = {
  r: '红灯',
  y: '黄灯',
  g: '绿灯'
};

// 状态颜色
export const STATUS_COLORS: Record<string, string> = {
  r: '#f56c6c',
  y: '#e6a23c',
  g: '#67c23a'
};

// 快照内容字段（用于字段级合并）
export const SNAP_CONTENT_FIELDS = [
  'status',
  'stage',
  'risk',
  'coreOutput',
  'coreOutputItems',
  'coreAction',
  'decision',
  'crossDept',
  'next',
  'incident',
  'knowledge'
];

// localStorage keys
export const STORAGE_KEYS = {
  PROJECTS: 'hlzc_p',
  WEEKS: 'hlzc_w',
  ACTIVITY: 'hlzc_activity',
  USER: 'hlzc_user',
  USERS: 'hlzc_users',
  PENDING_SUBMIT: 'hlzc_pending_submit',
  OFFLINE_QUEUE: 'hlzc_offline_queue',
  KPI: 'hlzc_kpi',
};

// Diff 对比字段标签（匹配旧系统 FIELD_LABELS）
export const FIELD_LABELS: Record<string, string> = {
  status: '项目状态',
  stage: '当前阶段',
  risk: '最大风险/卡点',
  coreOutput: '上周完成工作',
  coreAction: '本周计划',
  decision: '需管理层决策',
  crossDept: '跨部门支援',
  next: '下一步计划',
  incident: '突发事件',
  knowledge: '知识积累',
};
