// Tool response type for MCP
export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Constructs a property resource name in the format required by GA4 APIs.
 * Accepts formats: "123456789", 123456789, or "properties/123456789"
 * Returns: "properties/123456789"
 */
export function constructPropertyResourceName(propertyId: string | number): string {
  let propertyNum: number | null = null;

  if (typeof propertyId === "number") {
    propertyNum = propertyId;
  } else if (typeof propertyId === "string") {
    const trimmed = propertyId.trim();
    if (/^\d+$/.test(trimmed)) {
      propertyNum = parseInt(trimmed, 10);
    } else if (trimmed.startsWith("properties/")) {
      const numericPart = trimmed.split("/")[1];
      if (numericPart && /^\d+$/.test(numericPart)) {
        propertyNum = parseInt(numericPart, 10);
      }
    }
  }

  if (propertyNum === null) {
    throw new Error(
      `Invalid property ID: ${propertyId}. ` +
      "A valid property value is either a number or a string starting " +
      "with 'properties/' and followed by a number."
    );
  }

  return `properties/${propertyNum}`;
}

/**
 * Creates a successful MCP tool response with JSON data.
 */
export function createSuccessResponse(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Creates an error MCP tool response.
 */
export function createErrorResponse(message: string, error?: unknown): ToolResponse {
  let errorMessage = message;

  if (error) {
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    } else if (typeof error === "string") {
      errorMessage += `: ${error}`;
    } else {
      errorMessage += `: ${JSON.stringify(error)}`;
    }
  }

  return {
    content: [
      {
        type: "text",
        text: errorMessage,
      },
    ],
    isError: true,
  };
}

/**
 * Log utility for MCP server messages (outputs to stderr).
 */
export function log(message: string): void {
  console.error(`[GA4 MCP] ${message}`);
}

/**
 * Safely extracts data from a Google API response.
 * Handles both direct response and response.data patterns.
 */
export function extractResponseData<T>(response: { data?: T } | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}
