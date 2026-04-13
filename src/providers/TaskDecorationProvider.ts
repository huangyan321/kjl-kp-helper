import { FileDecoration, FileDecorationProvider, ThemeColor, Uri } from 'vscode'

// ─── 状态颜色枚举 ─────────────────────────────────────────────

export const enum TaskColorKey {
  /** 待确认 / 待开发  blue */
  Todo = 'todo',
  /** 开发中 / 进行中 / 联调  orange */
  InProgress = 'in-progress',
  /** 开发完成  teal */
  DevDone = 'dev-done',
  /** 待测试 / 测试中 / 提测  purple */
  Testing = 'testing',
  /** 待发布 / 已完成  green */
  Done = 'done',
}

export const TASK_DECORATION_SCHEME = 'kphelper-task'

// ─── 优先级 ───────────────────────────────────────────────────

export const enum PriorityLevel {
  /** P0 紧急 */
  P0 = 0,
  /** P1 高 */
  P1 = 1,
  /** P2+ 其余 */
  Other = 2,
}

const P0_NAMES = ['p0', '紧急']
const P1_NAMES = ['p1', '高']

export function getPriorityLevelFromName(priorityName: string): PriorityLevel {
  const n = priorityName.toLowerCase().trim()
  if (P0_NAMES.some(k => n.includes(k))) return PriorityLevel.P0
  if (P1_NAMES.some(k => n.includes(k))) return PriorityLevel.P1
  return PriorityLevel.Other
}

/** 供 TaskNode 直接使用，用于 ThemeIcon color 参数 */
export const PRIORITY_THEME_COLORS: Record<number, string> = {
  [PriorityLevel.P0]: 'kpHelper.priorityP0',
  [PriorityLevel.P1]: 'kpHelper.priorityP1',
  [PriorityLevel.Other]: 'kpHelper.priorityOther',
}

const COLOR_IDS: Record<string, string> = {
  [TaskColorKey.Todo]: 'kpHelper.todoForeground',
  [TaskColorKey.InProgress]: 'kpHelper.inProgressForeground',
  [TaskColorKey.DevDone]: 'kpHelper.devDoneForeground',
  [TaskColorKey.Testing]: 'kpHelper.testingForeground',
  [TaskColorKey.Done]: 'kpHelper.doneForeground',
}

// keywords 从更具体到更通用排列，避免误匹配
const STATUS_RULES: Array<{ keywords: string[]; color: TaskColorKey }> = [
  { keywords: ['开发完成', '待发布'], color: TaskColorKey.DevDone },
  { keywords: ['待测试', '测试中', '提测'], color: TaskColorKey.Testing },
  { keywords: ['开发中', '进行中', '联调'], color: TaskColorKey.InProgress },
  { keywords: ['已完成', '关闭', '取消'], color: TaskColorKey.Done },
]

export function getTaskColorKey(statusName: string): TaskColorKey {
  if (!statusName) return TaskColorKey.Todo
  for (const { keywords, color } of STATUS_RULES) {
    if (keywords.some(kw => statusName.includes(kw))) return color
  }
  return TaskColorKey.Todo
}

// URI 格式: kphelper-task:/<colorKey>/<taskId>
export function makeTaskUri(taskId: string, colorKey: TaskColorKey): Uri {
  return Uri.parse(`${TASK_DECORATION_SCHEME}:/${colorKey}/${encodeURIComponent(taskId)}`)
}

// ─── FileDecorationProvider ────────────────────────────────────

export class TaskDecorationProvider implements FileDecorationProvider {
  provideFileDecoration(uri: Uri): FileDecoration | undefined {
    if (uri.scheme !== TASK_DECORATION_SCHEME) return undefined
    const colorKey = uri.path.split('/')[1]
    const colorId = COLOR_IDS[colorKey]
    if (!colorId) return undefined
    return new FileDecoration(undefined, undefined, new ThemeColor(colorId))
  }
}
