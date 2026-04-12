import { kaClient } from './KpApiClient'

export type TaskStatus = 'in_progress' | 'todo' | 'done'
export type TaskLoadMode = 'ready' | 'empty' | 'error'

export interface BranchInfo {
  name: string
  isCurrent: boolean
}

export interface TaskInfo {
  id: string
  title: string
  status: TaskStatus
  kaUrl: string
  branches: BranchInfo[]
}

export interface SprintInfo {
  id: string
  name: string
  tasks: TaskInfo[]
}

export interface TaskSource {
  fetchSprints(mode?: TaskLoadMode): Promise<SprintInfo[]>
}

class MockTaskSource implements TaskSource {
  async fetchSprints(mode: TaskLoadMode = 'ready'): Promise<SprintInfo[]> {
    await new Promise(resolve => setTimeout(resolve, 320))

    if (mode === 'error') {
      throw new Error('mock source error')
    }

    if (mode === 'empty') {
      return []
    }

    return [
      {
        id: 'sprint-2026-03',
        name: '2026-03（当前迭代）',
        tasks: [
          {
            id: 'task-1001',
            title: '用户中心改版',
            status: 'in_progress',
            kaUrl: 'https://kaptain.qunhequnhe.com/task/1001',
            branches: [
              { name: 'feature/user-center-v2', isCurrent: true },
              { name: 'feature/user-v2', isCurrent: false },
            ],
          },
          {
            id: 'task-1002',
            title: '支付流程优化',
            status: 'todo',
            kaUrl: 'https://kaptain.qunhequnhe.com/task/1002',
            branches: [
              { name: 'feature/payment-opt', isCurrent: false },
            ],
          },
          {
            id: 'task-1003',
            title: '首页性能优化',
            status: 'done',
            kaUrl: 'https://kaptain.qunhequnhe.com/task/1003',
            branches: [
              { name: 'feature/home-perf', isCurrent: false },
            ],
          },
        ],
      },
      {
        id: 'sprint-2026-02',
        name: '2026-02（上个迭代）',
        tasks: [
          {
            id: 'task-0901',
            title: '文档中心搜索增强',
            status: 'done',
            kaUrl: 'https://kaptain.qunhequnhe.com/task/0901',
            branches: [
              { name: 'feature/doc-search-upgrade', isCurrent: false },
            ],
          },
        ],
      },
    ]
  }
}

class KaTaskSource implements TaskSource {
  async fetchSprints(): Promise<SprintInfo[]> {
    // 预留真实接口接入点：后续将 KA 响应转换为 SprintInfo/TaskInfo 结构
    await kaClient.get('/api/user/current')
    return []
  }
}

class TaskService {
  private source: TaskSource = new MockTaskSource()

  useSource(source: TaskSource): void {
    this.source = source
  }

  useMockSource(): void {
    this.source = new MockTaskSource()
  }

  useKaSource(): void {
    this.source = new KaTaskSource()
  }

  async getSprints(mode: TaskLoadMode = 'ready'): Promise<SprintInfo[]> {
    return this.source.fetchSprints(mode)
  }
}

export const taskService = new TaskService()
