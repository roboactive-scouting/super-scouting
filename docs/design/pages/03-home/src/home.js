// Shared bits for the Home variants.
window.H = (() => {
  const ic = {
    scout:
      '<svg viewBox="0 0 24 24"><path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 13l2 2 4-4"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><path d="M3 9h18M8 3v4M16 3v4M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1"/></svg>',
    sync: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    trophy:
      '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3a3 3 0 0 1-3 3M7 6H4a3 3 0 0 0 3 3"/></svg>',
  };
  const events = [
    { n: 'District #1 · Haifa', d: 'Feb 24–26', s: 'Finished' },
    { n: 'District #2 · Be’er Sheva', d: 'Mar 10–12', s: 'Finished' },
    { n: 'District #3 · Tel Aviv', d: 'Mar 24–26', s: 'cur' },
    { n: 'District #4 · Jerusalem', d: 'Apr 7–9', s: '' },
    { n: 'District Championship', d: 'Apr 28–May 1', s: '' },
  ];
  function evcards(o = {}) {
    const list = o.limit ? events.slice(0, o.limit) : events;
    return list
      .map((e) => {
        const cur = o.cur ? e.n === o.cur : e.s === 'cur';
        const def = e.s === 'cur';
        let badge = '';
        if (cur) badge = `<span class="tag ok">${o.override ? 'Current, this session only' : 'Current · default'}</span>`;
        else if (def) badge = '<span class="tag n">Default</span>';
        return `<div class="evc${cur ? ' cur' : ''}${o.offline && !def ? ' off' : ''}"><b>${e.n}</b><small>${e.d}</small>${badge ? `<span>${badge}</span>` : ''}</div>`;
      })
      .join('');
  }
  function seasons(on = 2026) {
    return `<div class="chips">${[
      [2026, 'REBUILT'],
      [2025, 'REEFSCAPE'],
      [2024, 'CRESCENDO'],
    ]
      .map(([y, g]) => `<span class="${y === on ? 'on' : ''}"><span class="num">${y}</span>${g}${y === 2026 ? ' · default' : ''}</span>`)
      .join('')}</div>`;
  }
  return { ic, evcards, seasons };
})();
