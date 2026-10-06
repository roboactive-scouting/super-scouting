// Mock data and builders for the Manage round. Colours come only from theme.css.
window.M = (() => {
  const ROSTER = [
    [1574, 'MisCar'], [1690, 'Orbit'], [1937, 'Elysium'], [1943, 'NeatTeam'], [2096, 'RobActive'],
    [2231, 'OnyxTronix'], [2630, 'Thunderbolts'], [3075, 'Ha-Dream Team'], [3316, 'D-Bug'],
    [3339, 'BumbleB'], [4320, 'The Joker'], [4338, 'Falcons'], [4590, 'GreenBlitz'],
    [5135, 'Black Unicorns'], [5654, 'Phoenix'], [5951, 'Tiny Titans'], [5987, 'Galaxia'],
    [6230, 'Team Koi'], [6738, 'Excalibur'], [7039, 'Ultimate'], [7112, 'EverGreen'], [8175, 'Piece of Mind'],
  ];
  const OFF = [[7845, 'Rogue Robotics'], [9036, 'Cyber Owls'], [8223, 'Mariners']];
  const name = Object.fromEntries([...ROSTER, ...OFF]);
  // qualification line-ups: [r1, r2, r3, b1, b2, b3]; 0 = empty; 7845 = not on the roster
  const Q = [
    [1690, 3075, 6230, 2231, 5654, 7039],
    [1574, 2096, 4338, 7112, 5951, 1937],
    [2630, 3316, 3339, 4320, 4590, 5135],
    [1943, 5987, 6738, 8175, 1690, 2231],
    [3075, 1574, 5654, 2096, 6230, 4338],
    [7039, 7112, 5951, 1937, 2630, 3316],
    [3339, 4320, 4590, 5135, 1943, 0],
    [5987, 7845, 6738, 8175, 3075, 1574],
    [5654, 2096, 6230, 4338, 7039, 7112],
    [5951, 1937, 0, 0, 0, 0],
  ];
  const SEASONS = [
    [2026, 'REBUILT', 'seasons/2026/field.png', true],
    [2025, 'REEFSCAPE', 'seasons/2025/field.png', false],
    [2024, 'CRESCENDO', 'seasons/2024/field.png', false],
  ];
  const EVENTS = [
    ['District #1 · Haifa', false, 'Mar 2–4'],
    ['District #2 · Be\'er Sheva', false, 'Mar 9–11'],
    ['District #3 · Tel Aviv', true, 'Mar 16–18'],
    ['District #4 · Jerusalem', false, 'Mar 23–25'],
    ['Israel Championship', false, 'Apr 6–8'],
  ];
  const ic = {
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    cal: '<path d="M3 9h18M8 3v4M16 3v4M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    clip: '<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"/>',
    paste: '<path d="M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 2h6v4H9zM9 12h6M9 16h4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ic[k]}</svg>`;
  const icons = () =>
    document.querySelectorAll('i[data-i]').forEach((el) => (el.outerHTML = svg(el.dataset.i)));
  const onRoster = (n) => ROSTER.some(([k]) => k === n);
  // A station cell as a select (today's control).
  const cellSel = (n) =>
    n === 0
      ? `<span class="cs empty">—${svg('chev')}</span>`
      : `<span class="cs ${onRoster(n) ? '' : 'bad'}"><b class="num">${n}</b>${svg('chev')}</span>`;
  // A station cell as typed text (variant D).
  const cellTyped = (n) =>
    n === 0
      ? `<span class="ct empty"></span>`
      : `<span class="ct ${onRoster(n) ? '' : 'bad'}"><b class="num">${n}</b><small>${name[n]}</small></span>`;
  const missing = Q.filter((r) => r.includes(0)).length;
  // Today's desktop-only gate, as a phone sees it.
  const gate = () => `<div class="gate"><div class="gi">${svg('monitor')}</div><b>This needs a computer</b>
    <p>Open season, event, roster and match management on a screen at least 1024 pixels wide. It is pre-competition work, done sitting down. Phones do the competition job — entering, browsing and reading — and this is not one of those.</p>
    <span class="btn">Back to scouting</span></div>`;
  const label = (i) => `Q${i + 1}`;
  return { ROSTER, OFF, name, Q, SEASONS, EVENTS, svg, icons, onRoster, cellSel, cellTyped, missing, gate, label };
})();
