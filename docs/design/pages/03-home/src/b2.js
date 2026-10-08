// Fills the Home B2 mockups (desktop and phone).
window.B2 = (() => {
  const T = [
    [1690, 'Orbit', 58.4, [44, 47, 52, 55, 58]],
    [1574, 'MisCar', 54.9, [49, 50, 53, 52, 55]],
    [2096, 'RobActive', 51.2, [38, 42, 47, 49, 51]],
    [3339, 'BumbleB', 47.6, [45, 46, 44, 48, 48]],
    [5990, 'TRIGON', 45.1, [36, 40, 41, 44, 45]],
    [1937, 'Elysium', 42.3, [40, 39, 43, 41, 42]],
  ];
  function spark(v, w = 60, h = 20) {
    const min = Math.min(...v);
    const max = Math.max(...v);
    const pts = v.map((x, i) => [(i / (v.length - 1)) * (w - 4) + 2, h - 3 - ((x - min) / (max - min || 1)) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const l = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${d}"/><circle cx="${l[0]}" cy="${l[1]}" r="2.4"/></svg>`;
  }
  const cov = Array.from({ length: 72 }, (_, i) => {
    const n = i + 1;
    if (n > 38) return '';
    return [7, 19, 26, 31].includes(n) ? 'gap' : 'full';
  });
  function fill(n, cols) {
    const set = (s, h) => document.querySelectorAll(s).forEach((e) => (e.innerHTML = h));
    set('.i-scout', H.ic.scout);
    document.querySelectorAll('.pin').forEach((e) => (e.innerHTML = S.pin + e.innerHTML));
    document.querySelectorAll('.cov').forEach((e) => {
      const c = Number(e.dataset.cols || 24);
      e.style.gridTemplateColumns = `repeat(${c},1fr)`;
      e.innerHTML = cov.slice(0, Number(e.dataset.count || 72)).map((x) => `<i class="${x}"></i>`).join('');
    });
    document.querySelectorAll('.topteams').forEach((e) => {
      const k = Number(e.dataset.n || n);
      e.innerHTML = T.slice(0, k)
        .map(
          (t, i) =>
            `<div class="toprow${t[0] === 2096 ? ' mine' : ''}"><span class="rk">${i + 1}</span><span><span class="num">${t[0]}</span><span class="nm2">${t[1]}</span></span>${spark(t[3])}<span class="v">${t[2]}</span></div>`,
        )
        .join('');
    });
  }
  return { fill };
})();
