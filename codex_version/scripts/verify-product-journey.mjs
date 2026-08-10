import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const root = (process.env.METROTRIP_WEB_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const password = "MetroTrip2026";
const marker = randomUUID();
const email = `journey-${marker}@example.com`;
let accessToken = null;
const accounts = [];

async function request(path, init = {}, expected = 200) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const response = await fetch(`${root}${path}`, { ...init, headers });
  const responseText = await response.text();
  let body = null;
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      body = responseText;
    }
  }
  assert.equal(response.status, expected, `${init.method ?? "GET"} ${path}: ${JSON.stringify(body)}`);
  return { response, body };
}

async function registerAccount(accountEmail, displayName) {
  const registration = await request(
    "/api/v1/auth/register",
    {
      method: "POST",
      headers: { "X-Client-Platform": "mobile" },
      body: JSON.stringify({ email: accountEmail, password, displayName }),
    },
    201,
  );
  const account = { accessToken: registration.body.accessToken, deleted: false };
  accounts.push(account);
  return account;
}

async function deleteAccount(account) {
  accessToken = account.accessToken;
  await request(
    "/api/v1/me",
    { method: "DELETE", body: JSON.stringify({ password, confirmation: "DELETE" }) },
    204,
  );
  account.deleted = true;
}

try {
  const owner = await registerAccount(email, "Journey Tester");
  accessToken = owner.accessToken;

  const providerStatus = await request("/api/v1/providers/status");
  assert.equal(providerStatus.body.mapMode, "MOCKED");
  assert.equal(providerStatus.body.placeMode, "MOCKED");
  assert.equal(providerStatus.body.realtimeTransit, false);
  const lines = await request("/api/v1/lines");
  assert.ok(lines.body.length >= 1, "At least one transit line is required.");
  const stationPage = await request("/api/v1/stations?limit=10");
  assert.ok(stationPage.body.items.length >= 2, "At least two stations are required.");
  let origin = null;
  let place = null;
  for (const candidate of stationPage.body.items) {
    const nearby = await request(
      `/api/v1/places/nearby?station_id=${candidate.id}&radius_meters=5000&limit=30`,
    );
    if (nearby.body.items.length) {
      origin = candidate;
      place = nearby.body.items[0];
      break;
    }
  }
  assert.ok(origin && place, "No seeded place was found within 5 km of a station.");
  const destination = stationPage.body.items.find((item) => item.id !== origin.id);
  assert.ok(destination, "A distinct destination station is required.");

  await request(`/api/v1/places/${place.id}`);
  await request(`/api/v1/me/favorites/places/${place.id}`, { method: "PUT" });

  const route = await request("/api/v1/routes/compare", {
    method: "POST",
    body: JSON.stringify({
      origin: { type: "STATION", id: origin.id },
      destination: { type: "PLACE", id: place.id },
      modes: ["TRANSIT", "WALK"],
    }),
  });
  assert.ok(route.body.options.length >= 1, "At least one route option is required.");
  assert.ok(
    route.body.options.every((option) => option.estimated === true),
    "Fixture routes must be marked as estimated.",
  );

  const planBody = {
    title: `Journey ${marker.slice(0, 8)}`,
    description: "Disposable data created by the automated product journey.",
    startDate: "2026-08-09",
    endDate: "2026-08-09",
    status: "DRAFT",
    days: [
      {
        dayDate: "2026-08-09",
        title: "Cheonan Asan day trip",
        items: [
          { itemType: "STATION", stationId: origin.id, scheduledTime: "10:00:00" },
          { itemType: "PLACE", placeId: place.id, scheduledTime: "11:00:00" },
          { itemType: "ROUTE", routeSnapshot: route.body.options[0] },
        ],
      },
    ],
  };
  const createdPlan = await request(
    "/api/v1/plans",
    { method: "POST", body: JSON.stringify(planBody) },
    201,
  );
  const planId = createdPlan.body.id;
  assert.equal(createdPlan.response.headers.get("etag"), 'W/"1"');

  await request(
    `/api/v1/plans/${planId}`,
    { method: "PUT", headers: { "If-Match": 'W/"999"' }, body: JSON.stringify(planBody) },
    412,
  );
  const updatedPlan = await request(`/api/v1/plans/${planId}`, {
    method: "PUT",
    headers: { "If-Match": 'W/"1"' },
    body: JSON.stringify({
      ...planBody,
      days: [{ ...planBody.days[0], items: [...planBody.days[0].items].reverse() }],
    }),
  });
  assert.equal(updatedPlan.body.version, 2);

  const share = await request(
    `/api/v1/plans/${planId}/share-links`,
    { method: "POST", body: JSON.stringify({ expiresInDays: 7, maxUses: 5 }) },
    201,
  );
  await request(`/api/v1/shared/plans/${share.body.token}`);
  const copied = await request(
    `/api/v1/shared/plans/${share.body.token}/copies`,
    { method: "POST" },
    201,
  );
  assert.notEqual(copied.body.id, planId);

  const recruitment = await request(
    "/api/v1/recruitments",
    {
      method: "POST",
      body: JSON.stringify({
        planId,
        title: `Journey recruitment ${marker.slice(0, 8)}`,
        body: "Automated capacity and application state verification.",
        capacity: 1,
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        meetingAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }),
    },
    201,
  );
  const firstApplicant = await registerAccount(`journey-first-${marker}@example.com`, "First Applicant");
  accessToken = firstApplicant.accessToken;
  const firstApplication = await request(
    `/api/v1/recruitments/${recruitment.body.id}/applications`,
    { method: "POST", body: JSON.stringify({ message: "First application" }) },
    201,
  );
  const secondApplicant = await registerAccount(`journey-second-${marker}@example.com`, "Second Applicant");
  accessToken = secondApplicant.accessToken;
  const secondApplication = await request(
    `/api/v1/recruitments/${recruitment.body.id}/applications`,
    { method: "POST", body: JSON.stringify({ message: "Second application" }) },
    201,
  );
  accessToken = owner.accessToken;
  await request(
    `/api/v1/recruitments/${recruitment.body.id}/applications/${firstApplication.body.id}`,
    { method: "PUT", body: JSON.stringify({ status: "ACCEPTED" }) },
  );
  await request(
    `/api/v1/recruitments/${recruitment.body.id}/applications/${secondApplication.body.id}`,
    { method: "PUT", body: JSON.stringify({ status: "ACCEPTED" }) },
    409,
  );
  const closedRecruitment = await request(`/api/v1/recruitments/${recruitment.body.id}`);
  assert.equal(closedRecruitment.body.acceptedCount, 1);
  assert.equal(closedRecruitment.body.status, "CLOSED");

  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`metrotrip-${marker}`),
  ]);
  const checksum = createHash("sha256").update(image).digest("hex");
  const claim = await request(
    "/api/v1/media/claims",
    {
      method: "POST",
      body: JSON.stringify({
        filename: "journey.png",
        mimeType: "image/png",
        sizeBytes: image.length,
        checksumSha256: checksum,
      }),
    },
    201,
  );
  const upload = await fetch(claim.body.uploadUrl, {
    method: "PUT",
    headers: claim.body.uploadHeaders,
    body: image,
  });
  assert.ok(upload.ok, `MinIO upload failed: ${upload.status}`);
  await request(`/api/v1/media/claims/${claim.body.id}/complete`, { method: "POST" });

  const review = await request(
    "/api/v1/reviews",
    {
      method: "POST",
      body: JSON.stringify({
        title: `Cheonan Asan journey ${marker.slice(0, 8)}`,
        planId,
        originStationId: origin.id,
        destinationStationId: destination.id,
        rating: 4.5,
        travelDate: "2026-08-09",
        costWon: 25000,
        status: "PUBLISHED",
        blocks: [
          { kind: "PARAGRAPH", text: "The automated journey connected discovery and planning." },
          { kind: "IMAGE", mediaId: claim.body.id, altText: "Automated journey image" },
        ],
        tags: ["automation", "cheonan-asan"],
      }),
    },
    201,
  );
  await request(`/api/v1/reviews/${review.body.id}`);
  const liked = await request(`/api/v1/reviews/${review.body.id}/like`, { method: "PUT" });
  assert.equal(liked.body.liked, true);

  await request(`/api/v1/reviews/${review.body.id}`, { method: "DELETE" }, 204);
  await request(`/api/v1/recruitments/${recruitment.body.id}`, { method: "DELETE" }, 204);
  await request(`/api/v1/plans/${planId}/share-links/${share.body.id}`, { method: "DELETE" }, 204);
  await request(`/api/v1/shared/plans/${share.body.token}`, {}, 410);
  await request(`/api/v1/plans/${copied.body.id}`, { method: "DELETE" }, 204);
  await request(`/api/v1/plans/${planId}`, { method: "DELETE" }, 204);
  await request(`/api/v1/me/favorites/places/${place.id}`, { method: "DELETE" });
  await deleteAccount(firstApplicant);
  await deleteAccount(secondApplicant);
  await deleteAccount(owner);

  console.log(
    JSON.stringify({
      result: "PASS",
      checks: [
        "register",
        "provider truth labels/transit lines",
        "station/place discovery",
        "favorite",
        "estimated route",
        "plan ETag conflict/reorder",
        "share/copy/revoke",
        "recruitment capacity/application state",
        "MinIO presigned media",
        "review/like",
        "account anonymization",
      ],
    }),
  );
} finally {
  for (const account of accounts.filter((candidate) => !candidate.deleted).reverse()) {
    try {
      await deleteAccount(account);
    } catch {
      console.error("The automated verification account could not be deleted.");
    }
  }
}
