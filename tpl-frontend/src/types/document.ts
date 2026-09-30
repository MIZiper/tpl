export interface Document {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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
