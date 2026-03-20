# 任务分支管理插件 — 架构规划文档

> 版本：0.1.1（规划阶段）  
> 更新日期：2026-03-20  
> 变更记录：登录方案改为复用 kujiale-pub-lang 的账号密码 SSO 登录实现

---

## 一、项目概述

### 1.1 背景与痛点

开发人员在开始一个需求的开发工作时，需要经历以下繁琐流程：

```
想开发某需求
  → 打开 KA（开发任务管理平台）
    → 找到当前迭代中属于自己的需求
      → 进入需求详情页
        → 切换到「产研信息」Tab
          → 复制绑定的分支名
            → 回到 VSCode
              → 手动切换 Git 分支
```

**核心痛点：**
1. 上下文切换频繁（KA ↔ VSCode 来回切换）
2. 分支名不易记忆，需手动查找
3. 需求与分支的关联关系只在 KA 系统中存在，缺乏本地感知

### 1.2 目标体验

```
想开发某需求
  → VSCode 侧边栏切换到插件面板
    → 一眼看到属于自己、按迭代分组的需求列表
      → 点击需求旁的「切换分支」按钮（或直接点击需求名）
        → 完成 Git 分支切换（未有本地分支则自动 checkout -b）
```

### 1.3 核心价值

- 减少工具切换次数，聚焦在 VSCode 内完成工作
- 最终目标：开发侧「需求 → 分支」的零跳转体验

---

## 二、核心用户旅程（User Journey）

```
┌──────────────────────────────────────────────────────────────────┐
│                       关键流程对比                                │
├───────────────────────────┬──────────────────────────────────────┤
│        现有流程（7步）     │         目标流程（3步）              │
├───────────────────────────┼──────────────────────────────────────┤
│ 1. 打开浏览器访问 KA       │ 1. 点击 VSCode 侧边栏插件图标        │
│ 2. 找到当前迭代我的需求    │ 2. 找到目标需求（支持搜索/过滤）     │
│ 3. 进入需求详情            │ 3. 点击切换分支                      │
│ 4. 切换「产研信息」Tab     │                                      │
│ 5. 复制分支名              │                                      │
│ 6. 回到 VSCode             │                                      │
│ 7. git checkout 分支名     │                                      │
└───────────────────────────┴──────────────────────────────────────┘
```

---

## 三、整体架构

### 3.1 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                     Presentation Layer（展示层）                  │
│  ActivityBar Icon │ TreeView Panel │ StatusBar │ QuickPick      │
├─────────────────────────────────────────────────────────────────┤
│                     Application Layer（应用层）                   │
│  TaskService │ BranchService │ GitService │ AuthService         │
├─────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer（基础设施层）               │
│  KA API Client（HTTP）│ simple-git（本地 Git）│ SecretStorage     │
└─────────────────────────────────────────────────────────────────┘
         ↑ reactive-vscode 贯穿各层，提供响应式状态管理
```

### 3.2 模块关系图

```
index.ts
  ├── auth/
  │     └── AuthService          ← 鉴权、Token 管理
  ├── services/
  │     ├── KaApiClient          ← HTTP 请求封装
  │     ├── TaskService          ← 任务/迭代/需求数据
  │     ├── GitService           ← Git 操作封装
  │     └── CacheService         ← 内存 + 持久化缓存
  ├── providers/
  │     ├── TaskTreeProvider     ← TreeDataProvider（主面板）
  │     └── StatusBarProvider   ← StatusBar 当前分支/需求
  ├── commands/
  │     ├── switchBranch.ts      ← 切换分支命令
  │     ├── refreshTasks.ts      ← 刷新任务列表
  │     ├── login.ts             ← 登录命令
  │     └── openInKa.ts          ← 在浏览器打开 KA 对应页
  ├── models/
  │     ├── Sprint.ts            ← 迭代模型
  │     ├── Task.ts              ← 需求/任务模型
  │     └── Branch.ts            ← 分支模型
  ├── config.ts                  ← defineConfig 配置
  ├── utils.ts                   ← logger + 通用工具
  └── generated/meta.ts          ← 自动生成（vscode-ext-gen）
