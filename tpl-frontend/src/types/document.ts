export interface Document {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  plan_external_link?: ExternalLink | null;
  log_external_link?: ExternalLink | null;
  creator_sub?: string | null;
  creator_name?: string | null;
}

export interface ExternalLink {
  provider: string;
  external_id: string;
  external_url: string;
  status?: string | null;
  status_updated_at?: string | null;
  checked_at?: string | null;
  frozen: boolean;
  reachable?: boolean;
}

/** Stored JSONB documents exactly as they are in the database (unvalidated). */
export interface RawDocuments {
  id: string;
  name: string;
  description: string | null;
  plan_document: unknown | null;
  execution_document: unknown | null;
  updated_at: string;
}
