// Forms list round (/admin/forms): mock data, pieces and the page composer.
// Loads after ../../12-form-builder/src/builder.js (FB: icons, NEW tag, the Forms nav row).
window.FL = (() => {
  const { svg, NEW } = FB;
  const restoreI = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  const icMatch = svg('file');
  const icSuper = svg('rating');

  const head = () => `<div class="fl-hd"><div><div class="mh1">Forms</div><div class="msub">The scouting forms for each season. Open one to edit it in the form builder.</div></div></div>`;
  const seasons = (on) => `<div class="fl-seasons"><span class="lab">Season</span>${[['2027', 'new'], ['2026', 'active'], ['2025', ''], ['2024', '']].map(([y, t]) =>
    `<span class="fl-sc ${y === on ? 'on' : ''}">${t === 'active' ? '<i class="adot"></i>' : ''}<code>${y}</code>${t ? `<small>${t === 'active' ? 'active' : 'no forms yet'}</small>` : ''}</span>`).join('')}</div>`;
  const warn = () => `<div class="fl-warn">${svg('warn')}<span><b>No match form is published for 2027.</b> Scouts can't open an entry until one is.</span></div>`;

  const tagPub = `<span class="fl-tag pub">${svg('lock')}v3 · Published · Locked</span>`;
  const tagNone = '<span class="fl-tag none">Not created</span>';
  const matchHead = (o = {}) => `<div class="fl-ch"><span class="fl-ic ${o.dim ? 'dim' : ''}">${icMatch}</span><span class="t"><b>Match form</b><small>One entry per robot per match</small></span>
      <span class="r">${o.tag || tagPub}${o.dots === false ? '' : `<span class="ibtn">${svg('dots')}</span>`}</span></div>`;
  const superHead = (o = {}) => `<div class="fl-ch"><span class="fl-ic dim">${icSuper}</span><span class="t"><b>Super form</b><small>One entry per alliance per match, by a super scout</small></span><span class="r">${o.tag || tagNone}</span></div>`;
  const stats = () => `<div class="fl-stats"><div><small>Fields</small><b>15</b></div><div><small>Entries${NEW}</small><b>214</b></div><div><small>Versions</small><b>3</b></div><div style="flex:1.6"><small>Last edited${NEW}</small><b class="s">08/10 · Noa Levi</b></div></div>`;
  const draft = () => `<div class="fl-draft">${svg('file')}<span><b>Draft v4 in progress</b> · 2 fields added · not published yet</span><span class="r link">Continue ${svg('next')}</span></div>`;
  const acts = (o = {}) => `<div class="fl-acts"><span class="btn primary">${svg('eye')}Open builder</span><span class="btn">${svg('down')}Export</span>${o.extra || ''}</div>`;
  const emptyActs = (what) => `<div class="fl-acts"><span class="btn primary">${svg('plus')}Create ${what}</span><span class="btn">${svg('up')}Import</span></div>`;
  const superEmpty = (season) => `<div class="fl-empty">${superHead()}<p>No super form for ${season} yet. Super scouting is optional; the match form is enough to scout.</p>${emptyActs('super form')}</div>`;
  const matchEmpty = () => `<div class="fl-empty">${matchHead({ dim: true, tag: tagNone, dots: false })}<p>Every entry needs a match form. Create it here, or <b>import</b> last season's: export it from 2026, then pick it under Import.</p>${emptyActs('match form')}</div>`;

  // readiness (variant D)
  const ri = (state, text, side) => `<div class="fl-ri"><span class="c ${state}">${state === 'ok' ? svg('check') : state === 'no' ? '!' : ''}</span><b>${text}</b>${side || ''}</div>`;
  const ready = (title, count, items) => `<div class="fl-ready"><div class="hd">${title}${NEW}<span class="r">${count}</span></div>${items}</div>`;

  /* ---------- composer: two desktop views stacked, the phone gate, the NEW card ---------- */
  const gate = () => `<div class="gate"><div class="gi">${svg('monitor')}</div><b>This needs a computer</b>
    <p>Open the forms page on a screen at least 1024 pixels wide. It is pre-season work, done sitting down. Phones do the competition job — entering, browsing and reading — and this is not one of those.</p>
    <span class="btn">Back to scouting</span></div>`;
  const newCard = (items, layout) => `<div class="fl-newcard"><h4>New in this variant</h4><p>Not in the spec today. For each: now · not now, but wanted · not at all.</p>
    <ol>${items.map((i) => `<li><span>${i}</span></li>`).join('')}</ol><div class="lay">${layout}</div></div>`;
  const tall = (o) => {
    const desk = (inner) => `<div class="desk"><div data-desk-shell="forms" data-crumb="Admin / <b>Forms</b>"><div class="fl-pad">${inner}</div></div></div>`;
    document.getElementById('root').innerHTML = `<div class="canvas tall">
      <div class="canvas-head"><b>${o.title}</b><span>${o.desc}</span></div>
      <div class="row2">
        <div style="display:flex;flex-direction:column;gap:14px">
          <figure class="frame">${desk(o.v1)}<figcaption>${o.c1}</figcaption></figure>
          <figure class="frame">${desk(o.v2)}<figcaption>${o.c2}</figcaption></figure>
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          <figure class="frame"><div class="phone"><div data-phone-shell data-time="20:14" data-title="Forms">${gate()}</div></div><figcaption>Below 1024 px: the locked desktop-only gate (Forms is not in the phone menu)</figcaption></figure>
          ${o.news}
        </div>
      </div></div>`;
  };

  return { svg, NEW, restoreI, icMatch, icSuper, head, seasons, warn, tagPub, tagNone, matchHead, superHead, stats, draft, acts, emptyActs, superEmpty, matchEmpty, ri, ready, newCard, tall };
})();
