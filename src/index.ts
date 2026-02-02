#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getCredentialsInfo, log } from "./utils/index.js";
import { registerAllTools, handleToolCall } from "./tools/index.js";

const server = new Server(
  {
    name: "ga4-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = registerAllTools();
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await handleToolCall(name, args || {});
  return {
    content: result.content,
    isError: result.isError,
  };
});

// Start the server
async function main() {
  const credInfo = getCredentialsInfo();
  if (credInfo) {
    if (credInfo.mode === "oauth") {
      log("Starting GA4 MCP Server (OAuth authentication)");
    } else if (credInfo.mode === "adc") {
      log("Starting GA4 MCP Server (gcloud Application Default Credentials)");
    } else {
      log(`Starting GA4 MCP Server (Service Account: ${credInfo.email})`);
    }
  } else {
    log("Starting GA4 MCP Server (credentials will be loaded on first API call)");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Server connected via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
