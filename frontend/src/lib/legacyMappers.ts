/* eslint-disable @typescript-eslint/no-explicit-any */

export type LegacyJson = Record<string, any>;

const LINE_COLOR = "#0052a4";

export function nowIso() {
  return new Date().toISOString();
}

export function toId(value: unknown) {
  return String(value ?? "");
}

export function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeMediaUrl(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!/^localhost$|^127(?:\.\d{1,3}){3}$/.test(url.hostname)) return raw;
    const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    const configuredUrl = new URL(configured.replace(/\/api\/v1\/?$/, ""));
    const host = typeof window !== "undefined" ? window.location.hostname : configuredUrl.hostname;
    url.hostname = host;
    url.port = configuredUrl.port || url.port || "8000";
    return url.toString();
  } catch {
    return raw;
  }
}

export function mapLegacyLine(line: LegacyJson | undefined) {
  const id = toId(line?.lineId ?? 0);
  return {
    id,
    name: String(line?.lineName ?? "1호선"),
    shortName: String(line?.lineNumber ?? line?.lineName ?? "1"),
    color: LINE_COLOR,
    textColor: "#ffffff",
  };
}

export function mapLegacyStation(station: LegacyJson) {
  const line = Array.isArray(station.lines) ? station.lines[0] : undefined;
  return {
    id: toId(station.stationId),
    lineId: toId(line?.lineId ?? 0),
    name: String(station.stationName ?? ""),
    code: toId(station.stationId),
    sequence: toNumber(station.stationId),
    latitude: toNumber(station.latitude),
    longitude: toNumber(station.longitude),
  };
}

export function mapLegacyStationDetail(station: LegacyJson) {
  const summary = mapLegacyStation(station);
  const line = Array.isArray(station.lines) ? station.lines[0] : undefined;
  return {
    ...summary,
    address: station.address == null ? null : String(station.address),
    line: mapLegacyLine(line),
  };
}

export function mapLegacyCategory(category: unknown) {
  const value = String(category ?? "ETC");
  if (value === "RESTAURANT") return "FOOD";
  if (value === "CAFE") return "CAFE";
  if (value === "SHOPPING") return "SHOPPING";
  if (value === "TOUR") return "CULTURE";
  return "CULTURE";
}

export function toLegacyCategory(category: string) {
  if (category === "FOOD") return "RESTAURANT";
  if (category === "CAFE") return "CAFE";
  if (category === "SHOPPING") return "SHOPPING";
  if (category === "CULTURE" || category === "NATURE") return "TOUR";
  return "ETC";
}

export function mapLegacyPlace(place: LegacyJson, distanceMeters?: number | null) {
  return {
    id: toId(place.placeId),
    name: String(place.placeName ?? ""),
    category: mapLegacyCategory(place.category),
    address: String(place.address ?? ""),
    latitude: toNumber(place.latitude),
    longitude: toNumber(place.longitude),
    distanceMeters: distanceMeters ?? null,
    dataStatus: "VERIFIED",
    favoriteCount: 0,
  };
}

export function mapLegacyPlaceDetail(place: LegacyJson, distanceMeters?: number | null) {
  return {
    ...mapLegacyPlace(place, distanceMeters),
    summary: place.description == null ? null : String(place.description),
    phone: place.phone == null ? null : String(place.phone),
    websiteUrl: null,
    sourceName: "MetroTrip DB",
    lastSyncedAt: nowIso(),
  };
}

export function mapLegacyUser(user: LegacyJson) {
  return {
    id: toId(user.userId),
    email: String(user.email ?? ""),
    displayName: String(user.nickname ?? user.name ?? ""),
    role: String(user.role ?? "USER") === "ADMIN" ? "ADMIN" : "USER",
    status: "ACTIVE",
    createdAt: String(user.createdAt ?? nowIso()),
    updatedAt: String(user.updatedAt ?? nowIso()),
  };
}

export function mapLegacyNotice(notice: LegacyJson) {
  const kind = String(notice.noticeType ?? "BOARD") === "ALARM" ? "EVENT" : "NOTICE";
  return {
    id: toId(notice.noticeId),
    title: String(notice.title ?? ""),
    body: String(notice.content ?? ""),
    status: "PUBLISHED",
    publishedAt: String(notice.createdAt ?? nowIso()),
    kind,
    bannerUrl: null,
    startsAt: kind === "EVENT" ? String(notice.createdAt ?? nowIso()) : null,
    endsAt: null,
    createdAt: String(notice.createdAt ?? nowIso()),
    updatedAt: String(notice.updatedAt ?? notice.createdAt ?? nowIso()),
  };
}

function dateOnly(value: unknown) {
  const text = String(value ?? nowIso());
  return text.slice(0, 10);
}

