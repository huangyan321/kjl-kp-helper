import { window } from 'vscode'
import { isLoggedIn } from '../auth/AuthService'
import { taskService } from '../services/TaskService'
import { taskTreeProvider } from '../providers/TaskTreeProvider'

export async function refreshTasksCommand(): Promise<void> {
  if (!isLoggedIn()) {
    window.showWarningMessage('请先登录后再刷新任务列表')
    return
  }

  taskService.invalidateCache()
  await taskTreeProvider.loadTasks()
  window.showInformationMessage('任务列表已刷新')
}
