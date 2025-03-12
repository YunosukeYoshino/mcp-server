import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  Collection,
  Channel,
} from "discord.js";

// 環境変数の読み込み
dotenv.config();

// Discordクライアントの初期化
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

// MCP サーバーの初期化
const server = new Server(
  {
    name: "discord-message-fetcher",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツールの一覧を定義
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fetch_recent_messages",
        description: "Fetch recent messages from Discord channels",
        inputSchema: {
          type: "object",
          properties: {
            guildId: {
              type: "string",
              description: "Discord server (guild) ID",
            },
            channelId: {
              type: "string",
              description: "Specific Discord channel ID (optional)",
            },
            messageLimit: {
              type: "number",
              description:
                "Number of recent messages to fetch per channel (default: 30)",
            },
          },
          required: ["guildId"],
        },
      },
    ],
  };
});

// メッセージデータの型定義
interface MessageData {
  channelName: string;
  channelId: string;
  author: string;
  authorId: string;
  content: string;
  timestamp: string;
}

// Discord への接続状態をトラッキングする変数
let discordReady = false;

// メッセージを取得する関数
async function fetchMessages(
  channels: TextChannel[],
  messageLimit: number
): Promise<MessageData[]> {
  const allMessages: MessageData[] = [];

  for (const channel of channels) {
    try {
      if (!(channel instanceof TextChannel)) {
        continue;
      }

      const messages = await channel.messages.fetch({ limit: messageLimit });
      if (messages.size === 0) {
        continue;
      }

      // メッセージの内容を抽出
      const channelMessages = Array.from(messages.values()).map((msg) => ({
        channelName: channel.name,
        channelId: channel.id,
        author: msg.author.username,
        authorId: msg.author.id,
        content: msg.content || "(content unavailable)",
        timestamp: msg.createdAt.toISOString(),
      }));

      allMessages.push(...channelMessages);
    } catch (error) {
      console.error(
        `Error fetching messages from channel ${channel.name}:`,
        error
      );
    }
  }

  // タイムスタンプで新しい順にソート
  return allMessages.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// ツールの実行ハンドラー
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Discordが準備できているか確認
    if (!discordReady) {
      // Discordクライアントのログイン（まだ接続していない場合）
      if (!client.isReady()) {
        try {
          await client.login(process.env.DISCORD_ACCESS_TOKEN);
          discordReady = true;
          if (client.user) {
            console.log(`Logged in as ${client.user.tag}`);
          }
        } catch (loginError: unknown) {
          console.error("Login error:", loginError);
          const errorMessage =
            loginError instanceof Error ? loginError.message : "Unknown error";
          return {
            content: [
              {
                type: "text",
                text:
                  `Discordへのログインに失敗しました: ${errorMessage}\n\n` +
                  `環境変数 DISCORD_ACCESS_TOKEN が正しく設定されているか確認してください。`,
              },
            ],
          };
        }
      }
    }

    if (
      request.params.name === "fetch_recent_messages" &&
      request.params.arguments
    ) {
      const guildId = request.params.arguments.guildId as string;
      const specificChannelId = request.params.arguments.channelId as
        | string
        | undefined;
      const messageLimit =
        (request.params.arguments.messageLimit as number) || 30;

      // サーバー（Guild）の取得
      const guild = await client.guilds.fetch(guildId);
      if (!guild) {
        throw new Error(`Guild with ID ${guildId} not found.`);
      }

      let textChannels: TextChannel[] = [];

      if (specificChannelId) {
        // 特定のチャンネルだけを取得
        const channel = await client.channels.fetch(specificChannelId);
        if (channel && channel instanceof TextChannel) {
          textChannels.push(channel);
        } else {
          return {
            content: [
              {
                type: "text",
                text: `指定されたチャンネル (ID: ${specificChannelId}) が見つからないか、テキストチャンネルではありません。`,
              },
            ],
          };
        }
      } else {
        // すべてのテキストチャンネルを取得
        const channels = await guild.channels.fetch();
        textChannels = Array.from(channels.values()).filter(
          (channel): channel is TextChannel =>
            channel !== null && channel instanceof TextChannel
        );
      }

      if (textChannels.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `サーバー「${guild.name}」に取得可能なテキストチャンネルが見つかりません。`,
            },
          ],
        };
      }

      // メッセージを取得
      const messages = await fetchMessages(textChannels, messageLimit);

      return {
        content: [
          {
            type: "text",
            text: `サーバー「${guild.name}」の ${textChannels.length} チャンネルから ${messages.length} 件のメッセージを取得しました。`,
          },
          {
            type: "text",
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    }

    throw new Error("Tool not found");
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorDetails =
      error instanceof Error
        ? JSON.stringify(error, Object.getOwnPropertyNames(error))
        : "No detailed error information available";

    return {
      content: [
        {
          type: "text",
          text:
            `エラーが発生しました: ${errorMessage}\n\n` +
            `詳細なエラー情報: ${errorDetails}`,
        },
      ],
    };
  }
});

// サーバー起動時のログ
console.log("Discord Message Fetcher Server is starting...");
console.log(
  `Using token: ${
    process.env.DISCORD_ACCESS_TOKEN
      ? "***" + process.env.DISCORD_ACCESS_TOKEN.slice(-5)
      : "not set"
  }`
);

// MCP サーバーの起動
const transport = new StdioServerTransport();
server.connect(transport);
