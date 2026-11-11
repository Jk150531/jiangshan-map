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
  var NS = 'http://www.w3.org/2000/svg';
  // 线路本身的通车年：车站自身的启用年常在整条线路通车之前（该站先由别的老线开办），
  // 若只按站年画线，会提前画出当时并不存在的线路。这里对「现代才建成的线路」加一道闸门。
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
    内昆铁路: 2002,
    集通铁路: 1995,
    南疆铁路: 1984,
  };
  var STATE = { on: true, group: null, app: null, lastYear: null, lines: null };

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

  // 按线路分组，用主方向投影把同线各站排成有序折线（PCA 一维排序）
  function buildLines() {
    var groups = {};
    for (var i = 0; i < window.RAILWAY_STATIONS.length; i++) {
      var s = window.RAILWAY_STATIONS[i];
      if (!s.l) continue;
      if (!groups[s.l]) groups[s.l] = [];
      groups[s.l].push(s);
    }
    var out = [];
    for (var key in groups) {
      var arr = groups[key];
      if (arr.length < 2) continue;
      var sx = 0, sz = 0;
      for (var j = 0; j < arr.length; j++) { sx += arr[j].x; sz += arr[j].z; }
      sx /= arr.length; sz /= arr.length;
      var cxx = 0, czz = 0, cxz = 0;
      for (var k = 0; k < arr.length; k++) {
        var dx = arr[k].x - sx, dz = arr[k].z - sz;
        cxx += dx * dx; czz += dz * dz; cxz += dx * dz;
      }
      cxx /= arr.length; czz /= arr.length; cxz /= arr.length;
      var theta = 0.5 * Math.atan2(2 * cxz, cxx - czz);
      var ux = Math.cos(theta), uz = Math.sin(theta);
      var ordered = arr.map(function (s2) {
        return { s: s2, t: (s2.x - sx) * ux + (s2.z - sz) * uz };
      }).sort(function (a, b) { return a.t - b.t; });
      out.push({ name: key, st: ordered });
    }
    return out;
  }

  function render(app) {
    if (!STATE.group) return;
    while (STATE.group.firstChild) STATE.group.removeChild(STATE.group.firstChild);
    if (!STATE.on) return;
    if (!STATE.lines) STATE.lines = buildLines();
    var year = app.year;
    var loc = app.locale === 'en';
    var shown = 0;
    var all = [];

    // 1) 先画线：同年份或更早的相邻站连成一段，段色随较晚那站的开通年
    for (var i = 0; i < STATE.lines.length; i++) {
      var line = STATE.lines[i];
      var gate = LINE_YEARS[line.name] || 0;
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
        STATE.group.appendChild(seg);
      }
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
      dot.setAttribute('stroke', isNew ? 'rgba(255,255,255,.85)' : 'none');
      dot.setAttribute('stroke-width', isNew ? '0.7' : '0');
      dot.setAttribute('class', isNew ? 'rail-station is-new' : 'rail-station');
      var tip = s.n + (s.l ? ' · ' + s.l : '') + ' · ' + fmtYear(s.y) + '开通';
      var t = document.createElementNS(NS, 'title');
      t.textContent = loc ? s.n + ' Railway Station · opened ' + s.y : tip;
      dot.appendChild(t);
      STATE.group.appendChild(dot);
      all.push({ s: s, p: q, fresh: isNew });
    }

    // 3) 已建成的站一直保留站名：当年新开通的优先占位，其余按开通年份由近及远，
    //    与已放置标注碰撞就跳过，保证小字号下仍可读。
    var FS = 3.4;
    var labels = all.slice();
    labels.sort(function (a, b) { return (b.fresh ? 1 : 0) - (a.fresh ? 1 : 0) || b.s.y - a.s.y; });
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
      lab.setAttribute('fill', it.fresh ? '#1f1409' : '#4a382a');
      lab.setAttribute('paint-order', 'stroke');
      lab.setAttribute('stroke', 'rgba(255,252,244,.92)');
      lab.setAttribute('stroke-width', '0.8');
      lab.setAttribute('class', it.fresh ? 'rail-label is-new' : 'rail-label');
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
