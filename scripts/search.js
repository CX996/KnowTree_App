(async function () {
  var input = document.getElementById('q');
  var out = document.getElementById('out');
  var seq = 0;

  document.getElementById('cancel').addEventListener('click', function () { UI.back('index.html'); });

  try {
    await KT.load();
  } catch (e) {
    out.innerHTML = KT.errorHTML(e);
    return;
  }

  function fallback() {
    var near = KT.visible().slice(0, 3);
    return '<div class="t3 s13 mt20 mb12">没有命中，先看看最近收录的 3 条</div>' +
      near.map(UI.cardHTML).join('');
  }

  async function render() {
    var q = input.value.trim();
    var my = ++seq;
    if (!q) {
      out.innerHTML = '<div class="empty"><div class="t">搜点什么</div><div>试试「PPO」「探索」「认知负荷」</div></div>';
      return;
    }
    out.innerHTML = '<div class="t3 s13 mt20">搜索中…</div>';
    var r;
    try {
      r = await KT.search(q);
    } catch (e) {
      if (my === seq) out.innerHTML = KT.errorHTML(e);
      return;
    }
    if (my !== seq) return;

    var html = '';
    if (r.nodes.length) {
      html += '<div class="mt20 mb12 t3 s13">命中分类</div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
        r.nodes.map(function (n) {
          return '<a class="nchip" style="min-height:36px;padding:4px 14px;font-size:14px" href="node.html?id=' +
            encodeURIComponent(n.id) + '">' + UI.esc(n.name) + ' · ' + KT.countInNode(n.id) + ' 条</a>';
        }).join('') + '</div>';
    }
    if (r.cards.length) {
      html += '<div class="t3 s13 mt20 mb12">' + r.cards.length + ' 条结果' +
        (r.counts && r.counts.semantic ? '（语义 ' + r.counts.semantic + ' / 关键词 ' + (r.counts.keyword || 0) + '）' : '') + '</div>' +
        r.cards.map(UI.cardHTML).join('');
    }
    out.innerHTML = html || fallback();
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(render, 260);
  });
  render();
  setTimeout(function () { input.focus(); }, 60);
})();
