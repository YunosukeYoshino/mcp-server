import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Shopify API 設定
interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
}

// 環境変数から設定を読み取る
const ENV_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const ENV_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ENV_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-07"; // デフォルトは最新バージョン

// Shopify API 設定を環境変数から初期化
let shopifyConfig: ShopifyConfig | null = null;

// 環境変数に必要な値がすべて含まれている場合、自動的に設定
if (ENV_SHOP_DOMAIN && ENV_ACCESS_TOKEN) {
  console.log(`Shopify client auto-configured for shop: ${ENV_SHOP_DOMAIN} with API version: ${ENV_API_VERSION}`);
  shopifyConfig = {
    shopDomain: ENV_SHOP_DOMAIN,
    accessToken: ENV_ACCESS_TOKEN,
    apiVersion: ENV_API_VERSION,
  };
}

// MCP サーバーの初期化
const server = new Server(
  {
    name: "shopify-sales-analytics-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Shopify Admin API に対して GraphQL クエリを実行するヘルパー関数
async function executeShopifyGraphQL(query: string, variables: any = {}) {
  if (!shopifyConfig) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Shopify configuration not set. Please set SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN, and SHOPIFY_API_VERSION environment variables."
    );
  }

  const { shopDomain, accessToken, apiVersion } = shopifyConfig;
  const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  try {
    const response = await axios({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      data: JSON.stringify({
        query,
        variables,
      }),
    });

    if (response.data.errors) {
      throw new McpError(
        ErrorCode.InternalError,
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`
      );
    }

    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new McpError(
        ErrorCode.InternalError,
        `Shopify API Error: ${error.message}. Status: ${
          error.response?.status
        }. Data: ${JSON.stringify(error.response?.data)}`
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing Shopify GraphQL: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// 利用可能なツールを定義
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_sales_summary",
        description: "特定の期間の売上データのサマリーを取得",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in ISO format (YYYY-MM-DD)",
            },
            endDate: {
              type: "string",
              description: "End date in ISO format (YYYY-MM-DD)",
            },
            currencyCode: {
              type: "string",
              description: "Filter by currency code (e.g., USD)",
            },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "get_sales_by_product",
        description: "商品別にグループ化された売上データを取得",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in ISO format (YYYY-MM-DD)",
            },
            endDate: {
              type: "string",
              description: "End date in ISO format (YYYY-MM-DD)",
            },
            limit: {
              type: "number",
              description: "Number of products to return (default: 10)",
            },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "get_sales_trends",
        description:
          "時間経過による売上トレンドを取得（日次、週次、または月次）",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in ISO format (YYYY-MM-DD)",
            },
            endDate: {
              type: "string",
              description: "End date in ISO format (YYYY-MM-DD)",
            },
            interval: {
              type: "string",
              description:
                "Time interval for grouping (daily, weekly, monthly)",
              enum: ["daily", "weekly", "monthly"],
            },
          },
          required: ["startDate", "endDate", "interval"],
        },
      },
    ],
  };
});

// ツール呼び出しの処理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments as any;

  try {
    // setup_shopify_client toolは削除 - 環境変数から自動的に構成されるようになりました

    // Shopify クライアントが設定されているか確認
    if (!shopifyConfig) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Shopify client not configured. Please set SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN, and SHOPIFY_API_VERSION environment variables."
      );
    }

    // 売上サマリーの取得
    if (toolName === "get_sales_summary") {
      const { startDate, endDate, currencyCode } = args;

      if (!startDate || !endDate) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "startDate and endDate are required for get_sales_summary."
        );
      }

      // 顧客情報を含まないように注文データのみを取得するクエリ
      const query = `
        query GetOrdersForSalesSummary($query: String!, $first: Int!) {
          orders(query: $query, first: $first) {
            edges {
              node {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                subtotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalDiscountsSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalShippingPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                # ステータスフィールドを削除しておきます
                # 顧客情報は含まないようにしています
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      // クエリフィルターの構築
      let queryFilter = `created_at:>=${startDate} created_at:<=${endDate} status:any`;
      if (currencyCode) {
        queryFilter += ` currency:${currencyCode}`;
      }

      // ページネーションを使用して全注文を取得するクエリを実行
      let hasNextPage = true;
      let endCursor = null;
      let allOrders: any[] = [];

      while (hasNextPage) {
        const variables = {
          query: queryFilter,
          first: 100, // Fetch 100 orders at a time
          after: endCursor,
        };

        const data = await executeShopifyGraphQL(query, variables);
        const orders = data.orders.edges.map((edge: any) => edge.node);
        allOrders = [...allOrders, ...orders];

        hasNextPage = data.orders.pageInfo.hasNextPage;
        endCursor = data.orders.pageInfo.endCursor;

        // レート制限を避けるため、現時点では最初のページのみ取得
        // 本番環境では、レート制限を考慮した適切なページネーションを実装すること
        break;
      }

      // サマリーメトリクスの計算
      const summary = {
        totalOrders: allOrders.length,
        totalSales: 0,
        averageOrderValue: 0,
        totalDiscounts: 0,
        totalShipping: 0,
        totalTax: 0,
        salesByCurrency: {} as Record<string, number>,
        salesByStatus: {} as Record<string, number>,
      };

      allOrders.forEach((order) => {
        const totalPrice = parseFloat(order.totalPriceSet.shopMoney.amount);
        const currencyCode = order.totalPriceSet.shopMoney.currencyCode;
        const discounts = parseFloat(order.totalDiscountsSet.shopMoney.amount);
        const shipping = parseFloat(
          order.totalShippingPriceSet.shopMoney.amount
        );
        const tax = parseFloat(order.totalTaxSet.shopMoney.amount);
        // ステータスフィールドは使用しないようにします

        summary.totalSales += totalPrice;
        summary.totalDiscounts += discounts;
        summary.totalShipping += shipping;
        summary.totalTax += tax;

        // 通貨ごとにグループ化
        if (!summary.salesByCurrency[currencyCode]) {
          summary.salesByCurrency[currencyCode] = 0;
        }
        summary.salesByCurrency[currencyCode] += totalPrice;

        // ステータス別の売上を記録しないように修正
        // すべて「その他」に分類
        if (!summary.salesByStatus['other']) {
          summary.salesByStatus['other'] = 0;
        }
        summary.salesByStatus['other'] += totalPrice;
      });

      // 平均注文金額の計算
      summary.averageOrderValue =
        summary.totalOrders > 0 ? summary.totalSales / summary.totalOrders : 0;

      // 読みやすさのために数値をフォーマット
      const formattedSummary = {
        ...summary,
        totalSales: summary.totalSales.toFixed(2),
        averageOrderValue: summary.averageOrderValue.toFixed(2),
        totalDiscounts: summary.totalDiscounts.toFixed(2),
        totalShipping: summary.totalShipping.toFixed(2),
        totalTax: summary.totalTax.toFixed(2),
        salesByCurrency: Object.entries(summary.salesByCurrency).reduce(
          (acc, [currency, amount]) => {
            acc[currency] = parseFloat(amount.toFixed(2));
            return acc;
          },
          {} as Record<string, number>
        ),
        salesByStatus: Object.entries(summary.salesByStatus).reduce(
          (acc, [status, amount]) => {
            acc[status] = parseFloat(amount.toFixed(2));
            return acc;
          },
          {} as Record<string, number>
        ),
      };

      return {
        content: [
          {
            type: "text",
            text: `Sales Summary (${startDate} to ${endDate}):\n${JSON.stringify(
              formattedSummary,
              null,
              2
            )}`,
          },
        ],
      };
    }

    // 商品別の売上データ取得
    if (toolName === "get_sales_by_product") {
      const { startDate, endDate, limit = 10 } = args;

      if (!startDate || !endDate) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "startDate and endDate are required for get_sales_by_product."
        );
      }

      // まず、日付範囲内の注文を取得
      // 商品別売上データ取得用クエリ - 顧客情報は含まない
      const ordersQuery = `
        query GetOrdersForProductSales($query: String!, $first: Int!) {
          orders(query: $query, first: $first) {
            edges {
              node {
                id
                name
                createdAt
                lineItems(first: 50) {
                  edges {
                    node {
                      name
                      title
                      quantity
                      originalTotalSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                      product {
                        id
                        title
                      }
                      sku
                      variant {
                        id
                        title
                        sku
                      }
                    }
                  }
                }
                # 顧客情報は含まないようにしています
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const queryFilter = `created_at:>=${startDate} created_at:<=${endDate} status:any`;
      const variables = {
        query: queryFilter,
        first: 50, // Adjust based on your needs
      };

      const data = await executeShopifyGraphQL(ordersQuery, variables);
      const orders = data.orders.edges.map((edge: any) => edge.node);

      // 商品ごとにラインアイテムをグループ化して処理
      const productSales: Record<
        string,
        {
          productId: string;
          productTitle: string;
          totalQuantity: number;
          totalSales: number;
          currencyCode: string;
          orders: number;
        }
      > = {};

      orders.forEach((order: any) => {
        const lineItems = order.lineItems.edges.map((edge: any) => edge.node);

        lineItems.forEach((item: any) => {
          const productId = item.product?.id || item.title;
          const productTitle = item.product?.title || item.title;
          const quantity = item.quantity;
          const totalPrice = parseFloat(item.originalTotalSet.shopMoney.amount);
          const currencyCode = item.originalTotalSet.shopMoney.currencyCode;

          if (!productSales[productId]) {
            productSales[productId] = {
              productId,
              productTitle,
              totalQuantity: 0,
              totalSales: 0,
              currencyCode,
              orders: 0,
            };
          }

          productSales[productId].totalQuantity += quantity;
          productSales[productId].totalSales += totalPrice;
          productSales[productId].orders += 1;
        });
      });

      // 配列に変換し、総売上高でソート
      const sortedProductSales = Object.values(productSales)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, limit)
        .map((product) => ({
          ...product,
          totalSales: parseFloat(product.totalSales.toFixed(2)),
          averageOrderValue: parseFloat(
            (product.totalSales / product.orders).toFixed(2)
          ),
        }));

      return {
        content: [
          {
            type: "text",
            text: `Top ${limit} Products by Sales (${startDate} to ${endDate}):\n${JSON.stringify(
              sortedProductSales,
              null,
              2
            )}`,
          },
        ],
      };
    }

    // 売上トレンドの取得
    if (toolName === "get_sales_trends") {
      const { startDate, endDate, interval } = args;

      if (!startDate || !endDate || !interval) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "startDate, endDate, and interval are required for get_sales_trends."
        );
      }

      // 間隔の検証
      if (!["daily", "weekly", "monthly"].includes(interval)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "interval must be one of: daily, weekly, monthly"
        );
      }

      // 売上トレンド取得用クエリ - 顧客情報は含まない
      const ordersQuery = `
        query GetOrdersForSalesTrends($query: String!, $first: Int!) {
          orders(query: $query, first: $first) {
            edges {
              node {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                # 顧客情報は含まないようにしています
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const queryFilter = `created_at:>=${startDate} created_at:<=${endDate} status:any`;
      const variables = {
        query: queryFilter,
        first: 250, // Adjust based on your needs
      };

      const data = await executeShopifyGraphQL(ordersQuery, variables);
      const orders = data.orders.edges.map((edge: any) => edge.node);

      // 時間間隔ごとに注文をグループ化
      const salesByInterval: Record<
        string,
        {
          period: string;
          totalSales: number;
          orderCount: number;
        }
      > = {};

      orders.forEach((order: any) => {
        const createdAt = new Date(order.createdAt);
        const totalPrice = parseFloat(order.totalPriceSet.shopMoney.amount);
        let periodKey: string;

        // 間隔に基づいて期間キーをフォーマット
        switch (interval) {
          case "daily":
            periodKey = createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
            break;
          case "weekly":
            // 週の開始日（日曜日）を取得
            const weekStart = new Date(createdAt);
            weekStart.setDate(createdAt.getDate() - createdAt.getDay());
            periodKey = weekStart.toISOString().split("T")[0];
            break;
          case "monthly":
            periodKey = `${createdAt.getFullYear()}-${String(
              createdAt.getMonth() + 1
            ).padStart(2, "0")}`;
            break;
          default:
            periodKey = createdAt.toISOString().split("T")[0];
        }

        if (!salesByInterval[periodKey]) {
          salesByInterval[periodKey] = {
            period: periodKey,
            totalSales: 0,
            orderCount: 0,
          };
        }

        salesByInterval[periodKey].totalSales += totalPrice;
        salesByInterval[periodKey].orderCount += 1;
      });

      // 配列に変換し、期間でソート
      const sortedSalesTrends = Object.values(salesByInterval)
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((trend) => ({
          ...trend,
          totalSales: parseFloat(trend.totalSales.toFixed(2)),
          averageOrderValue: parseFloat(
            (trend.totalSales / trend.orderCount).toFixed(2)
          ),
        }));

      return {
        content: [
          {
            type: "text",
            text: `Sales Trends (${interval}) from ${startDate} to ${endDate}:\n${JSON.stringify(
              sortedSalesTrends,
              null,
              2
            )}`,
          },
        ],
      };
    }

    // 不明なツール
    throw new McpError(ErrorCode.InvalidRequest, `Unknown tool: ${toolName}`);
  } catch (error) {
    // エラーをファイルにログ出力するか、標準エラー出力に出力する
    process.stderr.write(`Error in Shopify MCP server: ${error}
`);
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error processing request: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

// サーバーを起動
const transport = new StdioServerTransport();
server.connect(transport);
