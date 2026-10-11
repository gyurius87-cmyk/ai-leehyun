import { defineConfig } from 'astro/config';

// Vercel이 배포할 때 넣어주는 주소를 링크 미리보기(OG) 주소로 씁니다.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export default defineConfig({
  site: vercelHost ? `https://${vercelHost}` : 'http://localhost:4321',
  trailingSlash: 'ignore',
});
