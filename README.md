# kjl-kp-helper

<a href="https://marketplace.visualstudio.com/items?itemName=antfu.ext-name" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/antfu.ext-name.svg?color=eee&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" /></a>
<a href="https://kermanx.github.io/reactive-vscode/" target="__blank"><img src="https://img.shields.io/badge/made_with-reactive--vscode-%23007ACC?style=flat&labelColor=%23229863"  alt="Made with reactive-vscode" /></a>

## Configurations

<!-- configs -->

| Key                         | Description                    | Type     | Default                            |
| --------------------------- | ------------------------------ | -------- | ---------------------------------- |
| `kpHelper.kaBaseUrl`        | KA 平台接口地址                      | `string` | `"https://kaptain.qunhequnhe.com"` |
| `kpHelper.projectId`        | Kaptain 项目 ID（决定拉取哪个项目下的迭代与任务） | `number` | `269`                              |
| `kpHelper.cacheTimeout`     | 任务列表缓存时间（秒），0 表示不缓存            | `number` | `300`                              |
| `kpHelper.fetchConcurrency` | 拉取任务关联分支时的最大并发请求数              | `number` | `5`                                |

<!-- configs -->

## Commands

<!-- commands -->

| Command                  | Title                         |
| ------------------------ | ----------------------------- |
| `kpHelper.login`         | Kaptain Helper: 登录            |
| `kpHelper.logout`        | Kaptain Helper: 退出登录          |
| `kpHelper.refreshTasks`  | Kaptain Helper: 刷新任务列表        |
| `kpHelper.openInKaptain` | Kaptain Helper: 在 Kaptain 中打开 |

<!-- commands -->

