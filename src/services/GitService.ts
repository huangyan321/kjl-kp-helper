import simpleGit from 'simple-git'
import { window, workspace } from 'vscode'
import { getVscodeGitBranchInfo } from './VscodeGitProvider'

/**
 * 解析 git remote URL 中的路径部分，用于与 workspace 文件夹匹配
 * 例如: "git@gitlab.qunhequnhe.com:fe/up/design-factory-web.git" → "fe/up/design-factory-web"
 */
function parseRepoPath(repoUrl: string): string {
  return repoUrl
    .replace(/\.git$/, '')
    .replace(/^git@[^:]+:/, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .toLowerCase()
}

/**
 * 尝试根据 remote URL 自动匹配 workspace 文件夹
 * 如果匹配成功则直接使用，否则返回 undefined（触发手动选择）
 */
async function findFolderByRemote(repoUrl: string): Promise<string | undefined> {
  const folders = workspace.workspaceFolders
  if (!folders || folders.length === 0) return undefined

  const targetPath = parseRepoPath(repoUrl)

  for (const folder of folders) {
    try {
      const git = simpleGit(folder.uri.fsPath)
      const remotes = await git.getRemotes(true)
      for (const remote of remotes) {
        const remotePath = parseRepoPath(remote.refs.fetch || remote.refs.push || '')
        if (remotePath && targetPath && remotePath.includes(targetPath.split('/').pop() ?? '')) {
          return folder.uri.fsPath
        }
      }
    }
    catch {
      // 跳过非 git 仓库的文件夹
    }
  }

  return undefined
}

/**
 * 弹出 QuickPick 让用户选择工作区文件夹
 */
async function pickWorkspaceFolder(): Promise<string | undefined> {
  const folders = workspace.workspaceFolders
  if (!folders || folders.length === 0) {
    window.showErrorMessage('当前工作区没有打开的文件夹')
    return undefined
  }
  if (folders.length === 1) {
    return folders[0].uri.fsPath
  }

  const items = folders.map(f => ({
    label: f.name,
    description: f.uri.fsPath,
    fsPath: f.uri.fsPath,
  }))

  const picked = await window.showQuickPick(items, {
    title: '选择目标仓库',
    placeHolder: '当前工作区有多个文件夹，请选择要切换分支的仓库',
    ignoreFocusOut: true,
  })

  return picked?.fsPath
}

/**
 * 检出指定分支
 * 1. 本地已有该分支 → git checkout <branch>
 * 2. 本地没有 → git fetch origin && git checkout -b <branch> origin/<branch>
 *
 * @param targetBranch 目标分支名
 * @param repoUrl      可选：git remote URL，用于自动匹配 workspace 文件夹
 * @returns 实际使用的 workspace 文件夹路径（用于后续状态刷新）
 */
export async function switchBranch(targetBranch: string, repoUrl?: string): Promise<string | 'already' | undefined> {
  // 1. 确定目标工作区文件夹
  let folderPath: string | undefined

  if (repoUrl) {
    folderPath = await findFolderByRemote(repoUrl)
  }

  if (!folderPath) {
    folderPath = await pickWorkspaceFolder()
  }

  if (!folderPath) return undefined

  const git = simpleGit(folderPath)

  // 2. 检查当前分支
  const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']).catch(() => '')
  if (currentBranch.trim() === targetBranch) {
    window.showInformationMessage(`已在分支 ${targetBranch}`)
    return 'already'
  }

  // 3. 检查脏工作区
  const status = await git.status()
  let stashed = false
  if (!status.isClean()) {
    const action = await window.showWarningMessage(
      `工作区有未提交的改动（${status.files.length} 个文件），切换分支可能丢失更改。`,
      { modal: true },
      '暂存并切换',
    )
    if (action !== '暂存并切换') return undefined
    await git.stash(['push', '-m', `auto-stash before switching to ${targetBranch}`])
    stashed = true
  }

  const branchSummary = await git.branchLocal()
  const hasLocal = branchSummary.all.includes(targetBranch)

  if (hasLocal) {
    await git.checkout(targetBranch)
  }
  else {
    // 从远端拉取并创建本地分支
    await git.fetch('origin', targetBranch)
    await git.checkout(['-b', targetBranch, `origin/${targetBranch}`])
  }

  if (stashed) {
    window.showInformationMessage(`改动已暂存（git stash），切换完成后可手动执行 git stash pop 恢复`)
  }

  return folderPath
}

/**
 * 获取指定文件夹当前的 git 分支名
 */
export async function getCurrentBranch(folderPath: string): Promise<string | undefined> {
  try {
    const git = simpleGit(folderPath)
    const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
    return branch.trim()
  }
  catch {
    return undefined
  }
}

/**
 * 获取所有 workspace folder 的当前分支及 remote URL 列表
 * 用于跨项目的 repo-aware isCurrent 判断
 */
export interface FolderBranchInfo {
  folderPath: string
  branch: string
  remotes: string[]
}

export async function getWorkspaceBranchInfo(): Promise<FolderBranchInfo[]> {
  // 优先使用 VS Code 内置 Git API：同步读取、无子进程，与 SCM 面板状态一致
  const vscodeInfos = getVscodeGitBranchInfo()
  if (vscodeInfos.length > 0) return vscodeInfos

  // Fallback：VS Code Git 扩展不可用时退回 simple-git
  const folders = workspace.workspaceFolders ?? []
  const results: FolderBranchInfo[] = []
  for (const folder of folders) {
    try {
      const git = simpleGit(folder.uri.fsPath)
      const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
      const remoteSummary = await git.getRemotes(true)
      const remotes = remoteSummary.flatMap(r =>
        [r.refs.fetch, r.refs.push].filter((u): u is string => !!u),
      )
      results.push({ folderPath: folder.uri.fsPath, branch: branch.trim(), remotes })
    }
    catch {
      // 跳过非 git 文件夹
    }
  }
  return results
}
