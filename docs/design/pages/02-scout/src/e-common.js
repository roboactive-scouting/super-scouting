// Builders for Scout variant E.
window.S = (() => {
  const LINE = {
    red: [
      ['1690', 'Orbit'],
      ['3075', 'Ha-Dream Team'],
      ['6230', 'Team Koi'],
    ],
    blue: [
      ['2231', 'OnyxTronix'],
      ['5654', 'Phoenix'],
      ['7039', 'Ultimate'],
    ],
  };
  const pin = '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  const chev = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
  // opts: { mine: 'blue-2', on: 'blue-2', done: { 'red-2': 'edit', 'blue-3': 'locked' } }
  function station(side, i, o) {
    const id = `${side}-${i + 1}`;
    const [tn, nm] = LINE[side][i];
    const done = o.done && o.done[id];
    const cls = ['station', side === 'red' ? 'r' : 'b'];
    if (done) cls.push('done');
    if (o.on === id) cls.push('on');
    if (o.mine === id) cls.push('mine');
    const label = `${side.toUpperCase()} ${i + 1}`;
    let sub = nm;
    if (done === 'edit') sub = `Scouted · edit until 11:52`;
    if (done === 'locked') sub = 'Scouted · locked';
    const badge =
      o.mine === id
        ? '<span class="you">YOUR STATION</span>'
        : done === 'edit'
          ? '<span class="badge">✓</span>'
          : done === 'locked'
            ? '<span class="badge">🔒</span>'
            : '';
    return `<div class="${cls.join(' ')}"><small>${label}</small><span class="tn">${tn}</span><span class="nm">${sub}</span>${badge}</div>`;
  }
  function lineup(o) {
    const col = (side) =>
      `<div class="stack"><div class="ch" style="color:var(--alliance-${side})">${side === 'red' ? 'Red' : 'Blue'}</div>${[0, 1, 2]
        .map((i) => station(side, i, o))
        .join('')}</div>`;
    return `<div class="cols">${col('red')}${col('blue')}</div>`;
  }
  function stationBar(name = 'Blue 2', side = 'b') {
    return `<div class="stbar"><span class="lab">Your station</span><span class="stpill ${side}">${pin}${name}</span><span class="sp"></span><span class="link">Change</span></div>`;
  }
  function matchInputs(num, focus) {
    return `<div class="mnum"><div><div class="lbl">Match type</div><div class="typesel">Qualification${chev}</div></div>
      <div><div class="lbl">Match number</div><div class="numfield${focus ? ' focus' : ''}"><span class="pre">Q</span><span class="v">${num}</span>${focus ? '<span class="caret"></span>' : ''}</div></div></div>`;
  }
  return { lineup, stationBar, matchInputs, pin };
})();
