## starter-vscode (Kaptain Helper 插件) — 工作状态记录
更新日期：2026-04-15

### 已完成功能
- 登录/登出、Cookie 持久化（globalState）、restoreAuth 激活恢复登录态
- 401 自动清除 Cookie + 弹窗提示「立即登录」，authHooks.onExpired 刷新 TreeView
- TreeView 三态（loading/empty/error）
- 真实 KA 数据接入：迭代列表 → 所有任务（含子任务）→ 补充父任务 → 关联分支并发聚合
- 任务获取逻辑：取 leader 所有任务（含子任务），子任务 parentId!=0 则 listIssuesByIds 补查父任务，去重后展示
- 并发控制：pLimit 内置实现，kpHelper.fetchConcurrency 配置（默认5，范围1-20）
- simple-git 分支切换：脏工作区检测（弹窗「暂存并切换」/「取消」），自动 git stash
- switchBranch 返回值：string（成功路径）| 'already'（已在该分支）| undefined（用户取消）
- 切换进度用 ProgressLocation.Window（状态栏），不抢焦点，TreeView 立即响应
- 切换成功后 refreshBranchStatus() 仅更新 isCurrent（重新调 getWorkspaceBranchInfo），不重请求接口
- isCurrent repo-aware：有 repo 字段只与对应 folder 当前分支比对
- 活跃项目过滤：watchActiveEditor 实时切换
- 任务列表优先级前缀：P0/P1/P2（行首）
- 状态圆点（description 前）：🟡开发中/进行中/联调 🔵开发完成/待发布 🟣测试中/提测 🟢已完成/关闭/拒绝
- 当前分支任务高亮：FileDecoration badge=▶（绿色），原状态图标（sync/circle-outline/pass）不变
- 非当前分支任务：badge 为空，badgeColor 使用状态颜色（COLOR_IDS 映射）
- 任务 tooltip：[状态文字]\n[label1] [label2]（来自 devProcessItemList[].detail.label 非空项）
- 右键任务菜单「在 Kaptain 中打开」（view/item/context, group: navigation@1）
  URL: {baseUrl}/project/detail/sprint/detail?projectId=X&sprint={iterationId}&key={task.key}&filterId={task.filterId}
- filterId：fetchSprints 时调一次 getFilterId(ldap) 写入所有 TaskInfo，缓存复用
- 打包修复：tsdown.config.ts 加 noExternal:['axios','simple-git','reactive-vscode']，产物 617KB

### Kaptain 接口清单
- GET  /api/iteration/getIterationList?projectId=269
- POST /api/issue/listEasyPage  {search:{iterationId,leader},order:'id',desc:true} → data.list[]
- POST /api/issue/listEasyPage  {search:{iterationId,ids:[...]}} → 按id批量查
- GET  /api/issue/changeSet/queryAll?issueKey=SCHOOL-XXXX&subIssue=0 → data.branchChanges[]
- GET  /api/user/current → {data:{ldapId,name}}
- GET  /api/issue/board/checkFilter?value={"search":{"leader":"xxx"},"order":"id","desc":true} → data(filterId)

### KaBranchChange 结构
```
{ branch, serviceName, repo, serviceType:'WEB'|'BACKEND',
  devProcessItemList:[{ actionType:'MR'|'CODE_REVIEW'|'MERGE', detail:{actionStatus,label,mrUrl,...} }] }
```

### TaskInfo / BranchInfo 关键字段
```ts
TaskInfo: { id, key, title, status, statusName, priorityName, iterationId, filterId, kaUrl, branches }
BranchInfo: { name, isCurrent, repo?, serviceName?, processLabels: string[] }
```

### makeTaskUri URI 格式
`kphelper-task:/<colorKey|'none'>/<taskId>/<isActive:0|1>`
- isActive=1 → badge='▶' + 绿色
- isActive=0 且有 colorKey → badgeColor=状态色（无 badge）

### 关键文件
- src/services/KpApiClient.ts   — axios客户端、getFilterId、listIssues/listIssuesByIds/getChangeSet
- src/services/TaskService.ts   — pLimit并发、fetchSprints聚合（父任务补充、filterId预取）
- src/services/GitService.ts    — switchBranch(返回 string|'already'|undefined)、getWorkspaceBranchInfo
- src/commands/switchBranch.ts — doSwitchBranch(ProgressLocation.Window)、taskPrimaryActionCommand
- src/commands/openInKaptain.ts — 右键跳转，读 task.filterId/iterationId/key
- src/providers/TaskTreeProvider.ts — loadTasks、refreshBranchStatus、watchActiveEditor
- src/providers/TaskDecorationProvider.ts — makeTaskUri(taskId,colorKey|null,isActive)、badge逻辑

### package.json 配置项
- kpHelper.kaBaseUrl（默认 https://kaptain.qunhequnhe.com）
- kpHelper.projectId（默认 269）
- kpHelper.cacheTimeout（默认 300s）
- kpHelper.fetchConcurrency（默认5，范围1-20）

### 当前用户信息（测试用）
- ldapId: huishi，projectId: 269

### 已知问题
- pnpm install 因 @vscode/vsce 依赖报错，改用 npm install --save 绕过
- 依赖更新命令：pnpm run update（生成 meta.ts），不要用 pnpm update
- tsconfig.json 已加 "types": ["node"]

### 下一步
- 状态栏显示当前分支名（StatusBarProvider）
