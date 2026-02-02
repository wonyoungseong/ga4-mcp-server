/**
 * GTM → GA4 파라미터 검증 도구
 *
 * GTM에서 보내는 이벤트/파라미터가 GA4에 제대로 수집되는지 검증
 */

import { getAnalyticsDataClient } from '../utils/auth.js';
import { constructPropertyResourceName, createSuccessResponse, createErrorResponse, log } from '../utils/helpers.js';
import type { ToolResponse } from '../utils/helpers.js';

// GTM에서 추출한 이벤트-파라미터 매핑 타입
interface GTMEventConfig {
  eventName: string;
  parameters: string[];
}

interface ValidationResult {
  eventName: string;
  parameter: string;
  status: 'collected' | 'not_collected' | 'not_registered';
  count?: number;
  message: string;
}

interface ValidationSummary {
  totalEvents: number;
  totalParameters: number;
  collected: number;
  notCollected: number;
  notRegistered: number;
  details: ValidationResult[];
  recommendations: string[];
  apiCalls: number;
}

/**
 * GTM 이벤트 파라미터 검증
 */
export async function validateGTMParameters(
  propertyId: string,
  gtmEvents: GTMEventConfig[],
  dateRange: { startDate: string; endDate: string } = { startDate: '7daysAgo', endDate: 'yesterday' }
): Promise<ValidationSummary> {
  const dataClient = await getAnalyticsDataClient();
  const propertyResource = constructPropertyResourceName(propertyId);
  let apiCalls = 0;

  // 1단계: 커스텀 디멘션 메타데이터 조회
  log('Fetching custom dimensions metadata...');
  const metadataResponse = await dataClient.properties.getMetadata({
    name: `${propertyResource}/metadata`,
  });
  apiCalls++;

  const registeredDimensions = new Set<string>();
  metadataResponse.data.dimensions?.forEach(dim => {
    if (dim.customDefinition && dim.apiName) {
      // customEvent:param_name 형식에서 param_name 추출
      const match = dim.apiName.match(/^customEvent:(.+)$/);
      if (match) {
        registeredDimensions.add(match[1]);
      }
    }
  });

  log(`Found ${registeredDimensions.size} registered custom dimensions`);

  // 2단계: 모든 파라미터 추출 및 분류
  const allParameters = new Set<string>();
  gtmEvents.forEach(event => {
    event.parameters.forEach(param => allParameters.add(param));
  });

  const registeredParams = [...allParameters].filter(p => registeredDimensions.has(p));
  const notRegisteredParams = [...allParameters].filter(p => !registeredDimensions.has(p));

  // 3단계: 등록된 파라미터만 효율적으로 조회 (파라미터당 1번)
  const parameterData: Record<string, Record<string, number>> = {};

  log(`Querying ${registeredParams.length} parameters (optimized: ${registeredParams.length} API calls instead of ${gtmEvents.length * registeredParams.length})...`);

  for (const param of registeredParams) {
    try {
      const reportResponse = await dataClient.properties.runReport({
        property: propertyResource,
        requestBody: {
          dateRanges: [dateRange],
          dimensions: [
            { name: 'eventName' },
            { name: `customEvent:${param}` }
          ],
          metrics: [{ name: 'eventCount' }],
          limit: "500"
        }
      });
      apiCalls++;

      parameterData[param] = {};
      const responseData = reportResponse.data as { rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> };
      const rows = responseData.rows || [];
      for (const row of rows) {
        const eventName = row.dimensionValues?.[0]?.value || '';
        const paramValue = row.dimensionValues?.[1]?.value || '';
        const count = parseInt(row.metricValues?.[0]?.value || '0');

        if (paramValue && paramValue !== '(not set)' && count > 0) {
          parameterData[param][eventName] = (parameterData[param][eventName] || 0) + count;
        }
      }
    } catch (error) {
      log(`Error querying parameter ${param}: ${error}`);
    }
  }

  // 4단계: 결과 집계
  const results: ValidationResult[] = [];
  let collected = 0;
  let notCollected = 0;
  let notRegistered = 0;

  for (const event of gtmEvents) {
    for (const param of event.parameters) {
      if (!registeredDimensions.has(param)) {
        results.push({
          eventName: event.eventName,
          parameter: param,
          status: 'not_registered',
          message: `파라미터 '${param}'이 GA4 커스텀 디멘션에 등록되지 않음`
        });
        notRegistered++;
      } else {
        const count = parameterData[param]?.[event.eventName] || 0;
        if (count > 0) {
          results.push({
            eventName: event.eventName,
            parameter: param,
            status: 'collected',
            count,
            message: `정상 수집 (${count.toLocaleString()}건)`
          });
          collected++;
        } else {
          results.push({
            eventName: event.eventName,
            parameter: param,
            status: 'not_collected',
            count: 0,
            message: `커스텀 디멘션 등록됨, 데이터 미수집`
          });
          notCollected++;
        }
      }
    }
  }

  // 5단계: 권장사항 생성
  const recommendations: string[] = [];

  if (notRegisteredParams.length > 0) {
    recommendations.push(
      `GA4 Admin에서 다음 파라미터를 커스텀 디멘션으로 등록하세요: ${notRegisteredParams.join(', ')}`
    );
  }

  const notCollectedByEvent: Record<string, string[]> = {};
  results
    .filter(r => r.status === 'not_collected')
    .forEach(r => {
      if (!notCollectedByEvent[r.eventName]) {
        notCollectedByEvent[r.eventName] = [];
      }
      notCollectedByEvent[r.eventName].push(r.parameter);
    });

  for (const [eventName, params] of Object.entries(notCollectedByEvent)) {
    recommendations.push(
      `이벤트 '${eventName}'에서 다음 파라미터가 수집되지 않음: ${params.join(', ')}`
    );
  }

  return {
    totalEvents: gtmEvents.length,
    totalParameters: allParameters.size,
    collected,
    notCollected,
    notRegistered,
    details: results,
    recommendations,
    apiCalls
  };
}

