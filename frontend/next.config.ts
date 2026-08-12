import type { NextConfig } from "next";

function apiOrigin() {
  const configured =
    process.env.API_INTERNAL_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.VITE_API_BASE_URL ??
    "http://localhost:8000";
  return configured.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.108"],
  env: {
    NEXT_PUBLIC_KAKAO_JS_KEY:
      process.env.NEXT_PUBLIC_KAKAO_JS_KEY ??
      process.env.VITE_KAKAO_MAP_KEY ??
      "",
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin()}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        {
          key: "Content-Security-Policy",
          value: `default-src 'self'; img-src 'self' data: blob: http://127.0.0.1:8000 http://localhost:8000 http://192.168.0.108:8000 https://*.daumcdn.net https://*.kakaocdn.net http://*.daumcdn.net http://*.kakaocdn.net; connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 http://192.168.0.108:8000 https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net http://dapi.kakao.com http://*.daumcdn.net http://*.kakaocdn.net; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net http://dapi.kakao.com http://*.daumcdn.net http://*.kakaocdn.net${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`,
        },
      ],
    }];
  },
};

export default nextConfig;
