(async function () {
  var id = UI.q('id');
  var list = document.getElementById('list');
  var nameEl = document.getElementById('name');
  var subEl = document.getElementById('sub');

  document.getElementById('back').addEventListener('click', function () { UI.back('index.html'); });

  list.innerHTML = UI.emptyHTML('加载中…', '正在取这个分类下的知识');
  try {
    await KT.load();
  } catch (e) {
    list.innerHTML = KT.errorHTML(e);
    return;
  }

  var exists = KT.NODES.some(function (n) { return n.id === id; });
  if (!exists) {
    nameEl.textContent = '分类不存在';
    subEl.textContent = '';
    list.innerHTML = UI.emptyHTML('这个分类已经被移除', '回到知识树看看');
    return;
  }

  nameEl.textContent = KT.nodeName(id);
  var cards = KT.nodeCards(id);
  subEl.textContent = cards.length + ' 条知识';
  document.title = KT.nodeName(id) + ' · 知树 KnowTree';

  list.innerHTML = cards.length
    ? cards.map(UI.cardHTML).join('')
    : UI.emptyHTML('这个分类还没有知识', '丢一条进来，系统会试着挂到这里');
})();
