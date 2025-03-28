import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

// サーバー初期化
const server = new Server(
  {
    name: "ga4-analysis-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// GA4接続情報
let analyticsDataClient: BetaAnalyticsDataClient | null = null;
let propertyId: string | null = null;

// 利用可能なツールのリストを提供
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "setup_ga4_client",
        description: "Google Analytics 4クライアントの設定",
        inputSchema: {
          type: "object",
          properties: {
            propertyId: { type: "string", description: "GA4のプロパティID" },
          },
          required: ["propertyId"],
        },
      },
      {
        name: "get_ga4_data",
        description: "GA4からデータを取得する",
        inputSchema: {
          type: "object",
          properties: {
            dateRange: {
              type: "object",
              properties: {
                startDate: {
                  type: "string",
                  description: "開始日 (YYYY-MM-DD形式)",
                },
                endDate: {
                  type: "string",
                  description: "終了日 (YYYY-MM-DD形式)",
                },
              },
              required: ["startDate", "endDate"],
            },
            metrics: {
              type: "array",
              items: { type: "string" },
              description: "取得する指標のリスト",
            },
            dimensions: {
              type: "array",
              items: { type: "string" },
              description: "取得するディメンションのリスト",
            },
          },
          required: ["dateRange", "metrics", "dimensions"],
        },
      },
      {
        name: "calculate_cvr",
        description: "コンバージョン率 (CVR) を計算する",
        inputSchema: {
          type: "object",
          properties: {
            conversionEvents: {
              type: "array",
              items: { type: "string" },
              description: "コンバージョンイベント (例: ['purchase'])",
            },
            baseEvents: {
              type: "array",
              items: { type: "string" },
              description: "基準となるイベント (例: ['session_start'])",
            },
            segmentBy: {
              type: "string",
              description: "セグメント分けのディメンション",
            },
          },
          required: ["conversionEvents", "baseEvents"],
        },
      },
      {
        name: "analyze_user_journey",
        description: "ユーザージャーニーの分析",
        inputSchema: {
          type: "object",
          properties: {
            dateRange: {
              type: "object",
              properties: {
                startDate: {
                  type: "string",
                  description: "開始日 (YYYY-MM-DD形式)",
                },
                endDate: {
                  type: "string",
                  description: "終了日 (YYYY-MM-DD形式)",
                },
              },
              required: ["startDate", "endDate"],
            },
            segmentBy: {
              type: "string",
              description:
                "セグメント分けのディメンション (例: 'deviceCategory')",
            },
          },
          required: ["dateRange"],
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
    // GA4クライアントの設定
    if (toolName === "setup_ga4_client") {
      if (!args.propertyId || typeof args.propertyId !== "string") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "propertyId is required and must be a string."
        );
      }
      try {
        // GOOGLE_APPLICATION_CREDENTIALS 環境変数が設定されていることを期待
        analyticsDataClient = new BetaAnalyticsDataClient();
        propertyId = args.propertyId;
        // ここで簡単なテストAPI呼び出しを追加することも可能 (例: getMetadata)
        // が、ここでは初期化のみとする
        return {
          content: [
            {
              type: "text",
              text: `GA4クライアントが初期化されました。プロパティID: ${propertyId}. GOOGLE_APPLICATION_CREDENTIALS環境変数による認証を使用します。`,
            },
          ],
        };
      } catch (error) {
        console.error("GA4 Client Initialization Error:", error);
        throw new McpError(
          ErrorCode.InternalError,
          `GA4クライアントの初期化に失敗しました: ${
            error instanceof Error ? error.message : String(error)
          }. GOOGLE_APPLICATION_CREDENTIALS環境変数が正しく設定されているか確認してください。`
        );
      }
    }

    // GA4クライアント未設定時のエラーチェック
    if (!analyticsDataClient && toolName !== "setup_ga4_client") {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "エラー: GA4クライアントが設定されていません。先にsetup_ga4_clientを呼び出してください。"
      );
    }

    // GA4からデータを取得
    if (toolName === "get_ga4_data") {
      // Type assertion for arguments - consider adding validation later
      const { dateRange, metrics, dimensions } = args as {
        dateRange: { startDate: string; endDate: string };
        metrics: string[];
        dimensions: string[];
      };

      if (!dateRange || !metrics || !dimensions) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "dateRange, metrics, and dimensions are required for get_ga4_data."
        );
      }

      try {
        const [response] = await analyticsDataClient!.runReport({
          // Use non-null assertion as we check for client existence earlier
          property: `properties/${propertyId}`,
          dateRanges: [
            {
              startDate: dateRange.startDate,
              endDate: dateRange.endDate,
            },
          ],
          dimensions: dimensions.map((name) => ({ name })),
          metrics: metrics.map((name) => ({ name })),
        });

        // Format the response for better readability
        const formattedResponse = {
          dimensionHeaders: response.dimensionHeaders?.map((dh) => dh.name),
          metricHeaders: response.metricHeaders?.map((mh) => mh.name),
          rows: response.rows?.map((row) => {
            const rowData: { [key: string]: string } = {};
            row.dimensionValues?.forEach((dv, i) => {
              rowData[response.dimensionHeaders![i].name!] = dv.value!;
            });
            row.metricValues?.forEach((mv, i) => {
              rowData[response.metricHeaders![i].name!] = mv.value!;
            });
            return rowData;
          }),
          rowCount: response.rowCount,
          metadata: response.metadata,
          propertyQuota: response.propertyQuota,
          kind: response.kind,
        };

        return {
          content: [
            {
              type: "text",
              text: `GA4データ取得結果:\n${JSON.stringify(
                formattedResponse,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error) {
        console.error("GA4 API Error (get_ga4_data):", error);
        throw new McpError(
          ErrorCode.InternalError,
          `GA4 APIからのデータ取得中にエラーが発生しました: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // CVR計算
    if (toolName === "calculate_cvr") {
      const { conversionEvents, baseEvents, segmentBy, dateRange } = args as {
        // Added dateRange
        conversionEvents: string[];
        baseEvents: string[];
        segmentBy?: string;
        dateRange: { startDate: string; endDate: string }; // Assuming dateRange is needed
      };

      if (!conversionEvents || !baseEvents || !dateRange) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "conversionEvents, baseEvents, and dateRange are required for calculate_cvr."
        );
      }

      // Helper function to fetch event counts
      const getEventCount = async (
        eventNames: string[],
        dimensionName?: string
      ): Promise<Map<string | null, number>> => {
        const dimensions = dimensionName ? [{ name: dimensionName }] : [];
        const filterExpression = {
          filter: {
            fieldName: "eventName",
            inListFilter: {
              values: eventNames,
            },
          },
        };

        try {
          const [response] = await analyticsDataClient!.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: dimensions,
            metrics: [{ name: "eventCount" }],
            dimensionFilter: filterExpression, // Filter by event name
          });

          const results = new Map<string | null, number>();
          if (!dimensionName) {
            // Overall count
            const totalCount =
              response.rows?.reduce(
                (sum, row) =>
                  sum + parseInt(row.metricValues?.[0]?.value ?? "0", 10),
                0
              ) ?? 0;
            results.set(null, totalCount); // Use null key for overall
          } else {
            // Segmented counts
            response.rows?.forEach((row) => {
              const dimensionValue =
                row.dimensionValues?.[0]?.value ?? "unknown";
              const count = parseInt(row.metricValues?.[0]?.value ?? "0", 10);
              results.set(dimensionValue, count);
            });
          }
          return results;
        } catch (error) {
          console.error(
            `GA4 API Error (getEventCount for ${eventNames.join(", ")}):`,
            error
          );
          throw new McpError(
            ErrorCode.InternalError,
            `GA4 API Error fetching event count: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      };

      try {
        const conversionCounts = await getEventCount(
          conversionEvents,
          segmentBy
        );
        const baseCounts = await getEventCount(baseEvents, segmentBy);

        const cvrResults: any = { overall: {}, segments: {} };

        // Calculate Overall CVR
        const overallConversions = conversionCounts.get(null) ?? 0;
        const overallBase = baseCounts.get(null) ?? 0;
        cvrResults.overall = {
          conversionEvents: overallConversions,
          baseEvents: overallBase,
          cvr:
            overallBase > 0
              ? parseFloat(
                  ((overallConversions / overallBase) * 100).toFixed(2)
                )
              : 0,
        };

        // Calculate Segmented CVRs
        if (segmentBy) {
          const allSegments = new Set([
            ...conversionCounts.keys(),
            ...baseCounts.keys(),
          ]);
          allSegments.delete(null); // Remove overall key if present

          for (const segmentValue of allSegments) {
            if (segmentValue === null) continue; // Should not happen, but safeguard
            const segmentConversions = conversionCounts.get(segmentValue) ?? 0;
            const segmentBase = baseCounts.get(segmentValue) ?? 0;
            cvrResults.segments[segmentValue] = {
              conversionEvents: segmentConversions,
              baseEvents: segmentBase,
              cvr:
                segmentBase > 0
                  ? parseFloat(
                      ((segmentConversions / segmentBase) * 100).toFixed(2)
                    )
                  : 0,
            };
          }
        } else {
          delete cvrResults.segments; // Remove segments if not requested
        }

        return {
          content: [
            {
              type: "text",
              text: `CVR計算結果:\n${JSON.stringify(cvrResults, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        // Errors from getEventCount are already McpErrors
        if (error instanceof McpError) throw error;
        console.error("CVR Calculation Error:", error);
        throw new McpError(
          ErrorCode.InternalError,
          `CVR計算中にエラーが発生しました: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // ユーザージャーニーの分析
    if (toolName === "analyze_user_journey") {
      const { segmentBy, dateRange } = args as {
        segmentBy?: string;
        dateRange: { startDate: string; endDate: string };
      };

      if (!dateRange) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "dateRange is required for analyze_user_journey."
        );
      }

      // Define standard funnel steps (adjust as needed)
      const funnelSteps = [
        "session_start",
        "view_item_list", // Optional: depends on site structure
        "view_item",
        "add_to_cart",
        "begin_checkout",
        "purchase",
      ];

      // Re-use the getEventCount helper from calculate_cvr
      const getEventCount = async (
        eventNames: string[],
        dimensionName?: string
      ): Promise<Map<string | null, number>> => {
        const dimensions = dimensionName ? [{ name: dimensionName }] : [];
        const filterExpression = {
          filter: {
            fieldName: "eventName",
            inListFilter: {
              values: eventNames,
            },
          },
        };

        try {
          const [response] = await analyticsDataClient!.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: dimensions,
            metrics: [{ name: "eventCount" }],
            dimensionFilter: filterExpression,
          });

          const results = new Map<string | null, number>();
          if (!dimensionName) {
            const totalCount =
              response.rows?.reduce(
                (sum, row) =>
                  sum + parseInt(row.metricValues?.[0]?.value ?? "0", 10),
                0
              ) ?? 0;
            results.set(null, totalCount);
          } else {
            response.rows?.forEach((row) => {
              const dimensionValue =
                row.dimensionValues?.[0]?.value ?? "unknown";
              const count = parseInt(row.metricValues?.[0]?.value ?? "0", 10);
              results.set(dimensionValue, count);
            });
            // Ensure all segments have a 0 count if no events were found
            // This requires knowing all possible segment values beforehand, or fetching them separately.
            // For simplicity, we'll only report segments with data.
          }
          return results;
        } catch (error) {
          console.error(
            `GA4 API Error (getEventCount for ${eventNames.join(", ")}):`,
            error
          );
          throw new McpError(
            ErrorCode.InternalError,
            `GA4 API Error fetching event count: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      };

      try {
        const journeyResults: any = {
          overallFunnel: {},
          overallStepConversion: {},
          segmentFunnels: {},
        };
        const allSegmentValues = new Set<string>(); // To collect all unique segment values

        // Fetch counts for all steps
        const stepCountsPromises = funnelSteps.map((step) =>
          getEventCount([step], segmentBy)
        );
        const stepCountsResults = await Promise.all(stepCountsPromises);

        const stepDataMap = new Map<string, Map<string | null, number>>();
        funnelSteps.forEach((step, index) => {
          stepDataMap.set(step, stepCountsResults[index]);
          // Collect segment values
          if (segmentBy) {
            stepCountsResults[index].forEach((_, key) => {
              if (key !== null) allSegmentValues.add(key);
            });
          }
        });

        // Calculate Overall Funnel & Conversions
        let previousStepCount = 0;
        funnelSteps.forEach((step, i) => {
          const count = stepDataMap.get(step)?.get(null) ?? 0;
          journeyResults.overallFunnel[step] = count;
          if (i > 0) {
            const prevStep = funnelSteps[i - 1];
            const conversionRate =
              previousStepCount > 0
                ? parseFloat(((count / previousStepCount) * 100).toFixed(2))
                : 0;
            journeyResults.overallStepConversion[`${prevStep}_to_${step}`] =
              conversionRate;
          }
          previousStepCount = count;
        });

        // Calculate Segmented Funnels
        if (segmentBy) {
          for (const segmentValue of allSegmentValues) {
            journeyResults.segmentFunnels[segmentValue] = {};
            funnelSteps.forEach((step) => {
              const count = stepDataMap.get(step)?.get(segmentValue) ?? 0;
              journeyResults.segmentFunnels[segmentValue][step] = count;
            });
          }
        } else {
          delete journeyResults.segmentFunnels;
        }

        return {
          content: [
            {
              type: "text",
              text: `ユーザージャーニー分析結果:\n${JSON.stringify(
                journeyResults,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        console.error("User Journey Analysis Error:", error);
        throw new McpError(
          ErrorCode.InternalError,
          `ユーザージャーニー分析中にエラーが発生しました: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // 未知のツール名の場合
    return {
      content: [
        {
          type: "text",
          text: `エラー: 未知のツール名 "${toolName}" が指定されました。`,
        },
      ],
    };
  } catch (error) {
    console.error("エラーが発生しました:", error);
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

// Server startup
const transport = new StdioServerTransport();
server.connect(transport);
