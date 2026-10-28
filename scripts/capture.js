(async function () {
  var text = document.getElementById('text');
  var submit = document.getElementById('submit');
  var importing = false;

  function leave() { UI.go('index.html'); }
  document.getElementById('bg').addEventListener('click', leave);
  document.getElementById('close').addEventListener('click', leave);

  try {
    await KT.load();
  } catch (e) {
    /* 未登录时 KT.load 会跳登录页，这里不打断 */
  }

  document.getElementById('import').addEventListener('click', function () {
    if (importing) return;
    importing = true;
    var sample = '重看 PPO 实现时注意：clip 裁的不是动作概率，而是重要性采样比超出 1±ε 后的更新意愿；A>0 只奖到上限，A<0 只罚到下限。另外 reward 曲线抖动先别慌，多半是学习率和 batch 不匹配，或者环境本身随机。';
    text.value = '';
    submit.disabled = true;
    var i = 0;
    var timer = setInterval(function () {
      i += 4;
      text.value = sample.slice(0, i);
      if (i >= sample.length) {
        clearInterval(timer);
        submit.disabled = false;
        importing = false;
        text.focus();
      }
    }, 24);
  });

  submit.addEventListener('click', async function () {
    var v = text.value.trim();
    if (!v) { UI.toast('先写点什么，再丢进来'); text.focus(); return; }
    submit.disabled = true;
    submit.textContent = '正在收录…';
    try {
      var r = await KT.capture(v);

      if (r.dup) {
        submit.textContent = '已存在';
        UI.flash('这条之前收过了，权重 +1（未重复收录）');
        UI.go('inbox.html');
        return;
      }

      if (r.jobs && r.jobs.length) {
        submit.textContent = '正在归类…';
        await KT.pollJobs(r.jobs, function (jobs) {
          var done = jobs.filter(function (j) { return j.status === 'succeeded'; }).length;
          if (done) submit.textContent = '正在归类… ' + done + '/' + jobs.length;
        });
      }

      var c;
      try { c = await KT.refreshEntry(r.card.id); } catch (e2) { c = KT.byId(r.card.id) || r.card; }
      if (c && c.status === 'dup') {
        UI.flash('疑似和《' + (KT.byId(c.dupOf) || {}).title + '》重复，去收件箱确认');
        UI.go('inbox.html');
        return;
      }
      if (c && c.status === 'ok') {
        UI.flash('已收录并归到「' + KT.nodeName(c.nodeId) + '」');
        UI.go('detail.html?id=' + encodeURIComponent(c.id));
        return;
      }
      UI.flash('已收录，等你确认分类');
      UI.go('inbox.html');
    } catch (e) {
      submit.disabled = false;
      submit.textContent = '丢进去';
      UI.toast(e.message);
    }
  });

  setTimeout(function () { text.focus(); }, 120);
})();
