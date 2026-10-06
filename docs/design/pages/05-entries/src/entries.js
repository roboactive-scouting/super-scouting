// Mock data and builders for the Entries round. Colours come only from theme.css.
window.E = (() => {
  const T = {
    1690: 'Orbit', 3075: 'Ha-Dream Team', 6230: 'Team Koi', 2231: 'OnyxTronix', 5654: 'Phoenix',
    7039: 'Ultimate', 1574: 'MisCar', 1937: 'Elysium', 2630: 'Thunderbolts', 3339: 'BumbleB',
    4590: 'GreenBlitz', 5951: 'Tiny Titans', 1943: 'NeatTeam', 3316: 'D-Bug', 4320: 'The Joker',
    4338: 'Falcons', 5135: 'Black Unicorns', 5987: 'Galaxia', 6738: 'Excalibur', 7112: 'EverGreen',
    8175: 'Piece of Mind', 2096: 'RobActive',
  };
  // [match, station, team, status, scouter, time, sync, pts, flag]
  // status: P played · B broke down · D disabled · N no show; sync: s sent · w waiting · r refused
  const R = [
    [38, 'B2', 5951, 'P', 'Noa Levi', '11:41', 'w', 34],
    [38, 'R1', 1574, 'P', 'Amit Ben-David', '11:40', 'w', 41],
    [38, 'R3', 4338, 'B', 'Yael Shapira', '11:41', 'w', 12],
    [38, 'B1', 7112, 'P', 'Omer Katz', '11:39', 's', 27],
    [37, 'B2', 3316, 'P', 'Noa Levi', '11:33', 's', 29, 'line'],
    [37, 'R2', 1690, 'P', 'Amit Ben-David', '11:32', 's', 52],
    [37, 'B3', 6738, 'N', 'Yael Shapira', '11:31', 's', null],
    [37, 'R1', 2630, 'P', 'Omer Katz', '11:32', 's', 22],
    [36, 'B2', 5135, 'D', 'Noa Levi', '11:25', 'r', 8],
    [36, 'R3', 3075, 'P', 'Amit Ben-David', '11:24', 's', 38],
    [36, 'B1', 2231, 'P', 'Tamar Mizrahi', '11:24', 's', 45],
    [35, 'B2', 4590, 'P', 'Noa Levi', '11:16', 's', 31],
    [35, 'R1', 6230, 'P', 'Omer Katz', '11:15', 's', 26],
    [35, 'R2', 1937, 'B', 'Yael Shapira', '11:16', 's', 15],
  ];
  const ST = {
    P: ['Played', 'st-p'],
    B: ['Broke down', 'st-b'],
    D: ['Disabled', 'st-d'],
    N: ['No show', 'st-n'],
  };
  const ic = {
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ic[k]}</svg>`;
  const row = (r) => ({
    m: r[0], st: r[1], tn: r[2], nm: T[r[2]], s: r[3], who: r[4], at: r[5], sync: r[6], pts: r[7], flag: r[8],
  });
  const rows = (o = {}) => {
    let x = R.map(row);
    if (o.mine) x = x.filter((r) => r.who === 'Noa Levi');
    if (o.asc) x = x.slice().reverse();
    if (o.n) x = x.slice(0, o.n);
    return x;
  };
  const status = (s) => `<span class="st ${ST[s][1]}">${ST[s][0]}</span>`;
  const station = (st) =>
    `<span class="stn ${st[0] === 'R' ? 'r' : 'b'}">${st[0] === 'R' ? 'Red' : 'Blue'} ${st[1]}</span>`;
  const sync = (k, short) =>
    k === 's'
      ? `<span class="sy s">${svg('check')}${short ? '' : 'Sent'}</span>`
      : k === 'w'
        ? `<span class="sy w">${svg('up')}${short ? '' : 'Waiting'}</span>`
        : `<span class="sy r">${svg('alert')}${short ? '' : 'Not synced'}</span>`;
  const flag = () => `<span class="flg">${svg('flag')}Not in line-up</span>`;
  const REFUSED = 'This entry is locked — ask a lead';
  const rej = () => `<div class="rejbox">${svg('alert')}<span><b>Not synced:</b> ${REFUSED}</span></div>`;
  // Fill <i data-i="x"></i> with icons.
  const icons = () =>
    document.querySelectorAll('i[data-i]').forEach((el) => (el.outerHTML = svg(el.dataset.i)));
  return { T, rows, status, station, sync, flag, svg, rej, icons, REFUSED, ST };
})();
