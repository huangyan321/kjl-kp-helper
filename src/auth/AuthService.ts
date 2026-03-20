import { commands } from 'vscode'
import { state,KaUser } from '../state'

const COOKIE_KEY = 'kpTaskCookie'
const USER_KEY = 'kpTaskUser'

/** 插件激活时从 globalState 恢复登录态（同步，不阻塞激活） */
export function restoreAuth(): void {
  const cookie = state.context.globalState.get<string>(COOKIE_KEY) ?? ''
  const user = state.context.globalState.get<KaUser>(USER_KEY) ?? null
  state.cookie = cookie
  state.user = user
  // 异步同步登录 context，不阻塞
  syncLoginContext()
}

/** 保存登录凭证到 globalState */
export async function saveAuth(cookie: string): Promise<void> {
  state.context.globalState.setKeysForSync([COOKIE_KEY])
  await state.context.globalState.update(COOKIE_KEY, cookie)
  state.cookie = cookie
  await syncLoginContext()
}

export async function saveUser(user: KaUser): Promise<void> {
  state.context.globalState.setKeysForSync([USER_KEY])
  await state.context.globalState.update(USER_KEY, user)
  state.user = user
}

/** 清除所有凭证（退出登录） */
export async function clearAuth(): Promise<void> {
  await state.context.globalState.update(COOKIE_KEY, '')
  state.cookie = ''
  await syncLoginContext()
}

export async function clearUser(): Promise<void> {
  await state.context.globalState.update(USER_KEY, null)
  state.user = null
}

/** 是否已登录 */
export function isLoggedIn(): boolean {
  return !!state.cookie
}

/** 通过 VSCode context 控制视图的 when 条件 */
function syncLoginContext(): Thenable<unknown> {
  return commands.executeCommand('setContext', 'kpHelperLogin', isLoggedIn())
}
