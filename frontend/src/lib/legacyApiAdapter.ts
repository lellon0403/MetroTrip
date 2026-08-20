/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  haversineMeters,
  mapLegacyApplication,
  mapLegacyPlan,
  mapLegacyPlanSummary,
  mapLegacyPlace,
  mapLegacyPlaceDetail,
  mapLegacyRecruitment,
  mapLegacyRecruitmentDetail,
  mapLegacyReview,
  mapLegacyStation,
  mapLegacyStationDetail,
  mapLegacyUser,
  normalizeMediaUrl,
  toLegacyCategory,
} from "./legacyMappers";
import { dateInSeoul } from "./date";

type Json = Record<string, any>;
type ForwardResult = { response: Response; data: any };

const REFRESH_KEY = "metrotrip.refreshToken";
const PLAN_METADATA_KEY = "metrotrip.planMetadata";
const stationCache = new Map<string, Json>();
const placeCache = new Map<string, Json>();
const mediaClaims = new Map<string, { uploadUrl: string; mediaUrl: string; mimeType: string }>();

function timetableClockToIso(serviceDate: string, value: unknown): string {
  const [hourText = "0", minuteText = "0", secondText = "0"] = String(value ?? "00:00:00").split(":");
  const totalMilliseconds = (
    Number(hourText) * 60 * 60
    + Number(minuteText) * 60
    + Number(secondText)
  ) * 1_000;
  const serviceStart = new Date(`${serviceDate}T00:00:00+09:00`).getTime();
  return new Date(serviceStart + totalMilliseconds).toISOString();
}

