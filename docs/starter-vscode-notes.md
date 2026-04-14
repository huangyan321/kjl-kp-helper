## starter-vscode (Kaptain Helper 插件) — 工作状态记录
更新日期：2026-04-14

### 已完成功能
- 登录/登出、Cookie 持久化（globalState）、restoreAuth 激活恢复登录态
- 401 自动清除 Cookie + 弹窗提示「立即登录」（KpApiClient.ts 响应拦截器）
- 401 后通过 `authHooks.onExpired` 钩子立即刷新 TreeView，viewsWelcome 即时生效
- TreeView 三态（loading/empty/error），error 时弹窗显示具体错误原因
- 真实 KA 数据接入：迭代列表 → 父级任务列表 → 关联分支三步聚合，5分钟内存缓存
- simple-git 分支切换：自动按 remote URL 匹配 workspace 文件夹，本地无分支则 fetch + checkout -b
- 多分支任务走 QuickPick 选择，单分支直接切换（带 withProgress 进度提示）
- 手动刷新：invalidateCache() + loadTasks()
- isCurrent 修复：repo-aware 跨项目感知，有 repo 字段只与对应 folder 的当前分支比对
- 活跃项目过滤：读取活跃编辑器所在 folder 的 package.json 中 repository 字段，按 repo URL 匹配任务；无绑定 repo 的任务始终显示；watchActiveEditor 实时切换
- 任务列表优先级前缀：行首显示 P0/P1/P2（由 priorityName 字段推导）
- 任务状态文字颜色区分（FileDecorationProvider + contributes.colors）
- 当前分支高亮：图标改为绿色 `git-branch` 图标

### Kaptain 接口清单
- GET  /api/iteration/getIterationList?projectId=269  → data[] (statusName='迭代中' 为当前)
- POST /api/issue/listEasyPage  body: {"search":{"iterationId","leader":"huishi","parentId":0},"order":"id","desc":true} → data.list[]（KaIssue 含 priorityName 字段）
- GET  /api/issue/changeSet/queryAll?issueKey=SCHOOL-XXXX&subIssue=0 → data.branchChanges[].branch / .repo
- GET  /api/user/current → { data:{ldapId,name} }（ldapId 是 ldap 字段）

### 关键文件
- src/services/KpApiClient.ts   — axios + 401 拦截 + authHooks.onExpired 钩子；KaIssue 含 priorityName?: string
- src/services/TaskService.ts   — KaTaskSource 缓存聚合；TaskInfo 含 priorityName: string
- src/services/GitService.ts    — switchBranch / getCurrentBranch / getWorkspaceBranchInfo（返回 {folderPath,branch,remotes[]}）
- src/commands/switchBranchMock.ts — 真实 git 切换（已去除 Mock）
- src/commands/refreshTasks.ts  — invalidateCache + loadTasks
- src/providers/TaskTreeProvider.ts — loadTasks、活跃项目过滤、isCurrent 更新、watchActiveEditor
- src/providers/TaskDecorationProvider.ts — 状态颜色枚举、getPriorityLevelFromName、FileDecorationProvider

### TaskDecorationProvider 状态颜色规则（package.json contributes.colors 已注册）
| ColorKey     | 匹配关键词                | ThemeColor ID                  |
|--------------|---------------------------|-------------------------------|
| todo         | 默认                      | kpHelper.todoForeground        |
| in-progress  | 开发中/进行中/联调        | kpHelper.inProgressForeground  |
| dev-done     | 开发完成/待发布           | kpHelper.devDoneForeground     |
| testing      | 待测试/测试中/提测        | kpHelper.testingForeground     |
| done         | 已完成/关闭/取消          | kpHelper.doneForeground        |

### 优先级推导规则（getPriorityLevelFromName）
- priorityName 含 p0/紧急 → P0（行首显示"P0 "）
- priorityName 含 p1/高   → P1（行首显示"P1 "）
- 其余                     → P2（行首显示"P2 "）
- 颜色：P0/P1/P2 文字颜色已回退，仅保留行首文本标识（用户要求不改颜色）

### 当前用户信息（测试用）
- ldapId: huishi，projectId: 269，当前迭代 Sprint101 (id=11799)

### 已知问题
- pnpm install 因 @vscode/vsce 依赖 semver trust 降级报错，改用 npm install --save 绕过
- 依赖更新命令：pnpm run update（生成 meta.ts），不要用 pnpm update
- tsconfig.json 已加 "types": ["node"] 以支持 Buffer；moduleResolution=node 有弃用警告（无影响）

### 下一步 (Phase 1 剩余)
- 状态栏显示当前分支名（StatusBarProvider）
