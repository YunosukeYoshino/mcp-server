# MCP Server

このプロジェクトは、[Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) を活用した、拡張ツールサーバーを提供します。現在は、`brave-mcp.js` のみが実装されており、Brave Search API を利用した深層リサーチツールを提供します。

## プロジェクトの構成

このプロジェクトは、以下のサーバーで構成されています。

1.  **Brave Deep Research Server (`brave-mcp.js`)**
    *   Brave Search API を使用して、指定されたクエリに対する深層的な検索結果を提供します。
    *   検索結果から主要なトピックやキーフレーズを抽出し、分析結果を提供します。

## 機能

### Brave Deep Research Server (`brave-mcp.js`)

*   **`deep-search` ツール**:
    *   **説明**: Brave Search API を使って、与えられたクエリに対する深層的な検索結果を分析します。
    *   **入力**:
        *   `query`: 検索クエリ（必須）
        *   `maxResults`: 取得する検索結果の最大数（デフォルトは 10）
    *   **出力**: 検索結果の分析情報（JSON 形式）
        *   `query`: 検索クエリ
        *   `queryTime`: 検索を実行した時間
        *   `totalResults`: 検索結果の総数
        *   `mainTopics`: 主要なトピック
        *   `keyPhrases`: キーフレーズ
        *   `detailedResults`: 詳細な検索結果のリスト
    *   **制限:**
        *   Brave Search API のレート制限に従います。
        *   `maxResults` で指定できる最大の検索結果数は API の制限に依存します。
    *   **エラー処理:**
        *   API リクエストが失敗した場合、エラーメッセージ（`error` と `message` を含むオブジェクト）が返されます。
        *   不正な `query` が入力された場合、検索結果は空になる可能性があります。
        * Brave Search APIの検索結果がなかった場合、その旨が返されます。
    *   **アクセス方法 (例)**:
        ```bash
        curl -X POST -H "Content-Type: application/json" -d '{"query": "open source AI", "maxResults": 5}' http://localhost:3000/deep-search
        ```
    *   **レスポンス例**:
        ```json
        {
            "query": "open source AI",
            "queryTime": "2024-05-16T05:00:00.000Z",
            "totalResults": 1000,
            "mainTopics": ["ai", "open source", "machine learning", "software", "development"],
            "keyPhrases": ["large language models", "ai ethics", "open source communities"],
            "detailedResults": [
                {
                    "title": "Open Source AI: An Overview",
                    "url": "https://example.com/open-source-ai",
                    "description": "An introduction to the world of open source AI."
                },
                // ... more results
            ]
        }
        ```
    * **エラーレスポンス例**
        ``` json
        {
            "error": "Deep Search failed",
            "message": "Brave Search API error: 429 Too Many Requests"
        }
        ```



## Claudeとの連携
```json

{
  "mcpServers": {
    "brave-deep-research-server": {
      "command": "node",
      "args": [
        "/hogehoge/mcp-server/dist/brave-mcp.js"
      ],
      "env": {
        "BRAVE_API": "your_brave_api_key"
      }
    }
  }
}

```