```

---

## 四、技术预研

### 4.1 KA 平台接入方案

**已确定方案：复用 `kujiale-pub-lang` 的账号密码 SSO 登录实现。**

该插件（`kujiale-pub-lang/src/core/login.ts`）已完整实现了以下能力，可直接参考/迁移：

#### 登录流程

```
用户触发登录命令
  → showInputBox 输入账号（uid）
  → showInputBox 输入密码（password: true 隐藏输入）
  → 调用 POST /api/ssologin（kuauth.kujiale.com）
  → 从响应 set-cookie 头中提取 Cookie 字符串
  → 调用 GET /pub/sso/getUser 获取用户信息
  → 将 Cookie + 用户信息存入 globalState
  → setContext pubLangLogin = true（驱动视图显示/隐藏）
```

#### 核心函数参考

| 函数 | 说明 |
|------|------|
| `loginInput()` | 输入账号密码 → 调接口 → 存储 Cookie 和用户信息 |
| `getCookieFromStorage()` | 插件激活时从 `globalState` 恢复登录态 |
| `setCookieFromStorage(cookie)` | 将 Cookie 写入 `globalState` |
| `setUserFromStorage(user)` | 将用户信息写入 `globalState`，并设置登录 Context |
| `clearAll()` | 清空 Cookie + 用户信息，触发各视图重置 |
| `logout()` | 二次确认后调用 `clearAll()` |
| `checkLogin(force?)` | 检查登录态，`force=true` 时未登录自动提示 |

#### Cookie 存储方式

使用 `context.globalState`（而非 `SecretStorage`），与 `kujiale-pub-lang` 保持一致：

```typescript
// 写入，并标记跨设备同步键
state.context.globalState.setKeysForSync(['kpTaskCookie'])
await state.context.globalState.update('kpTaskCookie', cookie)

// 读取
const cookie = state.context.globalState.get<string>('kpTaskCookie')
```

> **注意**：`globalState` 的值不加密，Cookie 属于敏感数据。如需更高安全性可改用 `context.secrets`（SecretStorage），API 仅需将 `update/get` 替换为 `store/get`，接口对齐后迁移成本极低。当前阶段与 `kujiale-pub-lang` 保持一致以降低实现成本。

#### 登录态驱动视图显示

通过 VSCode Context 控制面板内容：

```typescript
// 登录后
await commands.executeCommand('setContext', 'kpTaskLogin', true)

// 登出后
await commands.executeCommand('setContext', 'kpTaskLogin', false)
```

在 `package.json` 的 `viewsWelcome` 中配置未登录时的引导内容：

```json
{
  "view": "kpHelperPanel",
  "contents": "请先登录 KA 平台。\n[登录](command:kpHelper.login)",
  "when": "!kpTaskLogin"
}
```

### 4.2 Git 操作方案

使用 [`simple-git`](https://github.com/steveukx/git-js) 库操作本地 Git：

```
所需能力：
  - 获取当前分支名 → git.branchLocal()
  - 获取所有本地/远程分支 → git.branch(['-a'])
  - 切换已有分支 → git.checkout(branchName)
  - 拉取并切换远程分支 → git.fetch() + git.checkout(['-b', local, `origin/${remote}`])
  - 检测工作区是否有未提交变更 → git.status()
```

**脏工作区处理策略（Dirty Working Tree）：**
- 检测到未提交变更时，弹出 QuickPick 让用户选择：
  1. `Stash 暂存后切换`
  2. `放弃修改后切换`（需二次确认）
  3. `取消切换`

### 4.3 数据缓存策略

```
KA API 数据（任务列表） → 内存缓存（Map）+ 时间戳
                        → TTL = 5 分钟（可配置）
                        → 可手动触发刷新
本地分支列表          → 每次打开面板时刷新（轻量操作）
Cookie + 用户信息     → context.globalState（跨会话持久化）
                        → 插件激活时自动恢复登录态
