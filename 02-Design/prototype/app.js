(function () {
  'use strict';

  var KEY = 'knowtree.v1';
  var REVIEW_KEY = 'knowtree.review';

  var SEED = {
    nodes: [
      { id: 'root', name: '机器人学', parent: null },
      { id: 'rl', name: '强化学习', parent: 'root' },
      { id: 'paper', name: '论文', parent: 'root' },
      { id: 'algo', name: '算法', parent: 'root' },
      { id: 'math', name: '数学', parent: 'root' },
      { id: 'ctrl', name: '控制', parent: 'root' },
      { id: 'cog', name: '认知', parent: 'root' }
    ],
    entries: [
      {
        id: 'e1',
        title: 'PPO 的优势函数估计',
        summary: '用 GAE 在偏差和方差之间折中：λ 调大更稳、更慢，λ 调小更快、更抖。',
        body: 'PPO 用 clip 限制策略更新的幅度，但真正决定更新方向的是优势函数。GAE 把多步回报按 λ 加权，λ 越大越接近蒙特卡洛，方差大偏差小；λ 越小越接近一步时序差分，方差小偏差大。工程上先固定 λ=0.95，再调 clip 范围。',
        node: 'rl',
        status: 'tree',
        fav: true,
        time: '3 天前',
        lastSeen: '23 天前',
        source: 'ppo-notes.pdf · 第 3 页',
        tags: ['GAE', '策略梯度'],
        links: [
          { id: 'e2', title: 'TRPO 与 PPO 的约束差别', node: 'rl', score: '0.87' },
          { id: 'e3', title: '世界模型与想象滚动的边界', node: 'paper', score: '0.74' }
        ]
      },
      {
        id: 'e2',
        title: 'TRPO 与 PPO 的约束差别',
        summary: 'TRPO 用 KL 硬约束解信赖域，PPO 用 clip 把约束近似成损失项，代价是实现简单、超参更敏感。',
        body: 'TRPO 每步要算 Fisher 矩阵向量积，二阶优化重；PPO 把重要性采样比裁到 [1-ε,1+ε]，用一阶方法近似信赖域。代价是 clip 只是启发式，ε 选错时更新会悄悄失效。',
        node: 'rl',
        status: 'tree',
        fav: false,
        time: '5 天前',
        lastSeen: '31 天前',
        source: 'trpo-vs-ppo.md',
        tags: ['信赖域', 'KL'],
        links: [{ id: 'e1', title: 'PPO 的优势函数估计', node: 'rl', score: '0.87' }]
      },
      {
        id: 'e3',
        title: '世界模型与想象滚动的边界',
        summary: '在潜空间里想象 15 步内还有效，超过之后模型误差会盖过规划收益。',
        body: 'Dreamer 系列的想象滚动长度不是越长越好：每一步都在用模型预测的隐状态继续预测，误差会累积。论文里的做法是给奖励预测加不确定性惩罚，滚动长度按任务调。',
        node: 'paper',
        status: 'tree',
        fav: false,
        time: '1 周前',
        lastSeen: '9 天前',
        source: 'dreamer-v3.pdf · 第 6 节',
        tags: ['Dreamer', '模型误差'],
        links: [{ id: 'e1', title: 'PPO 的优势函数估计', node: 'rl', score: '0.71' }]
      },
      {
        id: 'e4',
        title: 'Decision Transformer：把强化学习写成序列建模',
        summary: '不做价值估计，直接把「回报、状态、动作」当 token 预测下一步动作。',
        body: '把轨迹按 (return-to-go, state, action) 排列，用因果 Transformer 建模。好处是无需自举、离线数据友好；难处是对回报条件敏感，长序列成本高。',
        node: 'paper',
        status: 'tree',
        fav: false,
        time: '2 周前',
        lastSeen: '40 天前',
        source: 'decision-transformer.pdf',
        tags: ['序列建模', '离线RL'],
        links: []
      },
      {
        id: 'e5',
        title: '稀疏奖励下的探索策略',
        summary: '随机网络蒸馏、计数奖励、好奇心模块：都在给「没见过」打分。',
        body: '稀疏奖励的本质问题是梯度信号太少。RND 用固定随机网络的预测误差当新颖度，实现最简单；计数法在连续空间需要哈希或密度模型；好奇心模块容易栽在「噪声电视」问题上。',
        node: 'rl',
        status: 'confirm',
        conf: '0.62',
        suggest: 'rl',
        fav: false,
        time: '刚刚',
        lastSeen: '',
        source: 'exploration-notes.md',
        tags: ['探索', 'RND'],
        links: []
      },
      {
        id: 'e6',
        title: '关于「心流」的三个条件',
        summary: '目标清晰、反馈即时、难度与能力匹配。',
        body: '契克森米哈赖的原始描述里，心流不是「爽」，而是注意力被任务完全占据、时间感消失。三个条件缺一个就会滑向焦虑或无聊。',
        node: null,
        status: 'confirm',
        conf: '0.41',
        suggest: null,
        fav: false,
        time: '刚刚',
        lastSeen: '',
        source: '剪藏 · 得到',
        tags: ['心流'],
        links: []
      },
      {
        id: 'e7',
        title: 'PPO 的 clip 到底裁的是什么',
        summary: '裁的是重要性采样比，不是优势，也不是梯度。',
        body: 'clip 作用在 r_t(θ) = π_θ(a|s) / π_old(a|s) 上，把超出区间的比例截断，从而让新策略不会离旧策略太远。',
        node: 'rl',
        status: 'dup',
        dupOf: 'e1',
        sim: '0.91',
        fav: false,
        time: '刚刚',
        lastSeen: '',
        source: '知乎收藏',
        tags: ['PPO'],
        links: []
      },
      {
        id: 'e8',
        title: '为什么 A* 在栅格地图上比 Dijkstra 更稳',
        summary: '启发函数只要可采纳，就不会破坏最优性，还能少扩展大量节点。',
        body: 'Dijkstra 按 g 值扩展，A* 按 g+h 扩展。h 可采纳（不高估）时最优性保持；h 越接近真实代价，扩展节点越少。八邻域用对角距离比曼哈顿距离更紧。',
        node: 'algo',
        status: 'tree',
        fav: false,
        time: '2 天前',
        lastSeen: '18 天前',
        source: 'path-planning.md',
        tags: ['A*', '启发函数'],
        links: []
      },
      {
        id: 'e9',
        title: '训练日志：reward 曲线抖动的三个原因',
        summary: '学习率过大、batch 里长尾样本、以及环境随机种子没固定。',
        body: '先看是否周期性抖动（学习率），再看是否随 episode 长度抖动（样本分布），最后看不同种子之间的方差。三个原因的处理方式完全不同，别一上来就调 reward scale。',
        node: 'ctrl',
        status: 'tree',
        fav: false,
        time: '4 天前',
        lastSeen: '12 天前',
        source: 'train-log-0912.md',
        tags: ['训练', '排查'],
        links: []
      },
      {
        id: 'e10',
        title: '认知负荷与界面信息密度',
        summary: '一屏内的决策点超过 4 个，用户就开始用「随便点」代替「想清楚」。',
        body: '内在负荷由任务决定，外在负荷由界面决定。减少外在负荷的办法不是删信息，而是让信息分层：主路径只留一个动作，其余收进二级。',
        node: 'cog',
        status: 'tree',
        fav: true,
        time: '6 天前',
        lastSeen: '26 天前',
        source: 'design-notes.md',
        tags: ['认知负荷', '信息架构'],
        links: []
      },
      {
        id: 'e11',
        title: '线性代数的四个子空间，一张图讲清楚',
        summary: '行空间、零空间、列空间、左零空间，两两正交，维数相加等于 n 和 m。',
        body: 'A 把行空间同构映射到列空间，把零空间压到 0。所以 Ax=b 有解当且仅当 b 在列空间；解唯一当且仅当零空间只有零向量。',
        node: 'math',
        status: 'tree',
        fav: false,
        time: '1 周前',
        lastSeen: '35 天前',
        source: 'linalg-review.md',
        tags: ['线性代数'],
        links: []
      }
    ]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(SEED);
      var data = JSON.parse(raw);
      if (!data || !data.entries || !data.nodes) return clone(SEED);
      return data;
    } catch (error) {
      return clone(SEED);
    }
  }

  var store = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (error) {
      /* 隐私模式下忽略 */
    }
  }

  function reset() {
    store = clone(SEED);
    save();
    try {
      sessionStorage.removeItem(REVIEW_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }

  function nodeById(id) {
    for (var i = 0; i < store.nodes.length; i += 1) {
      if (store.nodes[i].id === id) return store.nodes[i];
    }
    return null;
  }

  function nodePath(id) {
    var node = nodeById(id);
    if (!node) return '未分类';
    if (!node.parent) return node.name;
    var parent = nodeById(node.parent);
    return (parent ? parent.name + ' / ' : '') + node.name;
  }

  function entriesWithStatus(status) {
    return store.entries.filter(function (entry) {
      return entry.status === status;
    });
  }

  function visibleEntries() {
    return store.entries.filter(function (entry) {
      return entry.status !== 'trash';
    });
  }

  function pendingCount() {
    return entriesWithStatus('confirm').length + entriesWithStatus('dup').length;
  }

  function countInNode(id) {
    var ids = [id];
    var grew = true;
    while (grew) {
      grew = false;
      store.nodes.forEach(function (node) {
        if (node.parent && ids.indexOf(node.parent) !== -1 && ids.indexOf(node.id) === -1) {
          ids.push(node.id);
          grew = true;
        }
      });
    }
    return store.entries.filter(function (entry) {
      return entry.status === 'tree' && ids.indexOf(entry.node) !== -1;
    }).length;
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (error) {
      return null;
    }
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  var toastEl = null;

  function toast(message, actionLabel, actionFn) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '';
    var text = document.createElement('span');
    text.textContent = message;
    toastEl.appendChild(text);
    if (actionLabel && actionFn) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = actionLabel;
      button.addEventListener('click', function () {
        actionFn();
        hideToast();
      });
      toastEl.appendChild(button);
    }
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 3200);
  }

  function hideToast() {
    if (toastEl) toastEl.classList.remove('show');
  }

  function flash(message) {
    try {
      if (message) sessionStorage.setItem('knowtree.flash', message);
    } catch (error) {
      /* ignore */
    }
  }

  function readFlash() {
    try {
      var message = sessionStorage.getItem('knowtree.flash');
      if (message) {
        sessionStorage.removeItem('knowtree.flash');
        toast(message);
      }
    } catch (error) {
      /* ignore */
    }
  }

  /* ---------- modal ---------- */
  function openModal(options) {
    var layer = document.createElement('div');
    layer.className = 'modal open';
    layer.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="' + esc(options.title) + '">' +
      '<h2>' + esc(options.title) + '</h2>' +
      '<p>' + esc(options.body) + '</p>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn--ghost" data-modal="cancel">' + esc(options.cancelText || '取消') + '</button>' +
      '<button type="button" class="btn ' + (options.danger ? 'btn--danger' : 'btn--primary') + '" data-modal="ok">' + esc(options.okText || '确定') + '</button>' +
      '</div></div>';
    document.body.appendChild(layer);

    function close() {
      layer.remove();
    }

    layer.addEventListener('click', function (event) {
      if (event.target === layer) close();
    });
    $('[data-modal="cancel"]', layer).addEventListener('click', close);
    $('[data-modal="ok"]', layer).addEventListener('click', function () {
      close();
      if (options.onOk) options.onOk();
    });
    $('[data-modal="ok"]', layer).focus();
  }

  function pickNode(entryId) {
    var entry = store.entries.filter(function (item) {
      return item.id === entryId;
    })[0];
    if (!entry) return;
    var layer = document.createElement('div');
    layer.className = 'modal open';
    layer.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="改节点">' +
      '<h2>挂到哪个节点</h2>' +
      '<div class="node-picker">' +
      store.nodes.map(function (node) {
        return '<button type="button" class="row" data-node="' + node.id + '"><span>' + esc(node.name) +
          '<span class="row-note">' + esc(nodePath(node.id)) + '</span></span><span class="chev">选择</span></button>';
      }).join('') +
      '</div>' +
      '<div class="modal-actions"><button type="button" class="btn btn--ghost btn--block" data-modal="cancel">取消</button></div>' +
      '</div>';
    document.body.appendChild(layer);

    function close() {
      layer.remove();
    }

    layer.addEventListener('click', function (event) {
      if (event.target === layer) close();
    });
    $('[data-modal="cancel"]', layer).addEventListener('click', close);
    $$('[data-node]', layer).forEach(function (button) {
      button.addEventListener('click', function () {
        var before = clone(entry);
        entry.node = button.getAttribute('data-node');
        entry.status = 'tree';
        entry.time = '刚刚';
        save();
        close();
        render();
        toast('已挂到「' + nodeById(entry.node).name + '」', '撤销', function () {
          Object.keys(entry).forEach(function (key) {
            delete entry[key];
          });
          Object.keys(before).forEach(function (key) {
            entry[key] = before[key];
          });
          save();
          render();
        });
      });
    });
  }

  /* ---------- shared fragments ---------- */
  function entryRow(entry) {
    var badge = '';
    if (entry.status === 'confirm') badge = '<span class="badge badge--confirm">待确认 ' + esc(entry.conf) + '</span>';
    if (entry.status === 'dup') badge = '<span class="badge badge--dup">疑似重复</span>';
    if (entry.status === 'parsing') badge = '<span class="badge badge--confirm">解析中</span>';
    var tags = entry.tags.slice(0, 2).map(function (tag) {
      return '<span class="tag">' + esc(tag) + '</span>';
    }).join('');
    return '<a class="entry" href="card.html?id=' + encodeURIComponent(entry.id) + '">' +
      '<div class="entry-title">' + esc(entry.title) + '</div>' +
      '<div class="entry-summary">' + esc(entry.summary) + '</div>' +
      '<div class="entry-meta">' + badge + tags +
      '<span>' + esc(nodePath(entry.node)) + '</span>' +
      '<span style="margin-left:auto">' + esc(entry.time) + '</span>' +
      '</div></a>';
  }

  function emptyState(title, text) {
    return '<div class="empty" data-state="empty"><strong>' + esc(title) + '</strong>' + esc(text) + '</div>';
  }

  function bindOnce(el, type, handler) {
    if (!el || el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener(type, handler);
  }

  function renderTabbar() {
    var page = document.body.getAttribute('data-page-id');
    var owner = document.body.getAttribute('data-tab');
    var active = owner || page;
    $$('.tabbar .tab').forEach(function (tab) {
      var target = tab.getAttribute('data-tab-target');
      if (target === active) {
        tab.setAttribute('aria-current', 'page');
      } else {
        tab.removeAttribute('aria-current');
      }
    });
  }

  /* ---------- pages ---------- */
  function renderTree() {
    var total = entriesWithStatus('tree').length;
    var sub = $('#tree-sub');
    if (sub) sub.textContent = store.nodes.length + ' 个节点 · ' + total + ' 条知识';

    var banner = $('#banner');
    var count = pendingCount();
    if (banner) {
      banner.hidden = count === 0;
      var label = $('#banner-count');
      if (label) label.textContent = count;
    }

    $$('[data-count]').forEach(function (text) {
      var value = countInNode(text.getAttribute('data-count'));
      text.textContent = value > 0 ? String(value) : '';
    });

    renderTabbar();
    readFlash();
  }

  function renderLibrary() {
    var state = { filter: 'all' };
    var list = $('#list');
    var seg = $('#seg');

    function draw() {
      var items = visibleEntries();
      if (state.filter === 'confirm') {
        items = items.filter(function (entry) { return entry.status === 'confirm'; });
      }
      if (state.filter === 'fav') {
        items = items.filter(function (entry) { return entry.fav; });
      }
      list.innerHTML = items.length
        ? items.map(entryRow).join('')
        : emptyState('这里还没有内容', state.filter === 'all' ? '回到知识树，点「丢一条」把第一条知识丢进来。' : '换个筛选看看。');
    }

    if (seg) {
      var all = visibleEntries().length;
      var confirmCount = entriesWithStatus('confirm').length;
      var favCount = visibleEntries().filter(function (entry) { return entry.fav; }).length;
      var buttons = $$('button', seg);
      buttons[0].textContent = '全部 ' + all;
      buttons[1].textContent = '待确认 ' + confirmCount;
      buttons[2].textContent = '收藏 ' + favCount;
      buttons.forEach(function (button) {
        button.setAttribute('aria-selected', button.getAttribute('data-filter') === state.filter ? 'true' : 'false');
      });
      bindOnce(seg, 'click', function (event) {
        var button = event.target.closest('button[data-filter]');
        if (!button) return;
        state.filter = button.getAttribute('data-filter');
        $$('button', seg).forEach(function (other) {
          other.setAttribute('aria-selected', other === button ? 'true' : 'false');
        });
        draw();
      });
    }

    draw();
    renderTabbar();
    readFlash();
  }

  function renderSearch() {
    var input = $('#q');
    var results = $('#results');
    var summary = $('#search-summary');
    var chips = $('#node-chips');

    function draw() {
      var query = input.value.trim();
      var items = visibleEntries();
      var matched = items;
      if (query) {
        var lower = query.toLowerCase();
        matched = items.filter(function (entry) {
          var haystack = [entry.title, entry.summary, entry.body, entry.tags.join(' '), nodePath(entry.node)].join(' ').toLowerCase();
          return haystack.indexOf(lower) !== -1;
        });
      }

      var nodeHits = store.nodes.filter(function (node) {
        return query && node.name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      });
      chips.innerHTML = nodeHits.map(function (node) {
        return '<a class="tag tag--gold" href="node.html?node=' + encodeURIComponent(node.id) + '">节点 · ' + esc(node.name) + '</a>';
      }).join('');

      if (!query) {
        summary.textContent = '最近收录 · ' + items.slice(0, 3).length + ' 条';
        results.innerHTML = items.slice(0, 3).map(entryRow).join('');
        return;
      }

      if (matched.length === 0) {
        summary.textContent = '没有完全匹配 · 已按语义展示最接近的 3 条';
        results.innerHTML = items.slice(0, 3).map(entryRow).join('');
        return;
      }

      summary.textContent = '命中 ' + matched.length + ' 条';
      results.innerHTML = matched.map(entryRow).join('');
    }

    input.addEventListener('input', draw);
    draw();
    renderTabbar();
    readFlash();
  }

  function renderInbox() {
    var confirms = entriesWithStatus('confirm');
    var dups = entriesWithStatus('dup');
    var host = $('#inbox-list');
    var bulk = $('#bulk');

    if (confirms.length === 0 && dups.length === 0) {
      host.innerHTML = emptyState('收件箱空了', '所有条目都已归类。新的内容丢进来后，拿不准的会先到这里。');
      if (bulk) bulk.hidden = true;
      renderTabbar();
      readFlash();
      return;
    }

    var html = '';

    if (confirms.length > 0) {
      html += '<div class="section-title"><strong>未归类</strong><span>' + confirms.length + ' 条</span></div>';
      html += confirms.map(function (entry) {
        var suggest = entry.suggest
          ? '<span class="tag tag--gold">AI 建议：' + esc(nodeById(entry.suggest).name) + '</span>'
          : '<span class="tag">没匹配到节点</span>';
        return '<article class="card" style="margin-bottom:10px">' +
          '<div class="entry-title">' + esc(entry.title) + '</div>' +
          '<div class="entry-summary">' + esc(entry.summary) + '</div>' +
          '<div class="suggest">' + suggest +
          '<span class="tag tag--action" data-action="change" data-id="' + entry.id + '">改节点</span>' +
          '<span class="meta">' + esc(entry.conf) + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button type="button" class="btn btn--primary btn--sm" data-action="accept" data-id="' + entry.id + '">就这样</button>' +
          '<a class="btn btn--ghost btn--sm" href="card.html?id=' + encodeURIComponent(entry.id) + '">先看原文</a>' +
          '</div></article>';
      }).join('');
    }

    if (dups.length > 0) {
      html += '<div class="section-title"><strong>疑似重复</strong><span>' + dups.length + ' 组</span></div>';
      html += dups.map(function (entry) {
        var original = store.entries.filter(function (item) { return item.id === entry.dupOf; })[0];
        return '<article class="card" style="margin-bottom:10px">' +
          '<div class="entry-title">' + esc(entry.title) + '</div>' +
          '<div class="entry-summary">' + esc(entry.summary) + '</div>' +
          '<div class="dup-pair"><span>与《' + esc(original ? original.title : '已有卡片') + '》</span>' +
          '<span class="sim">相似度 ' + esc(entry.sim) + '</span></div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button type="button" class="btn btn--quiet btn--sm" data-action="merge" data-id="' + entry.id + '">合并</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="keep" data-id="' + entry.id + '">保留两条</button>' +
          '</div></article>';
      }).join('');
    }

    host.innerHTML = html;
    if (bulk) bulk.hidden = confirms.length === 0;

    bindOnce(host, 'click', function (event) {
      var button = event.target.closest('[data-action]');
      if (!button) return;
      var id = button.getAttribute('data-id');
      var action = button.getAttribute('data-action');
      var entry = store.entries.filter(function (item) { return item.id === id; })[0];
      if (!entry) return;

      if (action === 'change') {
        pickNode(id);
        return;
      }

      var before = clone(entry);

      if (action === 'accept') {
        entry.status = 'tree';
        entry.node = entry.suggest || entry.node || 'root';
        entry.time = '刚刚';
        entry.links = [];
        save();
        render();
        toast('已入树 · ' + nodeById(entry.node).name, '撤销', function () {
          Object.assign(entry, before);
          save();
          render();
        });
        return;
      }

      if (action === 'merge') {
        entry.status = 'trash';
        var target = store.entries.filter(function (item) { return item.id === entry.dupOf; })[0];
        if (target) {
          target.tags = target.tags.concat(entry.tags.filter(function (tag) {
            return target.tags.indexOf(tag) === -1;
          }));
        }
        save();
        render();
        toast('已合并，原文保留在回收站', '撤销', function () {
          Object.assign(entry, before);
          save();
          render();
        });
        return;
      }

      if (action === 'keep') {
        entry.status = 'tree';
        entry.node = entry.node || 'rl';
        entry.time = '刚刚';
        save();
        render();
        toast('已保留为独立卡片', '撤销', function () {
          Object.assign(entry, before);
          save();
          render();
        });
      }
    });

    bindOnce(bulk, 'click', function () {
      var snapshot = clone(store.entries);
      entriesWithStatus('confirm').forEach(function (entry) {
        entry.status = 'tree';
        entry.node = entry.suggest || entry.node || 'root';
        entry.time = '刚刚';
      });
      save();
      render();
      toast('已按建议全部入树', '撤销', function () {
        store.entries = snapshot;
        save();
        render();
      });
    });

    renderTabbar();
    readFlash();
  }

  function renderCard() {
    var id = param('id');
    var entry = store.entries.filter(function (item) { return item.id === id; })[0];
    var host = $('#card-body');

    if (!entry) {
      host.innerHTML = emptyState('这张卡片不在了', '它可能已被删除。回到知识库看看其他内容。');
      return;
    }

    var links = (entry.links || []).map(function (link) {
      return '<a class="link-row" href="card.html?id=' + encodeURIComponent(link.id) + '">' +
        '<span><span style="display:block;font-size:13.5px">' + esc(link.title) + '</span>' +
        '<span class="row-note">' + esc(nodePath(link.node)) + '</span></span>' +
        '<span class="score">' + esc(link.score) + '</span></a>';
    }).join('');

    host.innerHTML =
      '<div class="detail-path">' + esc(nodePath(entry.node)) + ' · ' + esc(entry.time) + '</div>' +
      '<h1 class="detail-title">' + esc(entry.title) + '</h1>' +
      '<p class="detail-body">' + esc(entry.body) + '</p>' +
      '<blockquote class="detail-quote">' + esc(entry.summary) + '</blockquote>' +
      '<div class="entry-meta" style="margin-top:16px">' + entry.tags.map(function (tag) {
        return '<span class="tag">' + esc(tag) + '</span>';
      }).join('') + '</div>' +
      '<div class="detail-source"><span>来源</span><span>' + esc(entry.source) + '</span></div>' +
      (links ? '<div class="section-title"><strong>相关</strong><span>' + (entry.links || []).length + ' 条</span></div>' + links : '');

    var fav = $('#fav');
    fav.setAttribute('aria-pressed', entry.fav ? 'true' : 'false');
    fav.textContent = entry.fav ? '已收藏' : '收藏';

    bindOnce(fav, 'click', function () {
      var current = store.entries.filter(function (item) { return item.id === id; })[0];
      if (!current) return;
      current.fav = !current.fav;
      save();
      fav.setAttribute('aria-pressed', current.fav ? 'true' : 'false');
      fav.textContent = current.fav ? '已收藏' : '收藏';
      toast(current.fav ? '已加入收藏' : '已取消收藏');
    });

    bindOnce($('#change-node'), 'click', function () {
      pickNode(id);
    });

    bindOnce($('#delete'), 'click', function () {
      var current = store.entries.filter(function (item) { return item.id === id; })[0];
      if (!current) return;
      var before = clone(current);
      current.status = 'trash';
      save();
      toast('已移入回收站，30 天内可恢复', '撤销', function () {
        Object.assign(current, before);
        save();
      });
      window.setTimeout(function () {
        window.location.href = 'library.html';
      }, 1200);
    });

    readFlash();
  }

  function renderNode() {
    var id = param('node');
    var node = nodeById(id);
    var host = $('#node-body');

    if (!node) {
      host.innerHTML = emptyState('没有这个节点', '从知识树点一个节点进来看看。');
      return;
    }

    $('#node-title').textContent = node.name;
    var items = entriesWithStatus('tree').filter(function (entry) {
      return entry.node === node.id;
    });
    $('#node-sub').textContent = nodePath(node.id) + ' · ' + items.length + ' 条';

    host.innerHTML = items.length
      ? items.map(entryRow).join('')
      : emptyState('这个节点还是空的', '把内容丢进来，系统会自动挂到这里。');
    readFlash();
  }

  function renderReview() {
    var stage = $('#review-stage');
    var index = 0;
    try {
      index = Number(sessionStorage.getItem(REVIEW_KEY) || 0) || 0;
    } catch (error) {
      index = 0;
    }
    var cards = entriesWithStatus('tree').slice(0, 3);

    if (index >= cards.length) {
      stage.innerHTML =
        '<div class="card" data-state="complete" style="text-align:center;padding:32px 20px">' +
        '<div class="review-kicker">今日回溯</div>' +
        '<h1 class="review-title" style="margin-top:10px">今天的看完了</h1>' +
        '<p class="review-summary">3 张卡片已经过了一遍。记得的会隔更久再出现，忘了的明天再来。</p>' +
        '<div style="display:flex;gap:10px;margin-top:20px">' +
        '<a class="btn btn--ghost btn--block" href="index.html">回到知识树</a>' +
        '<button type="button" class="btn btn--primary btn--block" id="restart">再走一遍</button>' +
        '</div></div>';
      $('#restart').addEventListener('click', function () {
        try {
          sessionStorage.setItem(REVIEW_KEY, '0');
        } catch (error) {
          /* ignore */
        }
        renderReview();
      });
      return;
    }

    var entry = cards[index];
    stage.innerHTML =
      '<div class="review-kicker">今日回溯 · ' + (index + 1) + ' / ' + cards.length + '</div>' +
      '<article class="review-card" style="margin-top:14px">' +
      '<div class="review-title">' + esc(entry.title) + '</div>' +
      '<p class="review-summary">' + esc(entry.summary) + '</p>' +
      '<div class="review-foot"><span>' + esc(nodePath(entry.node)) + '</span><span>上次看 ' + esc(entry.lastSeen || '很久以前') + '</span></div>' +
      '</article>' +
      '<div class="review-actions">' +
      '<button type="button" class="btn btn--ghost" data-review="forgot">忘了</button>' +
      '<button type="button" class="btn btn--primary" data-review="remember">记得</button>' +
      '</div>' +
      '<div class="dots">' + cards.map(function (item, itemIndex) {
        return '<i class="' + (itemIndex <= index ? 'on' : '') + '"></i>';
      }).join('') + '</div>' +
      '<p class="review-hint">记得 → 间隔变长；忘了 → 明天再来</p>';

    $$('[data-review]', stage).forEach(function (button) {
      button.addEventListener('click', function () {
        try {
          sessionStorage.setItem(REVIEW_KEY, String(index + 1));
        } catch (error) {
          /* ignore */
        }
        renderReview();
      });
    });
  }

  function renderCompose() {
    var input = $('#compose-text');
    var submit = $('#compose-submit');
    var status = $('#compose-status');

    function deriveTitle(text) {
      var first = text.split(/[。！？\n]/)[0].trim();
      if (!first) first = text.trim();
      return first.length > 22 ? first.slice(0, 22) + '…' : first;
    }

    function finish(entry) {
      entry.status = 'confirm';
      entry.conf = '0.62';
      entry.suggest = 'rl';
      entry.node = null;
      entry.time = '刚刚';
      save();
      flash('已归类到「强化学习」，看一眼对不对？');
      window.location.href = 'inbox.html';
    }

    bindOnce(submit, 'click', function () {
      var text = input.value.trim();
      if (text.length < 5) {
        toast('再写两句，至少 5 个字');
        input.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = '正在解析…';
      status.textContent = '已收到，正在提取正文并匹配节点…';

      var entry = {
        id: 'n' + Date.now(),
        title: deriveTitle(text),
        summary: text.length > 60 ? text.slice(0, 60) + '…' : text,
        body: text,
        node: null,
        status: 'parsing',
        fav: false,
        time: '刚刚',
        lastSeen: '',
        source: '手动收录',
        tags: ['新收录'],
        links: []
      };
      store.entries.unshift(entry);
      save();

      window.setTimeout(function () {
        finish(entry);
      }, 1200);
    });

    bindOnce($('#import-file'), 'click', function () {
      var entry = {
        id: 'n' + Date.now(),
        title: '读书笔记：注意力的三种用法',
        summary: '选择性注意、分配性注意、持续性注意——三种用法对应三种不同的训练方式。',
        body: '选择性注意决定你忽略什么；分配性注意决定你能同时处理几件事；持续性注意决定你能在多久内保持质量。三者互相挤占，不能同时拉满。',
        node: null,
        status: 'parsing',
        fav: false,
        time: '刚刚',
        lastSeen: '',
        source: 'attention-notes.md',
        tags: ['注意力'],
        links: []
      };
      store.entries.unshift(entry);
      save();
      status.textContent = '已读取 attention-notes.md（1.2 千字）…';
      window.setTimeout(function () {
        finish(entry);
      }, 900);
    });

    readFlash();
  }

  function renderMe() {
    var total = visibleEntries().length;
    var weekly = entriesWithStatus('tree').length;
    $('#stat-total').textContent = total;
    $('#stat-nodes').textContent = store.nodes.length;
    $('#stat-week').textContent = weekly;

    bindOnce($('#export'), 'click', function () {
      toast('已导出 knowtree-export.md（演示，不产生真实文件）');
    });

    bindOnce($('#trash'), 'click', function () {
      var count = entriesWithStatus('trash').length;
      toast(count ? '回收站里有 ' + count + ' 条，30 天后清除' : '回收站是空的');
    });

    bindOnce($('#privacy'), 'click', function () {
      openModal({
        title: '隐私与训练声明',
        body: '你的内容只存在本机，默认不用于模型训练。导出与删除都由你自己发起，删除后 30 天内可恢复。',
        okText: '知道了',
        cancelText: '关闭',
        onOk: function () {}
      });
    });

    bindOnce($('#reminder'), 'click', function () {
      toast('回溯提醒：每天 21:30（演示设置）');
    });

    bindOnce($('#reset'), 'click', function () {
      openModal({
        title: '重置演示数据',
        body: '会把收录、归类、收藏全部恢复到初始状态，用于重新演示。此操作不可撤销。',
        okText: '重置',
        danger: true,
        onOk: function () {
          reset();
          toast('已重置为初始数据');
          window.setTimeout(function () {
            window.location.href = 'index.html';
          }, 600);
        }
      });
    });

    bindOnce($('#logout'), 'click', function () {
      openModal({
        title: '注销账号',
        body: '注销后全部知识、原文与导出记录会被清除，且无法恢复。演示环境不会真的提交。',
        okText: '确认注销',
        danger: true,
        onOk: function () {
          reset();
          toast('已模拟注销，数据清空');
          window.setTimeout(function () {
            window.location.href = 'index.html';
          }, 600);
        }
      });
    });

    renderTabbar();
    readFlash();
  }

  var renderers = {
    tree: renderTree,
    library: renderLibrary,
    search: renderSearch,
    inbox: renderInbox,
    card: renderCard,
    node: renderNode,
    review: renderReview,
    compose: renderCompose,
    me: renderMe
  };

  function render() {
    var page = document.body.getAttribute('data-page-id');
    if (renderers[page]) renderers[page]();
  }

  render();
})();
