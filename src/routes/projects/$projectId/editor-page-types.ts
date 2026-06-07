// editor-page-types.ts — Tipos compartilhados da Editor Page

export type Msg = {
  id: string;
  role: string;
  parts: any[];
  tool_calls: any[];
  created_at: string;
};

export type FileRow = {
  id: string;
  path: string;
  content: string;
  updated_at: string;
};