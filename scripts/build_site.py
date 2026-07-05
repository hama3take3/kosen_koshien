#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kosen_results.json と alumni.json を統合して assets/data.js を生成する。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

results = json.loads((DATA / "kosen_results.json").read_text(encoding="utf-8"))
alumni = json.loads((DATA / "alumni.json").read_text(encoding="utf-8"))

SEASON_ORDER = {"夏": 0, "春": 1, "秋": 2, "その他": 3}


def game_sort_key(g):
    try:
        y = int(g.get("year") or 0)
    except Exception:
        y = 0
    s = SEASON_ORDER.get(g.get("season", "その他"), 3)
    m, d = 0, 0
    try:
        parts = (g.get("date") or "").split("/")
        m = int(parts[0]); d = int(parts[1])
    except Exception:
        pass
    # 年 降順, 季節(夏→春→秋), 日付 降順
    return (-y, s, -m, -d)


matched = 0
for s in results["schools"]:
    al = alumni.get(s["name"], [])
    if al:
        matched += 1
    s["alumni"] = al
    s["games"].sort(key=game_sort_key)
    # 勝敗を games から再集計（引き分けは除外）
    s["wins"] = sum(1 for g in s["games"] if g.get("result") == "win")
    s["loses"] = sum(1 for g in s["games"] if g.get("result") == "lose")
    s["total_games"] = len(s["games"])

# 未マッチのalumniキーを警告
school_names = {s["name"] for s in results["schools"]}
for k in alumni:
    if k not in school_names:
        print(f"  ! alumni key unmatched: {k}")

out = "window.KOSEN_DATA = " + json.dumps(results, ensure_ascii=False) + ";\n"
(ROOT / "assets" / "data.js").write_text(out, encoding="utf-8")

total_games = sum(len(s["games"]) for s in results["schools"])
total_alumni = sum(len(s["alumni"]) for s in results["schools"])
print(f"schools={len(results['schools'])}  games={total_games}  "
      f"alumni={total_alumni}  schools_with_alumni={matched}")
print("wrote assets/data.js")


# ---------------------------------------------------------------------------
# 単一HTML(site.html)を生成 — 外部参照なしで単体でも閲覧・共有できる版
# ---------------------------------------------------------------------------
import re

html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")
app = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")

body = html.split("<body>", 1)[1].split("</body>", 1)[0]
body = re.sub(r'<script src="assets/[^"]+"></script>\s*', "", body)

bundle = (
    '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    "<title>高専野球アーカイブ｜全国高専の試合結果</title>\n"
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' '
    "viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9A%BE%3C/text%3E%3C/svg%3E\">\n"
    f"<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n"
    f"<script>\n{out}</script>\n<script>\n{app}\n</script>\n</body>\n</html>\n"
)
(ROOT / "site.html").write_text(bundle, encoding="utf-8")
print("wrote site.html (self-contained bundle)")
