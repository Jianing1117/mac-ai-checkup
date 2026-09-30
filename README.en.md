# Mac AI Checkup · mac-ai-checkup

[中文](README.md)

**A set of lessons you install into your own AI, so that when it helps clean up your Mac, it doesn't miss the biggest items or delete the wrong things.**

The longer you use AI, the fuller and hotter your computer gets. Ask AI to clean it up and it will work hard to find big files and clear caches. But the biggest items are often not on its list: they don't show errors, they aren't called Cache, and they look like nobody has used them in a long time. This skill comes from a real cleanup. In two days it freed up more than 200 GB, fixed a background service that had been quietly failing for months, and also deleted the wrong thing a few times along the way.

## 12 blind spots you and your AI both tend to miss

| | Why it gets missed | What I found (my Mac) |
|---|---|---|
| **Files that were deleted but are still held by a program that's open** | You can't see them in any folder. People often think the space is "taken by photos" | One restart freed 122 GB |
| **Offline caches of an app's built-in browser** | The folder is called `Service Worker`, not Cache. Apps like Feishu (Lark) all have one | 15 GB of Feishu's 17 GB |
| **Local AI models your browser downloaded on its own** | You never installed it, and web-based AI doesn't use it | Chrome's Gemini Nano, 4 GB |
| **Things moved to the Trash** | You think deleting it freed the space | Piled up to 160 GB |
| **Background services can't read Documents, Desktop, or Downloads** | macOS privacy protection. No pop-up, only a line in the log | A bot didn't reply to messages for months; 5.27 million lines of errors |
| **Automations that show "Active" but stopped producing anything long ago** | You check the status, not the last output | A scheduled task produced nothing for 13 weeks |
| **Several layers of "keep awake"** | You turn one off and think it's fixed | An AI app kept the computer from sleeping for 64 hours |
| **Scheduled tasks spread across several places** | Not finding them in one place doesn't mean there are none | The AI said "you have no scheduled tasks." There were two |
| **Folders your AI creates on the fly** | Every time, it's "just put it in the current folder" | 78 items at the top level of the workspace |
| **Several copies of the same skill** | Change one, and the others don't change with it | 3 copies; the AI kept using the old one |
| **Things "not changed in ages" that are actually used every day** | AI judges "old" by the modified date | A folder untouched for 121 days turned out to be the program a bot ran every day |
| **References hidden in shortcuts (symlinks) and app settings** | Searching file contents won't find them | Moving one folder meant changing 68 paths |

The full list of 28, each with how to check it: [Blind spots](skill/mac-ai-checkup/references/blind-spots.en.md)

## How it works

```
① Rules (prevent)        AI puts files in the right place as it writes them    templates/AGENTS.en.md
② Checkup (find)         Read-only, lists only what's off, can run weekly      skill/mac-ai-checkup
③ You say yes, AI acts   Checks references first, Trash only, notes the origin
④ Safety net             Trash (30 days) + backup                              templates/backup.sh
```

Why it's designed this way, where things should go, and where the files of four AI tools (Claude Code, Codex, ChatGPT, Cowork) live: [Method](docs/method.en.md)

## Get started in three steps

1. Put the whole `skill/mac-ai-checkup` folder into your AI tool's skills folder: `~/.codex/skills/` for Codex, `~/.claude/skills/` for Claude Code.
2. Tell it: **"Use Mac AI Checkup to give my Mac a checkup. Look only, don't change anything yet."**
3. Read the report, then tell it which items to handle.

**Want a weekly checkup that runs on its own?** (optional)

1. Copy `skill/mac-ai-checkup/config.example.json` to `~/.local/share/mac-ai-checkup/config.json` and edit it to match your folders.
2. Run `node <skill folder>/scripts/weekly-checkup.mjs --current-baseline`. Go through what's there now, item by item: login items, ports that stay open, and keep-awake. Add the ones you accept to `baseline` in the settings. After that, it only reports what's new or changed.
3. In your AI tool, create a scheduled task that runs every week: `node <skill folder>/scripts/weekly-checkup.mjs --save-state --out-dir <report folder>`.

**Want your AI to make less mess from now on?** Edit `templates/AGENTS.en.md` to use your paths, and add it to your AI's global rules.

## What it won't do

- No direct deletion. It only moves things to the Trash, and notes where each item came from.
- The checkup is read-only and lists only what's off. Nothing is touched until you say yes.
- It doesn't read passwords, keys, IDs, or other credentials. For files whose names look like credentials, it only reports the name.
- It doesn't ask you to change your existing folder structure.

## What's in the repo

```text
README.md                        Overview (Chinese)
README.en.md                     Overview (English)
skill/mac-ai-checkup/
  SKILL.md                       Workflow and boundaries, for the AI to read
  references/容易漏掉的地方.md     28 blind spots: what they are, why they get missed, how to check (Chinese)
  references/blind-spots.en.md   The same 28 blind spots (English)
  scripts/weekly-checkup.mjs     Weekly checkup; read-only, lists only what's off
  scripts/workspace-audit.mjs    Read-only inventory of the folders you choose
  scripts/audit.mjs              Read-only inventory of common macOS cache locations
  config.example.json            Sample settings for the weekly checkup
templates/
  AGENTS.md                      AI rules template (Chinese)
  AGENTS.en.md                   AI rules template (English)
  backup.sh                      Backup script template (you can try --dry-run first)
docs/
  方法.md                         Practices you can borrow (Chinese)
  method.en.md                   Practices you can borrow (English)
```

## What it runs on

- macOS. The scripts need Node.js.
- Tested with Codex and Claude Code. Other AI tools that can read and write local files and run commands should also work.
- The paths and numbers come from my own computer. Yours will be different. You can change the number of days and the folder names in the settings.

## License

[MIT](LICENSE)
