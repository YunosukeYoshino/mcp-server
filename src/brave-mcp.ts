import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

dotenv.config();

const BRAVE_API_KEY = process.env.BRAVE_API;
if (!BRAVE_API_KEY) {
  throw new Error("環境変数 BRAVE_API_KEY が設定されていません");
}
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

interface SearchResult {
  title: string;
  description: string;
  url: string;
}

// 重要なフレーズを抽出するシンプルな関数（例）
function extractKeyPhrases(text: string): string[] {
  // ここでは、単語の頻度から上位3語を抽出するシンプルな例
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 4);
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([word]) => word);
}

const server = new Server(
  {
    name: "brave-deep-research-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツール一覧のハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "deep-search",
        description:
          "Brave Search APIを使い、深層リサーチ的に検索結果を分析するツール",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            maxResults: { type: "number", default: 10 },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// deep-searchツールのハンドラー
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "deep-search") {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }
    const args = request.params.arguments;
    const query = args.query as string;
    const maxResults = (args.maxResults as number) || 10;

    try {
      // Brave Search APIへリクエスト
      const searchUrl = new URL(BRAVE_SEARCH_URL);
      searchUrl.searchParams.append("q", query);
      searchUrl.searchParams.append("count", maxResults.toString());

      const response = await fetch(searchUrl, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": BRAVE_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Brave Search API error: ${response.status} ${response.statusText}`
        );
      }

      const searchData = await response.json();
      const results: SearchResult[] = searchData.web.results;

      // 検索結果から全テキストを連結
      const allText: string = results
        .map((result: SearchResult) => `${result.title} ${result.description}`)
        .join(" ");

      // シンプルなキーワード頻度によるトピック抽出
      const wordsFrequency = allText
        .toLowerCase()
        .split(/\W+/)
        .filter((word: string) => word.length > 3)
        .reduce((acc: Record<string, number>, word: string) => {
          acc[word] = (acc[word] || 0) + 1;
          return acc;
        }, {});

      const mainTopics = Object.entries(wordsFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word);

      // 追加で、重要なフレーズの抽出
      const keyPhrases = extractKeyPhrases(allText);

      // 深層リサーチ的な分析結果をまとめる
      const analysis = {
        query: query,
        queryTime: new Date().toISOString(),
        totalResults: searchData.web.total || results.length,
        mainTopics: mainTopics,
        keyPhrases: keyPhrases,
        detailedResults: results.map((result: SearchResult) => ({
          title: result.title,
          url: result.url,
          description: result.description,
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    } catch (error) {
      const err = error as Error;
      console.error("Deep Search error:", err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: "Deep Search failed", message: err.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
server.connect(transport);
