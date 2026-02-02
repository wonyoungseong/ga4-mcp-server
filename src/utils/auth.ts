import { google } from "googleapis";
import type { analyticsadmin_v1beta } from "googleapis";
import type { analyticsdata_v1beta } from "googleapis";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Types
interface OAuthTokens {
  access_token?: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  expiry_date?: number;
}

interface ADCCredentials {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri: string;
}

type AuthMode = "oauth" | "adc" | "service_account";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..", ".."); // ga4-mcp-server root
const credentialFolder = join(projectRoot, "Credential"); // Credential folder

// GA4 API scopes
const GA4_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
];

// Cache for clients
let cachedAdminClient: analyticsadmin_v1beta.Analyticsadmin | null = null;
let cachedDataClient: analyticsdata_v1beta.Analyticsdata | null = null;
let cachedAuthMode: AuthMode | null = null;
let cachedEmail: string | null = null;

// Find first .json file in Credential folder
function findCredentialInFolder(folderPath: string): string | null {
  try {
    if (!existsSync(folderPath)) return null;
    const files = readdirSync(folderPath);
    const jsonFile = files.find(f => f.endsWith(".json"));
    if (jsonFile) {
      return join(folderPath, jsonFile);
    }
  } catch {
    // Folder doesn't exist or not readable
  }
  return null;
}

// Get OAuth tokens from environment variables
function getOAuthTokensFromEnv(): OAuthTokens | null {
  const accessToken = process.env.GA4_ACCESS_TOKEN;
  const refreshToken = process.env.GA4_REFRESH_TOKEN;
  const clientId = process.env.GA4_CLIENT_ID;
  const clientSecret = process.env.GA4_CLIENT_SECRET;

  if (accessToken && refreshToken && clientId && clientSecret) {
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    };
  }
  return null;
}

// Get OAuth tokens from file
function getOAuthTokensFromFile(): OAuthTokens | null {
  const tokenPath = join(homedir(), ".ga4-mcp", "tokens.json");
  if (existsSync(tokenPath)) {
    try {
      const content = readFileSync(tokenPath, "utf-8");
      const tokens = JSON.parse(content);
      if (tokens.refresh_token && tokens.client_id && tokens.client_secret) {
        return tokens as OAuthTokens;
      }
    } catch {
      // Invalid token file
    }
  }
  return null;
}

// Get ADC (Application Default Credentials) from gcloud
function getADCCredentials(): ADCCredentials | null {
  // Check GOOGLE_APPLICATION_CREDENTIALS first for ADC type
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds && existsSync(googleAppCreds)) {
    try {
      const content = readFileSync(googleAppCreds, "utf-8");
      const creds = JSON.parse(content);
      if (creds.type === "authorized_user" && creds.refresh_token && creds.client_id && creds.client_secret) {
        return creds as ADCCredentials;
      }
    } catch {
      // Invalid file
    }
  }

  // Check default gcloud ADC location
  const adcPath = join(homedir(), ".config", "gcloud", "application_default_credentials.json");
  if (existsSync(adcPath)) {
    try {
      const content = readFileSync(adcPath, "utf-8");
      const creds = JSON.parse(content);
      if (creds.type === "authorized_user" && creds.refresh_token && creds.client_id && creds.client_secret) {
        return creds as ADCCredentials;
      }
    } catch {
      // Invalid file
    }
  }

  return null;
}

// Get Service Account credentials
function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  // 1. Try GA4_SERVICE_ACCOUNT_JSON environment variable (JSON string)
  const envJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      const creds = JSON.parse(envJson);
      if (creds.client_email && creds.private_key) {
        return creds as ServiceAccountCredentials;
      }
    } catch {
      // Invalid JSON
    }
  }

  // 2. Try GOOGLE_APPLICATION_CREDENTIALS environment variable (file path)
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds && existsSync(googleAppCreds)) {
    try {
      const content = readFileSync(googleAppCreds, "utf-8");
      const creds = JSON.parse(content);
      if (creds.client_email && creds.private_key) {
        return creds as ServiceAccountCredentials;
      }
    } catch {
      // Invalid file
    }
  }

  // 3. Try ~/.ga4-mcp/credentials.json
  const configPath = join(homedir(), ".ga4-mcp", "credentials.json");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const creds = JSON.parse(content);
      if (creds.client_email && creds.private_key) {
        return creds as ServiceAccountCredentials;
      }
    } catch {
      // Invalid file
    }
  }

  // 4. Try Credential folder
  const credPath = findCredentialInFolder(credentialFolder);
  if (credPath) {
    try {
      const content = readFileSync(credPath, "utf-8");
      const creds = JSON.parse(content);
      if (creds.client_email && creds.private_key) {
        return creds as ServiceAccountCredentials;
      }
    } catch {
      // Invalid file
    }
  }

  return null;
}

