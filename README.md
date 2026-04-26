# 华力集团研策部周报系统

基于 Vue 3 + TypeScript + Vite 的周报管理系统。

## 技术栈

- Vue 3 (Composition API) + TypeScript
- Pinia 状态管理 + Vue Router
- Vite 8 构建
- VueDraggable 拖拽排序
- localStorage 本地存储 + Express API 同步

## 项目结构

```
├── src/
│   ├── components/       # 组件（WeeklyFormDialog、AppHeader 等）
│   ├── views/            # 页面（Weekly、Charts、Meeting、Archive 等）
│   ├── stores/           # Pinia（app、auth、project、sync）
│   ├── services/         # 存储与 API 服务
│   ├── core/             # 类型定义
│   ├── config/           # 常量配置
│   └── utils/            # 工具函数
├── kpi/                  # KPI 统计页（独立部署）
├── public/               # 静态资源
└── scripts/              # 工具脚本
```

## 快速开始

```bash
npm install
npm run dev          # 开发 http://localhost:5173
npx vite build       # 构建
```

## 部署

```bash
npx vite build
# 将 dist/ 内容部署到 /var/www/weekly/
```

- 前端：https://www.moodway.top/weekly/
- KPI：https://www.moodway.top/kpi/
- 后端 API：weekly-api（Express + SQLite，端口 3004）

## 页面

| 路由 | 说明 |
|------|------|
| /weekly | 项目周报（卡片 + 拖拽排序） |
| /charts | 可视化看板（状态/阶段/风险） |
| /overview | 项目总览 |
| /meeting | 本周会议 |
| /import | 录入数据 |
| /archive | 归档项目 |
| /history | 历史记录 |
| /settings | 系统设置 |
| /users | 用户管理 |

## 权限角色

- **总监**：所有权限，归档/删除/用户管理
- **经理/主管**：编辑自己项目 + 提交周报
- **待审核**：只读

## 历史文档

开发过程记录已归档至 `docs/archive/`。
