import { workspace } from 'vscode'
import { getIterationList, listIssues, getChangeSet, getKaBaseUrl, type KaIssue } from './KpApiClient'
import { state } from '../state'

export type TaskStatus = 'in_progress' | 'todo' | 'done'
export type TaskLoadMode = 'ready' | 'empty' | 'error'

export interface BranchInfo {
  name: string
  isCurrent: boolean
  repo?: string        // git remote URL，用于匹配工作区文件夹
  serviceName?: string // Kaptain 中的服务名
}

export interface TaskInfo {
  id: string
  key: string  // Kaptain issue key，如 "SCHOOL-8912"
  title: string
  status: TaskStatus
  statusName: string
  kaUrl: string
  branches: BranchInfo[]
}

export interface SprintInfo {
  id: string
  name: string
  tasks: TaskInfo[]
}

export interface TaskSource {
  fetchSprints(): Promise<SprintInfo[]>
  invalidate(): void
}

// ─── 状态映射 ─────────────────────────────────────────────────

const IN_PROGRESS_KEYWORDS = ['开发中', '进行中', '测试中', '提测', '待发布', '联调']

function mapStatus(issue: KaIssue): TaskStatus {
  if (issue.isDone) return 'done'
  for (const kw of IN_PROGRESS_KEYWORDS) {
    if (issue.statusName?.includes(kw)) return 'in_progress'
  }
  return 'todo'
}

function getLdap(): string {
  return (
    state.user?.ldapId
    || state.user?.ldap
    || state.user?.username
    || ''
  )
}

// ─── 真实 KA 数据源（含缓存） ───────────────────────────────────

interface CacheEntry {
  data: SprintInfo[]
  fetchedAt: number
}

class KaTaskSource implements TaskSource {
  private cache: CacheEntry | null = null

  invalidate(): void {
    this.cache = null
  }

  private getCacheTtlMs(): number {
    const seconds = workspace.getConfiguration().get<number>('kpHelper.cacheTimeout') ?? 300
    return seconds * 1000
  }

  async fetchSprints(): Promise<SprintInfo[]> {
    // 未登录直接返回空
    if (!state.cookie) return []

    // 命中缓存
    const ttl = this.getCacheTtlMs()
    if (this.cache && ttl > 0 && Date.now() - this.cache.fetchedAt < ttl) {
      return this.cache.data
    }

    const ldap = getLdap()
    if (!ldap) throw new Error('未获取到当前用户 ldap，请重新登录')

    const projectId = workspace.getConfiguration().get<number>('kpHelper.projectId') ?? 269

    // 1. 获取迭代列表，取「迭代中」状态的（最多 2 个）
    const iterations = await getIterationList(projectId)
    let currentIterations = iterations.filter(it => it.statusName === '迭代中').slice(0, 2)

    // 兜底：没有迭代中的，取最近一个
    if (currentIterations.length === 0) {
      const sorted = [...iterations].sort((a, b) => b.id - a.id)
      if (sorted[0]) currentIterations = [sorted[0]]
    }

    const sprints: SprintInfo[] = []

    for (const iter of currentIterations) {
      // 2. 获取当前用户在该迭代下的父级任务
      const issues = await listIssues(iter.id, ldap)

      // 3. 逐个获取关联分支（顺序执行，避免请求并发过多）
      const tasks: TaskInfo[] = []
      for (const issue of issues) {
        const branchChanges = await getChangeSet(issue.key)
        tasks.push({
          id: String(issue.id),
          key: issue.key,
          title: issue.name,
          status: mapStatus(issue),
          statusName: issue.statusName ?? '',
          kaUrl: `${getKaBaseUrl()}/project/${issue.iterationId}/issue/${issue.key}`,
          branches: branchChanges
            .filter(b => !!b.branch)
            .map(b => ({
              name: b.branch,
              isCurrent: false, // 待 GitService 刷新时更新
              repo: b.repo,
              serviceName: b.serviceName,
            })),
        })
      }

      sprints.push({ id: String(iter.id), name: iter.name, tasks })
    }

    this.cache = { data: sprints, fetchedAt: Date.now() }
    return sprints
  }
}

// ─── TaskService 门面 ──────────────────────────────────────────

class TaskService {
  private source: TaskSource = new KaTaskSource()

  /** 手动失效缓存后重新拉取 */
  invalidateCache(): void {
    this.source.invalidate()
  }

  async getSprints(): Promise<SprintInfo[]> {
    return this.source.fetchSprints()
  }
}

export const taskService = new TaskService()
