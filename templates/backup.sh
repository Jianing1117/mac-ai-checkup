#!/bin/bash
# 每周把"没有别的备份"的东西复制一份进 iCloud 云盘（或别的位置）。只往备份里写，不动原文件。
# 备份和电脑保持一致：电脑上删了，下次备份里也删（iCloud 的「最近删除」还能留 30 天）。
# 不备份：Git 记录（仓库本来就在 GitHub）、依赖和虚拟环境、项目的 work/、名字像密钥的文件。
#
# 用法：
#   1. 改好下面的 DEST 和 ITEMS。
#   2. 先试一遍，只看不写：bash backup.sh --dry-run
#   3. 没问题再正式跑：bash backup.sh；之后可以让 AI 工具每周运行一次。
# 注意：后台服务读不到文稿、桌面、下载和 iCloud 云盘，所以别用系统的定时任务（LaunchAgents）跑它，
#       交给能访问这些文件夹的 AI 工具或自己手动运行。
set -u

# 备份到哪。不用 iCloud 就换成移动硬盘等位置。
DEST="${BACKUP_DEST:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Mac 备份}"

# 要备份什么：一行一项，格式是「来源|放进备份里的哪个文件夹」。
# 只放没有别的备份的东西：代码仓库在 GitHub、笔记有自己的同步，就不用放。
ITEMS=(
  "$HOME/Documents/AI Workspace/projects|AI Workspace"
  "$HOME/Documents/AI Workspace/outputs|AI Workspace"
  "$HOME/Documents/AI Workspace/AGENTS.md|AI Workspace"
  "$HOME/.codex/AGENTS.md|AI 设置/Codex"
  "$HOME/.codex/automations|AI 设置/Codex"
  "$HOME/.codex/skills|AI 设置/Codex"
  "$HOME/.agents/skills|AI 设置/共用"
  "$HOME/.claude/CLAUDE.md|AI 设置/Claude"
  "$HOME/.claude/skills|AI 设置/Claude"
  "$HOME/.local/share/mac-ai-checkup|AI 设置/体检"
)
# Claude Code 的记忆（按文件夹分开存）。不需要就改成 BACKUP_CLAUDE_MEMORY=0。
BACKUP_CLAUDE_MEMORY=1

EX=(--exclude '.DS_Store' --exclude '.git/' --exclude 'node_modules' --exclude '.venv/' --exclude 'venv/'
    --exclude '*-venv/' --exclude '__pycache__/' --exclude '.next/' --exclude '.build/' --exclude 'site-packages/'
    --exclude 'work/' --exclude '.env' --exclude '.env.*' --exclude '*.pem' --exclude '*.key'
    --exclude '*secret*' --exclude '*credential*')
DRY=(); [ "${1:-}" = "--dry-run" ] && DRY=(-n -v)

[ -d "$(dirname "$DEST")" ] || { echo "找不到 $(dirname "$DEST")，这次没有备份"; exit 1; }
[ ${#DRY[@]} -eq 0 ] && { mkdir -p "$DEST" || { echo "写不进 $DEST，这次没有备份"; exit 1; }; }

failed=()
copy() { # 来源 备份里的文件夹
  [ -e "$1" ] || { echo "跳过（不存在）：$1"; return; }
  [ ${#DRY[@]} -eq 0 ] && mkdir -p "$DEST/$2"
  rsync -a --delete "${DRY[@]}" "${EX[@]}" "$1" "$DEST/$2/" || failed+=("$1")
}

for item in "${ITEMS[@]}"; do copy "${item%%|*}" "${item#*|}"; done
if [ "$BACKUP_CLAUDE_MEMORY" = 1 ]; then
  for m in "$HOME"/.claude/projects/*/memory; do
    [ -d "$m" ] && copy "$m" "AI 设置/Claude/记忆/$(basename "$(dirname "$m")")"
  done
fi

if [ ${#DRY[@]} -gt 0 ]; then echo "试运行完成，没有写任何东西。"; exit 0; fi
size=$(du -sh "$DEST" 2>/dev/null | cut -f1)
{ echo "最近一次备份：$(date '+%Y-%m-%d %H:%M')"; echo "大小：$size"; [ ${#failed[@]} -gt 0 ] && printf '没备份成功：%s\n' "${failed[@]}"; } > "$DEST/最近一次备份.txt"
if [ ${#failed[@]} -gt 0 ]; then echo "备份完成但有 ${#failed[@]} 项失败：${failed[*]}"; exit 1; fi
echo "备份完成：$DEST 共 ${size}。"
