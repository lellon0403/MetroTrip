import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const root = (process.env.METROTRIP_WEB_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const password = "MetroTrip2026";
const email = `web-e2e-${randomUUID()}@example.com`;

async function request(path, init = {}) {
  const response = await fetch(`${root}${path}`, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

const registered = await request("/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Client-Platform": "web" },
  body: JSON.stringify({ email, password, displayName: "웹 프록시 검증" }),
});
assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
const cookieHeader = registered.response.headers.get("set-cookie");
assert.ok(cookieHeader, "refresh Set-Cookie가 없습니다.");
const refreshCookie = cookieHeader.split(";", 1)[0];
const initialAccess = registered.body.accessToken;

const profile = await request("/api/v1/me", {
  headers: { Authorization: `Bearer ${initialAccess}` },
});
assert.equal(profile.response.status, 200, JSON.stringify(profile.body));

const refreshed = await request("/api/v1/auth/refresh", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: refreshCookie },
  body: "{}",
});
assert.equal(refreshed.response.status, 200, JSON.stringify(refreshed.body));
assert.notEqual(refreshed.body.accessToken, initialAccess);

const reused = await request("/api/v1/auth/refresh", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: refreshCookie },
  body: "{}",
});
assert.equal(reused.response.status, 401, JSON.stringify(reused.body));
assert.equal(reused.body.error.code, "REFRESH_TOKEN_REUSED", JSON.stringify(reused.body));

const deleted = await request("/api/v1/me", {
  method: "DELETE",
  headers: {
    Authorization: `Bearer ${refreshed.body.accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ password, confirmation: "DELETE" }),
});
assert.equal(deleted.response.status, 204, JSON.stringify(deleted.body));

console.log(
  JSON.stringify({
    result: "PASS",
    checks: ["same-origin proxy", "refresh cookie", "protected profile", "rotation", "account deletion"],
  }),
);
