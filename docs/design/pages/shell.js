// Injects the D1 desktop sidebar/top bar and the phone top bar into every page-round
// mockup. <div data-desk-shell="scout" data-crumb="Scout / <b>Q39</b>"> wraps desktop
// content; <div data-phone-shell> wraps phone content.
(() => {
  const icon = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    scout:
      '<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 13l2 2 4-4"/>',
    entries: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    manage:
      '<path d="M3 9h18M8 3v4M16 3v4M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    teams: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    ranking:
      '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${icon[k]}</svg>`;
  const nav = (on, id, label) =>
    `<a class="${on === id ? 'on' : ''}">${svg(id)}${label}</a>`;
  window.SHELL = { svg };

  document.querySelectorAll('[data-desk-shell]').forEach((el) => {
    const on = el.dataset.deskShell;
    const crumb = el.dataset.crumb || '';
    const inner = el.innerHTML;
    // data-nav="stats" (Phase 1 I on): Search and Ranking join the Competition group.
    const stats = el.dataset.nav === 'stats';
    const comp = stats
      ? `${nav(on, 'home', 'Home')}${nav(on, 'scout', 'Scout')}${nav(on, 'teams', 'Search')}${nav(on, 'ranking', 'Ranking')}${nav(on, 'entries', 'Entries')}`
      : `${nav(on, 'home', 'Home')}${nav(on, 'scout', 'Scout')}${nav(on, 'entries', 'Entries')}`;
    el.outerHTML = `<div class="app">
      <aside class="side">
        <div class="brand"><img src="../../../concepts/src/mark.png" alt=""><div><b>RobActive Scout</b><small>Team 2096</small></div></div>
        <div class="navg"><h6>Competition</h6>${comp}</div>
        <div class="navg"><h6>Admin</h6>${nav(on, 'users', 'Users')}${nav(on, 'manage', 'Manage')}</div>
        <div class="foot"><div class="av">NL</div><div><b>Noa Levi</b><small>Scout lead · Switch</small></div></div>
      </aside>
      <div class="main">
        <header class="top"><div class="crumb">${crumb}</div><span class="sp"></span>
          <span class="chip"><span class="dot w"></span>3 waiting to send</span>
          <span class="chip"><span class="dot"></span>Online</span></header>
        <div class="content">${inner}</div>
      </div></div>`;
  });

  document.querySelectorAll('[data-phone-shell]').forEach((el) => {
    const time = el.dataset.time || '11:43';
    const title = el.dataset.title || 'Scout';
    const sync = el.dataset.sync || '<span class="dot w"></span>3 waiting';
    const inner = el.innerHTML;
    // data-bbar="<current id>" adds the dark bottom bar (plan 1.58): Home · Scout · Search · Ranking,
    // the current page raised in green; data-bbar="none" for a page that is in none of them.
    const cur = el.dataset.bbar;
    const tab = (id, label) =>
      cur === id
        ? `<span class="cur"><span class="fab">${svg(id)}</span>${label}</span>`
        : `<span><span class="ic">${svg(id)}</span>${label}</span>`;
    const bar = cur
      ? `<div class="pbar">${tab('home', 'Home')}${tab('scout', 'Scout')}${tab('teams', 'Search')}${tab('ranking', 'Ranking')}</div>`
      : '';
    el.outerHTML = `<div class="sbar"><span>${time}</span><span style="font-size:11px">● ● ●</span></div>
      <div class="ptop"><span class="menu">${svg('menu')}</span><img src="../../../concepts/src/mark.png" alt=""><b>${title}</b>
        <span class="sync">${sync}</span></div>
      <div class="pbody">${inner}</div>${bar}`;
  });
})();