function dateTime(value: unknown, endOfDay = false) {
  const text = String(value ?? "");
  if (!text) return nowIso();
  if (text.includes("T")) return text;
  return text + (endOfDay ? "T23:59:59+09:00" : "T12:00:00+09:00");
}

export function mapLegacyRecruitment(post: LegacyJson) {
  const recruitment = post.recruitment ?? {};
  return {
    id: toId(post.postId),
    ownerId: toId(post.author?.userId),
    ownerName: String(post.author?.nickname ?? "탈퇴한 사용자"),
    planId: post.planId == null ? null : toId(post.planId),
    routeLabel: post.planId == null ? "자유 일정" : "연결 일정",
    title: String(post.title ?? ""),
    body: String(post.content ?? ""),
    capacity: toNumber(recruitment.capacity, 1),
    acceptedCount: toNumber(recruitment.acceptedCount),
    deadline: dateTime(recruitment.deadline, true),
    meetingAt: recruitment.meetingDate ? dateTime(recruitment.meetingDate) : "",
    status: String(recruitment.status) === "RECRUITING" ? "OPEN" : "CLOSED",
    version: Math.max(1, Date.parse(String(post.updatedAt ?? post.createdAt ?? nowIso())) || 1),
    createdAt: String(post.createdAt ?? nowIso()),
    viewCount: toNumber(post.viewCount),
  };
}

export function mapLegacyRecruitmentDetail(post: LegacyJson) {
  return {
    ...mapLegacyRecruitment(post),
    comments: [],
  };
}

export function mapLegacyApplication(item: LegacyJson, recruitmentId?: string) {
  return {
    id: toId(item.participantId),
    recruitmentId: recruitmentId ?? toId(item.postId),
    applicantId: toId(item.user?.userId),
    applicantName: String(item.user?.nickname ?? "신청자"),
    message: null,
    status: String(item.status ?? "APPLIED"),
    createdAt: String(item.appliedAt ?? nowIso()),
    updatedAt: String(item.respondedAt ?? item.appliedAt ?? nowIso()),
  };
}

export function mapLegacyReview(review: LegacyJson, detail = false) {
  const media = Array.isArray(review.media)
    ? review.media.map((item: LegacyJson, index: number) => ({
        id: toId(item.mediaId),
        url: normalizeMediaUrl(item.mediaUrl),
        mimeType: String(item.mediaType) === "VIDEO" ? "video/mp4" : "image/jpeg",
        width: null,
        height: null,
        altText: String(review.title ?? "여행 후기 이미지"),
        position: index + 1,
      }))
    : [];
  const content = String(review.content ?? "");
  const imageBlocks: Array<{ kind: "PARAGRAPH" | "IMAGE"; text?: string; mediaId: string | null; altText: string | null }> = [];
  const imageToken = /\[\[METROTRIP_IMAGE:([^\]]+)\]\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = imageToken.exec(content))) {
    const paragraph = content.slice(cursor, match.index).trim();
    if (paragraph) imageBlocks.push({ kind: "PARAGRAPH", text: paragraph, mediaId: null, altText: null });
    const matchedMedia = media.find((item: { url: string }) => item.url === match?.[1]);
    if (matchedMedia) imageBlocks.push({ kind: "IMAGE", mediaId: matchedMedia.id, altText: matchedMedia.altText });
    cursor = imageToken.lastIndex;
  }
  const trailingParagraph = content.slice(cursor).trim();
  if (trailingParagraph) imageBlocks.push({ kind: "PARAGRAPH", text: trailingParagraph, mediaId: null, altText: null });
  if (!imageBlocks.some((block) => block.kind === "IMAGE") && media.length) {
    for (const item of media) imageBlocks.push({ kind: "IMAGE", mediaId: item.id, altText: item.altText });
  }
  const common = {
    id: toId(review.reviewId),
    authorId: toId(review.userId),
    authorName: String(review.authorNickname ?? "여행자"),
    title: String(review.title ?? ""),
    excerpt: content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
    originStationId: toId(review.startStationId),
    originStationName: String(review.startStationName ?? ""),
    destinationStationId: review.endStationId == null ? null : toId(review.endStationId),
    destinationStationName: review.endStationName == null ? null : String(review.endStationName),
    rating: String(toNumber(review.rating) / 2),
    travelDate: dateOnly(review.createdAt),
    costWon: review.travelCost == null ? null : toNumber(review.travelCost),
    status: "PUBLISHED",
    viewCount: toNumber(review.viewCount),
    likeCount: 0,
    tags: Array.isArray(review.tags) ? review.tags.map(String) : [],
    coverUrl: media[0]?.url ?? null,
    coverWidth: media[0]?.width ?? null,
    coverHeight: media[0]?.height ?? null,
    createdAt: String(review.createdAt ?? nowIso()),
    version: Math.max(1, Date.parse(String(review.updatedAt ?? review.createdAt ?? nowIso())) || 1),
    planId: review.planId == null ? null : toId(review.planId),
  };
  if (!detail) return common;
  return {
    ...common,
    blocks: imageBlocks,
    media,
    updatedAt: String(review.updatedAt ?? review.createdAt ?? nowIso()),
    likedByMe: false,
    placeRatings: [],
  };
}

