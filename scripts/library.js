(async function () {
  var filter = 'all';
  var seg = document.getElementById('seg');
  var list = document.getElementById('list');

  list.innerHTML = UI.emptyHTML('加载中…', '正在从后端取知识库');
  try {
    await KT.load();
  } catch (e) {
    list.innerHTML = KT.errorHTML(e);
    return;
  }

  function counts() {
    var box = KT.inbox();
    return {
      all: KT.visible().length,
      pending: box.pending.length + box.dups.length,
      star: KT.uncategorized().length
    };
  }

  function render() {
    var c = counts();
    seg.querySelector('[data-f="all"] .n').textContent = c.all;
    seg.querySelector('[data-f="pending"] .n').textContent = c.pending;
    seg.querySelector('[data-f="star"] .n').textContent = c.star;

    var cards;
    if (filter === 'pending') {
      var box = KT.inbox();
      cards = box.pending.concat(box.dups);
    } else if (filter === 'star') {
      cards = KT.uncategorized();
    } else {
      cards = KT.visible();
    }

    if (!cards.length) {
      list.innerHTML = filter === 'star'
        ? UI.emptyHTML('没有未分类的条目', '待确认的条目处理完就会归到分类下')
        : UI.emptyHTML('这里空空如也', '丢一条进来，系统会试着挂到树上');
      return;
    }
    list.innerHTML = cards.map(UI.cardHTML).join('');
  }

  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    filter = b.getAttribute('data-f');
    seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    render();
  });

  render();
})();
