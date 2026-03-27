# 华力集团研策部周报系统 — 开发规范

> 本文件供 Claude / Workbuddy 自动读取，作为所有开发和部署操作的行为准则。

---

## 项目基本信息

| 项目 | 值 |
|------|-----|
| 系统名称 | 华力集团研策部周报管理系统 |
| 线上地址 | https://www.moodway.top |
| 腾讯云环境ID | ycb-zb-0g7962fmca5766a3-1255322631 |
| 主要入口 | portal.html → weekly_index.html |

---

## 目录结构说明

```
/
├── app/                    # 当前开发版（主要改动在这里）
├── app_稳定版_vXX_YYYYMMDD/ # 稳定版存档（不要随意修改）
├── kpi/                    # KPI统计模块
├── portal.html             # 门户主页（→ 线上 /index.html）
├── weekly_index.html       # 周报入口（自动生成，不要手动改）
├── deploy.sh               # 部署脚本
├── VERSIONS.md             # 版本历史记录
└── CLAUDE.md               # 本文件
```

---

## Commit Message 规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 新增KPI年度统计页面` |
| `fix` | 修复问题 | `fix: 修复周报提交后数据丢失` |
| `deploy` | 部署操作 | `deploy: 更新生产环境` |
| `chore` | 配置/脚本 | `chore: 更新部署脚本` |
| `refactor` | 重构 | `refactor: 优化数据加载逻辑` |

---

## 部署命令说明

```bash
# 日常更新部署
./deploy.sh "feat: 改动描述"

# 发布稳定版（自动存档 + 打 Tag + 部署）
./deploy.sh "feat: 本版本主要改动" --archive

# 指定版本号部署
./deploy.sh "feat: 改动描述" --tag v25
```

---

## 版本存档规则

**什么时候需要存档？**
- 一个完整功能模块开发完成
- 修复了重要 Bug 且系统运行稳定
- 用户（Kenbe）明确说"这个版本可以了"

**存档操作（用 --archive 参数自动完成）：**
1. 复制 `app/` → `app_稳定版_vXX_YYYYMMDD/`
2. 在 `VERSIONS.md` 追加版本记录
3. 打 Git Tag（如 `v25`）
4. commit + push

**命名格式：** `app_稳定版_v{自增序号}_{YYYYMMDD}`

---

## 快速参考

**部署命令**: `./deploy.sh`
**腾讯云环境ID**: `ycb-zb-0g7962fmca5766a3-1255322631`

**Commit 规范**:
- `feat`: 新功能
- `fix`: 修复问题
- `deploy`: 部署操作
- `chore`: 配置/脚本改动

**版本存档规范**（稳定版发布时执行）:
1. 复制 `app/` 为 `app_稳定版_vXX_YYYYMMDD/`
2. 更新 `VERSIONS.md`
3. `git tag vXX`
4. push 所有内容

---

## 重要约束（必须遵守）

1. **不要修改** `app_稳定版_*` 目录内的任何文件（这是历史存档）
2. **不要手动编辑** `weekly_index.html`，它由 `deploy.sh` 自动从 `app/index.html` 生成
3. 腾讯云 CloudBase 部署使用 `tcb` CLI，确保已登录
4. 修改 `kpi/` 目录后，`deploy.sh` 会自动检测并上传，无需额外操作

---

## 技术栈

- 前端：纯 HTML + CSS + JavaScript（单文件为主）
- 云端：腾讯云 CloudBase 静态托管
- 版本管理：Git + GitHub（私有仓库 hlyc-weekly）
- 数据库：CloudBase 数据库，集合名 `weeklydata`
- 云函数：`weeklyProxy`（HTTP 触发器，ap-shanghai）

---

## 团队成员（权限说明）

| 角色 | 姓名 | 权限 |
|------|------|------|
| 总监（管理员） | Kenbe、张建波、冷耀秋、段挺秀 | 可查看/编辑所有项目周报 |
| 设计经理 | 其余6人 | 只能编辑自己负责的项目 |