```

### 4.4 响应式状态管理（reactive-vscode）

`reactive-vscode` 基于 Vue 的响应式原理（`@vue/reactivity`），在 VSCode 中提供 Composition API 风格：

```typescript
// 示例：任务列表响应式状态
const tasks = useTaskList()         // ref([])
const currentBranch = useCurrentBranch() // computed

// 当 tasks 变化时，TreeView 自动刷新
useTreeView('kpHelperPanel', tasks, { ... })
```

这比手动管理 `EventEmitter` + `onDidChangeTreeData` 更简洁，也是本模板的核心优势。

### 4.5 多仓库支持

VSCode 工作区可能包含多个文件夹（Multi-root Workspace），需处理：
- 检测 `workspace.workspaceFolders` 中哪些是 Git 仓库
- 当切换分支时，需让用户选择目标仓库（如有多个）
- KA 任务与仓库的关联关系可通过配置映射

---

## 五、依赖清单

### 5.1 运行时依赖（dependencies）

| 包名 | 版本建议 | 用途 |
|------|----------|------|
| `simple-git` | `^3.x` | 本地 Git 操作 |
| `axios` | `^1.x` | KA HTTP API 请求，拦截器统一处理鉴权 |

> `reactive-vscode` 已在 devDependencies 中，打包时会 bundle 进去，无需移到 dependencies。

### 5.2 开发依赖（已有，无需新增）

| 包名 | 用途 |
|------|------|
| `reactive-vscode` | 响应式 VSCode Composition API |
| `vscode-ext-gen` | 从 package.json 自动生成命令/配置类型 |
| `tsdown` | 打包（CJS 输出，external vscode） |
| `typescript` | 类型安全 |
| `vitest` | 单元测试 |

### 5.3 VSCode 内置 API（无需安装）

| API | 用途 |
|-----|------|
| `vscode.window.createTreeView` | 主面板 TreeView |
| `vscode.window.createStatusBarItem` | 状态栏显示当前需求/分支 |
| `vscode.window.showQuickPick` | 快速选择分支/需求 |
| `vscode.window.showInputBox` | 输入账号/密码（`password: true` 隐藏密码） |
| `context.globalState` | 存储 Cookie 和用户信息（持久化，跨会话） |
| `commands.executeCommand('setContext', ...)` | 控制登录前后面板内容切换 |
| `vscode.workspace.getConfiguration` | 读取插件配置 |
| `vscode.env.openExternal` | 在浏览器中打开 KA 页面 |

---

## 六、UI/UX 规划

### 6.1 界面布局

```
┌─────────────────────────────┐
│  ActivityBar                │
│  [🌿] Task Branch Manager   │◄── 侧边栏新 Tab，使用分支图标
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  TASK BRANCH MANAGER              [↺ 刷新]  [⚙ 设置]   │
├─────────────────────────────────────────────────────────┤
│  🔍 搜索需求...                                          │
├─────────────────────────────────────────────────────────┤
│  📅 迭代 2026-03（当前迭代）                             │
│    ├── 🟢 [需求] 用户中心改版           feature/user-v2 │
│    │        └── 🌿 feature/user-center-v2  [✓ 已在此分支]│
│    ├── 🔵 [需求] 支付流程优化                           │
│    │        └── 🌿 feature/payment-opt     [⇄ 切换]     │
│    └── ⚪ [需求] 首页性能优化                           │
│             └── 🌿 feature/home-perf       [⇄ 切换]     │
├─────────────────────────────────────────────────────────┤
│  📅 迭代 2026-02（上个迭代）                 [折叠]      │
│    └── ...                                              │
└─────────────────────────────────────────────────────────┘

底部状态栏：
┌──── 🌿 feature/user-center-v2  │  📋 用户中心改版 ────┐
```

### 6.2 TreeView 节点层级

```
Root（虚拟根节点）
  └── Sprint（迭代，可折叠）
        └── Task（需求/任务，带状态色）
              └── Branch（分支名，可点击切换，标记当前分支）
