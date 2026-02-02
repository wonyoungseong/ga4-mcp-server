import {
  getAnalyticsDataClient,
  constructPropertyResourceName,
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from "../utils/index.js";

// Type definitions for report parameters
interface DateRange {
  startDate: string;
  endDate: string;
  name?: string;
}

interface FilterExpression {
  filter?: {
    fieldName: string;
    stringFilter?: {
      matchType: string;
      value: string;
      caseSensitive?: boolean;
    };
    numericFilter?: {
      operation: string;
      value: {
        int64Value?: string;
        doubleValue?: number;
      };
    };
    inListFilter?: {
      values: string[];
      caseSensitive?: boolean;
    };
    betweenFilter?: {
      fromValue: { int64Value?: string; doubleValue?: number };
      toValue: { int64Value?: string; doubleValue?: number };
    };
    emptyFilter?: Record<string, never>;
  };
  andGroup?: { expressions: FilterExpression[] };
  orGroup?: { expressions: FilterExpression[] };
  notExpression?: FilterExpression;
}

interface OrderBy {
  dimension?: {
    dimensionName: string;
    orderType?: string;
  };
  metric?: {
    metricName: string;
  };
  desc?: boolean;
}

interface RunReportParams {
  propertyId: string;
  dateRanges: DateRange[];
  dimensions: string[];
  metrics: string[];
  dimensionFilter?: FilterExpression;
  metricFilter?: FilterExpression;
  orderBys?: OrderBy[];
  limit?: number;
  offset?: number;
  currencyCode?: string;
  returnPropertyQuota?: boolean;
}

interface RunRealtimeReportParams {
  propertyId: string;
  dimensions: string[];
  metrics: string[];
  dimensionFilter?: FilterExpression;
  metricFilter?: FilterExpression;
  orderBys?: OrderBy[];
  limit?: number;
  returnPropertyQuota?: boolean;
}

/**
 * Runs a Google Analytics Data API report.
 */
export async function runReport(params: RunReportParams): Promise<ToolResponse> {
  try {
    const client = await getAnalyticsDataClient();
    const propertyName = constructPropertyResourceName(params.propertyId);

    // Build the request body
    const requestBody: Record<string, unknown> = {
      property: propertyName,
      dateRanges: params.dateRanges,
      dimensions: params.dimensions.map(name => ({ name })),
      metrics: params.metrics.map(name => ({ name })),
    };

    if (params.dimensionFilter) {
      requestBody.dimensionFilter = params.dimensionFilter;
    }

    if (params.metricFilter) {
      requestBody.metricFilter = params.metricFilter;
    }

    if (params.orderBys && params.orderBys.length > 0) {
      requestBody.orderBys = params.orderBys;
    }

    if (params.limit !== undefined) {
      requestBody.limit = params.limit;
    }

    if (params.offset !== undefined) {
      requestBody.offset = params.offset;
    }

    if (params.currencyCode) {
      requestBody.currencyCode = params.currencyCode;
    }

    if (params.returnPropertyQuota !== undefined) {
      requestBody.returnPropertyQuota = params.returnPropertyQuota;
    }

    const response = await client.properties.runReport({
      property: propertyName,
      requestBody: requestBody,
    });

    return createSuccessResponse(response.data);
  } catch (error) {
    return createErrorResponse(`Failed to run report for ${params.propertyId}`, error);
  }
}

/**
 * Runs a Google Analytics Data API realtime report.
 */
export async function runRealtimeReport(params: RunRealtimeReportParams): Promise<ToolResponse> {
  try {
    const client = await getAnalyticsDataClient();
    const propertyName = constructPropertyResourceName(params.propertyId);

    // Build the request body
    const requestBody: Record<string, unknown> = {
      property: propertyName,
      dimensions: params.dimensions.map(name => ({ name })),
      metrics: params.metrics.map(name => ({ name })),
    };

    if (params.dimensionFilter) {
      requestBody.dimensionFilter = params.dimensionFilter;
    }

    if (params.metricFilter) {
      requestBody.metricFilter = params.metricFilter;
    }

    if (params.orderBys && params.orderBys.length > 0) {
      requestBody.orderBys = params.orderBys;
    }

    if (params.limit !== undefined) {
      requestBody.limit = params.limit;
    }

    if (params.returnPropertyQuota !== undefined) {
      requestBody.returnPropertyQuota = params.returnPropertyQuota;
    }

    const response = await client.properties.runRealtimeReport({
      property: propertyName,
      requestBody: requestBody,
    });

    return createSuccessResponse(response.data);
  } catch (error) {
    return createErrorResponse(`Failed to run realtime report for ${params.propertyId}`, error);
  }
}

/**
 * Returns the property's custom dimensions and metrics.
 */
export async function getCustomDimensionsAndMetrics(propertyId: string): Promise<ToolResponse> {
  try {
    const client = await getAnalyticsDataClient();
    const propertyName = constructPropertyResourceName(propertyId);

    const response = await client.properties.getMetadata({
      name: `${propertyName}/metadata`,
    });

    const data = response.data;

    // Filter for custom dimensions and metrics
    const customDimensions = (data.dimensions || []).filter(
      dim => dim.customDefinition === true
    );

    const customMetrics = (data.metrics || []).filter(
      metric => metric.customDefinition === true
    );

    return createSuccessResponse({
      propertyId: propertyName,
      customDimensions: customDimensions,
      customMetrics: customMetrics,
      customDimensionsCount: customDimensions.length,
      customMetricsCount: customMetrics.length,
    });
  } catch (error) {
    return createErrorResponse(`Failed to get custom dimensions and metrics for ${propertyId}`, error);
  }
}
