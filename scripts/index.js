(async function () {
  var statsEl = document.getElementById('stats');
  try {
    await KT.load();
  } catch (e) {
    statsEl.innerHTML = '加载失败 · <a href="login.html" style="color:var(--gold)">去登录 / 配置后端</a>';
    return;
  }

  /* 后端分类是动态的（含 parent_id），把分类按条目数从多到少铺到树的 7 个位置上 */
  var slots = Array.prototype.slice.call(document.querySelectorAll('.tnode'));
  var cats = KT.NODES.slice().sort(function (a, b) {
    return KT.countInNode(b.id) - KT.countInNode(a.id);
  });

  slots.forEach(function (g, i) {
    var cat = cats[i];
    if (!cat) { g.style.display = 'none'; return; }
    g.setAttribute('data-node', cat.id);
    g.setAttribute('aria-label', cat.name);
    var lbl = g.querySelector('.lbl');
    if (lbl) lbl.textContent = cat.name;
    var cnt = g.querySelector('.cnt');
    if (cnt) { cnt.textContent = KT.countInNode(cat.id); cnt.setAttribute('data-cnt', cat.id); }
    function open() { UI.go('node.html?id=' + encodeURIComponent(cat.id)); }
    g.addEventListener('click', open);
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  function render() {
    statsEl.textContent = KT.NODES.length + ' 个分类 · ' + KT.classified().length + ' 条知识';
    var box = KT.inbox();
    var n = box.pending.length + box.dups.length;
    var banner = document.getElementById('inboxBanner');
    if (n > 0) {
      banner.hidden = false;
      document.getElementById('inboxNum').textContent = n;
    } else {
      banner.hidden = true;
    }
    document.querySelectorAll('[data-cnt]').forEach(function (t) {
      t.textContent = KT.countInNode(t.getAttribute('data-cnt'));
    });
  }

  render();
})();
