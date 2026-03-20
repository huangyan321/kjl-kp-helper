import axios from 'axios'
import { workspace } from 'vscode'
import { state, type KaUser } from '../state'

const SSO_BASE = 'https://kuauth.kujiale.com'

function getKaBaseUrl(): string {
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
  (err) => {
    // 不在这里弹错误，由调用方决定如何处理
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
