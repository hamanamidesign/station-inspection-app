# Adobe PDF Services 無料枠の設定

## 1. 無料資格情報を取得

Adobe Acrobat Services の開発者ページから PDF Services API の無料資格情報を作成します。

- https://developer.adobe.com/document-services/
- Free Tier: 毎月 500 Document Transactions

発行された次の2つを控えます。

- Client ID
- Client Secret

## 2. GASへ安全に保存

Google Apps Scriptの対象プロジェクトを開き、左側の「プロジェクトの設定」から
「スクリプト プロパティ」に次の2項目を追加します。

| プロパティ | 値 |
|---|---|
| `ADOBE_PDF_SERVICES_CLIENT_ID` | Adobeで発行されたClient ID |
| `ADOBE_PDF_SERVICES_CLIENT_SECRET` | Adobeで発行されたClient Secret |

Client SecretはソースコードやGitHubへ書かないでください。

## 3. GASを更新

GAS上の次の2ファイルをリポジトリの最新版へ置き換えます。

- `コード.gs`
- `pdf_export.gs`

「デプロイを管理」から既存デプロイを編集し、「新バージョン」で再デプロイします。
ウェブアプリURLは変更しません。

## 4. 動作

「すべての資料を結合（Adobe）」を押すと、次の順序で結合します。

1. `00.` 表紙
2. `01.` 写真カルテ番号位置図
3. `03.` 施設点検報告書
4. `03-1.` 写真カルテ
5. `04.` 傾斜表
6. `04-1.` 傾斜測定カルテ

完成ファイルは `現場名_年度_報告書.pdf` として、選択中の年度点検資料フォルダへ保存されます。
同名ファイルがある場合はファイルIDと保存場所を維持したまま上書きします。

## 制限

- 一度に20ファイルまで
- GAS経由の安定動作のため結合元合計45MBまで
- 超過時は画面の「Acrobatで高速結合（推奨）」を使用

