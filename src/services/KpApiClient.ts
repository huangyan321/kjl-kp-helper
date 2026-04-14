import axios from 'axios'
import { commands, window, workspace } from 'vscode'
import { state, type KaUser } from '../state'

const SSO_BASE = 'https://kuauth.kujiale.com'

/** 插件初始化时注入，避免循环依赖 */
export const authHooks = {
  onExpired: undefined as (() => void) | undefined,
}

export function getKaBaseUrl(): string {
  return workspace.getConfiguration().get<string>('kpHelper.kaBaseUrl') ?? 'https://kaptain.qunhequnhe.com'
}

/** 用于 SSO 登录的独立客户端（不携带 cookie 拦截） */
const ssoClient = axios.create({ baseURL: SSO_BASE })

/** 用于 KA 业务接口的客户端 */
export const kaClient = axios.create()

kaClient.interceptors.request.use((req) => {
  // 动态读取 baseURL，允许用户配置后立即生效
  req.baseURL = getKaBaseUrl()
  if (state.cookie) {
    req.headers.cookie = state.cookie
  }
  return req
})

kaClient.interceptors.response.use(
  res => res,
  async (err) => {
    if (err?.response?.status === 401) {
      // 清除失效的 Cookie，提示重新登录
      state.cookie = ''
      await state.context.globalState.update('kpTaskCookie', '')
      await commands.executeCommand('setContext', 'kpHelperLogin', false)
      authHooks.onExpired?.()
      const action = await window.showErrorMessage(
        'Kaptain 登录态已过期，请重新登录',
        '立即登录',
      )
      if (action === '立即登录') {
        await commands.executeCommand('kpHelper.login')
      }
      return Promise.reject(new Error('登录态已过期，请重新登录'))
    }
    return Promise.reject(err)
  },
)

/**
 * SSO 登录，返回 cookie 字符串；失败返回 null
 */
export async function ssoLogin(uid: string, pswd: string): Promise<string | null> {
  const res = await ssoClient.post('/api/ssologin', { uid, pswd })
  const setCookie: string[] | undefined = res.headers['set-cookie']
  if (!setCookie || setCookie.length === 0) {
    return null
  }
  // 拼接所有 cookie 片段，只保留 name=value 部分
  return setCookie
    .map(c => c.split(';')[0])
    .join('; ')
}

/**
 * 获取当前登录用户信息（用于验证 cookie 有效性）
 * 接口：GET /api/user/current
 */
export async function getCurrentUser(): Promise<KaUser | null> {
  const res = await kaClient.get('/api/user/current')
  const data = res.data
  // 兼容多种响应结构
  if (data?.data && typeof data.data === 'object') return data.data
  if (data?.result && typeof data.result === 'object') return data.result
  if (typeof data === 'object' && (data.name || data.ldap || data.username)) return data
  return null
}

// ─── Kaptain 业务接口类型 ─────────────────────────────────────

export interface KaIteration {
  id: number
  name: string
  projectId: number
  statusName: string // '迭代中' | '未开始' | '已结束'
  startTime: number
  endTime: number
}

export interface KaIssue {
  id: number
  key: string // e.g. "SCHOOL-8912"
  name: string
  statusName: string
  isDone: boolean
  priorityName?: string // e.g. 'P0', 'P1', 'P2', '紧急', '高' 等
  leader?: string
  developer?: string
  iterationId: number
  parentId: number
}

export interface KaBranchChange {
  branch: string
  serviceName: string
  repo: string // git remote URL, e.g. "git@gitlab.qunhequnhe.com:fe/up/xxx.git"
  serviceType: string // 'WEB' | 'BACKEND'
}

// ─── Kaptain 业务接口方法 ─────────────────────────────────────

/**
 * 获取过滤器 ID
 * GET /api/issue/board/checkFilter
 */
export async function getFilterId(leaderLdap: string): Promise<number | null> {
  const res = await kaClient.get('/api/issue/board/checkFilter', {
    params: { value: JSON.stringify({ search: { leader: leaderLdap }, order: 'id', desc: true }) },
  })
  return res.data?.data ?? null
}

/**
 * 获取迭代列表
 * GET /api/iteration/getIterationList?projectId=X
 */
export async function getIterationList(projectId: number): Promise<KaIteration[]> {
  const res = await kaClient.get('/api/iteration/getIterationList', { params: { projectId } })
  return res.data?.data ?? []
}

/**
 * 获取指定迭代 + 负责人的所有任务（含子任务）
 * POST /api/issue/listEasyPage
 */
export async function listIssues(iterationId: number, leaderLdap: string): Promise<KaIssue[]> {
  const res = await kaClient.post('/api/issue/listEasyPage', {
    search: { iterationId, leader: leaderLdap },
    order: 'id',
    desc: true,
  })
  return res.data?.data?.list ?? []
}

/**
 * 按 ids 批量查任务（用于补充子任务对应的父任务）
 * POST /api/issue/listEasyPage with search.ids
 */
export async function listIssuesByIds(iterationId: number, ids: number[]): Promise<KaIssue[]> {
  if (ids.length === 0) return []
  const res = await kaClient.post('/api/issue/listEasyPage', {
    search: { iterationId, ids },
    order: 'id',
    desc: true,
  })
  return res.data?.data?.list ?? []
}

/**
 * 获取任务关联的仓库分支信息
 * GET /api/issue/changeSet/queryAll?issueKey=SCHOOL-XXXX&subIssue=0
 */
export async function getChangeSet(issueKey: string): Promise<KaBranchChange[]> {
  const res = await kaClient.get('/api/issue/changeSet/queryAll', {
    params: { issueKey, subIssue: 0 },
  })
  return res.data?.data?.branchChanges ?? []
}
