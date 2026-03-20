import { defineExtension, useCommand } from 'reactive-vscode'
import { window } from 'vscode'
import { state } from './state'
import { restoreAuth } from './auth/AuthService'
import { loginCommand } from './commands/login'
import { logoutCommand } from './commands/logout'
import { taskTreeProvider } from './providers/TaskTreeProvider'
import { logger } from './utils'

const { activate, deactivate } = defineExtension((ctx) => {
  state.context = ctx

  // 注册 TreeView
  const treeView = window.createTreeView('kpHelperPanel', {
    treeDataProvider: taskTreeProvider,
    showCollapseAll: false,
  })
  ctx.subscriptions.push(treeView)

  // 注册命令
  useCommand('kpHelper.login', loginCommand)
  useCommand('kpHelper.logout', logoutCommand)

  // 恢复登录态（同步读取 globalState，异步更新 context key）
  restoreAuth()

  logger.info('Kaptain Helper activated')
})

export { activate, deactivate }
