#!/usr/bin/env node

import { google } from 'googleapis';
import { createServer } from 'http';
import { URL } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';

// Configuration
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];
const TOKEN_PATH = join(homedir(), '.ga4-mcp', 'tokens.json');

console.log(`
╔═══════════════════════════════════════════════════════════╗
║           GA4 MCP Server - OAuth 로그인 설정              ║
╚═══════════════════════════════════════════════════════════╝
`);

// Get client credentials from environment variables
const clientId = process.env.GA4_CLIENT_ID;
const clientSecret = process.env.GA4_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ OAuth 클라이언트 정보가 필요합니다.\n');
  console.error('환경 변수를 설정해주세요:');
  console.error('  export GA4_CLIENT_ID="your-client-id"');
  console.error('  export GA4_CLIENT_SECRET="your-client-secret"\n');
  console.error('Google Cloud Console에서 OAuth 2.0 클라이언트를 생성하세요:');
  console.error('  https://console.cloud.google.com/apis/credentials\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force consent to get refresh token
});

console.log('📋 Google Analytics 읽기 권한으로 로그인합니다.\n');

// Open browser
function openBrowser(url) {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.log('⚠️  브라우저를 자동으로 열 수 없습니다.');
      console.log('   아래 URL을 브라우저에 직접 붙여넣기 하세요:\n');
      console.log(`   ${url}\n`);
    }
  });
}

// Start local server to receive callback
const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname === '/callback') {
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>❌ 로그인 실패</h1>
            <p>오류: ${error}</p>
            <p>터미널로 돌아가세요.</p>
          </body>
        </html>
      `);
      console.log(`\n❌ 로그인 실패: ${error}`);
      server.close();
      process.exit(1);
    }

    if (code) {
      try {
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        // Save tokens
        const tokenData = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          expiry_date: tokens.expiry_date,
          token_type: tokens.token_type,
          scope: tokens.scope,
        };

        // Create directory if not exists
        const dir = join(homedir(), '.ga4-mcp');
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✅ 로그인 성공!</h1>
              <p>GA4 MCP Server 인증이 완료되었습니다.</p>
              <p>이 창을 닫고 터미널로 돌아가세요.</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            </body>
          </html>
        `);

        console.log('\n✅ 로그인 성공!\n');
        console.log(`📁 토큰 저장 위치: ${TOKEN_PATH}\n`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('이제 GA4 MCP Server를 사용할 수 있습니다.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        server.close();
        process.exit(0);

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>❌ 토큰 교환 실패</h1>
              <p>${err.message}</p>
            </body>
          </html>
        `);
        console.log(`\n❌ 토큰 교환 실패: ${err.message}`);
        server.close();
        process.exit(1);
      }
    }
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 로컬 서버 시작: http://localhost:${PORT}\n`);
  console.log('🔗 브라우저에서 Google 로그인 페이지를 엽니다...\n');

  openBrowser(authUrl);

  console.log('⏳ Google 로그인을 완료해주세요...\n');
  console.log('   (Ctrl+C로 취소)\n');
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n❌ 설정 취소됨\n');
  server.close();
  process.exit(0);
});
