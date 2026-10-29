// This runs independently of React so every role can see a safe update prompt.
(() => {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  const workers = navigator.serviceWorker;
  let hadController = Boolean(workers.controller);
  let pending = false;
  let banner;

  function showUpdate() {
    pending = true;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', showUpdate, { once: true });
      return;
    }
    if (banner) { banner.hidden = false; return; }

    const style = document.createElement('style');
    style.textContent = `
      .meety-update { position: fixed; z-index: 10000; top: max(12px, env(safe-area-inset-top));
        left: 50%; transform: translateX(-50%); width: min(94vw, 480px); box-sizing: border-box;
        padding: 15px; border: 1px solid #385476; border-radius: 16px; background: #12243b;
        color: #f2f7ff; box-shadow: 0 12px 32px #0008; font: 500 14px/1.8 Vazirmatn, sans-serif; }
      .meety-update[hidden] { display: none; }
      .meety-update p { margin: 0 0 10px; }
      .meety-update__actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .meety-update button { font: inherit; font-weight: 700; border: 0; border-radius: 10px;
        padding: 7px 14px; cursor: pointer; }
      .meety-update__apply { background: #86cfff; color: #102033; }
      .meety-update__later { background: #30465f; color: #fff; }
    `;
    document.head.append(style);
    banner = document.createElement('aside');
    banner.className = 'meety-update';
    banner.dir = 'rtl';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'به‌روزرسانی میتی');
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.textContent = 'نسخهٔ تازهٔ میتی آماده است. پیش از به‌روزرسانی، تغییرات و تمرین در حال ویرایش را ذخیره کن.';
    const actions = document.createElement('div');
    actions.className = 'meety-update__actions';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'meety-update__apply';
    apply.textContent = 'به‌روزرسانی';
    apply.addEventListener('click', () => {
      if (window.confirm('تغییرات ذخیره‌نشده ممکن است از دست بروند. پس از ذخیرهٔ آن‌ها، صفحه به‌روزرسانی شود؟')) {
        window.location.reload();
      }
    });
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'meety-update__later';
    later.textContent = 'بعداً';
    later.addEventListener('click', () => { banner.hidden = true; });
    actions.append(apply, later);
    banner.append(message, actions);
    document.body.append(banner);
  }

  workers.addEventListener('controllerchange', () => {
    if (hadController) showUpdate();
    hadController = true;
  });

  workers.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((registration) => {
    let lastCheck = Date.now(); // register() already checks the worker once.
    const check = (force = false) => {
      if (navigator.onLine === false || (!force && Date.now() - lastCheck < 30000)) return;
      lastCheck = Date.now();
      void registration.update().catch(() => { /* The installed app remains usable offline. */ });
    };
    window.addEventListener('online', () => check(true));
    window.addEventListener('focus', () => {
      if (pending && banner?.hidden) showUpdate();
      check();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (pending && banner?.hidden) showUpdate();
      check();
    });
    window.setInterval(() => check(true), 15 * 60 * 1000);
  }).catch(() => { /* No update prompt when registration is unavailable. */ });
})();
