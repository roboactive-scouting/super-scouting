// Entry search round (26): /entries becomes the entry search (SPEC-FINAL 13.3) — the closed Entries page (05)
// plus the match / super kind filter. Loads after 05-entries (E, EF) and 24-team (TP).
window.ES = (() => {
  const { svg, phone, fig, NEW } = TP;
  const EV = 'District #3 · Tel Aviv';
  const SUP = [[1690, 'Orbit', 'Dana Mor', '11:12'], [1574, 'MisCar', 'Noa Levi', '10:58'], [4590, 'GreenBlitz', 'Yael Shapira', '10:40']];
  const hi = (s, q) => (q ? String(s).replace(new RegExp(`(${q})`, 'i'), '<span class="es-hi">$1</span>') : s);

  // ---------- rows ----------
  const card = (r, o = {}) => EF.card(r).replace('class="pc2"', `class="pc2 lnk ${o.press ? 'press' : ''}"`).replace(r.who.split(' ')[0], hi(r.who.split(' ')[0], o.q));
  const supCard = (s, o = {}) => `<div class="pc2 lnk"><div class="a"><span class="es-sup">SUPER</span><span class="tn">${s[0]}</span><span class="nm">${s[1]}</span></div><div class="p"><span class="none">whole event</span></div><div class="b"><span>${hi(s[2].split(' ')[0], o.q)} · <span class="num">${s[3]}</span></span></div></div>`;
  const tr = (r, o = {}) => EF.tr(r).replace(/^<tr class="/, `<tr class="lnk ${o.hov ? 'hov' : ''} `);
  const supTr = (s) => `<tr class="lnk"><td class="m"><span class="dash" style="color:var(--muted)">—</span></td><td><span class="tn">${s[0]}</span><span class="nm">${s[1]}</span></td><td><span class="es-sup">SUPER</span></td><td>${s[2]}</td><td class="t">${s[3]}</td><td class="pts"></td></tr>`;
  const table = (body) => `<div class="tbl"><table><thead><tr><th><span class="sa">Match ↓</span></th><th>Team</th><th>Status</th><th>Scouter</th><th>Time</th><th class="r">Points</th></tr></thead><tbody>${body}</tbody></table></div>`;
  // newest first: the three super entries fall between matches by time
  const mixed = (n = 14) => {
    const R = E.rows().slice(0, n);
    return { R, at: { 4: SUP[0], 9: SUP[1] } };
  };
  const mixedCards = (n, o = {}) => { const { R, at } = mixed(n); return R.map((r, i) => (at[i] ? supCard(at[i]) : '') + card(r, { press: o.press === i })).join(''); };
  const mixedRows = (n, o = {}) => { const { R, at } = mixed(n); return R.map((r, i) => (at[i] ? supTr(at[i]) : '') + tr(r, { hov: o.hov === i })).join(''); };

  // ---------- controls ----------
  const srch = (v, o = {}) => `<div class="es-srch ${v ? 'focus' : ''}">${E.svg('search')}${v ? `<span style="color:var(--ink)">${v}</span><span class="x">✕</span>` : 'Team, match or scouter'}</div>`;
  const chips4 = (on = 'All', o = {}) => [['All', o.all ?? 17], ['Mine', 5], ['Waiting', 3], ['Needs a look', 2]].map(([l, c]) => `<span class="fchip ${l === on ? 'on' : ''}">${l} <span class="c">${c}</span></span>`).join('');
  const seg = (on = 'Both', cls = '') => `<div class="es-seg ${cls}" role="radiogroup" aria-label="Kind">${[['Both', 17], ['Match', 14], ['Super', 3]].map(([l, c]) => `<span class="${l === on ? 'on' : ''}">${l}<span class="c">${c}</span></span>`).join('')}</div>`;
  const kindChips = (on = []) => `<span class="es-div"></span>${[['Match', 14], ['Super', 3]].map(([l, c]) => `<span class="fchip ${on.includes(l) ? 'on' : ''}" aria-pressed="${on.includes(l)}">${l} <span class="c">${c}</span></span>`).join('')}`;
  const head = (sub) => `<div><div class="es-h1">Entries</div><div class="es-sub">${sub || `${EV} · match and super · newest first`}</div></div>`;
  const key = `<div class="key"><span><span class="wt">${E.svg('up')}</span>waiting to send</span><span>— no points: didn't play or disabled</span><span>a super entry has no score</span></div>`;

  // ---------- frames ----------
  const bar = () => {
    const t = (k, l) => `<span><span class="ic">${svg(k)}</span>${l}</span>`;
    return `<div class="bb dark">${t('home', 'Home')}${t('scout', 'Scout')}${t('search', 'Search')}<span class="center on"><span class="fab">${svg('entries')}</span><span class="lbl" style="color:#fff">Entries</span><span class="badge2">3</span></span></div>`;
  };
  const P = (inner, o = {}) => phone(inner, { title: 'Entries', time: o.time, bar: bar() });
  const desk = (inner) => `<div class="desk"><div data-desk-shell="entries" data-crumb="<b>Entries</b>"><div style="position:relative;height:100%">${inner}</div></div></div>`;
  const fixDesk = () => document.querySelectorAll('.side .navg').forEach((g) => {
    const scout = [...g.querySelectorAll('a')].find((x) => x.textContent.trim() === 'Scout');
    if (scout) scout.insertAdjacentHTML('afterend', `<a>${svg('search')}Search</a>`);
  });
  const dhead = (sub) => `<div class="ehd"><div><h1>Entries</h1><p>${sub || `Every entry at ${EV}, match and super, newest first. A row opens the entry.`}</p></div></div>`;

  const V = {
    a: {
      title: 'A · Entries + a kind switch',
      sub: 'The closed Entries page (05) unchanged, plus a Both · Match · Super switch. Super entries sit in the list by time with a SUPER tag and no score. Every row opens the entry preview (›, tinted on hover/press).',
      desk: () => desk(`<div class="es-dpad">${dhead()}<div class="es-dbar">${srch('')}<div class="es-chips">${chips4()}</div><span style="flex:1"></span>${seg('Both', 'dk')}</div>${table(mixedRows(11, { hov: 2 }))}${key}</div>`),
      p1: () => P(`<div class="es-pad">${head()}${srch('')}${seg()}<div class="es-chips">${chips4()}</div>${mixedCards(6, { press: 1 })}</div>`),
      p2: () => P(`<div class="es-pad">${head()}${srch('')}${seg('Super')}<div class="es-chips">${chips4('All', { all: 3 })}</div>${SUP.map((s) => supCard(s)).join('')}</div>`, { time: '12:31' }),
      c1: 'Phone · Both (a row pressed)', c2: 'Phone · Super only',
    },
    b: {
      title: 'B · Kind as two more chips',
      sub: 'One chip row: All · Mine · Waiting · Needs a look, a divider, then Match and Super as toggles (neither = both). A count line under the search says what is shown, with Clear.',
      desk: () => desk(`<div class="es-dpad">${dhead()}<div class="es-dbar">${srch('')}<div class="es-chips">${chips4()}${kindChips()}</div></div>${table(mixedRows(11, { hov: 2 }))}${key}</div>`),
      p1: () => P(`<div class="es-pad">${head()}${srch('')}<div class="es-chips" style="overflow:visible;flex-wrap:nowrap;margin-right:-14px">${chips4()}${kindChips()}</div>${mixedCards(6)}</div>`),
      p2: () => P(`<div class="es-pad">${srch('noa')}<div class="es-chips">${chips4('All', { all: 5 })}${kindChips(['Match'])}</div><div class="es-count"><span><b>4</b> match entries by “noa”</span><span class="clr">Clear</span></div>${E.rows().filter((r) => r.who === 'Noa Levi').map((r) => card(r, { q: 'noa' })).join('')}</div>`, { time: '12:32' }),
      c1: 'Phone · all (chips scroll sideways)', c2: 'Phone · “noa”, Match only',
    },
    c: {
      title: 'C · This device / Whole event',
      sub: 'Two tabs on one page: “On this device” keeps 05 exactly (Mine, Waiting, Needs a look); “Whole event” is the search: every entry at the event, the kind filter, any scouter.',
      desk: () => desk(`<div class="es-dpad">${dhead('On this device: what this phone holds and sends. Whole event: every entry at .')}<div class="es-tabs dk"><span>On this device <span class="c">14</span></span><span class="on">Whole event <span class="c">212</span></span></div><div class="es-dbar">${srch('')}<div class="es-chips"><span class="fchip on">Both <span class="c">212</span></span><span class="fchip">Match <span class="c">188</span></span><span class="fchip">Super <span class="c">24</span></span></div></div>${table(mixedRows(10, { hov: 2 }))}</div>`),
      p1: () => P(`<div class="es-tabs"><span class="on">On this device <span class="c">14</span></span><span>Whole event <span class="c">212</span></span></div><div class="es-pad">${srch('')}<div class="es-chips">${chips4('All', { all: 14 })}</div>${E.rows().slice(0, 6).map((r) => card(r)).join('')}</div>`),
      p2: () => P(`<div class="es-tabs"><span>On this device <span class="c">14</span></span><span class="on">Whole event <span class="c">212</span></span></div><div class="es-pad">${srch('')}<div class="es-chips"><span class="fchip on">Both <span class="c">212</span></span><span class="fchip">Match <span class="c">188</span></span><span class="fchip">Super <span class="c">24</span></span></div>${mixedCards(6)}</div>`, { time: '12:33' }),
      c1: 'Phone · On this device (05)', c2: 'Phone · Whole event',
    },
    d: {
      title: 'D · Filters in a sheet',
      sub: `Search plus one Filters button; picked filters show as dark pills with ✕. The sheet holds Kind, Robot status ${NEW}, Scouter ${NEW} and Sync (Waiting, Needs a look).`,
      desk: () => desk(`<div class="es-dpad">${dhead()}<div class="es-dbar">${srch('')}<span class="es-fbtn">${E.svg('filter')}Filters<span class="n">2</span></span><div class="es-act"><span>Match <i>✕</i></span><span>Broke down <i>✕</i></span></div></div>${table(E.rows().filter((r) => r.s === 'B').map((r) => tr(r)).join(''))}<div class="es-count"><span><b>2</b> entries</span></div></div>`),
      p1: () => P(`<div class="es-pad">${head()}<div style="display:flex;gap:8px">${srch('')}${''}<span class="es-fbtn">${E.svg('filter')}<span class="n">2</span></span></div><div class="es-act"><span>Match <i>✕</i></span><span>Broke down <i>✕</i></span></div>${E.rows().filter((r) => r.s === 'B').map((r) => card(r)).join('')}</div>`),
      p2: () => P(`<div class="es-pad">${head()}<div style="display:flex;gap:8px">${srch('')}<span class="es-fbtn">${E.svg('filter')}</span></div>${mixedCards(3)}</div><div class="es-scrim"></div><div class="es-sheet"><div class="grab"></div><h3>Filters<span>Clear all</span></h3>
        <h6>Kind</h6><div class="es-opt"><span class="on">Match</span><span>Super</span></div>
        <h6>Robot</h6><div class="es-opt"><span>Played</span><span class="on">Broke down</span><span>Disabled</span><span>No show</span></div>
        <h6>Scouter</h6><div class="es-opt"><span>Me</span><span>Noa L.</span><span>Yael S.</span><span>Omer K.</span><span>Amit B.</span></div>
        <h6>Sync</h6><div class="es-opt"><span>Waiting</span><span>Needs a look</span></div>
        <span class="btn primary block">Show 2 entries</span></div>`, { time: '12:34' }),
      c1: 'Phone · two filters on', c2: 'Phone · the Filters sheet',
    },
  };
  const render = (k) => {
    const v = V[k];
    document.getElementById('root').innerHTML = `<div class="canvas"><div class="canvas-head"><b>Entry search — ${v.title}</b><span>${v.sub}</span></div>
      <div class="frames">${fig(v.desk(), 'Desktop')}${fig(v.p1(), v.c1)}${fig(v.p2(), v.c2)}</div></div>`;
  };
  return { render, fixDesk, V, card, supCard, tr, supTr, table, mixedCards, mixedRows, srch, chips4, seg, kindChips, head, key, P, desk, dhead, SUP };
})();
