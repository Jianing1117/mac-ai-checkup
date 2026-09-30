# AI 电脑体检 · mac-ai-checkup

[English](README.en.md)

**装给你自己的 AI 的一份经验：让它帮你清理 Mac 的时候，别漏掉最大的那几块，也别删错东西。**

AI 用久了，电脑会越来越满、越来越烫。让 AI 帮忙清理，它会很卖力地找大文件、清缓存，但最大的几块，往往不在它的清单里：它们不报错、不叫 Cache、看起来很久没用。这份 skill 来自一次真实的清理：两天里清出了两百多 GB，修好了一个悄悄失败几个月的后台服务，也踩了几次误删的坑。

## 你和 AI 都容易漏掉的 12 个地方

| | 为什么会漏 | 作者这次的数字 |
|---|---|---|
| **删了、但还被开着的程序占着的文件** | 文件夹里看不到，常被误以为是"照片占的" | 重启一次多出 122 GB |
| **App 内置浏览器的离线缓存** | 文件夹叫 `Service Worker`，不叫 Cache；飞书这类 App 都有 | 飞书 17 GB 里 15 GB 是它 |
| **浏览器自己下载的本地 AI 模型** | 你没装过，网页版 AI 也用不到它 | Chrome 的 Gemini Nano 4 GB |
| **移进废纸篓的东西** | 以为删了就腾出来了 | 攒到 160 GB |
| **后台服务读不到「文稿」「桌面」「下载」** | macOS 隐私保护，不弹窗，只写日志 | 机器人几个月不回消息，527 万行报错 |
| **显示"启用中"、其实早就不产出的自动化** | 只看状态，不看最后一次产出 | 一个定时任务 13 周没产出 |
| **好几层"保持唤醒"** | 关掉一个就以为好了 | 一个 AI App 64 小时不让电脑睡 |
| **散在好几个地方的定时任务** | 一个地方查不到，不等于没有 | AI 说"你没有定时任务"，其实有两个 |
| **AI 随手建的文件夹** | 每次都"放在当前文件夹就好" | 工作区最上层 78 项 |
| **同一个 skill 存了好几份** | 改一份另一份不跟着变 | 3 份，AI 一直用的是旧版 |
| **"很久没改"但其实天天在用的东西** | AI 按修改时间判断"旧" | 121 天没动的文件夹，是机器人每天在跑的程序 |
| **藏在快捷方式和 App 设置里的引用** | 搜文件内容搜不到 | 挪一个文件夹，要改 68 处路径 |

完整的 28 条，每条都写了怎么查：[容易漏掉的地方](skill/mac-ai-checkup/references/容易漏掉的地方.md)

## 它怎么工作

```
① 规矩（预防）        AI 写文件那一刻就放对地方         templates/AGENTS.md
② 体检（发现）        只读，只列异常，可以每周自动跑     skill/mac-ai-checkup
③ 你点头，AI 执行     先查引用，只进废纸篓，记下从哪来
④ 兜底               废纸篓 30 天 + 备份               templates/backup.sh
```

为什么这样设计、东西该放哪、四个 AI 工具（Claude Code、Codex、ChatGPT、Cowork）的文件都在哪：[方法](docs/方法.md)

## 三步开始

1. 把 `skill/mac-ai-checkup` 整个文件夹放进你的 AI 工具的 skills 目录：Codex 放 `~/.codex/skills/`，Claude Code 放 `~/.claude/skills/`。
2. 对它说：**"用 AI 电脑体检给我的 Mac 做一次体检，先只看不动。"**
3. 看完报告，告诉它要处理哪几项。

**想每周自动体检**（可选）：

1. 把 `skill/mac-ai-checkup/config.example.json` 复制成 `~/.local/share/mac-ai-checkup/config.json`，按自己的文件夹改。
2. 运行 `node <skill 文件夹>/scripts/weekly-checkup.mjs --current-baseline`，把现在的开机自启、常开端口、保持唤醒逐项看一遍，认可的写进设置里的 `baseline`。以后只报新出现的和变了的。
3. 在你的 AI 工具里建一个每周运行的定时任务：`node <skill 文件夹>/scripts/weekly-checkup.mjs --save-state --out-dir <报告放哪>`。

**想让 AI 以后少制造乱**：把 `templates/AGENTS.md` 改成你的路径，放进 AI 的全局规矩。

## 它不会做的事

- 不直接删除：只移进废纸篓，并记下每一项从哪来。
- 体检只读，只列异常；你点头之前不动任何东西。
- 不读密码、密钥、证件等凭证；名字像凭证的文件只报名字。
- 不要求你改现有的文件夹结构。

## 仓库里有什么

```text
README.md / README.en.md         中文 / 英文说明
skill/mac-ai-checkup/
  SKILL.md                       给 AI 看的流程和边界
  references/容易漏掉的地方.md     28 条盲区：是什么、为什么会漏、怎么查（英文版 blind-spots.en.md）
  scripts/weekly-checkup.mjs     每周体检，只读，只列异常
  scripts/workspace-audit.mjs    指定文件夹的只读盘点
  scripts/audit.mjs              macOS 常见缓存位置的只读盘点
  config.example.json            每周体检的设置样例
templates/
  AGENTS.md                      AI 规矩模板（英文版 AGENTS.en.md）
  backup.sh                      备份脚本模板（可以先 --dry-run 试）
docs/
  方法.md                         可以借鉴的做法（英文版 method.en.md）
```

## 适用

- macOS；跑脚本需要 Node.js。
- 在 Codex 和 Claude Code 上用过；其他能读写本地文件、能运行命令的 AI 工具应该也能用。
- 路径和数字来自作者自己的电脑，你的会不一样；天数、文件夹名都在设置里改。

## 许可

[MIT](LICENSE)
