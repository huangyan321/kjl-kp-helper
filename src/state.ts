import type { ExtensionContext } from 'vscode'

export interface KaUser {
  name?: string
  ldap?: string
  ldapId?: string // Kaptain 返回的字段名
  username?: string
  email?: string
  [key: string]: unknown
}

export const state = {
  context: null as unknown as ExtensionContext,
  cookie: '',
  user: null as KaUser | null,
}
