import type { GeminiResponse } from "@/types/gemini";
import { callTextAI } from "@/services/api/apiClient";
import { getApiKey } from "@/services/storage/geminiSettingsStorage";
import { useGeminiSettingsStore } from "@/store/useGeminiSettingsStore";

/** Open the Gemini API key modal (e.g. after a missing-key error). */
export function openGeminiSettings(): void {
  useGeminiSettingsStore.getState().setShowSettings(true);
}

function getKeyAndModel(): { key: string; model: string } {
  const key = getApiKey()?.trim() || useGeminiSettingsStore.getState().apiKey?.trim();
  const model = useGeminiSettingsStore.getState().selectedTextModel || "gemini-2.0-flash";
  if (!key) {
    const err = new Error("Add a Gemini API key in Settings to use AI features.");
    (err as Error & { code?: string }).code = "NO_API_KEY";
    throw err;
  }
  return { key, model: model.replace(/^models\//, "") };
}

function modelId(m: string): string {
  return m.replace(/^models\//, "");
}

function parseJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) return JSON.parse(fence[1].trim()) as T;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new Error("Model returned invalid JSON");
  }
}

async function generateContentJson<T>(
  key: string,
  model: string,
  systemInstruction: string,
  userText: string
): Promise<T> {
  const mid = modelId(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${mid}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: "application/json",
      },
    }),
  });
  const data: GeminiResponse = await res.json();
  if (data.error) {
    throw new Error(data.error.message || "Gemini API error");
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response from model");
  try {
    return parseJsonFromText<T>(text);
  } catch {
    const repaired = await callTextAI(
      key,
      "You output only valid minified JSON. No markdown fences, no commentary.",
      `Fix into valid JSON only:\n${text.slice(0, 12000)}`,
      mid
    );
    return parseJsonFromText<T>(repaired);
  }
}

const IDEA_CATEGORIES = [
  "Product",
  "Process",
  "Fixture/Jig",
  "Tool",
  "Art",
  "Hardware/Electronics",
  "Software/App",
  "Environment/Space",
] as const;

type IdeaProcessJson = {
  title: string;
  processed_summary: string;
  category: string;
  tags: string[];
  key_features: string;
};

export async function processIdeaClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { idea_id: string; raw_dump: string }
): Promise<void> {
  const { key, model } = getKeyAndModel();
  const system = `You are IdeaForge's idea processor. Read the user's raw brain dump and produce structured JSON.
category must be exactly one of: ${IDEA_CATEGORIES.join(", ")}.
tags: 3-8 short strings. key_features: markdown bullet list using "- " lines describing concrete features or facets.
processed_summary: 2-4 sentences. title: concise product/idea name.`;
  const user = `raw_dump:\n${params.raw_dump}`;
  const out = await generateContentJson<IdeaProcessJson>(key, model, system, user);
  const category = IDEA_CATEGORIES.includes(out.category as (typeof IDEA_CATEGORIES)[number])
    ? out.category
    : "Software/App";
  const { error } = await supabase
    .from("ideas")
    .update({
      title: out.title || "Untitled",
      processed_summary: out.processed_summary || params.raw_dump.slice(0, 500),
      category,
      tags: Array.isArray(out.tags) ? out.tags : [],
      key_features: out.key_features || "",
      status: "processed",
    })
    .eq("id", params.idea_id);
  if (error) throw error;
}

export async function generateExecutionStrategy(body: {
  title: string;
  description: string;
  bullets: string;
  tags: string[] | null;
  category: string | null;
  notes: string;
}): Promise<{ strategy: string }> {
  const { key, model } = getKeyAndModel();
  const system = `You write clear markdown execution strategies for product/build projects. Output JSON: {"strategy": "<markdown>"}`;
  const user = JSON.stringify(body);
  return generateContentJson<{ strategy: string }>(key, model, system, user);
}

export async function brainstormChat(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { key, model } = getKeyAndModel();
  const mode = String(body.mode || "");

  if (mode === "generate_question") {
    const system = `You help refine a brainstorm via interview questions. Output JSON: {"question": "<one specific question>"}`;
    const user = JSON.stringify({
      compiled_description: body.compiled_description,
      bullet_breakdown: body.bullet_breakdown,
      chat_history: body.chat_history,
      context: body.context,
    });
    return generateContentJson<{ question: string }>(key, model, system, user);
  }

  if (mode === "submit_answer") {
    const system = `You update a brainstorm from Q&A. Output JSON with keys:
updated_description (string, markdown ok), updated_bullets (string), updated_tags (string array, optional),
next_question (string), clarification (string|null). If the user asked a clarifying question instead of answering, set clarification to your reply and omit updated_description or leave it empty.
Optionally updated_category if clearly wrong (one of Product, Process, Fixture/Jig, Tool, Art, Hardware/Electronics, Software/App, Environment/Space).`;
    const user = JSON.stringify(body);
    return generateContentJson<Record<string, unknown>>(key, model, system, user);
  }

  if (mode === "chat_query") {
    const system = `You are a brainstorm workspace assistant. The user may be locked (read-only): respect is_locked — if true, never include mutating actions; only answer and suggest.
Output JSON: {"answer": "<markdown reply>", "actions": [] }
Each action is an object with "action" as one of: create_note, update_description, update_bullets, create_link.
create_note: { action, title, content }
update_description: { action, description }
update_bullets: { action, bullets }
create_link: { action, title, url, description? }
Keep actions minimal and only when clearly helpful.`;
    const user = JSON.stringify(body);
    const out = await generateContentJson<{ answer: string; actions: unknown[] }>(key, model, system, user);
    return {
      answer: out.answer || "",
      actions: Array.isArray(out.actions) ? out.actions : [],
    };
  }

  return { message: "OK", actions: [] };
}

