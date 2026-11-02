// 知树 KnowTree - 领域类型定义（与 public schema 表结构对应，snake_case）

export interface Category {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  icon: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CaptureType = 'web' | 'manual' | 'clip' | 'image';

// entries.status
export type EntryStatus = 'pending' | 'parsing' | 'parsed' | 'classified' | 'linked' | 'failed';
// entries.classification_status
export type ClassificationStatus = 'auto' | 'pending_review' | 'uncategorized';

export interface Entry {
  id: string;
  user_id: string;
  source_id: string | null;
  category_id: string | null;
  title: string;
  summary: string | null;
  content: string;
  content_hash: string;
  source_url: string | null;
  capture_type: CaptureType;
  status: EntryStatus;
  classification_status: ClassificationStatus;
  classification_confidence: number | null;
  suggested_category_id: string | null;
  weight: number;
  recall_count: number;
  last_recalled_at: string | null;
  embedding?: unknown; // vector(1024) 已向量化时存在
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryVersion {
  id: string;
  user_id: string;
  entry_id: string;
  title: string;
  content: string;
  content_hash: string | null;
  note: string | null;
  created_at: string;
}

export interface Source {
  id: string;
  user_id: string;
  url: string;
  url_hash: string;
  domain: string | null;
  title: string | null;
  favicon_url: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Link {
  id: string;
  user_id: string;
  source_entry_id: string;
  target_entry_id: string;
  score: number;
  reason: string | null;
  deleted_at: string | null;
  created_at: string;
}

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type JobType = 'parse' | 'classify' | 'link' | 'dedupe' | 'daily_recall' | 'export' | 'delete_account';

export interface Job {
  id: string;
  user_id: string | null;
  job_type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempt_count: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DailyRecall {
  id: string;
  user_id: string;
  entry_id: string;
  recall_date: string;
  weight: number;
  status: string;
  created_at: string;
}

export interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  daily_recall_enabled: boolean;
  daily_recall_count: number;
  auto_classify_threshold: number;
  review_threshold: number;
  auto_merge_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntryWithMeta extends Entry {
  category_name?: string | null;
  duplicate_of?: string;
  dup_suggestions?: Array<{ entry_id: string; title: string; similarity: number }>;
}

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
}