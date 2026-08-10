import { createApiClient } from "@metrotrip/contracts";

// 기본은 Next의 동일 출처 API 프록시다. 외부 API를 직접 노출하는 배포에서만 환경변수로 덮어쓴다.
const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const apiBaseUrl = configuredBaseUrl.replace(/\/api\/v1\/?$/, "");

export const api = createApiClient(apiBaseUrl);

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

api.use({
  async onRequest({ request }) {
    if (accessToken) request.headers.set("Authorization", `Bearer ${accessToken}`);
    request.headers.set("X-Client-Platform", "web");
    return request;
  },
});
