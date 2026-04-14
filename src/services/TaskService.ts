import { workspace } from 'vscode'
import { getIterationList, listIssues, listIssuesByIds, getChangeSet, getFilterId, getKaBaseUrl, type KaIssue } from './KpApiClient'
import { state } from '../state'

// ─── 简易并发控制器 ────────────────────────────────────────────

function pLimit(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []
  const next = () => {
    if (active >= concurrency || queue.length === 0) return
    active++
    queue.shift()!()
  }
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => {
          active--
          next()
        })
      })
      next()
    })
  }
}

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
  priorityName: string  // 原始优先级名称，如 'P0'、'P1'、'紧急' 等
  iterationId: number   // 所属迭代 ID，用于生成 Kaptain 链接
  filterId: number | null  // 过滤器 ID，用于生成 Kaptain 链接
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

    // 提前获取 filterId，整个 fetch 共用一次
    const filterId = await getFilterId(ldap)
    
    // 1. 获取迭代列表，取「迭代中」状态的（最多 2 个）
    const iterations = await getIterationList(projectId)
    let currentIterations = iterations.filter(it => it.statusName === '迭代中').slice(0, 2)

    // 兜底：没有迭代中的，取最近一个
    if (currentIterations.length === 0) {
      const sorted = [...iterations].sort((a, b) => b.id - a.id)
      if (sorted[0]) currentIterations = [sorted[0]]
    }

    const sprints: SprintInfo[] = []
    console.time('fetchSprints') // 计时 fetchSprints 总耗时，方便调优和监控
    for (const iter of currentIterations) {
      // 2. 获取当前用户在该迭代下的所有任务（含子任务）
      const allIssues = await listIssues(iter.id, ldap)
      console.log('allIssues', allIssues)

      // 3. 分离顶层任务与子任务，子任务需要补充其父任务
      const topLevelIssues = allIssues.filter(i => i.parentId === 0)
      const subIssues = allIssues.filter(i => i.parentId !== 0)

      // 4. 收集子任务的 parentId（去重，排除已在顶层列表中的）
      const topLevelIds = new Set(topLevelIssues.map(i => i.id))
      const missingParentIds = [...new Set(
        subIssues.map(i => i.parentId).filter(pid => !topLevelIds.has(pid))
      )]

      // 5. 批量查询缺失的父任务
      const parentIssues = await listIssuesByIds(iter.id, missingParentIds)

      // 6. 合并：顶层任务 + 补充的父任务（按 id 去重）
      const issueMap = new Map<number, KaIssue>()
      for (const issue of [...topLevelIssues, ...parentIssues]) {
        issueMap.set(issue.id, issue)
      }
      const issues = [...issueMap.values()]
      
      // 7. 并发获取关联分支（并发数由用户配置 kpHelper.fetchConcurrency 控制）
      const concurrency = workspace.getConfiguration().get<number>('kpHelper.fetchConcurrency') ?? 5
      const limit = pLimit(concurrency)
      const tasks: TaskInfo[] = await Promise.all(
        issues.map(issue => limit(async () => {
          const branchChanges = await getChangeSet(issue.key)
          return {
            id: String(issue.id),
            key: issue.key,
            title: issue.name,
            status: mapStatus(issue),
            statusName: issue.statusName ?? '',
            priorityName: issue.priorityName ?? '',
            iterationId: issue.iterationId,
            filterId,
            kaUrl: `${getKaBaseUrl()}/project/${issue.iterationId}/issue/${issue.key}`,
            branches: branchChanges
              .filter(b => !!b.branch && b.serviceType === 'WEB')
              .map(b => ({
                name: b.branch,
                isCurrent: false,
                repo: b.repo,
                serviceName: b.serviceName,
              })),
          } satisfies TaskInfo
        }))
      )

      sprints.push({ id: String(iter.id), name: iter.name, tasks })
    }
    console.timeEnd('fetchSprints')

    // 更新缓存
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
