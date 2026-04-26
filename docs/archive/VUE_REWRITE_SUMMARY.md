# 华力集团研策部周报系统 — Vue 3 重写总结

> **项目路径**：`weekly/hlyc-weekly0425/`  
> **技术栈**：Vue 3 + TypeScript + Vite 8 + Pinia 3 + Vue Router 5  
> **部署地址**：https://www.moodway.top/weekly/  
> **日期**：2026-04-25

---

## 一、背景与动机

旧版周报系统（v1~v23）是纯前端 HTML + 原生 JS + CloudBase 云函数架构，经过长期迭代积累了大量技术债务：

| 问题 | 影响 |
|------|------|
| 全部逻辑在一个 HTML 文件内（内嵌 JS/CSS） | 不可维护、无法协作 |
| 无版本控制（手工拷贝迭代到 v23） | 无法回滚、无法追踪变更 |
| localStorage 单机存储 | 无法多人协作、数据无法跨设备 |
| 前端权限控制（形同虚设） | 可被绕过，无安全性 |
| CloudBase 云函数（境外网络） | 需 VPN，国内不稳定 |
| 无 TypeScript、无组件化 | 代码质量无法保障 |

2026 年 4 月，启动全面重写计划，目标是用现代前端技术栈重构整个系统。

---

## 二、架构设计

### 2.1 技术选型

| 层级 | 旧版 | 新版 |
|------|------|------|
| 框架 | 原生 HTML/JS | **Vue 3 (Composition API)** |
| 语言 | JavaScript | **TypeScript** |
| 构建 | 无 | **Vite 8** |
| 状态管理 | localStorage 直读直写 | **Pinia 3** |
| 路由 | 手动 DOM 切换 | **Vue Router 5** |
| 后端 | CloudBase 云函数 | **Express + SQLite（已独立部署）** |
| 样式 | 内嵌 `<style>` | **CSS 变量 + 主题系统** |

### 2.2 目录结构

```
weekly/hlyc-weekly0425/
├── src/
│   ├── main.ts                    # 入口：主题初始化 + 路由挂载
│   ├── App.vue                    # 根组件：布局 + 周五自动跳转
│   ├── assets/main.css            # 全局样式 + 主题变量 + 响应式
│   ├── config/constants.ts        # 常量配置（API 地址等）
│   ├── core/types.ts              # TypeScript 类型定义
│   ├── router/index.ts            # 路由表 + 导航守卫
│   ├── services/api.ts            # API 封装（fetch + JSON）
│   ├── stores/
│   │   ├── app.ts                 # 应用状态：主题、周次、用户
│   │   ├── project.ts             # 项目 CRUD + 周报数据
│   │   └── auth.ts                # 认证 + 权限
│   ├── utils/
│   │   ├── date.ts                # 日期工具：周次计算、周五判断
│   │   ├── storage.ts             # StorageService：带前缀的 localStorage
│   │   └── format.ts              # 格式化工具
│   ├── views/                     # 页面组件
│   │   ├── WeeklyView.vue         # 项目周报（核心页面）
│   │   ├── OverviewView.vue       # 项目总览
│   │   ├── ChartsView.vue         # 可视化看板
│   │   ├── UsersView.vue          # 录入数据（主任权限）
│   │   ├── MeetingView.vue        # 本周会议
│   │   ├── ArchiveView.vue        # 归档项目
│   │   ├── HistoryView.vue        # 历史记录
│   │   └── ImportView.vue         # 数据管理（导入/导出/合并）
│   └── components/                # 复用组件
│       ├── layout/AppHeader.vue   # 顶部导航栏 + tabs
│       ├── WeeklyFormDialog.vue   # 周报编辑弹窗（拖拽排序）
│       ├── LoginDialog.vue        # 登录弹窗
│       ├── DatePicker.vue         # 日期选择器
│       ├── SyncDialog.vue         # 数据同步弹窗
│       ├── SubmitDiffDialog.vue   # 提交差异对比
│       └── UserManagementDialog.vue  # 用户管理弹窗
├── public/                        # 静态资源 + 独立工具页
├── scripts/                       # 构建辅助脚本
├── index.html                     # HTML 入口
├── vite.config.ts                 # Vite 配置
├── tsconfig.json                  # TypeScript 配置
└── package.json                   # 依赖管理
```

---

## 三、核心功能实现

### 3.1 用户系统
- 登录/注册弹窗（`LoginDialog.vue`）
- 角色权限控制（主任/普通用户），路由守卫拦截
- 主任专属功能：录入数据、用户管理

### 3.2 周报核心（`WeeklyView.vue` + `WeeklyFormDialog.vue`）
- 项目分类展示（重点项目 / 一般项目 / 已完成）
- 拖拽排序（VueDraggable + SortableJS）
- 本周计划/事项管理（增删改 + 时间必填验证）
- 乐观锁并发控制（版本号比对，防止丢失更新）
- 表单验证：事项未填时间时弹窗震动提示，阻止提交

### 3.3 周次系统
- ISO 周自动计算（`date.ts`：`getCurrentYearWeek` / `getPrevWeek` / `getNextWeek`）
- 周五及之后自动跳转下周（`shouldShowNextWeek`：`getDay() >= 5`）
- 跳转后"当前周"判定自动适配，按钮正确显示"更新本周状态"

