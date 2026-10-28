(async function () {
  var remind = document.getElementById('remind');
  var statsEl = document.getElementById('stats');
  var connVal = document.getElementById('connVal');

  try {
    await KT.load();
  } catch (e) {
    statsEl.innerHTML = '<div class="t3 s13">加载失败 · <a href="login.html" style="color:var(--gold)">去登录 / 配置后端</a></div>';
    return;
  }

  function render() {
    var s = KT.stats();
    statsEl.innerHTML =
      '<div class="stat"><div class="v">' + s.total + '</div><div class="k">收录</div></div>' +
      '<div class="stat"><div class="v">' + KT.NODES.length + '</div><div class="k">分类</div></div>' +
      '<div class="stat"><div class="v">' + s.week + '</div><div class="k">本周沉淀</div></div>';
    document.getElementById('trashCount').textContent = '';
    remind.classList.toggle('on', KT.getSetting('reviewReminder') !== false);
    if (connVal) {
      var base = KT.getConfig().apiBase.replace(/^https?:\/\//, '');
      connVal.textContent = base.length > 24 ? base.slice(0, 24) + '…' : base;
    }
  }

  /* 数据导出：走后端 /export */
  document.getElementById('export').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true;
    try {
      await KT.exportFile('json');
      UI.toast('已导出全部知识（JSON）');
    } catch (e) {
      UI.toast('导出失败：' + e.message);
    }
    btn.disabled = false;
  });

  /* 回收站：后端本期无恢复接口 */
  document.getElementById('trashRow').addEventListener('click', function () {
    UI.toast('后端本期未提供回收站 / 恢复接口');
  });

  /* 后端与登录 */
  var conn = document.getElementById('conn');
  if (conn) conn.addEventListener('click', function () { UI.go('login.html?next=me.html'); });

  /* 隐私与训练声明 */
  document.getElementById('privacy').addEventListener('click', function () {
    UI.openSheet('隐私与训练声明', function (body) {
      body.innerHTML =
        '<div class="prose" style="font-size:14px">' +
        '<p>知识正文、分类与回溯记录都存在你自己的账号下（后端按 user_id 隔离，全表 RLS），前端只在本地保存登录凭证。</p>' +
        '<p>「AI 解析」「语义检索」「相似度」由后端模型服务完成，你的内容不会被用于训练。</p>' +
        '<p>在下方「注销账号」会调用后端 DELETE /me/account，彻底删除你的条目与账号，操作不可撤销。</p>' +
        '</div>';
    });
  });

  /* 回溯提醒：写回 profile.daily_recall_enabled */
  remind.addEventListener('click', async function () {
    var on = !(KT.getSetting('reviewReminder') !== false);
    try {
      await KT.setSetting('reviewReminder', on);
      render();
      UI.toast(on ? '已开启每日回溯' : '已关闭每日回溯');
    } catch (e) {
      UI.toast('保存失败：' + e.message);
    }
  });

  /* 重置演示数据：后端数据不支持重置 */
  document.getElementById('reset').addEventListener('click', function () {
    UI.toast('后端数据不支持重置为演示数据');
  });

  /* 注销账号：DELETE /me/account */
  document.getElementById('logout').addEventListener('click', function () {
    UI.confirm({
      title: '注销账号？',
      desc: '会调用后端彻底删除你的全部知识、分类与账号，操作不可撤销。',
      ok: '注销'
    }).then(async function (ok) {
      if (!ok) return;
      try {
        await KT.wipe();
      } catch (e) {
        UI.toast('注销失败：' + e.message);
        return;
      }
      var page = document.querySelector('.page');
      var tabHost = document.querySelector('[data-tabbar]');
      if (tabHost) tabHost.innerHTML = '';
      page.innerHTML =
        '<div style="min-height:80dvh;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
        '<div class="h-big">账号已注销</div>' +
        '<div class="t3 s13 mt8">服务端数据与登录凭证都已清除</div>' +
        '<a class="btn btn-primary mt24" style="min-width:180px" href="login.html">重新登录</a>' +
        '</div>';
    });
  });

  render();
})();
