#!/usr/bin/env node
// Read-only, explicitly scoped metadata audit using Node.js built-ins only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const help = `Read-only workspace audit; no install or apply mode.
Usage: node workspace-audit.mjs [--workspace ABSOLUTE_PATH]...
       [--skills-root ABSOLUTE_PATH]... [--exclude ABSOLUTE_PATH]...
       [--max-depth 12] [--max-entries 100000]
No arguments display this help. No implicit scan of the current directory.
Only the skills mode reads file contents, and only direct SKILL.md files.
`;
const args = process.argv.slice(2);
if (!args.length || (args.length === 1 && args[0] === '--help')) {
  console.log(help);
  process.exit(0);
}
const requested = [];
const exclusions = [];
let maxDepth = 12;
let maxEntries = 100000;
function fail(message) { console.error(message); process.exit(2); }
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (!['--workspace', '--skills-root', '--exclude', '--max-depth', '--max-entries'].includes(flag)) {
    fail(`Unsupported option: ${flag}`);
  }
  const value = args[++i];
  if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
  if (flag === '--max-depth' || flag === '--max-entries') {
    const n = Number(value);
    const cap = flag === '--max-depth' ? 30 : 500000;
    if (!Number.isInteger(n) || n < 1 || n > cap) fail(`Invalid value for ${flag}`);
    if (flag === '--max-depth') maxDepth = n; else maxEntries = n;
    continue;
  }
  if (!path.isAbsolute(value)) fail(`${flag} requires an absolute path.`);
  const absolute = path.resolve(value);
  if (flag === '--exclude') exclusions.push(absolute);
  else requested.push({ path: absolute, mode: flag === '--workspace' ? 'workspace' : 'skills' });
}
if (!requested.length) fail('Specify at least one --workspace or --skills-root.');

const compare = p => process.platform === 'win32' ? p.toLowerCase() : p;
const equal = (a, b) => compare(a) === compare(b);
const within = (child, parent) => equal(child, parent) || compare(child).startsWith(compare(parent + path.sep));
const taskHome = path.resolve(os.homedir());
const forbidden = [taskHome, path.parse(taskHome).root, path.dirname(taskHome), os.tmpdir()];
// Skip before stat/content access. Users can add private folders with --exclude.
const sensitive = /^(?:\.git|\.ssh|\.gnupg|\.aws|\.azure|\.config|\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials?(?:\..*)?|secrets?(?:\..*)?|tokens?(?:\..*)?|passwords?(?:\..*)?|auth\.(?:json|ya?ml)|id_(?:rsa|ed25519|ecdsa)(?:\..*)?|.*\.(?:pem|key|p12|pfx|kdbx)|.*(?:passport|recovery[-_ ]?phrase|private[-_ ]?key|身份证|护照|银行卡|助记词).*)$/i;
function excluded(p) {
  return exclusions.some(root => within(p, root)) || p.split(path.sep).some(part => sensitive.test(part));
}
function validateRoot(p) {
  if (forbidden.some(root => equal(root, p))) return 'refused_broad_root';
  if (excluded(p)) return 'excluded';
  try {
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || !equal(fs.realpathSync(p), p)) return 'skipped_symlink';
    if (!stat.isDirectory()) return 'not_directory';
    return 'present';
  } catch (e) { return e.code === 'ENOENT' ? 'missing' : 'inaccessible'; }
}
const roots = requested.filter((r, i, all) => all.findIndex(x => equal(x.path, r.path) && x.mode === r.mode) === i);
// Overlapping roots would make a combined total ambiguous; report each independently.
const overlaps = [];
for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
  if (within(roots[i].path, roots[j].path) || within(roots[j].path, roots[i].path)) overlaps.push([roots[i].path, roots[j].path]);
}

let visited = 0;
const deadline = Date.now() + 30000;
function measure(root) {
  const result = { path: root, status: validateRoot(root), logicalBytes: 0, files: 0, directories: 0,
    complete: false, skipped: { excluded: 0, symlink: 0, inaccessible: 0, special: 0, depthLimit: 0, scanLimit: 0 }, topLevel: [] };
  if (result.status !== 'present') return result;
  const totals = new Map();
  function walk(p, depth, group) {
    if (excluded(p)) { result.skipped.excluded++; return; }
    if (visited >= maxEntries || Date.now() > deadline) { result.skipped.scanLimit++; return; }
    visited++;
    let stat;
    try { stat = fs.lstatSync(p); } catch { result.skipped.inaccessible++; return; }
    if (stat.isSymbolicLink()) { result.skipped.symlink++; return; }
    if (stat.isFile()) {
      result.files++; result.logicalBytes += stat.size;
      const bucket = totals.get(group) || { name: group, logicalBytes: 0, files: 0 };
      bucket.logicalBytes += stat.size; bucket.files++; totals.set(group, bucket); return;
    }
    if (!stat.isDirectory()) { result.skipped.special++; return; }
    result.directories++;
    if (depth >= maxDepth) { result.skipped.depthLimit++; return; }
    let directory;
    try { directory = fs.opendirSync(p); } catch { result.skipped.inaccessible++; return; }
    try {
      let entry;
      while ((entry = directory.readSync()) !== null) {
        if (visited >= maxEntries || Date.now() > deadline) { result.skipped.scanLimit++; break; }
        walk(path.join(p, entry.name), depth + 1, depth === 0 ? entry.name : group);
      }
    } catch { result.skipped.inaccessible++; }
    finally { directory.closeSync(); }
  }
  walk(root, 0, '.');
  result.complete = Object.values(result.skipped).every(n => n === 0);
  result.topLevel = [...totals.values()].sort((a, b) => b.logicalBytes - a.logicalBytes);
  return result;
}

const reports = roots.map(root => ({ mode: root.mode, ...measure(root.path) }));
const skills = [];
const skillScan = { checked: 0, excluded: 0, skipped: 0, limited: false };
for (const root of roots.filter(r => r.mode === 'skills')) {
  if (validateRoot(root.path) !== 'present') continue;
  const directory = fs.opendirSync(root.path);
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      if (skillScan.checked >= 1000 || Date.now() > deadline) { skillScan.limited = true; break; }
      skillScan.checked++;
      if (entry.name.startsWith('.') || !entry.isDirectory() || entry.isSymbolicLink()) { skillScan.skipped++; continue; }
      const folder = path.join(root.path, entry.name);
      const file = path.join(folder, 'SKILL.md');
      if (excluded(file)) { skillScan.excluded++; continue; }
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || !equal(fs.realpathSync(file), file)) {
          skillScan.skipped++; continue;
        }
        const content = fs.readFileSync(file);
        const frontmatter = content.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const name = frontmatter?.[1].match(/^name:\s*["']?([^\r\n"']+)/m)?.[1].trim() || entry.name;
        skills.push({ name, path: folder, instructionsSHA256: crypto.createHash('sha256').update(content).digest('hex'), lastUsed: null });
      } catch { skillScan.skipped++; }
    }
  } finally { directory.closeSync(); }
}
const names = new Map();
for (const skill of skills) {
  const members = names.get(skill.name) || [];
  if (!members.some(x => equal(x.path, skill.path))) members.push(skill);
  names.set(skill.name, members);
}
const duplicates = [...names].filter(([, members]) => members.length > 1).map(([name, members]) => ({
  name, paths: members.map(x => x.path), sameInstructions: new Set(members.map(x => x.instructionsSHA256)).size === 1,
  wholeDirectoryEquality: 'not_checked',
}));
console.log(JSON.stringify({
  readOnly: true, measuredAt: new Date().toISOString(), platform: process.platform,
  metrics: 'logical file bytes; not allocated or reclaimable disk space',
  limits: { maxEntries, maxDepth, seconds: 30 }, reports, overlaps, skills, skillScan, duplicates,
  limitations: [
    'No combined total: roots may overlap, and hardlinks or shared data may repeat.',
    'Complete is false whenever entries are skipped; unknown contents are not zero.',
    'Names, ages, sizes and matching SKILL.md files do not establish deletion safety.',
    'Only direct SKILL.md files are read in skills mode; project files are never read.',
    'Last use, plugin-provided skills, custom app settings and running jobs are not inspected.',
    'Exclusions match common sensitive names only; supply --exclude for other protected folders.',
  ],
}, null, 2));
