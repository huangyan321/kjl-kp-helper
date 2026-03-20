import { ProgressLocation, window } from 'vscode'
import { logger } from '../utils'
import { ssoLogin, getCurrentUser } from '../services/KpApiClient'
import { saveAuth, isLoggedIn, saveUser } from '../auth/AuthService'
import { taskTreeProvider } from '../providers/TaskTreeProvider'

export async function loginCommand(): Promise<void> {
  if (isLoggedIn()) {
    window.showInformationMessage(`当前已登录`)
    return
  }

  const uid = await window.showInputBox({
    title: '登录 KA 平台 (1/2)',
    placeHolder: '请输入账号（工号）',
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? null : '账号不能为空',
  })
  if (!uid?.trim())
    return

  const pswd = await window.showInputBox({
    title: '登录 KA 平台 (2/2)',
    placeHolder: '请输入密码',
    password: true,
    ignoreFocusOut: true,
    validateInput: v => v?.trim() ? null : '密码不能为空',
  })
  if (!pswd?.trim())
    return

  await window.withProgress(
    { location: ProgressLocation.Notification, title: 'Task Branch: 正在登录...' },
    async () => {
      try {
        const cookie = await ssoLogin(uid.trim(), pswd.trim())
        if (!cookie) {
          window.showErrorMessage('登录失败：服务端未返回 Cookie，请检查账号密码')
          return
        }
        await saveAuth(cookie)

        const user = await getCurrentUser()
        if (!user) {
          window.showErrorMessage('登录失败：无法获取用户信息，Cookie 可能无效')
          return
        }
        await saveUser(user)
        
        taskTreeProvider.refresh()

        const displayName = user.name || user.ldap || user.username || uid
        window.showInformationMessage(`欢迎您，${displayName}`)
        logger.info(`Logged in as: ${JSON.stringify(user)}`)
      }
      catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || '网络错误'
        window.showErrorMessage(`登录失败：${msg}`)
        logger.error('Login error:', err)
      }
    },
  )
}
