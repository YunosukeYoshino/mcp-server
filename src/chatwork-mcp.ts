import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as dotenv from "dotenv";

// 環境変数を読み込む
dotenv.config();

// Chat Workサーバー
const server = new Server(
  {
    name: "chatwork-api-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// デフォルトのAPIトークンを環境変数から取得
const DEFAULT_API_TOKEN = process.env.CHATWORK_API || "";

// ツールの定義
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_rooms",
        description: "Chat Workのルーム一覧を取得します",
        inputSchema: {
          type: "object",
          properties: {
            api_token: {
              type: "string",
              description:
                "指定しない場合は環境変数のCHATWORK_APIが使用されます",
            },
          },
        },
      },
      {
        name: "get_room_messages",
        description: "特定のChat Workルームのメッセージを取得します",
        inputSchema: {
          type: "object",
          properties: {
            api_token: {
              type: "string",
              description:
                "指定しない場合は環境変数のCHATWORK_APIが使用されます",
            },
            room_id: { type: "string" },
            force: { type: "boolean" },
          },
          required: ["room_id"],
        },
      },
      {
        name: "send_message",
        description: "Chat Workのルームにメッセージを送信します",
        inputSchema: {
          type: "object",
          properties: {
            api_token: {
              type: "string",
              description:
                "指定しない場合は環境変数のCHATWORK_APIが使用されます",
            },
            room_id: { type: "string" },
            message: { type: "string" },
          },
          required: ["room_id", "message"],
        },
      },
      {
        name: "get_room_tasks",
        description: "Chat Workルームのタスク一覧を取得します",
        inputSchema: {
          type: "object",
          properties: {
            api_token: {
              type: "string",
              description:
                "指定しない場合は環境変数のCHATWORK_APIが使用されます",
            },
            room_id: { type: "string" },
            status: {
              type: "string",
              enum: ["open", "done"],
              default: "open",
            },
          },
          required: ["room_id"],
        },
      },
    ],
  };
});

// Chat Work APIのベースURL
const API_BASE_URL = "https://api.chatwork.com/v2";

// ツール実行処理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // argsがundefinedの場合に備えて、初期値として空オブジェクトを設定
  const { name, arguments: args = {} } = request.params;

  try {
    // 環境変数からAPIトークンを取得するか、引数で上書き
    const apiToken = (args.api_token as string) || DEFAULT_API_TOKEN;

    if (!apiToken) {
      return {
        content: [
          {
            type: "text",
            text: "APIトークンが指定されていません。引数でapi_tokenを指定するか、環境変数CHATWORK_APIを設定してください。",
          },
        ],
      };
    }

    switch (name) {
      case "get_rooms": {
        const response = await axios.get(`${API_BASE_URL}/rooms`, {
          headers: {
            "X-ChatWorkToken": apiToken,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Chat Workルーム一覧:\n${JSON.stringify(
                response.data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      case "get_room_messages": {
        const room_id = args.room_id as string;
        const force = (args.force as boolean) || false;

        const response = await axios.get(
          `${API_BASE_URL}/rooms/${room_id}/messages`,
          {
            headers: {
              "X-ChatWorkToken": apiToken,
            },
            params: {
              force: force ? 1 : 0,
            },
          }
        );

        return {
          content: [
            {
              type: "text",
              text: `ルームID ${room_id} のメッセージ:\n${JSON.stringify(
                response.data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      case "send_message": {
        const room_id = args.room_id as string;
        const message = args.message as string;

        const response = await axios.post(
          `${API_BASE_URL}/rooms/${room_id}/messages`,
          { body: message },
          {
            headers: {
              "X-ChatWorkToken": apiToken,
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        return {
          content: [
            {
              type: "text",
              text: `メッセージを送信しました。メッセージID: ${response.data.message_id}`,
            },
          ],
        };
      }

      case "get_room_tasks": {
        const room_id = args.room_id as string;
        const status = (args.status as string) || "open";

        const response = await axios.get(
          `${API_BASE_URL}/rooms/${room_id}/tasks`,
          {
            headers: {
              "X-ChatWorkToken": apiToken,
            },
            params: {
              status: status,
            },
          }
        );

        return {
          content: [
            {
              type: "text",
              text: `ルームID ${room_id} のタスク一覧 (${status}):\n${JSON.stringify(
                response.data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      default:
        throw new Error(`ツール "${name}" は見つかりませんでした`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        content: [
          {
            type: "text",
            text: `エラーが発生しました: ${
              error.response?.status || "Unknown"
            } - ${JSON.stringify(error.response?.data || error.message)}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `エラーが発生しました: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
});

// サーバー起動
const transport = new StdioServerTransport();
server.connect(transport);
