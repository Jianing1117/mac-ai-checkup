# Blind spots you and your AI both tend to miss

These things don't show up when you "search for big files by size," and most of them don't show errors either. Go through them one by one during a cleanup or checkup. In the report, say whether each group was checked, and if not, why.

The numbers under "What I found" come from my own MacBook (September 2026). They are only examples. Your computer will be different. ★ marks the 12 items most worth checking first.

## 1. Space you can't see

| | What it is | Why it gets missed | How to check | What I found |
|---|---|---|---|---|
| ★ | Files that were deleted but are still held by a program that's open | You can't see them in any folder, and searching by size won't find them either. People often think the space is "taken by photos" or "System Data" | `lsof -nP +L1`. Count each file only once by "device number + file number (inode)," and leave out `/System` and `/usr`. The space only comes back after you quit the program holding it or restart the computer | One restart freed 122 GB |
| ★ | Offline caches of an app's built-in browser | The folder is called `Service Worker`, not Cache. Browsers and Electron apps like Feishu (Lark) all have one | `find ~/Library/Application\ Support -maxdepth 8 -type d -name "Service Worker" -prune -exec du -sh {} +` | 15 GB of Feishu's 17 GB |
| ★ | Local AI models your browser downloaded on its own | You never installed it yourself, and the web versions of Gemini and ChatGPT don't use it | `du -sh ~/Library/Application\ Support/Google/Chrome/OptGuideOnDeviceModel` | Chrome's Gemini Nano, 4 GB |
| ★ | Things moved to the Trash | You think "deleted" means the space is freed | `du -sh ~/.Trash`. In Finder settings, you can turn on "Remove items from the Trash after 30 days" | Piled up to 160 GB |
| | Which websites a browser's cache actually belongs to | It's all just called "cache," so you're afraid to delete it | `Service Worker/CacheStorage/<folder>/index.txt` contains the web addresses. Break it down by site | 6 GB of Brave's 6.6 GB was Feishu's web version |
| | Video editing app caches | You think it's your work | The cache location in the editing app's settings. Look at it separately from your drafts | CapCut (Jianying): 12 GB of cache, only 5.6 GB of drafts |
| | Forgotten dependencies and virtual environments inside projects | Installed once and forgotten. They all have names like `node_modules` or `.venv` | Search the workspace by name, and check whether the project they belong to is still active | A 690 MB environment for removing image backgrounds |
| | The tool is uninstalled, but its cache is still there | The tool is gone, and nobody remembers its cache | Compare `~/Library/Caches` and `~/.cache` against the tools you have installed | — |
| | Tools the AI downloads again and again when deploying websites | Every download is "temporary" | `du -sh ~/.npm/_npx` | — |
| | Not restarting for a long time | After a week or two without a restart, temporary space use keeps piling up | Put "days since the last restart" in the report (`sysctl kern.boottime`) | See the first item |

## 2. Background tasks that quietly fail or quietly drain power

