# Method: keeping your Mac lean in the age of AI

In short: **Keep only one copy of each thing on your computer, and put it where its current stage says it belongs. The AI follows the rules and puts files in the right place when it writes them. The weekly checkup only finds problems. Nothing gets deleted unless you say yes, and even then it only goes to the Trash.**

What follows are suggestions, not the one right answer. Change the number of days, the folder names, and which backup service you use to fit your own situation.

## 1. Four layers

```
① Rules (prevent)          AI puts files in the right place the moment it writes them
② Weekly checkup (find)    Read-only, lists only what's off
③ You say yes, AI acts     Checks references first, gathers items into a dated folder, moves the whole folder to the Trash, notes where each item came from and went
④ Safety net               Trash (30 days) + backup
```

The first layer matters most. If the AI puts things in the right place, there's nothing to clean up later.

## 2. Know the two territories

| Territory | Where | How to manage it |
|---|---|---|
| The tools' | `~/.claude`, `~/.codex`, each app's folder in `~/Library/Application Support`, `~/Library/Caches` | Don't delete things inside by hand (the structure changes between versions, and deleting the wrong thing breaks the tool). Use the app's own cleanup option. The checkup only watches how much they grew in a week |
| Yours | Workspace, repos, apps, notes | Place by stage (next section) |

## 3. Place by stage: three folders

| What | Where it goes | Checkup reminds you after this long untouched (default) |
|---|---|---|
| Work in progress | `workspace/projects/<project name>/` | 90 days; asks you "move / delete / keep" |
| Working files inside a project | That project's `work/` | 30 days |
| Finished deliverables | `workspace/outputs/YYYY-MM-DD-topic/` | 90 days; asks you where it should go |
| Working files from one-off tasks | `workspace/scratch/YYYY-MM-DD-topic/` | 30 days |
| Finished repos you only maintain now and then | `~/Documents/GitHub/<repo name>/`, pushed to GitHub | Not cleaned by age. Only reports "not pushed" and "duplicate" |
| Finished apps | `/Applications` | — |
| Programs that background services need | `~/.local/share/<name>/` (background services can't read Documents, Desktop, or Downloads) | — |
| Home folder, Desktop, Downloads | No loose files here | 14 days |

**You name the projects.** When the AI isn't sure whether something counts as a project, it asks once: "Do you want to give this a project name?" If you don't name it, it's treated as a one-off task, and its working files go into `scratch/`. If the AI creates project folders on its own, they just keep multiplying.

**The life of one thing:** When you start, it lives in `projects/`. Experiments along the way go in `work/` and get cleaned after 30 days. When it's done, the code moves to `~/Documents/GitHub/` and gets pushed to GitHub, the app goes into Applications, and the copy in `projects/` is deleted.

## 4. Write each thing in only one place

- **Rules:** One global copy (`~/.codex/AGENTS.md`; Claude Code points to the same file with `@`). If a folder has its own special needs, put a file there that covers only that folder. If the same rule is written in several places, every time you change one, you miss another. Template: `templates/AGENTS.en.md`.
- **Skills:** Keep the ones you write in one repo, and put links to them in each skills folder. If you keep several copies, the versions will drift apart sooner or later.
- **Repos:** Keep only one copy of each repo.
- **Project status:** Write it in the project's `README.md` (what this is, how far along it is, what's next). When a different AI takes over, it reads this first. No separate handoff note.

## 5. Where the four AI tools keep their files

| | Where chats are stored | Where work files end up | Good to know |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<path of the opened folder>/`, on this Mac | The folder you opened | Memory is stored separately for each opened folder. Switch folders and it forgets what came before, so always open it in your workspace. Sessions started in the terminal are deleted automatically after 30 days untouched. Sessions in the Claude app are not (the app can be set to auto-archive idle ones) |
| Codex | `~/.codex/sessions/`, on this Mac | The project's main folder. With no project selected, Codex creates `~/Documents/Codex/<date>/<chat>/` on its own | Projects in the sidebar find their folders by path, so moving a folder breaks the link. A project can have several folders attached: set your workspace as the main folder, and it reads the same rules as Claude |
| ChatGPT | In the cloud | In the cloud; downloads go to Downloads | Smallest impact on disk space. Mostly the Downloads folder |
| Cowork (Claude app) | Saved by the app itself | `~/Claude/Projects/<project>/` | Its virtual machine, about 10 GB, is a fixed cost. If you use Cowork, leave it alone. Scheduled tasks are on the app's Scheduled page |

**Scheduled tasks** are spread across several places: the system's `~/Library/LaunchAgents`, Codex's `~/.codex/automations/`, Claude Code, and the Claude app's Scheduled page. Not finding them in one place doesn't mean there are none. For tasks that run on a regular schedule, use standalone tasks that "start fresh each time." A task attached to a chat is tied to that chat's folder, so it only fits keeping an eye on one thing for a short while.

## 6. Seven safeguards: clear what should go, never delete what shouldn't

1. **The checkup is read-only.** Finding and deleting are kept separate.
2. **Nothing moves until you say yes.** Each time, the AI handles only the few items you name.
3. **Trash only.** The AI never deletes permanently and never empties the Trash.
4. **Check references before touching anything:** AI tools' project lists, paths hard-coded in automations and skills, shortcuts (symlinks), login items, scripts, the AI's memory, and every rules file.
5. **Every deletion has a list.** Items are gathered into a dated folder with a note of "where each came from," so they can be put back exactly as they were.
6. **Credentials are never opened.** Files whose names look like passwords or keys are reported by name only.
7. **Tell "unused" apart from "used."** Look at the last modified date, not the created date. "Not changed in a long time" doesn't mean "not in use." If something exists in only one copy with no backup elsewhere, give a separate warning before deleting it.

## 7. Just 5 minutes a week

1. Glance at the checkup report. If there's nothing to handle, you're done.
2. If there is, reply with something like "clear 1 and 3." For projects untouched for a long time, reply "move / delete / keep."
3. The AI lists what it will touch, and you say yes.
4. Empty the Trash whenever you like. If you turn on "Remove items from the Trash after 30 days" in Finder, it empties itself even if you don't.

Everything else (putting things in the right place, backups, checking background services) happens on its own.

## 8. Backup: what lets you clean up without fear

Only back up things that "have no other backup." Code is on GitHub and notes have their own sync, so there's no need to back them up again. Copy the rest (the workspace's projects and deliverables, the AI's rules, automations, skills, and memory) to iCloud Drive or an external drive once a week. Template: `templates/backup.sh`.

For iCloud, turning on iCloud Drive alone is enough. Think carefully before turning on "Desktop & Documents" sync or "Optimize Mac Storage." Your Documents folder holds code repos and notes, and adding another layer of sync on top can easily cause conflicts. And once files are moved to the cloud, the AI and background programs can't read them either.
