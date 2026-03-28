/*
 * Google API Configuration — reads from Vite environment variables.
 */

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";

/** Used for tokeninfo checks and Drive file access (IdeaForge_DB in "IdeaForge AI Data"). Re-consent if scopes change. */
export const DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

export const SCOPES = [
  DRIVE_FILE_SCOPE,
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export default { CLIENT_ID, API_KEY, SCOPES };
