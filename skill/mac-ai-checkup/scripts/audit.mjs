#!/usr/bin/env node
// Read-only metadata audit. No deletion, configuration changes, or report files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

if (process.argv.length > 2) {
  console.error('This read-only audit takes no arguments and has no apply mode.');
  process.exit(2);
}
if (process.platform !== 'darwin') {
  console.error('This audit supports macOS only; use platform-specific read-only checks.');
  process.exit(2);
}

const taskHome = fs.realpathSync(os.homedir());
const targetPath = relative => path.join(taskHome, relative);
function run(program, args) {
  return execFileSync(program, args, {
    encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function inspectDirectory(directory) {
  try {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) {
      return { path: directory, status: 'skipped_symlink' };
    }
    if (!stat.isDirectory()) return { path: directory, status: 'not_directory' };
    const output = run('/usr/bin/du', ['-sk', directory]);
    const allocatedKiB = Number(output.split(/\s/, 1)[0]);
    if (!Number.isFinite(allocatedKiB)) throw Error('Invalid du result');
    return { path: directory, status: 'present', allocatedKiB };
  } catch (error) {
    return { path: directory, status: error.code === 'ENOENT' ? 'missing' : 'error' };
  }
}

const definitions = [
  ['npm-downloads', '.npm/_cacache', 'download_cache'],
  ['pip-downloads', 'Library/Caches/pip', 'download_cache'],
  ['chrome-http', 'Library/Caches/Google/Chrome/Default/Cache', 'browser_cache'],
  ['chrome-code', 'Library/Caches/Google/Chrome/Default/Code Cache', 'browser_cache'],
  ['brave-http', 'Library/Caches/BraveSoftware/Brave-Browser/Default/Cache', 'browser_cache'],
  ['brave-code', 'Library/Caches/BraveSoftware/Brave-Browser/Default/Code Cache', 'browser_cache'],
  ['npx-tools', '.npm/_npx', 'tool_environment_review_required'],
  ['uv-cache', '.cache/uv', 'package_cache_review_required'],
  ['codex-runtimes', '.cache/codex-runtimes', 'runtime_keep'],
  ['playwright-browsers', 'Library/Caches/ms-playwright', 'runtime_keep'],
  ['claude-vm', 'Library/Application Support/Claude/vm_bundles', 'runtime_keep'],
  ['codex-plugins', '.codex/plugins', 'plugin_bundle_review_required'],
];
const directories = definitions.map(([id, relative, category]) => ({
  id, category, ...inspectDirectory(targetPath(relative)),
}));

const skills = [];
const skillRoots = [];
for (const relative of ['.codex/skills', '.agents/skills']) {
  const root = targetPath(relative);
  const rootState = inspectDirectory(root);
  skillRoots.push(rootState);
  if (rootState.status !== 'present') continue;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
    const skillDirectory = path.join(root, entry.name);
    const skillState = inspectDirectory(skillDirectory);
    if (skillState.status !== 'present') continue;
    const instructions = path.join(skillDirectory, 'SKILL.md');
    try {
      const stat = fs.lstatSync(instructions);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
        skills.push({ ...skillState, directoryName: entry.name, instructionsStatus: 'skipped', lastUsed: null });
        continue;
      }
      const content = fs.readFileSync(instructions);
      const frontmatter = content.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const matchedName = frontmatter?.[1].match(/^name:\s*(["']?)([^\r\n"']+)\1\s*$/m);
      skills.push({
        ...skillState, name: matchedName?.[2].trim() || entry.name,
        instructionsSHA256: crypto.createHash('sha256').update(content).digest('hex'),
        lastUsed: null,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        skills.push({ ...skillState, directoryName: entry.name, instructionsStatus: 'error', lastUsed: null });
      }
    }
  }
}
const byName = new Map();
for (const skill of skills) {
  if (!skill.name) continue;
  const matches = byName.get(skill.name) || [];
  matches.push(skill);
  byName.set(skill.name, matches);
}
const duplicates = [...byName.entries()].filter(([, items]) => items.length > 1).map(([name, items]) => ({
  name, paths: items.map(item => item.path),
  sameInstructions: new Set(items.map(item => item.instructionsSHA256)).size === 1,
  wholeDirectoryEquality: 'not_checked',
}));
function probe(program, args) {
  try { return { status: 'ok', output: run(program, args) }; }
  catch { return { status: 'unavailable' }; }
}
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(), readOnly: true,
  scope: 'Known macOS cache/runtime directories and standalone skills only; no usage-log or project scan.',
  directories, skillRoots, skills, duplicates,
  system: {
    disk: probe('/bin/df', ['-k', '/System/Volumes/Data']),
    physicalMemory: probe('/usr/sbin/sysctl', ['-n', 'hw.memsize']),
    memoryPressure: probe('/usr/sbin/sysctl', ['kern.memorystatus_vm_pressure_level']),
    swap: probe('/usr/sbin/sysctl', ['vm.swapusage']),
  },
  limitations: [
    'Allocated directory size is not a promised amount of reclaimable disk space.',
    'Directory names and SKILL.md equality do not establish safety to delete.',
    'Skill last-use times are unknown; no timestamps are treated as usage evidence.',
    'Plugin-provided skills and custom CODEX_HOME locations are not enumerated.',
    'Missing, inaccessible and symlinked directories are not counted as zero.',
  ],
}, null, 2));
