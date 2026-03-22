/** Local-first domain types (replaces generated Supabase Database types). */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Idea {
  id: string;
  user_id: string;
  raw_dump: string;
  title?: string | null;
  processed_summary?: string | null;
  category?: string | null;
  tags?: string[] | null;
  key_features?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Brainstorm {
  id: string;
  user_id: string;
  idea_id?: string | null;
  title: string;
  status: string;
  category?: string | null;
  tags?: string[] | null;
  compiled_description?: string | null;
  bullet_breakdown?: string | null;
  chat_history?: Json | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  brainstorm_id?: string | null;
  campaign_id?: string | null;
  name: string;
  status: string;
  category?: string | null;
  tags?: string[] | null;
  general_notes?: string | null;
  compiled_description?: string | null;
  bullet_breakdown?: string | null;
  execution_strategy?: string | null;
  github_repo_url?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Campaign {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  status: string;
  category?: string | null;
  tags?: string[] | null;
  chat_history?: Json | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  due_date?: string | null;
  parent_task_id?: string | null;
  completed: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProjectExpense {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  amount: number;
  category?: string | null;
  description?: string | null;
  date?: string | null;
  vendor?: string | null;
  receipt_url?: string | null;
  created_at: string;
}

export interface ProjectReference {
  id: string;
  project_id: string;
  user_id: string;
  type: string;
  title: string;
  url?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  sort_order: number;
  created_at: string;
}

export interface BrainstormReference {
  id: string;
  brainstorm_id: string;
  user_id: string;
  type: string;
  title: string;
  url?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  sort_order: number;
  created_at: string;
}

export interface BrainstormHistoryEntry {
  id: string;
  brainstorm_id: string;
  user_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Json | null;
  position: number;
  created_at: string;
}

export interface Gotcha {
  id: string;
  project_id: string;
  symptom: string;
  status: string;
  chat_history?: Json | null;
  root_cause?: string | null;
  created_at: string;
}

export interface CampaignTask {
  id: string;
  campaign_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  sort_order: number;
  status_column: string;
  parent_task_id?: string | null;
  priority?: string | null;
  due_date?: string | null;
  created_at: string;
}

export interface CampaignReference {
  id: string;
  campaign_id: string;
  user_id: string;
  type: string;
  title: string;
  url?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  sort_order: number;
  created_at: string;
}

export interface CampaignExpense {
  id: string;
  campaign_id: string;
  user_id: string;
  title: string;
  amount: number;
  category?: string | null;
  description?: string | null;
  date?: string | null;
  vendor?: string | null;
  receipt_url?: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  task_type: string;
  user_id: string;
  content: string;
  created_at: string;
}
