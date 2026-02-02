import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { type ToolResponse, createErrorResponse } from "../utils/index.js";

// Import admin tools
import {
  getAccountSummaries,
  getPropertyDetails,
  listGoogleAdsLinks,
  listPropertyAnnotations,
} from "./admin.js";

// Import reporting tools
import {
  runReport,
  runRealtimeReport,
  getCustomDimensionsAndMetrics,
} from "./reporting.js";

// Import GTM validator
import {
  gtmValidatorToolDefinition,
  handleGTMValidation,
} from "./gtm-validator.js";

/**
 * Registers all GA4 MCP tools and returns their definitions.
 */
export function registerAllTools(): Tool[] {
  return [
    // Admin tools
    {
      name: "ga4_account_summaries",
      description: "Retrieves information about the user's Google Analytics accounts and properties. Returns a list of all GA4 accounts and their associated properties that the authenticated user has access to.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "ga4_property_details",
      description: "Returns details about a specific GA4 property including its name, display name, time zone, currency, industry category, and other settings.",
      inputSchema: {
        type: "object" as const,
        properties: {
          propertyId: {
            type: "string",
            description: "The Google Analytics property ID. Accepted formats: '123456789', '123456789', or 'properties/123456789'",
          },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "ga4_google_ads_links",
      description: "Returns a list of links to Google Ads accounts for a GA4 property. Shows which Google Ads accounts are connected to the property for data sharing.",
      inputSchema: {
        type: "object" as const,
        properties: {
          propertyId: {
            type: "string",
            description: "The Google Analytics property ID. Accepted formats: '123456789' or 'properties/123456789'",
          },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "ga4_property_annotations",
      description: "Returns annotations for a GA4 property. Annotations are notes that mark specific dates or periods, typically used to record events like releases, campaigns, or traffic changes.",
      inputSchema: {
        type: "object" as const,
        properties: {
          propertyId: {
            type: "string",
            description: "The Google Analytics property ID. Accepted formats: '123456789' or 'properties/123456789'",
          },
        },
        required: ["propertyId"],
      },
    },
    // Reporting tools
    {
      name: "ga4_run_report",
      description: `Runs a Google Analytics Data API report. Returns analytics data based on the specified dimensions, metrics, and date ranges.

## Hints for arguments

### Hints for dimensions
The dimensions list must consist solely of either:
1. Standard dimensions from https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#dimensions
2. Custom dimensions for the property. Use ga4_custom_dimensions_metrics to retrieve custom dimensions.

### Hints for metrics
The metrics list must consist solely of either:
1. Standard metrics from https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#metrics
2. Custom metrics for the property. Use ga4_custom_dimensions_metrics to retrieve custom metrics.

### Hints for dateRanges
Examples:
- Single range: [{"startDate": "2025-01-01", "endDate": "2025-01-31"}]
- Relative: [{"startDate": "30daysAgo", "endDate": "yesterday"}]
- Multiple: [{"startDate": "2025-01-01", "endDate": "2025-01-31", "name": "Jan"}, {"startDate": "2025-02-01", "endDate": "2025-02-28", "name": "Feb"}]

### Hints for dimensionFilter
Example: {"filter": {"fieldName": "eventName", "stringFilter": {"matchType": "BEGINS_WITH", "value": "page"}}}

### Hints for orderBys
Example: [{"dimension": {"dimensionName": "eventName"}, "desc": false}] or [{"metric": {"metricName": "eventCount"}, "desc": true}]`,
      inputSchema: {
        type: "object" as const,
        properties: {
          propertyId: {
            type: "string",
            description: "The Google Analytics property ID. Accepted formats: '123456789' or 'properties/123456789'",
          },
          dateRanges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                startDate: { type: "string", description: "Start date (YYYY-MM-DD, yesterday, today, NdaysAgo)" },
                endDate: { type: "string", description: "End date (YYYY-MM-DD, yesterday, today, NdaysAgo)" },
                name: { type: "string", description: "Optional name for the date range" },
              },
              required: ["startDate", "endDate"],
            },
            description: "List of date ranges for the report",
          },
          dimensions: {
            type: "array",
            items: { type: "string" },
            description: "List of dimension names (e.g., 'eventName', 'country', 'deviceCategory')",
          },
          metrics: {
            type: "array",
            items: { type: "string" },
            description: "List of metric names (e.g., 'activeUsers', 'eventCount', 'sessions')",
          },
          dimensionFilter: {
            type: "object",
            description: "Filter expression for dimensions",
          },
          metricFilter: {
            type: "object",
            description: "Filter expression for metrics",
          },
          orderBys: {
            type: "array",
            items: { type: "object" },
            description: "List of order by specifications",
          },
          limit: {
            type: "number",
            description: "Maximum number of rows to return (default: 10000, max: 250000)",
          },
          offset: {
            type: "number",
            description: "Row offset for pagination (0-indexed)",
          },
          currencyCode: {
            type: "string",
            description: "ISO4217 currency code (e.g., 'USD', 'EUR', 'JPY')",
          },
          returnPropertyQuota: {
            type: "boolean",
            description: "Whether to return property quota information",
          },
        },
        required: ["propertyId", "dateRanges", "dimensions", "metrics"],
      },
    },
    {
      name: "ga4_run_realtime_report",
      description: `Runs a Google Analytics Data API realtime report. Returns real-time analytics data for the last 30 minutes.

## Hints for arguments

### Hints for dimensions
Use realtime dimensions from https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema#dimensions
Or user-scoped custom dimensions (apiName starting with "customUser:")

### Hints for metrics
Use realtime metrics from https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema#metrics
Note: Realtime reports cannot use custom metrics.`,
      inputSchema: {
        type: "object" as const,
        properties: {
          propertyId: {
            type: "string",
            description: "The Google Analytics property ID",
          },
          dimensions: {
            type: "array",
            items: { type: "string" },
            description: "List of realtime dimension names (e.g., 'country', 'city', 'deviceCategory')",
          },
          metrics: {
            type: "array",
            items: { type: "string" },
            description: "List of realtime metric names (e.g., 'activeUsers', 'screenPageViews')",
          },
          dimensionFilter: {
            type: "object",
            description: "Filter expression for dimensions",
          },
          metricFilter: {
            type: "object",
            description: "Filter expression for metrics",
          },
          orderBys: {
            type: "array",
            items: { type: "object" },
            description: "List of order by specifications",
          },
          limit: {
            type: "number",
            description: "Maximum number of rows to return",
          },
          returnPropertyQuota: {
            type: "boolean",
            description: "Whether to return realtime property quota information",
          },
        },
        required: ["propertyId", "dimensions", "metrics"],
      },
    },
    {
      name: "ga4_custom_dimensions_metrics",
      description: "Retrieves the custom dimensions and metrics defined for a GA4 property. Use this to discover what custom definitions are available before running reports.",
      inputSchema: {
        type: "object" as const,
        properties: {
          propertyId: {
            type: "string",
            description: "The Google Analytics property ID",
          },
        },
        required: ["propertyId"],
      },
    },
    // GTM Validator tool
    gtmValidatorToolDefinition,
  ];
}

/**
 * Routes a tool call to the appropriate handler function.
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResponse> {
  switch (name) {
    // Admin tools
    case "ga4_account_summaries":
      return await getAccountSummaries();

    case "ga4_property_details":
      return await getPropertyDetails(args.propertyId as string);

    case "ga4_google_ads_links":
      return await listGoogleAdsLinks(args.propertyId as string);

    case "ga4_property_annotations":
      return await listPropertyAnnotations(args.propertyId as string);

    // Reporting tools
    case "ga4_run_report":
      return await runReport({
        propertyId: args.propertyId as string,
        dateRanges: args.dateRanges as Array<{ startDate: string; endDate: string; name?: string }>,
        dimensions: args.dimensions as string[],
        metrics: args.metrics as string[],
        dimensionFilter: args.dimensionFilter as Record<string, unknown> | undefined,
        metricFilter: args.metricFilter as Record<string, unknown> | undefined,
        orderBys: args.orderBys as Array<Record<string, unknown>> | undefined,
        limit: args.limit as number | undefined,
        offset: args.offset as number | undefined,
        currencyCode: args.currencyCode as string | undefined,
        returnPropertyQuota: args.returnPropertyQuota as boolean | undefined,
      });

    case "ga4_run_realtime_report":
      return await runRealtimeReport({
        propertyId: args.propertyId as string,
        dimensions: args.dimensions as string[],
        metrics: args.metrics as string[],
        dimensionFilter: args.dimensionFilter as Record<string, unknown> | undefined,
        metricFilter: args.metricFilter as Record<string, unknown> | undefined,
        orderBys: args.orderBys as Array<Record<string, unknown>> | undefined,
        limit: args.limit as number | undefined,
        returnPropertyQuota: args.returnPropertyQuota as boolean | undefined,
      });

    case "ga4_custom_dimensions_metrics":
      return await getCustomDimensionsAndMetrics(args.propertyId as string);

    // GTM Validator
    case "ga4_validate_gtm_params":
      return await handleGTMValidation(args);

    default:
      return createErrorResponse(`Unknown tool: ${name}`);
  }
}
