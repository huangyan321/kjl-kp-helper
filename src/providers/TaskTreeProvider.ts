import { Disposable, EventEmitter, ThemeColor, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri, window, workspace } from 'vscode'
import { isLoggedIn } from '../auth/AuthService'
import { getWorkspaceBranchInfo, type FolderBranchInfo } from '../services/GitService'
import { type TaskInfo, taskService, type SprintInfo } from '../services/TaskService'
import { state } from '../state'
import { logger } from '../utils'
import { getTaskColorKey, makeTaskUri, getPriorityLevelFromName, PriorityLevel } from './TaskDecorationProvider'

type RootState = 'loading' | 'empty' | 'error' | 'ready'

type TreeNode = TreeItem | SprintNode | TaskNode

class SprintNode extends TreeItem {
  constructor(readonly sprint: SprintInfo, readonly isCurrentSprint: boolean) {
    super(`迭代 ${sprint.name}`, TreeItemCollapsibleState.Expanded)
    this.iconPath = new ThemeIcon('calendar')
    this.contextValue = 'kpHelper.sprint'
    if (isCurrentSprint)
      this.description = '进行中'
  }
}

class TaskNode extends TreeItem {
  constructor(readonly task: TaskInfo) {
    const level = getPriorityLevelFromName(task.priorityName)
    const priorityPrefix = level === PriorityLevel.P0 ? 'P0 ' : level === PriorityLevel.P1 ? 'P1 ' : 'P2 '
    super(priorityPrefix + task.title, task.branches.length > 1 ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None)
    const statusText = task.statusName ? `[${task.statusName}]` : getStatusText(task.status)
    const dot = getStatusDot(task.statusName)
    this.description = task.branches.length > 0
      ? `${dot}${statusText} · ${task.branches[0].name}`
      : `${dot}${statusText}`
    this.tooltip = `${statusText}\n点击切换分支`
    this.iconPath = new ThemeIcon(getStatusIcon(task.status))
    this.contextValue = 'kpHelper.task'
    const colorKey = getTaskColorKey(task.statusName)
    if (colorKey !== null) {
      this.resourceUri = makeTaskUri(task.id, colorKey)
    }
    this.command = {
      command: 'kpHelper.taskPrimaryAction',
      title: 'Task Primary Action',
      arguments: [task],
    }
  }
}

/** 根据状态名返回彩色圆点前缀 */
function getStatusDot(statusName: string): string {
  if (!statusName) return ''
  const devDone = ['开发完成', '待发布']
  const testing = ['待测试', '测试中', '提测']
  const inProgress = ['开发中', '进行中', '联调']
  const done = ['已完成', '已关闭', '关闭', '取消', '已拒绝', '拒绝']
  if (devDone.some(k => statusName.includes(k))) return '🔵 '
  if (testing.some(k => statusName.includes(k))) return '🟣 '
  if (inProgress.some(k => statusName.includes(k))) return '🟡 '
  if (done.some(k => statusName.includes(k))) return '🟢 '
  return ''
}

function getStatusText(status: TaskInfo['status']): string {
  if (status === 'in_progress')
    return '[进行中]'
  if (status === 'todo')
    return '[待开发]'
  return '[已完成]'
}

function getStatusIcon(status: TaskInfo['status']): string {
  if (status === 'in_progress')
    return 'sync'
  if (status === 'todo')
    return 'circle-outline'
  return 'pass'
}

function createInfoNode(label: string, tooltip?: string, icon = 'info'): TreeItem {
  const node = new TreeItem(label, TreeItemCollapsibleState.None)
  node.iconPath = new ThemeIcon(icon)
  if (tooltip)
    node.tooltip = tooltip
  return node
}

// ─── 活跃项目 / 仓库匹配 ───────────────────────────────────────

function parseRepoPath(url: string): string {
  return url
    .replace(/\.git$/, '')
    .replace(/^git@[^:]+:/, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^github:/, '')
    .toLowerCase()
}

function repoMatches(a: string, b: string): boolean {
  const pa = parseRepoPath(a)
  const pb = parseRepoPath(b)
  // 全路径相等，或仓库名（最后一段）相等
  return pa === pb || pa.split('/').pop() === pb.split('/').pop()
}

async function getActiveProjectRepo(): Promise<string | undefined> {
  const activeEditor = window.activeTextEditor
  if (!activeEditor) return undefined
  const folder = workspace.getWorkspaceFolder(activeEditor.document.uri)
  if (!folder) return undefined
  try {
    const pkgUri = Uri.joinPath(folder.uri, 'package.json')
    const bytes = await workspace.fs.readFile(pkgUri)
    const pkg = JSON.parse(Buffer.from(bytes).toString('utf8'))
    const repo = pkg.repository
    if (!repo) return undefined
    return typeof repo === 'string' ? repo : (repo.url as string | undefined)
  }
  catch {
    return undefined
  }
}

/**
 * 按活跃项目仓库过滤任务：
 * - 未绑定任何仓库的任务（branches 里没有 repo 字段）始终显示
 * - 绑定了仓库的任务，只显示匹配当前活跃项目的
 * - activeRepo 为空时不过滤
 */
