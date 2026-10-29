/* ===== 知树 KnowTree · 数据层（真实后端 /api/v1） =====
 * 取代原 assets/store.js。对外仍暴露 window.KT，页面渲染代码尽量不动。
 *
 * 约定（见《知树KnowTree-后端接口契约.md》）：
 *  - Base: <apiBase>/api/v1，鉴权头 x-session = Supabase access_token
 *  - 字段 snake_case，本文件在 toCard() 里转成页面既有的 camelCase 视图模型
 *  - 网络方法一律 async；只读方法同步读内存缓存（页面渲染不受影响）
 */
(function () {
  'use strict';

  var CFG_KEY = 'knowtree_cfg';
  var TOKEN_KEY = 'knowtree_token';
  var DUP_KEY = 'knowtree_dups';
  var DEFAULT_BASE = 'https://knowtree-api-vercel.vercel.app/api/v1';

  var cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { cfg = {}; }

  function apiBase() { return String(cfg.apiBase || DEFAULT_BASE).replace(/\/+$/, ''); }
  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t || ''); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }
  function getConfig() { return { apiBase: apiBase(), supabaseUrl: cfg.supabaseUrl || '', supabaseKey: cfg.supabaseKey || '' }; }
  function setConfig(next) {
    cfg = cfg || {};
    ['apiBase', 'supabaseUrl', 'supabaseKey'].forEach(function (k) {
      if (next && typeof next[k] === 'string' && next[k]) cfg[k] = next[k].trim();
    });
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function needLogin() {
    var here = location.pathname.split('/').pop() || 'index.html';
    if (here === 'login.html') return;
    var next = here + location.search;
    location.replace('login.html?next=' + encodeURIComponent(next));
  }

  /* ---------- 请求 ---------- */
  function req(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) headers['x-session'] = t;

    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;

    return fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (r.status === 401) {
        clearToken();
        needLogin();
        throw new Error('登录已失效，请重新登录');
      }
      if (!r.ok) {
        return r.text().then(function (txt) {
          var msg = txt;
          try { var j = JSON.parse(txt); msg = j.error || j.message || txt; } catch (e) { /* 非 JSON */ }
          throw new Error(msg || ('HTTP ' + r.status));
        });
      }
      if (opts.raw) return r;
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') >= 0) return r.json();
      return r.text();
    }, function (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new Error('请求超时（15s），后端是否可达？');
      throw new Error('连不上后端：检查「API Base」是否指向可访问的 /api/v1');
    });
  }

  /* ---------- 缓存 ---------- */
  var cache = { entries: [], categories: [], recalls: [], me: null, links: {}, dups: readDups() };

  function readDups() {
    try { return JSON.parse(localStorage.getItem(DUP_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveDups() {
    try { localStorage.setItem(DUP_KEY, JSON.stringify(cache.dups)); } catch (e) { /* 满则忽略 */ }
  }

  function catById(id) {
    if (!id) return null;
    return cache.categories.filter(function (c) { return c.id === id; })[0] || null;
  }
  function entryById(id) {
    return cache.entries.filter(function (e) { return e.id === id; })[0] || null;
  }
  function upsert(entry) {
    if (!entry || !entry.id) return;
    var i = -1;
    cache.entries.forEach(function (e, idx) { if (e.id === entry.id) i = idx; });
    if (i >= 0) cache.entries[i] = entry; else cache.entries.unshift(entry);
  }

  var TYPE_LABEL = { web: '网页', manual: '手动丢入', clip: '剪藏', image: '图片' };

  function statusOf(e) {
    if (e.status === 'failed') return 'failed';
    if (e.status === 'pending' || e.status === 'parsing') return 'processing';
    var cls = e.classification_status;
    if (cls === 'pending_review' || cls === 'uncategorized') return 'pending';
    return 'ok';
  }

  function splitBody(text) {
    return String(text || '')
      .split(/\n{2,}/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return !!s; });
  }

  /* 后端 Entry → 页面视图模型（保持页面里既有的字段名） */
  function toCard(e) {
    if (!e) return null;
    var body = splitBody(e.content);
    var cat = catById(e.category_id);
    var dup = cache.dups[e.id];
    var st = statusOf(e);
    if (dup && st !== 'processing') st = 'dup';
    return {
      id: e.id,
      title: e.title || (body[0] ? body[0].slice(0, 18) : '（无标题）'),
      summary: e.summary || (body[0] ? body[0].slice(0, 80) : ''),
      body: body.length ? body : [String(e.content || '')],
      nodeId: e.category_id || null,
      suggestedNode: e.suggested_category_id || null,
      confidence: e.classification_confidence,
      status: st,
      dupOf: dup ? dup.dupOf : null,
      sim: dup ? dup.sim : null,
      tags: cat ? [cat.name] : [],
      source: e.source_url || TYPE_LABEL[e.capture_type] || '手动丢入',
      createdAt: e.created_at,
      starred: false,
      deleted: !!e.deleted_at,
      links: (cache.links[e.id] || []).map(function (l) {
        return { to: l.target_entry_id, sim: l.score, title: l.target ? l.target.title : '' };
      }),
      weight: e.weight,
      recallCount: e.recall_count
    };
  }

  function byDateDesc(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }

  /* ---------- 加载 ---------- */
  function rebuildNodes() {
    KT.NODES.length = 0;
    cache.categories.forEach(function (c) {
      KT.NODES.push({ id: c.id, name: c.name, parentId: c.parent_id || null });
    });
  }

  function load() {
    if (!token()) {
      needLogin();
      return Promise.reject(new Error('未登录'));
    }
    return Promise.all([
      req('/categories'),
      req('/entries?page=1&size=100'),
      req('/me').catch(function () { return null; }),
      req('/recalls').catch(function () { return []; })
    ]).then(function (res) {
      cache.categories = res[0] || [];
      cache.entries = res[1] || [];
      cache.me = res[2] || null;
      cache.recalls = res[3] || [];
      rebuildNodes();
      return cache;
    });
  }

  /* 单条刷新：jobs 跑完后拿最新状态（分类 / 去重提示） */
  function refreshEntry(id) {
    return req('/entries/' + encodeURIComponent(id)).then(function (e) {
      upsert(e);
      return toCard(e);
    });
  }

  function loadDetail(id) {
    return Promise.all([
      req('/entries/' + encodeURIComponent(id)),
      req('/entries/' + encodeURIComponent(id) + '/links').catch(function () { return []; })
    ]).then(function (res) {
      upsert(res[0]);
      cache.links[id] = res[1] || [];
      return toCard(res[0]);
    });
  }

  function loadReview() {
    return req('/recalls').then(function (list) {
      list = list || [];
      if (list.length) { cache.recalls = list; return list; }
      return req('/recalls/generate', { method: 'POST', body: {} }).then(function (r) {
        var items = (r && (r.items || r.existing)) || [];
        cache.recalls = items;
        return items;
      });
    });
  }

  /* ---------- 只读（同步，读缓存） ---------- */
  function visible() {
    return cache.entries.filter(function (e) { return !e.deleted_at; }).map(toCard).sort(byDateDesc);
  }
  function classified() {
    return visible().filter(function (c) { return c.status === 'ok' && !!c.nodeId; });
  }
  function byId(id) {
    var e = entryById(id);
    return e ? toCard(e) : null;
  }
  function nodeName(id) {
    var c = catById(id);
    return c ? c.name : '未归类';
  }
  function nodeCards(id) {
    return visible().filter(function (c) { return c.nodeId === id; });
  }
  /* 含子孙分类的聚合计数（后端无 count，前端按 parent_id 递归） */
  function countInNode(id) {
    var ids = [id];
    var grew = true;
    while (grew) {
      grew = false;
      cache.categories.forEach(function (c) {
        if (c.parent_id && ids.indexOf(c.parent_id) !== -1 && ids.indexOf(c.id) === -1) {
          ids.push(c.id); grew = true;
        }
      });
    }
    return visible().filter(function (c) { return c.nodeId && ids.indexOf(c.nodeId) !== -1; }).length;
  }
  function inbox() {
    var all = visible();
    return {
      pending: all.filter(function (c) { return c.status === 'pending' || c.status === 'processing'; }),
      dups: all.filter(function (c) { return c.status === 'dup'; })
    };
  }
  function starred() { return []; } /* 后端暂无收藏字段 */
  function uncategorized() {
    return visible().filter(function (c) { return !c.nodeId && c.status !== 'dup'; });
  }
  function trash() { return []; } /* 后端软删除后不再返回，无回收站查询接口 */
  function stats() {
    var week = Date.now() - 7 * 864e5;
    var all = visible();
    return {
      total: all.length,
      nodes: KT.NODES.filter(function (n) { return countInNode(n.id) > 0; }).length || KT.NODES.length,
      week: all.filter(function (c) { return Date.parse(c.createdAt) >= week; }).length
    };
  }
  function search(q) {
    q = (q || '').trim();
    if (!q) return Promise.resolve({ nodes: [], cards: [] });
    return req('/search?q=' + encodeURIComponent(q) + '&limit=20').then(function (r) {
      var items = (r && r.items) || [];
      var cards = items.map(function (it) {
        var c = byId(it.id);
        if (!c) {
          c = {
            id: it.id, title: it.title || '（无标题）', summary: it.summary || '',
            body: [], nodeId: it.category_id || null, status: 'ok', tags: [],
            source: it.source_url || '', createdAt: it.created_at, links: [], starred: false
          };
        }
        c.score = it.score;
        c.semantic = it.semantic_similarity;
        return c;
      });
      var low = q.toLowerCase();
      var nodes = KT.NODES.filter(function (n) { return n.name.toLowerCase().indexOf(low) >= 0; });
      return { nodes: nodes, cards: cards, counts: (r && r.counts) || {} };
    });
  }
  function reviewQueue(n) {
    return cache.recalls
      .filter(function (r) { return r.status !== 'done' && r.status !== 'skipped'; })
      .map(function (r) {
        var c = byId(r.entry_id) || (r.entry ? toCard(r.entry) : null);
        if (!c) return null;
        c.recallId = r.id;
        return c;
      })
      .filter(Boolean)
      .slice(0, n || 3);
  }

  /* ---------- 写入（async） ---------- */
  function capture(text, opts) {
    opts = opts || {};
    var body = { content: String(text || '').trim(), captureType: opts.captureType || 'manual' };
    if (opts.title) body.title = opts.title;
    if (opts.url) body.url = opts.url;
    return req('/entries/ingest', { method: 'POST', body: body }).then(function (r) {
      var e = r.entry || null;
      if (e) upsert(e);
      if (r.status === 'hash_duplicate' && e) {
        cache.dups[e.id] = { dupOf: r.dup_of, sim: 1 };
        saveDups();
      } else if (e && (r.dup_suggestions || []).length) {
        var top = r.dup_suggestions[0];
        cache.dups[e.id] = { dupOf: top.entry_id, sim: top.similarity };
        saveDups();
      }
      return {
        dup: r.status === 'hash_duplicate',
        card: e ? toCard(e) : null,
        jobs: r.jobs || [],
        message: r.message || '',
        suggestions: r.dup_suggestions || []
      };
    });
  }

  /* 轮询 jobs 直到终态（或超时），用于「处理中 → 已归类/已互链」 */
  function pollJobs(ids, onTick, timeoutMs) {
    ids = ids || [];
    if (!ids.length) return Promise.resolve([]);
    var deadline = Date.now() + (timeoutMs || 20000);
    function one(id) {
      return req('/jobs/' + encodeURIComponent(id)).catch(function () { return { id: id, status: 'failed' }; });
    }
    function step() {
      return Promise.all(ids.map(one)).then(function (jobs) {
        if (typeof onTick === 'function') onTick(jobs);
        var pending = jobs.filter(function (j) { return j.status === 'pending' || j.status === 'running'; });
        if (!pending.length) return jobs;
        if (Date.now() > deadline) return jobs;
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(step()); }, 1200);
        });
      });
    }
    return step();
  }

  function assign(id, categoryId) {
    return req('/entries/' + encodeURIComponent(id), { method: 'PATCH', body: { category_id: categoryId } })
      .then(function (e) { upsert(e); return toCard(e); });
  }
  function mergeDup(id) {
    var c = byId(id);
    if (!c || !c.dupOf) return Promise.reject(new Error('没有可合并的目标条目'));
    return req('/entries/' + encodeURIComponent(id) + '/merge', {
      method: 'POST', body: { target_entry_id: c.dupOf }
    }).then(function (e) {
      delete cache.dups[id]; saveDups();
      cache.entries = cache.entries.filter(function (x) { return x.id !== id; });
      if (e && e.id) upsert(e);
      return toCard(e);
    });
  }
  function keepDup(id) {
    delete cache.dups[id]; saveDups();
    return Promise.resolve(true);
  }
  function removeCard(id) {
    return req('/entries/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      cache.entries = cache.entries.filter(function (x) { return x.id !== id; });
      return true;
    });
  }
  function restoreCard() { return Promise.reject(new Error('后端暂未提供恢复接口（软删除后不可撤销）')); }
  function toggleStar() { return Promise.reject(new Error('后端暂未提供收藏字段')); }
  function processAllInbox() {
    var list = inbox().pending.filter(function (c) { return c.suggestedNode; });
    var n = 0;
    return list.reduce(function (p, c) {
      return p.then(function () {
        return assign(c.id, c.suggestedNode).then(function () { n++; }, function () { /* 单条失败跳过 */ });
      });
    }, Promise.resolve()).then(function () { return n; });
  }
  function markSeen(entryId, status) {
    var r = cache.recalls.filter(function (x) { return x.entry_id === entryId; })[0];
    if (!r) return Promise.resolve(false);
    return req('/recalls/' + encodeURIComponent(r.id), { method: 'PATCH', body: { status: status || 'done' } })
      .then(function (updated) {
        r.status = (updated && updated.status) || status || 'done';
        return true;
      });
  }
  function undo() { return false; } /* 无服务端撤销栈 */
  function reset() { return Promise.reject(new Error('后端数据不支持重置为演示数据')); }

  function setSetting(key, value) {
    if (key !== 'reviewReminder') return Promise.resolve(false);
    return req('/me', { method: 'PATCH', body: { daily_recall_enabled: !!value } }).then(function (profile) {
      if (cache.me) cache.me.profile = profile;
      return true;
    });
  }
  function getSetting(key) {
    if (key !== 'reviewReminder') return undefined;
    var p = cache.me && cache.me.profile;
    return p ? p.daily_recall_enabled !== false : true;
  }

  function exportFile(format) {
    format = format || 'json';
    return req('/export?format=' + format, { raw: true }).then(function (r) {
      return r.text().then(function (text) {
        var type = format === 'md' ? 'text/markdown' : 'application/json';
        var blob = new Blob([text], { type: type });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'knowtree-export.' + (format === 'md' ? 'md' : 'json');
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 400);
        return true;
      });
    });
  }

  function wipe() {
    return req('/me/account', { method: 'DELETE' }).then(function () {
      clearToken();
      cache = { entries: [], categories: [], recalls: [], me: null, links: {}, dups: {} };
      saveDups();
      return true;
    });
  }

  /* 登录：优先 Supabase 邮箱密码（需配置 URL + anon key），否则粘贴 access_token */
  function loginWithPassword(email, password) {
    var url = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
    var key = cfg.supabaseKey || '';
    if (!url || !key) return Promise.reject(new Error('未配置 Supabase URL / anon key，请用「粘贴 access_token」方式'));
    return fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || j.error || '登录失败');
        if (!j.access_token) throw new Error('未拿到 access_token');
        setToken(j.access_token);
        return j;
      });
    });
  }

  function health() {
    return req('/health').then(function (r) { return r; });
  }

  function errorHTML(e) {
    var msg = (e && e.message) || String(e || '未知错误');
    return '<div class="empty"><div class="t">加载失败</div><div>' +
      String(msg).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div></div>' +
      '<button class="btn btn-block mt16" onclick="location.reload()">重试</button>';
  }

  window.KT = {
    NODES: [],
    load: load, loadDetail: loadDetail, loadReview: loadReview, refreshEntry: refreshEntry,
    visible: visible, classified: classified, byId: byId, nodeName: nodeName,
    nodeCards: nodeCards, countInNode: countInNode, inbox: inbox, starred: starred,
    uncategorized: uncategorized, trash: trash, search: search, reviewQueue: reviewQueue,
    stats: stats,
    capture: capture, pollJobs: pollJobs, assign: assign, mergeDup: mergeDup, keepDup: keepDup,
    removeCard: removeCard, restoreCard: restoreCard, toggleStar: toggleStar,
    processAllInbox: processAllInbox, markSeen: markSeen, undo: undo, reset: reset,
    setSetting: setSetting, getSetting: getSetting,
    exportFile: exportFile, wipe: wipe,
    loginWithPassword: loginWithPassword, health: health,
    token: token, setToken: setToken, clearToken: clearToken,
    getConfig: getConfig, setConfig: setConfig,
    errorHTML: errorHTML
  };
})();
