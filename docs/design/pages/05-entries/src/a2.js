// Builders for the closed Entries design (variant "A, simpler").
window.EF = (() => {
  const nopts = (r) => r.s === 'N' || r.s === 'D';
  const wt = (r) => (r.sync === 'w' ? `<span class="wt">${E.svg('up')}</span>` : '');
  const card = (r) => `<div class="pc2"><div class="a"><span class="m">Q${r.m}</span><span class="tn">${r.tn}</span><span class="nm">${r.nm}</span></div>
  <div class="p">${nopts(r) ? '<b class="dash">—</b>' : `<b>${r.pts}</b>`}<small>pts</small></div>
  <div class="b">${E.station(r.st)}${E.status(r.s)}<span>${r.who.split(' ')[0]} · <span class="num">${r.at}</span></span>${wt(r)}</div>
  ${r.flag ? `<div class="x">${E.flag()}</div>` : ''}${r.sync === 'r' ? `<div class="x">${E.rej()}</div>` : ''}</div>`;
  const tr = (r) =>
    `<tr class="${r.sync === 'r' ? 'rej' : ''}"><td class="m">Q${r.m}</td><td>${E.station(r.st)}<span class="tn">${r.tn}</span><span class="nm">${r.nm}</span>${r.flag ? ' ' + E.flag() : ''}</td><td>${E.status(r.s)}</td><td>${r.who}</td><td class="t">${r.at}${wt(r)}</td><td class="pts">${nopts(r) ? '<span class="dash">—</span>' : r.pts}</td></tr>` +
    (r.sync === 'r' ? `<tr class="rejnote"><td colspan="6">${E.rej()}</td></tr>` : '');
  return { card, tr };
})();
