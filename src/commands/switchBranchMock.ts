import { window } from 'vscode'
import type { BranchInfo, TaskInfo } from '../services/TaskService'
import type { DirtyStrategy } from '../services/SwitchPlan'
import { buildSwitchPlan, mockSwitchExecutor } from '../services/SwitchPlan'

interface SwitchBranchPayload {
  taskTitle: string
  branchName: string
  isCurrent: boolean
}

function branchItems(branches: BranchInfo[]) {
  return branches.map(branch => ({
    label: branch.name,
    description: branch.isCurrent ? '当前分支' : '可切换',
    branch,
  }))
}

export async function taskPrimaryActionCommand(task?: TaskInfo): Promise<void> {
  if (!task) {
    return
  }

  if (task.branches.length === 0) {
    window.showWarningMessage(`任务「${task.title}」未绑定分支（MVP Mock）`)
    return
  }

  if (task.branches.length === 1) {
    await switchBranchMockCommand({
      taskTitle: task.title,
      branchName: task.branches[0].name,
      isCurrent: task.branches[0].isCurrent,
    })
    return
  }

  const picked = await window.showQuickPick(branchItems(task.branches), {
    title: `任务「${task.title}」有多个分支，请选择目标分支`,
    placeHolder: '仅模拟交互，不会执行真实 git 操作',
    ignoreFocusOut: true,
  })

  if (!picked) {
    return
  }

  await switchBranchMockCommand({
    taskTitle: task.title,
    branchName: picked.branch.name,
    isCurrent: picked.branch.isCurrent,
  })
}

export async function switchBranchMockCommand(payload?: SwitchBranchPayload): Promise<void> {
  if (!payload) {
    return
  }

  if (payload.isCurrent) {
    window.showInformationMessage(`已在分支 ${payload.branchName}（MVP Mock）`)
    return
  }

  const dirtyChoices: Array<{ label: string, value: DirtyStrategy | 'cancel' }> = [
    { label: 'Stash 暂存后切换（推荐）', value: 'stash' },
    { label: '放弃本地修改后切换（高风险）', value: 'discard' },
    { label: '取消切换', value: 'cancel' },
  ]

  const dirtyAction = await window.showQuickPick(dirtyChoices, {
    title: `模拟切换分支：${payload.branchName}`,
    placeHolder: 'MVP 阶段仅演示交互流程，不执行真实 git 命令',
    ignoreFocusOut: true,
  })

  if (!dirtyAction || dirtyAction.value === 'cancel') {
    window.showInformationMessage('已取消切换（MVP Mock）')
    return
  }

  if (dirtyAction.value === 'discard') {
    const confirmed = await window.showWarningMessage(
      '将放弃本地修改后切换（模拟），是否继续？',
      { modal: true },
      '继续',
    )

    if (confirmed !== '继续') {
      window.showInformationMessage('已取消切换（MVP Mock）')
      return
    }
  }

  const plan = buildSwitchPlan(
    { taskTitle: payload.taskTitle, branchName: payload.branchName },
    dirtyAction.value,
  )
  const summary = await mockSwitchExecutor.execute(plan)
  window.showInformationMessage(summary)
}
