# 2026-04-26 正式版

## 部署信息

- **构建时间**: 2026-04-26
- **部署地址**: https://www.moodway.top/weekly/
- **主入口JS**: `assets/index-JuWV6oLS.js`

## 版本内容

### 核心变更（相比上一版）
- WeeklyFormDialog: `coreOutputItems` 序列输入（18处引用）
- WeeklyView: 547行，卡片渲染维度信息
- AppHeader: 344行
- HistoryView: 207行
- App.vue: 234行
- 弹窗点击外部不关闭
- 弹窗标题「更新工作事项状态」

### 技术栈
- Vue 3 + TypeScript + Vite
- 前端纯 SPA，通过 `/api` 代理到后端 weekly-api（Express + SQLite）

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.html` | SPA 入口 |
| `assets/` | 构建产物（JS/CSS） |
| `data-import.html` | 数据导入工具 |
| `inject-data.html` | 数据注入工具 |
| `test-data.html` | 测试数据工具 |
