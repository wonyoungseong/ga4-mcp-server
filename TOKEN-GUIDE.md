# GA4 & GTM MCP Server - Token Guide

## 통합 토큰 관리

GA4와 GTM MCP 서버는 **하나의 공유 토큰 파일**을 사용합니다.

### 토큰 파일 위치
```
~/.claude/mcp-tokens/google.json
```

### 파일 형식
```json
{ "access_token": "ya29.a0..." }
```

---

## 토큰 우선순위

### GA4 MCP Server
| 순위 | 방법 | 경로 |
|-----|------|------|
| 1 | OAuth (환경변수) | `GA4_ACCESS_TOKEN` + refresh 관련 변수 |
| 2 | OAuth (파일) | `~/.ga4-mcp/tokens.json` (full OAuth) |
| 3 | ADC (gcloud) | `~/.config/gcloud/application_default_credentials.json` |
| 4 | Service Account | `GOOGLE_APPLICATION_CREDENTIALS` |
| **5** | **공유 토큰** | **`~/.claude/mcp-tokens/google.json`** |
| 6 | GTM 토큰 (legacy) | `~/.gtm-mcp/access-token.json` |
| 7 | GA4 토큰 (legacy) | `~/.ga4-mcp/tokens.json` |

### GTM MCP Server
| 순위 | 방법 | 경로 |
|-----|------|------|
| 1 | 환경변수 JSON | `GTM_ACCESS_TOKEN_JSON` |
| 2 | 환경변수 plain | `GTM_ACCESS_TOKEN` |
| **3** | **공유 토큰** | **`~/.claude/mcp-tokens/google.json`** |
| 4 | GTM 토큰 (legacy) | `~/.gtm-mcp/access-token.json` |

---

## 토큰 업데이트 방법

### 권장: 공유 토큰 파일 업데이트
```bash
# 이 파일만 업데이트하면 GTM과 GA4 모두 적용됩니다
echo '{ "access_token": "새토큰값" }' > ~/.claude/mcp-tokens/google.json
```

### 자동 감지
- GA4 MCP 서버는 토큰 파일 변경을 **자동 감지**합니다
- 파일이 변경되면 MCP 서버 재시작 없이 새 토큰 사용

---

## 토큰 발급 방법

### Google OAuth Playground 사용
1. https://developers.google.com/oauthplayground/ 접속
2. 필요한 스코프 선택:
   - `https://www.googleapis.com/auth/tagmanager.edit.containers`
   - `https://www.googleapis.com/auth/analytics.readonly`
3. Authorize APIs 클릭
4. Exchange authorization code for tokens 클릭
5. Access Token 복사

---

## 폴더 구조

```
~/.claude/
├── mcp-tokens/
│   └── google.json    ← GA4 + GTM 공유 토큰 (권장)
├── settings.json
└── ...

~/.gtm-mcp/              ← Legacy (하위 호환)
└── access-token.json

~/.ga4-mcp/              ← Legacy (하위 호환)
└── tokens.json
```
