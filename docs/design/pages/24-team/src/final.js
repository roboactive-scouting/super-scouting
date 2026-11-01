// Team page (24) — closed variant D2: D's tiles and trend lines, B's match list with the scouter,
// and C's match strip, shown only on the Matches tab.
window.FIN = (() => {
  const { header, tabs, statRows, relGrid, chart, legend, metricSel, notesList, matchTable, phone, desk, matches, shadeBg, svg } = TP;
  const T = [['Stats'], ['Matches', 10], ['Progress'], ['Notes', 5]];
  const scouters = ['Yael S.', 'Dana M.', 'Noa L.', 'Omer K.'];
  const st = (s) => ({ p: '<span class="st st-p">Played</span>', b: '<span class="st st-b">Broke down</span>', n: '<span class="st st-n">No show</span>' })[s];
  const strip = (cls = '') =>
    `<div class="tp-strip ${cls}">${[...matches].reverse().map((r) => (r[1] === 'n' ? `<span class="x"><small>${r[0]}</small><b>—</b></span>` : `<span class="${r[1] === 'b' ? 'bk' : ''}" style="background:${shadeBg((r[2] - 6) / 46)}"><small>${r[0]}</small><b>${r[2]}</b></span>`)).join('')}</div>`;
  const tiles = (cls = '') => `<div class="tp-tiles ${cls}">
    <div class="tp-tile"><small>Median points</small><b>41</b><em>avg 38.4</em></div>
    <div class="tp-tile"><small>Availability</small><b>90%</b><em>9 of 10 matches</em></div>
    <div class="tp-tile"><small>Best match</small><b>47</b><em>Q37</em></div>
    <div class="tp-tile"><small>Trend</small><b>+1.3</b><em>points per match</em></div></div>`;
  const rows = () =>
    `<div role="table" aria-label="Match by match">${matches
      .map((r, i) => `<div class="tp-mc" role="row" style="min-height:52px"><span class="m">${r[0]}</span><div class="mid" style="display:flex;align-items:center;gap:8px">${st(r[1])}<span class="tp-who">${scouters[i % 4]}</span></div><div class="pts ${r[1] === 'n' ? 'tp-dash' : ''}">${r[2] ?? '—'}<small>pts</small></div><span class="chev">${svg('chev')}</span></div>`)
      .join('')}</div>`;

  const deskStats = () => desk(`<div class="tp-desk">${header({ desk: true })}${tabs(T, 'Stats', 'dk')}
    <div class="tp-dbody"><div class="tp-cols" style="grid-template-columns:1fr 1fr 330px">
      <div style="display:flex;flex-direction:column;gap:12px">${tiles('two')}<div class="tp-card"><h3>Reliability</h3><div style="margin-top:8px;border-top:1px solid var(--line-2)">${relGrid('two')}</div></div>
        <div class="tp-card"><h3>Progress<span class="sp"></span>${metricSel()}</h3><div class="tp-pad" style="padding-bottom:2px">${chart({ w: 380, h: 120 })}</div>${legend()}</div></div>
      <div class="tp-card" style="overflow:hidden">${statRows({ spark: true })}</div>
      <div><div class="tp-sec" style="margin-top:0">Notes<span class="r">newest first</span></div>${notesList(4, true)}</div>
    </div></div></div>`);
  const deskMatches = () => desk(`<div class="tp-desk">${header({ desk: true })}${tabs(T, 'Matches', 'dk')}${strip('dk')}
    <div class="tp-dbody" style="padding-top:14px">${matchTable({ hover: 1, scouter: true })}<div class="tp-empty-cap" style="margin-top:8px">A row opens the entry · Q26 was a no-show: no values, not counted</div></div></div>`);

  const add = `<div style="display:flex;align-items:center;gap:8px;height:44px;border:1px dashed var(--control-border);border-radius:8px;justify-content:center;color:var(--accent-ink);font-weight:650;font-size:13.5px;background:var(--surface)">${svg('plus').replace('<svg', '<svg style="width:16px;height:16px"')}Add a chart under it · up to 4</div>`;
  const pStats = () => phone(`${header()}<div style="padding:10px 14px;background:var(--surface);border-bottom:1px solid var(--line)">${tiles('two')}</div>${tabs(T, 'Stats')}<div class="tp-mbody"><div class="tp-card" style="overflow:hidden">${statRows({ spark: true })}</div></div>`);
  const pStatsScrolled = () => phone(`${header({ compact: true })}${tabs(T, 'Stats')}<div class="tp-mbody"><div class="tp-card">${relGrid('sm')}</div><div class="tp-card" style="overflow:hidden">${statRows({ spark: true, only: ['Teleop', 'Endgame'] })}</div></div>`, { time: '12:04' });
  const pMatches = () => phone(`${header({ compact: true })}${tabs(T, 'Matches')}${strip()}<div class="tp-sec" style="margin:10px 14px 6px">Newest first<span class="r">tap a row for the entry</span></div><div style="border-top:1px solid var(--line)">${rows()}</div>`, { time: '12:05' });
  const pProgress = () => phone(`${header({ compact: true })}${tabs(T, 'Progress')}<div class="tp-mbody">
      <div class="tp-card"><h3 style="padding-bottom:0">${metricSel()}<span class="sp"></span></h3><div class="tp-pad" style="padding-bottom:2px">${chart({ w: 330, h: 140 })}</div>${legend()}</div>
      <div class="tp-card"><h3 style="padding-bottom:0">${metricSel('Teleop high goal')}<span class="sp"></span><span style="color:var(--muted)">✕</span></h3><div class="tp-pad" style="padding-bottom:6px">${chart({ w: 330, h: 110, series: [6, 8, 3, 9, null, 7, 9, 8, 7, 9], max: 10, ticks: [0, 5, 10], avg: 7.3 })}</div></div>
      ${add}</div>`, { time: '12:06' });
  const pNotes = () => phone(`${header({ compact: true })}${tabs(T, 'Notes')}<div class="tp-mbody" style="padding-top:12px"><div class="tp-empty-cap">Long-text answers from this team's entries here · newest first</div>${notesList(5, true)}</div>`, { time: '12:07' });
  const pEmpty = () => phone(`<header class="tp-head" role="banner"><span class="tp-back">${svg('back')}</span><div><div style="display:flex;align-items:baseline;gap:8px"><span class="tn">5987</span><span class="nm">Galaxia</span></div><div class="sub">0 entries · not ranked yet</div></div><span class="sp"></span><div class="hl"><small>Avg points</small><b class="num tp-dash">—</b></div></header>
      <div class="tp-mbody" style="padding-top:18px"><div class="tp-card" style="padding:22px 18px;display:flex;flex-direction:column;gap:10px;align-items:flex-start"><span style="width:44px;height:44px;border-radius:10px;background:var(--line-2);display:grid;place-items:center;color:var(--ink-2)">${svg('search').replace('<svg', '<svg style="width:22px;height:22px"')}</span><b style="font-size:17px;font-weight:700">No entries for this team yet</b><span style="color:var(--muted);font-size:13.5px;line-height:1.45">Stats, matches and notes appear here once someone scouts 5987 at District #3 · Tel Aviv.</span><span class="btn primary" style="margin-top:4px">Scout a match</span></div></div>`, { time: '12:08', title: 'Team 5987' });

  return { deskStats, deskMatches, pStats, pStatsScrolled, pMatches, pProgress, pNotes, pEmpty };
})();
