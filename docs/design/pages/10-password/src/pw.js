// Shared builders for the Change password round (uses login.js icons via <i data-i>).
window.PW = (() => {
  const eye = '<span class="eye"><i data-i="eye"></i></span>';
  const fld = (label, val, o = {}) =>
    `<div class="fld"><label>${label}</label><div class="inp ${o.focus ? 'focus' : ''}">${val ? `<span class="dots">${val}</span>` : ''}${o.focus ? '<span class="caret" style="margin-left:0"></span>' : ''}${eye}</div>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
  const forcedHead = '<div class="lg-h1">Choose a new password</div><div class="lead2">An admin set a temporary password for this account. Choose your own to carry on.</div>';
  const volHead = '<div class="lg-h1">Change your password</div>';
  const form = (o = {}) =>
    fld('Current password', o.cur ?? '••••••••') +
    fld('New password', o.nw ?? '', { focus: o.focusNew, hint: o.rules ? '' : 'At least 8 characters.' }) +
    (o.rules || '') +
    fld('Confirm new password', o.cf ?? '') +
    (o.err ? `<div class="msg err" role="alert"><i data-i="alert"></i><span>${o.err}</span></div>` : '') +
    `<div class="sbtn ${o.busy ? 'busy' : ''}">${o.busy ? '<span class="spin"></span>Changing password…' : 'Change password'}</div>` +
    (o.back ? '<div class="ghost2">Back to scouting</div>' : '');
  return { fld, forcedHead, volHead, form };
})();