| | What it is | Why it gets missed | How to check | What I found |
|---|---|---|---|---|
| ★ | Background services can't read Documents, Desktop, Downloads, or iCloud Drive | macOS privacy protection. No pop-up. It only writes `Operation not permitted` in the log | `launchctl print gui/$(id -u)/<name>` and look at `last exit code`. Search the logs for `Operation not permitted`. Put programs that background services need in `~/.local/share/` | A Feishu bot didn't reply to messages for months and piled up 5.27 million lines of errors |
| ★ | An automation shows "Active" but stopped producing anything long ago | You check the status, not the last output | Check when it last wrote something (output file times, run history) | One scheduled task produced nothing for 13 weeks. Another showed "Active" but produced nothing for a month and a half |
| ★ | "Keep awake" has several layers | You turn one off and think it's fixed. An app says "only while working," but never lets go | `pmset -g assertions` (who is blocking sleep right now), `pmset -g log` (history, kept across restarts), `pmset -g custom` (settings for power adapter and battery), then look through the app's own logs | An AI app kept the computer from sleeping for 64 hours |
| ★ | Scheduled tasks are spread across several places | Each tool manages its own. Not finding them in one place doesn't mean there are none | `~/Library/LaunchAgents`, Codex's `~/.codex/automations/`, Claude Code's scheduled tasks, the Claude app's Scheduled page | The AI said "you have no scheduled tasks." A screenshot showed two |
| | Preview servers nobody turned off | The AI starts one and walks away | `lsof -nP -iTCP -sTCP:LISTEN`, and check which folder it was started in | Running for 20 days |
| | Two automations for the same job | You switched methods but didn't delete the old one | Compare the system's scheduled tasks with your AI tools' automations, and confirm which one is really running | The old backup task kept failing; the new one had taken over long ago |
| | An automation is attached to a chat, and the chat's folder gets cleaned up | The folder looks empty and untouched for a long time | For regular tasks, use standalone tasks that "start fresh each time." Use chat-attached ones only to keep an eye on one thing for a short while | A dashboard that ran every day almost broke |

## 3. Mess the AI leaves behind

| | What it is | Why it gets missed | How to check | What I found |
|---|---|---|---|---|
| ★ | The AI creates folders and drops files wherever it happens to be | Every time, it's "just put it in the current folder" | Count the items at the top level of the workspace. Spell out in the AI's rules where things go (see `templates/AGENTS.en.md`) | 78 items at the top level, with no visible grouping |
| ★ | Several copies of the same skill | Installed once, then copied again. Change one, and the others don't change with it | Compare same-named skills in `~/.claude/skills`, `~/.codex/skills`, and `~/.agents/skills`. Keep the original in one place only, and put links everywhere else | 3 copies; the AI kept using the old one |
| | Many skills installed, most never used | They seemed useful when you installed them | Count how many times each was really called in your chat history. Being read during a bulk inventory doesn't count | 65 of 99 unused for two months |
| | The same rule written in several files | Each new rule gets added to whichever file is at hand | One global copy. A folder's own file only covers that folder | 9 files; the same rule copied five or six times |
| | Several copies of the same code repo | Copied out to edit, then forgotten | Group them by `git remote get-url origin` | Scattered across 5 places |

## 4. Where deleting most often goes wrong

| | What it is | Why it gets missed | How to check | What happened |
|---|---|---|---|---|
| ★ | "Not changed in a long time" doesn't mean "not in use" | The AI judges "old" by the modified date | Check whether running processes, login items, or shortcuts point to it | A folder untouched for 121 days turned out to be the program a bot ran every day |
| ★ | References aren't only written inside files | Searching file contents won't find shortcuts or app settings | Shortcuts (`find ~ -maxdepth 3 -type l`, then `readlink`), AI tools' project lists (for Codex, `~/.codex/.codex-global-state.json`), automations, the AI's memory, and every rules file (check both `AGENTS.md` and `CLAUDE.md`) | Moving one folder meant changing 68 paths |
| | "It's backed up in the cloud" has to be checked against records | It's based on memory. Two-way sync may also be on, so deleting locally deletes the cloud copy too | Check the cloud drive's upload and download history, and compare sizes file by file. Make sure two-way sync is off | Deleted only after checking each file against the cloud drive's records |
| | Clearing the browser cache can lose your tabs | The browser's "On startup" setting isn't set to "Continue where you left off" | Check this setting before clearing, and remind the user | — |
| | A comparison before overwriting a file didn't stop the overwrite | The command went ahead and overwrote without waiting for the comparison result | If the comparison doesn't match, stop. Don't let the next steps run as usual | A copy was overwritten and recovered from the previous day's backup |
| | The AI can be wrong too | It sounds very sure | Before saying "this setting will delete your stuff," check the docs and the actual files | It said Claude deletes sessions untouched for 30 days. In fact, it only deletes ones started in the terminal |
