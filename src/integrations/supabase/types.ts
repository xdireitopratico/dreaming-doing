export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      connectors: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["connector_kind"]
          meta: Json
          owner_id: string
          provider: string
          token_encrypted: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["connector_kind"]
          meta?: Json
          owner_id: string
          provider?: string
          token_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["connector_kind"]
          meta?: Json
          owner_id?: string
          provider?: string
          token_encrypted?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deployments: {
        Row: {
          created_at: string
          id: string
          logs: string | null
          project_id: string
          provider: Database["public"]["Enums"]["deploy_provider"]
          status: Database["public"]["Enums"]["deploy_status"]
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logs?: string | null
          project_id: string
          provider: Database["public"]["Enums"]["deploy_provider"]
          status?: Database["public"]["Enums"]["deploy_status"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logs?: string | null
          project_id?: string
          provider?: Database["public"]["Enums"]["deploy_provider"]
          status?: Database["public"]["Enums"]["deploy_status"]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          auth_state: string
          created_at: string
          id: string
          meta: Json
          name: string
          owner_id: string
          tokens_encrypted: string | null
          transport: string
          url: string
        }
        Insert: {
          auth_state?: string
          created_at?: string
          id?: string
          meta?: Json
          name: string
          owner_id: string
          tokens_encrypted?: string | null
          transport?: string
          url: string
        }
        Update: {
          auth_state?: string
          created_at?: string
          id?: string
          meta?: Json
          name?: string
          owner_id?: string
          tokens_encrypted?: string | null
          transport?: string
          url?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          canceled_at: string | null
          conversation_id: string
          error: string | null
          finished_at: string | null
          id: string
          meta: Json
          project_id: string
          started_at: string
          status: string
          steps: number
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          conversation_id: string
          error?: string | null
          finished_at?: string | null
          id?: string
          meta?: Json
          project_id: string
          started_at?: string
          status?: string
          steps?: number
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          conversation_id?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          meta?: Json
          project_id?: string
          started_at?: string
          status?: string
          steps?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          meta: Json
          parts: Json
          role: Database["public"]["Enums"]["message_role"]
          tool_calls: Json
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          meta?: Json
          parts?: Json
          role: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          meta?: Json
          parts?: Json
          role?: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          github_username: string | null
          id: string
          integration_prefs: Json
          trial_messages_remaining: number
          taste_chat_remaining: number
          taste_start_remaining: number
          taste_lead_email: string | null
          taste_lead_consent_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_username?: string | null
          id: string
          integration_prefs?: Json
          trial_messages_remaining?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_username?: string | null
          id?: string
          integration_prefs?: Json
          trial_messages_remaining?: number
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          content: string
          content_hash: string | null
          id: string
          path: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          content_hash?: string | null
          id?: string
          path: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          id?: string
          path?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_snapshots: {
        Row: {
          created_at: string
          id: string
          label: string | null
          project_id: string
          tree: Json
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          project_id: string
          tree: Json
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          project_id?: string
          tree?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          meta: Json
          name: string
          owner_id: string
          slug: string
          template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json
          name: string
          owner_id: string
          slug: string
          template?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json
          name?: string
          owner_id?: string
          slug?: string
          template?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      agent_stream_events: {
        Row: {
          id: string
          run_id: string
          seq: number
          event_type: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          seq: number
          event_type: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          seq?: number
          event_type?: string
          payload?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_stream_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_messages: {
        Row: {
          id: string
          project_id: string
          conversation_id: string
          user_id: string
          body: Json
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          conversation_id: string
          user_id: string
          body?: Json
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          conversation_id?: string
          user_id?: string
          body?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pending_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pending_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      connectors_public: {
        Row: {
          created_at: string | null
          id: string | null
          kind: Database["public"]["Enums"]["connector_kind"] | null
          meta: Json | null
          owner_id: string | null
          provider: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["connector_kind"] | null
          meta?: Json | null
          owner_id?: string | null
          provider?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["connector_kind"] | null
          meta?: Json | null
          owner_id?: string | null
          provider?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      connector_kind:
        | "github"
        | "vercel"
        | "cloudflare"
        | "anthropic"
        | "openai"
        | "netlify"
        | "supabase"
        | "e2b"
      deploy_provider: "vercel" | "cloudflare" | "netlify"
      deploy_status: "queued" | "building" | "ready" | "error" | "cancelled"
      message_role: "user" | "assistant" | "system" | "tool"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      connector_kind: [
        "github",
        "vercel",
        "cloudflare",
        "anthropic",
        "openai",
        "netlify",
        "supabase",
        "e2b",
      ],
      deploy_provider: ["vercel", "cloudflare", "netlify"],
      deploy_status: ["queued", "building", "ready", "error", "cancelled"],
      message_role: ["user", "assistant", "system", "tool"],
    },
  },
} as const
