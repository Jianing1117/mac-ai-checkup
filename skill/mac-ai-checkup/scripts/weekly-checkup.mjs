#!/usr/bin/env node
// Weekly checkup (macOS). Read-only: reports what needs attention, never moves or deletes.
// Writes only when asked: --save-state (sizes for next week's comparison) and --out-dir (the report).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
if (argv.includes('--help')) {
  console.log(`用法：node weekly-checkup.mjs [--config <config.json>] [--save-state] [--out-dir <dir>] [--current-baseline]
  --config            个人配置，默认 ~/.local/share/mac-ai-checkup/config.json
  --save-state        把本次的磁盘和工具目录大小存下来，下周对比用
  --out-dir <dir>     把报告写成 <dir>/YYYY-MM-DD - 电脑体检.md（同名不覆盖）
  --current-baseline  只输出当前后台状态（JSON），用来填配置里的 baseline`);
  process.exit(0);
}
if (process.platform !== 'darwin') {
  console.error('weekly-checkup supports macOS only.');
  process.exit(2);
}

const expand = p => (p === '~' ? HOME : p && p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
const configPath = expand(opt('--config') || '~/.local/share/mac-ai-checkup/config.json');
const saveState = argv.includes('--save-state');
let cfg;
try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {
  console.error(`读不到配置 ${configPath}：${e.message}`);
  process.exit(2);
}
const statePath = expand(cfg.stateFile || path.join(path.dirname(configPath), 'state.json'));
const WS = cfg.workspace?.label || (cfg.workspace?.path ? path.basename(expand(cfg.workspace.path)) : '工作区');
const DAY = 86400000;
const NOW = Date.now();
const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.next', '.build', 'site-packages']);
const unchecked = [];

function run(program, args, timeout = 30000) {
  try {
    return execFileSync(program, args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return e.stdout ? String(e.stdout) : null;
  }
}
const gb = kib => (kib / 1048576).toFixed(kib >= 1048576 * 10 ? 0 : 1);
const mb = kib => Math.round(kib / 1024);
const size = kib => (kib >= 1048576 ? `${gb(kib)} GB` : `${mb(kib)} MB`);
const date = ms => new Date(ms).toISOString().slice(0, 10);
const tilde = p => p.replace(HOME, '~');

function duKiB(paths) {
  const out = {};
  for (let i = 0; i < paths.length; i += 50) {
    const text = run('/usr/bin/du', ['-sk', ...paths.slice(i, i + 50)], 300000) || '';
    for (const line of text.split('\n')) {
      const m = line.match(/^(\d+)\t(.+)$/);
      if (m) out[m[2]] = Number(m[1]);
    }
  }
  return out;
}
// Latest file mtime inside a folder; moving or renaming folders does not count as activity.
function lastTouched(dir, limit = 50000) {
  let latest = 0; let seen = 0;
  const stack = [dir];
  while (stack.length && seen < limit) {
    const cur = stack.pop();
    let st; try { st = fs.lstatSync(cur); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (!st.isDirectory()) { latest = Math.max(latest, st.mtimeMs); seen++; continue; }
    if (cur !== dir && SKIP.has(path.basename(cur))) continue;
    let names; try { names = fs.readdirSync(cur); } catch { continue; }
    for (const n of names) if (n !== '.DS_Store') stack.push(path.join(cur, n));
  }
  if (!latest) { try { latest = fs.statSync(dir).mtimeMs; } catch {} }
  return latest;
}
function children(dir) {
  try { return fs.readdirSync(dir).filter(n => n !== '.DS_Store' && n !== '.gitkeep').map(n => path.join(dir, n)); } catch { return null; }
}

// ---------- files ----------
function staleIn(dir, days, label) {
  const items = children(dir);
  if (!items) { unchecked.push(`${label}（${tilde(dir)} 打不开）`); return []; }
  const old = items.map(p => ({ p, t: lastTouched(p) })).filter(x => NOW - x.t > days * DAY);
  const sizes = duKiB(old.map(x => x.p));
  return old.map(x => ({ ...x, kib: sizes[x.p] || 0 })).sort((a, b) => b.kib - a.kib);
}
function checkWorkspace() {
  const ws = cfg.workspace; if (!ws) return [];
  const root = expand(ws.path); const found = [];
  const top = children(root);
  if (!top) { unchecked.push(`${WS}（${tilde(root)} 打不开）`); return found; }
  const allowed = new Set(ws.allowedTop || []);
  const stray = top.filter(p => !allowed.has(path.basename(p)));
  if (stray.length) found.push({ title: `${WS} 最上层多出来的（${stray.length}）`, hint: '按「文件放哪」归到 projects / outputs / scratch', rows: stray.map(p => [path.basename(p)]) });
  for (const [sub, days, hint] of [['scratch', ws.ageDays?.scratch ?? 30, '过程文件，点头就进废纸篓'], ['outputs', ws.ageDays?.outputs ?? 90, '问一句它该去哪（笔记软件、网盘、网站）或删掉']]) {
    const old = staleIn(path.join(root, sub), days, sub);
    if (old.length) found.push({ title: `${sub}/ 里 ${days} 天没动的（${old.length} 个，共 ${size(old.reduce((s, x) => s + x.kib, 0))}）`, hint, rows: old.map(x => [path.basename(x.p), size(x.kib), date(x.t)]), cols: ['名称', '大小', '最后改动'] });
  }
  const days = ws.ageDays?.projects ?? 90;
  const keep = new Set(ws.keepProjects || []);
  const idle = staleIn(path.join(root, 'projects'), days, 'projects').filter(x => !keep.has(path.basename(x.p)));
  if (idle.length) found.push({ title: `${days} 天没动的项目（${idle.length} 个）`, hint: '每个回一个字：「搬」＝推到私有仓库备份后挪到仓库文件夹，「删」＝进废纸篓，「留」＝还要做，以后不再问。搬和删之前都会先说清楚要动什么', rows: idle.map(x => [path.basename(x.p), isCode(x.p) ? '代码' : '其他', size(x.kib), date(x.t)]), cols: ['项目', '类型', '大小', '最后改动'] });
  return found;
}
function isCode(dir) {
  const marks = /^(\.git|package\.json|pyproject\.toml|requirements\.txt|Package\.swift|build\.sh|Makefile)$|\.(py|mjs|js|ts|tsx|swift|go|rs)$/;
  const names = children(dir) || [];
  return names.some(p => marks.test(path.basename(p)) || (fs.statSync(p).isDirectory() && (children(p) || []).some(q => marks.test(path.basename(q)))));
}
function checkLooseSpots() {
  const found = [];
  for (const spot of cfg.looseSpots || []) {
    const items = children(expand(spot.path));
    if (!items) { unchecked.push(`${spot.label}（打不开）`); continue; }
    const allowed = new Set(spot.allowed || []);
    const loose = items.filter(p => !path.basename(p).startsWith('.') && !allowed.has(path.basename(p)))
      .map(p => ({ p, t: lastTouched(p) })).filter(x => !spot.ageDays || NOW - x.t > spot.ageDays * DAY);
    if (!loose.length) continue;
    const sizes = duKiB(loose.map(x => x.p));
    const rows = loose.map(x => ({ ...x, kib: sizes[x.p] || 0 })).sort((a, b) => b.kib - a.kib);
    const cap = spot.maxRows || 20;
    const total = rows.reduce((s, x) => s + x.kib, 0);
    found.push({ title: `${spot.label}里${spot.ageDays ? ` ${spot.ageDays} 天没动的` : '散放的'}东西（${rows.length} 个，共 ${size(total)}）`, hint: (spot.hint || '放回该去的地方，或者删掉；要长期留着的加进配置的 allowed') + (rows.length > cap ? `。只列最大的 ${cap} 个` : ''), rows: rows.slice(0, cap).map(x => [path.basename(x.p), size(x.kib), date(x.t)]), cols: ['名称', '大小', '最后改动'] });
  }
  return found;
}
function checkProjectWork() {
  const ws = cfg.workspace; const found = [];
  if (!ws?.projectWorkDirs?.length) return found;
  const days = ws.ageDays?.projectWork ?? 30;
  for (const proj of children(path.join(expand(ws.path), 'projects')) || []) {
    for (const w of ws.projectWorkDirs) {
      const dir = path.join(proj, w);
      if (!fs.existsSync(dir)) continue;
      const old = staleIn(dir, days, `${path.basename(proj)}/${w}`);
      if (!old.length) continue;
      const total = old.reduce((s, x) => s + x.kib, 0);
      found.push({ title: `${path.basename(proj)}/${w}/ 里 ${days} 天没动的（${old.length} 个，共 ${size(total)}）`, hint: '项目里的过程文件；点头就进废纸篓，项目本身不动' + (old.length > 20 ? '。只列最大的 20 个' : ''), rows: old.slice(0, 20).map(x => [path.basename(x.p), size(x.kib), date(x.t)]), cols: ['名称', '大小', '最后改动'] });
    }
  }
  return found;
}
function checkExtraScratch() {
  const found = [];
  for (const ex of cfg.extraScratch || []) {
    const root = expand(ex.path);
    const days = children(root);
    if (!days) { unchecked.push(`${ex.label}（打不开）`); continue; }
    const skip = new Set(ex.skip || []); // 相对 path 的子文件夹，比如自动化固定对话在用的空文件夹
    const chats = (ex.depth === 2 ? days.flatMap(d => children(d) || []) : days).filter(p => !skip.has(path.relative(root, p)));
    const old = chats.map(p => ({ p, t: lastTouched(p) })).filter(x => NOW - x.t > (ex.ageDays || 30) * DAY);
    if (!old.length) continue;
    const sizes = duKiB(old.map(x => x.p));
    const rows = old.map(x => ({ ...x, kib: sizes[x.p] || 0 })).sort((a, b) => b.kib - a.kib);
    const total = rows.reduce((s, x) => s + x.kib, 0);
    found.push({ title: `${ex.label}里 ${ex.ageDays || 30} 天没动的（${rows.length} 个，共 ${size(total)}）`, hint: ex.hint || '列出最大的 10 个；点头就整批进废纸篓', rows: rows.slice(0, 10).map(x => [path.relative(root, x.p), size(x.kib), date(x.t)]), cols: ['文件夹', '大小', '最后改动'] });
  }
  return found;
}
function checkDownloads() {
  const d = cfg.downloads; if (!d) return [];
  const old = staleIn(expand(d.path), d.ageDays || 30, '下载').filter(x => x.kib >= (d.minMB || 100) * 1024);
  return old.length ? [{ title: `下载文件夹里 ${d.ageDays || 30} 天没动的大文件（${old.length} 个）`, hint: '装完的安装包、看完的资料可以删', rows: old.map(x => [path.basename(x.p), size(x.kib), date(x.t)]), cols: ['名称', '大小', '最后改动'] }] : [];
}

function checkBackupStamp() {
  const b = cfg.backupStamp; if (!b) return [];
  const file = expand(b.path);
  let st; try { st = fs.statSync(file); } catch { return [{ title: '找不到备份记录', hint: '备份可能从没跑过，或者备份位置变了；看一眼定时任务的运行记录', rows: [[tilde(file)]] }]; }
  const days = Math.floor((NOW - st.mtimeMs) / DAY);
  const text = (() => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } })();
  const failed = text.split('\n').filter(l => l.startsWith('没备份成功'));
  if (days <= (b.maxDays ?? 8) && !failed.length) return [];
  return [{ title: days > (b.maxDays ?? 8) ? `备份已经 ${days} 天没更新` : '上次备份有没成功的部分', hint: '看一眼定时任务的运行记录；备份停了没人发现，就是以前自动化悄悄失效的老问题', rows: [[`最后一次：${date(st.mtimeMs)}`], ...failed.map(l => [l])] }];
}

// ---------- repositories ----------
const normRemote = u => u.trim().toLowerCase().replace(/^git@github\.com:/, 'github.com/').replace(/^https?:\/\//, '').replace(/\.git$/, '');
function repoInfo(dir) {
  const st = run('git', ['-C', dir, 'status', '--porcelain=v1', '-b']);
  if (st == null) return null;
  const lines = st.split('\n').filter(Boolean);
  const head = (lines[0] || '').replace(/^## /, '');
  return {
    dir, branch: head.split('...')[0],
    ahead: Number(head.match(/ahead (\d+)/)?.[1] || 0),
    tracking: head.includes('...'),
    dirty: Math.max(0, lines.length - 1),
    remote: normRemote(run('git', ['-C', dir, 'remote', 'get-url', 'origin']) || ''),
  };
}
function findRepos(root, maxDepth, skipRoots) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || skipRoots.some(s => dir === s)) return;
    const names = (() => { try { return fs.readdirSync(dir); } catch { return []; } })();
    if (names.includes('.git') && dir !== HOME) { found.push(dir); return; }
    for (const n of names) {
      if (n.startsWith('.') || SKIP.has(n) || (dir === HOME && (cfg.repos?.skipHomeDirs || []).includes(n))) continue;
      const p = path.join(dir, n);
      try { if (fs.lstatSync(p).isDirectory()) walk(p, depth + 1); } catch {}
    }
  };
  walk(root, 0);
  return found;
}
function checkRepos() {
  const r = cfg.repos; if (!r) return [];
  const root = expand(r.root);
  const managed = [...(children(root) || []), ...(r.alsoScan || []).flatMap(d => children(expand(d)) || [])]
    .filter(d => fs.existsSync(path.join(d, '.git')));
  const stray = findRepos(HOME, r.strayDepth ?? 4, [root, ...(r.alsoScan || []).map(expand), ...(r.ignoreStray || []).map(expand)]);
  const infos = [...managed, ...stray].map(repoInfo).filter(Boolean);
  const found = [];
  const pending = infos.filter(i => i.ahead || i.dirty || !i.tracking);
  if (pending.length) found.push({ title: `仓库里没备份到 GitHub 的改动（${pending.length} 个）`, hint: '按上次同步的记录；确认是最新版再推送，推之前先问', rows: pending.map(i => [tilde(i.dir), i.branch, i.ahead ? `${i.ahead} 次提交没推` : '', i.dirty ? `${i.dirty} 个文件没提交` : '', i.tracking ? '' : '没连 GitHub 分支']), cols: ['仓库', '分支', '没推送', '没提交', '其他'] });
  const byRemote = {};
  for (const i of infos) if (i.remote) (byRemote[i.remote] ||= []).push(i.dir);
  const dups = Object.entries(byRemote).filter(([, dirs]) => dirs.length > 1);
  if (dups.length) found.push({ title: `同一个仓库有好几份（${dups.length} 组）`, hint: '先确认哪份最新，其余的核对后进废纸篓', rows: dups.map(([u, dirs]) => [u, dirs.map(tilde).join('<br>')]), cols: ['仓库', '位置'] });
  if (stray.length) found.push({ title: `放在仓库文件夹和 projects 以外的仓库（${stray.length} 个）`, hint: '做好的挪进仓库文件夹，在做的挪进 projects，不要的删', rows: stray.map(d => [tilde(d)]) });
  return found;
}

