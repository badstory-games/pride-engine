/**
 * Стилизованные модальные окна вместо нативных prompt/confirm/alert.
 *
 *   await Modal.alert({ title, message, okText });
 *   const ok = await Modal.confirm({ title, message, okText, danger: true });
 *   const text = await Modal.prompt({ title, message, defaultValue });
 *
 * Поведение:
 *   - Esc, клик по фону, кнопка «Отмена» → отмена (null / false).
 *   - Enter → подтверждение (для prompt — то, что введено).
 *   - Фокус автоматически ставится на input (prompt) или кнопку OK.
 */

let currentModal = null;

export const Modal = {
  alert(opts)   { return _open({ ...(opts || {}), kind: 'alert' }); },
  confirm(opts) { return _open({ ...(opts || {}), kind: 'confirm' }); },
  prompt(opts)  { return _open({ ...(opts || {}), kind: 'prompt' }); },
};

function _open({
  kind,
  title = '',
  message = '',
  defaultValue = '',
  placeholder = '',
  okText,
  cancelText = 'Отмена',
  danger = false,
}) {
  // Закрываем предыдущий, если пользователь как-то открыл новый поверх.
  if (currentModal) currentModal.cancel();

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'modal-box';

    // ---------- Header ----------
    if (title) {
      const header = document.createElement('div');
      header.className = 'modal-box-header';
      const titleEl = document.createElement('h3');
      titleEl.textContent = title;
      header.appendChild(titleEl);
      box.appendChild(header);
    }

    // ---------- Body ----------
    const body = document.createElement('div');
    body.className = 'modal-box-body';

    if (message) {
      const msg = document.createElement('div');
      msg.className = 'modal-box-message';
      msg.textContent = message;
      body.appendChild(msg);
    }

    let inputEl = null;
    if (kind === 'prompt') {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'modal-box-input';
      inputEl.value = defaultValue;
      if (placeholder) inputEl.placeholder = placeholder;
      inputEl.spellcheck = false;
      inputEl.autocomplete = 'off';
      body.appendChild(inputEl);
    }
    box.appendChild(body);

    // ---------- Footer ----------
    const footer = document.createElement('div');
    footer.className = 'modal-box-footer';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'modal-btn modal-btn-secondary';
    btnCancel.textContent = cancelText;

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = 'modal-btn ' + (danger ? 'modal-btn-danger' : 'modal-btn-primary');
    btnOk.textContent = okText || (kind === 'alert' ? 'ОК' : 'Продолжить');

    if (kind === 'alert') {
      footer.appendChild(btnOk);
    } else {
      footer.appendChild(btnCancel);
      footer.appendChild(btnOk);
    }
    box.appendChild(footer);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    // ---------- Logic ----------
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      if (currentModal && currentModal.el === backdrop) currentModal = null;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(result);
    };

    const cancel = () => close(kind === 'confirm' ? false : null);
    const accept = () => {
      if (kind === 'prompt')      close(inputEl.value);
      else if (kind === 'confirm') close(true);
      else                         close(undefined);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        accept();
        return;
      }
      if (e.key === 'Tab') return;   // навигация внутри модалки — пропускаем
      // Всё остальное не должно долетать до редактора.
      // (Не preventDefault — иначе Ctrl+C/V в input сломаются.)
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);

    btnOk.addEventListener('click', accept);
    btnCancel.addEventListener('click', cancel);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) cancel();
    });

    // Фокус + выделение
    requestAnimationFrame(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      } else {
        btnOk.focus();
      }
    });

    currentModal = { el: backdrop, cancel, accept };
  });
}