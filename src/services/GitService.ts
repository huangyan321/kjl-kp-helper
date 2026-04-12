import simpleGit from 'simple-git'
import { window, workspace } from 'vscode'

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
export async function switchBranch(targetBranch: string, repoUrl?: string): Promise<string | undefined> {
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
    return folderPath
  }

  // 3. 检查本地是否已有该分支
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
