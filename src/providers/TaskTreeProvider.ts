import { EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, window } from 'vscode'
import { isLoggedIn } from '../auth/AuthService'
import { type TaskInfo, taskService, type SprintInfo } from '../services/TaskService'
import { state } from '../state'
import { logger } from '../utils'

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
    super(task.title, task.branches.length > 1 ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None)
    const statusText = task.statusName ? `[${task.statusName}]` : getStatusText(task.status)
    this.description = task.branches.length > 0
      ? `${statusText} · ${task.branches[0].name}`
      : statusText
    this.tooltip = `${statusText}\n点击切换分支`
    this.iconPath = new ThemeIcon(getStatusIcon(task.status))
    this.contextValue = 'kpHelper.task'
    this.command = {
      command: 'kpHelper.taskPrimaryAction',
      title: 'Task Primary Action',
      arguments: [task],
    }
  }
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

export class TaskTreeProvider implements TreeDataProvider<TreeNode> {
  private _onChange = new EventEmitter<TreeNode | undefined>()
  readonly onDidChangeTreeData = this._onChange.event
  private state: RootState = 'loading'
  private sprints: SprintInfo[] = []

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

      this.state = 'ready'
      this.sprints = sprints
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
      const identity = createInfoNode(`已登录：${name}`, 'MVP 阶段使用 mock 任务与分支交互', 'account')

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

      const nodes = this.sprints.map((s, idx) => new SprintNode(s, idx === 0))
      return [identity, ...nodes]
    }

    if (_element instanceof SprintNode) {
      return _element.sprint.tasks.map(task => new TaskNode(task))
    }

    if (_element instanceof TaskNode) {
      return _element.task.branches.map((branch) => {
        const node = new TreeItem(branch.name, TreeItemCollapsibleState.None)
        node.contextValue = 'kpHelper.branch'
        node.iconPath = new ThemeIcon(branch.isCurrent ? 'git-branch' : 'source-control')
        node.description = branch.isCurrent ? '当前分支' : '点击模拟切换'
        node.tooltip = branch.isCurrent
          ? `当前所在分支：${branch.name}`
          : `点击后将模拟切换到 ${branch.name}`
        node.command = {
          command: 'kpHelper.switchBranchMock',
          title: 'Switch Branch (Mock)',
          arguments: [{ taskTitle: _element.task.title, branchName: branch.name, isCurrent: branch.isCurrent }],
        }
        return node
      })
    }

    return []
  }
}

export const taskTreeProvider = new TaskTreeProvider()
