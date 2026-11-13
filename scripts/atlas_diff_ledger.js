/* 帧间差异台账（v2）
 * 数据源：js/atlas_snapshots.js（= build 后线上用的完整帧，含跨帧引用展开后的几何）
 * 对每个朝代相邻帧比较政权面积 / 外包框中心，得出：
 *   - 真实疆域变动（核心政权）
 *   - 图层口径变化（周边政权整批出现/消失，不算疆域变动）
 *   - 空转帧（几乎零变化 → 该帧基本是抄前一帧）
 * 输出：data/atlas/diff_ledger.json、帧间差异台账.md
 */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.resolve('js/atlas_snapshots.js'));
const SNAPS = global.window.ATLAS_SNAPSHOTS;
const MAP_DATA = fs.readFileSync('js/map_data.js', 'utf8');

const CORE = new Set(
  '秦 楚 齐 燕 赵 魏 韩 鲁 宋 卫 郑 中山 周 越 吴 蜀 巴 莒 蔡 杞 邾 滕 薛 许 义渠 鲜虞 曾 随 陈 曹 虞 晋 智 范 中行 代 东胡 匈奴 林胡 楼烦'.split(' ')
);

// 是否计入“疆域变动”：有 role 的按 role 判定（neighbor = 画幅外的周边政权，
// 其整批出现/消失属于图层口径）；无 role 的回退到春秋战国政权白名单。
// 早期版本只认白名单，导致明清的哈密卫、乌斯藏等保护国（role=protectorate）
// 消失被误判为“图层口径变化”，进而把真实变动记成零变动。
const isCore = (c) => (c.role ? c.role !== 'neighbor' : CORE.has(c.title));

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
function polyArea(coords) {
  let outer = 0;
  let holes = 0;
  for (let i = 0; i < coords.length; i++) {
    const a = ringArea(coords[i]);
    if (i === 0) outer += a;
    else holes += a;
  }
  return Math.max(0, outer - holes);
}
function shapeArea(g) {
  if (!g) return 0;
  if (g.type === 'Polygon') return polyArea(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, p) => s + polyArea(p), 0);
  return 0;
}
function shapeBbox(g) {
  const b = [1e9, 1e9, -1e9, -1e9];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < b[0]) b[0] = c[0];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[1] > b[3]) b[3] = c[1];
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  if (g && g.coordinates) walk(g.coordinates);
  return b;
}

function parseDynasties() {
  const keyHits = [...MAP_DATA.matchAll(/"key":\s*"([a-z0-9_]+)"/g)].map((m) => ({ key: m[1], pos: m.index }));
  const phaseHits = [...MAP_DATA.matchAll(/"phases":\s*\[([\s\S]*?)\]/g)].map((m) => ({ body: m[1], pos: m.index }));
  const out = [];
  for (const ph of phaseHits) {
    let owner = null;
    for (const k of keyHits) if (k.pos < ph.pos) owner = k;
    if (!owner) continue;
    const phases = [];
    const objRe = /\{([^{}]*)\}/g;
    let q;
    while ((q = objRe.exec(ph.body))) {
      const sm = q[1].match(/"snap":\s*"([^"]+)"/);
      const um = q[1].match(/"until":\s*(-?\d+)/);
      if (sm && um) phases.push({ until: Number(um[1]), snap: sm[1] });
    }
    if (!phases.length) continue;
    const fy = MAP_DATA.slice(owner.pos).match(/"fromYear":\s*(-?\d+)/);
    const ty = MAP_DATA.slice(owner.pos).match(/"toYear":\s*(-?\d+)/);
    if (!fy) continue;
    out.push({ key: owner.key, fromYear: Number(fy[1]), toYear: ty ? Number(ty[1]) : 0, phases });
  }
  return out;
}

const dynasties = parseDynasties();
const report = { generatedAt: new Date().toISOString(), dynasties: [] };
const md = ['# 帧间差异台账', '', '数据源：`js/atlas_snapshots.js`（线上实际渲染的完整帧）。面积单位 deg²，中心位移为外包框中心在经/纬方向的位移（度）。', ''];
const rows = [];

