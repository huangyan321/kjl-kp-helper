import { Uri, commands, workspace } from 'vscode'
import type { TaskInfo } from '../services/TaskService'

export async function openInKaptainCommand(arg: TaskInfo | { task: TaskInfo }): Promise<void> {
  // 右键菜单触发时 arg 是 TaskNode（TreeItem），左键/命令面板触发时是 TaskInfo
  const task: TaskInfo = arg && 'task' in arg ? arg.task : arg as TaskInfo
  const baseUrl = workspace.getConfiguration().get<string>('kpHelper.kaBaseUrl') ?? 'https://kaptain.qunhequnhe.com'
  const projectId = workspace.getConfiguration().get<number>('kpHelper.projectId') ?? 269
  const url = `${baseUrl}/project/detail/sprint/detail?projectId=${projectId}&sprint=${task.iterationId}&key=${encodeURIComponent(task.key)}${task.filterId != null ? `&filter=${task.filterId}` : ''}`
  await commands.executeCommand('vscode.open', Uri.parse(url))
}
