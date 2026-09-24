import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// 개발 중(npm run dev)에는 데이터 요청을 공유 서버(npm start, 3000번 포트)로 넘깁니다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
