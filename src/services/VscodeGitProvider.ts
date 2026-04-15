import { type Disposable, Uri, extensions } from 'vscode'

// ── VS Code 内置 Git 扩展的公开 API 类型定义 ─────────────────────────────────

interface GitExtension {
  getAPI(version: 1): GitAPI
}

interface GitAPI {
  repositories: GitRepository[]
  onDidOpenRepository: (cb: (r: GitRepository) => unknown) => Disposable
  onDidCloseRepository: (cb: (r: GitRepository) => unknown) => Disposable
}

export interface GitRepository {
  rootUri: Uri
  state: GitRepositoryState
  ui: GitRepositoryUIState
}

interface GitRepositoryState {
  HEAD: { name?: string; commit?: string } | undefined
  remotes: Array<{ name: string; fetchUrl?: string; pushUrl?: string }>
  onDidChange: (cb: () => unknown) => Disposable
}

interface GitRepositoryUIState {
  /** 该仓库是否在 SCM 面板中被选中为「活动仓库」 */
  selected: boolean
  onDidChange: (cb: () => unknown) => Disposable
}

// ── 内部工具 ──────────────────────────────────────────────────────────────────

function getGitAPI(): GitAPI | undefined {
  return extensions.getExtension<GitExtension>('vscode.git')?.exports?.getAPI(1)
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/** 获取所有 VS Code 已追踪的 Git 仓库 */
export function getVscodeGitRepos(): GitRepository[] {
  return getGitAPI()?.repositories ?? []
}

/** 找到包含给定文件 URI 的仓库（路径最深者优先，适配 monorepo） */
export function findRepoForUri(uri: Uri): GitRepository | undefined {
  return getVscodeGitRepos()
    .filter(r => uri.fsPath.startsWith(r.rootUri.fsPath))
    .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0]
}

/** 获取 SCM 面板中当前被手动选中的仓库 */
export function getSelectedRepo(): GitRepository | undefined {
  return getVscodeGitRepos().find(r => r.ui.selected)
}

/** 获取仓库所有 remote URL（fetch + push 去重） */
export function getRepoRemoteUrls(repo: GitRepository): string[] {
  const urls = repo.state.remotes.flatMap(r =>
    [r.fetchUrl, r.pushUrl].filter((u): u is string => !!u),
  )
  return [...new Set(urls)]
}

export interface VscodeFolderBranchInfo {
  folderPath: string
  branch: string
  remotes: string[]
}

/**
 * 通过 VS Code 内置 Git API 同步获取所有仓库的当前分支及 remote 信息。
 * 无需子进程，比 simple-git 版本更快，且与 VS Code SCM 状态保持一致。
 * 若 Git 扩展不可用则返回空数组（由调用方 fallback）。
 */
export function getVscodeGitBranchInfo(): VscodeFolderBranchInfo[] {
  return getVscodeGitRepos()
    .map(r => ({
      folderPath: r.rootUri.fsPath,
      branch: r.state.HEAD?.name ?? '',
      remotes: getRepoRemoteUrls(r),
    }))
    .filter(info => !!info.branch)
}

/**
 * 订阅所有仓库的 Git 状态变化，实现与 VS Code SCM 面板的双向联动：
 *
/**
 * 订阅所有仓库的 Git 状态变化，实现与 VS Code SCM 面板的双向联动：
 *
 * - `onBranchChange`        — 任意仓库当前分支发生变化时触发（含用户在终端/SCM 面板手动切换）
 * - `onActiveRepoChange`    — SCM 面板「活动仓库」切换时触发，传入该仓库的 remote URL 列表
 *
 * 同时会自动处理之后动态加入的仓库（onDidOpenRepository）。
 * 初始化时会立即检查当前已选中的仓库并触发一次 onActiveRepoChange。
 *
 * @returns Disposable，在插件停用时调用 dispose() 即可清理所有监听
 */
export function watchVscodeGit(
  onBranchChange: () => void,
  onActiveRepoChange: (remotes: string[]) => void,
): Disposable {
  const api = getGitAPI()
  if (!api) {
    // vscode.git 扩展不可用（极少见），返回空 Disposable
    return { dispose: () => {} }
  }

  const disposables: Disposable[] = []

  // 上次确认的「已选中仓库」根路径，用于去重防抖
  let lastSelectedPath = ''

  /**
   * 全量扫描所有仓库，找到当前 ui.selected=true 的那个。
   * 如果与上次不同，才触发 onActiveRepoChange。
   * 这样无论事件触发顺序如何（先 A 解选 / 先 B 选中），都能拿到正确结果。
   */
  const checkSelectedRepo = (): void => {
    const selected = api.repositories.find(r => r.ui.selected)
    const newPath = selected?.rootUri.fsPath ?? ''
    if (newPath === lastSelectedPath) return
    lastSelectedPath = newPath
    if (selected) {
      onActiveRepoChange(getRepoRemoteUrls(selected))
    }
  }

  const subscribeRepo = (repo: GitRepository): void => {
    let prevBranch = repo.state.HEAD?.name

    // 监听分支（HEAD）变化
    disposables.push(
      repo.state.onDidChange(() => {
        const newBranch = repo.state.HEAD?.name
        if (prevBranch !== newBranch) {
          prevBranch = newBranch
          onBranchChange()
        }
      }),
    )

    // 任意仓库 UI 状态变化时全量扫描，确保无论事件顺序都能正确识别选中仓库
    disposables.push(
      repo.ui.onDidChange(() => checkSelectedRepo()),
    )
  }

  // 订阅当前已有仓库
  api.repositories.forEach(subscribeRepo)

  // 订阅后续动态打开的仓库
  disposables.push(api.onDidOpenRepository(r => subscribeRepo(r)))

  // 初始化：立即同步一次当前已选中的仓库（避免插件激活时漏掉已选中状态）
  checkSelectedRepo()

  return { dispose: () => disposables.forEach(d => d.dispose()) }
}
