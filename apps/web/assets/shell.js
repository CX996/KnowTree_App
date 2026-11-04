(function () {
  'use strict';
  var ITEMS = [
    { id: 'tree', label: '知识树', href: 'index.html', icon: 'tree' },
    { id: 'lib', label: '知识库', href: 'library.html', icon: 'layers' },
    { id: 'review', label: '回顾', href: 'review.html', icon: 'clock' },
    { id: 'me', label: '我的', href: 'me.html', icon: 'user' }
  ];

  function mount() {
    var active = document.body.dataset.tab;
    if (!active || document.querySelector('.app-rail')) return;
    var rail = document.createElement('aside');
    rail.className = 'app-rail';
    rail.setAttribute('aria-label', '应用导航');
    rail.innerHTML =
      '<a class="app-rail__brand" href="index.html"><span class="app-rail__mark"></span>知树</a>' +
      '<a class="app-rail__capture" href="capture.html"><b>＋</b>丢一条进树里</a>' +
      '<nav class="app-rail__nav" aria-label="主导航"></nav>' +
      '<div class="app-rail__pet" data-pet-mount></div>';
    var nav = rail.querySelector('nav');
    ITEMS.forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.href;
      link.dataset.tab = item.id;
      link.className = 'app-rail__item' + (item.id === active ? ' is-active' : '');
      link.setAttribute('aria-current', item.id === active ? 'page' : 'false');
      link.innerHTML = window.UI.svg(item.icon) + '<span>' + item.label + '</span>';
      nav.appendChild(link);
    });
    document.body.prepend(rail);
    document.body.classList.add('has-app-shell');
  }

  function refreshActive(tab) {
    document.querySelectorAll('.app-rail__item').forEach(function (link) {
      var active = link.dataset.tab === tab;
      link.classList.toggle('is-active', active);
      link.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  window.KTShell = { mount: mount, refreshActive: refreshActive };
  mount();
})();
