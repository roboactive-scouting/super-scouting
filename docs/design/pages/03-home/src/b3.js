// Option tiles for Home B3.
window.B3 = (() => {
  const ic = {
    scout: H.ic.scout,
    list: H.ic.list,
    cal: H.ic.cal,
    users:
      '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
  };
  const ALL = [
    ['scout', 'Scout a match', 'Your station · Blue 2', false],
    ['list', 'Entries', 'Review and fix what you entered', false],
    ['swap', 'Switch scouter', 'Hand this device to someone else', false],
    ['cal', 'Manage', 'Seasons, events, teams and matches', true],
    ['users', 'Users', 'Accounts and roles', true],
  ];
  function opts(admin = true, noScout = false) {
    return ALL.filter((o) => (admin || !o[3]) && !(noScout && o[0] === 'scout'))
      .map(
        (o) =>
          `<div class="opt${o[3] ? ' admin' : ''}"><span class="oi">${ic[o[0]]}</span><b>${o[1]}</b><small>${o[2]}</small>${o[3] ? '<span class="role">ADMIN</span>' : '<span class="arrow">›</span>'}</div>`,
      )
      .join('');
  }
  function team(tag = true) {
    return `<div class="team"><img src="../../../concepts/src/mark.png" alt=""><div><span class="tn">2096 RobActive</span><small>Our team at this event${tag ? ' <span class="later">AFTER RANKING</span>' : ''}</small></div><div class="rank"><b>#3 <span>/ 42</span></b><small>avg 51.2 · ▲ 2 places</small></div></div>`;
  }
  return { opts, team };
})();
