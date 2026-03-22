export function normalizeIdeaText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join("\n");
  return String(value);
}

export function normalizeIdeaTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export function keyFeaturesToHtml(value: unknown): string {
  const s = normalizeIdeaText(value).trim();
  return s.replace(/^- /gm, "• ").replace(/\n/g, "<br/>");
}
