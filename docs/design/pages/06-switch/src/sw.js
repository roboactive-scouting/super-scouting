// Mock data and builders for the Switch scouter round. Colours come only from theme.css.
window.SW = (() => {
  // [full name, username, role, scouted here today]
  const U = [
    ['Noa Levi', 'noa.levi', 'Scout lead', true],
    ['Amit Ben-David', 'amit.bd', 'Scout', true],
    ['Yael Shapira', 'yael.s', 'Scout', true],
    ['Omer Katz', 'omer.k', 'Scout', false],
    ['Tamar Mizrahi', 'tamar.m', 'Admin', false],
    ['Itai Cohen', 'itai.c', 'Scout', false],
    ['Maya Friedman', 'maya.f', 'Scout', false],
    ['Lior Avraham', 'lior.a', 'Scout', false],
    ['Shira Peretz', 'shira.p', 'Scout', false],
    ['Daniel Rosen', 'daniel.r', 'Scout lead', false],
  ];
  const users = () => U.map(([name, user, role, today]) => ({
    name, user, role, today, ini: name.split(' ').map((w) => w[0]).join(''),
  }));
  const ic = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    swap: '<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    off: '<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ic[k]}</svg>`;
  const icons = () =>
    document.querySelectorAll('i[data-i]').forEach((el) => (el.outerHTML = svg(el.dataset.i)));
  return { users, svg, icons };
})();
