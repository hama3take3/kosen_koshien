#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
バーチャル高校野球 (vk.sportsbull.jp) の非公開JSON API から、
全国の高専（高等専門学校）の試合結果を収集する。

データ元:
  - 学校検索:  https://api.base.asahi.com/?command=school_search&keyword=高専
  - 学校戦績:  https://api.base.asahi.com/?command=school_record&school_id=<id>

出力: data/kosen_results.json
"""
import json
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
CACHE = DATA / "cache"
CACHE.mkdir(exist_ok=True)

API = "https://api.base.asahi.com/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def _cache_key(params):
    return urllib.parse.urlencode(sorted(params.items())).replace("%", "_").replace("&", "__")[:180]


LAST_FROM_CACHE = False


def curl_json(params, cache=True):
    """curl 経由でAPIを叩き JSON を返す（プロキシ/TLS対応済み・ディスクキャッシュ付）"""
    global LAST_FROM_CACHE
    LAST_FROM_CACHE = False
    cf = CACHE / (_cache_key(params) + ".json")
    if cache and cf.exists():
        try:
            data = json.loads(cf.read_text(encoding="utf-8"))
            LAST_FROM_CACHE = True
            return data
        except Exception:
            pass
    qs = urllib.parse.urlencode(params)
    url = f"{API}?{qs}"
    for attempt in range(4):
        try:
            out = subprocess.run(
                ["curl", "-sSL", "-A", UA, url],
                capture_output=True, timeout=40,
            )
            txt = out.stdout.decode("utf-8", "replace").strip()
            # 一部は jsonp コールバックで包まれる場合があるので剥がす
            if txt and not txt.startswith("{"):
                i = txt.find("(")
                j = txt.rfind(")")
                if i != -1 and j != -1:
                    txt = txt[i + 1:j]
            data = json.loads(txt)
            if cache and data and data.get("result"):
                cf.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except Exception as e:
            if attempt == 3:
                print(f"  ! failed {url}: {e}", file=sys.stderr)
                return None
            time.sleep(2 * (attempt + 1))
    return None


# ---------------------------------------------------------------------------
# 1. 高専の学校IDを収集（検索キーワードで網羅）
# ---------------------------------------------------------------------------
def collect_schools():
    found = {}  # school_id -> record
    for kw in ["高専", "工業高等専門", "商船高等専門"]:
        res = curl_json({"command": "school_search", "keyword": kw})
        if not res or "result" not in res:
            continue
        for s in res["result"].get("info", []):
            found[s["school_id"]] = s
        time.sleep(0.3)
    return found


# ---------------------------------------------------------------------------
# 2. 正規の高専（キャンパス単位）の定義 と マッチ用トークン
#    token が school_name に含まれれば、その高専の試合とみなす。
#    より長い token を優先してマッチさせ、曖昧さを解消する。
# ---------------------------------------------------------------------------
# (canonical_id, 表示名, 読み, 都道府県, 地方, [マッチtoken...])
CANONICAL = [
    # --- 北海道 ---
    ("kushiro",   "釧路高専",     "くしろ",       "北海道", "北海道", ["釧路高専"]),
    ("asahikawa", "旭川高専",     "あさひかわ",   "北海道", "北海道", ["旭川高専"]),
    ("hakodate",  "函館高専",     "はこだて",     "北海道", "北海道", ["函館高専"]),
    ("tomakomai", "苫小牧高専",   "とまこまい",   "北海道", "北海道", ["苫小牧高専"]),
    # --- 東北 ---
    ("hachinohe", "八戸高専",     "はちのへ",     "青森県", "東北",   ["八戸高専"]),
    ("ichinoseki","一関高専",     "いちのせき",   "岩手県", "東北",   ["一関高専"]),
    ("akita",     "秋田高専",     "あきた",       "秋田県", "東北",   ["秋田高専"]),
    ("tsuruoka",  "鶴岡高専",     "つるおか",     "山形県", "東北",   ["鶴岡高専"]),
    ("sendai_n",  "仙台高専 名取", "せんだいなとり","宮城県","東北",  ["仙台高専名取", "仙台電波高専", "電波高専"]),
    ("sendai_h",  "仙台高専 広瀬", "せんだいひろせ","宮城県","東北",  ["仙台高専広瀬", "宮城高専"]),
    ("fukushima", "福島高専",     "ふくしま",     "福島県", "東北",   ["福島高専"]),
    # --- 関東 ---
    ("ibaraki",   "茨城高専",     "いばらき",     "茨城県", "関東",   ["茨城高専"]),
    ("oyama",     "小山高専",     "おやま",       "栃木県", "関東",   ["小山高専"]),
    ("gunma",     "群馬高専",     "ぐんま",       "群馬県", "関東",   ["群馬高専"]),
    ("kisarazu",  "木更津高専",   "きさらづ",     "千葉県", "関東",   ["木更津高専"]),
    ("sangi",     "産業技術高専", "さんぎょうぎじゅつ","東京都","関東",["産業技術高専"]),
    ("tokyo",     "東京高専",     "とうきょう",   "東京都", "関東",   ["東京高専"]),
    # --- 甲信越・北陸 ---
    ("nagaoka",   "長岡高専",     "ながおか",     "新潟県", "甲信越・北陸", ["長岡高専"]),
    ("nagano",    "長野高専",     "ながの",       "長野県", "甲信越・北陸", ["長野高専"]),
    ("toyama_h",  "富山高専 本郷", "とやまほんごう","富山県","甲信越・北陸",["富山高専本郷", "高専本郷", "富山工業高専"]),
    ("toyama_i",  "富山高専 射水", "とやまいみず", "富山県","甲信越・北陸",["富山高専射水", "高専射水", "富山商船高専"]),
    ("toyama",    "富山高専",     "とやま",       "富山県", "甲信越・北陸", ["富山高専"]),
    ("ishikawa",  "石川高専",     "いしかわ",     "石川県", "甲信越・北陸", ["石川高専"]),
    ("kanazawa",  "国際高専",     "こくさい",     "石川県", "甲信越・北陸", ["国際高専", "金沢高専", "金沢工業高専", "金沢工大高専"]),
    ("fukui",     "福井高専",     "ふくい",       "福井県", "甲信越・北陸", ["福井高専"]),
    # --- 東海 ---
    ("numazu",    "沼津高専",     "ぬまづ",       "静岡県", "東海",   ["沼津高専"]),
    ("toyota",    "豊田高専",     "とよた",       "愛知県", "東海",   ["豊田高専"]),
    ("gifu",      "岐阜高専",     "ぎふ",         "岐阜県", "東海",   ["岐阜高専"]),
    ("kindai",    "近大高専",     "きんだい",     "三重県", "東海",   ["近大高専"]),
    ("toba",      "鳥羽商船高専", "とばしょうせん","三重県", "東海",   ["鳥羽商船高専"]),
    # --- 近畿 ---
    ("maizuru",   "舞鶴高専",     "まいづる",     "京都府", "近畿",   ["舞鶴高専"]),
    ("osaka",     "大阪公大高専", "おおさかこうだい","大阪府","近畿", ["大阪公大高専", "大阪府大高専"]),
    ("kobe",      "神戸市立高専", "こうべ",       "兵庫県", "近畿",   ["神戸高専", "神戸市立高専", "神戸市高専"]),
    ("akashi",    "明石高専",     "あかし",       "兵庫県", "近畿",   ["明石高専"]),
    ("nara",      "奈良高専",     "なら",         "奈良県", "近畿",   ["奈良高専"]),
    ("wakayama",  "和歌山高専",   "わかやま",     "和歌山県","近畿",  ["和歌山高専"]),
    # --- 中国 ---
    ("yonago",    "米子高専",     "よなご",       "鳥取県", "中国",   ["米子高専"]),
    ("matsue",    "松江高専",     "まつえ",       "島根県", "中国",   ["松江高専"]),
    ("tsuyama",   "津山高専",     "つやま",       "岡山県", "中国",   ["津山高専"]),
    ("kure",      "呉高専",       "くれ",         "広島県", "中国",   ["呉高専"]),
    ("hiroshima_s","広島商船高専","ひろしましょうせん","広島県","中国",["広島商船高専"]),
    ("tokuyama",  "徳山高専",     "とくやま",     "山口県", "中国",   ["徳山高専"]),
    ("ube",       "宇部高専",     "うべ",         "山口県", "中国",   ["宇部高専"]),
    ("oshima_s",  "大島商船高専", "おおしましょうせん","山口県","中国",["大島商船高専"]),
    # --- 四国 ---
    ("anan",      "阿南高専",     "あなん",       "徳島県", "四国",   ["阿南高専"]),
    ("kagawa_t",  "香川高専 詫間", "かがわたくま", "香川県", "四国",   ["香川高専詫間", "詫間電波高専", "詫間高専", "電波高専"]),
    ("kagawa_h",  "香川高専 高松", "かがわたかまつ","香川県","四国",  ["香川高専高松", "高松高専", "高松工業高専"]),
    ("niihama",   "新居浜高専",   "にいはま",     "愛媛県", "四国",   ["新居浜高専"]),
    ("yuge",      "弓削商船高専", "ゆげしょうせん","愛媛県", "四国",   ["弓削商船高専"]),
    ("kochi",     "高知高専",     "こうち",       "高知県", "四国",   ["高知高専"]),
    # --- 九州・沖縄 ---
    ("kitakyushu","北九州高専",   "きたきゅうしゅう","福岡県","九州・沖縄",["北九州高専"]),
    ("ariake",    "有明高専",     "ありあけ",     "福岡県", "九州・沖縄", ["有明高専"]),
    ("kurume",    "久留米高専",   "くるめ",       "福岡県", "九州・沖縄", ["久留米高専"]),
    ("sasebo",    "佐世保高専",   "させぼ",       "長崎県", "九州・沖縄", ["佐世保高専"]),
    ("kumamoto_y","熊本高専 八代","くまもとやつしろ","熊本県","九州・沖縄",["熊本高専八代", "八代高専"]),
    ("kumamoto_k","熊本高専 熊本","くまもと",     "熊本県", "九州・沖縄", ["熊本高専熊本", "熊本電波高専", "電波高専"]),
    ("oita",      "大分高専",     "おおいた",     "大分県", "九州・沖縄", ["大分高専"]),
    ("miyakonojo","都城高専",     "みやこのじょう","宮崎県","九州・沖縄",["都城高専"]),
    ("kagoshima", "鹿児島高専",   "かごしま",     "鹿児島県","九州・沖縄",["鹿児島高専"]),
    ("okinawa",   "沖縄高専",     "おきなわ",     "沖縄県", "九州・沖縄", ["沖縄高専"]),
]


# canonical_id -> VK都道府県slug（メインで確定させ、判定時の絞り込みに使う）
CANON_SLUG = {}      # cid -> slug
SLUG_CANON = {}      # slug -> [entry,...]


def register_slugs(schools):
    for sid, s in schools.items():
        c = _match_tokens(s["school_name"], CANONICAL)
        if c:
            CANON_SLUG.setdefault(c[0], s.get("koshien_prefecture_name_e", ""))
    for e in CANONICAL:
        slug = CANON_SLUG.get(e[0])
        if slug:
            SLUG_CANON.setdefault(slug, []).append(e)


def _match_tokens(school_name, candidates):
    """候補の中から、最長トークンにマッチする高専を返す。"""
    best, best_len = None, 0
    for entry in candidates:
        for tok in entry[5]:
            if tok in school_name and len(tok) > best_len:
                best, best_len = entry, len(tok)
    return best


def canonical_for(school_name, slug=None):
    """school_name（連合含む）から所属高専を判定。
       slug が与えられれば、その都道府県の高専のみを候補とする（誤判定防止）。"""
    if not school_name or "高専" not in school_name:
        return None
    if slug and slug in SLUG_CANON:
        cands = SLUG_CANON[slug]
        # その県に高専が1校のみなら、高専を含む名前は必ずその校
        if len(cands) == 1:
            return cands[0]
        m = _match_tokens(school_name, cands)
        if m:
            return m
        return None  # 同県に複数あるが判別不能 → 誤判定を避けてスキップ
    return _match_tokens(school_name, CANONICAL)


def season_of(tournament_name):
    """大会名から季節を判定。"""
    t = tournament_name or ""
    if "選手権" in t or "夏" in t:
        return "夏"
    if "春" in t:
        return "春"
    if "秋" in t:
        return "秋"
    if "神宮" in t or "国体" in t or "招待" in t:
        return "その他"
    return "その他"


CURL_UA = UA


def fetch_text(url):
    for attempt in range(4):
        try:
            out = subprocess.run(["curl", "-sSL", "-A", CURL_UA, url],
                                 capture_output=True, timeout=40)
            return out.stdout.decode("utf-8", "replace")
        except Exception:
            time.sleep(2 * (attempt + 1))
    return ""


import re

def discover_summer_tids(slug):
    """都道府県ページから、夏の選手権に相当する tournament_id を推定。
       （年数が最も多い＝長年開催されている大会＝夏の選手権）"""
    html = fetch_text(f"https://vk.sportsbull.jp/koshien/{slug}/")
    pairs = re.findall(r"/koshien/game/(\d{4})/(\d+)/", html)
    tid_years = {}
    for y, t in pairs:
        tid_years.setdefault(t, set()).add(int(y))
    if not tid_years:
        return []
    # 4年以上開催されている tournament_id を対象（夏の選手権＋長期開催の地区大会）
    good = [(t, ys) for t, ys in tid_years.items() if len(ys) >= 4]
    if not good:
        # フォールバック: 最多年数の1つ
        t = max(tid_years.items(), key=lambda kv: len(kv[1]))[0]
        good = [(t, tid_years[t])]
    return good


# ---------------------------------------------------------------------------
# 3. メイン
# ---------------------------------------------------------------------------
def main():
    print("[1/3] 学校検索で高専IDを収集 ...")
    schools = collect_schools()
    print(f"    {len(schools)} 校（連合チーム含む）ヒット")

    # canonical_id -> aggregate
    agg = {}
    for e in CANONICAL:
        agg[e[0]] = {
            "id": e[0],
            "name": e[1],
            "kana": e[2],
            "prefecture": e[3],
            "region": e[4],
            "source_ids": [],       # 元school_id群
            "live_ids": set(),      # 直近稼働中の school_id（ライブ更新対象）
            "team_names": set(),    # 出場したチーム名（連合名含む）
            "games": [],
        }

    # canonical -> VK都道府県slug（絞り込みマップを構築）
    register_slugs(schools)
    canon_slug = CANON_SLUG

    seen_game = {}  # canonical_id -> set(game_id)

    print("[2/4] 各学校IDの直近戦績(春/夏/秋)を取得 ...")
    for sid, s in sorted(schools.items()):
        slug = s.get("koshien_prefecture_name_e", "")
        canon = canonical_for(s["school_name"], slug)
        if not canon:
            print(f"    ? 未マッピング: {sid} {s['school_name']}")
            continue
        cid = canon[0]
        rec = curl_json({"command": "school_record", "school_id": sid})
        if not LAST_FROM_CACHE:
            time.sleep(0.2)
        if not rec or "result" not in rec:
            continue
        r = rec["result"]
        A = agg[cid]
        A["source_ids"].append(sid)
        A["team_names"].add(s["school_name"])
        seen_game.setdefault(cid, set())
        # 直近(2024年以降)に試合実績のある source_id のみ「稼働中チーム」として
        # ライブ更新の対象にする（過去限りの連合チームIDへの無駄打ちを避ける）
        recent_years = [int(x.get("year") or 0) for x in r.get("info1", []) if str(x.get("year", "")).isdigit()]
        if recent_years and max(recent_years) >= 2024:
            A.setdefault("live_ids", set()).add(sid)
        for g in r.get("info1", []):
            gid = g.get("game_id", "")
            if gid and gid in seen_game[cid]:
                continue
            # status_id 3 = 試合終了（結果確定）のみ採用。中止・ノーゲーム等(4等)は除外
            if str(g.get("status_id", "")) != "3":
                continue
            wf = g.get("win_flg", "")
            ss, so = str(g.get("score_sum1", "")), str(g.get("score_sum2", ""))
            if wf == "1":
                result = "win"
            elif wf == "2":
                result = "lose"
            elif ss.isdigit() and so.isdigit():
                result = "win" if int(ss) > int(so) else ("lose" if int(ss) < int(so) else "draw")
            else:
                continue  # 勝敗不明はスキップ
            if gid:
                seen_game[cid].add(gid)
            tname = g.get("tournament_name_r", "")
            A["games"].append({
                "game_id": gid,
                "year": g.get("year", ""),
                "date": f"{g.get('game_date_m','')}/{g.get('game_date_d','')}",
                "season": season_of(tname),
                "tournament": tname,
                "round": g.get("round_name", ""),
                "team_name": s["school_name"],
                "opponent": g.get("fighting_school_name", ""),
                "score_self": g.get("score_sum1", ""),
                "score_opp": g.get("score_sum2", ""),
                "result": result,
            })

    print("[3/4] 都道府県ごとの夏の選手権ブラケットから過去全試合を取得 ...")
    slugs = sorted(set(v for v in canon_slug.values() if v))
    for slug in slugs:
        tids = discover_summer_tids(slug)
        for tid, years in tids:
            for year in sorted(years):
                res = curl_json({"command": "game_tour_record",
                                 "year": str(year), "tournament_id": tid})
                if not LAST_FROM_CACHE:
                    time.sleep(0.15)
                if not res or "result" not in res:
                    continue
                R = res["result"]
                tname = R.get("tournament_name", "") or ""
                tclass = R.get("tournament_class", "")
                # 夏の選手権(class=1)のみ対象
                if str(tclass) != "1":
                    continue
                added = 0
                for g in R.get("info", []):
                    n1 = g.get("school_display_name1", "") or ""
                    n2 = g.get("school_display_name2", "") or ""
                    if "高専" not in n1 and "高専" not in n2:
                        continue
                    if "高専" in n1:
                        self_name, opp_name = n1, n2
                        ss, so = g.get("score_sum1", ""), g.get("score_sum2", "")
                    else:
                        self_name, opp_name = n2, n1
                        ss, so = g.get("score_sum2", ""), g.get("score_sum1", "")
                    canon = canonical_for(self_name, slug)
                    if not canon:
                        continue
                    cid = canon[0]
                    gid = g.get("game_id", "")
                    seen_game.setdefault(cid, set())
                    if gid and gid in seen_game[cid]:
                        continue
                    # status_id 3 = 試合終了のみ。中止・ノーゲーム(4等)や未消化は除外
                    if str(g.get("status_id", "")) != "3":
                        continue
                    if not (str(ss).isdigit() and str(so).isdigit()):
                        continue
                    if gid:
                        seen_game[cid].add(gid)
                    A = agg[cid]
                    A["team_names"].add(self_name)
                    si, oi = int(ss), int(so)
                    result = "win" if si > oi else ("lose" if si < oi else "draw")
                    A["games"].append({
                        "game_id": gid,
                        "year": str(g.get("game_date_y", year)),
                        "date": f"{g.get('game_date_m','')}/{g.get('game_date_d','')}",
                        "season": "夏",
                        "tournament": tname,
                        "round": g.get("round_name", ""),
                        "team_name": self_name,
                        "opponent": opp_name,
                        "score_self": ss,
                        "score_opp": so,
                        "result": result,
                    })
                    added += 1
                if added:
                    print(f"    {slug} {year} tid{tid}: +{added} 高専試合")

    print("[4/4] 集計・出力 ...")
    out = {"generated": time.strftime("%Y-%m-%d"), "source": "バーチャル高校野球 (vk.sportsbull.jp)", "schools": []}
    for e in CANONICAL:
        A = agg[e[0]]
        games = A["games"]
        # 確定した試合のみ勝敗集計（status 3 = 試合終了、それ以外も結果あれば含む）
        wins = sum(1 for g in games if g["result"] == "win")
        loses = sum(1 for g in games if g["result"] == "lose")
        # 年で降順、日付で降順ソート
        def sort_key(g):
            try:
                y = int(g["year"])
            except Exception:
                y = 0
            m, d = 0, 0
            try:
                m, d = [int(x) for x in g["date"].split("/")]
            except Exception:
                pass
            return (y, m, d)
        games.sort(key=sort_key, reverse=True)
        out["schools"].append({
            "id": A["id"],
            "name": A["name"],
            "kana": A["kana"],
            "prefecture": A["prefecture"],
            "region": A["region"],
            "slug": CANON_SLUG.get(A["id"], ""),
            "source_ids": sorted(set(A["source_ids"])),
            "live_ids": sorted(A.get("live_ids") or set(A["source_ids"][:1])),
            "team_names": sorted(A["team_names"]),
            "total_games": len(games),
            "wins": wins,
            "loses": loses,
            "games": games,
        })

    (DATA / "kosen_results.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(s["total_games"] for s in out["schools"])
    print(f"完了: {len(out['schools'])} 校 / 延べ {total} 試合 -> data/kosen_results.json")


if __name__ == "__main__":
    main()
