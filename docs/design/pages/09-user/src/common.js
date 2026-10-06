// Shared builders for the User detail round (uses U from 08-users/src/users.js).
window.UD = (() => {
  const back = '<span class="back"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>All users</span>';
  const head = (o = {}) => `<div class="who2"><span class="av4 ${o.self ? 'on' : ''}" style="${o.self ? 'background:var(--accent);color:#fff' : ''}">${o.ini || 'YS'}</span><div>
    <h1>${o.name || 'Yael Shapira'} ${o.self ? '<span class="you">This is you</span>' : ''}</h1>
    <div class="meta"><span class="mono">${o.user || 'yael.s'}</span> · created 02/09/2026${o.extra || ''}</div></div></div>`;
  const roles = (on = 'scouter', busy) => `<div class="rolepick ${busy ? 'lock' : ''}">${[
    ['scouter', 'Scouter', 'Enters match data'],
    ['lead', 'Scout lead', 'Fixes any entry, pick list'],
    ['admin', 'Admin', 'Everything, incl. users'],
  ].map(([k, l, d]) => `<span class="${k === busy ? 'busy' : k === on ? 'on' : ''}">${l}<small>${k === busy ? 'Saving…' : d}</small></span>`).join('')}</div>`;
  const roleSec = (o = {}) => `<div class="sec"><h2>Role</h2><div class="d">${o.self ? 'This is your own account. Another role takes away your access to this page.' : 'Saves as soon as you pick. It applies from their next request.'}</div><div style="margin-top:12px">${roles(o.on, o.busy)}</div>${o.saved ? `<div class="saved">${U.svg('check')}Saved. Yael Shapira is now a lead. It applies from their next request.</div>` : ''}</div>`;
  const renameSec = () => `<div class="sec"><h2>Rename</h2><div class="row"><div class="f"><label>Username</label><div class="in mono">yael.s</div></div><div class="f"><label>Full name</label><div class="in">Yael Shapira</div></div><span class="btn">Save name</span></div>
    <div class="d" style="margin-top:8px">What they sign in with. A device that is offline under the old name keeps using it to sign in until its next sync.</div></div>`;
  const resetSec = () => `<div class="sec"><h2>Reset password</h2><div class="d">There is no self-service reset: you set a new one and hand it over. It does not sign them out of devices already signed in — to cut access, disable the account.</div>
    <div class="row"><div class="f"><label>New password</label><div class="in pw ph">At least 8 characters</div></div><span class="genbtn">${U.svg('dice')}Generate</span><span class="btn primary">Reset password</span></div>
    <div style="margin-top:10px"><span class="ucheck"><span class="cb on"></span>Ask them to change it at next sign-in</span></div></div>`;
  const disableSec = (cls) => `<div class="sec danger"><h2>Disable account</h2><div class="d">They can no longer sign in or sync. A device that is offline keeps them signed in until its next sync.</div><div style="margin-top:12px"><span class="btn ${cls}">${U.svg('ban')}Disable account</span></div></div>`;
  const confirm = (cls, self) => `<div class="scrim4"></div><div class="dlg cdlg" style="top:150px;width:480px">
    <div class="hd"><b>Disable this account?</b>${U.svg('x')}</div>
    <div class="obj">${self ? 'Noa Levi' : 'Yael Shapira'}</div>
    <p>Disabling keeps everything they scouted, with their name on it. It is not a delete.</p>
    ${self ? '<p style="font-weight:650;color:var(--ink)">This is your own account. You will be signed out on your next request.</p>' : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px"><span class="btn" style="box-shadow:0 0 0 3px var(--accent-tint);border-color:var(--accent)">Cancel</span><span class="btn ${cls}">Disable ${self ? 'Noa Levi' : 'Yael Shapira'}</span></div></div>`;
  return { back, head, roles, roleSec, renameSec, resetSec, disableSec, confirm };
})();
