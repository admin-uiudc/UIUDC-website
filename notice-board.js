/* =====================================================================
   UIUDC NOTICE BOARD  (central file: edit notices HERE, once)
   ---------------------------------------------------------------------
   Every page that contains
        <div data-uiudc-notice-board></div>
        <script src="notice-board.js"></script>
   shows the same board. Change the list below and ALL pages update.

   TO ADD A NOTICE : copy one line, paste it into the list, edit it.
                     Order does not matter; newest date shows first.
        title : the notice title
        date  : YYYY-MM-DD  (e.g. "2026-10-22")
        href  : link to the notice page / PDF / image ("#" for none)
   TO REMOVE       : delete its line.

   Optional settings on the <div> (all optional):
        data-max-height="420"   height of the scroll box in px
        data-limit="5"          show only the newest N notices
        data-title="Notice Board"
        data-subtitle="Latest announcements..."
        data-heading="false"    hide the title/subtitle block
   If a page sits in a sub-folder, use src="../notice-board.js".
   ===================================================================== */
/*
var UIUDC_NOTICES = [
  { title: "Sample Notice Title One",   date: "2026-10-20", href: "#" },
  { title: "Sample Notice Title Two",   date: "2026-10-12", href: "#" },
  { title: "Sample Notice Title Three", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Four", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Five", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Six", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Seven", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Eight", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Nine", date: "2026-09-30", href: "#" },
  { title: "Sample Notice Title Ten", date: "2026-09-30", href: "#" },
];

(function () {
  var css = [
    '.unb{padding:72px 0;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink,#1f2937);line-height:1.6;box-sizing:border-box}',
    '.unb *{box-sizing:border-box}',
    '.unb-wrap{max-width:1200px;margin:0 auto;padding:0 24px}',
    '.unb-head{margin:0 0 28px}',
    '.unb-bar{display:block;width:48px;height:4px;border-radius:2px;background:var(--orange,#ff7a00);margin-bottom:16px}',
    '.unb-head h2{font-size:clamp(28px,3.6vw,40px);line-height:1.15;font-weight:500;margin:0 0 10px;letter-spacing:-.01em}',
    '.unb-head p{color:var(--muted,#6b7280);margin:0;font-size:16px;max-width:620px}',
    '.unb-box{max-height:var(--unb-h,420px);overflow-y:auto;overscroll-behavior:contain;background:#faf7f3;border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:14px;scrollbar-width:thin;scrollbar-color:var(--orange,#ff7a00) transparent}',
    '.unb-box:focus-visible{outline:2px solid var(--orange,#ff7a00);outline-offset:3px}',
    '.unb-box::-webkit-scrollbar{width:8px}',
    '.unb-box::-webkit-scrollbar-thumb{background:var(--orange,#ff7a00);border-radius:99px}',
    '.unb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}',
    '.unb-item{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;background:#fff;border:1px solid var(--line,#e5e7eb);border-left:4px solid var(--orange,#ff7a00);border-radius:10px;color:inherit;text-decoration:none;transition:box-shadow .2s,transform .2s}',
    '.unb-item:hover{box-shadow:0 6px 18px rgba(0,0,0,.08);transform:translateX(2px)}',
    '.unb-item:focus-visible{outline:2px solid var(--orange,#ff7a00);outline-offset:2px}',
    '.unb-t{font-weight:600;font-size:16px;line-height:1.35}',
    '.unb-d{flex:none;font-size:13px;font-weight:500;color:var(--orange-ink,#a14400);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}',
    '.unb-empty{padding:24px;text-align:center;color:var(--muted,#6b7280);font-size:14px}',
    '@media(max-width:600px){.unb{padding:52px 0}.unb-item{flex-direction:column;align-items:flex-start;gap:4px}}'
  ].join('\n');

  function fmt(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return iso || '';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function render(host) {
    var d = host.dataset;
    var items = (window.UIUDC_NOTICES || []).slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });
    var limit = parseInt(d.limit, 10);
    if (limit > 0) items = items.slice(0, limit);

    var sec = el('section', 'unb');
    sec.setAttribute('aria-label', d.title || 'Notice Board');
    var wrap = el('div', 'unb-wrap');
    sec.appendChild(wrap);

    if (d.heading !== 'false') {
      var head = el('div', 'unb-head');
      head.appendChild(el('span', 'unb-bar'));
      head.appendChild(el('h2', null, d.title || 'Notice Board'));
      head.appendChild(el('p', null, d.subtitle || 'Latest announcements and official notices from UIU Debate Club.'));
      wrap.appendChild(head);
    }

    var box = el('div', 'unb-box');
    box.tabIndex = 0;
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Notices (scrollable)');
    if (parseInt(d.maxHeight, 10) > 0) box.style.setProperty('--unb-h', parseInt(d.maxHeight, 10) + 'px');

    if (!items.length) {
      box.appendChild(el('div', 'unb-empty', 'No notices at the moment.'));
    } else {
      var ul = el('ul', 'unb-list');
      items.forEach(function (n) {
        var li = el('li');
        var a = el('a', 'unb-item');
        a.href = n.href || '#';
        a.appendChild(el('span', 'unb-t', n.title));
        a.appendChild(el('span', 'unb-d', fmt(n.date)));
        li.appendChild(a); ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    wrap.appendChild(box);
    host.replaceChildren(sec);
  }
  function init() {
    if (!document.getElementById('unb-css')) {
      var s = document.createElement('style'); s.id = 'unb-css'; s.textContent = css;
      document.head.appendChild(s);
    }
    document.querySelectorAll('[data-uiudc-notice-board]').forEach(render);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
*/