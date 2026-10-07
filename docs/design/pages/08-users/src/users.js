// Mock data and builders for the Users round. Colours come only from theme.css.
window.U = (() => {
  // [full name, username, role, disabled since, entries this season]
  const L = [
    ['Tamar Mizrahi', 'tamar.m', 'admin', null, 12],
    ['Eldad Gross', 'eldad.g', 'admin', null, 3],
    ['Noa Levi', 'noa.levi', 'lead', null, 64],
    ['Daniel Rosen', 'daniel.r', 'lead', null, 41],
    ['Amit Ben-David', 'amit.bd', 'scouter', null, 58],
    ['Yael Shapira', 'yael.s', 'scouter', null, 52],
    ['Omer Katz', 'omer.k', 'scouter', null, 47],
    ['Itai Cohen', 'itai.c', 'scouter', null, 39],
    ['Maya Friedman', 'maya.f', 'scouter', null, 33],
    ['Lior Avraham', 'lior.a', 'scouter', null, 28],
    ['Shira Peretz', 'shira.p', 'scouter', null, 0],
    ['Roni Gal', 'roni.g', 'scouter', '14/09/2026', 17],
  ];
  const ROLE = { admin: 'Admin', lead: 'Scout lead', scouter: 'Scouter' };
  const users = (o = {}) =>
    L.map(([name, user, role, off, n]) => ({ name, user, role, off, n, ini: name.split(' ').map((w) => w[0]).join('') }))
      .filter((u) => o.disabled || !u.off);
  const ic = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    paste: '<path d="M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 2h6v4H9zM9 12h6M9 16h4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ic[k]}</svg>`;
  const icons = () =>
    document.querySelectorAll('i[data-i]').forEach((el) => (el.outerHTML = svg(el.dataset.i)));
  const role = (r) => `<span class="rtag ${r}">${ROLE[r]}</span>`;
  const status = (u) => (u.off ? `<span class="stag off">Disabled since ${u.off}</span>` : '<span class="stag on">Active</span>');
  const gate = () => `<div class="gate"><div class="gi">${svg('monitor')}</div><b>This needs a computer</b>
    <p>Open the user administration page on a screen at least 1024 pixels wide. It is pre-competition work, done sitting down. Phones do the competition job — entering, browsing and reading — and this is not one of those.</p>
    <span class="btn">Back to scouting</span></div>`;
  return { users, ROLE, svg, icons, role, status, gate };
})();
