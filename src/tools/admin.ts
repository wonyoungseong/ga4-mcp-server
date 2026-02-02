import type { analyticsadmin_v1beta } from "googleapis";
import {
  getAnalyticsAdminClient,
  constructPropertyResourceName,
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from "../utils/index.js";

type AccountSummariesResponse = analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaListAccountSummariesResponse;
type GoogleAdsLinksResponse = analyticsadmin_v1beta.Schema$GoogleAnalyticsAdminV1betaListGoogleAdsLinksResponse;

/**
 * Retrieves information about the user's Google Analytics accounts and properties.
 */
export async function getAccountSummaries(): Promise<ToolResponse> {
  try {
    const client = await getAnalyticsAdminClient();
    const allSummaries: unknown[] = [];
    let pageToken: string | undefined | null = undefined;

    do {
      const response: { data: AccountSummariesResponse } = await client.accountSummaries.list({
        pageToken: pageToken || undefined,
        pageSize: 200,
      });

      const data = response.data;
      if (data.accountSummaries) {
        allSummaries.push(...data.accountSummaries);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return createSuccessResponse({
      accountSummaries: allSummaries,
      totalCount: allSummaries.length,
    });
  } catch (error) {
    return createErrorResponse("Failed to get account summaries", error);
  }
}

/**
 * Returns details about a specific GA4 property.
 */
export async function getPropertyDetails(propertyId: string): Promise<ToolResponse> {
  try {
    const client = await getAnalyticsAdminClient();
    const propertyName = constructPropertyResourceName(propertyId);

    const response = await client.properties.get({
      name: propertyName,
    });

    return createSuccessResponse(response.data);
  } catch (error) {
    return createErrorResponse(`Failed to get property details for ${propertyId}`, error);
  }
}

/**
 * Returns a list of links to Google Ads accounts for a property.
 */
export async function listGoogleAdsLinks(propertyId: string): Promise<ToolResponse> {
  try {
    const client = await getAnalyticsAdminClient();
    const propertyName = constructPropertyResourceName(propertyId);
    const allLinks: unknown[] = [];
    let pageToken: string | undefined | null = undefined;

    do {
      const response: { data: GoogleAdsLinksResponse } = await client.properties.googleAdsLinks.list({
        parent: propertyName,
        pageToken: pageToken || undefined,
        pageSize: 200,
      });

      const data = response.data;
      if (data.googleAdsLinks) {
        allLinks.push(...data.googleAdsLinks);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return createSuccessResponse({
      googleAdsLinks: allLinks,
      totalCount: allLinks.length,
    });
  } catch (error) {
    return createErrorResponse(`Failed to list Google Ads links for ${propertyId}`, error);
  }
}

/**
 * Returns annotations for a property.
 * Note: This uses the v1alpha API as annotations are not available in v1beta.
 * The googleapis library may not have direct support for this, so we'll return an appropriate message.
 */
export async function listPropertyAnnotations(propertyId: string): Promise<ToolResponse> {
  try {
    // Note: The googleapis Node.js library uses v1beta which doesn't include annotations.
    // Annotations require v1alpha which is available in the Python client.
    // For now, we'll return a message explaining this limitation.
    const propertyName = constructPropertyResourceName(propertyId);

    return createSuccessResponse({
      message: `Property annotations for ${propertyName} are not available through the googleapis Node.js library. ` +
        `The reportingDataAnnotations API requires the v1alpha version which is not fully supported in this library. ` +
        `To access annotations, please use the Google Analytics Admin API v1alpha directly or the Python client library.`,
      propertyId: propertyName,
      suggestedAlternative: "Use the GA4 web interface to view annotations, or implement direct REST API calls to v1alpha.",
    });
  } catch (error) {
    return createErrorResponse(`Failed to list property annotations for ${propertyId}`, error);
  }
}
