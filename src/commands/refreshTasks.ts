import { window } from 'vscode'
import { isLoggedIn } from '../auth/AuthService'
import { taskTreeProvider } from '../providers/TaskTreeProvider'

export async function refreshTasksCommand(): Promise<void> {
  if (!isLoggedIn()) {
    window.showWarningMessage('请先登录后再刷新任务列表')
    return
  }

  await taskTreeProvider.loadTasks('ready')
  window.showInformationMessage('任务列表已刷新（MVP Mock 数据）')
}
