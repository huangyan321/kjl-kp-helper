import { window } from 'vscode'
import { state } from '../state'
import { clearAuth, clearUser, isLoggedIn } from '../auth/AuthService'
import { taskTreeProvider } from '../providers/TaskTreeProvider'

export async function logoutCommand(): Promise<void> {
  if (!isLoggedIn()) {
    window.showWarningMessage('当前未登录')
    return
  }

  const name = state.user?.name || state.user?.ldap || state.user?.username || '当前用户'
  const res = await window.showInformationMessage(
    `确认退出登录？（${name}）`,
    { modal: true },
    '确认退出',
  )

  if (res === '确认退出') {
    await clearAuth()
    await clearUser()
    taskTreeProvider.refresh()
    window.showInformationMessage('已退出登录')
  }
}