// Create OAuth2 client with tokens
async function createOAuthClient(tokens: OAuthTokens): Promise<InstanceType<typeof google.auth.OAuth2>> {
  const oauth2Client = new google.auth.OAuth2(
    tokens.client_id,
    tokens.client_secret
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Check if token needs refresh
  const tokenInfo = oauth2Client.credentials;
  const now = Date.now();
  const expiryDate = tokenInfo.expiry_date || 0;

  if (expiryDate && expiryDate < now + 60000) {
    // Token expires in less than 1 minute, refresh it
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);

      // Save refreshed tokens
      const tokenPath = join(homedir(), ".ga4-mcp", "tokens.json");
      const dir = dirname(tokenPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const updatedTokens: OAuthTokens = {
        ...tokens,
        access_token: credentials.access_token || tokens.access_token,
        expiry_date: credentials.expiry_date || undefined,
      };
      writeFileSync(tokenPath, JSON.stringify(updatedTokens, null, 2));
      console.error("[GA4 MCP] OAuth token refreshed and saved");
    } catch (error) {
      console.error("[GA4 MCP] Failed to refresh OAuth token:", error);
      throw new Error("Failed to refresh OAuth token. Please re-authenticate.");
    }
  }

  cachedAuthMode = "oauth";
  return oauth2Client;
}

// Create OAuth2 client from ADC (gcloud login)
async function createADCClient(creds: ADCCredentials): Promise<InstanceType<typeof google.auth.OAuth2>> {
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret
  );

  oauth2Client.setCredentials({
    refresh_token: creds.refresh_token,
  });

  // Get fresh access token
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    console.error("[GA4 MCP] ADC token refreshed successfully");
  } catch (error) {
    console.error("[GA4 MCP] Failed to refresh ADC token:", error);
    throw new Error("Failed to refresh ADC token. Please run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.readonly");
  }

  cachedAuthMode = "adc";
  return oauth2Client;
}

// Create Service Account JWT client
async function createServiceAccountClient(credentials: ServiceAccountCredentials): Promise<InstanceType<typeof google.auth.JWT>> {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: GA4_SCOPES,
  });

  await auth.authorize();
  cachedAuthMode = "service_account";
  cachedEmail = credentials.client_email;
  return auth;
}

// Get authenticated client (OAuth or Service Account)
async function getAuthClient(): Promise<InstanceType<typeof google.auth.OAuth2> | InstanceType<typeof google.auth.JWT>> {
  // Priority 1: OAuth tokens from environment
  const envTokens = getOAuthTokensFromEnv();
  if (envTokens) {
    console.error("[GA4 MCP] Using OAuth tokens from environment variables");
    return await createOAuthClient(envTokens);
  }

  // Priority 2: OAuth tokens from file
  const fileTokens = getOAuthTokensFromFile();
  if (fileTokens) {
    console.error("[GA4 MCP] Using OAuth tokens from ~/.ga4-mcp/tokens.json");
    return await createOAuthClient(fileTokens);
  }

  // Priority 3: ADC (gcloud auth application-default login)
  const adcCreds = getADCCredentials();
  if (adcCreds) {
    console.error("[GA4 MCP] Using Application Default Credentials (gcloud login)");
    return await createADCClient(adcCreds);
  }

  // Priority 4: Service Account
  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
    console.error(`[GA4 MCP] Using Service Account: ${serviceAccount.client_email}`);
    return await createServiceAccountClient(serviceAccount);
  }

  throw new Error(
    "No credentials found. Please either:\n" +
    "1. Run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.readonly\n" +
    "2. Set OAuth environment variables (GA4_ACCESS_TOKEN, GA4_REFRESH_TOKEN, GA4_CLIENT_ID, GA4_CLIENT_SECRET)\n" +
    "3. Place OAuth tokens in ~/.ga4-mcp/tokens.json\n" +
    "4. Set GOOGLE_APPLICATION_CREDENTIALS to a Service Account JSON file\n" +
    "5. Place Service Account JSON in ~/.ga4-mcp/credentials.json"
  );
}

// Get Analytics Admin API client
export async function getAnalyticsAdminClient(): Promise<analyticsadmin_v1beta.Analyticsadmin> {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const auth = await getAuthClient();
  cachedAdminClient = google.analyticsadmin({
    version: "v1beta",
    auth: auth,
  });

  return cachedAdminClient;
}

// Get Analytics Data API client
export async function getAnalyticsDataClient(): Promise<analyticsdata_v1beta.Analyticsdata> {
  if (cachedDataClient) {
    return cachedDataClient;
  }

  const auth = await getAuthClient();
  cachedDataClient = google.analyticsdata({
    version: "v1beta",
    auth: auth,
  });

  return cachedDataClient;
}

// Get credentials info for logging
export function getCredentialsInfo(): { mode: AuthMode; email?: string } | null {
  if (cachedAuthMode) {
    return {
      mode: cachedAuthMode,
      email: cachedEmail || undefined,
    };
  }

  // Check what credentials are available without authenticating
  const envTokens = getOAuthTokensFromEnv();
  if (envTokens) {
    return { mode: "oauth" };
  }

  const fileTokens = getOAuthTokensFromFile();
  if (fileTokens) {
    return { mode: "oauth" };
  }

  const adcCreds = getADCCredentials();
  if (adcCreds) {
    return { mode: "adc" };
  }

  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
    return { mode: "service_account", email: serviceAccount.client_email };
  }

  return null;
}

// Log utility
export function log(message: string): void {
  console.error(`[GA4 MCP] ${message}`);
}
