# IdeaForge AI
> A personal, AI-driven ideation workspace that transforms raw thoughts into structured projects using Google Sheets as a headless database.

## Overview
IdeaForge AI bridges the gap between chaotic brainstorming and structured project execution. Users input stream-of-consciousness ideas via text or voice, which are then processed by Google's Gemini AI to extract structured summaries, key features, and categorical tags. To ensure complete data ownership and privacy, the application bypasses traditional backend databases, utilizing the Google Sheets API to store all relational data directly within the user's personal Google Drive. This creates a seamless, serverless system for managing the entire lifecycle of an idea from conception to execution.

## Key Features
* **AI-Powered Structuring:** Transforms unstructured voice or text dumps into organized, actionable project blueprints using natural language processing.
* **Progressive Pipeline Workflow:** Navigates users through a continuous project lifecycle, escalating concepts from an Ideas inbox to interactive Brainstorms, structured Projects, and final Campaigns.
* **Serverless Data Sovereignty:** Operates without a traditional backend by leveraging a user's personal Google Drive and Google Sheets to perform relational database operations directly from the client.

## Technical Architecture
* **Frontend/UI:** React 18, TypeScript, Tailwind CSS, Shadcn UI, TanStack React Query
* **Backend/Logic:** Google Gemini API (AI Processing), Web Speech API (Voice Input)
* **Infrastructure/Hardware:** Google Sheets API (Headless DB), Google Drive API (Storage), Vite

## Setup & Deployment
1. Clone the repository and run `npm install` to install required dependencies.
2. Configure a Google Cloud Project with Drive and Sheets API access, and obtain Gemini API credentials.
3. Start the local development server using `npm run dev`.
4. Authenticate via the frontend application to automatically provision the hidden database spreadsheet within your Google Drive.