// Builders for the phone shell round.
window.PS = (() => {
  const I = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    scout: '<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 13l2 2 4-4"/>',
    entries: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    matches: '<path d="M3 9h18M8 3v4M16 3v4M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1"/>',
    swap: '<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${I[k]}</svg>`;
  const mark = '../../../concepts/src/mark.png';
  const sbar = (cls, t = '11:43') => `<div class="sb2 ${cls}"><span>${t}</span><span style="font-size:11px">● ● ●</span></div>`;
  const top = (cls, title, sync = '<span class="dot2"></span>3 waiting', o = {}) =>
    `<div class="tb2 ${cls}">${o.nomenu ? '<span style="width:8px"></span>' : `<span class="ib">${svg('menu')}</span>`}<img src="${mark}" alt=""><b>${title}</b><span class="syn">${sync}</span></div>`;
  const home = () => `<div class="body2"><span class="eyeb">This device is working on</span><h2>District #3 · Tel Aviv</h2>
    <div class="pb">Scout a match</div><div class="sbx">Switch competition</div>
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:8px"><div class="crd" style="height:76px"></div><div class="crd" style="height:76px"></div></div>
    <div class="crd" style="height:96px;background:var(--rail);border:0"></div><div class="crd" style="height:150px"></div></div>`;
  const tabs = (on, cls = 'pill', o = {}) => {
    const t = [['home', 'Home'], ['scout', 'Scout'], ['entries', 'Entries']];
    if (o.more) t.push(['more', 'More']);
    return `<div class="bb ${cls}">${t.map(([k, l]) => `<span class="${k === on ? 'on' : ''}"><span class="ic">${svg(k)}</span>${l}${k === 'entries' && o.badge ? '<span class="badge2">3</span>' : ''}</span>`).join('')}</div>`;
  };
  const navItems = (on, o = {}) => `
    <h6>Competition</h6>
    <a class="${on === 'home' ? 'on' : ''}">${svg('home')}Home</a><a class="${on === 'scout' ? 'on' : ''}">${svg('scout')}Scout</a><a>${svg('entries')}Entries</a>
    ${o.admin ? `<h6>Admin</h6><a>${svg('matches')}Matches<span class="tag2">ADMIN</span></a>` : ''}`;
  const account = (o = {}) => `<div class="acc">
    <div class="who3"><span class="av">NL</span><div><b>Noa Levi</b><small>Scout lead</small></div></div>
    <a>${svg('swap')}Switch scouter</a><a>${svg('lock')}Change password</a><a>${svg('out')}Sign out</a>
    <div class="meta3"><span>version 1.4.0</span><span>Team 2096</span></div></div>`;
  return { svg, sbar, top, home, tabs, navItems, account, mark };
})();