export async function projectChat(body: {
  messages: unknown[];
  context: Record<string, unknown>;
}): Promise<{ message: string; actions: unknown[] }> {
  const { key, model } = getKeyAndModel();
  const system = `You are the Project workspace AI assistant. You can propose structured actions as JSON.
Output JSON: {"message": "<markdown assistant reply>", "actions": [] }
Action shapes:
- add_task: { action: "add_task", title, description?, priority?, due_date?, parent_task_id? }
- update_strategy: { action: "update_strategy", strategy }
- create_note: { action: "create_note", title, content }
- create_widget: { action: "create_widget", title, code?, summary?, instructions? }
- update_widget: { action: "update_widget", title, new_title?, code?, summary?, instructions? }
- create_link: { action: "create_link", title, url, description? }
Only include actions that match the user's request. Empty actions array is fine.`;
  const user = JSON.stringify(body);
  const out = await generateContentJson<{ message: string; actions: unknown[] }>(key, model, system, user);
  return {
    message: out.message || "Done.",
    actions: Array.isArray(out.actions) ? out.actions : [],
  };
}

export async function campaignChat(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { key, model } = getKeyAndModel();
  const mode = String(body.mode || "");

  if (mode === "generate_question") {
    const system = `You run a go-to-market interview. Output JSON: {"question": "<markdown string>", "topics_remaining": ["<short topic label>", "..."]} 
topics_remaining must be an array of strings naming GTM topics still to cover (e.g. Audience, Positioning, Channels). Use 3-8 items initially; remove topics as they are covered.`;
    const user = JSON.stringify({ chat_history: body.chat_history, context: body.context });
    const out = await generateContentJson<{ question: string; topics_remaining: string[] }>(key, model, system, user);
    return {
      question: out.question,
      topics_remaining: Array.isArray(out.topics_remaining) ? out.topics_remaining : [],
    };
  }

  if (mode === "submit_answer") {
    const system = `Continue the GTM interview. Output JSON: {"next_question": "<markdown>", "clarification": "<string|null>", "topics_remaining": ["..."] }
topics_remaining: updated list of strings still to discuss.`;
    const user = JSON.stringify(body);
    const raw = await generateContentJson<Record<string, unknown>>(key, model, system, user);
    const tr = raw.topics_remaining;
    if (tr !== undefined && !Array.isArray(tr)) {
      raw.topics_remaining = [];
    }
    return raw;
  }

  if (mode === "forge_playbook") {
    const system = `Create a full campaign playbook from interview context. Output JSON with keys:
playbook (markdown string, comprehensive),
ip_strategy, monetization_plan, marketing_plan, operations_plan, sales_model, primary_channel (strings),
tasks: array of { title, description, status_column } where status_column is one of: foundation_ip, infrastructure_production, asset_creation_prelaunch, active_campaign, operations_fulfillment`;
    const user = JSON.stringify({ chat_history: body.chat_history, context: body.context });
    return generateContentJson<Record<string, unknown>>(key, model, system, user);
  }

  if (mode === "assistant") {
    const system = `You are the Campaign workspace assistant. Output JSON: {"message": "<markdown>", "actions": [] }
Actions: create_note, add_task, create_widget, update_widget, create_link — same shapes as project assistant but for campaign context (campaign tasks use status_column from foundation_ip, infrastructure_production, asset_creation_prelaunch, active_campaign, operations_fulfillment).`;
    const user = JSON.stringify(body);
    const out = await generateContentJson<{ message: string; actions: unknown[] }>(key, model, system, user);
    return {
      message: out.message || "Done.",
      actions: Array.isArray(out.actions) ? out.actions : [],
    };
  }

  return { message: "OK", actions: [] };
}

type TaskLike = { title?: string; description?: string; subtasks?: TaskLike[] };

export async function gotchaChat(body: {
  symptom: string;
  chat_history: unknown[];
}): Promise<{
  next_question?: string;
  message?: string;
  investigation_task?: string | TaskLike;
  root_cause?: string;
  corrective_action_task?: string | TaskLike;
}> {
  const { key, model } = getKeyAndModel();
  const system = `You facilitate a "gotcha" root-cause autopsy for engineering/project issues.
Output JSON only. Possible outcomes:
- Early rounds: {"next_question": "<markdown question>"} OR {"message": "<markdown>"}
- When user needs to investigate before root cause: {"investigation_task": {"title","description","subtasks":[]}} (or a plain string for title-only)
- When root cause is clear: {"root_cause": "<markdown>", "corrective_action_task": {"title","description"} optional}
Use at most 5 why-rounds before concluding. Be concise.`;
  const user = JSON.stringify(body);
  return generateContentJson(key, model, system, user);
}
