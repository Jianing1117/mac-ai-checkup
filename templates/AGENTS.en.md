# AI Rules (template)

<!--
How to use:
- Codex: put this file at ~/.codex/AGENTS.md.
- Claude Code: in ~/.claude/CLAUDE.md, write only one line, @~/.codex/AGENTS.md, so both tools read the same file. If you only use one tool, put this straight into that tool's global rules file.
- Change the paths and folder names to your own. "AI Workspace" can be any name you like.
- Keep the rules in this one place only. If a folder has its own special needs, put an AGENTS.md in that folder that covers only that folder. Don't copy the global rules into it again.
-->

## How to work

- Think before you act. State your assumptions. If a request can be read more than one way, ask. Don't just pick one yourself. If there's a simpler way, say so.
- Keep it simple. Do only what was asked. Don't add features, structure, or "might be useful later" things that nobody asked for.
- Change only what needs changing. Every change should trace back to something I asked for. If you see other problems, point them out. Don't fix them on the side.
- Results are what count. First, say clearly what "done" means. Before you say it's done, check it yourself (run it, open it and look, compare it with what I asked for), and show me the result.

## Where files go

- AI work goes in `~/Documents/AI Workspace/`. The top level has only three folders:
  - `projects/<project name>/`: work in progress. I name the projects. If you're not sure whether something counts as a project, ask once before you start writing files: "Do you want to give this a project name?" If I don't name it, treat it as a one-off task. Working files inside a project go in its `work/`.
  - `outputs/YYYY-MM-DD-topic/`: finished deliverables to hand over.
  - `scratch/YYYY-MM-DD-topic/`: working files from one-off tasks (experiments, temporary scripts, drafts in progress, dependencies).
- Finished code repos that are only maintained now and then go in `~/Documents/GitHub/<repo name>/`, one copy per repo. Finished apps go in `/Applications`. Programs that background services need go in `~/.local/share/` (background services can't read Documents, Desktop, or Downloads).
- Don't leave loose files in the home folder, on the Desktop, in Downloads, or at the top level of the workspace.

## Keep project status inside the project

Each project has a `README.md`: what this is, how far along it is, what's next, and what to watch out for. Update it when a work session ends or the status changes. If there isn't one, create it. When you take over, read it first. Don't write a separate handoff note.

## Clean up after yourself, and ask first

- Before you finish, close any processes you started (preview servers and so on). End with one sentence on what this session left behind (new folders, things installed, processes still running).
- Ask first before downloading anything over 500 MB, or creating a login item, scheduled task, or automation.
- Deleting means moving to the Trash only. Never delete permanently. Before moving or deleting a folder, check whether anything else uses it: AI tools' project lists, paths hard-coded in automations and skills, shortcuts (symlinks), scripts, and the AI's memory.

## Notes vault (if you have one)

The notes vault (Obsidian, for example) is read-only by default. Before adding, editing, moving, or deleting any note, list what you plan to change and wait for my OK.

## Never read

ID documents, passwords, bank cards, private keys, recovery phrases, API keys, tokens, SSH private keys, and other account credentials: don't read, summarize, copy, or process them.
