(async function () {
  var id = UI.q('id');
  var main = document.getElementById('main');
  var actionbar = document.getElementById('actionbar');

  document.getElementById('back').addEventListener('click', function () { UI.back('library.html'); });

  main.innerHTML = UI.emptyHTML('加载中…', '正在取这条知识');
  try {
    await KT.load();
    await KT.loadDetail(id);
  } catch (e) {
    main.innerHTML = KT.errorHTML(e);
    actionbar.hidden = true;
    return;
  }

  function card() { return KT.byId(id); }

  function render() {
    var c = card();
    if (!c || c.deleted) {
      main.innerHTML = UI.emptyHTML('这条知识不存在或已删除', '去知识库看看其他的');
      actionbar.hidden = true;
      return;
    }
    actionbar.hidden = false;

    var html = '';
    if (c.nodeId) {
      html += '<a class="t3 s13" href="node.html?id=' + encodeURIComponent(c.nodeId) + '">知识树 / ' + UI.esc(KT.nodeName(c.nodeId)) + '</a>';
    } else {
      html += '<span class="t3 s13">未归类</span>';
    }
    html += '<h1 class="h-big mt8">' + UI.esc(c.title) + '</h1>';
    html += '<div class="t3 s12 mt8">' + UI.esc(c.source) + ' · ' + UI.timeAgo(c.createdAt) + '</div>';

    if (c.status === 'pending' || c.status === 'processing') {
      html += '<a class="banner mt16" href="inbox.html"><span data-ic="bell"></span>' +
        '<span class="grow">' + (c.status === 'processing'
          ? '解析中，稍后自动归类'
          : 'AI 建议挂到「' + UI.esc(KT.nodeName(c.suggestedNode)) + '」 · 置信度 ' +
            (typeof c.confidence === 'number' ? c.confidence.toFixed(2) : '—')) + '</span>' +
        '<span data-ic="chev" style="color:var(--gold)"></span></a>';
    } else if (c.status === 'dup') {
      var t = c.dupOf ? KT.byId(c.dupOf) : null;
      html += '<a class="banner mt16" href="inbox.html"><span data-ic="merge"></span>' +
        '<span class="grow">疑似与' + (t ? '《' + UI.esc(t.title) + '》' : '已有条目') + '重复 · 相似度 ' +
        (typeof c.sim === 'number' ? c.sim.toFixed(2) : '—') + '</span>' +
        '<span data-ic="chev" style="color:var(--gold)"></span></a>';
    }

    if (c.summary) html += '<div class="quote">' + UI.esc(c.summary) + '</div>';
    html += '<div class="prose">' + c.body.map(function (p) { return '<p>' + UI.esc(p) + '</p>'; }).join('') + '</div>';
    if (c.tags && c.tags.length) {
      html += '<div class="card__meta mt8">' + c.tags.map(function (t) { return '<span class="tag">' + UI.esc(t) + '</span>'; }).join('') + '</div>';
    }

    var rels = (c.links || [])
      .map(function (l) { return { link: l, target: KT.byId(l.to) }; })
      .filter(function (x) { return x.target && !x.target.deleted; });
    if (rels.length) {
      html += '<div class="mt24"><div class="h-sec mb12">相关</div><div class="rows">' +
        rels.map(function (x) {
          return '<button class="rel-row" data-to="' + x.target.id + '">' +
            '<span data-ic="link" style="color:var(--text3);flex:none;width:18px;height:18px"></span>' +
            '<span class="t">' + UI.esc(x.target.title) + '</span>' +
            '<span class="sim">相似度 ' + Number(x.link.sim || 0).toFixed(2) + '</span>' +
          '</button>';
        }).join('') + '</div></div>';
    }

    main.innerHTML = html;
    UI.hydrateIcons(main);

    main.querySelectorAll('.rel-row').forEach(function (r) {
      r.addEventListener('click', function () {
        UI.go('detail.html?id=' + encodeURIComponent(r.getAttribute('data-to')));
      });
    });
  }

  document.getElementById('starBtn').addEventListener('click', function () {
    UI.toast('后端暂未提供收藏字段');
  });

  document.getElementById('moveBtn').addEventListener('click', function () {
    var c = card();
    if (!c) return;
    UI.nodePicker(c.nodeId || c.suggestedNode || null).then(async function (nodeId) {
      if (!nodeId) return;
      try {
        await KT.assign(id, nodeId);
        render();
        UI.toast('已挂到「' + KT.nodeName(nodeId) + '」');
      } catch (err) {
        UI.toast(err.message);
      }
    });
  });

  document.getElementById('delBtn').addEventListener('click', function () {
    UI.confirm({
      title: '删除这条知识？',
      desc: '后端会把它软删除，之后不再出现在知识库里（本期无恢复接口）。',
      ok: '删除'
    }).then(async function (ok) {
      if (!ok) return;
      try {
        await KT.removeCard(id);
        UI.flash('已删除');
        UI.go('library.html');
      } catch (err) {
        UI.toast(err.message);
      }
    });
  });

  render();
})();
