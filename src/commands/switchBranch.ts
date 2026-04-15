import { ProgressLocation, window } from 'vscode'
import type { TaskInfo } from '../services/TaskService'
import { switchBranch as gitSwitchBranch } from '../services/GitService'
import { taskTreeProvider } from '../providers/TaskTreeProvider'

async function doSwitchBranch(branchName: string, repoUrl?: string): Promise<void> {
  let result: string | 'already' | undefined
  await window.withProgress(
    { location: ProgressLocation.Window, title: `切换分支: ${branchName}`, cancellable: false },
    async () => {
      result = await gitSwitchBranch(branchName, repoUrl)
    },
  )
  if (!result || result === 'already') return
  window.setStatusBarMessage(`$(check) 已切换到 ${branchName}`, 3000)
  await taskTreeProvider.refreshBranchStatus()
}

export async function taskPrimaryActionCommand(task?: TaskInfo): Promise<void> {
  if (!task) {
    return
  }

  if (task.branches.length === 0) {
    window.showWarningMessage(`任务「${task.title}」未绑定分支`)
    return
  }

  if (task.branches.length === 1) {
    const branch = task.branches[0]
    await doSwitchBranch(branch.name, branch.repo)
    return
  }

  // 多分支：QuickPick 选择
  const items = task.branches.map(b => ({
    label: b.name,
    description: b.serviceName ?? b.repo ?? '',
    branch: b,
  }))

  const picked = await window.showQuickPick(items, {
    title: `任务「${task.title}」有多个关联分支，请选择`,
    placeHolder: '选择要切换的分支',
    ignoreFocusOut: true,
  })

  if (!picked) {
    return
  }

  await doSwitchBranch(picked.branch.name, picked.branch.repo)
}

export async function switchBranchMockCommand(payload?: { taskTitle: string; branchName: string; isCurrent: boolean }): Promise<void> {
  if (!payload) {
    return
  }
  if (payload.isCurrent) {
    window.showInformationMessage(`已在分支 ${payload.branchName}`)
    return
  }
  await doSwitchBranch(payload.branchName)
}

