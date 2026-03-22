/** Stored in reference `url` / `thumbnail_url` when the asset lives in Google Drive (private). */
export const DRIVE_REF_PREFIX = "gdrive:";

export function formatDriveReferenceUrl(fileId: string): string {
  return `${DRIVE_REF_PREFIX}${fileId}`;
}

export function parseDriveFileIdFromRefUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null;
  if (!url.startsWith(DRIVE_REF_PREFIX)) return null;
  const id = url.slice(DRIVE_REF_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}
