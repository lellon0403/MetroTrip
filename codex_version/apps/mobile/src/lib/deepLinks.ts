export function notificationPath(data: Record<string, unknown>): string | null {
  const resourceType = typeof data.resourceType === "string" ? data.resourceType.toLowerCase() : "";
  const resourceId = typeof data.resourceId === "string" ? data.resourceId : "";
  if (!resourceId) return null;
  if (resourceType === "plan") return `/plans/${resourceId}`;
  if (resourceType === "review") return `/reviews/${resourceId}`;
  if (resourceType === "recruitment") return `/recruitments/${resourceId}`;
  if (resourceType === "notice") return "/";
  return null;
}
