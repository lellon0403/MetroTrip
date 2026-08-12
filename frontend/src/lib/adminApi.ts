import { getAccessToken } from "./api";

export type NoticeAdmin = { noticeId: number; title: string; content: string; noticeType: "ALARM" | "BOARD"; createdAt: string; updatedAt: string };
export type ReviewAdmin = { reviewId: number; title: string; authorNickname: string; startStationName: string; endStationName: string; createdAt: string };
export type PostAdmin = { postId: number; title: string; author: { nickname: string }; recruitment: { recruitStatus: string }; createdAt: string };
export type PlaceAdminInput = { placeName: string; category: string; description: string | null; address: string; latitude: number; longitude: number; phone: string | null; stationIds: number[]; imageUrls: string[] };
export type PlaceAdmin = PlaceAdminInput & { placeId: number; images: { imageUrl: string; sortOrder: number }[]; createdBy: number | null; createdAt: string; updatedAt: string };
export type TransitLine = { lineId: number; lineName: string };
export type TransitStation = { stationId: number; stationName: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.message ?? data?.detail ?? data?.error?.message ?? `요청 실패 (${response.status})`));
  return data as T;
}

export const adminApi = {
  listNotices: () => request<{ items: NoticeAdmin[] }>("/api/v1/notices?size=100"),
  createNotice: (body: { title: string; content: string; noticeType: string }) => request<NoticeAdmin>("/api/v1/admin/notices", { method: "POST", body: JSON.stringify(body) }),
  updateNotice: (id: number, body: { title: string; content: string; noticeType: string }) => request<NoticeAdmin>(`/api/v1/admin/notices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteNotice: (id: number) => request<void>(`/api/v1/admin/notices/${id}`, { method: "DELETE" }),
  listReviews: () => request<{ items: ReviewAdmin[] }>("/api/v1/reviews?size=100"),
  deleteReview: (id: number) => request<void>(`/api/v1/admin/reviews/${id}`, { method: "DELETE" }),
  listPosts: () => request<{ items: PostAdmin[] }>("/api/v1/posts?size=100"),
  deletePost: (id: number) => request<void>(`/api/v1/admin/posts/${id}`, { method: "DELETE" }),
  createPlace: (body: PlaceAdminInput) => request("/api/v1/admin/places", { method: "POST", body: JSON.stringify(body) }),
  updatePlace: (id: number, body: PlaceAdminInput) => request(`/api/v1/admin/places/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePlace: (id: number) => request<void>(`/api/v1/admin/places/${id}`, { method: "DELETE" }),
  listPlacesByStation: (stationId: number) => request<{ items: PlaceAdmin[] }>(`/api/v1/admin/places?station_id=${stationId}&size=100`),
  listLines: () => request<{ items: TransitLine[] }>("/api/v1/lines"),
  listStationsByLine: (lineId: number) => request<{ items: TransitStation[] }>(`/api/v1/stations?line_id=${lineId}&size=100`),
};
