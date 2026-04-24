# CLAUDE.md — 华力集团研策部周报系统
# 开发规范 · Workbuddy 行为准则

> 每次打开此项目时自动读取本文件。所有开发、部署、版本管理操作均以本文件为准，无需用户重复说明。

---

## 一、项目基本信息

| 项目 | 值 |
|------|-----|
| 系统名称 | 华力集团研策部周报管理系统 |
| 线上地址 | https://www.moodway.top |
| 周报入口 | https://www.moodway.top/weekly/index.html |
| KPI 模块 | https://www.moodway.top/kpi/index.html |
| GitHub 仓库 | hlyc-weekly（私有） |
| 腾讯云环境 ID | ycb-zb-0g7962fmca5676a3-1255322631 |
| 静态托管 Bucket | b67b-static-ycb-zb-0g7962fmca5676a3-1255322631 |
| 部署工具 | tcb CLI（腾讯云 CloudBase） |

---

## 二、目录结构说明

```
hlyc-weekly/
├── app/                        # 主应用（当前开发版，所有日常修改在这里）
│   ├── index.html              # 周报系统主页面
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── app.js              # 主逻辑
│       ├── auth.js             # 登录/权限
│       ├── config.js           # 配置（CloudBase 环境等）
│       ├── storage.js          # 数据读写
│       ├── sync.js             # 实时同步（WebSocket）
│       ├── utils.js            # 工具函数
│       └── render/             # 渲染模块
│           ├── app.js          # 渲染入口
│           ├── archive.js      # 归档
│           ├── charts.js       # 图表
│           ├── forms.js        # 表单
│           ├── meeting.js      # 会议记录
│           ├── users.js        # 用户管理
│           └── weekly.js       # 周报渲染
├── kpi/                        # KPI 统计模块
│   ├── index.html              # KPI 主页
│   └── calendar.html          # 年度日历统计
├── portal.html                 # 门户主页 → 线上 /index.html
├── weekly_index.html           # 自动生成，勿手动修改（由 deploy.sh 生成）
├── favicon.ico
├── cloudbaserc.json            # 腾讯云 CloudBase 配置
├── deploy.sh                   # 一键部署脚本
├── dev.sh                      # 本地开发脚本
├── VERSIONS.md                 # 版本历史记录（每次发布稳定版时更新）
└── CLAUDE.md                   # 本文件
```

### ⚠️ 重要约束
- **不要手动修改** `weekly_index.html`，它由 `deploy.sh` 从 `app/index.html` 自动生成
- **不要修改** `app_稳定版_*` 存档目录内的任何文件
- `kpi/` 目录改动后，`deploy.sh` 会自动检测并上传，无需额外操作

---

## 三、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 纯 HTML + CSS + JavaScript（无框架，单文件为主） |
| 云端 | 腾讯云 CloudBase 静态托管 |
| 数据库 | CloudBase 数据库，集合名 `weeklydata` |
| 云函数 | `weeklyProxy`（HTTP 触发器，ap-shanghai） |
| 版本管理 | Git + GitHub（私有仓库） |
| 部署 | tcb CLI + deploy.sh |

---

## 四、团队成员与权限

| 角色 | 姓名 | 系统权限 |
|------|------|---------|
| 总监（管理员） | Kenbe | 查看/编辑所有项目周报、系统管理 |
| 总监（管理员） | 张建波 | 查看/编辑所有项目周报 |
| 总监（管理员） | 冷耀秋 | 查看/编辑所有项目周报 |
| 总监（管理员） | 段挺秀 | 查看/编辑所有项目周报 |
| 设计经理（6人） | 其余成员 | 只能编辑自己负责的项目周报 |

**删除/归档密码：** `1234`

**管理员判断逻辑（代码中）：**
```javascript
const DIRECTORS = ['张建波', '冷耀秋', 'Kenbe', '段挺秀'];
const isDirector = DIRECTORS.includes(currentUser);
```

---

## 五、Commit Message 规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 新增KPI年度日历统计页面` |
| `fix` | 修复问题 | `fix: 修复周报提交后数据丢失问题` |
| `release` | 稳定版发布 | `release: 稳定版 v2.20260401 - 完成KPI模块` |
| `deploy` | 部署操作 | `deploy: 更新生产环境` |
| `chore` | 配置/脚本 | `chore: 更新 deploy.sh` |
| `refactor` | 重构 | `refactor: 优化数据加载逻辑` |

---

## 六、部署命令说明

```bash
# 日常更新部署
./deploy.sh "feat: 改动描述"

# 发布稳定版（自动存档 + 打 Tag + 部署）
./deploy.sh "release: 本版本主要改动" --archive

# 指定版本号
./deploy.sh "release: 改动描述" --tag v2.20260401
```

### 腾讯云部署路径映射

| 本地文件 | 线上路径 |
|---------|---------|
| `portal.html` | `/index.html` |
| `weekly_index.html`（自动生成） | `/weekly/index.html` |
| `app/` | `/app/` |
| `kpi/` | `/kpi/` |

---

## 七、稳定版本保存规范 ⭐

### 触发条件
当用户说以下任意一句话时，执行下方完整流程：
- "这个版本可以了"
- "保存稳定版"
- "存档这个版本"
- "打一个稳定版标签"

### 执行步骤（严格按顺序）

```bash
# 1. 提交所有改动
git add .
git commit -m "release: 稳定版 vX.YYYYMMDD - [用户描述的功能]"

# 2. 打 Tag
git tag vX.YYYYMMDD

# 3. 推送代码
git push origin main

# 4. 推送 Tag
git push origin vX.YYYYMMDD

# 5. 更新 VERSIONS.md（追加一条记录，见格式如下）
```

### 版本号规则
格式：`v[递增序号].[日期]`
示例：`v1.20260327` → `v2.20260401` → `v3.20260415`

### 更新 VERSIONS.md 的追加格式

```markdown
## v2 - 2026-04-01
- 完成 KPI 年度统计模块
- 修复周报列表排序问题
```

### 完成后向用户汇报

```
✅ 稳定版 vX.YYYYMMDD 已保存
- Git Tag: vX.YYYYMMDD ✓
- GitHub 推送: 成功 ✓
- VERSIONS.md: 已更新 ✓
```

---

## 八、只备份部分文件

当用户说"只保存 XX 文件"时：

```bash
git add [指定文件路径]
git commit -m "feat: [描述]"
git push origin main
# 不要 git add . ，只 add 用户指定的文件
```

---

## 九、常见操作快速参考

| 用户说 | Workbuddy 执行 |
|--------|---------------|
| "帮我部署" | `./deploy.sh "deploy: 更新"` |
| "这个版本可以了" | 完整稳定版流程（见第七节） |
| "帮我 push" | `git add . && git commit -m "..." && git push` |
| "回滚到上个版本" | `git tag -l` 列出所有版本，询问用户要回滚到哪个 |
| "看看现在有哪些版本" | `git tag -l` 并列出结果给用户 |
| "帮我部署 KPI 模块" | `tcb hosting deploy ./kpi /kpi` |
| "只保存不部署" | 只执行 git add/commit/push，不运行 deploy.sh |

---

## 十、注意事项

1. **VPN 冲突**：push 到 GitHub 需要开 VPN；部署腾讯云需要关 VPN。两步必须分开执行，切换时提醒用户切换 VPN 状态。
2. 如果 `git push` 失败，告知用户检查 VPN，本地 commit 已保存不会丢失。
3. 如果 `tcb` 命令失败，提示用户检查是否已登录（`tcb login`）。
4. `weekly_index.html` 每次 `deploy.sh` 都会重新生成，任何对它的手动修改都会被覆盖。
