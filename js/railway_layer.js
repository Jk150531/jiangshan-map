/* 中国铁路修建年代表层：站点按开通年份逐站出现，并按所属线路连成线，叠加在既有舆图之上。
   数据：window.RAILWAY_STATIONS（js/railway_data.js）
   口径：每站以其“启用年份”（维基数据 P1619/P571 + 人工核实的方志年份）为准，随年份滑杆逐站出现。 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (!Array.isArray(window.RAILWAY_STATIONS)) return;

  var DECADES = [
    [1880, '#8c2f22'],
    [1900, '#b4441f'],
    [1920, '#c9772a'],
    [1940, '#8a8b2c'],
    [1950, '#2f7a58'],
    [1960, '#256b7d'],
    [1970, '#2f4f8c'],
  ];
  // 大站：直辖市、省会、路网枢纽与口岸，站名常显；其余小站只在鼠标滑过时出名字。
  var MAJOR = {
    北京: 1, 天津: 1, 上海: 1, 重庆: 1, 石家庄: 1, 太原: 1, 呼和浩特: 1, 沈阳: 1, 长春: 1, 哈尔滨: 1,
    南京: 1, 杭州: 1, 合肥: 1, 福州: 1, 南昌: 1, 济南: 1, 郑州: 1, 武汉东: 1, 长沙: 1, 广州: 1,
    南宁: 1, 成都: 1, 贵阳: 1, 昆明: 1, 西安: 1, 兰州: 1, 西宁: 1, 银川: 1, 乌鲁木齐南: 1,
    大连: 1, 青岛: 1, 厦门: 1, 深圳: 1, 宁波: 1, 苏州: 1, 无锡: 1, 徐州: 1, 洛阳: 1, 襄阳: 1,
    九江: 1, 蚌埠: 1, 包头东: 1, 大同: 1, 唐山: 1, 山海关: 1, 张家口: 1, 齐齐哈尔: 1,
    牡丹江: 1, 佳木斯: 1, 锦州: 1, 丹东: 1, 吉林: 1, 四平: 1, 通化: 1, 承德: 1, 保定: 1, 邯郸: 1,
    新乡: 1, 商丘: 1, 株洲: 1, 衡阳: 1, 柳州: 1, 桂林: 1, 湛江: 1, 绵阳: 1, 攀枝花: 1,
    内江: 1, 宝鸡: 1, 天水: 1, 哈密: 1, 吐鲁番: 1, 满洲里: 1, 绥芬河: 1, 图们: 1, 集宁南: 1,
    鹰潭: 1, 金华: 1, 常州: 1, 连云港: 1, 烟台: 1, 潍坊: 1, 淄博: 1, 德州: 1,
  };
  // 线路本身的通车年：车站自身的启用年常在整条线路通车之前（该站先由别的老线开办），
  // 若只按站年画线，会提前画出当时并不存在的线路。这里对「现代才建成的线路」加一道闸门。
  var KEEP_GATE = { '京九铁路': 1 };
  var LINE_YEARS = {
    京九铁路: 1996,
    哈大客运专线: 2012,
    沪昆高速铁路: 2016,
    胶济客运专线: 2008,
    青藏鐵路: 2006,
    沈丹客运专线: 2015,
    沪杭客运专线: 2010,
    兰新客运专线: 2014,
    福厦铁路: 2010,
    甬台温铁路: 2009,
    合福高速铁路: 2015,
    京沈客运专线: 2018,
    京张高速铁路: 2019,
    京港高速铁路: 2019,
    石济客运专线: 2017,
    大西高速铁路: 2014,
    南广铁路: 2014,
    益湛铁路: 2011,
    向莆铁路: 2013,
    太中银铁路: 2011,
    集包铁路第二双线: 2012,
    唐包铁路: 2018,
    宁蓉铁路: 2013,
    海南西环高速铁路: 2015,
    临策铁路: 2009,
    京通铁路: 1977,
    内昆铁路: 1958,
    集通铁路: 1995,
    南疆铁路: 1984,
  };
  var NS = 'http://www.w3.org/2000/svg';
  var STATE = { on: true, group: null, app: null, lastYear: null, lines: null, hover: null, lineTip: null, lineEls: null, hotEls: null };

  function colorFor(year) {
    var c = DECADES[0][1];
    for (var i = 0; i < DECADES.length; i++) {
      if (year >= DECADES[i][0]) c = DECADES[i][1];
    }
    return c;
  }

  function fmtYear(y) {
    return y < 0 ? '公元前' + (-y) + '年' : y + '年';
  }

  function gateFor(name, arr) {
    var g0 = LINE_YEARS[name] || 0;
    if (!g0) return 0;
    if (KEEP_GATE[name]) return g0;
    var mn = 3000;
    for (var i = 0; i < arr.length; i++) if (arr[i].y < mn) mn = arr[i].y;
    return mn < g0 ? 0 : g0;
  }

  // 按线路分组，用主方向投影把同线各站排成有序折线（PCA 一维排序）
  function buildLines() {
    var groups = {};
    for (var i = 0; i < window.RAILWAY_STATIONS.length; i++) {
      var s = window.RAILWAY_STATIONS[i];
      var keys = [];
      if (s.l) keys.push(s.l);
      if (s.l2 && s.l2 !== s.l) keys.push(s.l2);
      if (s.l3 && s.l3 !== s.l && keys.indexOf(s.l3) < 0) keys.push(s.l3);
      for (var q = 0; q < keys.length; q++) {
        if (!groups[keys[q]]) groups[keys[q]] = [];
        groups[keys[q]].push(s);
      }
    }
    var out = [];
    // 有些线路字段写的是后来才通车的那条线（如“胶济客运专线”“哈大客运专线”），
    // 但组内站点本身是 1900 年代的老站；这类组不能套通车年闸门，否则整段历史线路会消失。
    for (var key in groups) {
      var arr = groups[key];
      if (arr.length < 2) continue;
      // 排序用最近邻链：先从离组中心最远的那站起步，然后每次接最近的未访问站。
      // 这样折线会顺着弯道走，不会像一维投影那样把弯道两侧的站排反（如漠河—塔河—加格达奇）。
      var sx = 0, sz = 0;
      for (var j = 0; j < arr.length; j++) { sx += arr[j].x; sz += arr[j].z; }
      sx /= arr.length; sz /= arr.length;
      var start = arr[0], far = -1;
      for (var k = 0; k < arr.length; k++) {
        var dx0 = arr[k].x - sx, dz0 = arr[k].z - sz;
        var dd = dx0 * dx0 + dz0 * dz0;
        if (dd > far) { far = dd; start = arr[k]; }
      }
      var used = [start];
      var rest = arr.filter(function (s3) { return s3 !== start; });
      while (rest.length) {
        var cur = used[used.length - 1], bi = 0, bn = 1e9;
        for (var r2 = 0; r2 < rest.length; r2++) {
          var ax = (rest[r2].x - cur.x) * 102.2, az = (rest[r2].z - cur.z) * 111.1;
          var an = Math.sqrt(ax * ax + az * az);
          if (an < bn) { bn = an; bi = r2; }
        }
        used.push(rest[bi]);
        rest.splice(bi, 1);
      }
      var ordered = used.map(function (s4) { return { s: s4 }; });
      out.push({ name: key, st: ordered, gate: gateFor(key, arr) });
    }
    // 只有一站、却没法和同线其他站相连的站（多为支线端点或同城独立站）：
    // 若 30 km 内还有别的站，就补一条虚线与路网接上，避免图上出现孤点。
    var linked = {};
    for (var m = 0; m < out.length; m++) {
      for (var n2 = 0; n2 < out[m].st.length; n2++) linked[out[m].st[n2].s.n] = 1;
    }
    var spurs = [];
    var all = window.RAILWAY_STATIONS;
    for (var p = 0; p < all.length; p++) {
      var host = all[p];
      if (linked[host.n]) continue;
      var best = null, bd = 1e9;
      for (var r = 0; r < all.length; r++) {
        var other = all[r];
        if (other.n === host.n || !linked[other.n]) continue;
        var dx2 = (other.x - host.x) * 102.2, dz2 = (other.z - host.z) * 111.1;
        var d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        if (d2 < bd) { bd = d2; best = other; }
      }
      if (best && bd <= 60) spurs.push({ a: host, b: best, y: Math.max(host.y, best.y), d: Math.round(bd) });
    }
    return { lines: out, spurs: spurs };
  }

  try { window.__railBuildLines = buildLines; } catch (e) {}

  function hideHover() {
    if (STATE.hover && STATE.hover.parentNode) STATE.hover.parentNode.removeChild(STATE.hover);
    STATE.hover = null;
  }

  function showHover(app, st) {
    hideHover();
    if (!STATE.group) return;
    var p = app.projector.toScreen(st.x, st.z);
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
    var lab = document.createElementNS(NS, 'text');
    lab.setAttribute('x', (p[0] + 3).toFixed(1));
    lab.setAttribute('y', (p[1] - 2.6).toFixed(1));
    lab.setAttribute('font-size', '3.6');
    lab.setAttribute('fill', '#1f1409');
    lab.setAttribute('paint-order', 'stroke');
    lab.setAttribute('stroke', 'rgba(255,252,244,.95)');
    lab.setAttribute('stroke-width', '0.9');
    lab.setAttribute('class', 'rail-label is-hover');
    lab.textContent = st.n;
    STATE.group.appendChild(lab);
    STATE.hover = lab;
  }

  function hideLineTip() {
    if (STATE.lineTip && STATE.lineTip.parentNode) STATE.lineTip.parentNode.removeChild(STATE.lineTip);
    STATE.lineTip = null;
  }

  function clearLineHot() {
    if (!STATE.hotEls) return;
    for (var i = 0; i < STATE.hotEls.length; i++) STATE.hotEls[i].classList.remove('is-hot');
    STATE.hotEls = null;
  }

  // 鼠标悬停线路段：整条同名线路加粗提亮 + 线段中点浮出线路名
  function highlightLine(name) {
    clearLineHot();
    var els = (STATE.lineEls && STATE.lineEls[name]) || [];
    for (var i = 0; i < els.length; i++) els[i].classList.add('is-hot');
    STATE.hotEls = els;
  }

  function showLineTip(txt, x, y) {
    hideLineTip();
    if (!STATE.group) return;
    // 放大字号并加圆角底牌：原来 3.6 号字压在细线上几乎看不清
    var FS = 5.4;
    var w = 0;
    for (var c = 0; c < txt.length; c++) w += txt.charCodeAt(c) > 255 ? FS : FS * 0.56;
    var wrap = document.createElementNS(NS, 'g');
    wrap.setAttribute('class', 'rail-line-tip-group');
    var box = document.createElementNS(NS, 'rect');
    box.setAttribute('x', (x - w / 2 - 2.1).toFixed(1));
    box.setAttribute('y', (y - 11.6).toFixed(1));
    box.setAttribute('width', (w + 4.2).toFixed(1));
    box.setAttribute('height', '7.6');
    box.setAttribute('rx', '1.7');
    box.setAttribute('ry', '1.7');
    box.setAttribute('fill', 'rgba(255,251,242,.97)');
    box.setAttribute('stroke', 'rgba(122,86,52,.78)');
    box.setAttribute('stroke-width', '0.6');
    wrap.appendChild(box);
    var lab = document.createElementNS(NS, 'text');
    lab.setAttribute('x', x.toFixed(1));
    lab.setAttribute('y', (y - 6.1).toFixed(1));
    lab.setAttribute('text-anchor', 'middle');
    lab.setAttribute('font-size', String(FS));
    lab.setAttribute('font-weight', '700');
    lab.setAttribute('fill', '#241505');
    lab.setAttribute('class', 'rail-label rail-line-tip');
    lab.textContent = txt;
    wrap.appendChild(lab);
    STATE.group.appendChild(wrap);
    STATE.lineTip = wrap;
  }

  // 透明的加宽命中线：让 0.9 宽的线段也有 4.5 宽的可悬停范围
  function addLineHit(name, ax, ay, bx, by) {
    if (!STATE.group) return;
    if (!STATE.lineEls[name]) STATE.lineEls[name] = [];
    var mx = (parseFloat(ax) + parseFloat(bx)) / 2;
    var my = (parseFloat(ay) + parseFloat(by)) / 2;
    var hit = document.createElementNS(NS, 'line');
    hit.setAttribute('x1', ax);
    hit.setAttribute('y1', ay);
    hit.setAttribute('x2', bx);
    hit.setAttribute('y2', by);
    hit.setAttribute('stroke-width', '4.5');
    hit.setAttribute('class', 'rail-hit');
    hit.setAttribute('data-line', name);
    hit.addEventListener('mouseenter', function () {
      highlightLine(name);
      showLineTip(name, mx, my);
    });
    hit.addEventListener('mouseleave', function () {
      clearLineHot();
      hideLineTip();
    });
    STATE.group.appendChild(hit);
    STATE.lineEls[name].push(hit);
  }

  function render(app) {
    if (!STATE.group) return;
    hideHover();
    hideLineTip();
    STATE.lineEls = {};
    STATE.hotEls = null;
    while (STATE.group.firstChild) STATE.group.removeChild(STATE.group.firstChild);
    if (!STATE.on) return;
    if (!STATE.lines) STATE.lines = buildLines();
    var year = app.year;
    var loc = app.locale === 'en';
    var shown = 0;
    var all = [];

    // 1) 先画线：同年份或更早的相邻站连成一段，段色随较晚那站的开通年
    for (var i = 0; i < STATE.lines.lines.length; i++) {
      var line = STATE.lines.lines[i];
      var gate = line.gate;
      if (gate > year) continue;
      var pts = [];
      for (var j = 0; j < line.st.length; j++) {
        var st = line.st[j].s;
        if (st.y > year) continue;
        var p = app.projector.toScreen(st.x, st.z);
        if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
        pts.push({ p: p, y: st.y });
      }
      if (pts.length < 2) continue;
      for (var k = 1; k < pts.length; k++) {
        var a = pts[k - 1], b = pts[k];
        var seg = document.createElementNS(NS, 'line');
        seg.setAttribute('x1', a.p[0].toFixed(1));
        seg.setAttribute('y1', a.p[1].toFixed(1));
        seg.setAttribute('x2', b.p[0].toFixed(1));
        seg.setAttribute('y2', b.p[1].toFixed(1));
        seg.setAttribute('stroke', colorFor(Math.max(a.y, b.y)));
        seg.setAttribute('stroke-width', Math.max(a.y, b.y) === year ? '1.6' : '0.9');
        seg.setAttribute('stroke-opacity', Math.max(a.y, b.y) === year ? '0.85' : '0.45');
        seg.setAttribute('stroke-linecap', 'round');
        seg.setAttribute('class', 'rail-line');
        seg.setAttribute('data-line', line.name);
        STATE.group.appendChild(seg);
        if (!STATE.lineEls[line.name]) STATE.lineEls[line.name] = [];
        STATE.lineEls[line.name].push(seg);
        addLineHit(line.name, seg.getAttribute('x1'), seg.getAttribute('y1'), seg.getAttribute('x2'), seg.getAttribute('y2'));
      }
    }

    // 1b) 孤站接续：单站线路若 30 km 内有邻站，用虚线接上（示意该站接入路网）
    for (var i2 = 0; i2 < STATE.lines.spurs.length; i2++) {
      var sp = STATE.lines.spurs[i2];
      if (sp.y > year) continue;
      var pa = app.projector.toScreen(sp.a.x, sp.a.z);
      var pb = app.projector.toScreen(sp.b.x, sp.b.z);
      if (!pa || !pb || !isFinite(pa[0]) || !isFinite(pb[0])) continue;
      var sp2 = document.createElementNS(NS, 'line');
      sp2.setAttribute('x1', pa[0].toFixed(1));
      sp2.setAttribute('y1', pa[1].toFixed(1));
      sp2.setAttribute('x2', pb[0].toFixed(1));
      sp2.setAttribute('y2', pb[1].toFixed(1));
      sp2.setAttribute('stroke', colorFor(sp.y));
      sp2.setAttribute('stroke-width', '0.8');
      sp2.setAttribute('stroke-opacity', '0.5');
      sp2.setAttribute('stroke-dasharray', '2,2');
      sp2.setAttribute('class', 'rail-line is-spur');
      sp2.setAttribute('data-line', '接续：' + sp.a.n + '—' + sp.b.n);
      STATE.group.appendChild(sp2);
      addLineHit('接续：' + sp.a.n + '—' + sp.b.n, sp2.getAttribute('x1'), sp2.getAttribute('y1'), sp2.getAttribute('x2'), sp2.getAttribute('y2'));
    }

    // 2) 再画站点点位
    for (var m = 0; m < window.RAILWAY_STATIONS.length; m++) {
      var s = window.RAILWAY_STATIONS[m];
      if (s.y > year) continue;
      var q = app.projector.toScreen(s.x, s.z);
      if (!q || !isFinite(q[0]) || !isFinite(q[1])) continue;
      shown++;
      var isNew = year - s.y <= 1;
      var r = isNew ? 2.6 : (s.y >= 1949 ? 1.5 : 1.3);
      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', q[0].toFixed(1));
      dot.setAttribute('cy', q[1].toFixed(1));
      dot.setAttribute('r', r.toFixed(1));
      dot.setAttribute('fill', colorFor(s.y));
      dot.setAttribute('stroke', isNew ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,0)');
      dot.setAttribute('stroke-width', isNew ? '0.7' : '5');
      dot.setAttribute('class', isNew ? 'rail-station is-new' : 'rail-station');
      var tip = s.n + (s.l ? ' · ' + s.l : '') + ' · ' + fmtYear(s.y) + '开通';
      var t = document.createElementNS(NS, 'title');
      t.textContent = loc ? s.n + ' Railway Station · opened ' + s.y : tip;
      dot.appendChild(t);
      STATE.group.appendChild(dot);
      all.push({ s: s, p: q, fresh: isNew });
      if (!MAJOR[s.n]) {
        (function (st, el) {
          el.addEventListener('mouseenter', function () { showHover(app, st); });
          el.addEventListener('mouseleave', hideHover);
        })(s, dot);
      }
    }

    // 3) 站名分两档：大站常显；小站只在鼠标滑过时出名字。
    var FS = 3.4;
    var labels = all.filter(function (it) { return MAJOR[it.s.n]; });
    labels.sort(function (a, b) { return b.s.y - a.s.y; });
    var boxes = [];
    for (var n = 0; n < labels.length; n++) {
      var it = labels[n];
      var name = it.s.n;
      var w = 0;
      for (var c = 0; c < name.length; c++) {
        w += name.charCodeAt(c) > 255 ? FS : FS * 0.56;
      }
      var lx = it.p[0] + 2.6;
      var ly = it.p[1] - 1.8;
      var x0 = lx, x1 = lx + w, y0 = ly - FS * 0.9, y1 = ly + FS * 0.35;
      var hit = false;
      for (var b = 0; b < boxes.length; b++) {
        var bb = boxes[b];
        if (x0 < bb[2] && x1 > bb[0] && y0 < bb[3] && y1 > bb[1]) { hit = true; break; }
      }
      if (hit) continue;
      boxes.push([x0, y0, x1, y1]);
      var lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', lx.toFixed(1));
      lab.setAttribute('y', ly.toFixed(1));
      lab.setAttribute('font-size', String(FS));
      lab.setAttribute('fill', '#3a2a1c');
      lab.setAttribute('paint-order', 'stroke');
      lab.setAttribute('stroke', 'rgba(255,252,244,.92)');
      lab.setAttribute('stroke-width', '0.8');
      lab.setAttribute('class', 'rail-label');
      lab.textContent = name;
      STATE.group.appendChild(lab);
    }

    STATE.lastYear = year;
    var counter = document.getElementById('txt-railway-count');
    if (counter) {
      counter.textContent = loc
        ? shown + ' stations by ' + year
        : shown + ' 站 · 截至 ' + year + ' 年';
    }
  }

  function init() {
    var app = window.atlasApp;
    if (!app || !app.projector) return;
    STATE.app = app;
    STATE.group = document.getElementById('grp-railway');
    if (!STATE.group) return;
    var chip = document.getElementById('chk-railway');
    STATE.on = chip ? chip.checked : true;
    if (chip) {
      chip.addEventListener('change', function () {
        STATE.on = chip.checked;
        render(app);
      });
    }
    var orig = app._renderDynasty;
    if (typeof orig === 'function') {
      app._renderDynasty = function (dynasty, prevSnap) {
        var r = orig.call(this, dynasty, prevSnap);
        render(this);
        return r;
      };
    }
    // 年份回拨/前拨都在 jumpToYear 里完成，而同朝代内它不会触发 _renderDynasty，
    // 必须单独挂这里，否则往回拖动滑杆时铁路站点与线不会消失。
    var origJump = app.jumpToYear;
    if (typeof origJump === 'function' && !app.__railWrappedJump) {
      app.jumpToYear = function (targetYear) {
        var r = origJump.apply(this, arguments);
        render(this);
        return r;
      };
      app.__railWrappedJump = true;
    }
    if (typeof app._renderAll === 'function' && !app.__railWrappedAll) {
      var origAll = app._renderAll;
      app._renderAll = function () {
        var r = origAll.apply(this, arguments);
        render(this);
        return r;
      };
      app.__railWrappedAll = true;
    }
    render(app);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 0);
    });
  } else {
    setTimeout(init, 0);
  }
})();