// ---------- tools and disk ----------
function readState() { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; } }
function checkTools(state, current) {
  const dirs = (cfg.toolDirs || []).map(expand).filter(d => fs.existsSync(d));
  const sizes = duKiB(dirs);
  Object.assign(current.tools, sizes);
  if (!state?.tools) return [];
  const limit = (cfg.growthAlertGB ?? 2) * 1048576;
  const grown = dirs.filter(d => sizes[d] != null && state.tools[d] != null && sizes[d] - state.tools[d] > limit);
  return grown.length ? [{ title: `工具的地盘一周内变大很多（${grown.length} 个）`, hint: '看是哪个 App 在攒缓存；用 App 自己的清理入口处理', rows: grown.map(d => [tilde(d), size(state.tools[d]), size(sizes[d])]), cols: ['位置', `上次（${state.date}）`, '现在'] }] : [];
}
function deletedButOpen() {
  const text = run('/usr/sbin/lsof', ['-nP', '+L1'], 60000);
  if (text == null) { unchecked.push('删了但还被占着的文件'); return []; }
  const byCmd = {};
  const seen = new Set(); // 同一个文件常被好几个进程同时打开，只算一次
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || f[4] !== 'REG') continue;
    const bytes = Number(f[6]); if (!Number.isFinite(bytes)) continue;
    const key = `${f[5]}:${f[8]}`;
    if (seen.has(key) || /^\/(System|usr)\//.test(f.slice(9).join(' '))) continue; // 系统只读卷上的文件链接数显示为 0，不是真删了
    seen.add(key);
    const cmd = f[0].replace(/\\x20/g, ' ');
    byCmd[cmd] = (byCmd[cmd] || 0) + bytes;
  }
  const total = Object.values(byCmd).reduce((s, b) => s + b, 0);
  if (total < (cfg.deletedOpenAlertGB ?? 1) * 1073741824) return [];
  const rows = Object.entries(byCmd).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, b]) => [c, size(b / 1024)]);
  return [{ title: `删了但还被程序占着的空间：${size(total / 1024)}`, hint: '退出这些程序或重启电脑，空间才会真正回来', rows, cols: ['程序', '占着'] }];
}
function checkTrash() {
  const text = run('/usr/bin/du', ['-sk', path.join(HOME, '.Trash')], 300000);
  const kib = Number((text || '').split(/\s/)[0]);
  if (!text || !Number.isFinite(kib)) { unchecked.push('废纸篓（没有权限看）'); return []; }
  if (kib < (cfg.trashAlertGB ?? 10) * 1048576) return [];
  return [{ title: `废纸篓里还有 ${size(kib)}`, hint: '移进废纸篓不腾空间，清空才算。确认没有要捞回的再清空；也可以在访达设置里打开"30 天后自动清空废纸篓"', rows: [['~/.Trash', size(kib)]], cols: ['位置', '大小'] }];
}
// Browsers and Electron apps (Feishu/Lark, Slack, ...) keep offline web caches in folders named "Service Worker".
function checkServiceWorkers() {
  const root = path.join(HOME, 'Library/Application Support');
  const text = run('/usr/bin/find', [root, '-maxdepth', '8', '-type', 'd', '-name', 'Service Worker', '-prune'], 180000);
  if (text == null) { unchecked.push('App 内置浏览器的离线缓存'); return []; }
  const dirs = text.split('\n').filter(Boolean);
  const sizes = duKiB(dirs);
  const byApp = {};
  for (const d of dirs) { const app = path.relative(root, d).split(path.sep)[0]; byApp[app] = (byApp[app] || 0) + (sizes[d] || 0); }
  const limit = (cfg.serviceWorkerAlertGB ?? 1) * 1048576;
  const rows = Object.entries(byApp).filter(([, k]) => k >= limit).sort((a, b) => b[1] - a[1]).map(([app, k]) => [app, size(k)]);
  return rows.length ? [{ title: `App 内置浏览器攒下的离线缓存（${rows.length} 个 App）`, hint: '浏览器和飞书这类 App 打开网页时攒下的，都能重建；登录状态、书签、密码不在这里。先退出 App，浏览器用自带的清理入口只清"缓存的图片和文件"', rows, cols: ['App', '大小'] }] : [];
}
function checkLocalModels() {
  const paths = cfg.localModelPaths || ['~/Library/Application Support/Google/Chrome/OptGuideOnDeviceModel'];
  const found = paths.map(expand).filter(p => fs.existsSync(p));
  if (!found.length) return [];
  const sizes = duKiB(found);
  const rows = found.filter(p => (sizes[p] || 0) >= 512 * 1024).map(p => [tilde(p), size(sizes[p])]);
  return rows.length ? [{ title: '浏览器自己下载的本地 AI 模型', hint: '给浏览器内置的 AI 功能在本机运行用的（Chrome 的是 Gemini Nano）；网页版的 Gemini、ChatGPT 用不到它。不需要就删，Chrome 用到时会自己重新下载', rows, cols: ['位置', '大小'] }] : [];
}
function bigLogs() {
  const limitKiB = (cfg.bigLogMB ?? 200) * 1024; const rows = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    for (const p of children(dir) || []) {
      let st; try { st = fs.lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!SKIP.has(path.basename(p))) walk(p, depth + 1); }
      else if (/\.(log|out|err|txt)$|log/i.test(path.basename(p)) && st.size / 1024 > limitKiB) rows.push([tilde(p), size(st.size / 1024), date(st.mtimeMs)]);
    }
  };
  for (const r of cfg.logRoots || []) walk(expand(r), 0);
  return rows.length ? [{ title: `特别大的日志（${rows.length} 个）`, hint: '日志一直在长通常说明有程序在反复报错，先看是谁', rows, cols: ['文件', '大小', '最后写入'] }] : [];
}

