## starter-vscode (Kaptain Helper 插件) — 工作状态记录
更新日期：2026-04-12

### 已完成功能
- 登录/登出、Cookie 持久化（globalState）、restoreAuth 激活恢复登录态
- 401 自动清除 Cookie + 弹窗提示「立即登录」（KpApiClient.ts 响应拦截器）
- TreeView 三态（loading/empty/error），error 时弹窗显示具体错误原因（window.showErrorMessage）
- 真实 KA 数据接入：迭代列表 → 父级任务列表 → 关联分支三步聚合，5分钟内存缓存
- simple-git 分支切换：自动按 remote URL 匹配 workspace 文件夹，本地无分支则 fetch + checkout -b
- 多分支任务走 QuickPick 选择，单分支直接切换（带 withProgress 进度提示）
- 手动刷新：invalidateCache() + loadTasks()

### Kaptain 接口清单
- GET  /api/iteration/getIterationList?projectId=269  → data[] (statusName='迭代中' 为当前)
- POST /api/issue/listEasyPage  body: {"search":{"iterationId","leader":"huishi","parentId":0},"order":"id","desc":true} → data.list[]
- GET  /api/issue/changeSet/queryAll?issueKey=SCHOOL-XXXX&subIssue=0 → data.branchChanges[].branch / .repo
- GET  /api/user/current → { currentUser:{}, data:{ldapId,name} }（ldapId 是 ldap 字段）

### 关键文件
- src/services/KpApiClient.ts   — axios 客户端 + 401 拦截 + 4个 API 方法
- src/services/TaskService.ts   — KaTaskSource（缓存聚合）+ TaskService 门面
- src/services/GitService.ts    — switchBranch / getCurrentBranch / findFolderByRemote
- src/commands/switchBranchMock.ts — 真实 git 切换（已去除 Mock）
- src/commands/refreshTasks.ts  — invalidateCache + loadTasks
- src/providers/TaskTreeProvider.ts — loadTasks catch 打印具体错误

### 当前用户信息（测试用）
- ldapId: huishi，projectId: 269，当前迭代 Sprint101 (id=11799)

### 已知问题
- pnpm install 因 @vscode/vsce 依赖 semver trust 降级报错，改用 npm install simple-git --save 绕过
- pnpm install --trust-policy=allow-all 也可以解决（未验证）
- 依赖更新命令：pnpm run update（生成 meta.ts），不要用 pnpm update

### 下一步 (Phase 1 剩余)
- 状态栏显示当前分支名（StatusBarProvider）
- `isCurrent` 字段目前始终 false，需在 loadTasks 后用 GitService.getCurrentBranch 对比更新
- 401 清除 Cookie 后 viewsWelcome 未必立即刷新（需确认 kpHelperLogin context 已更新）
