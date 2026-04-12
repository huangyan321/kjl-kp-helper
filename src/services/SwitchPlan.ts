export type DirtyStrategy = 'stash' | 'discard'

export interface SwitchBranchRequest {
  taskTitle: string
  branchName: string
}

export interface SwitchPlan {
  taskTitle: string
  branchName: string
  strategy: DirtyStrategy
  steps: string[]
}

export interface SwitchExecutor {
  execute(plan: SwitchPlan): Promise<string>
}

export function buildSwitchPlan(request: SwitchBranchRequest, strategy: DirtyStrategy): SwitchPlan {
  const strategyStep = strategy === 'stash'
    ? '检测到脏工作区：执行 stash（模拟）'
    : '检测到脏工作区：放弃本地修改（模拟）'

  return {
    taskTitle: request.taskTitle,
    branchName: request.branchName,
    strategy,
    steps: [
      `校验当前分支是否为目标分支：${request.branchName}`,
      '检查工作区状态（模拟）',
      strategyStep,
      `切换到目标分支（模拟）：${request.branchName}`,
      '刷新 TreeView / 状态栏（模拟）',
    ],
  }
}

class MockSwitchExecutor implements SwitchExecutor {
  async execute(plan: SwitchPlan): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 180))

    const actionDesc = plan.strategy === 'stash'
      ? '已模拟 stash 后切换'
      : '已模拟放弃修改后切换'

    return `${actionDesc}：${plan.taskTitle} -> ${plan.branchName}`
  }
}

export const mockSwitchExecutor = new MockSwitchExecutor()
