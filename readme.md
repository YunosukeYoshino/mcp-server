# MCP Server

このプロジェクトは、[Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) を活用した、拡張ツールサーバーを提供します。Brave Search API、ChatWork API、Discord API、Shopify APIを活用した複数のツールサーバーを実装しています。

## プロジェクトの構成

このプロジェクトは、以下のサーバーで構成されています。

1. **Brave Deep Research Server (`brave-mcp.ts`)**
   * Brave Search API を使用して、指定されたクエリに対する深層的な検索結果を提供します。
   * 検索結果から主要なトピックやキーフレーズを抽出し、分析結果を提供します。

2. **ChatWork API Server (`chatwork-mcp.ts`)**
   * ChatWork APIを使用して、ChatWorkの機能にアクセスします。
   * ルーム一覧の取得、メッセージの取得・送信、タスク管理などの機能を提供します。

3. **Discord Message Fetcher (`discord-mcp.ts`)**
   * Discord APIを使用して、Discordサーバーからメッセージを取得します。
   * 特定のサーバー(Guild)やチャンネルのメッセージを取得し分析できます。

4. **Shopify Sales Analytics Server (`shopify.ts`)**
   * Shopify Admin GraphQL APIを使用して、売上データを分析します。
   * 売上サマリー、商品別売上、売上トレンドなどの情報を提供します。

## 機能

### Brave Deep Research Server (`brave-mcp.ts`)

* **`deep-search` ツール**:
  * **説明**: Brave Search API を使って、与えられたクエリに対する深層的な検索結果を分析します。
  * **入力**:
    * `query`: 検索クエリ（必須）
    * `maxResults`: 取得する検索結果の最大数（デフォルトは 10）
  * **出力**: 検索結果の分析情報（JSON 形式）
    * `query`: 検索クエリ
    * `queryTime`: 検索を実行した時間
    * `totalResults`: 検索結果の総数
    * `mainTopics`: 主要なトピック
    * `keyPhrases`: キーフレーズ
    * `detailedResults`: 詳細な検索結果のリスト
  * **環境変数**:
    * `BRAVE_API`: Brave Search APIのアクセスキー

### ChatWork API Server (`chatwork-mcp.ts`)

* **`get_rooms` ツール**:
  * **説明**: ChatWorkのルーム一覧を取得します。
  * **入力**:
    * `api_token`: ChatWork APIトークン（オプション、省略時は環境変数を使用）
  * **出力**: ChatWorkのルーム一覧（JSON形式）

* **`get_room_messages` ツール**:
  * **説明**: 特定のChatWorkルームのメッセージを取得します。
  * **入力**:
    * `api_token`: ChatWork APIトークン（オプション）
    * `room_id`: ルームID（必須）
    * `force`: 強制的に取得するかどうか（boolean、オプション）
  * **出力**: 指定されたルームのメッセージ一覧（JSON形式）

* **`send_message` ツール**:
  * **説明**: ChatWorkのルームにメッセージを送信します。
  * **入力**:
    * `api_token`: ChatWork APIトークン（オプション）
    * `room_id`: ルームID（必須）
    * `message`: 送信するメッセージ内容（必須）
  * **出力**: 送信結果と生成されたメッセージID

* **`get_room_tasks` ツール**:
  * **説明**: ChatWorkルームのタスク一覧を取得します。
  * **入力**:
    * `api_token`: ChatWork APIトークン（オプション）
    * `room_id`: ルームID（必須）
    * `status`: タスクのステータス（"open"または"done"、デフォルトは"open"）
  * **出力**: 指定されたルームのタスク一覧（JSON形式）

* **環境変数**:
  * `CHATWORK_API`: ChatWork APIのアクセストークン

### Discord Message Fetcher (`discord-mcp.ts`)

* **`fetch_recent_messages` ツール**:
  * **説明**: Discordサーバー（Guild）からメッセージを取得します。
  * **入力**:
    * `guildId`: Discordサーバー（Guild）のID（必須）
    * `channelId`: 特定のチャンネルID（オプション）
    * `messageLimit`: 取得するメッセージの最大数（オプション、デフォルトは30）
  * **出力**:
    * 取得したメッセージの数と内容（JSON形式）
    * 各メッセージにはチャンネル名、チャンネルID、投稿者名、投稿者ID、投稿内容、タイムスタンプが含まれます
  * **環境変数**:
    * `DISCORD_ACCESS_TOKEN`: Discord APIのアクセストークン

### Shopify Sales Analytics Server (`shopify.ts`)

