// Mock data + renderers for the Entry page variants. Every variant composes these.
window.E = (() => {
  const PHASES = [
    {
      key: 'auto',
      label: 'Autonomous',
      short: 'Auto',
      fields: [
        { type: 'toggle', label: 'Left the start zone', value: true },
        { type: 'counter', label: 'High goal', hint: 'Scored', value: 2 },
        { type: 'counter', label: 'Low goal', hint: 'Scored', value: 0 },
      ],
    },
    {
      key: 'teleop',
      label: 'Teleop',
      short: 'Teleop',
      fields: [
        { type: 'counter', label: 'High goal', hint: 'Scored', value: 7 },
        { type: 'counter', label: 'Low goal', hint: 'Scored', value: 4 },
        { type: 'counter', label: 'Missed shots', hint: 'Any goal', value: 3 },
        { type: 'toggle', label: 'Played defense', value: false },
      ],
    },
    {
      key: 'endgame',
      label: 'Endgame',
      short: 'Endgame',
      fields: [
        { type: 'select', label: 'Climb', options: ['None', 'Park', 'Shallow', 'Deep'], value: 'Deep' },
      ],
    },
    {
      key: 'post',
      label: 'Post-match',
      short: 'Notes',
      fields: [
        {
          type: 'text',
          label: 'Notes',
          value: 'Fast cycles. Struggled with the low goal after the Q30 repair.',
        },
      ],
    },
  ];
  const STATUS = [
    { k: 'played', label: 'Played' },
    { k: 'broke', label: 'Broke down' },
    { k: 'disabled', label: 'Disabled' },
    { k: 'noshow', label: 'No show' },
  ];
  const minus = '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';
  const plus = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  const chev = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
  const check = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';

  function status(style, on = 'played') {
    return `<div class="status status-${style}" role="radiogroup">${STATUS.map(
      (s) => `<span class="st${s.k === on ? ' on' : ''}">${s.k === on && style !== 'seg' ? `<i>${check}</i>` : ''}${s.label}</span>`,
    ).join('')}</div>`;
  }

  function counter(f, style) {
    if (style === 'stack')
      return `<div class="fld"><div class="flbl">${f.label}</div><div class="ctr-stack"><b>${minus}</b><span class="num">${f.value}</span><b class="p">${plus}</b></div></div>`;
    if (style === 'row')
      return `<div class="fld fld-row"><div class="flbl">${f.label}<small>${f.hint || ''}</small></div><div class="ctr-row"><b>${minus}</b><span class="num">${f.value}</span><b class="p">${plus}</b></div></div>`;
    // tile
    return `<div class="tile"><div class="tl">${f.label}</div><div class="tv num">${f.value}</div><div class="tplus">${plus}<span>Tap to add</span></div><b class="tminus">${minus}</b></div>`;
  }
  function toggle(f, style) {
    if (style === 'yn')
      return `<div class="fld fld-row"><div class="flbl">${f.label}</div><div class="yn"><span class="${f.value ? 'on' : ''}">Yes</span><span class="${f.value ? '' : 'on'}">No</span></div></div>`;
    return `<div class="fld fld-row"><div class="flbl">${f.label}</div><span class="sw${f.value ? ' on' : ''}"></span></div>`;
  }
  function select(f) {
    return `<div class="fld"><div class="flbl">${f.label}</div><div class="opts">${f.options
      .map((o) => `<span class="${o === f.value ? 'on' : ''}">${o}</span>`)
      .join('')}</div></div>`;
  }
  function text(f) {
    return `<div class="fld"><div class="flbl">${f.label}</div><div class="ta">${f.value}</div></div>`;
  }
  function field(f, o = {}) {
    if (f.type === 'counter') return counter(f, o.counter || 'stack');
    if (f.type === 'toggle') return toggle(f, o.toggle || 'switch');
    if (f.type === 'select') return select(f);
    return text(f);
  }
  function phase(p, o = {}) {
    return p.fields.map((f) => field(f, o)).join('');
  }
  function summaryRows(compact) {
    const rows = [];
    PHASES.forEach((p) => {
      rows.push(`<div class="sr-h">${p.label}</div>`);
      p.fields.forEach((f) => {
        let v = f.value;
        if (f.type === 'toggle') v = f.value ? 'Yes' : 'No';
        if (f.type === 'text') v = compact ? '1 note' : f.value;
        rows.push(`<div class="sr"><span>${f.label}</span><b class="${f.type === 'counter' ? 'num' : ''}">${v}</b></div>`);
      });
    });
    return rows.join('');
  }
  return { PHASES, STATUS, status, field, phase, summaryRows, chev, check, plus, minus };
})();
