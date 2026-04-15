import { defineExtension, useCommand } from 'reactive-vscode'
import { window } from 'vscode'
import { state } from './state'
import { restoreAuth } from './auth/AuthService'
import { loginCommand } from './commands/login'
import { logoutCommand } from './commands/logout'
import { refreshTasksCommand } from './commands/refreshTasks'
import { switchBranchMockCommand, taskPrimaryActionCommand } from './commands/switchBranch'
import { openInKaptainCommand } from './commands/openInKaptain'
import { taskTreeProvider } from './providers/TaskTreeProvider'
import { authHooks } from './services/KpApiClient'
import { TaskDecorationProvider } from './providers/TaskDecorationProvider'
import { logger } from './utils'

const { activate, deactivate } = defineExtension((ctx) => {
  state.context = ctx

  // 401 后刷新 TreeView，使 viewsWelcome 立即生效
  authHooks.onExpired = () => taskTreeProvider.refresh()

  // 注册 TreeView
  const treeView = window.createTreeView('kpHelperPanel', {
    treeDataProvider: taskTreeProvider,
    showCollapseAll: false,
  })
  ctx.subscriptions.push(treeView)
  ctx.subscriptions.push(taskTreeProvider.watchActiveEditor())
  ctx.subscriptions.push(window.registerFileDecorationProvider(new TaskDecorationProvider()))

  // 注册命令
  useCommand('kpHelper.login', loginCommand)
  useCommand('kpHelper.logout', logoutCommand)
  useCommand('kpHelper.refreshTasks', refreshTasksCommand)
  useCommand('kpHelper.taskPrimaryAction', taskPrimaryActionCommand)
  useCommand('kpHelper.switchBranchMock', switchBranchMockCommand)
  useCommand('kpHelper.openInKaptain', openInKaptainCommand)

  // 恢复登录态（同步读取 globalState，异步更新 context key）
  restoreAuth()

  // 登录态恢复后才加载任务（未登录时 loadTasks 返回 empty，视图 welcome 页接管）
  void taskTreeProvider.loadTasks()

  logger.info('Kaptain Helper activated')
})

export { activate, deactivate }