```

### 6.3 交互设计

#### 切换分支流程
```
用户点击 Branch 节点的 [⇄ 切换] 按钮
  │
  ├─ 检测工作区是否有未提交变更
  │     ├─ 有变更 → QuickPick 询问处理方式
  │     │           ├─ Stash 暂存 → git stash → 继续
  │     │           ├─ 放弃修改 → 二次确认 → git checkout -f → 继续
  │     │           └─ 取消 → 中断流程
  │     └─ 无变更 → 继续
  │
  ├─ 分支是否在本地存在？
  │     ├─ 存在 → git checkout <branch>
  │     └─ 不存在 → git fetch origin → git checkout -b <branch> origin/<branch>
  │
  └─ 切换成功
        → 状态栏更新
        → TreeView 高亮当前节点
        → showInformationMessage("已切换到 feature/xxx")
```

#### 登录流程
```
未登录状态 → 面板显示「请先登录 KA 平台」引导按钮（viewsWelcome）
  → 点击登录按钮 → 触发 kpHelper.login 命令
    → showInputBox 输入账号（uid）
      → showInputBox 输入密码（password: true 隐藏）
        → POST /api/ssologin 获取 Cookie
          → GET /pub/sso/getUser 获取用户信息
            → 成功：存入 globalState，setContext kpTaskLogin=true，刷新面板
            → 失败：showErrorMessage 提示，不改变登录态
```

> 实现参考 `kujiale-pub-lang/src/core/login.ts` 中的 `loginInput()` 函数，逻辑基本一致，仅需替换接口域名和 globalState key 名。

### 6.4 命令面板命令（Command Palette）

| 命令 ID | 显示名称 | 快捷键建议 |
|---------|----------|------------|
| `kpHelper.switchBranch` | Task Branch: Switch Branch | - |
| `kpHelper.refreshTasks` | Task Branch: Refresh Tasks | - |
| `kpHelper.login` | Task Branch: Login / Set Token | - |
| `kpHelper.logout` | Task Branch: Logout | - |
| `kpHelper.openInKa` | Task Branch: Open in KA | - |
| `kpHelper.quickSwitch` | Task Branch: Quick Switch (QuickPick) | `⌘⇧B` 建议 |

### 6.5 配置项（settings.json）

```json
{
  "kpHelper.kaApiBaseUrl": {
    "type": "string",
    "default": "https://ka.your-company.com",
    "description": "KA 平台的 API 地址"
  },
  "kpHelper.assigneeFilter": {
    "type": "boolean",
    "default": true,
    "description": "仅显示分配给自己的需求"
  },
  "kpHelper.sprintCount": {
    "type": "number",
    "default": 2,
    "description": "显示最近 N 个迭代"
  },
  "kpHelper.cacheTimeout": {
    "type": "number",
    "default": 300,
    "description": "任务列表缓存时间（秒）"
  },
  "kpHelper.autoFetch": {
    "type": "boolean",
    "default": true,
    "description": "切换分支前自动 git fetch"
  }
}
```

---

## 七、数据模型

```typescript
/** 迭代（Sprint） */
interface Sprint {
  id: string
  name: string          // 如 "2026-03"
  startDate: string
  endDate: string
  tasks: Task[]
}

/** 任务/需求 */
interface Task {
  id: string
  title: string         // 需求标题
  status: TaskStatus    // 进行中 | 待开发 | 已完成 等
  assignee: string      // 负责人
  branches: Branch[]    // 关联分支（可能多个）
  kaUrl: string         // KA 中的完整 URL（用于跳转）
}

enum TaskStatus {
  Todo = 'todo',
  InProgress = 'in_progress',
  Done = 'done',
}