type PlanMetadata = {
  description?: string | null;
  startDate?: string;
  endDate?: string;
  status?: string;
  items?: LegacyJson[];
};

export function mapLegacyPlan(plan: LegacyJson, metadata: PlanMetadata = {}) {
  const createdAt = String(plan.createdAt ?? nowIso());
  const updatedAt = String(plan.updatedAt ?? createdAt);
  const dayDate = metadata.startDate ?? dateOnly(createdAt);
  const startId = toId(plan.startStationId);
  const endId = toId(plan.endStationId);
  const responsePlaceItems = Array.isArray(plan.items) ? plan.items : [];
  const placeItems = responsePlaceItems
    .map((item: LegacyJson, index: number) => ({
        id: toId(item.planItemId),
        itemType: "PLACE",
        stationId: item.stationId == null ? null : toId(item.stationId),
        placeId: toId(item.placeId),
        routeSnapshot: null,
        note: item.memo == null ? null : String(item.memo),
        scheduledTime: item.visitTime == null ? null : String(item.visitTime),
        durationMinutes: null,
        position: index + 2,
      }));
  let items: LegacyJson[];
  if (metadata.items?.length) {
    const placeQueues = new Map<string, LegacyJson[]>();
    for (const item of responsePlaceItems) {
      const placeId = toId(item.placeId);
      placeQueues.set(placeId, [...(placeQueues.get(placeId) ?? []), item]);
    }
    items = metadata.items.map((savedItem, index) => {
      const itemType = String(savedItem.itemType ?? "NOTE");
      const placeId = savedItem.placeId == null ? null : toId(savedItem.placeId);
      const serverPlace = placeId ? placeQueues.get(placeId)?.shift() : undefined;
      return {
        id: serverPlace?.planItemId == null
          ? `${itemType.toLowerCase()}-${toId(plan.planId)}-${index}`
          : toId(serverPlace.planItemId),
        itemType,
        stationId: savedItem.stationId == null
          ? serverPlace?.stationId == null ? null : toId(serverPlace.stationId)
          : toId(savedItem.stationId),
        placeId,
        routeSnapshot: savedItem.routeSnapshot ?? null,
        note: savedItem.note ?? (serverPlace?.memo == null ? null : String(serverPlace.memo)),
        scheduledTime: savedItem.scheduledTime ?? (serverPlace?.visitTime == null ? null : String(serverPlace.visitTime)),
        durationMinutes: savedItem.durationMinutes ?? null,
        position: index + 1,
      };
    });
  } else {
    items = [{
      id: "start-" + toId(plan.planId),
      itemType: "STATION",
      stationId: startId,
      placeId: null,
      routeSnapshot: null,
      note: null,
      scheduledTime: null,
      durationMinutes: null,
      position: 1,
    }, ...placeItems];
    if (endId && endId !== startId) {
      items.push({
        id: "end-" + toId(plan.planId),
        itemType: "STATION",
        stationId: endId,
        placeId: null,
        routeSnapshot: null,
        note: null,
        scheduledTime: null,
        durationMinutes: null,
        position: items.length + 1,
      });
    }
  }
  return {
    id: toId(plan.planId),
    ownerId: toId(plan.userId),
    title: String(plan.planTitle ?? ""),
    description: metadata.description ?? null,
    startDate: dayDate,
    endDate: metadata.endDate ?? dayDate,
    visibility: "PRIVATE",
    status: metadata.status === "ARCHIVED" || metadata.status === "ACTIVE" ? metadata.status : "DRAFT",
    version: Math.max(1, Date.parse(updatedAt) || 1),
    days: [{
      id: "day-" + toId(plan.planId),
      dayDate,
      title: "1일차",
      position: 1,
      items,
    }],
    createdAt,
    updatedAt,
  };
}

export function mapLegacyPlanSummary(plan: LegacyJson, metadata: PlanMetadata = {}) {
  const detail = mapLegacyPlan(plan, metadata);
  return {
    id: detail.id,
    title: detail.title,
    startDate: detail.startDate,
    endDate: detail.endDate,
    status: detail.status,
    version: detail.version,
    updatedAt: detail.updatedAt,
  };
}

export function haversineMeters(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const radius = 6371000;
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLat = radians(destination.latitude - origin.latitude);
  const deltaLng = radians(destination.longitude - origin.longitude);
  const first = radians(origin.latitude);
  const second = radians(destination.latitude);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(first) * Math.cos(second) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}