// ---------- background ----------
function launchAgents() {
  const dir = path.join(HOME, 'Library/LaunchAgents');
  return (children(dir) || []).filter(p => p.endsWith('.plist')).map(p => {
    const label = path.basename(p, '.plist');
    const argsJson = run('/usr/bin/plutil', ['-extract', 'ProgramArguments', 'json', '-o', '-', p]) || run('/usr/bin/plutil', ['-extract', 'Program', 'json', '-o', '-', p]);
    let program = []; try { program = [].concat(JSON.parse(argsJson || '[]')); } catch {}
    const info = run('/bin/launchctl', ['print', `gui/${process.getuid()}/${label}`]) || '';
    const exit = info.match(/last exit code = (-?\d+)/)?.[1];
    return { label, program, loaded: info.includes('state ='), running: /state = running/.test(info), exit: exit == null ? null : Number(exit) };
  });
}
function listening() {
  const text = run('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']);
  if (text == null) { unchecked.push('常开的端口'); return []; }
  const seen = new Map();
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/); if (f.length < 9) continue;
    const port = f[8].split(':').pop();
    seen.set(`${f[0]}:${port}`, { cmd: f[0].replace(/\\x20/g, ' '), port, pid: f[1] });
  }
  return [...seen.values()];
}
function keepAwake() {
  const text = run('/usr/bin/pmset', ['-g', 'assertions']);
  if (text == null) { unchecked.push('保持唤醒'); return []; }
  const holders = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/pid \d+\(([^)]+)\): \[[^\]]*\] (\d+):(\d+):(\d+) (PreventUserIdleSystemSleep|PreventSystemSleep|NoIdleSleepAssertion)/);
    if (m) holders.set(m[1], Math.max(holders.get(m[1]) || 0, m[2] * 3600 + m[3] * 60 + Number(m[4])));
  }
  return [...holders].map(([name, secs]) => ({ name, secs }));
}
function loginItems() {
  if (cfg.checkLoginItems === false) return null;
  const text = run('/usr/bin/osascript', ['-e', 'tell application "System Events" to get the name of every login item'], 15000);
  if (text == null) { unchecked.push('开机自启的 App（没有权限问 System Events）'); return null; }
  return text.trim() ? text.trim().split(/,\s*/) : [];
}
function codexAutomations() {
  const dir = path.join(HOME, '.codex/automations');
  return (children(dir) || []).filter(p => fs.statSync(p).isDirectory()).map(p => {
    const toml = (() => { try { return fs.readFileSync(path.join(p, 'automation.toml'), 'utf8'); } catch { return null; } })();
    return { id: path.basename(p), name: toml?.match(/^name = "(.*)"$/m)?.[1] ?? null, status: toml?.match(/^status = "(.*)"$/m)?.[1] ?? null };
  });
}
function binLinksIntoProtected() {
  const bad = [];
  for (const d of cfg.binDirs || []) {
    for (const p of children(expand(d)) || []) {
      let real; try { if (!fs.lstatSync(p).isSymbolicLink()) continue; real = fs.realpathSync(p); } catch { continue; }
      if (/^\/Users\/[^/]+\/(Documents|Desktop|Downloads)\//.test(real)) bad.push([tilde(p), tilde(real)]);
    }
  }
  return bad;
}
function checkBackground() {
  const b = cfg.baseline || {}; const found = [];
  const agents = launchAgents();
  const newAgents = agents.filter(a => !(b.launchAgents || []).includes(a.label));
  const gone = (b.launchAgents || []).filter(l => !agents.some(a => a.label === l));
  if (newAgents.length || gone.length) found.push({ title: '开机自启的后台服务有变化', hint: '新出现的：问清是谁装的、还要不要；消失的：确认是有意删的', rows: [...newAgents.map(a => ['新出现', a.label, a.program.join(' ').slice(0, 80)]), ...gone.map(l => ['消失了', l, ''])], cols: ['变化', '名称', '运行什么'] });
  const quiet = new Set(b.ignoreAgentStatus || []);
  const failing = agents.filter(a => !quiet.has(a.label) && a.exit != null && a.exit !== 0 && !a.running);
  const notLoaded = agents.filter(a => !quiet.has(a.label) && !a.loaded);
  if (failing.length || notLoaded.length) found.push({ title: '后台服务可能在悄悄失败', hint: '看它的日志；失效了几个月没人发现，就是从这里开始的', rows: [...failing.map(a => [a.label, `上次退出码 ${a.exit}`]), ...notLoaded.map(a => [a.label, '有配置文件但没加载'])], cols: ['名称', '情况'] });
  const risky = agents.filter(a => a.program.some(x => /^\/Users\/[^/]+\/(Documents|Desktop|Downloads)\//.test(String(x))));
  const links = binLinksIntoProtected();
  if (risky.length || links.length) found.push({ title: '后台程序放在了 macOS 保护的文件夹里', hint: '后台服务读不到文稿、桌面、下载，会一直报错；挪到 ~/.local/share/', rows: [...risky.map(a => [a.label, a.program.find(x => /\/(Documents|Desktop|Downloads)\//.test(String(x)))]), ...links], cols: ['谁', '指向'] });
  const items = loginItems();
  if (items) {
    const newItems = items.filter(n => !(b.loginItems || []).includes(n));
    if (newItems.length) found.push({ title: `新出现的开机自启 App（${newItems.length}）`, hint: '问清还要不要开机就启动', rows: newItems.map(n => [n]) });
  }
  const ports = listening().filter(p => !(b.listenCommands || []).includes(p.cmd));
  if (ports.length) found.push({ title: `新出现的常开端口（${ports.length}）`, hint: '多半是 AI 开了预览服务器忘了关；确认后关掉', rows: ports.map(p => [p.cmd, p.port, p.pid]), cols: ['程序', '端口', '进程号'] });
  const maxSecs = (cfg.keepAwakeMaxHours ?? 2) * 3600;
  const awake = keepAwake().filter(h => !(b.keepAwake || []).includes(h.name) || (h.secs > maxSecs && !(b.keepAwakeSystem || []).includes(h.name)));
  if (awake.length) found.push({ title: '正在阻止电脑睡眠的程序', hint: `不认识的，或者连续超过 ${cfg.keepAwakeMaxHours ?? 2} 小时的；确认是在跑重要任务，否则退出它`, rows: awake.map(h => [h.name, `${Math.floor(h.secs / 3600)} 小时 ${Math.floor(h.secs % 3600 / 60)} 分`]), cols: ['程序', '已经连续'] });
  const autos = codexAutomations();
  const known = b.codexAutomations || [];
  const newAutos = autos.filter(a => a.name && !known.includes(a.name));
  const goneAutos = known.filter(n => !autos.some(a => a.name === n));
  const leftovers = autos.filter(a => !a.name);
  if (newAutos.length || goneAutos.length || leftovers.length) found.push({ title: 'Codex 自动化有变化', hint: '新增的确认是谁建的、还要不要；只剩残留文件夹的可以清', rows: [...newAutos.map(a => ['新增', `${a.name}（${a.status}）`]), ...goneAutos.map(n => ['不见了', n]), ...leftovers.map(a => ['只剩文件夹', `~/.codex/automations/${a.id}`])], cols: ['变化', '自动化'] });
  return found;
}
function checkSecrets() {
  const ws = cfg.workspace; if (!ws) return [];
  const pattern = /(^\.env($|\.)|auth|credential|secret|token|password|private[-_]?key|密钥|密码)/i;
  const known = new Set((cfg.baseline?.knownSecretPaths || []).map(expand));
  const rows = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    for (const p of children(dir) || []) {
      const n = path.basename(p);
      if (SKIP.has(n)) continue;
      if (pattern.test(n) && !known.has(p) && !/\.(md|js|mjs|ts|tsx|py|html|css|json)$|\.(example|sample|template)$/i.test(n)) rows.push([tilde(p)]);
      try { if (fs.lstatSync(p).isDirectory()) walk(p, depth + 1); } catch {}
    }
  };
  walk(expand(ws.path), 0);
  return rows.length ? [{ title: `${WS} 里名字像凭证的东西（${rows.length}）`, hint: '没有打开看；是凭证就挪到加密的地方（钥匙串、密码管理器或加密磁盘映像），不是就加进配置的 knownSecretPaths', rows }] : [];
}

// ---------- baseline helper ----------
if (argv.includes('--current-baseline')) {
  console.log(JSON.stringify({
    launchAgents: launchAgents().map(a => a.label),
    loginItems: loginItems() || [],
    listenCommands: [...new Set(listening().map(p => p.cmd))],
    keepAwake: keepAwake().map(h => h.name),
    codexAutomations: codexAutomations().filter(a => a.name).map(a => a.name),
  }, null, 2));
  process.exit(0);
}

// ---------- report ----------
const state = readState();
const current = { date: date(NOW), tools: {} };
const fsInfo = fs.statfsSync('/');
current.freeKiB = Math.round(fsInfo.bavail * fsInfo.bsize / 1024);
const sections = [
  ...checkBackupStamp(), ...checkWorkspace(), ...checkProjectWork(), ...checkExtraScratch(), ...checkLooseSpots(), ...checkDownloads(), ...checkRepos(),
  ...checkTools(state, current), ...deletedButOpen(), ...checkTrash(), ...checkServiceWorkers(), ...checkLocalModels(), ...bigLogs(), ...checkBackground(), ...checkSecrets(),
];
const lines = [`# 电脑体检 ${current.date}`, ''];
const freeLine = `磁盘可用 ${size(current.freeKiB)}` + (state?.freeKiB ? `（上次 ${state.date}：${size(state.freeKiB)}）` : '');
lines.push(`${freeLine}。${sections.length ? `有 ${sections.length} 项需要你看。` : '没有需要处理的。'}`);
if (current.freeKiB < (cfg.lowDiskGB ?? 50) * 1048576) lines.push('', `**磁盘可用少于 ${cfg.lowDiskGB ?? 50} GB。**`);
sections.forEach((s, i) => {
  lines.push('', `## ${i + 1}. ${s.title}`, '', `建议：${s.hint}`, '');
  const cols = s.cols || ['位置'];
  lines.push(`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`);
  for (const r of s.rows) lines.push(`| ${r.map(c => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
});
if (unchecked.length) lines.push('', '## 这次没查成的', '', ...unchecked.map(u => `- ${u}`), '', '没查成不等于没问题。');
lines.push('', '---', '', '这份报告只列异常，没有动任何文件。要清理，回复要处理哪几项；都会先进废纸篓。');
const report = lines.join('\n') + '\n';

if (saveState) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(current, null, 2));
}
const outDir = opt('--out-dir');
if (outDir) {
  const base = path.join(expand(outDir), `${current.date} - 电脑体检`);
  let file = `${base}.md`;
  for (let n = 2; fs.existsSync(file); n++) file = `${base}-${n}.md`;
  fs.writeFileSync(file, report);
  console.log(`报告已写入 ${file}`);
}
process.stdout.write(report);
