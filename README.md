# GA4 MCP Server

A Model Context Protocol (MCP) server for Google Analytics 4 (GA4) that provides tools for querying GA4 data through the Admin API and Data API.

## Features

- **Dual Authentication**: Supports both OAuth Playground tokens and Service Account credentials
- **8 GA4 Tools**:
  - Account and property management (Admin API)
  - Report execution and realtime data (Data API)
  - **GTM → GA4 parameter validation** (cross-platform orchestration)
- **Compatible with Claude Desktop** and other MCP-enabled clients
- **GTM Integration**: Works with GTM MCP Server for end-to-end event validation

## Installation

```bash
npm install
npm run build
```

## Quick Start (OAuth Setup)

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select an existing one
3. Enable the **Google Analytics Data API** and **Google Analytics Admin API**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Select **Desktop app** as the application type
6. Download or copy the Client ID and Client Secret

### 2. Run Setup Script

```bash
# Set your OAuth credentials
export GA4_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GA4_CLIENT_SECRET="your-client-secret"

# Run setup to authenticate with Google
npm run setup
```

This will:
- Open a browser for Google login
- Request read-only access to Google Analytics
- Save tokens to `~/.ga4-mcp/tokens.json`

### 3. Use the Server

Once authenticated, you can use the MCP server with Claude Desktop or other clients.

## Authentication

The server supports two authentication methods, checked in this order:

### 1. OAuth Playground Tokens (Recommended for personal use)

Set these environment variables:
- `GA4_ACCESS_TOKEN` - OAuth access token
- `GA4_REFRESH_TOKEN` - OAuth refresh token
- `GA4_CLIENT_ID` - OAuth client ID
- `GA4_CLIENT_SECRET` - OAuth client secret

Or create `~/.ga4-mcp/tokens.json`:
```json
{
  "access_token": "your-access-token",
  "refresh_token": "your-refresh-token",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret"
}
```

### 2. Service Account (Recommended for production)

Options (in priority order):
1. Set `GA4_SERVICE_ACCOUNT_JSON` environment variable with JSON string
2. Set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file path
3. Place JSON file at `~/.ga4-mcp/credentials.json`
4. Place JSON file in `./Credential/` folder

## Usage

### Claude Desktop Configuration

Add to your Claude Desktop configuration (`~/.config/claude-desktop/config.json`):

```json
{
  "mcpServers": {
    "ga4": {
      "command": "node",
      "args": ["/path/to/ga4-mcp-server/dist/index.js"],
      "env": {
        "GA4_ACCESS_TOKEN": "your-access-token",
        "GA4_REFRESH_TOKEN": "your-refresh-token",
        "GA4_CLIENT_ID": "your-client-id",
        "GA4_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Direct Execution

```bash
# With OAuth environment variables
GA4_ACCESS_TOKEN="..." GA4_REFRESH_TOKEN="..." GA4_CLIENT_ID="..." GA4_CLIENT_SECRET="..." node dist/index.js

# With Service Account
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json" node dist/index.js
```

## Available Tools

### Admin API Tools

| Tool | Description |
|------|-------------|
| `ga4_account_summaries` | List all GA4 accounts and properties the user has access to |
| `ga4_property_details` | Get detailed information about a specific property |
| `ga4_google_ads_links` | List Google Ads accounts linked to a property |
| `ga4_property_annotations` | List annotations for a property (limited support) |

### Data API Tools

| Tool | Description |
|------|-------------|
| `ga4_run_report` | Run a standard GA4 report with dimensions, metrics, and date ranges |
| `ga4_run_realtime_report` | Run a realtime report for the last 30 minutes |
| `ga4_custom_dimensions_metrics` | Get custom dimensions and metrics defined for a property |

### GTM Validation Tool

| Tool | Description |
|------|-------------|
| `ga4_validate_gtm_params` | Validate GTM event parameters against GA4 custom dimensions and data collection |

## Example Usage

### Get Account Summaries
```json
{
  "tool": "ga4_account_summaries"
}
```

### Run a Report
```json
{
  "tool": "ga4_run_report",
  "arguments": {
    "propertyId": "123456789",
    "dateRanges": [
      {"startDate": "30daysAgo", "endDate": "yesterday"}
    ],
    "dimensions": ["country", "deviceCategory"],
    "metrics": ["activeUsers", "sessions"]
  }
}
```

### Run Realtime Report
```json
{
  "tool": "ga4_run_realtime_report",
  "arguments": {
    "propertyId": "123456789",
    "dimensions": ["country"],
    "metrics": ["activeUsers"]
  }
}
```

### Validate GTM Parameters
```json
{
  "tool": "ga4_validate_gtm_params",
  "arguments": {
    "propertyId": "123456789",
    "gtmEvents": [
      {
        "eventName": "purchase",
        "parameters": ["transaction_id", "value", "currency"]
      }
    ],
    "startDate": "7daysAgo",
    "endDate": "yesterday"
  }
}
```

Or with GTM Export JSON:
```json
{
  "tool": "ga4_validate_gtm_params",
  "arguments": {
    "propertyId": "123456789",
    "gtmExportJson": { "...GTM container export data..." }
  }
}
```

## GTM Integration (Claude Agent Orchestration)

This server works with the GTM MCP Server to provide end-to-end validation of GTM event parameters in GA4.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Agent                                 │
│                    (Orchestrator Role)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ① GTM MCP Server                  ② GA4 MCP Server                │
│  (gtmAgent/mcp-server)             (ga4-mcp-server)                 │
│                                                                     │
│  gtm_export_full()                 ga4_validate_gtm_params()        │
│  gtm_tag().list()                  ga4_custom_dimensions_metrics()  │
│       │                            ga4_run_report()                 │
│       │                                   ▲                         │
│       └───────────────────────────────────┘                         │
│                Agent relays data                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Workflow

1. **Extract from GTM**: `gtm_export_full()` → Get GA4 Event tags and parameters
2. **Validate in GA4**: `ga4_validate_gtm_params()` → Check registration and collection
3. **Get recommendations**: Parameters not registered or not collecting data

### Claude Desktop Configuration (Both Servers)

```json
{
  "mcpServers": {
    "gtm": {
      "command": "node",
      "args": ["/path/to/gtmAgent/mcp-server/dist/index.js"],
      "env": {}
    },
    "ga4": {
      "command": "node",
      "args": ["/path/to/ga4-mcp-server/dist/index.js"],
      "env": {
        "GA4_ACCESS_TOKEN": "your-access-token",
        "GA4_REFRESH_TOKEN": "your-refresh-token",
        "GA4_CLIENT_ID": "your-client-id",
        "GA4_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### API Call Efficiency

| Scenario | Traditional | Optimized | Reduction |
|----------|-------------|-----------|-----------|
| 5 events × 21 params | 105 calls | 22 calls | 79% |
| 14 events × 32 params | 448 calls | 33 calls | 93% |

The validation tool queries metadata once, then makes one API call per unique parameter instead of per event-parameter combination.

## API Documentation References

- [GA4 Admin API](https://developers.google.com/analytics/devguides/config/admin/v1)
- [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Standard Dimensions](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#dimensions)
- [Standard Metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema#metrics)
- [Realtime Dimensions](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema#dimensions)
- [Realtime Metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema#metrics)

## Required Google API Scopes

The server uses the following scope:
- `https://www.googleapis.com/auth/analytics.readonly`

## License

MIT