/**
 * GTM Export JSON에서 이벤트-파라미터 추출
 *
 * GTM GA4 Event 태그는 두 가지 방식으로 파라미터를 저장:
 * 1. eventParameters (구형): list[].map[].key='name'
 * 2. eventSettingsTable (신형): list[].map[].key='parameter'
 */
export function parseGTMExport(gtmExportJson: Record<string, unknown>): GTMEventConfig[] {
  const events: GTMEventConfig[] = [];
  const container = (gtmExportJson.containerVersion || gtmExportJson) as Record<string, unknown>;
  const tags = (container.tag || []) as Array<Record<string, unknown>>;

  for (const tag of tags) {
    // GA4 Event 태그 찾기 (gaawe = GA4 Event, gaawc = GA4 Configuration)
    if (tag.type === 'gaawe') {
      const parameters = tag.parameter as Array<{ key: string; value?: string; list?: Array<{ map?: Array<{ key: string; value?: string }> }> }> | undefined;
      const eventNameParam = parameters?.find(p => p.key === 'eventName');
      let eventName = eventNameParam?.value || '';

      // GTM 변수 참조인 경우 ({{...}}) 태그 이름에서 추출 시도
      if (eventName.startsWith('{{') && eventName.endsWith('}}')) {
        const tagName = tag.name as string || '';
        // 태그 이름에서 이벤트명 추론 (예: "GA4 - Basic Event - Login" → "login")
        const match = tagName.match(/(?:GA4\s*-\s*(?:Basic Event|Ecommerce)\s*-\s*)(.+)/i);
        if (match) {
          eventName = match[1].toLowerCase().replace(/\s+/g, '_');
        }
      }

      const eventParams: string[] = [];

      // 방법 1: eventParameters (구형 방식)
      const eventParamsConfig = parameters?.find(p => p.key === 'eventParameters');
      if (eventParamsConfig?.list) {
        for (const param of eventParamsConfig.list) {
          const paramName = param.map?.find(m => m.key === 'name')?.value;
          if (paramName && !paramName.startsWith('{{')) {
            eventParams.push(paramName);
          }
        }
      }

      // 방법 2: eventSettingsTable (신형 방식)
      const eventSettingsTable = parameters?.find(p => p.key === 'eventSettingsTable');
      if (eventSettingsTable?.list) {
        for (const param of eventSettingsTable.list) {
          const paramName = param.map?.find(m => m.key === 'parameter')?.value;
          if (paramName && !paramName.startsWith('{{')) {
            eventParams.push(paramName);
          }
        }
      }

      // 방법 3: userProperties (사용자 속성)
      const userPropsConfig = parameters?.find(p => p.key === 'userProperties');
      if (userPropsConfig?.list) {
        for (const param of userPropsConfig.list) {
          const paramName = param.map?.find(m => m.key === 'name')?.value;
          if (paramName && !paramName.startsWith('{{')) {
            eventParams.push(paramName);
          }
        }
      }

      if (eventName && eventParams.length > 0) {
        events.push({ eventName, parameters: eventParams });
      }
    }
  }

  return events;
}

