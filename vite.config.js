import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { transform } from 'lightningcss';

// 윈도우 7 PC의 크롬(최대 109 버전)은 최신 색 표기(oklch 등)를 몰라서 색이 사라집니다.
// 빌드할 때 옛날 크롬도 이해하는 색(#155dfc 등)을 함께 넣어 줍니다. 최신 크롬은 원래 색을 그대로 씁니다.
const OLD_CHROME = 87;
function oldBrowserCss() {
  return {
    name: 'old-browser-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        const { code } = transform({
          filename: file.fileName,
          code: Buffer.from(file.source),
          minify: true,
          targets: { chrome: OLD_CHROME << 16 },
        });
        file.source = code.toString();
      }
    },
  };
}

// 화면에 보이는 버전 = 화면 파일을 만든 시각 (한국 시간, 예: 09-28 14:05)
function buildTime() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// 개발 중(npm run dev)에는 데이터 요청을 공유 서버(npm start, 3000번 포트)로 넘깁니다.
export default defineConfig({
  plugins: [react(), tailwindcss(), oldBrowserCss()],
  define: { __BUILD_TIME__: JSON.stringify(buildTime()) },
  build: { target: `chrome${OLD_CHROME}` },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
