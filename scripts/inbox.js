(async function () {
  var content = document.getElementById('content');
  var ctaBar = document.getElementById('ctaBar');

  document.getElementById('back').addEventListener('click', function () { UI.back('index.html'); });

  content.innerHTML = UI.emptyHTML('加载中…', '正在取待确认条目');
  try {
    await KT.load();
  } catch (e) {
    content.innerHTML = KT.errorHTML(e);
    ctaBar.hidden = true;
    return;
  }

  function processingCard(c) {
    return '<div class="card" data-id="' + c.id + '" data-kind="pending">' +
      '<div class="card__title">' + UI.esc(c.title) + '</div>' +
      '<div class="card__sum">' + UI.esc(c.summary) + '</div>' +
      '<div class="card__meta">' +
        '<span class="nchip">解析中</span>' +
        '<span>后台任务正在归类，稍后刷新</span>' +
      '</div>' +
      '<div class="mt12" style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="mini-btn" data-act="view">先看原文</button>' +
      '</div>' +
    '</div>';
  }

  function pendingCard(c) {
    if (c.status === 'processing') return processingCard(c);
    var conf = (typeof c.confidence === 'number') ? c.confidence.toFixed(2) : '—';
    return '<div class="card" data-id="' + c.id + '" data-kind="pending">' +
      '<div class="card__title">' + UI.esc(c.title) + '</div>' +
      '<div class="card__sum">' + UI.esc(c.summary) + '</div>' +
      '<div class="card__meta">' +
        '<span class="nchip">AI 建议 · ' + UI.esc(KT.nodeName(c.suggestedNode)) + '</span>' +
        '<span>置信度 ' + conf + '</span>' +
      '</div>' +
      '<div class="mt12" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (c.suggestedNode ? '<button class="mini-btn mini-btn--gold" data-act="accept">就这样</button>' : '') +
        '<button class="mini-btn" data-act="move">选分类</button>' +
        '<button class="mini-btn" data-act="view">先看原文</button>' +
      '</div>' +
    '</div>';
  }

  function dupCard(c) {
    var target = c.dupOf ? KT.byId(c.dupOf) : null;
    var tname = target ? '《' + target.title + '》' : '已有条目';
    return '<div class="card" data-id="' + c.id + '" data-kind="dup">' +
      '<div class="card__title">' + UI.esc(c.title) + '</div>' +
      '<div class="card__sum">' + UI.esc(c.summary) + '</div>' +
      '<div class="card__meta">' +
        '<span class="nchip">疑似重复</span>' +
        '<span>与' + UI.esc(tname) + '相似度 ' + (typeof c.sim === 'number' ? c.sim.toFixed(2) : '—') + '</span>' +
      '</div>' +
      '<div class="mt12" style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="mini-btn mini-btn--gold" data-act="merge">合并</button>' +
        '<button class="mini-btn" data-act="keep">保留两条</button>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var box = KT.inbox();
    var total = box.pending.length + box.dups.length;
    if (!total) {
      content.innerHTML = UI.emptyHTML('收件箱空了', '所有知识都已归位，回到知识树看看');
      ctaBar.hidden = true;
      return;
    }
    ctaBar.hidden = false;
    var html = '';
    if (box.pending.length) {
      html += '<div class="h-sec mt24 mb12">待归类 · ' + box.pending.length + '</div>' +
        box.pending.map(pendingCard).join('');
    }
    if (box.dups.length) {
      html += '<div class="h-sec mt24 mb12">疑似重复 · ' + box.dups.length + '</div>' +
        box.dups.map(dupCard).join('');
    }
    content.innerHTML = html;
  }

  content.addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var cardEl = btn.closest('.card');
    var id = cardEl.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    var c = KT.byId(id);
    if (!c) return;

    if (act === 'accept') {
      var name = KT.nodeName(c.suggestedNode);
      btn.disabled = true;
      try {
        await KT.assign(id, c.suggestedNode);
        render();
        UI.toast('已归类到「' + name + '」');
      } catch (err) {
        btn.disabled = false;
        UI.toast(err.message);
      }
    } else if (act === 'move') {
      UI.nodePicker(c.suggestedNode || null).then(async function (nodeId) {
        if (!nodeId) return;
        try {
          await KT.assign(id, nodeId);
          render();
          UI.toast('已归类到「' + KT.nodeName(nodeId) + '」');
        } catch (err) {
          UI.toast(err.message);
        }
      });
    } else if (act === 'view') {
      UI.go('detail.html?id=' + encodeURIComponent(id));
    } else if (act === 'merge') {
      var target = c.dupOf ? KT.byId(c.dupOf) : null;
      btn.disabled = true;
      try {
        await KT.mergeDup(id);
        render();
        UI.toast('已合并到' + (target ? '《' + target.title + '》' : '原条目'));
      } catch (err) {
        btn.disabled = false;
        UI.toast(err.message);
      }
    } else if (act === 'keep') {
      await KT.keepDup(id);
      render();
      UI.toast('已保留两条');
    }
  });

  document.getElementById('processAll').addEventListener('click', async function () {
    var box = KT.inbox();
    var total = box.pending.length + box.dups.length;
    if (!total) { UI.toast('没有待处理的条目'); return; }
    var btn = this;
    btn.disabled = true;
    try {
      var n = await KT.processAllInbox();
      await KT.load();
      render();
      UI.toast('已按建议归类 ' + n + ' 条');
    } catch (err) {
      UI.toast(err.message);
    }
    btn.disabled = false;
  });

  render();
})();
