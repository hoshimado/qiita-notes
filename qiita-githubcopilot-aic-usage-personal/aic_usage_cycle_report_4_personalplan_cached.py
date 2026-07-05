
#!/usr/bin/env python3
import os, json, sys, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta
import calendar, sqlite3

# ==================== 設定エリア ====================
API_BASE = "https://api.github.com"
API_VERSION = "2026-03-10"
CREDIT_LIMIT = 1500  # 自身のプランのIncluded Creditsに合わせて変更

DB_FILE="cache/copilot_usage.db"

# ※以下の値を環境変数に設定すること
# GITHUB_TOKEN : GitHubのPersonal Access Token
# GITHUB_USERNAME : GitHubのユーザー名
# GITHUB_CYCLE_DAY : 契約更新日（1-31）
# ====================================================


class UsageError(Exception): pass

def init_db(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS daily_usage(
      usage_date TEXT PRIMARY KEY,
      aic INTEGER NOT NULL,
      updated_at TEXT NOT NULL)""")
    conn.commit()

def cache_get(conn,d):
    r=conn.execute("SELECT aic FROM daily_usage WHERE usage_date=?",(d.isoformat(),)).fetchone()
    return None if r is None else int(r[0])

def cache_put(conn,d,aic):
    conn.execute("INSERT OR REPLACE INTO daily_usage VALUES(?,?,?)",
                 (d.isoformat(),int(aic),datetime.now().isoformat()))
    conn.commit()

def gh_get(path,token,query=None):
    url=API_BASE+path+("?" + urllib.parse.urlencode(query) if query else "")
    req=urllib.request.Request(url)
    req.add_header("Accept","application/vnd.github+json")
    req.add_header("Authorization",f"Bearer {token}")
    req.add_header("X-GitHub-Api-Version",API_VERSION)
    with urllib.request.urlopen(req,timeout=60) as r:
        return json.loads(r.read().decode())

def api_daily(token:str, username:str, d):
    q={"year":str(d.year),"month":f"{d.month:02d}","day":f"{d.day:02d}"}
    data=gh_get(f"/users/{username}/settings/billing/ai_credit/usage",token,q)
    return sum(x.get("grossQuantity",0) for x in data.get("usageItems",[]))

def daily(conn, token:str, username:str, d,today):
    if d.date()!=today.date():
        c=cache_get(conn,d.date())
        if c is not None:
            return c
    try:
        a=api_daily(token, username, d)
        cache_put(conn,d.date(),a)
        return a
    except Exception:
        c=cache_get(conn,d.date())
        if c is not None:
            print(f"Using cache for {d.date()}",file=sys.stderr)
            return c
        raise

def main():
    # 0. 環境変数からユーザー固有設定とトークンを取得
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("Error: 環境変数 'GITHUB_TOKEN' が設定されていません。", file=sys.stderr)
        print("set GITHUB_TOKEN='your_pat_here' を実行してください。", file=sys.stderr)
        sys.exit(1)
    username = os.environ.get("GITHUB_USERNAME")
    if not username:
        print("Error: 環境変数 'GITHUB_USERNAME' が設定されていません。", file=sys.stderr)
        print("set GITHUB_USERNAME='your_username_here' を実行してください。", file=sys.stderr)
        sys.exit(1)
    cycle_day_str = os.environ.get("GITHUB_CYCLE_DAY", "1")
    try:
        CYCLE_DAY = int(cycle_day_str)
        if not (1 <= CYCLE_DAY <= 31):
            raise ValueError
    except ValueError:
        print("Error: 環境変数 'GITHUB_CYCLE_DAY' は1から31の整数で指定してください。", file=sys.stderr)
        sys.exit(1)

    # 1. SQLiteデータベースの初期化
    os.makedirs("cache", exist_ok=True)
    conn=sqlite3.connect(DB_FILE)
    init_db(conn)

    # 2. 今回の契約サイクルの「開始日」を算出
    today=datetime.now()
    if today.day>=CYCLE_DAY:
        start_date=datetime(today.year,today.month,CYCLE_DAY)
    else:
        prev=(datetime(today.year,today.month,1)-timedelta(days=1))
        start_date=datetime(prev.year,prev.month,min(CYCLE_DAY,calendar.monthrange(prev.year,prev.month)[1]))

    # 3. 開始日から今日まで、1日ずつクエリを発行して合算
    total_aic_used=0
    d=start_date
    while d<=today:
        # 進行状況がわかりやすいようドットを出力（不要なら削除してください）
        print(".", end="", flush=True)

        total_aic_used+=daily(conn,token,username,d,today)
        d+=timedelta(days=1)

    print(" 完了")

    # 4. パーセンテージの計算と結果出力
    percentage = total_aic_used/CREDIT_LIMIT*100

    # 5. 現時点までの1日当たりのAIC使用ペースで、100％消費に達する日付を算出
    if total_aic_used > 0:
        days_elapsed = (today - start_date).days + 1  # 開始日を含む
        daily_average = total_aic_used / days_elapsed
        if daily_average > 0:
            days_to_reach_limit = CREDIT_LIMIT / daily_average
            projected_date = start_date + timedelta(days=days_to_reach_limit)
            projected_date_str = projected_date.strftime('%Y-%m-%d')
        else:
            projected_date_str = "計算不可（消費量がゼロ）"
    else:
        projected_date_str = "計算不可（消費量がゼロ）"
    
    print("\n" + "=" * 45)
    print("【GitHub Copilot 契約サイクル別 AIC消費状況】")
    print(f"現在の集計サイクル : {start_date.strftime('%Y-%m-%d')} ～ {today.strftime('%Y-%m-%d')}")
    print(f"サイクル内消費量   : {total_aic_used} AIC")
    print(f"無償枠に対する使用 : {percentage:.2f}% ({total_aic_used} / {CREDIT_LIMIT})")
    print(f"100%消費に達する予測日 : {projected_date_str}")
    print("=" * 45)

if __name__=="__main__":
    main()
