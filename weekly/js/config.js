// ════════════════════════════════════════════════════
// config.js — 所有常量配置（改这里就够了）
// ════════════════════════════════════════════════════

// 云函数代理地址（自建 Express+SQLite API）
const PROXY_URL = '/api';

// 总监列表（最高管理权，直接登录无需录入）
const DIRECTORS = ['张建波','冷耀秋','Kenbe'];

// 强制隐藏的用户（已删除但未从云端清除）
const HIDDEN_USERS = ['啵啵','z\'j\'b'];

// 管理密码（归档/删除用）
const DEL_PWD = '1234';

// 角色体系
const ROLE_LABELS = {director:'总监', manager:'设计经理', curator:'策展经理', supervisor:'主管', pending:'待审批'};
const ROLE_ICONS  = {director:'👑', manager:'🎨', curator:'🖼️', supervisor:'📋', pending:'⏳'};

// 可编辑项目的角色
const EDITOR_ROLES = ['director','manager','curator','supervisor'];

// 设计阶段列表
const STAGES = ['平面','方案（概念）','方案（效果图）','全部方案','业态落位','施工图','软装','照明','家具','材料样板','招采','营建','竣工'];

// 状态标签
const SL = {r:'需决策/卡住', y:'需关注', g:'正常推进'};

// 字段标签（用于 diff 显示）
const FIELD_LABELS = {
  name:'项目名称', area:'项目面积', startDate:'设计启动',
  schemeDate:'方案完成', designDate:'设计完成', siteDate:'进场时间',
  completionDate:'竣工时间', openDate:'开业时间',
  prepOwner:'筹备负责人', designOwner:'研策负责人',
  archived:'归档状态', defStatus:'默认状态', defStage:'默认阶段',
  status:'项目状态', stage:'当前阶段', risk:'风险/卡点',
  coreOutput:'上周完成', coreAction:'本周计划',
  decision:'管理层决策', crossDept:'跨部门支援',
};

const STATUS_LABEL = {r:'🔴需决策/卡住', y:'🟡需关注', g:'🟢正常推进'};

// 快照内容字段（合并时需要处理的字段）
const SNAP_CONTENT_FIELDS = ['status','stage','risk','coreOutput','coreAction','decision','crossDept','next','incident','knowledge'];
