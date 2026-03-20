import { EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode'
import { isLoggedIn } from '../auth/AuthService'
import { state } from '../state'

type TreeNode = TreeItem

export class TaskTreeProvider implements TreeDataProvider<TreeNode> {
  private _onChange = new EventEmitter<TreeNode | undefined>()
  readonly onDidChangeTreeData = this._onChange.event

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

    // MVP 占位 —— Phase 2 替换为真实任务列表
    const name = state.user?.name || state.user?.ldap || state.user?.username || ''
    const hint = new TreeItem(`已登录：${name}`, TreeItemCollapsibleState.None)
    hint.iconPath = new ThemeIcon('account')
    hint.tooltip = '任务列表功能开发中，即将上线'

    const placeholder = new TreeItem('任务列表开发中 🚧', TreeItemCollapsibleState.None)
    placeholder.iconPath = new ThemeIcon('info')
    placeholder.tooltip = 'Phase 2 将展示 KA 迭代任务与绑定分支'

    return [hint, placeholder]
  }
}

export const taskTreeProvider = new TaskTreeProvider()
