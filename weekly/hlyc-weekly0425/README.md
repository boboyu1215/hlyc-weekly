# 华力集团研策部周报系统 v2.0

基于 Vue 3 + TypeScript 的现代化周报管理系统

## 🎉 Phase 2 已完成！

**当前版本**: Phase 2 (100% 完成)

**新增功能**:
- ✅ 周报编辑对话框（完整表单，动态任务列表）
- ✅ 登录对话框（权限识别）
- ✅ 项目卡片拖拽排序（VueDraggable）
- ✅ 可视化看板（状态分布、阶段分布、风险统计）
- ✅ 测试数据生成器

详见 [PHASE2_COMPLETE.md](./PHASE2_COMPLETE.md)

## 🚀 技术栈

- **Vue 3** - 使用 Composition API
- **TypeScript** - 类型安全
- **Pinia** - 状态管理
- **Vue Router** - 路由管理
- **Vite** - 构建工具
- **VueDraggable** - 拖拽排序

## 📦 项目结构

```
hlyc-weekly0425/
├── src/
│   ├── assets/           # 静态资源
│   │   └── main.css      # 全局样式（含主题变量）
│   ├── components/       # 组件
│   │   └── layout/
│   │       └── AppHeader.vue  # 顶部导航栏
│   ├── config/           # 配置
│   │   └── constants.ts  # 系统常量
│   ├── core/             # 核心类型
│   │   └── types.ts      # TypeScript类型定义
│   ├── router/           # 路由
│   │   └── index.ts      # 路由配置
│   ├── services/         # 服务层
│   │   └── storage.ts    # localStorage封装
│   ├── stores/           # Pinia状态管理
│   │   ├── app.ts        # 应用全局状态
│   │   ├── auth.ts       # 认证状态
│   │   ├── project.ts    # 项目状态
│   │   └── sync.ts       # 同步状态
│   ├── utils/            # 工具函数
│   │   ├── date.ts       # 日期工具（ISO周计算）
│   │   └── string.ts     # 字符串工具
│   ├── views/            # 页面视图
│   │   ├── WeeklyView.vue    # 项目周报
│   │   ├── ChartsView.vue    # 可视化看板
│   │   ├── MeetingView.vue   # 周例会
│   │   ├── ArchiveView.vue   # 归档项目
│   │   ├── UsersView.vue     # 录入数据
│   │   ├── HistoryView.vue   # 历史记录
│   │   └── SettingsView.vue  # 系统设置
│   ├── App.vue           # 根组件
│   └── main.ts           # 应用入口
├── public/
│   └── data-import.html  # 数据导入工具
└── package.json
```

## 🛠️ 开发指南

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问: http://localhost:3004/

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 📊 数据管理

### 生成测试数据（推荐）

1. 访问 http://localhost:3004/test-data.html
2. 点击"生成测试数据"按钮
3. 自动创建4个测试项目和完整的周报数据

### 导入历史数据

1. 访问 http://localhost:3004/data-import.html
2. 点击"选择JSON文件"
3. 选择从旧系统导出的JSON备份文件
4. 点击导入即可

### 方法2：手动导入

在浏览器控制台执行：

```javascript
// 导入项目数据
localStorage.setItem('hlzc_p', JSON.stringify([
  {
    id: 1,
    name: "测试项目A",
    area: "1000㎡",
    startDate: "2024/01/01",
    designOwner: "张三",
    defStatus: "g",
    defStage: 2,
    archived: false
  }
]));

// 导入用户
localStorage.setItem('hlzc_user', '张建波');
```

## 🔑 核心功能

### 1. 项目周报 (/weekly)
- 查看所有活跃项目的周报
- 显示项目状态（红黄绿灯）
- 显示项目阶段
- **拖拽排序项目卡片** 🆕
- **编辑周报内容（完整对话框）** 🆕

### 2. 可视化看板 (/charts) 🆕
- 概览卡片（活跃项目、风险项、风险率、绿灯项目）
- 项目状态分布图（红黄绿灯百分比）
- 项目阶段分布图（13个阶段统计）
- 风险项目列表

### 3. 录入数据 (/users)
- 创建新项目
- 编辑项目信息
- 设置项目负责人

### 4. 归档项目 (/archive)
- 查看已归档项目
- 恢复归档项目
- 删除项目（仅总监）

### 5. 历史记录 (/history)
- 查看所有操作记录
- 时间线展示

### 6. 周例会 (/meeting)
- 开发中...

### 7. 系统设置 (/settings)
- 开发中...

## 👥 权限系统

### 角色类型

- **总监 (director)**: 张建波、冷耀秋、Kenbe
  - 所有权限
  - 可以归档/恢复/删除项目
  - 可以管理用户权限

- **设计经理 (manager)**:
  - 可以编辑自己负责的项目
  - 可以提交周报

- **策展经理 (curator)**:
  - 可以编辑自己负责的项目
  - 可以提交周报

- **主管 (supervisor)**:
  - 可以查看所有项目
  - 可以编辑自己负责的项目

- **待审核 (pending)**:
  - 只能查看，不能编辑

## 💾 数据存储

### localStorage Keys

- `hlzc_p` - 项目列表
- `hlzc_w` - 周报数据
- `hlzc_activity` - 活动日志
- `hlzc_user` - 当前用户
- `hlzc_users` - 用户注册表
- `hlzc_pending_submit` - 待提交项目
- `hlzc_offline_queue` - 离线队列

### 数据结构

完全兼容原系统的数据结构，可以直接导入旧系统的JSON备份。

## 🎨 主题系统

支持亮色/暗色主题切换，使用CSS变量实现。

点击顶部导航栏的主题切换按钮即可切换。

## 🔄 同步功能

### 离线队列

当网络断开时，所有修改会保存到离线队列，网络恢复后自动同步。

### 字段级合并

支持字段级时间戳，解决多人协作时的冲突问题。

### 云端同步

需要配置腾讯轻量化服务器API：

1. 复制 `.env.example` 为 `.env`
2. 配置 `VITE_API_ENDPOINT` 和 `VITE_ENV_ID`

## 📝 开发计划

### Phase 1 ✅ (已完成)
- [x] 数据层实现
- [x] 项目周报页面
- [x] 录入数据页面
- [x] 顶部导航栏
- [x] 基础架构搭建

### Phase 2 ✅ (已完成)
- [x] 周报编辑对话框
- [x] 登录对话框
- [x] 拖拽排序功能
- [x] 可视化看板
- [x] 测试数据生成器

### Phase 3 (计划中)
- [ ] 云端同步实现
- [ ] 权限管理完善
- [ ] 实时WebSocket
- [ ] 会议管理
- [ ] 系统设置页面

### Phase 4 (计划中)
- [ ] 移动端优化
- [ ] PWA支持
- [ ] 性能优化
- [ ] 更多图表类型

## 🐛 已知问题

~~1. 周报编辑对话框尚未实现~~ ✅ 已完成
~~2. 云端同步API需要配置~~ ⏳ Phase 3
~~3. 拖拽排序功能待实现~~ ✅ 已完成

## 📞 联系方式

如有问题，请联系开发团队。

## 📄 License

内部使用，保留所有权利。
