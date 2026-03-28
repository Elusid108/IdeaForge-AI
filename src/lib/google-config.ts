/*
 * Google API Configuration — reads from Vite environment variables.
 */

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";

/**
 * Least-privilege Drive access: files created or opened by this app (including the IdeaForge_DB
 * spreadsheet under "IdeaForge AI Data"). Sheets REST calls use the same OAuth token for those files.
 * Re-consent if scopes change.
 */
export const DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

export const SCOPES = [
  DRIVE_FILE_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export default { CLIENT_ID, API_KEY, SCOPES };