for (const dyn of dynasties) {
  const frames = [];
  for (const ph of dyn.phases) {
    const snap = SNAPS[ph.snap];
    if (!snap) continue;
    const items = [];
    for (const p of snap.polities || []) {
      const area = shapeArea(p.shape);
      const bb = shapeBbox(p.shape);
      items.push({
        title: p.title,
        role: p.role || '',
        area,
        cx: (bb[0] + bb[2]) / 2,
        cy: (bb[1] + bb[3]) / 2,
        has: !!p.shape,
      });
    }
    frames.push({ snap: ph.snap, until: ph.until, caption: snap.caption || '', note: snap.note || '', items });
  }
  if (frames.length < 2) continue;

  md.push(`## ${dyn.key}（${dyn.fromYear} 起，${frames.length} 帧）`, '');
  const dynReport = { key: dyn.key, pairs: [] };

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const pm = new Map(prev.items.map((x) => [x.title, x]));
    const cm = new Map(cur.items.map((x) => [x.title, x]));
    const changes = [];
    for (const [title, c] of cm) {
      const p = pm.get(title);
      if (!p) {
        changes.push({ title, kind: '新增', delta: c.area, area: c.area, dx: 0, dy: 0, role: c.role });
        continue;
      }
      const delta = c.area - p.area;
      const dx = c.cx - p.cx;
      const dy = c.cy - p.cy;
      if (Math.abs(delta) >= 0.1 || Math.abs(dx) >= 0.05 || Math.abs(dy) >= 0.05) {
        changes.push({ title, kind: delta >= 0 ? '增' : '减', delta, area: c.area, dx, dy, role: c.role });
      }
    }
    for (const [title, p] of pm) {
      if (!cm.has(title)) changes.push({ title, kind: '消失', delta: -p.area, area: 0, dx: 0, dy: 0, role: p.role });
    }

    // 更名配对：A 消失 + B 新增，面积与质心高度接近时视为同一实体的改名（改朝换代、机构改名），
    // 合并成一条「更名」，避免台账把同一块地读成「丢失 + 新增」。
    const gone = changes.filter((c) => c.kind === '消失');
    const fresh = changes.filter((c) => c.kind === '新增');
    for (const a of gone) {
      if (a._paired) continue;
      for (const b of fresh) {
        if (b._paired) continue;
        const pa = pm.get(a.title);
        const ca = cm.get(b.title);
        if (!pa || !ca) continue;
        if (String(pa.role) !== String(ca.role)) continue;
        const big = Math.max(pa.area, ca.area);
        if (big <= 0.5) continue;
        if (Math.abs(ca.area - pa.area) / big > 0.2) continue;
        if (Math.hypot(ca.cx - pa.cx, ca.cy - pa.cy) > 1.5) continue;
        a._paired = true;
        b._paired = true;
        changes.push({
          title: `${a.title} → ${b.title}`,
          kind: '更名',
          delta: ca.area - pa.area,
          area: ca.area,
          dx: ca.cx - pa.cx,
          dy: ca.cy - pa.cy,
          role: b.role || a.role,
        });
      }
    }
    for (let i = changes.length - 1; i >= 0; i--) if (changes[i]._paired) changes.splice(i, 1);

    const core = changes.filter((c) => isCore(c));
    const other = changes.filter((c) => !isCore(c));
    core.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const span = cur.until - prev.until;
    const intensity = core.reduce((s, c) => s + Math.abs(c.delta), 0);
    const layerShift = other.filter((c) => c.kind === '新增' && c.area > 20).length >= 4;

    const label = `${prev.snap} → ${cur.snap}（${prev.until} → ${cur.until}，跨 ${span} 年）`;
    md.push(`### ${label}`, '');
    if (!core.length && !layerShift) {
      md.push('无实质变动（核心政权面积、中心均在阈值内）——**该帧是上一帧的复制，不含独立史实信息**。', '');
      dynReport.pairs.push({ from: prev.snap, to: cur.snap, fromYear: prev.until, toYear: cur.until, span, empty: true, intensity: 0, changes: [] });
      rows.push({ dyn: dyn.key, pair: label, to: cur.snap, span, intensity: 0, empty: true, caption: cur.caption, prevCaption: prev.caption });
      continue;
    }
    if (layerShift) {
      md.push(`> 另有 ${other.filter((c) => c.kind === '新增' && c.area > 20).length} 个域外政权图层整批出现，属图层口径变化，非疆域变动。`, '');
    }
    if (core.length) {
      md.push('| 政权 | 变动 | 面积变化 | 现面积 | 中心位移(经/纬) |', '|---|---|---|---|---|');
      for (const c of core) {
        const d = (c.delta >= 0 ? '+' : '') + c.delta.toFixed(2);
        const dxy = `${c.dx >= 0 ? '+' : ''}${c.dx.toFixed(2)} / ${c.dy >= 0 ? '+' : ''}${c.dy.toFixed(2)}`;
        md.push(`| ${c.title} | ${c.kind} | ${d} | ${c.area.toFixed(2)} | ${dxy} |`);
      }
    } else {
      md.push('核心政权无变动。', '');
    }
    if (other.length) {
      md.push('', `另有 ${other.length} 个域外/边缘政权增减（合计 ${other.reduce((s, c) => s + c.delta, 0).toFixed(2)} deg²）。`);
    }
    if (cur.caption) md.push('', `帧内文案（caption）：${cur.caption}`);
    md.push('');
    dynReport.pairs.push({
      from: prev.snap,
      to: cur.snap,
      fromYear: prev.until,
      toYear: cur.until,
      span,
      empty: false,
      intensity: Math.round(intensity * 100) / 100,
      changes: core.map((c) => ({ title: c.title, kind: c.kind, delta: Math.round(c.delta * 100) / 100, area: Math.round(c.area * 100) / 100, dx: Math.round(c.dx * 100) / 100, dy: Math.round(c.dy * 100) / 100 })),
    });
    rows.push({ dyn: dyn.key, pair: label, to: cur.snap, span, intensity: Math.round(intensity * 100) / 100, empty: false, caption: cur.caption, prevCaption: prev.caption });
  }
  report.dynasties.push(dynReport);
}