### 3.4 数据同步
- 轮询检测远端数据更新
- 合并式更新策略（非简单覆盖，避免丢失本地操作）
- 数据导入/导出/合并（`ImportView.vue`）
- 冲突检测与差异对比（`SubmitDiffDialog.vue`）

### 3.5 可视化看板（`ChartsView.vue`）
- 各设计阶段分布图
- 项目时间轴
- PDF 导出（A4 横版，标题"华力集团｜研策部周报"）
- 打印样式优化（文字缩进、均匀对齐）

### 3.6 主题系统
- 亮色/暗色切换（🌙 按钮）
- CSS 变量驱动（`:root.dark` / `:root.light`）
- localStorage 持久化
- 入口即时应用（`main.ts` 在 mount 前设置 class，避免闪烁）

---

## 四、本次迭代修复记录（Phase 1 ~ Phase 9）

### Phase 1-2：基础架构搭建
- Vite + Vue 3 + TypeScript + Pinia 项目初始化
- 路由系统、API 封装、StorageService
- TypeScript 类型定义（`types.ts`）

### Phase 3-5：核心页面迁移
- WeeklyView / OverviewView / ChartsView 迁移
- WeeklyFormDialog（拖拽排序 + 表单验证）
- LoginDialog / UserManagementDialog / SyncDialog

### Phase 6-7：数据同步与权限
- 轮询机制实现
- 导航守卫 + 角色权限控制
- 数据导入/导出/合并页面

### Phase 8：UI 精修
- 顶部导航栏自适应
- 移动端响应式布局
- PDF 导出样式优化

### Phase 9：逻辑修复（2026-04-25）
| 问题 | 修复方案 | 涉及文件 |
|------|----------|----------|
| KPI tab 仍显示在导航栏 | 从 `allTabs` 中彻底移除 | `AppHeader.vue` |
| 默认页面应为下周（18周） | `isFriday()` → `shouldShowNextWeek()`（周五/六/日跳转） | `date.ts` + `App.vue` |
| 🌙 主题切换失效 | CSS 用 `:root.dark` class，JS 改用 `classList` 而非 `data-theme` | `app.ts` + `main.ts` |
| 18周按钮显示"补录" | `isCurrentWeek` 在周五后判定下一周为"当前周" | `app.ts` |
| 事项不填时间仍可提交 | 禁止提交 + alert 提示 + 弹窗震动动画 | `WeeklyFormDialog.vue` |
| 顶部栏目被裁剪 | overflow 改 visible + tab `min-width:max-content` | `main.css` |

---

## 五、部署方案

### 5.1 构建流程

```bash
cd weekly/hlyc-weekly0425
npm install
npx vite build
```

构建产物输出到 `dist/`（约 620KB）。

### 5.2 部署流程

采用 **tar.gz 补丁包 + SCP 上传** 的轻量部署方式：

```bash
# 1. 打包
tar czf /tmp/weekly-patch-$(date +%Y%m%d%H%M).tar.gz -C dist .

# 2. 上传
sshpass -p '***' scp /tmp/weekly-patch-*.tar.gz ubuntu@119.29.84.148:/tmp/

# 3. 部署
ssh ubuntu@119.29.84.148 "rm -rf /var/www/weekly/* && tar xzf /tmp/weekly-patch-*.tar.gz -C /var/www/weekly/"
```

### 5.3 服务器配置

- 服务器：腾讯云轻量应用服务器 119.29.84.148（4核4G，Ubuntu 24.04）
- 后端 API：Express + SQLite（PM2 进程 `weekly-api`，端口 3004）
- Nginx 反向代理：`/weekly/api` → `localhost:3004`
- SSL 证书：Let's Encrypt（自动续期）

---

## 六、与旧版对比

| 维度 | 旧版（v1~v23） | 新版（Vue 3） |
|------|---------------|--------------|
| 文件结构 | 单 HTML 文件（内嵌一切） | 组件化、模块化（32 个源文件） |
| 语言 | JavaScript | TypeScript（类型安全） |
| 构建 | 无构建流程 | Vite 8（HMR、Tree-shaking） |
| 状态管理 | localStorage 直操作 | Pinia Store（响应式、可追踪） |
| 路由 | 手动 DOM 切换 | Vue Router（导航守卫、懒加载） |
| 主题切换 | data-theme 属性（失效） | classList 切换（:root.dark） |
| 表单验证 | confirm 跳过 | 震动动画 + 阻止提交 |
| 周次逻辑 | 仅周五跳转 | 周五/六/日均跳转 |
| 版本管理 | 手工拷贝到 v23 | Git + Tag |
| 部署 | 手动上传 | tar.gz 补丁 + 一键部署 |

---

## 七、后续计划

- [ ] 完善单元测试（Vitest）
- [ ] E2E 测试（Playwright）
- [ ] CI/CD 自动化部署
- [ ] 服务端渲染（SSR）考虑
- [ ] 离线 PWA 支持
- [ ] 国际化（i18n）