/** 分支 */
interface Branch {
  name: string          // 如 feature/user-center-v2
  isLocal: boolean      // 本地是否已有此分支
  isCurrent: boolean    // 是否是当前所在分支
}
```

---

## 八、目录结构规划

```
src/
├── index.ts                    ← 入口：defineExtension，注册所有模块
├── config.ts                   ← defineConfig + 配置 key 枚举
├── utils.ts                    ← logger，通用工具函数
│
├── models/                     ← 纯数据类型定义（无副作用）
│   ├── sprint.ts
│   ├── task.ts
│   └── branch.ts
│
├── auth/
│   └── AuthService.ts          ← Token/Cookie 读写，登录状态管理
│
├── services/
│   ├── KaApiClient.ts          ← axios 实例，请求拦截（鉴权/错误处理）
│   ├── TaskService.ts          ← 获取迭代、需求，内置缓存逻辑
│   ├── GitService.ts           ← simple-git 封装，工作区感知
│   └── CacheService.ts         ← 通用内存缓存（TTL Map）
│
├── providers/
│   ├── TaskTreeProvider.ts     ← TreeDataProvider<Sprint | Task | Branch>
│   └── StatusBarProvider.ts   ← 状态栏：当前分支 + 关联需求名
│
├── commands/
│   ├── switchBranch.ts         ← 核心命令：脏检测 → stash/abort → checkout
│   ├── refreshTasks.ts         ← 清除缓存，重新拉取
│   ├── login.ts                ← 输入 Token/Cookie，保存到 SecretStorage
│   ├── logout.ts               ← 清除凭证
│   ├── openInKa.ts             ← 用 env.openExternal 打开 KA URL
│   └── quickSwitch.ts          ← showQuickPick 快速切换（不打开面板）
│
└── generated/
    └── meta.ts                 ← vscode-ext-gen 自动生成
```

---

## 九、可扩展性设计

### 9.1 多任务平台支持

预留 `ITaskPlatform` 接口，未来可接入 Jira、Linear 等：

```typescript
interface ITaskPlatform {
  name: string
  getSprints(): Promise<Sprint[]>
  getTasksByAssignee(userId: string): Promise<Task[]>
  getkpHelperes(taskId: string): Promise<Branch[]>
}

// KA 实现
class KaPlatform implements ITaskPlatform { ... }
// 未来可扩展
class JiraPlatform implements ITaskPlatform { ... }
```

### 9.2 分支名解析策略

KA 返回的分支名格式可能多样，通过可配置的正则或函数解析：

```json
"kpHelper.branchPattern": "feature/{taskId}-{taskName}"
```

---

## 十、开发路线图

### Phase 1 — MVP（最小可用版本）
- [ ] Cookie/Token 登录，SecretStorage 存储
- [ ] 调用 KA 接口拉取当前迭代任务列表
- [ ] TreeView 展示迭代 → 需求 → 分支层级
- [ ] 点击分支节点完成 `git checkout`
- [ ] 脏工作区检测与 stash 处理
- [ ] 状态栏显示当前分支

### Phase 2 — 完善体验
- [ ] 搜索/过滤需求
- [ ] 自动远程分支 fetch + checkout -b
- [ ] 快捷命令 `Quick Switch`（QuickPick）
- [ ] 「在 KA 中打开」跳转按钮
- [ ] 离线缓存（持久化到 workspaceState）

### Phase 3 — 扩展能力
- [ ] 多仓库工作区支持
- [ ] 通知：有新任务待开发时角标提醒
- [ ] 直接在插件内创建分支（从 KA 任务自动命名）
- [ ] 支持可配置的多平台接入（Jira 等）

---

## 十一、风险与注意事项

| 风险 | 描述 | 缓解措施 |
|------|------|----------|
| KA 接口不稳定 | 内网 API 无文档或随时变更 | 封装 KaApiClient，变更时只改一处 |
| Cookie 过期 | Cookie 方案下 Token 会失效 | 检测 401 自动提示重新登录 |
| 脏工作区丢失代码 | 误操作 git checkout -f | 强制操作前必须二次 showWarningMessage 确认 |
| 工作区无 Git | 用户未初始化 Git | 激活时检测，无 Git 则静默不激活 |
| 多个关联分支 | 一个需求绑定多条分支 | Branch 节点展开展示全部，用户自选 |