md.push('## 汇总：变动强度 × 时间跨度', '', '按“每 10 年核心政权面积变动”排序，用于判断哪些段落被压缩得最厉害。', '');
md.push('| 朝代 | 帧间 | 跨年 | 核心变动 deg² | 每 10 年 |', '|---|---|---|---|---|');
const scored = rows
  .filter((r) => r.span > 0)
  .map((r) => ({ ...r, per10: (r.intensity / r.span) * 10 }))
  .sort((a, b) => b.per10 - a.per10);
for (const r of scored.slice(0, 40)) {
  md.push(`| ${r.dyn} | ${r.pair} | ${r.span} | ${r.intensity} | ${r.per10.toFixed(2)} |`);
}
md.push('');
md.push('## 空转帧清单', '');
const empties = rows.filter((r) => r.empty);
if (!empties.length) md.push('无。');
/* 空转帧成因：三帧各自不同，必须逐帧说明，不能统一写成“待查”。 */
const EMPTY_CAUSE = {
  s_zhanguo_a: '拆帧设计：前 375 郑灭已单独立为下一帧 a375，本段无第二起边界事件',
  s_xijin_a2: '数据缺口：疆域沿用 306 年几何；永嘉之乱（311 洛阳陷落、晋失中原）后的州郡易手未逐郡建模，需州郡级边界数据才能切',
  s_tang_a5y: '史实如此：开元年间渤海册封、六诏未合，均未改变疆界',
};
for (const r of empties) md.push(`- ${r.dyn}：${r.pair} — ${EMPTY_CAUSE[r.to] || '成因未分类'}`);

md.push('');
md.push('## 校验：文案写了事，图上没变化', '');
md.push('下列帧间核心政权几何零变动，但当前帧 caption 陈述了疆域事件——说明该帧只是把上一帧的几何套了一个新年份，caption 是叙事而非几何。', '');
md.push('| 朝代 | 帧间 | 跨年 | 帧内 caption |', '|---|---|---|---|');
let captionConflict = 0;
for (const r of empties) {
  if (r.caption && r.caption.length > 6) {
    captionConflict++;
    md.push(`| ${r.dyn} | ${r.pair} | ${r.span} | ${r.caption} |`);
  }
}
if (!captionConflict) md.push('| — | 无 | — | — |');
md.push('');
md.push(`合计：空转 ${empties.length} / ${rows.length} 帧间，其中 ${captionConflict} 帧间“有文案无变化”。`);

md.push('');
md.push('## 长跨度 × 低变动（最该插帧的地方）', '');
md.push('跨 25 年以上、但核心政权累计变动 < 30 deg² 的帧间。跨度越长、变动越小，说明这几十年被压成了一张静态图。', '');
md.push('| 朝代 | 帧间 | 跨年 | 核心变动 deg² | 每 10 年 | 帧内 caption |', '|---|---|---|---|---|---|');
const sparse = rows
  .filter((r) => r.span >= 25 && r.intensity < 30)
  .sort((a, b) => b.span - a.span);
for (const r of sparse) {
  md.push(`| ${r.dyn} | ${r.pair} | ${r.span} | ${r.intensity} | ${((r.intensity / r.span) * 10).toFixed(2)} | ${r.caption || '—'} |`);
}
if (!sparse.length) md.push('| — | 无 | — | — | — | — |');

fs.writeFileSync('data/atlas/diff_ledger.json', JSON.stringify(report));
fs.writeFileSync('帧间差异台账.md', md.join('\n'), { encoding: 'utf8' });

const total = rows.length;
const emptyCount = empties.length;
console.log(`朝代 ${report.dynasties.length}，帧间 ${total}，空转 ${emptyCount}`);
console.log('\n变动最密集的前 12 个帧间：');
for (const r of scored.slice(0, 12)) {
  console.log(`  ${r.dyn.padEnd(9)} ${r.pair.padEnd(46)} 跨${String(r.span).padStart(3)}年  ${r.intensity.toFixed(1).padStart(6)} deg²  每10年 ${r.per10.toFixed(1)}`);
}
