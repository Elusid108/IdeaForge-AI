# IdeaForge

**IdeaForge** is an AI-powered workspace for generating, brainstorming, and executing ideas. It now runs **entirely local-first** in your browser: your workflows stay on your machine, and your data lives in **your** Google account—not on a vendor’s servers. That design gives you maximum privacy, control, and portability.

---

## Key features

- **Local-first architecture** — The app runs as a client-side web application. You keep total ownership of your session and can pair it with your own cloud services on your terms.

- **Bring Your Own Database (BYODB)** — Structured data is stored using the **Google Sheets API**, with the backing spreadsheet kept in your Google account’s **hidden App Data** area on Google Drive (`drive.appdata`). IdeaForge uses that sheet as a relational-style data store while keeping it out of your normal Drive browsing experience.

- **Bring Your Own Storage (BYOS)** — Generated images and uploaded assets are stored **directly in your Google Drive** (application-created files), so large binaries stay under your quota and your control.

- **Bring Your Own Key (BYOK)** — **Google Gemini** is integrated **from the client** using an API key you supply in the app (stored locally). That supports **text** and **image** generation without routing prompts through IdeaForge-hosted backends.

---

## Prerequisites

- **[Node.js](https://nodejs.org/)** (current LTS recommended) — includes `npm`.

---

## Google Cloud project setup

IdeaForge uses Google APIs for sign-in, Drive, and Sheets. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and configure the following.

### 1. Enable APIs

Enable at least:

- **Google Drive API**
- **Google Sheets API**

For Gemini features, ensure you can create a **Gemini API key** (e.g. via [Google AI Studio](https://aistudio.google.com/) or by enabling the **Generative Language API** in the same or another project, depending on how you manage keys).

### 2. OAuth 2.0 Client ID (required)

1. Go to **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add the origin where you run the app, for example:
   - `http://localhost:8080` (default for this project’s Vite dev server)
5. Save and copy the **Client ID** — you will set it as `VITE_GOOGLE_CLIENT_ID`.

Configure the **OAuth consent screen** (External or Internal as appropriate) and add the scopes below so users see accurate permissions.

### 3. API key (required for Google client APIs)

1. **Create Credentials → API key**.
2. Restrict the key (recommended): limit to the APIs you enabled (Drive, Sheets, etc.).
3. Copy the key — you will set it as `VITE_GOOGLE_API_KEY`.

> **Note:** `VITE_GOOGLE_API_KEY` is used for **Google Drive / Sheets / GAPI** discovery and calls. Your **Gemini** key is entered **inside the app** (BYOK) and is not placed in `.env`.

### 4. OAuth scopes used by IdeaForge

The app requests these scopes (see `src/lib/google-config.ts`):

| Area | Scope |
|------|--------|
| **Drive App Data** (hidden app folder, e.g. database spreadsheet) | `https://www.googleapis.com/auth/drive.appdata` |
| **Drive file** (app-created files in Drive — BYOS) | `https://www.googleapis.com/auth/drive.file` |
| **Sheets** (BYODB) | `https://www.googleapis.com/auth/spreadsheets` |
| **Profile** | `https://www.googleapis.com/auth/userinfo.profile` |
| **Email** (account identification) | `https://www.googleapis.com/auth/userinfo.email` |

If you add or change scopes, users may need to sign out and sign in again to re-consent.

---

## Environment variables

Create a `.env` file in the **project root** (same folder as `package.json`). Vite exposes only variables prefixed with `VITE_`.

**Example `.env`:**

```env
# OAuth 2.0 Web Client ID from Google Cloud Console
VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"

# API key for Google Drive / Sheets (restricted in Google Cloud Console)
VITE_GOOGLE_API_KEY="your-google-api-key"
```

Do not commit real secrets. Add `.env` to `.gitignore` if it is not already ignored.

After editing `.env`, restart the dev server so Vite picks up changes.

---

## Installation and running locally

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (by default **`http://localhost:8080`**).

Other scripts:

| Command | Description |
|---------|-------------|
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run tests |

---

## First-time use

1. Sign in with Google so Drive and Sheets permissions can be granted.
2. Open in-app settings and paste your **Gemini API key** (BYOK) for AI features.
3. Use the app — data and files stay tied to **your** Google account and **your** keys.

---

## Privacy summary

- **No IdeaForge backend** is required for core operation: the SPA talks to Google APIs and to Gemini using credentials you control.
- **Gemini API key** and **Google OAuth tokens** are managed according to your browser and Google account; review Google’s policies for API and OAuth data handling.