function filterTasksByRepo(tasks: TaskInfo[], activeRepo: string | undefined): TaskInfo[] {
  if (!activeRepo) return tasks
  return tasks.filter((task) => {
    const boundBranches = task.branches.filter(b => !!b.repo)
    if (boundBranches.length === 0) return true
    return boundBranches.some(b => repoMatches(b.repo!, activeRepo))
  })
}

/**
 * Repo-aware isCurrent 更新：
 * - branch.repo 有值时，只与 remote URL 匹配的 workspace folder 的当前分支比对
 * - branch.repo 为空时，任意 workspace folder 命中都算
 */
function updateIsCurrent(sprints: SprintInfo[], folderInfos: FolderBranchInfo[]): void {
  // 兜底：没有 remote 信息时用的全局集合
  const allCurrentBranches = new Set(folderInfos.map(f => f.branch))

  for (const sprint of sprints) {
    for (const task of sprint.tasks) {
      for (const branch of task.branches) {
        if (branch.repo) {
          const matched = folderInfos.find(f =>
            f.remotes.some(r => repoMatches(r, branch.repo!)),
          )
          branch.isCurrent = matched?.branch === branch.name
        }
        else {
          branch.isCurrent = allCurrentBranches.has(branch.name)
        }
      }
    }
  }
}

export class TaskTreeProvider implements TreeDataProvider<TreeNode> {
  private _onChange = new EventEmitter<TreeNode | undefined>()
  readonly onDidChangeTreeData = this._onChange.event
  private state: RootState = 'loading'
  private sprints: SprintInfo[] = []
  private activeProjectRepo: string | undefined = undefined

  async loadTasks(): Promise<void> {
    this.state = 'loading'
    this.refresh()

    try {
      const sprints = await taskService.getSprints()
      if (sprints.length === 0) {
        this.state = 'empty'
        this.sprints = []
        this.refresh()
        return
      }

      // 更新 isCurrent：repo-aware 匹配（有 repo 字段时只与对应项目的当前分支比对）
      const folderBranchInfos = await getWorkspaceBranchInfo()
      updateIsCurrent(sprints, folderBranchInfos)

      this.state = 'ready'
      this.sprints = sprints
      this.activeProjectRepo = await getActiveProjectRepo()
      this.refresh()
    }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('loadTasks failed:', msg)
      window.showErrorMessage(`任务加载失败：${msg}`)
      this.state = 'error'
      this.sprints = []
      this.refresh()
    }
  }

  refresh(): void {
    this._onChange.fire(undefined)
  }

  /** 监听活跃编辑器变化，切换项目文件时自动重新过滤任务列表 */
  watchActiveEditor(): Disposable {
    return window.onDidChangeActiveTextEditor(async () => {
      if (this.state !== 'ready') return
      this.activeProjectRepo = await getActiveProjectRepo()
      this.refresh()
    })
  }

  getTreeItem(element: TreeNode): TreeItem {
    return element
  }

  getChildren(_element?: TreeNode): TreeNode[] {
    if (!isLoggedIn()) {
      // viewsWelcome 接管了未登录的展示，这里返回空
      return []
    }

    if (!_element) {
      const name = state.user?.name || state.user?.ldap || state.user?.username || '当前用户'
      const identity = createInfoNode(`已登录：${name}`, 'Kaptain 任务助手', 'account')

      if (this.state === 'loading') {
        return [identity, createInfoNode('正在拉取任务...', '请稍候', 'loading~spin')]
      }

      if (this.state === 'error') {
        const err = createInfoNode('任务加载失败', '请检查网络或重新登录，然后点击刷新按钮', 'error')
        return [identity, err]
      }

      if (this.state === 'empty') {
        return [identity, createInfoNode('当前迭代暂无任务', '请点击顶部刷新按钮重新加载', 'inbox')]
      }

      const visibleSprints = this.sprints
        .map((s, idx) => ({ sprint: s, isFirst: idx === 0 }))
        .filter(({ sprint }) => filterTasksByRepo(sprint.tasks, this.activeProjectRepo).length > 0)

      if (visibleSprints.length === 0) {
        return [identity, createInfoNode('当前项目暂无匹配任务', '切换到其他项目文件，或刷新任务列表', 'inbox')]
      }

      const nodes = visibleSprints.map(({ sprint, isFirst }) => new SprintNode(sprint, isFirst))
      return [identity, ...nodes]
    }

    if (_element instanceof SprintNode) {
      const tasks = filterTasksByRepo(_element.sprint.tasks, this.activeProjectRepo)
      return tasks.map(task => new TaskNode(task))
    }

    if (_element instanceof TaskNode) {
      return _element.task.branches.map((branch) => {
        const node = new TreeItem(branch.name, TreeItemCollapsibleState.None)
        node.contextValue = 'kpHelper.branch'
        node.iconPath = branch.isCurrent
          ? new ThemeIcon('git-branch', new ThemeColor('charts.green'))
          : new ThemeIcon('source-control')
        node.description = branch.isCurrent ? '当前分支' : '点击切换'
        node.tooltip = branch.isCurrent
          ? `当前所在分支：${branch.name}`
          : `点击切换到 ${branch.name}`
        node.command = {
          command: 'kpHelper.switchBranchMock',
          title: 'Switch Branch',
          arguments: [{ taskTitle: _element.task.title, branchName: branch.name, isCurrent: branch.isCurrent }],
        }
        return node
      })
    }

    return []
  }
}

export const taskTreeProvider = new TaskTreeProvider()