function storageGet(key: string): string | null {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); }
  catch { return null; }
}
function storageSet(key: string, value: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* 저장소 차단 시 서버 API는 계속 사용한다. */ }
}
function storageJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(storageGet(key) ?? "") as T; }
  catch { return fallback; }
}
function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}
function errorEnvelope(message: string, code = "LEGACY_API_ERROR") {
  return { error: { code, message, details: null } };
}
function unsupported(feature: string) {
  return json(errorEnvelope(`${feature} 기능은 현재 백엔드 API에서 아직 지원하지 않습니다.`, "NOT_SUPPORTED_BY_CURRENT_BACKEND"), 501);
}
async function requestBody(request: Request): Promise<Json> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  try { return (await request.clone().json()) as Json; }
  catch { return {}; }
}
async function forward(path: string, request: Request, init: RequestInit = {}): Promise<ForwardResult> {
  const headers = new Headers(init.headers);
  const authorization = request.headers.get("Authorization");
  if (authorization && !headers.has("Authorization")) headers.set("Authorization", authorization);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await globalThis.fetch(path, {
    method: init.method ?? request.method,
    headers,
    body: init.body,
    credentials: "include",
    cache: "no-store",
  });
  let data: any = null;
  try { data = await response.clone().json(); } catch { data = null; }
  return { response, data };
}
function backendError(result: ForwardResult) {
  const code = String(result.data?.code ?? result.data?.error?.code ?? result.response.headers.get("X-Error-Code") ?? `HTTP_${result.response.status}`);
  const message = String(result.data?.message ?? result.data?.error?.message ?? result.data?.detail ?? `백엔드 요청이 실패했습니다. (${code})`);
  return { code, message, details: result.data?.details ?? result.data?.error?.details ?? null };
}
function passthrough(result: ForwardResult) {
  if (result.response.ok) return json(result.data, result.response.status);
  return json({ error: backendError(result) }, result.response.status);
}
function page(items: any[], source?: Json) {
  return { items, nextCursor: null, total: Number(source?.totalElements ?? source?.total ?? items.length) };
}
function authResponse(token: Json, user: Json) {
  return { accessToken: String(token.accessToken ?? ""), expiresIn: Number(token.expiresIn ?? 900), user: mapLegacyUser(user) };
}
async function userForToken(token: Json, request: Request) {
  const result = await forward("/api/v1/users/me", request, { method: "GET", headers: { Authorization: `Bearer ${String(token.accessToken ?? "")}` } });
  return result.response.ok ? result.data : null;
}
function dateOnly(value: unknown) {
  const source = value ?? new Date();
  if (source instanceof Date) {
    return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}-${String(source.getDate()).padStart(2, "0")}`;
  }
  const text = String(source);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
function numeric(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "" ) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function encodeQuery(values: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function handleAuth(path: string, request: Request, body: Json): Promise<Response | null> {
  if (path === "/api/v1/auth/login" && request.method === "POST") {
    const token = await forward("/api/v1/auth/login", request, { method: "POST", body: JSON.stringify(body) });
    if (!token.response.ok) return passthrough(token);
    storageSet(REFRESH_KEY, String(token.data.refreshToken ?? ""));
    const user = await userForToken(token.data, request);
    return user ? json(authResponse(token.data, user)) : json(errorEnvelope("사용자 정보를 불러오지 못했습니다."), 502);
  }
  if (path === "/api/v1/auth/register" && request.method === "POST") {
    const legacy = {
      email: body.email,
      password: body.password,
      passwordConfirm: body.passwordConfirm ?? body.password,
      name: body.name ?? body.displayName,
      nickname: body.nickname ?? body.displayName,
      termsAgreed: body.termsAgreed ?? true,
      privacyAgreed: body.privacyAgreed ?? true,
      emailVerificationToken: body.emailVerificationToken,
    };
    const registered = await forward("/api/v1/auth/register", request, { method: "POST", body: JSON.stringify(legacy) });
    if (!registered.response.ok) return passthrough(registered);
    const token = await forward("/api/v1/auth/login", request, { method: "POST", body: JSON.stringify({ email: body.email, password: body.password }) });
    if (!token.response.ok) return passthrough(token);
    storageSet(REFRESH_KEY, String(token.data.refreshToken ?? ""));
    const user = await userForToken(token.data, request);
    return user ? json(authResponse(token.data, user), 201) : json(errorEnvelope("가입 후 사용자 정보를 불러오지 못했습니다."), 502);
  }
  if (path === "/api/v1/auth/refresh" && request.method === "POST") {
    const refreshToken = storageGet(REFRESH_KEY);
    if (!refreshToken) return json(errorEnvelope("저장된 로그인 세션이 없습니다.", "NO_REFRESH_TOKEN"), 401);
    const token = await forward("/api/v1/auth/refresh", request, { method: "POST", body: JSON.stringify({ refreshToken }) });
    if (!token.response.ok) { storageSet(REFRESH_KEY, null); return passthrough(token); }
    storageSet(REFRESH_KEY, String(token.data.refreshToken ?? ""));
    const user = await userForToken(token.data, request);
    return user ? json(authResponse(token.data, user)) : json(errorEnvelope("사용자 정보를 불러오지 못했습니다."), 502);
  }
  if (path === "/api/v1/auth/logout" && request.method === "POST") {
    const result = await forward("/api/v1/auth/logout", request, { method: "POST", body: JSON.stringify({}) });
    storageSet(REFRESH_KEY, null);
    return result.response.ok ? json({ message: "로그아웃했습니다." }) : passthrough(result);
  }
  if (path === "/api/v1/auth/password-reset/request" && request.method === "POST") {
    const result = await forward("/api/v1/auth/password-reset/requests", request, { method: "POST", body: JSON.stringify({ email: body.email, purpose: "PASSWORD_RESET" }) });
    return result.response.ok ? json({ message: result.data?.message ?? "인증 코드를 전송했습니다.", debugCode: null }, 202) : passthrough(result);
  }
  if (path === "/api/v1/auth/password-reset/confirm" && request.method === "POST") {
    const result = await forward(path, request, { method: "POST", body: JSON.stringify({ email: body.email, code: body.code, purpose: "PASSWORD_RESET", newPassword: body.newPassword, newPasswordConfirm: body.newPasswordConfirm ?? body.newPassword }) });
    return result.response.ok ? json({ message: result.data?.message ?? "비밀번호를 변경했습니다." }) : passthrough(result);
  }
  return null;
}

async function handleStations(path: string, url: URL, request: Request): Promise<Response | null> {
  if (path === "/api/v1/lines" && request.method === "GET") {
    const result = await forward("/api/v1/lines", request);
    return result.response.ok ? json((result.data?.items ?? []).map((line: Json) => ({ id: String(line.lineId), name: line.lineName, shortName: line.lineNumber ?? line.lineName, color: "#0052a4", textColor: "#fff" }))) : passthrough(result);
  }
  if (path === "/api/v1/stations" && request.method === "GET") {
    const result = await forward(`/api/v1/stations${encodeQuery({ keyword: url.searchParams.get("query"), page: url.searchParams.get("cursor") ?? 1, size: url.searchParams.get("limit") ?? 100 })}`, request);
    if (!result.response.ok) return passthrough(result);
    const items = (result.data?.items ?? []).map((item: Json) => { stationCache.set(String(item.stationId), item); return mapLegacyStation(item); });
    return json({ items, nextCursor: null });
  }
  const detail = path.match(/^\/api\/v1\/stations\/([^/]+)$/);
  if (detail && request.method === "GET") {
    const result = await forward(`/api/v1/stations/${detail[1]}`, request);
    if (!result.response.ok) return passthrough(result);
    stationCache.set(detail[1], result.data);
    return json(mapLegacyStationDetail(result.data));
  }
  const departures = path.match(/^\/api\/v1\/stations\/([^/]+)\/departures$/);
  if (departures && request.method === "GET") {
    let station = stationCache.get(departures[1]);
    if (!station) {
      const loaded = await forward(`/api/v1/stations/${departures[1]}`, request);
      if (!loaded.response.ok) return passthrough(loaded);
      station = loaded.data;
      stationCache.set(departures[1], station as Json);
    }
    const lineId = station?.lines?.[0]?.lineId;
    if (!lineId) return json({ stationId: departures[1], items: [], lastImportedAt: null, realtime: false });
    const day = new Date().getDay();
    const dayType = day === 0 || day === 6 ? "WEEKEND" : "WEEKDAY";
    const results = await Promise.all(["UP", "DOWN"].map((direction) => forward(`/api/v1/stations/${departures[1]}/timetables${encodeQuery({ line_id: lineId, day_type: dayType, direction })}`, request)));
    const serviceDate = dateInSeoul();
    const items = results.flatMap((result, directionIndex) => (result.data?.items ?? []).map((item: Json, index: number) => ({
      tripId: `${departures[1]}-${directionIndex}-${index}`,
      headsign: String(item.destinationStationName ?? item.destination ?? ""),
      direction: directionIndex,
      serviceDate,
      scheduledAt: timetableClockToIso(serviceDate, item.departureTime ?? item.time),
      dataBasis: "FIXTURE",
    }))).sort((left, right) => String(left.scheduledAt).localeCompare(String(right.scheduledAt)));
    return json({ stationId: departures[1], items, lastImportedAt: null, realtime: false });
  }  return null;
}
async function nearestStation(latitude: number, longitude: number, request: Request) {
  if (!stationCache.size) {
    const loaded = await forward("/api/v1/stations?size=100", request);
    if (loaded.response.ok) for (const item of loaded.data?.items ?? []) stationCache.set(String(item.stationId), item);
  }
  let nearest: Json | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const station of stationCache.values()) {
    const current = haversineMeters({ latitude, longitude }, { latitude: numeric(station.latitude), longitude: numeric(station.longitude) });
    if (current < distance) { nearest = station; distance = current; }
  }
  return nearest;
}

async function handlePlaces(path: string, url: URL, request: Request, body: Json): Promise<Response | null> {
  if (path === "/api/v1/places/nearby" && request.method === "GET") {
    let stationId = url.searchParams.get("station_id");
    let station = stationId ? stationCache.get(stationId) : null;
    if (!stationId) {
      const latitude = numeric(url.searchParams.get("latitude"), NaN);
      const longitude = numeric(url.searchParams.get("longitude"), NaN);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) station = await nearestStation(latitude, longitude, request);
      stationId = station ? String(station.stationId) : null;
    }
    if (!stationId) return json(errorEnvelope("장소를 조회할 기준 역을 찾지 못했습니다."), 422);
    if (!station) {
      const loaded = await forward(`/api/v1/stations/${stationId}`, request);
      if (loaded.response.ok) { station = loaded.data; stationCache.set(stationId, station as Json); }
    }
    const categories = url.searchParams.getAll("category").flatMap((value) => value.split(",")).filter(Boolean);
    const requestedCategories = categories.length ? categories : ["FOOD", "CAFE"];
    const legacyCategories = [...new Set(requestedCategories.map(toLegacyCategory))];
    const results = await Promise.all(legacyCategories.map((category) => forward(`/api/v1/stations/${stationId}/places${encodeQuery({ category, size: 100 })}`, request)));
    const unique = new Map<string, Json>();
    for (const result of results) if (result.response.ok) for (const item of result.data?.items ?? []) unique.set(String(item.placeId), item);
    const center = {
      latitude: numeric(url.searchParams.get("latitude"), numeric(station?.latitude)),
      longitude: numeric(url.searchParams.get("longitude"), numeric(station?.longitude)),
    };
    const radius = Math.min(1000, numeric(url.searchParams.get("radius_meters"), 1000));
    const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();
    const items = [...unique.values()].map((item) => {
      const distance = haversineMeters(center, { latitude: numeric(item.latitude), longitude: numeric(item.longitude) });
      placeCache.set(String(item.placeId), { ...item, distanceMeters: distance });
      return mapLegacyPlace(item, distance);
    }).filter((item) => item.distanceMeters === null || item.distanceMeters <= radius)
      .filter((item) => !query || item.name.toLowerCase().includes(query) || item.address.toLowerCase().includes(query));
    return json({ items, sourceMode: "STALE", radiusMeters: radius, center });
  }
  const detail = path.match(/^\/api\/v1\/places\/([^/]+)$/);
  if (detail && request.method === "GET") {
    const item = placeCache.get(detail[1]);
    return item ? json(mapLegacyPlaceDetail(item, item.distanceMeters)) : json(errorEnvelope("먼저 지도에서 해당 역의 장소 목록을 불러와 주세요.", "PLACE_NOT_CACHED"), 404);
  }
  if (path === "/api/v1/routes/compare" && request.method === "POST") {
    const station = stationCache.get(String(body.origin?.id));
    const place = placeCache.get(String(body.destination?.id));
    if (!station || !place) return json(errorEnvelope("경로 계산에 필요한 위치 정보가 없습니다."), 422);
    const distanceMeters = haversineMeters({ latitude: numeric(station.latitude), longitude: numeric(station.longitude) }, { latitude: numeric(place.latitude), longitude: numeric(place.longitude) });
    const durationMinutes = Math.max(1, Math.ceil(distanceMeters / 67));
    return json({
      originLabel: `${String(station.stationName ?? "")}역`,
      destinationLabel: String(place.placeName ?? "장소"),
      options: [{
        id: `walk-${String(body.origin?.id)}-${String(body.destination?.id)}`,
        mode: "WALK",
        distanceMeters,
        durationMinutes,
        transfers: 0,
        segments: [],
        dataBasis: "LOCAL_ESTIMATE",
        estimated: true,
        algorithmVersion: "haversine-v1",
        path: [
          { latitude: numeric(station.latitude), longitude: numeric(station.longitude) },
          { latitude: numeric(place.latitude), longitude: numeric(place.longitude) },
        ],
      }],
      generatedAt: new Date().toISOString(),
      realtime: false,
    });
  }
  return null;
}

async function reauthenticate(request: Request, password: string, purpose: string) {
  return forward("/api/v1/auth/reauthenticate", request, { method: "POST", body: JSON.stringify({ password, purpose }) });
}

async function handleMe(path: string, request: Request, body: Json): Promise<Response | null> {
  if (path === "/api/v1/me" && request.method === "PATCH") {
    if (!body.password) return json(errorEnvelope("프로필 변경을 위해 현재 비밀번호를 입력해 주세요.", "REAUTHENTICATION_REQUIRED"), 422);
    const verified = await reauthenticate(request, String(body.password), "PROFILE_UPDATE");
    if (!verified.response.ok) return passthrough(verified);
    const result = await forward("/api/v1/users/me", request, { method: "PATCH", headers: { "X-Reauthentication-Token": String(verified.data.verificationToken) }, body: JSON.stringify({ nickname: body.displayName }) });
    return result.response.ok ? json(mapLegacyUser(result.data)) : passthrough(result);
  }
  if (path === "/api/v1/me" && request.method === "DELETE") {
    const verified = await reauthenticate(request, String(body.password ?? ""), "WITHDRAWAL");
    if (!verified.response.ok) return passthrough(verified);
    const result = await forward("/api/v1/users/me", request, { method: "DELETE", headers: { "X-Reauthentication-Token": String(verified.data.verificationToken) } });
    if (result.response.ok) { storageSet(REFRESH_KEY, null); return json({ message: "회원 탈퇴가 완료되었습니다." }); }
    return passthrough(result);
  }
  if (path === "/api/v1/me/password" && request.method === "PATCH") {
    const verified = await reauthenticate(request, String(body.currentPassword ?? ""), "PASSWORD_CHANGE");
    if (!verified.response.ok) return passthrough(verified);
    const result = await forward("/api/v1/users/me/password", request, {
      method: "PATCH",
      headers: { "X-Reauthentication-Token": String(verified.data.verificationToken) },
      body: JSON.stringify({
        newPassword: body.newPassword,
        newPasswordConfirm: body.newPasswordConfirm,
      }),
    });
    if (!result.response.ok) return passthrough(result);
    storageSet(REFRESH_KEY, null);
    return json({ message: "비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요." });
  }
  if (path === "/api/v1/me/favorites" && request.method === "GET") {
    const result = await forward("/api/v1/users/me/favorites", request);
    if (!result.response.ok) return passthrough(result);
    const stations = (result.data?.items ?? []).map((item: Json) => ({ id: String(item.stationId), name: String(item.stationName), createdAt: String(item.createdAt) }));
    return json({ stations });
  }
  const favoriteStation = path.match(/^\/api\/v1\/me\/favorites\/stations\/([^/]+)$/);
  if (favoriteStation && (request.method === "PUT" || request.method === "DELETE")) {
    const result = await forward(`/api/v1/users/me/favorites/${favoriteStation[1]}`, request, { method: request.method === "PUT" ? "POST" : "DELETE", ...(request.method === "PUT" ? { body: JSON.stringify({}) } : {}) });
    return result.response.ok ? json({ stationId: favoriteStation[1], favorite: request.method === "PUT" }) : passthrough(result);
  }
  if (path === "/api/v1/me/reviews" && request.method === "GET") {
    const result = await forward("/api/v1/users/me/reviews?size=100", request);
    return result.response.ok ? json(page((result.data?.items ?? []).map((item: Json) => mapLegacyReview(item)), result.data)) : passthrough(result);
  }
  if (path === "/api/v1/me/recruitments" && request.method === "GET") {
    const result = await forward("/api/v1/users/me/posts?size=100", request);
    return result.response.ok ? json(page((result.data?.items ?? []).map(mapLegacyRecruitment), result.data)) : passthrough(result);
  }
  if (path === "/api/v1/me/recruitment-applications" && request.method === "GET") {
    const results = await Promise.all(["APPLIED", "ACCEPTED"].map((status) => forward(`/api/v1/users/me/participating-posts?status=${status}&size=100`, request)));
    const items = results.flatMap((result) => (result.data?.items ?? []).map((item: Json) => ({ ...mapLegacyApplication(item.participation ?? {}, String(item.postId)), recruitmentTitle: item.title, meetingAt: item.recruitment?.meetingDate ?? null })));
    return json(page(items));
  }
  return null;
}

type PlanMetadata = Record<string, { description?: string | null; startDate?: string; endDate?: string; status?: string; items?: Json[] }>;
function planMetadata() { return storageJson<PlanMetadata>(PLAN_METADATA_KEY, {}); }
function savePlanMetadata(value: PlanMetadata) { storageSet(PLAN_METADATA_KEY, JSON.stringify(value)); }
function planMetadataEntry(body: Json) {
  const items = Array.isArray(body.days)
    ? body.days.flatMap((day: Json) => Array.isArray(day.items) ? day.items : [])
      .map((item: Json) => ({
        itemType: item.itemType,
        stationId: item.stationId ?? null,
        placeId: item.placeId ?? null,
        routeSnapshot: item.routeSnapshot ?? null,
        note: item.note ?? null,
        scheduledTime: item.scheduledTime ?? null,
        durationMinutes: item.durationMinutes ?? null,
      }))
    : [];
  return {
    description: body.description ?? null,
    startDate: body.startDate,
    endDate: body.endDate,
    status: body.status,
    items,
  };
}
function legacyPlanWrite(body: Json) {
  const allItems = Array.isArray(body.days) ? body.days.flatMap((day: Json) => day.items ?? []) : [];
  const stationItems = allItems.filter((item: Json) => item.itemType === "STATION" && item.stationId);
  const placeItems = allItems.filter((item: Json) => item.itemType === "PLACE" && item.placeId);
  const startStationId = numeric(stationItems[0]?.stationId ?? placeItems[0]?.stationId);
  const endStationId = numeric(stationItems.at(-1)?.stationId ?? placeItems.at(-1)?.stationId ?? startStationId);
  let currentStationId = startStationId;
  const items = allItems.flatMap((item: Json, index: number) => {
    if (item.itemType === "STATION" && item.stationId) currentStationId = numeric(item.stationId);
    if (item.itemType !== "STATION" && item.itemType !== "PLACE") return [];
    const persistedId = Number(item.id);
    return [{
      ...(Number.isInteger(persistedId) && persistedId > 0 ? { planItemId: persistedId } : {}),
      itemType: item.itemType,
      placeId: item.itemType === "PLACE" ? numeric(item.placeId) : null,
      stationId: item.itemType === "STATION" ? numeric(item.stationId) : currentStationId || null,
      position: index + 1,
      visitTime: item.scheduledTime ?? (item.itemType === "PLACE" ? `${String(10 + index).padStart(2, "0")}:00:00` : null),
      memo: item.note ?? null,
    }];
  });
  return {
    planTitle: body.title,
    startStationId,
    endStationId: endStationId || startStationId,
    items,
  };
}

async function handlePlans(path: string, url: URL, request: Request, body: Json): Promise<Response | null> {
  const metadata = planMetadata();
  if (path === "/api/v1/plans" && request.method === "GET") {
    const result = await forward(`/api/v1/plans${encodeQuery({ size: url.searchParams.get("limit") ?? 100 })}`, request);
    return result.response.ok ? json(page((result.data?.items ?? []).map((item: Json) => mapLegacyPlanSummary(item, metadata[String(item.planId)])), result.data)) : passthrough(result);
  }
  if (path === "/api/v1/plans" && request.method === "POST") {
    const result = await forward("/api/v1/plans", request, { method: "POST", body: JSON.stringify(legacyPlanWrite(body)) });
    if (!result.response.ok) return passthrough(result);
    metadata[String(result.data.planId)] = planMetadataEntry(body);
    savePlanMetadata(metadata);
    return json(mapLegacyPlan(result.data, metadata[String(result.data.planId)]), 201);
  }
  const detail = path.match(/^\/api\/v1\/plans\/([^/]+)$/);
  if (detail && request.method === "GET") {
    const result = await forward(`/api/v1/plans/${detail[1]}`, request);
    return result.response.ok ? json(mapLegacyPlan(result.data, metadata[detail[1]])) : passthrough(result);
  }
  if (detail && request.method === "PUT") {
    const result = await forward(`/api/v1/plans/${detail[1]}`, request, { method: "PATCH", body: JSON.stringify(legacyPlanWrite(body)) });
    if (!result.response.ok) return passthrough(result);
    metadata[detail[1]] = planMetadataEntry(body);
    savePlanMetadata(metadata);
    return json(mapLegacyPlan(result.data, metadata[detail[1]]));
  }
  if (detail && request.method === "DELETE") {
    const result = await forward(`/api/v1/plans/${detail[1]}`, request, { method: "DELETE" });
    return result.response.ok ? new Response(null, { status: 204 }) : passthrough(result);
  }
  const share = path.match(/^\/api\/v1\/plans\/([^/]+)\/share-links$/);
  if (share && request.method === "POST") {
    const result = await forward(`/api/v1/plans/${share[1]}/share-links`, request, { method: "POST" });
    if (!result.response.ok) return passthrough(result);
    return json({
      id: `share-${share[1]}`,
      token: String(result.data.shareToken),
      urlPath: `/shared/plans/${String(result.data.shareToken)}`,
      expiresAt: result.data.expiresAt ?? null,
      maxUses: null,
    }, 201);
  }
  return null;
}
function legacyRecruitmentWrite(body: Json) {
  return {
    title: body.title,
    content: body.body,
    recruitCapacity: numeric(body.capacity, 1),
    recruitDeadline: dateOnly(body.deadline),
    meetingDate: body.meetingAt ? dateOnly(body.meetingAt) : null,
    planId: body.planId ? numeric(body.planId) : null,
  };
}

function mapPublicPlan(source: Json, key: string) {
  const today = dateOnly(new Date());
  const startId = source.startStationId ? String(source.startStationId) : null;
  const endId = source.endStationId ? String(source.endStationId) : null;
  const placeItems = (source.items ?? []).map((item: Json, index: number) => ({ id: String(item.planItemId), itemType: "PLACE", stationId: item.stationId ? String(item.stationId) : null, placeId: item.placeId ? String(item.placeId) : null, routeSnapshot: null, note: item.placeName ?? item.memo ?? null, scheduledTime: item.visitTime ?? null, durationMinutes: null, position: index + 2 }));
  const items = [
    { id: `${key}-start`, itemType: "STATION", stationId: startId, placeId: null, routeSnapshot: null, note: source.startStationName, scheduledTime: null, durationMinutes: null, position: 1 },
    ...placeItems,
    ...(endId && endId !== startId ? [{ id: `${key}-end`, itemType: "STATION", stationId: endId, placeId: null, routeSnapshot: null, note: source.endStationName, scheduledTime: null, durationMinutes: null, position: placeItems.length + 2 }] : []),
  ];
  const now = new Date().toISOString();
  return { id: key, ownerId: "", title: source.planTitle, description: null, startDate: today, endDate: today, visibility: "UNLISTED", status: "ACTIVE", version: 1, days: [{ id: `${key}-day-1`, dayDate: today, title: "1일차", position: 1, items }], createdAt: now, updatedAt: now, readOnly: true };
}

async function handleRecruitments(path: string, url: URL, request: Request, body: Json): Promise<Response | null> {
  if (path === "/api/v1/recruitments" && request.method === "GET") {
    const status = url.searchParams.get("status");
    const result = await forward(`/api/v1/posts${encodeQuery({ keyword: url.searchParams.get("query"), recruit_status: status === "OPEN" ? "RECRUITING" : status === "CLOSED" ? "CLOSED" : null, size: url.searchParams.get("limit") ?? 100 })}`, request);
    return result.response.ok ? json(page((result.data?.items ?? []).map(mapLegacyRecruitment), result.data)) : passthrough(result);
  }
  if (path === "/api/v1/recruitments" && request.method === "POST") {
    const result = await forward("/api/v1/posts", request, { method: "POST", body: JSON.stringify(legacyRecruitmentWrite(body)) });
    return result.response.ok ? json(mapLegacyRecruitmentDetail(result.data), 201) : passthrough(result);
  }
  const detail = path.match(/^\/api\/v1\/recruitments\/([^/]+)$/);
  if (detail && request.method === "GET") {
    const result = await forward(`/api/v1/posts/${detail[1]}`, request);
    return result.response.ok ? json(mapLegacyRecruitmentDetail(result.data)) : passthrough(result);
  }
  if (detail && request.method === "PUT") {
    const result = await forward(`/api/v1/posts/${detail[1]}`, request, { method: "PATCH", body: JSON.stringify(legacyRecruitmentWrite(body)) });
    return result.response.ok ? json(mapLegacyRecruitmentDetail(result.data)) : passthrough(result);
  }
  if (detail && request.method === "DELETE") {
    const result = await forward(`/api/v1/posts/${detail[1]}`, request, { method: "DELETE" });
    return result.response.ok ? new Response(null, { status: 204 }) : passthrough(result);
  }
  const linkedPlan = path.match(/^\/api\/v1\/recruitments\/([^/]+)\/plan$/);
  if (linkedPlan && request.method === "GET") {
    const result = await forward(`/api/v1/posts/${linkedPlan[1]}/plan`, request);
    return result.response.ok ? json(mapPublicPlan(result.data, `recruitment-${linkedPlan[1]}`)) : passthrough(result);
  }
  const comments = path.match(/^\/api\/v1\/recruitments\/([^/]+)\/comments$/);
  if (comments && request.method === "POST") {
    if (body.kind !== "APPLICATION") return unsupported("모집 질문 댓글");
    const result = await forward(`/api/v1/posts/${comments[1]}/participants`, request, { method: "POST", body: JSON.stringify({}) });
    return result.response.ok ? json({ id: String(result.data.participantId), recruitmentId: comments[1], kind: "APPLICATION", body: body.body, authorId: String(result.data.user?.userId ?? ""), authorName: String(result.data.user?.nickname ?? "신청자"), createdAt: result.data.appliedAt }) : passthrough(result);
  }
  const applications = path.match(/^\/api\/v1\/recruitments\/([^/]+)\/applications$/);
  if (applications && request.method === "GET") {
    const result = await forward(`/api/v1/posts/${applications[1]}/participants`, request);
    return result.response.ok ? json(page((result.data?.items ?? []).map((item: Json) => mapLegacyApplication(item, applications[1])))) : passthrough(result);
  }
  const mine = path.match(/^\/api\/v1\/recruitments\/([^/]+)\/applications\/me$/);
  if (mine && request.method === "DELETE") {
    const result = await forward(`/api/v1/posts/${mine[1]}/participants/me`, request, { method: "PATCH", body: JSON.stringify({ status: "CANCELED" }) });
    return result.response.ok ? json(mapLegacyApplication(result.data, mine[1])) : passthrough(result);
  }
  const decision = path.match(/^\/api\/v1\/recruitments\/([^/]+)\/applications\/([^/]+)$/);
  if (decision && request.method === "PUT") {
    const result = await forward(`/api/v1/posts/${decision[1]}/participants/${decision[2]}`, request, { method: "PATCH", body: JSON.stringify({ status: body.status }) });
    return result.response.ok ? json(mapLegacyApplication(result.data, decision[1])) : passthrough(result);
  }
  const close = path.match(/^\/api\/v1\/recruitments\/([^/]+)\/close$/);
  if (close && request.method === "POST") {
    const result = await forward(`/api/v1/posts/${close[1]}`, request, { method: "PATCH", body: JSON.stringify({ recruitStatus: "CLOSED" }) });
    return result.response.ok ? json(mapLegacyRecruitmentDetail(result.data)) : passthrough(result);
  }
  if (/\/reports$/.test(path)) return unsupported("모집 신고");
  return null;
}

function reviewContent(body: Json) {
  return (body.blocks ?? []).map((block: Json) => {
    if (block.kind === "PARAGRAPH") return String(block.text ?? "");
    if (block.kind === "IMAGE" && block.mediaId) {
      const media = mediaClaims.get(String(block.mediaId));
      return media ? `[[METROTRIP_IMAGE:${media.mediaUrl}]]` : "";
    }
    return "";
  }).filter(Boolean).join("\n\n").trim();
}
function reviewMedia(body: Json) {
  const ids = new Set<string>((body.blocks ?? []).filter((block: Json) => block.kind === "IMAGE" && block.mediaId).map((block: Json) => String(block.mediaId)));
  if (body.coverMediaId) ids.add(String(body.coverMediaId));
  return [...ids].map((id) => mediaClaims.get(id)).filter(Boolean).map((item) => ({ mediaUrl: item!.mediaUrl, mediaType: item!.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE" }));
}
function cacheReviewMedia(review: Json) {
  for (const item of Array.isArray(review.media) ? review.media : []) {
    if (!item.mediaId || !item.mediaUrl) continue;
    mediaClaims.set(String(item.mediaId), { uploadUrl: "", mediaUrl: normalizeMediaUrl(item.mediaUrl), mimeType: String(item.mediaType) === "VIDEO" ? "video/mp4" : "image/jpeg" });
  }
}
function legacyReviewWrite(body: Json) {
  const origin = numeric(body.originStationId);
  return {
    title: body.title,
    content: reviewContent(body),
    startStationId: origin,
    endStationId: numeric(body.destinationStationId, origin) || origin,
    rating: Math.max(1, Math.min(10, Math.round(numeric(body.rating, 5) * 2))),
    travelCost: body.costWon ?? null,
    planId: body.planId ? numeric(body.planId) : null,
    tags: body.tags ?? [],
    media: reviewMedia(body),
  };
}

async function handleReviews(path: string, url: URL, request: Request, body: Json): Promise<Response | null> {
  if (path === "/api/v1/reviews" && request.method === "GET") {
    const result = await forward(`/api/v1/reviews${encodeQuery({ keyword: url.searchParams.get("query"), tag: url.searchParams.get("tag"), size: url.searchParams.get("limit") ?? 100 })}`, request);
    return result.response.ok ? json(page((result.data?.items ?? []).map((item: Json) => mapLegacyReview(item)), result.data)) : passthrough(result);
  }
  if (path === "/api/v1/reviews" && request.method === "POST") {
    const result = await forward("/api/v1/reviews", request, { method: "POST", body: JSON.stringify(legacyReviewWrite(body)) });
    return result.response.ok ? json(mapLegacyReview(result.data, true), 201) : passthrough(result);
  }
  const detail = path.match(/^\/api\/v1\/reviews\/([^/]+)$/);
  if (detail && request.method === "GET") {
    const result = await forward(`/api/v1/reviews/${detail[1]}`, request);
    if (!result.response.ok) return passthrough(result);
    cacheReviewMedia(result.data);
    return json(mapLegacyReview(result.data, true));
  }
  if (detail && request.method === "PUT") {
    const result = await forward(`/api/v1/reviews/${detail[1]}`, request, { method: "PATCH", body: JSON.stringify(legacyReviewWrite(body)) });
    return result.response.ok ? json(mapLegacyReview(result.data, true)) : passthrough(result);
  }
  if (detail && request.method === "DELETE") {
    const result = await forward(`/api/v1/reviews/${detail[1]}`, request, { method: "DELETE" });
    return result.response.ok ? new Response(null, { status: 204 }) : passthrough(result);
  }
  const like = path.match(/^\/api\/v1\/reviews\/([^/]+)\/like$/);
  if (like) return unsupported("후기 도움돼요");
  if (/\/reviews\/[^/]+\/reports$/.test(path)) return unsupported("후기 신고");
  if (path === "/api/v1/media/claims" && request.method === "POST") {
    const result = await forward("/api/v1/review-media", request, { method: "POST", body: JSON.stringify({ fileName: body.filename, contentType: body.mimeType }) });
    if (!result.response.ok) return passthrough(result);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const uploadUrl = normalizeMediaUrl(result.data.uploadUrl);
    const mediaUrl = normalizeMediaUrl(result.data.mediaUrl);
    mediaClaims.set(id, { uploadUrl, mediaUrl, mimeType: String(body.mimeType) });
    return json({ id, uploadUrl, uploadHeaders: { "Content-Type": body.mimeType }, expiresAt: new Date(Date.now() + numeric(result.data.expiresIn, 900) * 1000).toISOString() }, 201);
  }
  const complete = path.match(/^\/api\/v1\/media\/claims\/([^/]+)\/complete$/);
  if (complete && request.method === "POST") {
    const claim = mediaClaims.get(complete[1]);
    return claim ? json({ id: complete[1], publicUrl: claim.mediaUrl, mimeType: claim.mimeType, width: null, height: null, status: "READY" }) : json(errorEnvelope("업로드 정보를 찾지 못했습니다."), 404);
  }
  return null;
}

async function handleShared(path: string, request: Request): Promise<Response | null> {
  const detail = path.match(/^\/api\/v1\/shared\/plans\/([^/]+)$/);
  if (detail && request.method === "GET") {
    const result = await forward(`/api/v1/shared-plans/${detail[1]}`, request);
    if (!result.response.ok) return passthrough(result);
    return json(mapPublicPlan(result.data, `shared-${detail[1]}`));
  }
  if (/\/copies$/.test(path)) return unsupported("공유 일정 복제");
  return null;
}

async function handleAdmin(path: string, request: Request): Promise<Response | null> {
  if (path === "/api/v1/admin/reports" || path === "/api/v1/admin/audit-logs" || path === "/api/v1/admin/places") return json(page([]));
  if (path === "/api/v1/admin/notices" && request.method === "GET") {
    const result = await forward("/api/v1/notices?size=100", request);
    return result.response.ok ? json(page(result.data?.items ?? [], result.data)) : passthrough(result);
  }
  if (path.startsWith("/api/v1/admin/")) return unsupported("관리자 운영 도구");
  return null;
}

export async function legacyApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  const path = url.pathname;
  const body = await requestBody(request);

  const handlers = [
    () => handleAuth(path, request, body),
    () => handleStations(path, url, request),
    () => handlePlaces(path, url, request, body),
    () => handleMe(path, request, body),
    () => handlePlans(path, url, request, body),
    () => handleRecruitments(path, url, request, body),
    () => handleReviews(path, url, request, body),
    () => handleShared(path, request),
    () => handleAdmin(path, request),
  ];
  for (const handler of handlers) {
    const response = await handler();
    if (response) return response;
  }
  return passthrough(await forward(`${path}${url.search}`, request, { method: request.method, body: request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(body) }));
}
