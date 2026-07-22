(function () {
  "use strict";
  var DATA = window.KOSEN_DATA || { schools: [] };
  var schools = DATA.schools || [];

  var REGIONS = ["北海道", "東北", "関東", "甲信越・北陸", "東海", "近畿", "中国", "四国", "九州・沖縄"];

  var FIELD_CLASS = { "エンジニア": "eng", "経営者": "biz", "研究者": "res", "プロ野球選手": "bb", "その他": "etc" };
  var FIELD_SHORT = { "エンジニア": "技", "経営者": "経", "研究者": "研", "プロ野球選手": "球", "その他": "他" };

  var state = { region: "all", q: "", sort: "region", alumniOnly: false, pref: "" };

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
      state.pref = "";           // 地方タブを選んだら地図の絞り込みは解除
      updateMapActive();
      Array.prototype.forEach.call($tabs.children, function (c) { c.classList.toggle("active", c === b); });
      render();
    });
  }

  // ---- filtering / sorting ----
  function filtered() {
    var q = state.q.trim();
    var list = schools.filter(function (s) {
      if (state.pref && s.prefecture !== state.pref) return false;
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
  var currentModalSchool = null;

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
    currentModalSchool = s;
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
        '<div class="m-rec" id="mRec">' +
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

  function closeModal() { $modal.hidden = true; document.body.style.overflow = ""; currentModalSchool = null; }

  // 開いているモーダルの内容を（表示中の季節フィルタを保ったまま）更新
  function refreshOpenModal(s) {
    if (!currentModalSchool || currentModalSchool.id !== s.id || $modal.hidden) return;
    var rec = document.getElementById("mRec");
    if (rec) {
      rec.innerHTML =
        '<div><b>' + s.wins + '</b>勝</div>' +
        '<div><b>' + s.loses + '</b>敗</div>' +
        '<div><b>' + fmtWinPct(s) + '</b>勝率</div>' +
        '<div><b>' + s.games.length + '</b>収録試合</div>';
    }
    var area = document.getElementById("gamesArea");
    if (area) {
      var gs = modalSeason === "all" ? s.games : s.games.filter(function (g) { return (g.season || "その他") === modalSeason; });
      area.innerHTML = gamesTable(gs);
    }
  }

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

  // ---- live update（開くたびに最新の試合結果を取得して追加） ----
  var SEASON_ORDER = { "夏": 0, "春": 1, "秋": 2, "その他": 3 };

  function seasonOf(t) {
    t = t || "";
    if (t.indexOf("選手権") >= 0 || t.indexOf("夏") >= 0) return "夏";
    if (t.indexOf("春") >= 0) return "春";
    if (t.indexOf("秋") >= 0) return "秋";
    if (t.indexOf("神宮") >= 0 || t.indexOf("国体") >= 0 || t.indexOf("招待") >= 0) return "その他";
    return "その他";
  }

  function gameSortVal(g) {
    var y = parseInt(g.year, 10) || 0;
    var s = SEASON_ORDER[g.season || "その他"];
    var m = 0, d = 0, p = (g.date || "").split("/");
    if (p.length === 2) { m = parseInt(p[0], 10) || 0; d = parseInt(p[1], 10) || 0; }
    return [-y, s, -m, -d];
  }
  function cmpGames(a, b) {
    var va = gameSortVal(a), vb = gameSortVal(b);
    for (var i = 0; i < va.length; i++) { if (va[i] !== vb[i]) return va[i] - vb[i]; }
    return 0;
  }

  // school_record の1試合 -> 内部の試合オブジェクト（確定試合のみ）
  function recordGame(g, teamName) {
    var ss = g.score_sum1, so = g.score_sum2;
    var finished = String(g.status_id) === "3";
    if (!finished) return null;
    if (!(/^\d+$/.test(String(ss)) && /^\d+$/.test(String(so)))) return null;
    var wf = g.win_flg;
    var result = wf === "1" ? "win" : (wf === "2" ? "lose" : (parseInt(ss, 10) > parseInt(so, 10) ? "win" : parseInt(ss, 10) < parseInt(so, 10) ? "lose" : "draw"));
    var tname = g.tournament_name_r || "";
    return {
      game_id: g.game_id || "",
      year: g.year || "",
      date: (g.game_date_m || "") + "/" + (g.game_date_d || ""),
      season: seasonOf(tname),
      tournament: tname,
      round: g.round_name || "",
      team_name: teamName || "",
      opponent: g.fighting_school_name || "",
      score_self: ss,
      score_opp: so,
      result: result
    };
  }

  // 新着/更新をマージ。戻り値 {added, updated}
  function mergeGames(school, incoming) {
    var byId = {};
    school.games.forEach(function (g) { if (g.game_id) byId[g.game_id] = g; });
    var added = 0, updated = 0;
    incoming.forEach(function (g) {
      if (!g.game_id) return;
      var ex = byId[g.game_id];
      if (!ex) { school.games.push(g); byId[g.game_id] = g; added++; }
      else if (ex.score_self !== g.score_self || ex.score_opp !== g.score_opp || ex.result !== g.result || ex.round !== g.round) {
        Object.assign(ex, g); updated++;
      }
    });
    if (added || updated) {
      school.games.sort(cmpGames);
      school.wins = school.games.filter(function (g) { return g.result === "win"; }).length;
      school.loses = school.games.filter(function (g) { return g.result === "lose"; }).length;
      school.total_games = school.games.length;
    }
    return { added: added, updated: updated };
  }

  function updateCard(school) {
    var el = $grid.querySelector('.card[data-id="' + school.id + '"]');
    if (el) {
      var tmp = document.createElement("div");
      tmp.innerHTML = cardHtml(school);
      el.replaceWith(tmp.firstElementChild);
    }
  }

  // 固定コールバック名 jsonpcall のため、リクエストは直列キューで処理する
  var jsonpQueue = Promise.resolve();
  function jsonp(url, timeout) {
    function run() {
      return new Promise(function (resolve, reject) {
        var done = false, s = document.createElement("script");
        function cb(d) { if (done) return; done = true; cleanup(); resolve(d); }
        function cleanup() {
          if (window.jsonpcall === cb) { try { delete window.jsonpcall; } catch (e) { window.jsonpcall = undefined; } }
          if (s.parentNode) s.parentNode.removeChild(s);
        }
        window.jsonpcall = cb;
        s.onerror = function () { if (done) return; done = true; cleanup(); reject(new Error("load")); };
        s.src = url;
        document.head.appendChild(s);
        setTimeout(function () { if (done) return; done = true; cleanup(); reject(new Error("timeout")); }, timeout || 7000);
      });
    }
    var p = jsonpQueue.then(run, run); // 前段の成否に関わらず実行
    jsonpQueue = p.catch(function () {}); // キューはこのリクエストが失敗しても継続
    return p;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var $live = document.getElementById("liveStatus");
  function setLive(cls, html) { $live.hidden = false; $live.className = "live-status " + cls; $live.innerHTML = html; }

  async function liveRefresh() {
    if (!/^https?:$/.test(location.protocol)) {
      // file:// では外部スクリプト取得が不安定なため案内のみ
    }
    var API = "https://api.base.asahi.com/?command=school_record&school_id=";
    setLive("loading", '<span class="ls-dot"></span> 最新の試合結果を取得中…');
    var totalNew = 0, totalUpd = 0, anyOk = false, firstTried = false;

    for (var i = 0; i < schools.length; i++) {
      var sc = schools[i];
      var changed = false;
      var ids = (sc.live_ids && sc.live_ids.length) ? sc.live_ids : (sc.source_ids || []);
      for (var j = 0; j < ids.length; j++) {
        var id = ids[j];
        var data = null;
        try {
          data = await jsonp(API + encodeURIComponent(id), 7000);
          anyOk = true;
        } catch (e) {
          if (!firstTried && !anyOk) { $live.hidden = true; return; } // CSP/オフライン等：スナップショット表示のまま
        }
        firstTried = true;
        if (data && data.result) {
          var r = data.result, tn = r.school_name || sc.name;
          var inc = (r.info1 || []).map(function (g) { return recordGame(g, tn); }).filter(Boolean);
          var res = mergeGames(sc, inc);
          if (res.added || res.updated) { changed = true; totalNew += res.added; totalUpd += res.updated; }
        }
        await sleep(50);
      }
      if (changed) {
        updateCard(sc);
        renderStats();
        renderCurrent();
        refreshOpenModal(sc);
      }
      if (anyOk) {
        setLive("loading", '<span class="ls-dot"></span> 最新の試合結果を取得中… (' + (i + 1) + '/' + schools.length + ')' +
          (totalNew ? '　新着 ' + totalNew + ' 試合' : ''));
      }
    }

    if (!anyOk) { $live.hidden = true; return; }
    var now = new Date();
    var stamp = (now.getMonth() + 1) + "/" + now.getDate() + " " + now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
    var msg = (totalNew ? "新着 " + totalNew + " 試合を追加" : "最新の結果に更新済み") +
      (totalUpd ? "（" + totalUpd + " 試合を更新）" : "") + " ・ " + stamp + " 時点";
    setLive("done", "✓ " + msg);
  }

  // ---- 日本地図（タイル）から高専を選択 ----
  // [都道府県名, row, col]（地理に沿ったタイル配置。列1=西, 行1=北）
  var PREFS = [
    ["北海道", 1, 14],
    ["青森県", 3, 13], ["秋田県", 4, 12], ["岩手県", 4, 13],
    ["山形県", 5, 12], ["宮城県", 5, 13], ["新潟県", 6, 12], ["福島県", 6, 13],
    ["群馬県", 7, 12], ["栃木県", 7, 13], ["茨城県", 7, 14],
    ["富山県", 7, 10], ["石川県", 7, 9], ["長野県", 8, 11], ["埼玉県", 8, 13],
    ["福井県", 8, 9], ["山梨県", 9, 12], ["東京都", 9, 13], ["千葉県", 9, 14],
    ["鳥取県", 8, 7], ["島根県", 8, 5],
    ["兵庫県", 9, 7], ["京都府", 9, 8], ["滋賀県", 9, 9], ["岐阜県", 9, 10],
    ["岡山県", 9, 6], ["広島県", 9, 5], ["山口県", 9, 4],
    ["大阪府", 10, 8], ["奈良県", 10, 9], ["愛知県", 10, 10], ["静岡県", 10, 11], ["神奈川県", 10, 13],
    ["香川県", 10, 6], ["徳島県", 10, 7], ["福岡県", 10, 3], ["佐賀県", 10, 2], ["大分県", 10, 4],
    ["三重県", 11, 9], ["和歌山県", 11, 8], ["愛媛県", 11, 5], ["高知県", 11, 6],
    ["長崎県", 11, 2], ["熊本県", 11, 3],
    ["宮崎県", 12, 4], ["鹿児島県", 12, 3], ["沖縄県", 13, 1]
  ];
  var MAP_COLS = 14, MAP_ROWS = 13;

  function schoolsByPref() {
    var m = {};
    schools.forEach(function (s) { (m[s.prefecture] = m[s.prefecture] || []).push(s); });
    return m;
  }
  function prefShort(n) {
    if (n === "北海道") return "北海道";
    return n.replace(/(県|府|都)$/, "");
  }

  function renderMap() {
    var $map = document.getElementById("jpMap");
    if (!$map) return;
    $map.style.gridTemplateColumns = "repeat(" + MAP_COLS + ", 1fr)";
    $map.style.gridTemplateRows = "repeat(" + MAP_ROWS + ", 1fr)";
    var byp = schoolsByPref();
    $map.innerHTML = PREFS.map(function (p) {
      var name = p[0], r = p[1], c = p[2];
      var list = byp[name] || [];
      var has = list.length > 0;
      var cnt = has ? '<span class="pt-c">' + list.length + '</span>' : '';
      return '<div class="pref-tile ' + (has ? "has" : "") + '" style="grid-row:' + r + ';grid-column:' + c + '"' +
        (has ? ' data-pref="' + esc(name) + '" title="' + esc(name) + '（' + list.length + '校）"' : '') +
        '><span class="pt-n">' + esc(prefShort(name)) + '</span>' + cnt + '</div>';
    }).join("");
    $map.addEventListener("click", function (e) {
      var t = e.target.closest(".pref-tile.has"); if (!t) return;
      var pref = t.getAttribute("data-pref");
      state.pref = (state.pref === pref) ? "" : pref;   // 同じ県を再クリックで解除
      if (state.pref) { state.region = "all"; syncRegionTabs(); }
      updateMapActive();
      render();
      var grid = document.getElementById("schoolGrid");
      if (state.pref && grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function updateMapActive() {
    var $map = document.getElementById("jpMap");
    if ($map) {
      Array.prototype.forEach.call($map.querySelectorAll(".pref-tile"), function (t) {
        t.classList.toggle("active", !!state.pref && t.getAttribute("data-pref") === state.pref);
      });
    }
    var $sel = document.getElementById("mapSelected");
    if ($sel) {
      if (state.pref) {
        var n = (schoolsByPref()[state.pref] || []).length;
        $sel.hidden = false;
        $sel.innerHTML = "選択中：" + esc(state.pref) + "（" + n + "校）<span class=\"ms-x\">✕ 解除</span>";
      } else { $sel.hidden = true; $sel.innerHTML = ""; }
    }
  }
  function syncRegionTabs() {
    var $tabs = document.getElementById("regionTabs");
    if (!$tabs) return;
    Array.prototype.forEach.call($tabs.children, function (c) {
      c.classList.toggle("active", c.getAttribute("data-region") === state.region);
    });
  }
  document.getElementById("mapSelected").addEventListener("click", function () {
    state.pref = ""; updateMapActive(); render();
  });

  // ---- 開催中の大会（勝ち残り／敗退）----
  function dateVal(g) {
    var p = (g.date || "").split("/");
    return (parseInt(p[0], 10) || 0) * 100 + (parseInt(p[1], 10) || 0);
  }
  function renderCurrent() {
    var $sec = document.getElementById("currentSection");
    if (!$sec) return;
    // 夏の最新年度＝開催中の大会年
    var curYear = "";
    schools.forEach(function (s) {
      s.games.forEach(function (g) {
        if (g.season === "夏" && (!curYear || g.year > curYear)) curYear = g.year;
      });
    });
    if (!curYear) { $sec.hidden = true; return; }

    var alive = [], out = [];
    schools.forEach(function (s) {
      var gs = s.games.filter(function (g) { return g.season === "夏" && g.year === curYear; });
      if (!gs.length) return;
      gs.sort(function (a, b) { return dateVal(a) - dateVal(b); });
      var last = gs[gs.length - 1];
      var wins = gs.filter(function (g) { return g.result === "win"; }).length;
      var entry = { s: s, last: last, wins: wins, played: gs.length };
      if (last.result === "lose") out.push(entry); else alive.push(entry);
    });

    if (!alive.length && !out.length) { $sec.hidden = true; return; }
    $sec.hidden = false;
    document.getElementById("currentTitle").textContent = curYear + "年 夏の地方大会（選手権）";

    // 勝ち残り：勝利数が多い順
    alive.sort(function (a, b) { return b.wins - a.wins || dateVal(b.last) - dateVal(a.last); });
    // 敗退：最後の試合が新しい順
    out.sort(function (a, b) { return dateVal(b.last) - dateVal(a.last); });

    document.getElementById("aliveCount").textContent = alive.length + "校";
    document.getElementById("outCount").textContent = out.length + "校";

    function itemHtml(e, kind) {
      var g = e.last;
      var scoreHtml = '<span class="cur-score">' + esc(g.score_self) + '–' + esc(g.score_opp) + '</span>';
      var teamNote = (g.team_name && g.team_name.indexOf("・") !== -1) ? '（連合）' : '';
      var detail;
      if (kind === "alive") {
        detail = '<span class="cd-round">' + esc(g.round) + '</span> 突破 ・ <span class="cd-opp">' + esc(g.opponent) + '</span> に勝利'
          + (e.wins > 1 ? ' ・ 今大会 ' + e.wins + '勝' : '');
      } else {
        detail = '<span class="cd-round">' + esc(g.round) + '</span> で敗退 ・ <span class="cd-opp">' + esc(g.opponent) + '</span> に敗れる'
          + (e.wins > 0 ? '（今大会 ' + e.wins + '勝）' : '');
      }
      var badge = kind === "alive" ? '<span class="cur-badge alive">勝ち残り</span>' : '<span class="cur-badge out">敗退</span>';
      return '<div class="cur-item ' + kind + '" data-id="' + esc(e.s.id) + '">' +
        '<span class="cur-name">' + esc(e.s.name) + teamNote + '</span>' +
        '<span class="cur-detail">' + detail + '</span>' + scoreHtml + badge +
      '</div>';
    }

    var aHtml = alive.length ? alive.map(function (e) { return itemHtml(e, "alive"); }).join("")
      : '<p class="current-empty">勝ち残っている高専はありません。</p>';
    var oHtml = out.length ? out.map(function (e) { return itemHtml(e, "out"); }).join("")
      : '<p class="current-empty">敗退した高専はまだありません。</p>';
    document.getElementById("aliveList").innerHTML = aHtml;
    document.getElementById("outList").innerHTML = oHtml;
  }
  // 開催中セクションのクリック→詳細モーダル
  document.getElementById("currentSection").addEventListener("click", function (e) {
    var it = e.target.closest(".cur-item"); if (!it) return;
    var s = schools.find(function (x) { return x.id === it.getAttribute("data-id"); });
    if (s) openModal(s);
  });

  // ---- init ----
  renderStats();
  renderTabs();
  renderMap();
  renderCurrent();
  render();
  liveRefresh();
})();
