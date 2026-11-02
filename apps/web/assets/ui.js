/* ============ 知树 KnowTree · UI 层（图标/toast/弹层/Tab） ============ */
(function () {
  'use strict';

  /* ---------- 内联 SVG 图标（1.7px 描边，圆角端点） ---------- */
  var ICONS = {
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m15.8 15.8 4.7 4.7"/>',
    tree: '<circle cx="12" cy="4.6" r="1.8"/><circle cx="5.6" cy="10.4" r="1.8"/><circle cx="18.4" cy="10.4" r="1.8"/><circle cx="8.8" cy="17" r="1.8"/><circle cx="15.2" cy="17" r="1.8"/><path d="M10.7 6 7 8.9M13.3 6l3.7 2.9M6.5 12l1.3 3.2M17.5 12l-1.3 3.2M12 6.4v0"/>',
    layers: '<path d="m12 3.5 8.5 4.7-8.5 4.7-8.5-4.7L12 3.5Z"/><path d="m3.5 13.1 8.5 4.7 8.5-4.7"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.4-3.2 4-4.6 7-4.6s5.6 1.4 7 4.6"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    star: '<path d="m12 4 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.7l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6L12 4Z"/>',
    starfill: '<path fill="currentColor" stroke="none" d="m12 4 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.7l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6L12 4Z"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M8 7l.6 12.1c.1 1 .9 1.9 1.9 1.9h3c1 0 1.8-.9 1.9-1.9L16 7"/>',
    move: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.4h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z"/><path d="M12 10.5v5.4M9.6 13.4l2.4 2.4 2.4-2.4"/>',
    link: '<path d="M10 14a4 4 0 0 0 6 .4l2.5-2.5a4 4 0 0 0-5.6-5.6L11.5 7.7"/><path d="M14 10a4 4 0 0 0-6-.4L5.5 12a4 4 0 0 0 5.6 5.6l1.4-1.4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
    shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z"/><path d="m9 11.5 2.2 2.2 3.8-4"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
    refresh: '<path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1M19.2 3.6v4h-4"/>',
    logout: '<path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7M10.5 12h9.5M16.5 8.5 20 12l-3.5 3.5"/>',
    chev: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    merge: '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="12" r="2.2"/><path d="M6 8.2v7.6M7.9 7.3 15.8 11M7.9 16.7l7.9-3.7"/>',
    book: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14.5H6.7A1.7 1.7 0 0 0 5 20.2V5.5Z"/><path d="M5 18.5V20a1.5 1.5 0 0 0 1.5 1.5H19"/>',
    restore: '<path d="M4.8 9a7.5 7.5 0 1 1 .4 6M4.8 4.5V9h4.5"/>'
  };

  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
      el.innerHTML = svg(el.getAttribute('data-ic'));
      el.removeAttribute('data-ic');
    });
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    var diff = Date.now() - Date.parse(iso);
    var m = Math.floor(diff / 6e4);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 30) return d + ' 天前';
    return Math.floor(d / 30) + ' 个月前';
  }

  function q(name) {
    var m = location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function go(url) { location.href = url; }
  function back(fallback) {
    if (history.length > 1 && document.referrer.indexOf(location.host) >= 0) history.back();
    else go(fallback || 'index.html');
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast';
    var msgEl = document.createElement('div');
    msgEl.className = 'toast__msg';
    msgEl.textContent = msg;
    el.appendChild(msgEl);
    if (opts.action) {
      var act = document.createElement('button');
      act.className = 'toast__act';
      act.textContent = opts.action;
      act.addEventListener('click', function () {
        hide();
        if (opts.onAction) opts.onAction();
      });
      el.appendChild(act);
    }
    wrap.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, opts.duration || 3400);
    function hide() {
      clearTimeout(toastTimer);
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
    }
  }

  function toastUndo(msg) {
    /* 后端无撤销栈，退化为普通提示 */
    toast(msg);
  }

  /* 跨页 toast：下一页加载后自动弹出；undo:true 时带「撤销」 */
  function flash(msg, opts) {
    try {
      sessionStorage.setItem('kt_flash', JSON.stringify({ msg: msg, undo: !!(opts && opts.undo) }));
    } catch (e) { /* ignore */ }
  }
  function consumeFlash() {
    try {
      var raw = sessionStorage.getItem('kt_flash');
      if (!raw) return;
      sessionStorage.removeItem('kt_flash');
      var f;
      try { f = JSON.parse(raw); } catch (e) { f = { msg: raw }; }
      setTimeout(function () {
        toast(f.msg);
      }, 260);
    } catch (e) { /* ignore */ }
  }

  /* ---------- 居中确认框 ---------- */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var bd = document.createElement('div');
      bd.className = 'backdrop';
      var dlg = document.createElement('div');
      dlg.className = 'dialog';
      dlg.setAttribute('role', 'dialog');
      dlg.innerHTML =
        '<div class="dialog__title"></div>' +
        (opts.desc ? '<div class="dialog__desc"></div>' : '') +
        '<div class="dialog__btns">' +
        '<button class="btn btn-ghost" data-x="0">取消</button>' +
        '<button class="btn btn-primary" data-x="1"></button>' +
        '</div>';
      dlg.querySelector('.dialog__title').textContent = opts.title || '确认操作';
      if (opts.desc) dlg.querySelector('.dialog__desc').textContent = opts.desc;
      dlg.querySelector('[data-x="1"]').textContent = opts.ok || '确认';
      document.body.appendChild(bd);
      document.body.appendChild(dlg);
      function done(v) {
        bd.classList.add('out');
        setTimeout(function () { bd.remove(); dlg.remove(); }, 160);
        resolve(v);
      }
      bd.addEventListener('click', function () { done(false); });
      dlg.querySelector('[data-x="0"]').addEventListener('click', function () { done(false); });
      dlg.querySelector('[data-x="1"]').addEventListener('click', function () { done(true); });
    });
  }

  /* ---------- 底部弹层 ---------- */
  function openSheet(title, buildBody) {
    var bd = document.createElement('div');
    bd.className = 'backdrop';
    var sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = '<div class="sheet__handle"></div>' +
      (title ? '<div class="h-sec mb12"></div>' : '') +
      '<div class="sheet__body"></div>';
    if (title) sheet.querySelector('.h-sec').textContent = title;
    document.body.appendChild(bd);
    document.body.appendChild(sheet);
    function close() {
      bd.classList.add('out');
      sheet.classList.add('out');
      setTimeout(function () { bd.remove(); sheet.remove(); }, 180);
    }
    bd.addEventListener('click', close);
    buildBody(sheet.querySelector('.sheet__body'), close);
    return close;
  }

  /* ---------- 节点选择器 ---------- */
  function nodePicker(currentId) {
    return new Promise(function (resolve) {
      openSheet('挂到哪个节点', function (body, close) {
        var rows = document.createElement('div');
        rows.className = 'rows';
        KT.NODES.forEach(function (n) {
          var b = document.createElement('button');
          b.className = 'row';
          b.innerHTML = '<span data-ic="tree"></span><span class="grow"></span>' +
            '<span class="val"></span>' +
            (n.id === currentId ? '<span class="nchip">当前</span>' : '<span data-ic="chev" class="chev"></span>');
          b.querySelector('.grow').textContent = n.name;
          b.querySelector('.val').textContent = KT.nodeCards(n.id).length + ' 条';
          b.addEventListener('click', function () { close(); resolve(n.id); });
          rows.appendChild(b);
        });
        body.appendChild(rows);
        hydrateIcons(body);
      });
      document.querySelector('.backdrop').addEventListener('click', function () { resolve(null); });
    });
  }

  /* ---------- Tab 栏 ---------- */
  function tabbar(active) {
    var host = document.querySelector('[data-tabbar]');
    if (!host) return;
    var tabs = [
      { id: 'tree', name: '知识树', href: 'index.html', icon: 'tree' },
      { id: 'lib', name: '知识库', href: 'library.html', icon: 'layers' },
      { id: 'me', name: '我的', href: 'me.html', icon: 'user' }
    ];
    var bar = document.createElement('nav');
    bar.className = 'tabbar';
    bar.setAttribute('aria-label', '主导航');
    tabs.forEach(function (t) {
      var a = document.createElement('a');
      a.className = 'tab' + (t.id === active ? ' on' : '');
      a.href = t.href;
      a.innerHTML = svg(t.icon) + '<span></span>';
      a.querySelector('span').textContent = t.name;
      bar.appendChild(a);
    });
    host.appendChild(bar);
  }

  /* ---------- 知识卡片（列表通用） ---------- */
  function cardHTML(c) {
    var meta = '';
    if (c.status === 'processing') {
      meta += '<span class="nchip">解析中</span>';
    } else if (c.status === 'pending') {
      meta += '<span class="nchip">待确认</span>';
    } else if (c.status === 'dup') {
      meta += '<span class="nchip">疑似重复</span>';
    } else {
      meta += '<span>' + esc(KT.nodeName(c.nodeId)) + '</span><span class="dot-sep"></span>';
    }
    meta += '<span>' + timeAgo(c.createdAt) + '</span>';
    if (c.starred) meta += '<span class="dot-sep"></span><span style="color:var(--gold)">已收藏</span>';
    var tags = c.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    return '<a class="card" href="detail.html?id=' + encodeURIComponent(c.id) + '">' +
      '<div class="card__title">' + esc(c.title) + '</div>' +
      '<div class="card__sum">' + esc(c.summary) + '</div>' +
      '<div class="card__meta">' + tags + '</div>' +
      '<div class="card__meta">' + meta + '</div>' +
      '</a>';
  }

  function emptyHTML(text, sub) {
    return '<div class="empty"><div class="t">' + esc(text) + '</div>' +
      (sub ? '<div>' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* ---------- 页面启动 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    hydrateIcons();
    tabbar(document.body.getAttribute('data-tab'));
    consumeFlash();
  });

  window.UI = {
    svg: svg, hydrateIcons: hydrateIcons,
    esc: esc, timeAgo: timeAgo, q: q, go: go, back: back,
    toast: toast, toastUndo: toastUndo, flash: flash,
    confirm: confirmDialog, openSheet: openSheet, nodePicker: nodePicker,
    cardHTML: cardHTML, emptyHTML: emptyHTML
  };
})();
