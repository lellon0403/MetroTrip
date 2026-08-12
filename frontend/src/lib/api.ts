import { createApiClient } from "@metrotrip/contracts";
import { legacyApiFetch } from "./legacyApiAdapter";

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const apiBaseUrl = configuredBaseUrl.replace(/\/api\/v1\/?$/, "");

export const api = createApiClient(apiBaseUrl, legacyApiFetch);

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export async function checkSignupAvailability(kind: "email" | "nickname", value: string) {
  const response = await globalThis.fetch(`/api/v1/auth/${kind}-availability?${kind}=${encodeURIComponent(value)}`, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.message ?? "중복 여부를 확인하지 못했습니다."));
  return Boolean(data?.available);
}

export async function applyToRecruitment(recruitmentId: string) {
  const base = apiBaseUrl || "";
  const response = await globalThis.fetch(
    `${base}/api/v1/posts/${encodeURIComponent(recruitmentId)}/participants`,
    {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.message ?? data?.detail ?? "참여 신청을 처리하지 못했습니다."));
  }
  return data;
}

export type PublicRecruitmentPlan = {
  planTitle: string;
  startStationId: number;
  startStationName: string;
  endStationId: number;
  endStationName: string;
  items: Array<{ planItemId: number; placeName: string; stationName: string | null; visitTime: string; memo: string | null }>;
};

export async function getRecruitmentPlan(recruitmentId: string): Promise<PublicRecruitmentPlan | null> {
  const base = apiBaseUrl || "";
  const response = await globalThis.fetch(`${base}/api/v1/posts/${encodeURIComponent(recruitmentId)}/plan`, { cache: "no-store" });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.message ?? "연결 일정을 불러오지 못했습니다."));
  return data as PublicRecruitmentPlan;
}

function validationMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as {
    details?: { errors?: Array<{ loc?: unknown[]; msg?: string }> };
    error?: { details?: { errors?: Array<{ loc?: unknown[]; msg?: string }> } };
  };
  const errors = payload.details?.errors ?? payload.error?.details?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const labels: Record<string, string> = {
    code: "인증번호",
    email: "이메일",
    password: "비밀번호",
    passwordConfirm: "비밀번호 확인",
    name: "이름",
    nickname: "닉네임",
    emailVerificationToken: "이메일 인증",
  };
  return errors
    .map((item) => {
      const field = String(item.loc?.at(-1) ?? "입력값");
      return `${labels[field] ?? field}: ${item.msg ?? "형식을 확인해 주세요."}`;
    })
    .join("\n");
}

export async function legacyPublicPost(path: string, body: Record<string, unknown>) {
  const response = await globalThis.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const validation = validationMessage(data);
    if (validation) throw new Error(validation);
    const detail = typeof data?.detail === "string" ? data.detail : "요청을 처리하지 못했습니다.";
    throw new Error(String(data?.message ?? data?.error?.message ?? data?.detail ?? detail));
  }
  return data;
}

api.use({
  async onRequest({ request }) {
    if (accessToken) request.headers.set("Authorization", `Bearer ${accessToken}`);
    request.headers.set("X-Client-Platform", "web");
    return request;
  },
});
