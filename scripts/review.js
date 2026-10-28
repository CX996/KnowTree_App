(async function () {
  var stage = document.getElementById('stage');
  var bar = document.getElementById('bar');
  var queue = [];
  var idx = 0;

  document.getElementById('close').addEventListener('click', function () { UI.back('index.html'); });

  stage.innerHTML = UI.emptyHTML('加载中…', '正在取今天要回溯的知识');
  try {
    await KT.load();
    await KT.loadReview();
  } catch (e) {
    stage.innerHTML = KT.errorHTML(e);
    bar.hidden = true;
    return;
  }
  queue = KT.reviewQueue(3);

  function dots() {
    var html = '<div class="dots mt24">';
    for (var i = 0; i < queue.length; i++) {
      html += '<i class="' + (i === idx ? 'on' : '') + '"></i>';
    }
    return html + '</div><div class="t3 s12 mt8" style="text-align:center">' + (idx + 1) + ' / ' + queue.length + '</div>';
  }

  function render() {
    if (!queue.length) {
      stage.innerHTML = '<div class="empty"><div class="t">今天没有需要回溯的知识</div><div>先丢几条进来，遗忘曲线会负责把它们送回来</div></div>' +
        '<a class="btn btn-primary btn-block mt16" href="index.html">回到知识树</a>';
      bar.hidden = true;
      return;
    }
    if (idx >= queue.length) {
      stage.innerHTML = '<div style="text-align:center">' +
        '<div class="h-big">今天的看完了</div>' +
        '<div class="t3 s13 mt8">明天会按遗忘曲线再送 ' + Math.min(queue.length, 3) + ' 条过来</div></div>' +
        '<a class="btn btn-primary btn-block mt24" href="index.html">回到知识树</a>';
      bar.hidden = true;
      return;
    }
    var c = queue[idx];
    stage.innerHTML =
      '<div class="card review-card">' +
        '<div class="card__meta mb8"><span class="nchip">' + UI.esc(KT.nodeName(c.nodeId)) + '</span>' +
        '<span>收录于 ' + UI.timeAgo(c.createdAt) + '</span></div>' +
        '<div class="card__title" style="font-size:19px">' + UI.esc(c.title) + '</div>' +
        '<div class="card__sum mt8" style="-webkit-line-clamp:4">' + UI.esc(c.summary) + '</div>' +
        '<div class="mt12"><a class="t3 s13" style="color:var(--gold)" href="detail.html?id=' + encodeURIComponent(c.id) + '">查看全文</a></div>' +
      '</div>' + dots();
    bar.hidden = false;
  }

  async function grade(status) {
    var c = queue[idx];
    idx++;
    render();
    if (!c) return;
    try {
      await KT.markSeen(c.id, status);
    } catch (e) {
      UI.toast('回溯状态没存上：' + e.message);
    }
  }

  document.getElementById('known').addEventListener('click', function () { grade('done'); });
  document.getElementById('forgot').addEventListener('click', function () { grade('skipped'); });

  render();
})();
