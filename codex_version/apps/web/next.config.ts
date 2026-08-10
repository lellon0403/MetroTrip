import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@metrotrip/contracts", "@metrotrip/design-tokens"],
  async rewrites() {
    const apiOrigin = (process.env.API_INTERNAL_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; img-src 'self' data: blob: http://127.0.0.1:59000 http://localhost:59000 https://*.daumcdn.net https://*.kakaocdn.net http://*.daumcdn.net http://*.kakaocdn.net; connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 http://127.0.0.1:59000 http://localhost:59000 https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net http://dapi.kakao.com http://*.daumcdn.net http://*.kakaocdn.net; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net http://dapi.kakao.com http://*.daumcdn.net http://*.kakaocdn.net${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` },
    ] }];
  },
};

export default nextConfig;
