# タイトル

GitHub Copilot ProのAI Creditsを契約更新日ベースで集計するスクリプト

# 概要

GitHub Copilotの個人プラン（「Pro」と「Pro＋」が対象）において、
AIC（AIクレジット）の消費量を参照すると、
「契約サイクル期間に依存せず、（少なくとも2026年7月5日時点では）月初起点の累積消費量のみが表示される」状態にある。
なので、「自身の契約サイクルに応じた、累積消費量を取得するスクリプト」を作成した。

なお、生成AIに（それこそGitHub Copilotに）「自身の契約サイクルに応じた、AIC消費量を取得するスクリプトを作って」と言えば出力される内容ではある（実際、そうやったｗ）。

## 対象のGitHub Copilotのプラン

* GitHub Copilot Pro
* GitHub Copilot Proプラス

## 現時点での、AICの表示状況の整理（GUI側）

現在確認できる表示箇所は次の2か所。

* VS CodeなどIDE上のCopilotステータス
* GitHub.comの個人アカウントの「設定＞Billing and licensing ＞ AI usage ＞ Included credits」欄

どちらも月初起点の累積消費量が表示される（起点＆リセットは月初が前提）。

注意する必要があるのは、「個人プランの契約でのIncluded Creditsの付与タイミングは月初ではなく、契約日。リセット日も同様」ってこと。
したがって、上記で表示される「累積消費量」と実際の値は異なる、という事態が発生する。

### 具体的な状況

契約更新日が15日だとする。
7/5に消費量を確認すると、GUIでは「7/1〜7/5」での消費量しか表示されない。
しかし実際に残りクレジットを知るには、「6/15〜7/5」の消費量が必要。

* Copilotステータスでの表示：消費量の累計 200 AIC / 1500 AIC
* 契約日起点での消費量の累計：800 AIC / 1500 AIC
    * 契約日が15日で、先月のうちに600AIC消費済み。600+200=800。

## 対処方法

GUI側は、「月初起点」での表示しかなく、またAPIでも「年単位、（月初起点の）月単位、日単位」での集計しか取得できない。

契約更新日を起点とした期間集計は取得できないため、
APIを用いて日単位データを取得してローカルで合計する必要がある。


## 「Pro」と「Pro＋」プラン向け、契約サイクルに応じたAIC消費量を取得するスクリプト

[aic_usage_cycle_report_4_personalplan_cached.py](./aic_usage_cycle_report_4_personalplan_cached.py)

### 事前準備

* Classic PAT (Personal Access Token)を作成する
    * Select scopesは「`user: Update ALL user data`」を設定
* 自身の契約のリセット日（契約更新日）を確認する
    * GitHub.comの個人アカウントの「設定＞Billing and licensing ＞ Licensing ＞ Current Copilot plan ＞ Next payment」欄の日付
    * 「Jul 12, 2026」なら、「12日」。


### 使い方

1. 環境変数「GITHUB_TOKEN」にPATを設定
2. 環境変数「GITHUB_USERNAME」にGitHubの個人ユーザー名を設定
3. 環境変数「GITHUB_CYCLE_DAY」に 契約更新日（1-31）を設定
4. 次のコマンドで呼び出す。

```
python -m aic_usage_cycle_report_4_personalplan_cached
```

#### 出力例：

```
................... 完了

=============================================
【GitHub Copilot 契約サイクル別 AIC消費状況】
現在の集計サイクル : 2026-06-12 ～ 2026-07-05
サイクル内消費量   : 1131 AIC
無償枠に対する使用 : 75.40% (1131 / 1500)
100%消費に達する予測日 : 2026-07-XX
=============================================
```

※「予測値」は現在までの消費ペースを単純線形で予測した値を表示している。

以上ー。


## GitHub公式の情報源など

* 個人ユーザー単位での、AICクレジットの消費量の取得API
    * https://docs.github.com/en/rest/billing/usage?apiVersion=2026-03-10#get-billing-ai-credit-usage-report-for-a-user

注意事項：

必要な権限として以下の記載があるが、
2026年7月5日時点では、
ドキュメントの記載どおりのFine-grained PATでは認証できず、
Classic PATでのみ動作を確認した。

```
Fine-grained personal access tokens
The fine-grained token must have the following permission set:

"Plan" user permissions (read)
```

Classic PAT（Personal Access Token）で設定する権限は以下。

```
user: Update ALL user data
```

参考までに、curlでの実行サンプルを転記。

```
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/users/USERNAME/settings/billing/ai_credit/usage
```


