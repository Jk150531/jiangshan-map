/* 中国铁路修建年代表层：站点按开通年份累积出现，叠加在既有舆图之上。
   数据：window.RAILWAY_STATIONS（js/railway_data.js）
   口径：每站以其“启用年份”（维基数据 P1619，含人工补录大站）为准，随年份滑杆逐站出现。 */
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
  var STATE = { on: true, group: null, app: null, lastYear: null };

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

  function render(app) {
    if (!STATE.group) return;
    while (STATE.group.firstChild) STATE.group.removeChild(STATE.group.firstChild);
    if (!STATE.on) return;
    var year = app.year;
    var loc = app.locale === 'en';
    var shown = 0;
    var fresh = [];
    for (var i = 0; i < window.RAILWAY_STATIONS.length; i++) {
      var s = window.RAILWAY_STATIONS[i];
      if (s.y > year) continue;
      var p = app.projector.toScreen(s.x, s.z);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      shown++;
      var isNew = year - s.y <= 1;
      var r = isNew ? 3.4 : (s.y >= 1949 ? 2.0 : 1.7);
      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', p[0].toFixed(1));
      dot.setAttribute('cy', p[1].toFixed(1));
      dot.setAttribute('r', r.toFixed(1));
      dot.setAttribute('fill', colorFor(s.y));
      dot.setAttribute('stroke', isNew ? 'rgba(255,255,255,.9)' : 'none');
      dot.setAttribute('stroke-width', isNew ? '1' : '0');
      dot.setAttribute('class', isNew ? 'rail-station is-new' : 'rail-station');
      dot.setAttribute('role', 'img');
      var tip = s.n + (s.l ? ' · ' + s.l : '') + ' · ' + fmtYear(s.y) + '开通';
      var t = document.createElementNS(NS, 'title');
      t.textContent = loc ? s.n + ' Railway Station · opened ' + s.y : tip;
      dot.appendChild(t);
      STATE.group.appendChild(dot);
      if (isNew) fresh.push({ s: s, p: p });
    }
    fresh.sort(function (a, b) { return a.s.n.length - b.s.n.length; });
    var limit = loc ? 18 : 24;
    for (var k = 0; k < fresh.length && k < limit; k++) {
      var it = fresh[k];
      var lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', (it.p[0] + 5).toFixed(1));
      lab.setAttribute('y', (it.p[1] + 3).toFixed(1));
      lab.setAttribute('class', 'rail-label');
      lab.textContent = it.s.n;
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
