(function () {
  "use strict";
  var DATA = window.KOSEN_DATA || { schools: [] };
  var schools = DATA.schools || [];

  var REGIONS = ["北海道", "東北", "関東", "甲信越・北陸", "東海", "近畿", "中国", "四国", "九州・沖縄"];

  var FIELD_CLASS = { "エンジニア": "eng", "経営者": "biz", "研究者": "res", "プロ野球選手": "bb", "その他": "etc" };
  var FIELD_SHORT = { "エンジニア": "技", "経営者": "経", "研究者": "研", "プロ野球選手": "球", "その他": "他" };

  var state = { region: "all", q: "", sort: "region", alumniOnly: false };

  var $grid = document.getElementById("schoolGrid");
  var $empty = document.getElementById("emptyMsg");

  // ---- helpers ----
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function winRate(s) { var t = s.wins + s.loses; return t ? s.wins / t : 0; }

  // ---- stats ----
  function renderStats() {
    var totalSchools = schools.length;
    var totalGames = schools.reduce(function (a, s) { return a + (s.games ? s.games.length : 0); }, 0);
    var totalWins = schools.reduce(function (a, s) { return a + s.wins; }, 0);
    var alumniCnt = schools.reduce(function (a, s) { return a + (s.alumni ? s.alumni.length : 0); }, 0);
    var cards = [
      ["<b>" + totalSchools + "</b>", "掲載高専数", "校"],
      [totalGames.toLocaleString(), "収録試合数", "試合"],
      [totalWins.toLocaleString(), "通算勝利数", "勝"],
      [alumniCnt.toLocaleString(), "紹介する著名OB・OG", "人"]
    ];
    document.getElementById("statsRow").innerHTML = cards.map(function (c) {
      var num = /^</.test(c[0]) ? c[0] : c[0];
      return '<div class="stat-card"><div class="num">' + num + '<small>' + c[2] + '</small></div><div class="lbl">' + c[1] + '</div></div>';
    }).join("");
    var meta = document.getElementById("headerMeta");
    meta.innerHTML = '全国 <b>' + totalSchools + '</b> 高専 / <b>' + totalGames.toLocaleString() + '</b> 試合を収録';
    document.getElementById("genDate").textContent = "データ生成日：" + (DATA.generated || "");
  }

  // ---- region tabs ----
  function renderTabs() {
    var counts = {};
    schools.forEach(function (s) { counts[s.region] = (counts[s.region] || 0) + 1; });
    var html = '<button data-region="all" class="active">すべて (' + schools.length + ')</button>';
    REGIONS.forEach(function (r) {
      if (!counts[r]) return;
      html += '<button data-region="' + esc(r) + '">' + esc(r) + ' (' + counts[r] + ')</button>';
    });
    var $tabs = document.getElementById("regionTabs");
    $tabs.innerHTML = html;
    $tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.region = b.getAttribute("data-region");
      Array.prototype.forEach.call($tabs.children, function (c) { c.classList.toggle("active", c === b); });
      render();
    });
  }

  // ---- filtering / sorting ----
  function filtered() {
    var q = state.q.trim();
    var list = schools.filter(function (s) {
      if (state.region !== "all" && s.region !== state.region) return false;
      if (state.alumniOnly && (!s.alumni || !s.alumni.length)) return false;
      if (q) {
        var hay = s.name + " " + s.kana + " " + s.prefecture + " " + s.region;
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var regIdx = function (s) { return REGIONS.indexOf(s.region); };
    list.sort(function (a, b) {
      switch (state.sort) {
        case "wins": return b.wins - a.wins || b.games.length - a.games.length;
        case "games": return b.games.length - a.games.length;
        case "winrate": return winRate(b) - winRate(a) || b.wins - a.wins;
        case "kana": return a.kana < b.kana ? -1 : a.kana > b.kana ? 1 : 0;
        default: return regIdx(a) - regIdx(b) || (a.kana < b.kana ? -1 : 1);
      }
    });
    return list;
  }

  // ---- card ----
  function alumniTags(s) {
    if (!s.alumni || !s.alumni.length) return '';
    var order = ["エンジニア", "経営者", "研究者", "プロ野球選手"];
    var shown = s.alumni.slice().sort(function (a, b) {
      return order.indexOf(b.field) - order.indexOf(a.field);
    }).slice(0, 3);
    var tags = shown.map(function (a) {
      return '<span class="tag ' + (FIELD_CLASS[a.field] || 'etc') + '">' + esc(a.name) + '</span>';
    });
    if (s.alumni.length > 3) tags.push('<span class="tag more">＋' + (s.alumni.length - 3) + '名</span>');
    return '<div class="alumni-tags">' + tags.join('') + '</div>';
  }

  function cardHtml(s) {
    var total = s.wins + s.loses;
    var wpct = total ? Math.round(winRate(s) * 100) : 0;
    var wbar = total
      ? '<div class="winbar"><span class="wb-w" style="width:' + (s.wins / total * 100) + '%"></span><span class="wb-l" style="width:' + (s.loses / total * 100) + '%"></span></div>'
      : '<div class="winbar"></div>';
    return '<article class="card" data-id="' + esc(s.id) + '">' +
      '<div class="card-top">' +
        '<span class="card-region" data-r="' + esc(s.region) + '">' + esc(s.region) + '</span>' +
        '<h2>' + esc(s.name) + '</h2>' +
        '<div class="pref">' + esc(s.prefecture) + '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="record">' +
          '<div class="rec-main"><span class="w">' + s.wins + '勝</span> ' + s.loses + '敗</div>' +
          wbar +
        '</div>' +
        '<div class="rec-sub">収録 ' + s.games.length + ' 試合' + (total ? '　勝率 ' + fmtWinPct(s) : '') + '</div>' +
        alumniTags(s) +
      '</div>' +
      '<div class="card-body" style="padding-top:0"><span class="card-foot">試合結果とOBを見る →</span></div>' +
    '</article>';
  }

  function render() {
    var list = filtered();
    $grid.innerHTML = list.map(cardHtml).join("");
    $empty.hidden = list.length !== 0;
  }

  // ---- modal ----
  var $modal = document.getElementById("modal");
  var $modalBody = document.getElementById("modalBody");
  var modalSeason = "all";

  function fmtWinPct(s) {
    var t = s.wins + s.loses; if (!t) return "―";
    var r = s.wins / t;
    return (r >= 1 ? "1.000" : "." + Math.round(r * 1000).toString().padStart(3, "0"));
  }

  function gamesTable(games) {
    // group by year desc
    var byYear = {};
    games.forEach(function (g) { (byYear[g.year] = byYear[g.year] || []).push(g); });
    var years = Object.keys(byYear).sort(function (a, b) { return b - a; });
    if (!years.length) return '<p class="no-alumni">この条件の試合結果はありません。</p>';
    return years.map(function (y) {
      var gs = byYear[y];
      var w = gs.filter(function (g) { return g.result === "win"; }).length;
      var l = gs.filter(function (g) { return g.result === "lose"; }).length;
      var rows = gs.map(function (g) {
        var badge = g.result === "win" ? '<span class="badge win">勝</span>'
          : g.result === "lose" ? '<span class="badge lose">負</span>'
          : '<span class="badge draw">分</span>';
        var selfNote = (g.team_name && g.team_name.indexOf("・") !== -1)
          ? '<div class="self">連合: ' + esc(g.team_name) + '</div>' : '';
        return '<tr>' +
          '<td class="g-tour"><span class="season-pill ' + esc(g.season || 'その他') + '">' + esc(g.season || '') + '</span>' + esc(shortTour(g.tournament)) + '</td>' +
          '<td class="g-round">' + esc(g.round) + '</td>' +
          '<td class="g-opp">' + esc(g.opponent) + selfNote + '</td>' +
          '<td class="g-score">' + esc(g.score_self) + ' - ' + esc(g.score_opp) + '</td>' +
          '<td class="g-res">' + badge + '</td>' +
        '</tr>';
      }).join("");
      return '<div class="year-group">' +
        '<div class="year-head"><span class="yr">' + esc(y) + '年</span><span class="yr-sum">' + w + '勝' + l + '敗</span></div>' +
        '<table class="game-table"><tbody>' + rows + '</tbody></table>' +
      '</div>';
    }).join("");
  }

  function shortTour(t) {
    if (!t) return "";
    return String(t)
      .replace("全国高等学校野球選手権", "選手権")
      .replace("全国高校野球選手権", "選手権")
      .replace(/^選手権/, "夏・選手権");
  }

  function openModal(s) {
    modalSeason = "all";
    var seasons = {};
    s.games.forEach(function (g) { seasons[g.season || "その他"] = true; });
    var order = ["夏", "春", "秋", "その他"];
    var sBtns = ['<button data-s="all" class="active">すべて</button>'];
    order.forEach(function (se) { if (seasons[se]) sBtns.push('<button data-s="' + se + '">' + se + '</button>'); });

    var alumniHtml;
    if (s.alumni && s.alumni.length) {
      alumniHtml = '<div class="alumni-list">' + s.alumni.map(function (a) {
        var fc = FIELD_CLASS[a.field] || "etc";
        return '<div class="alumnus"><div class="a-top"><span class="a-name">' + esc(a.name) + '</span>' +
          '<span class="a-field ' + fc + '">' + esc(a.field) + '</span></div>' +
          '<div class="a-desc">' + esc(a.description) + '</div></div>';
      }).join("") + '</div>';
    } else {
      alumniHtml = '<p class="no-alumni">確認できる著名な出身者の情報は現在ありません。</p>';
    }

    var teamNames = (s.team_names && s.team_names.length > 1)
      ? '<div class="m-teamnames">出場チーム名：' + s.team_names.map(esc).join(" / ") + '</div>' : '';

    $modalBody.innerHTML =
      '<div class="m-head">' +
        '<span class="m-region">' + esc(s.region) + '</span>' +
        '<h2>' + esc(s.name) + '</h2>' +
        '<div class="m-pref">' + esc(s.prefecture) + '</div>' +
        '<div class="m-rec">' +
          '<div><b>' + s.wins + '</b>勝</div>' +
          '<div><b>' + s.loses + '</b>敗</div>' +
          '<div><b>' + fmtWinPct(s) + '</b>勝率</div>' +
          '<div><b>' + s.games.length + '</b>収録試合</div>' +
        '</div>' + teamNames +
      '</div>' +
      '<div class="m-section">' +
        '<h3>著名な出身者</h3>' + alumniHtml +
      '</div>' +
      '<div class="m-section">' +
        '<h3>試合結果</h3>' +
        '<div class="season-filter" id="seasonFilter">' + sBtns.join("") + '</div>' +
        '<div id="gamesArea">' + gamesTable(s.games) + '</div>' +
      '</div>';

    var $sf = document.getElementById("seasonFilter");
    $sf.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      modalSeason = b.getAttribute("data-s");
      Array.prototype.forEach.call($sf.children, function (c) { c.classList.toggle("active", c === b); });
      var gs = modalSeason === "all" ? s.games : s.games.filter(function (g) { return (g.season || "その他") === modalSeason; });
      document.getElementById("gamesArea").innerHTML = gamesTable(gs);
    });

    $modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() { $modal.hidden = true; document.body.style.overflow = ""; }

  $grid.addEventListener("click", function (e) {
    var c = e.target.closest(".card"); if (!c) return;
    var s = schools.find(function (x) { return x.id === c.getAttribute("data-id"); });
    if (s) openModal(s);
  });
  $modal.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$modal.hidden) closeModal(); });

  // ---- controls ----
  document.getElementById("searchInput").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  document.getElementById("sortSelect").addEventListener("change", function (e) { state.sort = e.target.value; render(); });
  document.getElementById("alumniOnly").addEventListener("change", function (e) { state.alumniOnly = e.target.checked; render(); });

  // ---- init ----
  renderStats();
  renderTabs();
  render();
})();