* **`get_sales_summary` ツール**:
  * **説明**: 特定の期間の売上データのサマリーを取得します。
  * **入力**:
    * `startDate`: 開始日（ISO形式：YYYY-MM-DD）（必須）
    * `endDate`: 終了日（ISO形式：YYYY-MM-DD）（必須）
    * `currencyCode`: 通貨コードでフィルタリング（例：USD）（オプション）
  * **出力**: 売上サマリー情報（JSON形式）
    * 総注文数
    * 総売上額
    * 平均注文金額
    * 割引総額
    * 配送料総額
    * 税金総額

* **`get_sales_by_product` ツール**:
  * **説明**: 商品別にグループ化された売上データを取得します。
  * **入力**:
    * `startDate`: 開始日（ISO形式：YYYY-MM-DD）（必須）
    * `endDate`: 終了日（ISO形式：YYYY-MM-DD）（必須）
    * `limit`: 取得する商品数（デフォルトは10）（オプション）
  * **出力**: 商品別の売上データ（JSON形式）
    * 商品ID
    * 商品名
    * 販売数量
    * 売上額
    * 平均販売価格

* **`get_sales_trends` ツール**:
  * **説明**: 時間経過による売上トレンドを取得します（日次、週次、または月次）。
  * **入力**:
    * `startDate`: 開始日（ISO形式：YYYY-MM-DD）（必須）
    * `endDate`: 終了日（ISO形式：YYYY-MM-DD）（必須）
    * `interval`: 集計間隔（"daily"、"weekly"、"monthly"）（必須）
  * **出力**: 期間ごとの売上トレンドデータ（JSON形式）
    * 期間（日付または期間範囲）
    * 注文数
    * 売上額
    * 平均注文金額

* **環境変数**:
  * `SHOPIFY_SHOP_DOMAIN`: Shopifyショップのドメイン
  * `SHOPIFY_ACCESS_TOKEN`: Shopify Admin APIのアクセストークン
  * `SHOPIFY_API_VERSION`: Shopify APIのバージョン（デフォルトは2024-07）

## Claudeとの連携

以下の設定例を使用して、Claudeとこれらのサーバーを連携できます。

```json
{
  "mcpServers": {
    "brave-deep-research-server": {
      "command": "node",
      "args": [
        "/path/to/mcp-server/dist/brave-mcp.js"
      ],
      "env": {
        "BRAVE_API": "your_brave_api_key"
      }
    },
    "chatwork-api-server": {
      "command": "node",
      "args": [
        "/path/to/mcp-server/dist/chatwork-mcp.js"
      ],
      "env": {
        "CHATWORK_API": "your_chatwork_api_token"
      }
    },
    "discord-message-fetcher": {
      "command": "node",
      "args": [
        "/path/to/mcp-server/dist/discord-mcp.js"
      ],
      "env": {
        "DISCORD_ACCESS_TOKEN": "your_discord_token"
      }
    },
    "shopify-sales-analytics": {
      "command": "node",
      "args": [
        "/path/to/mcp-server/dist/shopify.js"
      ],
      "env": {
        "SHOPIFY_SHOP_DOMAIN": "your-shop.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "your_shopify_access_token",
        "SHOPIFY_API_VERSION": "2024-07"
      }
    },
    "ga4-analysis": {
      "command": "bun",
      "args": ["run", "src/ga4.ts"], // Adjust if you have a build step or use node
      "cwd": "/Users/yoshinoyunosuke/Desktop/playground/ai/mcp-server", // Ensure this is the correct path to your project
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/your/service-account-key.json" // Replace with the actual path to your key file
      },
      "disabled": false, // Ensure it's enabled
      "autoApprove": []
    }
  }
}
```

## セットアップと実行方法

1. リポジトリをクローンします
   ```bash
   git clone https://github.com/yourusername/mcp-server.git
   cd mcp-server
   ```

2. 依存パッケージをインストールします
   ```bash
   npm install
   ```

3. 環境変数を設定します
   ```bash
   cp .env.example .env
   # .envファイルを編集し、必要なAPIキーを設定
   ```

4. TypeScriptをコンパイルします
   ```bash
   npm run build
   ```

5. サーバーを実行します
   ```bash
   node dist/brave-mcp.js  # Brave検索サーバー
   node dist/chatwork-mcp.js  # ChatWorkサーバー
   node dist/discord-mcp.js  # Discordサーバー
   node dist/shopify.js  # Shopify売上分析サーバー
   ```

## 注意事項

* 各APIの利用にはそれぞれのサービスのアカウントとAPIキー/トークンが必要です
* APIの利用制限や規約に従って使用してください
* Discord APIの使用には適切な権限設定が必要です
