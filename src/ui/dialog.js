// Small modal dialogs that return promises.

function shell(title, bodyHtml, buttons) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
    <h2>${title}</h2>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-actions">${buttons}</div>
  </div>`;
  document.body.appendChild(back);
  return back;
}

export function promptDialog({ title, message = '', placeholder = '', value = '', okLabel = 'OK', validate = null }) {
  return new Promise((resolve) => {
    const back = shell(title,
      `<p>${message}</p><input type="text" class="input" placeholder="${placeholder}" value="${value}"><div class="error" hidden></div>`,
      `<button class="btn ghost" data-act="cancel">Cancel</button><button class="btn primary" data-act="ok">${okLabel}</button>`);
    const input = back.querySelector('input');
    const err = back.querySelector('.error');
    const close = (v) => { back.remove(); resolve(v); };
    const ok = () => {
      const v = input.value.trim();
      const msg = validate ? validate(v) : null;
      if (msg) { err.textContent = msg; err.hidden = false; input.focus(); return; }
      close(v);
    };
    back.addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (act === 'ok') ok();
      else if (act === 'cancel' || e.target === back) close(null);
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') ok();
      if (e.key === 'Escape') close(null);
    });
    setTimeout(() => input.focus(), 0);
  });
}

export function confirmDialog({ title, message, okLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const back = shell(title, `<p>${message}</p>`,
      `<button class="btn ghost" data-act="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${okLabel}</button>`);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } if (e.key === 'Enter') { e.stopPropagation(); close(true); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (act === 'ok') close(true);
      else if (act === 'cancel' || e.target === back) close(false);
    });
  });
}

export function infoDialog({ title, html }) {
  const back = shell(title, html, `<button class="btn primary" data-act="ok">Close</button>`);
  back.querySelector('.modal').classList.add('wide');
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('click', (e) => { if (e.target.dataset.act === 'ok' || e.target === back) close(); });
}
