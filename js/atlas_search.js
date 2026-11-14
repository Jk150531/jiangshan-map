
(function () {
  'use strict';

  let HistoricalAtlasController = null;
  let ERA_DYNASTY_PREFIXES = null;

  const CORE_REGIME_CHARS = new Set(
    '齐宋梁陈魏吴楚燕赵韩秦晋鲁巴蜀越周代夏凉唐汉郑顺'.split('')
  );

  // 三人同搜的候选样本：每组三人均有确切的史料交集（同游、同朝共事、同阵营、同一事件），
  // 避免拼出彼此无关的组合。占位文案与「试试搜」共用同一组，保证两处一致。
  const SEARCH_SAMPLE_TRIOS = [
    { zh: '李白 杜甫 高适', en: 'Li Bai, Du Fu, Gao Shi' },
    { zh: '曹操 刘备 孙权', en: 'Cao Cao, Liu Bei, Sun Quan' },
    { zh: '曹操 曹丕 曹植', en: 'Cao Cao, Cao Pi, Cao Zhi' },
    { zh: '苏洵 苏轼 苏辙', en: 'Su Xun, Su Shi, Su Zhe' },
    { zh: '王安石 司马光 苏轼', en: 'Wang Anshi, Sima Guang, Su Shi' },
    { zh: '韩愈 柳宗元 刘禹锡', en: 'Han Yu, Liu Zongyuan, Liu Yuxi' },
    { zh: '羊祜 杜预 王濬', en: 'Yang Hu, Du Yu, Wang Jun' },
    { zh: '廉颇 蔺相如 赵括', en: 'Lian Po, Lin Xiangru, Zhao Kuo' },
    { zh: '管仲 鲍叔牙 齐桓公', en: 'Guan Zhong, Bao Shuya, Duke Huan of Qi' },
    { zh: '李广 卫青 霍去病', en: 'Li Guang, Wei Qing, Huo Qubing' },
    { zh: '唐太宗 房玄龄 魏征', en: 'Taizong of Tang, Fang Xuanling, Wei Zheng' },
    { zh: '努尔哈赤 皇太极 多尔衮', en: 'Nurhaci, Hong Taiji, Dorgon' },
    { zh: '康有为 梁启超 谭嗣同', en: 'Kang Youwei, Liang Qichao, Tan Sitong' },
    { zh: '曾国藩 李鸿章 左宗棠', en: 'Zeng Guofan, Li Hongzhang, Zuo Zongtang' },
    { zh: '李商隐 杜牧 温庭筠', en: 'Li Shangyin, Du Mu, Wen Tingyun' },
    { zh: '欧阳修 曾巩 苏轼', en: 'Ouyang Xiu, Zeng Gong, Su Shi' },
    { zh: '班固 班超 班昭', en: 'Ban Gu, Ban Chao, Ban Zhao' },
    { zh: '范仲淹 韩琦 富弼', en: 'Fan Zhongyan, Han Qi, Fu Bi' },
  ];

  class AtlasSearchMixin {

    _pickSampleTrio() {
      if (!this._sampleTrioCache) {
        this._sampleTrioCache =
          SEARCH_SAMPLE_TRIOS[Math.floor(Math.random() * SEARCH_SAMPLE_TRIOS.length)];
      }
      return this._sampleTrioCache;
    }

    _shufflePick(arr, n) {
      const pool = Array.isArray(arr) ? arr.slice() : [];
      const out = [];
      while (out.length < n && pool.length) {
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      return out;
    }

    // 地名取各朝 settlements 中的古地名（点开必有事可看）；排除 near-modern 两朝，
    // 免得抽出「保定」「阜新」这类现代政区名。人名取事件数 ≥6 的条目，
    // 避免抽到仅有名字、点开后空白的薄档人物。
    _getSampleQueryPools() {
      if (this._samplePoolCache) return this._samplePoolCache;
      const places = [];
      const seen = new Set();
      for (const d of this.dynasties || []) {
        if (d.key === 'prc' || d.key === 'roc') continue;
        for (const s of d.settlements || []) {
          const a = s && s.ancient;
          if (!a || a.length < 2 || seen.has(a) || !Array.isArray(s.coord)) continue;
          if (!(s.isCapital || s.remark)) continue;
          seen.add(a);
          places.push({ zh: a, en: this._enDict(a) || a });
        }
      }
      const persons = [];
      const profiles =
        (typeof window !== 'undefined' &&
          window.ATLAS_LORE_DATA &&
          window.ATLAS_LORE_DATA.PERSON_PROFILES) ||
        [];
      for (const p of profiles) {
        if (!p || !p.zh || p.zh.length < 2) continue;
        if (p.isRelic || p.isStory) continue;
        if ((p.evCount || 0) < 6) continue;
        persons.push({ zh: p.zh, en: p.en || p.zh });
      }
      const cache = { places, persons };
      this._samplePoolCache = cache;
      return cache;
    }

    _searchPlaceholder(expanded = false) {
      const trio = this._pickSampleTrio();
      if (this.locale === 'en') {
        return expanded
          ? `Search figure (or 2–3 together: ${trio.en}) / city / era`
          : 'Search figure / multi-person / city / era';
      }
      return this._zh(
        expanded
          ? `搜人物（可搜双人/三人：${trio.zh}）/ 古今地名 / 年号`
          : '搜人物 / 多人同看 / 古今地名 / 年号'
      );
    }

    _getSearchSampleQueries() {
      if (this._sampleQueriesCache && this._sampleQueriesCacheLocale === this.locale) {
        return this._sampleQueriesCache;
      }
      const trio = this._pickSampleTrio();
      const pools = this._getSampleQueryPools();
      let list;
      if (pools.places.length >= 3 && pools.persons.length >= 1) {
        const ps = this._shufflePick(pools.places, 2);
        const pn = this._shufflePick(pools.persons, 1)[0];
        list =
          this.locale === 'en'
            ? [ps[0].en, ps[1].en, pn.en, trio.en]
            : [ps[0].zh, ps[1].zh, pn.zh, trio.zh].map((s) => this._zh(s));
      } else {
        list =
          this.locale === 'en'
            ? ["Chang'an", 'Chibi', 'Huo Qubing', trio.en]
            : ['长安', '赤壁', '霍去病', trio.zh].map((s) => this._zh(s));
      }
      this._sampleQueriesCache = list;
      this._sampleQueriesCacheLocale = this.locale;
      return list;
    }

    _getSearchShowcasePool() {
      const index = this._ensureSearchIndex();
      if (Array.isArray(index._showcasePool)) return index._showcasePool;
      const showcaseSpecs = [
        'sushi',
        ['libai', 'dufu'],
        'zhugeliang',
        ['libai', 'dufu', 'gaoshi'],
        'huoqubing',
        ['caocao', 'liubei', 'sunquan'],
        'libai',
        ['yanghu', 'duyu'],
        'caocao',
        ['zhugeliang', 'simayi'],
        'xinqiji',
        ['zuti', 'liukun'],
        'xuanzang',
        'wangyangming',
        'zhangqian',
        'dufu',
      ];
      const multiShowcaseFallback = {
        'libai,dufu': { events: 21, sameTime: 3, dynastyKey: 'tang' },
        'libai,dufu,gaoshi': { events: 23, sameTime: 5, dynastyKey: 'tang' },
        'caocao,liubei,sunquan': { events: 34, sameTime: 8, dynastyKey: 'donghan' },
        'yanghu,duyu': { events: 10, sameTime: 2, dynastyKey: 'sanguo' },
        'zhugeliang,simayi': { events: 16, sameTime: 3, dynastyKey: 'donghan' },
        'zuti,liukun': { events: 9, sameTime: 1, dynastyKey: 'xijin' },
      };
      const loreReady = this._isLoreDetailLoaded();
      const pool = [];
      for (const spec of showcaseSpecs) {
        if (Array.isArray(spec)) {
          const profiles = this._resolvePersonProfiles(spec);
          if (profiles.length >= 2) {
            const fb = !loreReady ? multiShowcaseFallback[spec.join(',')] : null;
            const st = fb ? null : this._buildPersonTracksAndEvents(profiles);
            if (fb || (st && st.isMulti)) {
              const evLen = fb ? fb.events : st.events.length;
              const sameTimeCount = fb ? fb.sameTime : st.sameTimeCount;
              const d = fb
                ? this.dynasties.find((dyn) => dyn.key === fb.dynastyKey) || this.dynasties[0]
                : st.events[0]
                  ? st.events[0].dynasty
                  : this.dynasties[0];
              pool.push({
                kind: 'multi_person',
                personKeys: profiles.map((p) => p.key),
                personProfiles: profiles,
                dynasty: d,
                year: null,
                titleZh: profiles.map((p) => p.zh).join(' × '),
                subZh:
                  sameTimeCount > 0
                    ? `共 ${evLen} 处行迹 · ${sameTimeCount} 处相逢`
                    : `并行行迹对照 · 共 ${evLen} 处行迹`,
                titleEn: profiles.map((p) => p.en).join(' × '),
                subEn:
                  sameTimeCount > 0
                    ? `${evLen} stops · ${sameTimeCount} encounters`
                    : `${evLen} stops`,
              });
            }
          }
        } else {
          const hit = index.find((item) => item.kind === 'person' && item.personKey === spec);
          if (hit) pool.push(hit);
        }
      }
      Object.defineProperty(index, '_showcasePool', {
        value: pool,
        enumerable: false,
        configurable: true,
      });
      return pool;
    }

    _ensureSearchIndex() {
      if (!this._fullSnapshotsLoaded && typeof window !== 'undefined') {
        this._ensureFullSnapshots();
      }
      if (!this._isLoreDetailLoaded() && typeof window !== 'undefined') {
        this._ensureLoreDetail();
      }
      if (this.searchIndex) return this.searchIndex;
      const entries = [];
      const compiledEraSpans = this._getCompiledEraSpans();
      const eraTokMap = new Map();
      for (const c of compiledEraSpans) {
        const pairs = [
          [c.monarchZh, 2],
          [c.shortMonarch, 3],
        ];
        for (const [tok, minLen] of pairs) {
          if (!tok || tok.length < minLen) continue;
          if (!eraTokMap.has(tok)) eraTokMap.set(tok, []);
          const list = eraTokMap.get(tok);
          if (c.eraOnly && c.eraOnly.length >= 2 && !list.includes(c.eraOnly)) list.push(c.eraOnly);
        }
      }
      const eraTokens = [...eraTokMap.keys()];
      const DYN_ALIASES_MAP = {
        zhanguo: ['战国七雄', '春秋战国'],
        qin: ['秦朝', '大秦', '秦'],
        xihan: ['汉', '汉朝', '前汉', '两汉'],
        donghan: ['汉', '汉朝', '两汉'],
        sanguo: ['魏蜀吴'],
        xijin: ['晋', '晋朝', '两晋'],
        dongjin: ['东晋', '晋', '晋朝', '两晋', '十六国', '五胡十六国'],
        nanbei: ['南朝', '北朝', '六朝'],
        sui: ['隋朝', '大隋', '隋'],
        tang: ['唐朝', '大唐', '李唐', '唐'],
        wudai: ['五代', '十国'],
        beisong: ['宋', '宋朝', '两宋', '大宋', '赵宋'],
        nansong: ['宋', '宋朝', '两宋', '大宋', '赵宋'],
        yuan: ['元朝', '大元', '蒙元', '元'],
        ming: ['明朝', '大明', '朱明', '明'],
        qing: ['清朝', '大清', '满清', '清'],
        roc: ['民国', '国民政府', '北洋政府'],
        prc: ['中国', '现代', '当代', '新中国'],
      };
      const extractCoreRegimes = (zhTitle, titles = []) => {
        const out = new Set();
        const addFrom = (s) => {
          const bare = String(s || '').replace(/[（(][^）)]*[）)]/g, '').trim();
          if (!bare) return;
          if (bare.length === 1 && CORE_REGIME_CHARS.has(bare)) out.add(bare);
          if (bare.endsWith('国') && bare.length === 2 && CORE_REGIME_CHARS.has(bare[0])) {
            out.add(bare[0]);
          }
          const stripped = bare.replace(
            /^(?:东|西|南|北|前|后|大|成|蜀|季|刘|曹|孙|杨|马|冉|谯|胡|桓|武|明|古|韩)/,
            ''
          );
          if (stripped.length === 1 && CORE_REGIME_CHARS.has(stripped)) {
            out.add(stripped);
          }
        };
        addFrom(zhTitle);
        for (const t of titles) addFrom(t);
        return [...out];
      };

      for (const p of HistoricalAtlasController.PERSON_PROFILES) {
        const d =
          this.dynasties.find((item) => item.key === p.dynastyKey) ||
          this.dynasties[this._findDynastyIndex(p.span ? p.span[0] : 0)] ||
          this.dynasties[0];
        const evCount =
          typeof p.evCount === 'number' ? p.evCount : (p.stops || []).length;
        const aliases = this._personSearchAliases(p);
        if (p.isStory) {
          const spanStr = Array.isArray(p.span) ? `${p.span[0]}—${p.span[1]}` : '';
          entries.push({
            kind: 'story',
            storyKey: p.key,
            personProfile: p,
            dynasty: d,
            year: Array.isArray(p.span) ? p.span[0] : d.focusYear,
            aliases,
            titleZh: p.zh,
            subZh: `${spanStr ? spanStr + ' · ' : ''}史事始末 · 共 ${evCount} 处关键节点`,
            titleEn: p.en,
            subEn: `${spanStr ? spanStr + ' · ' : ''}Storyline · ${evCount} key scenes`,
            keywords: `${p.zh} ${p.en} ${p.courtesyZh || ''} ${p.courtesyEn || ''} ${aliases.join(' ')} 史事 始末 本末 全脉络 storyline`.toLowerCase(),
          });
          continue;
        }
        const eraNames = [];
        if (!p.isRelic) {
          const pText = `${p.zh} ${p.courtesyZh || ''} ${aliases.join(' ')}`;
          for (const tok of eraTokens) {
            if (pText.includes(tok)) eraNames.push(...eraTokMap.get(tok));
          }
          if (eraNames.length > 1) {
            const uniqEra = [...new Set(eraNames)];
            eraNames.length = 0;
            eraNames.push(...uniqEra);
          }
        }
        const briefCourtesyZh = (p.courtesyZh || d.title).split(/\s*·\s*/)[0];
        const rawFirstEn = (p.courtesyEn || d.title).split(/\s*(?:·|,)\s*/)[0];
        const briefCourtesyEn = rawFirstEn.length <= 14 ? rawFirstEn : '';
        entries.push({
          kind: 'person',
          personKey: p.key,
          personProfile: p,
          dynasty: d,
          year: null,
          aliases,
          titleZh: p.zh,
          subZh: p.isRelic
            ? `${briefCourtesyZh} · 历 10 朝 ${evCount} 站流转`
            : `${briefCourtesyZh} · 共 ${evCount} 处史事`,
          titleEn: p.en,
          subEn: p.isRelic
            ? `${briefCourtesyEn || 'Heshi Bi Jade'} · ${evCount} stops across 10 eras`
            : briefCourtesyEn
              ? `${briefCourtesyEn} · ${evCount} events`
              : `${evCount} chronicle events`,
          keywords: `${p.zh} ${p.en} ${p.courtesyZh || ''} ${p.courtesyEn || ''} ${aliases.join(' ')} ${eraNames.join(' ')} ${p.isRelic ? '国器 宝物 传国玉玺 传国玺 玉玺 和氏璧 relic seal' : '人物 生平 事迹 行迹'}`.toLowerCase(),
        });
      }

      entries.push({
        kind: 'quiz',
        dynasty: this.dynasties[2] || this.dynasties[0],
        year: null,
        titleZh: '舆图寻址 · 古地名小试',
        subZh: '盲图标点历代名城与雄关 · 10题计分',
        titleEn: 'Map Pinpoint · Ancient Place Quiz',
        subEn: 'Pinpoint 10 ancient cities & strategic passes on the map',
        keywords: '舆图寻址 古地名小试 挑战 猜地名 雅集 quiz pinpoint challenge game'.toLowerCase(),
      });

      for (const d of this.dynasties) {
        const enDyn = (this.enLocale.dynasties && this.enLocale.dynasties[d.key]) || {};
        const nameEn = enDyn.name || d.title;
        const shortEn = enDyn.short || d.badge || d.title;
        const dAliases = (DYN_ALIASES_MAP[d.key] || []).map((a) => a.toLowerCase());
        const coreRegimes = extractCoreRegimes(d.title, dAliases);
        const spanZh =
          d.key === 'prc'
            ? `${d.fromYear}—`
            : `${d.fromYear <= 0 ? '前' + -d.fromYear : d.fromYear}—${d.toYear <= 0 ? '前' + -d.toYear : d.toYear}`;
        const spanEn =
          d.key === 'prc'
            ? `${d.fromYear} CE –`
            : `${d.fromYear <= 0 ? -d.fromYear + ' BCE' : d.fromYear + ' CE'} – ${d.toYear <= 0 ? -d.toYear + ' BCE' : d.toYear + ' CE'}`;
        entries.push({
          kind: 'dynasty',
          dynasty: d,
          year: d.focusYear,
          titleZh: d.title,
          subZh: `${spanZh} · 都城：${d.seat}`,
          titleEn: nameEn,
          subEn: `${spanEn} · ${enDyn.capital || d.seat}`,
          aliases: dAliases,
          coreRegimes,
          keywords: `${d.title} ${d.badge || ''} ${d.seat || ''} ${nameEn} ${shortEn} ${dAliases.join(' ')}`.toLowerCase(),
        });
      }

      const yrZh = (y) => (y <= 0 ? `前${-y}` : `${y}`);
      const yrEn = (y) => (y <= 0 ? `${-y} BCE` : `${y} CE`);
      for (const p of HistoricalAtlasController.POLITY_PROFILES) {
        const bareZhPol = p.zh.replace(/[（(][^）)]*[）)]/g, '').trim().toLowerCase();
        const bareTitles = p.titles
          .map((t) => t.replace(/[（(][^）)]*[）)]/g, '').trim().toLowerCase())
          .filter(Boolean);
        const exactPolityTitles = [
          ...new Set([bareZhPol, ...p.titles.map((t) => t.toLowerCase()), ...bareTitles]),
        ].filter(Boolean);
        const aliases = [
          ...new Set([...(p.aliases || []).map((a) => a.toLowerCase()), ...exactPolityTitles]),
        ];
        const coreRegimes = extractCoreRegimes(p.zh, p.titles);
        const rulersText = this._polityRulers({ ...p, curated: true }) || '';
        const founderExtra =
          p.key === 'caowei'
            ? '曹操 魏武帝'
            : p.key === 'shuhan'
              ? '刘备 诸葛亮'
              : p.key === 'sunwu'
                ? '孙权 孙策'
                : '';
        entries.push({
          kind: 'polity',
          polityKey: p.key,
          dynasty: this.dynasties[this._findDynastyIndex(Math.max(this.minYear, p.from))],
          year: null,
          titleZh: p.zh,
          subZh: `${yrZh(p.from)}—${yrZh(p.to)} · 都城：${p.seatZh}`,
          titleEn: p.en,
          subEn: `${yrEn(p.from)} – ${yrEn(p.to)} · ${p.seatEn}`,
          exactPolityTitles,
          coreRegimes,
          politySpan: Math.max(1, (p.to || 0) - (p.from || 0)),
          polityFrom: p.from || 0,
          aliases,
          keywords: `${p.zh} ${p.en} ${aliases.join(' ')} ${p.seatZh || ''} ${p.seatEn || ''} ${rulersText} ${p.rulersEn || ''} ${founderExtra}`.toLowerCase(),
        });
      }

      for (const d of this.dynasties) {
        const isModernDyn = d.key === 'roc' || d.key === 'prc';
        const enDyn = (this.enLocale.dynasties && this.enLocale.dynasties[d.key]) || {};
        const dynNameEn = enDyn.name || d.title;
        for (const s of d.settlements || []) {
          const yr = s.appear !== undefined ? Math.max(d.fromYear, s.appear) : d.focusYear;
          const rawAncEn = this._enDict(s.ancient);
          const ancEn = isModernDyn ? this._enModernCity(s.ancient) : rawAncEn;
          const modEn = this._enModernCity(s.modern || '');
          const remEn = this._enDict(s.remark || '');
          const sAliases = (s.aliases || [])
            .flatMap((a) => [String(a || '').toLowerCase(), this._enDict(a).toLowerCase()])
            .filter(Boolean);
          entries.push({
            kind: 'city',
            dynasty: d,
            year: yr,
            coord: s.coord,
            tier: s.tier || 1,
            isCapital: Boolean(s.isCapital),
            titleZh: s.ancient,
            modernZh: s.modern || '',
            remarkZh: s.remark || '',
            subZh: s.modern && s.modern !== s.ancient ? `今${s.modern}` : s.remark || '',
            titleEn: ancEn,
            modernEn: modEn,
            remarkEn: remEn || '',
            subEn: s.modern && s.modern !== s.ancient ? `Now ${modEn}` : remEn,
            aliases: sAliases,
            keywords: `${s.ancient} ${(s.aliases || []).join(' ')} ${s.modern || ''} ${s.remark || ''} ${d.title} ${dynNameEn} ${rawAncEn} ${ancEn} ${modEn} ${remEn} ${sAliases.join(' ')}`.toLowerCase(),
          });
        }
      }

      for (const p of HistoricalAtlasController.STRATEGIC_PASSES) {
        const dIdx = this._findDynastyIndex(p.focusYear || -200);
        const d = this.dynasties[dIdx] || this.dynasties[0];
        const aliases = (p.aliases || []).map((a) => a.toLowerCase());
        const aliasStr = aliases.join(' ');
        entries.push({
          kind: 'pass',
          passKey: p.key,
          dynasty: d,
          year: p.focusYear || d.focusYear,
          coord: p.coord,
          aliases,
          titleZh: p.ancientZh,
          subZh: `今${p.modernZh} · ${p.rangeZh}`,
          titleEn: p.ancientEn,
          subEn: `${p.modernEn} · ${p.rangeEn}`,
          keywords: `${p.ancientZh} ${aliasStr} ${p.modernZh} ${p.rangeZh} ${p.ancientEn} ${p.modernEn} ${p.rangeEn} 名关 雄关 关隘 险关 pass`.toLowerCase(),
        });
      }

      for (const g of HistoricalAtlasController.PLACE_GAZETTEER) {
        const aliases = (g.aliases || []).map((a) => a.toLowerCase());
        const aliasSub = (g.aliases || []).slice(0, 3).join(' · ');
        const asciiKeys = (g.asciiAliases || []).join(' ');
        const nameEn = this._enDict(g.name);
        const modEn = this._enModernCity(g.modern || '');
        entries.push({
          kind: 'gazetteer',
          dynasty: null,
          year: null,
          coord: g.coord,
          zoom: g.zoom || 2.5,
          aliases,
          titleZh: g.name,
          subZh: `今${g.modern}${aliasSub ? ' · ' + aliasSub : ''}`,
          titleEn: nameEn,
          subEn: modEn ? `Now ${modEn}` : '',
          keywords: `${g.name} ${aliases.join(' ')} ${asciiKeys} ${g.modern || ''} ${nameEn} ${modEn} 名胜 古迹 古战场`.toLowerCase(),
        });
      }

      const seenAdmin = new Set();
      for (const d of this.dynasties) {
        const phaseList = d.phases && d.phases.length ? d.phases : [{ until: d.toYear, snap: `s_${d.key}` }];
        phaseList.forEach((ph, idx) => {
          const sy = idx === 0 ? d.fromYear : phaseList[idx - 1].until;
          const midY = Math.round((sy + ph.until - 1) * 0.5);
          const snap = this.snapshots[ph.snap];
          if (!snap) return;
          for (const [list, isPref] of [
            [snap.regions, false],
            [snap.prefectures, true],
          ]) {
            for (const item of list || []) {
              if (!item.title || !item.anchor) continue;
              const uid = `${d.key}:${item.title}`;
              if (seenAdmin.has(uid)) continue;
              seenAdmin.add(uid);
              const itemEn = this._enDict(item.title);
              entries.push({
                kind: isPref ? 'prefecture' : 'region',
                dynasty: d,
                year: midY,
                coord: item.anchor,
                prefTitle: isPref ? item.title : null,
                titleZh: item.title,
                subZh: item.category && !item.title.endsWith(item.category) ? item.category : '',
                titleEn: itemEn,
                subEn: '',
                keywords: `${item.title} ${itemEn} ${d.title}`.toLowerCase(),
              });
            }
          }
        });
      }

      const eventEntries = [];
      const eventPinyin = window.ATLAS_EVENT_PINYIN || {};
      for (const d of this.dynasties) {
        for (const [eventIdx, m] of (d.milestones || []).entries()) {
          const enHead = this._enMilestoneHeadline(d, m);
          const siteEn = m.site ? this._enMilestoneSite(d, m) : '';
          const yrEn = m.year <= 0 ? `${-m.year || 1} BCE` : `${m.year} CE`;
          const evEntry = {
            kind: 'event',
            dynasty: d,
            year: this._clampYearToDynasty(d, m.year),
            rawYear: m.year,
            milestone: m,
            coord: m.coord,
            titleZh: m.headline,
            subZh: `${m.year <= 0 ? '前' + -m.year : m.year}年${m.site ? ' · ' + m.site : ''}`,
            titleEn: enHead,
            subEn: `${yrEn}${siteEn ? ' · ' + siteEn : ''}`,
            pinyinKeys: [...(eventPinyin.milestones?.[d.key]?.[eventIdx] || [])],
            keywords: `${m.headline} ${m.site || ''} ${enHead} ${siteEn} ${m.year}`.toLowerCase(),
          };
          entries.push(evEntry);
          eventEntries.push(evEntry);
        }
      }

      const evByYear = new Map();
      for (const ev of eventEntries) {
        if (!ev.coord) continue;
        const bucket = evByYear.get(ev.rawYear);
        if (bucket) bucket.push(ev);
        else evByYear.set(ev.rawYear, [ev]);
      }

      const seenLm = new Set();
      for (const [eventIdx, lm] of HistoricalAtlasController.PLACE_LANDMARK_EVENTS.entries()) {
        if (!lm.zh) continue;
        const uid = `${lm.year}:${lm.zh.slice(0, 16)}`;
        if (seenLm.has(uid)) continue;
        seenLm.add(uid);
        const lmKeywords = `${lm.zh} ${lm.site || ''} ${lm.en || ''} ${lm.siteEn || ''} ${lm.year}`.toLowerCase();
        const yrEn = lm.year <= 0 ? `${-lm.year || 1} BCE` : `${lm.year} CE`;
        const landmark = {
          milestone: {
            year: lm.year,
            headline: lm.zh,
            headlineEn: lm.en,
            site: lm.site,
            siteEn: lm.siteEn,
            coord: lm.coord,
          },
          titleZh: lm.zh,
          subZh: `${lm.year <= 0 ? '前' + -lm.year : lm.year}年${lm.site ? ' · ' + lm.site : ''}`,
          titleEn: lm.en || lm.zh,
          subEn: `${yrEn}${lm.siteEn ? ' · ' + lm.siteEn : ''}`,
          pinyinKeys: eventPinyin.landmarks?.[eventIdx] || [],
        };
        const existingEv = lm.coord
          ? (evByYear.get(lm.year) || []).find(
              (ev) => ev.coord && this.projector.greatCircleKm(ev.coord, lm.coord) <= 65
            )
          : undefined;
        if (existingEv) {
          existingEv.keywords += ` ${lmKeywords}`;
          if (landmark.pinyinKeys.length) {
            (existingEv.altPinyin ||= []).push(landmark);
          }
          if (!existingEv.altTitlesZh) existingEv.altTitlesZh = [];
          existingEv.altTitlesZh.push(lm.zh);
          if (lm.en) {
            if (!existingEv.altTitlesEn) existingEv.altTitlesEn = [];
            existingEv.altTitlesEn.push(lm.en);
          }
          continue;
        }
        const d =
          this.dynasties.find((dyn) => dyn.key === lm.dynastyKey) ||
          this.dynasties[this._findDynastyIndex(lm.year)] ||
          this.dynasties[0];
        const lmEntry = {
          ...landmark,
          kind: 'event',
          dynasty: d,
          year: this._clampYearToDynasty(d, lm.year),
          rawYear: lm.year,
          coord: lm.coord,
          keywords: `${lmKeywords} 史事 事件 战役 名胜`,
        };
        entries.push(lmEntry);
        eventEntries.push(lmEntry);
      }

      const foldIdx = (s) =>
        String(s || '')
          .toLowerCase()
          .replace(/['’‘`\-_.\s]+/g, '');
      for (const item of entries) {
        const tZh = item.titleZh.toLowerCase();
        const tEn = item.titleEn.toLowerCase();
        const bareZh = this._stripPromptParenthetical(item.titleZh).toLowerCase();
        const bareEn = this._stripPromptParenthetical(item.titleEn).toLowerCase();
        const mZh = (item.modernZh || '').toLowerCase();
        const mZhParts = mZh ? mZh.split(/[·/、]/) : null;
        const mEn = (item.modernEn || '').toLowerCase();
        Object.defineProperty(item, '_q', {
          value: {
            tZh,
            tEn,
            bareZh,
            bareEn,
            mZh,
            mZhParts,
            mEn,
            tEnFold: foldIdx(tEn),
            mEnFold: mEn ? foldIdx(mEn) : '',
            aliasesFold: item.aliases ? item.aliases.map(foldIdx) : null,
            altZhPairs: item.altTitlesZh
              ? item.altTitlesZh.map((raw) => [raw, raw.toLowerCase()])
              : null,
            altEnPairs: item.altTitlesEn
              ? item.altTitlesEn.map((raw) => [raw, foldIdx(raw)])
              : null,
            keywordsFold: foldIdx(item.keywords),
          },
          enumerable: false,
          configurable: true,
        });
      }

      this.searchIndex = entries;
      return entries;
    }

    _parseChineseNumber(str) {
      if (!str) return null;
      if (/^\d+$/.test(str)) return Number(str);
      if (str === '元') return 1;
      const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      if (str.length === 1) return map[str] || null;
      if (str.startsWith('十')) return 10 + (map[str.slice(1)] || 0);
      if (str.endsWith('十')) return (map[str[0]] || 0) * 10;
      const parts = str.split('十');
      if (parts.length === 2) {
        return (map[parts[0]] || 0) * 10 + (map[parts[1]] || 0);
      }
      return null;
    }

    _getCompiledEraSpans() {
      const enDynMap = (this.enLocale && this.enLocale.dynasties) || null;
      if (
        this._compiledEraSpans &&
        this._compiledEraSpansDynRef === this.dynasties &&
        this._compiledEraSpansEnRef === enDynMap
      ) {
        return this._compiledEraSpans;
      }
      const spans = HistoricalAtlasController.CHINESE_ERA_SPANS;

      const rawEraSpans = [
        ...spans.map((sp, idx) => [sp, idx + 1 < spans.length ? spans[idx + 1][0] - 1 : 1948]),
        ...HistoricalAtlasController.REGIONAL_ERA_TRACKS.flatMap((t) =>
          t.spans.map((sp, idx) => [sp, idx + 1 < t.spans.length ? t.spans[idx + 1][0] - 1 : t.until])
        ),
      ];
      const compiled = rawEraSpans.map(([sp, endY]) => {
        const [startY, prefix, baseNum = 1, monarchZh = '', monarchEn = ''] = sp;
        const shortMonarch = monarchZh
          .replace(/^(?:西|东|北|南|南朝|武周)/, '')
          .replace(/^汉高帝$/, '汉高祖');
        const dynPfx = ERA_DYNASTY_PREFIXES.find((dp) => prefix.startsWith(dp)) || '';
        const eraOnly = dynPfx ? prefix.slice(dynPfx.length) : prefix;
        const fullCombo = monarchZh ? `${monarchZh}${eraOnly}` : prefix;
        const shortCombo = shortMonarch ? `${shortMonarch}${eraOnly}` : prefix;
        const monarchEnLower = (monarchEn || '').toLowerCase();
        const monarchEnExpanded = monarchEnLower.replace(/\bemp\./g, 'emperor');
        const monarchBare = monarchEnExpanded.replace(/^emperor\s+/, '');
        const dForSpan = this.dynasties[this._findDynastyIndex(startY)] || this.dynasties[0];
        const enDynObj = (enDynMap && enDynMap[dForSpan.key]) || {};
        const enDynShort = (enDynObj.short || enDynObj.name || dForSpan.key || '').toLowerCase();
        const enDynBase = enDynShort.replace(/^[wens]\.\s*/, '');
        const enSearchTarget = `${monarchEnLower} ${monarchEnExpanded} ${monarchEnExpanded} of ${enDynShort} ${monarchEnExpanded} of ${enDynBase} ${monarchBare} of ${enDynBase}`;
        const monarchPfx =
          ERA_DYNASTY_PREFIXES.find((dp) => monarchZh.startsWith(dp)) || dynPfx;
        const monarchTitleLen =
          monarchPfx && monarchZh.startsWith(monarchPfx)
            ? monarchZh.length - monarchPfx.length
            : monarchZh.length;
        const [enName, enOwnRegime = ''] = monarchEnExpanded.split(' of ');
        const enRegimePool = `${enOwnRegime} | ${enDynShort} | ${enDynBase}`;
        const eraPinyinLower =
          startY >= -140 && eraOnly ? this._eraNamePinyin(eraOnly).toLowerCase() : '';
        const eraPinyinFold = eraPinyinLower.replace(/'/g, '');
        return {
          sp,
          endY,
          startY,
          prefix,
          baseNum,
          monarchZh,
          shortMonarch,
          eraOnly,
          fullCombo,
          shortCombo,
          monarchEnLower,
          monarchEnExpanded,
          enSearchTarget,
          monarchTitleLen,
          enName,
          enRegimePool,
          eraPinyinLower,
          eraPinyinFold,
        };
      });
      this._compiledEraSpans = compiled;
      this._compiledEraSpansDynRef = this.dynasties;
      this._compiledEraSpansEnRef = enDynMap;
      return compiled;
    }

    _matchEraResults(rawQuery) {
      const rawTrim = rawQuery.trim();
      if (!rawTrim) return [];
      const trimmed = /[\u4e00-\u9fff]/.test(rawTrim) ? this._toHans(rawTrim) : rawTrim;
      const hits = [];

      const directYrMatch = trimmed.match(/^(?:公元)?(前|-)?\s*(\d{1,4})\s*(?:年|bce|bc|ce|ad)?$/i);
      if (directYrMatch) {
        const isBce = Boolean(directYrMatch[1]) || /bce|bc/i.test(trimmed);
        let yr = Number(directYrMatch[2]) * (isBce ? -1 : 1);
        if (yr === 0) yr = 1;
        if (yr >= this.minYear && yr <= this.maxYear) {
          const dIdx = this._findDynastyIndex(yr);
          const d = this.dynasties[dIdx];
          const prevLoc = this.locale;
          this.locale = 'zh';
          const eraZh = this.formatEraLabel(yr, d);
          const yrZh = this.formatYear(yr);
          this.locale = 'en';
          const yrEn = this.formatYear(yr);
          const eraEn = this.formatEraLabel(yr, d);
          this.locale = prevLoc;
          hits.push({
            kind: 'era',
            dynasty: d,
            year: yr,
            titleZh: `${yrZh} · ${eraZh}`,
            subZh: d.title,
            titleEn: `${yrEn} (${eraEn})`,
            subEn: (this.enLocale.dynasties[d.key] && this.enLocale.dynasties[d.key].name) || d.title,
            score: 135,
          });
        }
      }

      const isYuanNian = /[元][年载]$/.test(trimmed);
      const q = trimmed.replace(/[年载]$/, '');
      if (!q) return hits;
      const numMatch = isYuanNian
        ? [q, q.slice(0, -1), '元']
        : q.match(/^(.*?)([一二三四五六七八九十]+|\d+)$/);
      const prefixQ = (numMatch ? numMatch[1] : q).replace(/[·\s]/g, '');
      if (!prefixQ) return hits;
      const qLower = trimmed.toLowerCase();
      const isLatinQuery = qLower.length >= 3 && /[a-z]/i.test(qLower);
      const qFoldEra = isLatinQuery ? qLower.replace(/['’‘`\-_.\s]+/g, '') : '';
      const yearNum = numMatch ? this._parseChineseNumber(numMatch[2]) : null;
      if (
        !directYrMatch &&
        yearNum === null &&
        !isYuanNian &&
        !/[年载]$/.test(trimmed) &&
        prefixQ.length < 2
      ) {
        return hits;
      }
      const seenMonarchOnly = new Set();
      const seenEraHit = new Set();

      const reachesTail = (s, tailLen) => {
        const at = s.lastIndexOf(prefixQ);
        return at >= 0 && at + prefixQ.length > s.length - tailLen;
      };

      for (const c of this._getCompiledEraSpans()) {
        const {
          sp,
          endY,
          startY,
          prefix,
          baseNum,
          monarchZh,
          shortMonarch,
          eraOnly,
          fullCombo,
          shortCombo,
          monarchEnLower,
          monarchEnExpanded,
          enSearchTarget,
          monarchTitleLen,
          enName,
          enRegimePool,
          eraPinyinLower,
          eraPinyinFold,
        } = c;
        const enRegimeOnly =
          isLatinQuery && !enName.includes(qLower) && enRegimePool.includes(qLower);
        const matchEraPinyin =
          isLatinQuery &&
          eraPinyinFold.length >= 4 &&
          (qLower === eraPinyinLower || qFoldEra === eraPinyinFold);
        const matchEra =
          reachesTail(prefix, eraOnly.length) ||
          reachesTail(fullCombo, eraOnly.length) ||
          reachesTail(shortCombo, eraOnly.length) ||
          matchEraPinyin;
        const matchMonarchOnly =
          !matchEra &&
          yearNum === null &&
          ((monarchZh &&
            (reachesTail(monarchZh, monarchTitleLen) ||
              reachesTail(shortMonarch, monarchTitleLen) ||
              (prefixQ === '汉高祖' && prefix === '汉高帝'))) ||
            (isLatinQuery && !enRegimeOnly && enSearchTarget.includes(qLower)));

        if (matchEra || matchMonarchOnly) {
          const monarchDedupKey = monarchZh || monarchEnLower;
          if (matchMonarchOnly) {
            if (seenMonarchOnly.has(monarchDedupKey)) continue;
            seenMonarchOnly.add(monarchDedupKey);
          } else if (
            yearNum === null &&
            monarchZh &&
            (prefixQ === monarchZh || prefixQ === shortMonarch)
          ) {
            if (seenMonarchOnly.has(monarchDedupKey)) continue;
            seenMonarchOnly.add(monarchDedupKey);
          }
          const targetNum = yearNum !== null ? yearNum : baseNum;
          const targetY = startY + (targetNum - baseNum);
          if (targetY >= startY && targetY <= endY + 5) {
            const dIdx = this._findDynastyIndex(targetY);
            const d = this.dynasties[dIdx];
            const label = this._formatSpanEraZh(sp, targetNum);

            if (seenEraHit.has(`${targetY}|${label}`)) continue;
            seenEraHit.add(`${targetY}|${label}`);
            const titleZh =
              startY >= 1368 && startY < 1912 && monarchZh
                ? `${label} · ${monarchZh}`
                : label;
            const yrZh = targetY <= 0 ? `公元前${-targetY}年` : `公元 ${targetY} 年`;
            const yrEn = targetY <= 0 ? `${-targetY} BCE` : `${targetY} CE`;
            const labelEn = this._formatSpanEraEn(sp, targetNum);
            const isExplicitEraOrMonarch =
              yearNum !== null ||
              isYuanNian ||
              /[年载]$/.test(trimmed) ||
              prefix === prefixQ ||
              fullCombo === prefixQ ||
              shortCombo === prefixQ ||
              monarchZh === prefixQ ||
              shortMonarch === prefixQ ||
              (prefixQ === '汉高祖' && prefix === '汉高帝') ||
              (isLatinQuery &&
                (monarchEnLower.startsWith(qLower) || monarchEnExpanded.startsWith(qLower)));
            const isBareEraExact =
              !isExplicitEraOrMonarch &&
              (eraOnly === prefixQ ||
                matchEraPinyin ||
                prefix.endsWith(prefixQ) ||
                fullCombo.endsWith(prefixQ) ||
                shortCombo.endsWith(prefixQ));
            hits.push({
              kind: 'era',
              dynasty: d,
              year: targetY,
              titleZh,
              subZh: yrZh,
              titleEn: `${labelEn} (${yrEn})`,
              subEn: (this.enLocale.dynasties[d.key] && this.enLocale.dynasties[d.key].name) || d.title,
              score: isExplicitEraOrMonarch ? 122 : isBareEraExact ? 94 : 88,
            });
          }
        }
      }
      return hits;
    }

    _searchBucket(item) {
      if (item.kind === 'dynasty' || item.kind === 'polity') return 'regime';
      if (item.kind === 'multi_person' || item.kind === 'person' || item.kind === 'era') {
        return 'person_era';
      }
      if (
        item.kind === 'city' ||
        item.kind === 'pass' ||
        item.kind === 'gazetteer' ||
        item.kind === 'prefecture' ||
        item.kind === 'region'
      ) {
        return 'geo';
      }
      return 'event';
    }

    _eventPinyinQuery(query) {
      return query.toLowerCase().normalize('NFD')
        .replace(/u\u0308/g, 'v')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\p{Punctuation}\s`]/gu, '');
    }

    _canMatchEventPinyin(query, resultCount = 0) {
      return resultCount < 12 && /^[a-z]{4,}$/.test(query);
    }

    _queryQuickSearch(rawQuery) {
      const rawTrim = rawQuery.trim();
      if (!rawTrim) return [];
      const normQ = /[\u4e00-\u9fff]/.test(rawTrim) ? this._toHans(rawTrim) : rawTrim;
      const q = normQ.toLowerCase();
      if (!q) return [];
      const fold = (s) =>
        String(s || '')
          .toLowerCase()
          .replace(/['’‘`\-_.\s]+/g, '');
      const isAscii = /[a-z]/i.test(q) && !/[\u4e00-\u9fa5]/.test(q);
      const qFold = isAscii ? fold(q) : '';

      const pinyinQuery = this._eventPinyinQuery(q);
      const index = this._ensureSearchIndex();
      const eraResults = this._matchEraResults(normQ);
      const hasEraMatch = eraResults.length > 0;
      const results = [...eraResults];

      for (const item of index) {
        let score = 0;
        let matchedAltZh = null;
        let matchedAltEn = null;
        let matchedByKeywordOnly = false;
        const iq = item._q;
        const tZh = iq ? iq.tZh : item.titleZh.toLowerCase();
        const tEn = iq ? iq.tEn : item.titleEn.toLowerCase();
        const bareZh = iq ? iq.bareZh : this._stripPromptParenthetical(item.titleZh).toLowerCase();
        const bareEn = iq ? iq.bareEn : this._stripPromptParenthetical(item.titleEn).toLowerCase();
        const mZh = iq ? iq.mZh : (item.modernZh || '').toLowerCase();
        const mEn = iq ? iq.mEn : (item.modernEn || '').toLowerCase();
        const tEnFold = isAscii ? (iq ? iq.tEnFold : fold(tEn)) : '';
        const mEnFold = isAscii ? (iq ? iq.mEnFold : fold(mEn)) : '';
        if (tZh === q || tEn === q) {
          score = item.kind === 'dynasty' ? 108 : item.kind === 'polity' ? 104 : 100;
        } else if (bareZh && (bareZh === q || bareEn === q)) {
          score = item.kind === 'dynasty' ? 106 : item.kind === 'polity' ? 101 : 99;
        } else if (isAscii && qFold.length >= 3 && tEnFold === qFold) {
          score = 98;
        } else if (
          mZh &&
          (mZh === q ||
            (iq ? iq.mZhParts && iq.mZhParts.includes(q) : mZh.split(/[·/、]/).includes(q)) ||
            mEn === q)
        ) {
          score = 96;
        } else if (isAscii && qFold.length >= 3 && mEnFold === qFold) {
          score = 94;
        } else if (item.exactPolityTitles && item.exactPolityTitles.includes(q)) {
          score = 100;
        } else if (item.coreRegimes && item.coreRegimes.includes(q)) {
          score = item.kind === 'dynasty' ? 105 : 97;
        } else if (
          item.aliases &&
          item.aliases.some(
            (a, idx) =>
              a === q ||
              (isAscii &&
                qFold.length >= 3 &&
                (iq && iq.aliasesFold ? iq.aliasesFold[idx] : fold(a)) === qFold)
          )
        ) {
          score = item.kind === 'dynasty' ? 103 : item.kind === 'polity' ? 95 : 92;
        } else if (
          tZh.startsWith(q) ||
          tEn.startsWith(q) ||
          (isAscii && qFold.length >= 3 && tEnFold.startsWith(qFold))
        ) {
          if (item.kind === 'event') {
            score = q.length === 1 ? 66 : hasEraMatch ? 78 : 88;
          } else if (item.kind === 'dynasty' || item.kind === 'polity') {
            score = 88;
          } else if (
            (item.kind === 'prefecture' || item.kind === 'region') &&
            tZh.length === q.length + 1 &&
            /[州郡国府路道省县]$/.test(tZh)
          ) {
            score = 84;
          } else {
            score = 80;
          }
        } else if (
          item.kind === 'event' &&
          q.length >= 2 &&
          (tZh.includes(q) || (isAscii && qFold.length >= 4 && tEnFold.includes(qFold)))
        ) {
          score = 78;
        } else if (
          item.kind === 'event' &&
          q.length >= 2 &&
          ((item.altTitlesZh &&
            (matchedAltZh = iq && iq.altZhPairs
              ? (iq.altZhPairs.find((pair) => pair[1].includes(q)) || [])[0] || null
              : item.altTitlesZh.find((at) => at.toLowerCase().includes(q)))) ||
            (isAscii &&
              qFold.length >= 4 &&
              item.altTitlesEn &&
              (matchedAltEn = iq && iq.altEnPairs
                ? (iq.altEnPairs.find((pair) => pair[1].includes(qFold)) || [])[0] || null
                : item.altTitlesEn.find((at) => fold(at).includes(qFold)))))
        ) {
          score = 74;
        } else if (
          mZh &&
          (mZh.startsWith(q) ||
            mEn.startsWith(q) ||
            (isAscii && qFold.length >= 3 && mEnFold.startsWith(qFold)))
        ) {
          score = 78;
        } else if (
          item.keywords.includes(q) ||
          (isAscii &&
            qFold.length >= 4 &&
            (iq ? iq.keywordsFold : fold(item.keywords)).includes(qFold))
        ) {
          if (
            (hasEraMatch && (item.kind === 'city' || item.kind === 'event')) ||
            (q.length === 1 && item.kind !== 'person')
          ) {
            score = 0;
          } else {
            score = item.kind === 'dynasty' ? 58 : 55;
            matchedByKeywordOnly = true;
          }
        }

        if (score > 0) {
          let resItem = item;
          if (item.kind === 'event' && (matchedAltZh || matchedAltEn)) {
            resItem = {
              ...item,
              titleZh: matchedAltZh || item.titleZh,
              titleEn: matchedAltEn || item.titleEn,
            };
          } else if (
            item.kind === 'city' &&
            matchedByKeywordOnly &&
            item.remarkZh &&
            !item.subZh.includes(item.remarkZh)
          ) {
            resItem = {
              ...item,
              subZh: item.subZh ? `${item.subZh} · ${item.remarkZh}` : item.remarkZh,
              subEn:
                item.subEn && item.remarkEn
                  ? `${item.subEn} · ${item.remarkEn}`
                  : item.subEn || item.remarkEn,
            };
          }
          if (resItem.kind === 'story') {
            if (score >= 92) score = 152;
            else if (score >= 80) score = 118;
            else score = 74;
          } else if (resItem.kind === 'person') {
            if (score >= 92) score = 148;
            else if (score >= 80) score = q.length === 1 || CORE_REGIME_CHARS.has(q) ? 86 : 114;
            else score = 72;
          } else if (resItem.kind === 'dynasty' || resItem.kind === 'polity') {
            if (resItem.dynasty === this.dynasties[this.dynastyIdx]) score += 4;
            if (resItem.politySpan >= 18) score += 1;
          } else if (resItem.kind === 'event') {
            if (resItem.dynasty === this.dynasties[this.dynastyIdx]) score += 4;
          } else {
            if (resItem.dynasty === this.dynasties[this.dynastyIdx]) score += 10;
            if (resItem.isCapital) score += 2;
          }
          results.push({ ...resItem, score });
        }
      }

      if (
        !results.some((r) => r.kind === 'person') &&
        !results.some(
          (r) =>
            (r.kind === 'city' ||
              r.kind === 'pass' ||
              r.kind === 'gazetteer' ||
              r.kind === 'dynasty' ||
              r.kind === 'polity') &&
            r.score >= 92
        ) &&
        /^[\u4e00-\u9fa5]{2,5}$/.test(normQ)
      ) {
        const adhoc = this._resolvePersonProfile(normQ);
        if (adhoc && adhoc.isMonarch) {
          const evs = this._collectPersonEvents(adhoc);
          if (evs.length >= 2) {
            const d = evs[0].dynasty || this.dynasties[0];
            results.push({
              kind: 'person',
              personProfile: adhoc,
              dynasty: d,
              year: null,
              titleZh: adhoc.zh,
              subZh: `${adhoc.courtesyZh} · 共 ${evs.length} 处史事`,
              titleEn: adhoc.en,
              subEn: `${evs.length} events`,
              score: 126,
            });
          }
        }
      }

      const canBeMultiPerson =
        /^[\u4e00-\u9fff·]{2,6}(?:\s+[\u4e00-\u9fff·]{2,6})+$/.test(normQ) ||
        /[,，;；×+、&]|\s+(?:vs\.?|and|with)\s+/i.test(normQ);
      const multiProfiles = canBeMultiPerson ? this._resolvePersonProfiles(normQ) : [];
      if (multiProfiles.length >= 2) {
        const st = this._buildPersonTracksAndEvents(multiProfiles);
        if (st && st.isMulti) {
          const d = st.events[0] ? st.events[0].dynasty : this.dynasties[0];
          results.push({
            kind: 'multi_person',
            personProfiles: multiProfiles,
            dynasty: d,
            year: null,
            titleZh: multiProfiles.map((p) => p.zh).join(' × '),
            subZh:
              st.sameTimeCount > 0
                ? `共 ${st.events.length} 处行迹 · ${st.sameTimeCount} 处相逢`
                : `并行行迹对照 · 共 ${st.events.length} 处行迹`,
            titleEn: multiProfiles.map((p) => p.en).join(' × '),
            subEn:
              st.sameTimeCount > 0
                ? `${st.events.length} stops · ${st.sameTimeCount} encounters`
                : `${st.events.length} stops`,
            score: 165,
          });
        }
      }

      const ranked = this._rankQuickSearchResults(results);
      if (!window.ATLAS_EVENT_PINYIN || !this._canMatchEventPinyin(pinyinQuery, ranked.length)) return ranked;
      return this._appendEventPinyinResults(ranked, index, pinyinQuery, hasEraMatch);
    }

    _isDuplicateSearchEvent(item, previous) {
      const year = item.rawYear !== undefined ? item.rawYear : item.year;
      const previousYear = previous.rawYear !== undefined ? previous.rawYear : previous.year;
      return previous.kind === 'event' && previousYear === year && previous.coord && item.coord &&
        this.projector.greatCircleKm(previous.coord, item.coord) <= 65;
    }

    _appendEventPinyinResults(ranked, index, query, hasEraMatch) {
      const matches = [];
      for (const item of index) {
        if (item.kind !== 'event') continue;
        const sources = [item, ...(item.altPinyin || [])];
        let source = sources.find(entry => entry.pinyinKeys?.includes(query));
        let score = 50;
        if (!source && !hasEraMatch) {
          source = sources.find(entry => entry.pinyinKeys?.some(key => key.includes(query)));
          score = 45;
        }
        if (!source) continue;
        matches.push({
          ...item,
          milestone: source.milestone,
          titleZh: source.titleZh,
          titleEn: source.titleEn,
          subZh: source.subZh,
          subEn: source.subEn,
          score: score + (item.dynasty === this.dynasties[this.dynastyIdx] ? 4 : 0),
          bucket: 'event',
        });
      }
      matches.sort((a, b) => b.score - a.score);
      for (const item of matches) {
        if (ranked.length >= 12) break;
        if (!ranked.some(previous => this._isDuplicateSearchEvent(item, previous))) ranked.push(item);
      }
      return ranked;
    }

    _rankQuickSearchResults(results) {
      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.polityFrom !== undefined && b.polityFrom !== undefined) {
          return a.polityFrom - b.polityFrom;
        }
        return 0;
      });

      const deduped = [];
      const seenAdminTitle = new Map();
      for (const item of results) {
        if (item.kind === 'prefecture' || item.kind === 'region') {
          const ak = item.titleZh;
          if (seenAdminTitle.has(ak)) {
            const prev = seenAdminTitle.get(ak);
            if (item.dynasty && prev.dynasty && item.dynasty.title !== prev.dynasty.title) {
              const dLabel = item.dynasty.badge || item.dynasty.title;
              if (!prev._mergedDynasties.includes(dLabel)) prev._mergedDynasties.push(dLabel);
            }
            continue;
          }
          const copy = {
            ...item,
            _mergedDynasties: item.dynasty ? [item.dynasty.badge || item.dynasty.title] : [],
          };
          seenAdminTitle.set(ak, copy);
          deduped.push(copy);
          continue;
        }
        if (item.kind === 'city' && item.coord) {
          const dupCity = deduped.some(
            (prev) =>
              prev.kind === 'city' &&
              prev.titleZh === item.titleZh &&
              prev.coord &&
              this.projector.greatCircleKm(prev.coord, item.coord) <= 120
          );
          if (dupCity) continue;
        } else if (item.kind === 'event') {
          const dupEv = deduped.some(previous => this._isDuplicateSearchEvent(item, previous));
          if (dupEv) continue;

          const siteKey = (item.milestone && item.milestone.site) || '';
          if (siteKey) {
            const sameSite = deduped.filter(
              (prev) => prev.kind === 'event' && prev.milestone && prev.milestone.site === siteKey
            ).length;
            if (sameSite >= 3) continue;
          }
        }
        deduped.push(item);
      }

      for (const item of deduped) {
        if (item._mergedDynasties && item._mergedDynasties.length > 1 && !item.subZh) {
          const dyns = item._mergedDynasties.slice(0, 4).join('、');
          item.subZh = `历${dyns}`;
        }
        item.bucket = this._searchBucket(item);
      }

      if (!deduped.length) return [];

      const buckets = {
        regime: [],
        person_era: [],
        geo: [],
        event: [],
      };
      for (const item of deduped) {
        buckets[item.bucket].push(item);
      }
      const hasOtherBuckets =
        buckets.regime.length + buckets.person_era.length + buckets.event.length > 0;
      if (hasOtherBuckets && buckets.geo.length > 3) {
        let adminCount = 0;
        buckets.geo = buckets.geo.filter((g) => {
          if (g.kind === 'prefecture' || g.kind === 'region') {
            adminCount++;
            return adminCount <= 2;
          }
          return true;
        });
      }

      const topBucket = deduped[0].bucket;
      const defaultOrder = ['regime', 'person_era', 'geo', 'event'];
      const bucketOrder = [topBucket, ...defaultOrder.filter((b) => b !== topBucket)];

      const baseQuotas = {
        regime: buckets.regime[0] && buckets.regime[0].score < 70 ? 2 : 5,
        person_era: 3,
        geo: buckets.geo[0] && buckets.geo[0].score < 70 ? 2 : 3,
        event: 2,
      };
      if (topBucket !== 'regime') {
        baseQuotas[topBucket] = Math.max(baseQuotas[topBucket], 4);
      }

      const pickedByBucket = { regime: [], person_era: [], geo: [], event: [] };
      const overflowByBucket = { regime: [], person_era: [], geo: [], event: [] };
      let totalPicked = 0;

      for (const b of bucketOrder) {
        const list = buckets[b];
        const qLimit = baseQuotas[b];
        for (let i = 0; i < list.length; i++) {
          if (i < qLimit && totalPicked < 12) {
            pickedByBucket[b].push(list[i]);
            totalPicked++;
          } else {
            overflowByBucket[b].push(list[i]);
          }
        }
      }

      if (totalPicked < 12) {
        for (const minScore of [70, 0]) {
          for (const b of bucketOrder) {
            for (const item of overflowByBucket[b]) {
              if (totalPicked >= 12) break;
              if (item._picked || item.score < minScore) continue;
              item._picked = true;
              pickedByBucket[b].push(item);
              totalPicked++;
            }
          }
        }
      }

      const finalResults = [];
      for (const b of bucketOrder) {
        finalResults.push(...pickedByBucket[b]);
      }
      return finalResults.slice(0, 12);
    }

    _selectSearchResult(item) {
      this.stopAutoplay();
      this.clearCustomRoute();
      this._clearQuickSearchInput();

      if (item.kind === 'quiz') {
        if (this.challenge) this.stopChallenge();
        else this._openChallenge();
        return;
      }

      if (item.kind === 'multi_person') {
        this.openPersonChronicle(item.personProfiles, -1);
        return;
      }

      if (item.kind === 'person' || item.kind === 'story') {
        this.openPersonChronicle(
          item.personProfile || item.storyKey || item.personKey || item.titleZh,
          -1
        );
        return;
      }

      if (item.kind === 'polity') {
        this.openPolityByKey(item.polityKey);
        return;
      }

      if (item.year !== null && item.year !== undefined) {
        this.jumpToYear(item.year);
      }

      if ((item.kind === 'city' || item.kind === 'pass' || item.kind === 'gazetteer') && item.coord) {
        if (!this._id('chk-settlements').checked) {
          this._id('chk-settlements').checked = true;
          this.grpSettlements.classList.remove('is-hidden');
        }

        const isDesktop = typeof window === 'undefined' || window.innerWidth > 900 || Boolean(this.embed);
        const minCityZoom = isDesktop ? 2.4 : 3.25;
        const rawZoom = item.zoom || (item.kind === 'pass' ? 2.35 : item.tier === 2 ? 2.4 : 1.85);
        const targetZoom =
          item.kind === 'gazetteer' || item.tier === 2 ? Math.max(rawZoom, minCityZoom) : rawZoom;
        const [tx, ty] = this.projector.toScreen(item.coord[0], item.coord[1]);
        const w = Math.min(this.camera.w, 1000 / targetZoom);
        const h = w * this._getViewportAspect();
        const xFrac = isDesktop ? 0.38 : 0.5;
        const yFrac = isDesktop ? 0.45 : 0.32;
        this._animateCameraTo({ x: tx - w * xFrac, y: ty - h * yFrac, w, h });
        this.openGenealogyAt(
          item.coord[0],
          item.coord[1],
          item.kind === 'gazetteer' ? item.titleZh : undefined
        );
      } else if ((item.kind === 'prefecture' || item.kind === 'region') && item.coord) {
        if (!this._id('chk-prefectures').checked) {
          this._id('chk-prefectures').checked = true;
          this.grpPrefectures.classList.remove('is-hidden');
        }
        if (this._materializeDeferredPrefectures()) {
          this._rescaleSvgTypography();
        }
        const [tx, ty] = this.projector.toScreen(item.coord[0], item.coord[1]);
        const w = Math.min(this.camera.w, 1000 / 1.95);
        const h = w * this._getViewportAspect();
        this._animateCameraTo({ x: tx - w * 0.5, y: ty - h * 0.48, w, h });
        if (item.prefTitle) {
          setTimeout(() => {
            const el = this.grpPrefectures.querySelector(
              `.prefecture-shape[data-pref-title="${CSS.escape(item.prefTitle)}"]`
            );
            this._setHoveredPrefecture(el);
          }, 80);
        }
      } else if (item.kind === 'event' && item.milestone) {
        const storyHit = this._findStoryForMilestone(item.dynasty, item.milestone);
        if (storyHit) {
          this.openPersonChronicle(storyHit.key, -1);
          return;
        }
        this.openMilestoneBalloon(item.dynasty, item.milestone);
        if (item.coord) this._panToward(item.coord[0], item.coord[1]);
      }
    }
  }

  function install(Ctrl) {
    HistoricalAtlasController = Ctrl;
    ERA_DYNASTY_PREFIXES = Ctrl._eraDynastyPrefixes || [];
    Ctrl._extendPrototype(AtlasSearchMixin);
  }

  if (typeof window === 'undefined') return;
  const readyCtrl = window.HistoricalAtlasController;
  if (readyCtrl && typeof readyCtrl._extendPrototype === 'function') {
    install(readyCtrl);
  } else {
    (window.__ATLAS_MIXINS = window.__ATLAS_MIXINS || []).push(install);
  }
})();