// MCP 도구 정의
export const gtmValidatorToolDefinition = {
  name: 'ga4_validate_gtm_params',
  description: `GTM에서 보내는 이벤트 파라미터가 GA4에 제대로 수집되는지 검증합니다.

## 사용 방법

### 방법 1: GTM 이벤트 목록 직접 전달
gtmEvents 배열로 이벤트별 파라미터를 전달합니다.

### 방법 2: GTM Container Export JSON 전달
GTM에서 컨테이너를 Export한 JSON 파일 내용을 gtmExportJson으로 전달하면 자동으로 파싱합니다.

## 검증 항목
1. 파라미터가 GA4 커스텀 디멘션으로 등록되어 있는지
2. 등록된 파라미터가 실제로 데이터를 수집하고 있는지
3. 미등록/미수집 파라미터에 대한 권장사항

## API 호출 효율성
- 기존: 이벤트 수 × 파라미터 수 = N×M 호출
- 최적화: 1(메타데이터) + 고유 파라미터 수 = 1+P 호출`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      propertyId: {
        type: 'string',
        description: 'GA4 속성 ID (예: 419573056)'
      },
      gtmEvents: {
        type: 'array',
        description: 'GTM에서 설정한 이벤트-파라미터 목록',
        items: {
          type: 'object',
          properties: {
            eventName: { type: 'string' },
            parameters: { type: 'array', items: { type: 'string' } }
          },
          required: ['eventName', 'parameters']
        }
      },
      gtmExportJson: {
        type: 'object',
        description: 'GTM Container Export JSON (gtmEvents 대신 사용 가능)'
      },
      startDate: {
        type: 'string',
        description: '시작일 (기본: 7daysAgo)'
      },
      endDate: {
        type: 'string',
        description: '종료일 (기본: yesterday)'
      }
    },
    required: ['propertyId']
  }
};

export async function handleGTMValidation(args: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const propertyId = args.propertyId as string;

    let gtmEvents: GTMEventConfig[];

    if (args.gtmExportJson) {
      gtmEvents = parseGTMExport(args.gtmExportJson as Record<string, unknown>);
      if (gtmEvents.length === 0) {
        return createErrorResponse('GTM Export JSON에서 GA4 이벤트 태그를 찾을 수 없습니다', null);
      }
    } else if (args.gtmEvents) {
      gtmEvents = args.gtmEvents as GTMEventConfig[];
    } else {
      return createErrorResponse('gtmEvents 또는 gtmExportJson 중 하나는 필수입니다', null);
    }

    const dateRange = {
      startDate: (args.startDate as string) || '7daysAgo',
      endDate: (args.endDate as string) || 'yesterday'
    };

    const result = await validateGTMParameters(propertyId, gtmEvents, dateRange);
    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse('GTM 파라미터 검증 실패', error);
  }
}
