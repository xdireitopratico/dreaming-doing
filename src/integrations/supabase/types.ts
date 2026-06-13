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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_alert_rules: {
        Row: {
          condition: Json
          created_at: string
          flow_id: string
          id: string
          is_active: boolean
          name: string
          rule_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          condition?: Json
          created_at?: string
          flow_id: string
          id?: string
          is_active?: boolean
          name: string
          rule_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: Json
          created_at?: string
          flow_id?: string
          id?: string
          is_active?: boolean
          name?: string
          rule_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_alert_rules_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_checkpoints: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          phase: string
          project_id: string
          state: Json
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          phase: string
          project_id: string
          state?: Json
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          phase?: string
          project_id?: string
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_checkpoints_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_deployments: {
        Row: {
          canary_baseline_version_id: string | null
          canary_percent: number | null
          canary_version_id: string | null
          channel: string
          channel_config: Json | null
          created_at: string | null
          endpoint_slug: string | null
          flow_id: string
          flow_version: number
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          canary_baseline_version_id?: string | null
          canary_percent?: number | null
          canary_version_id?: string | null
          channel: string
          channel_config?: Json | null
          created_at?: string | null
          endpoint_slug?: string | null
          flow_id: string
          flow_version?: number
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          canary_baseline_version_id?: string | null
          canary_percent?: number | null
          canary_version_id?: string | null
          channel?: string
          channel_config?: Json | null
          created_at?: string | null
          endpoint_slug?: string | null
          flow_id?: string
          flow_version?: number
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_deployments_canary_version_id_fkey"
            columns: ["canary_version_id"]
            isOneToOne: false
            referencedRelation: "agent_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deployments_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_execution_steps: {
        Row: {
          compensation_action: string | null
          completed_at: string | null
          cost_cents: number | null
          created_at: string | null
          error_message: string | null
          execution_id: string
          id: string
          input_data: Json | null
          latency_ms: number | null
          node_id: string | null
          node_type: string
          output_data: Json | null
          started_at: string | null
          status: string | null
          step_order: number
          tokens_in: number | null
          tokens_out: number | null
          tool_idempotency_key: string | null
          tool_name: string | null
          tool_retries: number | null
        }
        Insert: {
          compensation_action?: string | null
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_id: string
          id?: string
          input_data?: Json | null
          latency_ms?: number | null
          node_id?: string | null
          node_type: string
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_order: number
          tokens_in?: number | null
          tokens_out?: number | null
          tool_idempotency_key?: string | null
          tool_name?: string | null
          tool_retries?: number | null
        }
        Update: {
          compensation_action?: string | null
          completed_at?: string | null
          cost_cents?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_id?: string
          id?: string
          input_data?: Json | null
          latency_ms?: number | null
          node_id?: string | null
          node_type?: string
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_order?: number
          tokens_in?: number | null
          tokens_out?: number | null
          tool_idempotency_key?: string | null
          tool_name?: string | null
          tool_retries?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_execution_steps_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "agent_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_executions: {
        Row: {
          completed_at: string | null
          cost_budget_cents: number | null
          created_at: string | null
          current_state: string | null
          deployment_id: string | null
          error_code: string | null
          error_message: string | null
          error_node_id: string | null
          eval_details: Json | null
          flow_id: string | null
          flow_version: number
          fsm_snapshot: Json | null
          id: string
          idempotency_key: string | null
          is_paused: boolean | null
          nodes_executed: number | null
          pause_fallback_action: string | null
          pause_reason: string | null
          pause_timeout_at: string | null
          paused_at: string | null
          quality_score: number | null
          retry_count: number | null
          session_id: string
          started_at: string | null
          status: string | null
          tenant_id: string | null
          total_cost_cents: number | null
          total_latency_ms: number | null
          total_tokens_in: number | null
          total_tokens_out: number | null
          user_satisfaction_score: number | null
        }
        Insert: {
          completed_at?: string | null
          cost_budget_cents?: number | null
          created_at?: string | null
          current_state?: string | null
          deployment_id?: string | null
          error_code?: string | null
          error_message?: string | null
          error_node_id?: string | null
          eval_details?: Json | null
          flow_id?: string | null
          flow_version?: number
          fsm_snapshot?: Json | null
          id?: string
          idempotency_key?: string | null
          is_paused?: boolean | null
          nodes_executed?: number | null
          pause_fallback_action?: string | null
          pause_reason?: string | null
          pause_timeout_at?: string | null
          paused_at?: string | null
          quality_score?: number | null
          retry_count?: number | null
          session_id: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_cost_cents?: number | null
          total_latency_ms?: number | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          user_satisfaction_score?: number | null
        }
        Update: {
          completed_at?: string | null
          cost_budget_cents?: number | null
          created_at?: string | null
          current_state?: string | null
          deployment_id?: string | null
          error_code?: string | null
          error_message?: string | null
          error_node_id?: string | null
          eval_details?: Json | null
          flow_id?: string | null
          flow_version?: number
          fsm_snapshot?: Json | null
          id?: string
          idempotency_key?: string | null
          is_paused?: boolean | null
          nodes_executed?: number | null
          pause_fallback_action?: string | null
          pause_reason?: string | null
          pause_timeout_at?: string | null
          paused_at?: string | null
          quality_score?: number | null
          retry_count?: number | null
          session_id?: string
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_cost_cents?: number | null
          total_latency_ms?: number | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          user_satisfaction_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_executions_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "agent_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_flow_comments: {
        Row: {
          content: string
          created_at: string | null
          flow_id: string
          id: string
          is_resolved: boolean | null
          mentions: string[] | null
          node_id: string | null
          parent_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          flow_id: string
          id?: string
          is_resolved?: boolean | null
          mentions?: string[] | null
          node_id?: string | null
          parent_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          flow_id?: string
          id?: string
          is_resolved?: boolean | null
          mentions?: string[] | null
          node_id?: string | null
          parent_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_flow_comments_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_flow_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "agent_flow_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_flow_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          flow_id: string
          id: string
          invited_by: string | null
          invited_email: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          flow_id: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_flow_members_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_flow_nodes: {
        Row: {
          created_at: string | null
          flow_id: string
          id: string
          input_schema: Json | null
          node_config: Json
          node_type: string
          output_schema: Json | null
          position_x: number | null
          position_y: number | null
        }
        Insert: {
          created_at?: string | null
          flow_id: string
          id?: string
          input_schema?: Json | null
          node_config?: Json
          node_type: string
          output_schema?: Json | null
          position_x?: number | null
          position_y?: number | null
        }
        Update: {
          created_at?: string | null
          flow_id?: string
          id?: string
          input_schema?: Json | null
          node_config?: Json
          node_type?: string
          output_schema?: Json | null
          position_x?: number | null
          position_y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_flow_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_flow_versions: {
        Row: {
          created_at: string
          created_by: string | null
          flow_definition: Json
          flow_id: string
          flow_name: string | null
          id: string
          notes: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          flow_definition?: Json
          flow_id: string
          flow_name?: string | null
          id?: string
          notes?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          flow_definition?: Json
          flow_id?: string
          flow_name?: string | null
          id?: string
          notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_flow_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_flows: {
        Row: {
          avg_latency_ms: number | null
          avg_quality_score: number | null
          channels: string[] | null
          created_at: string | null
          description: string | null
          flow_definition: Json
          flow_schema_version: number | null
          id: string
          is_template: boolean | null
          name: string
          parent_version_id: string | null
          project_id: string | null
          published_at: string | null
          status: string | null
          tags: string[] | null
          template_category: string | null
          template_price_cents: number | null
          tenant_id: string | null
          total_cost_cents: number | null
          total_executions: number | null
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          avg_latency_ms?: number | null
          avg_quality_score?: number | null
          channels?: string[] | null
          created_at?: string | null
          description?: string | null
          flow_definition?: Json
          flow_schema_version?: number | null
          id?: string
          is_template?: boolean | null
          name: string
          parent_version_id?: string | null
          project_id?: string | null
          published_at?: string | null
          status?: string | null
          tags?: string[] | null
          template_category?: string | null
          template_price_cents?: number | null
          tenant_id?: string | null
          total_cost_cents?: number | null
          total_executions?: number | null
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          avg_latency_ms?: number | null
          avg_quality_score?: number | null
          channels?: string[] | null
          created_at?: string | null
          description?: string | null
          flow_definition?: Json
          flow_schema_version?: number | null
          id?: string
          is_template?: boolean | null
          name?: string
          parent_version_id?: string | null
          project_id?: string | null
          published_at?: string | null
          status?: string | null
          tags?: string[] | null
          template_category?: string | null
          template_price_cents?: number | null
          tenant_id?: string | null
          total_cost_cents?: number | null
          total_executions?: number | null
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_flows_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_flows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_marketplace_listings: {
        Row: {
          avg_rating: number | null
          category: string
          created_at: string
          description: string | null
          flow_id: string
          flow_snapshot: Json
          icon_emoji: string | null
          id: string
          install_count: number
          is_free: boolean | null
          is_published: boolean
          name: string
          price_cents: number
          publisher_id: string
          rating_count: number
          revenue_share_percent: number
          short_description: string | null
          tags: string[] | null
          updated_at: string
          version: number
        }
        Insert: {
          avg_rating?: number | null
          category?: string
          created_at?: string
          description?: string | null
          flow_id: string
          flow_snapshot: Json
          icon_emoji?: string | null
          id?: string
          install_count?: number
          is_free?: boolean | null
          is_published?: boolean
          name: string
          price_cents?: number
          publisher_id: string
          rating_count?: number
          revenue_share_percent?: number
          short_description?: string | null
          tags?: string[] | null
          updated_at?: string
          version?: number
        }
        Update: {
          avg_rating?: number | null
          category?: string
          created_at?: string
          description?: string | null
          flow_id?: string
          flow_snapshot?: Json
          icon_emoji?: string | null
          id?: string
          install_count?: number
          is_free?: boolean | null
          is_published?: boolean
          name?: string
          price_cents?: number
          publisher_id?: string
          rating_count?: number
          revenue_share_percent?: number
          short_description?: string | null
          tags?: string[] | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_marketplace_listings_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_marketplace_purchases: {
        Row: {
          buyer_id: string
          completed_at: string | null
          created_at: string
          id: string
          listing_id: string
          platform_fee_cents: number
          price_cents: number
          seller_amount_cents: number
          seller_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          buyer_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          listing_id: string
          platform_fee_cents?: number
          price_cents: number
          seller_amount_cents?: number
          seller_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          buyer_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          platform_fee_cents?: number
          price_cents?: number
          seller_amount_cents?: number
          seller_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_marketplace_purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "agent_marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_marketplace_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_marketplace_ratings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "agent_marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          access_count: number | null
          created_at: string | null
          expires_at: string | null
          flow_id: string
          id: string
          importance_score: number | null
          key: string
          last_accessed_at: string | null
          metadata: Json | null
          scope: string
          session_id: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          access_count?: number | null
          created_at?: string | null
          expires_at?: string | null
          flow_id: string
          id?: string
          importance_score?: number | null
          key: string
          last_accessed_at?: string | null
          metadata?: Json | null
          scope?: string
          session_id: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          access_count?: number | null
          created_at?: string | null
          expires_at?: string | null
          flow_id?: string
          id?: string
          importance_score?: number | null
          key?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          scope?: string
          session_id?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_notifications: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_notifications_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_messages: {
        Row: {
          body: Json
          conversation_id: string
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          body?: Json
          conversation_id: string
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          body?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pending_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pending_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_plans: {
        Row: {
          affected_files: Json
          conversation_id: string | null
          created_at: string
          id: string
          project_id: string
          steps: Json
          title: string
        }
        Insert: {
          affected_files?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          project_id: string
          steps?: Json
          title: string
        }
        Update: {
          affected_files?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          project_id?: string
          steps?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_plans_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          awaiting_user_type: string | null
          canceled_at: string | null
          conversation_id: string
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          last_error_code: string | null
          meta: Json
          project_id: string
          started_at: string
          status: string
          steps: number
          user_id: string
        }
        Insert: {
          awaiting_user_type?: string | null
          canceled_at?: string | null
          conversation_id: string
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error_code?: string | null
          meta?: Json
          project_id: string
          started_at?: string
          status?: string
          steps?: number
          user_id: string
        }
        Update: {
          awaiting_user_type?: string | null
          canceled_at?: string | null
          conversation_id?: string
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error_code?: string | null
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
      agent_schedules: {
        Row: {
          created_at: string
          cron_expression: string
          flow_id: string
          id: string
          input_payload: Json | null
          is_active: boolean
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          run_count: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cron_expression?: string
          flow_id: string
          id?: string
          input_payload?: Json | null
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          run_count?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cron_expression?: string
          flow_id?: string
          id?: string
          input_payload?: Json | null
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          run_count?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_schedules_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_stream_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          run_id: string
          seq: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          run_id: string
          seq: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          run_id?: string
          seq?: number
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
      agent_test_suites: {
        Row: {
          baseline_version: number | null
          created_at: string | null
          description: string | null
          flow_id: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          last_run_failed: number | null
          last_run_passed: number | null
          last_run_quality_avg: number | null
          name: string
          regression_details: Json | null
          regression_detected: boolean | null
          test_cases: Json
        }
        Insert: {
          baseline_version?: number | null
          created_at?: string | null
          description?: string | null
          flow_id?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          last_run_failed?: number | null
          last_run_passed?: number | null
          last_run_quality_avg?: number | null
          name: string
          regression_details?: Json | null
          regression_detected?: boolean | null
          test_cases?: Json
        }
        Update: {
          baseline_version?: number | null
          created_at?: string | null
          description?: string | null
          flow_id?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          last_run_failed?: number | null
          last_run_passed?: number | null
          last_run_quality_avg?: number | null
          name?: string
          regression_details?: Json | null
          regression_detected?: boolean | null
          test_cases?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_test_suites_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string
          enabled: boolean
          endpoint: string | null
          executor_type: string
          id: string
          idempotent: boolean | null
          input_schema: Json
          name: string
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          enabled?: boolean
          endpoint?: string | null
          executor_type?: string
          id?: string
          idempotent?: boolean | null
          input_schema?: Json
          name: string
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          enabled?: boolean
          endpoint?: string | null
          executor_type?: string
          id?: string
          idempotent?: boolean | null
          input_schema?: Json
          name?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      agent_versions: {
        Row: {
          change_type: string
          changelog: string | null
          created_at: string
          created_by: string | null
          flow_id: string
          id: string
          is_published: boolean
          published_at: string | null
          snapshot_config: Json | null
          snapshot_edges: Json
          snapshot_nodes: Json
          version_label: string | null
          version_major: number
          version_minor: number
          version_patch: number
        }
        Insert: {
          change_type?: string
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          flow_id: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          snapshot_config?: Json | null
          snapshot_edges?: Json
          snapshot_nodes?: Json
          version_label?: string | null
          version_major?: number
          version_minor?: number
          version_patch?: number
        }
        Update: {
          change_type?: string
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          flow_id?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          snapshot_config?: Json | null
          snapshot_edges?: Json
          snapshot_nodes?: Json
          version_label?: string | null
          version_major?: number
          version_minor?: number
          version_patch?: number
        }
        Relationships: []
      }
      code_corpus: {
        Row: {
          capture_reason: string
          captured_at: string
          content: string
          content_hash: string | null
          id: string
          path: string
          run_id: string | null
          source_project_id: string
          source_user_id: string | null
          stack_kind: string | null
        }
        Insert: {
          capture_reason?: string
          captured_at?: string
          content?: string
          content_hash?: string | null
          id?: string
          path: string
          run_id?: string | null
          source_project_id: string
          source_user_id?: string | null
          stack_kind?: string | null
        }
        Update: {
          capture_reason?: string
          captured_at?: string
          content?: string
          content_hash?: string | null
          id?: string
          path?: string
          run_id?: string | null
          source_project_id?: string
          source_user_id?: string | null
          stack_kind?: string | null
        }
        Relationships: []
      }
      codex_genomes: {
        Row: {
          complexity: string
          created_at: string | null
          default_models: Json
          description: string | null
          domain: string
          embedding: string | null
          estimated_cost_per_interaction: number | null
          estimated_latency_ms: number | null
          genome_key: string
          id: string
          is_active: boolean | null
          name: string
          tags: string[] | null
          template_edges: Json
          template_nodes: Json
          updated_at: string | null
        }
        Insert: {
          complexity?: string
          created_at?: string | null
          default_models?: Json
          description?: string | null
          domain?: string
          embedding?: string | null
          estimated_cost_per_interaction?: number | null
          estimated_latency_ms?: number | null
          genome_key: string
          id?: string
          is_active?: boolean | null
          name: string
          tags?: string[] | null
          template_edges?: Json
          template_nodes?: Json
          updated_at?: string | null
        }
        Update: {
          complexity?: string
          created_at?: string | null
          default_models?: Json
          description?: string | null
          domain?: string
          embedding?: string | null
          estimated_cost_per_interaction?: number | null
          estimated_latency_ms?: number | null
          genome_key?: string
          id?: string
          is_active?: boolean | null
          name?: string
          tags?: string[] | null
          template_edges?: Json
          template_nodes?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
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
      execution_dead_letter_queue: {
        Row: {
          created_at: string | null
          error_code: string
          error_message: string | null
          error_stack: string | null
          execution_id: string | null
          fsm_snapshot: Json | null
          id: string
          input_data: Json | null
          node_config: Json | null
          node_type: string | null
          resolution_notes: string | null
          resolution_status: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
          step_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_code: string
          error_message?: string | null
          error_stack?: string | null
          execution_id?: string | null
          fsm_snapshot?: Json | null
          id?: string
          input_data?: Json | null
          node_config?: Json | null
          node_type?: string | null
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          step_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string
          error_message?: string | null
          error_stack?: string | null
          execution_id?: string | null
          fsm_snapshot?: Json | null
          id?: string
          input_data?: Json | null
          node_config?: Json | null
          node_type?: string | null
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_dead_letter_queue_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "agent_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      file_embeddings: {
        Row: {
          content_hash: string
          created_at: string
          embedding: string | null
          file_path: string
          id: string
          project_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          embedding?: string | null
          file_path: string
          id?: string
          project_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          embedding?: string | null
          file_path?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_embeddings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_edges: {
        Row: {
          created_at: string | null
          graph_id: string
          id: string
          properties: Json | null
          relationship: string
          source_node_id: string
          target_node_id: string
          tenant_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          graph_id?: string
          id?: string
          properties?: Json | null
          relationship: string
          source_node_id: string
          target_node_id: string
          tenant_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          graph_id?: string
          id?: string
          properties?: Json | null
          relationship?: string
          source_node_id?: string
          target_node_id?: string
          tenant_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kg_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kg_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "kg_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      kg_nodes: {
        Row: {
          created_at: string | null
          embedding: string | null
          graph_id: string
          id: string
          label: string
          node_type: string
          properties: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          graph_id?: string
          id?: string
          label: string
          node_type: string
          properties?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          graph_id?: string
          id?: string
          label?: string
          node_type?: string
          properties?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
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
      plans: {
        Row: {
          assumptions: Json | null
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          expires_at: string
          id: string
          markdown: string | null
          mission: string | null
          objective: string | null
          out_of_scope: Json | null
          phases: Json | null
          project_id: string
          rationale: string | null
          run_id: string
          status: string
          steps: Json
          summary: string | null
        }
        Insert: {
          assumptions?: Json | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          markdown?: string | null
          mission?: string | null
          objective?: string | null
          out_of_scope?: Json | null
          phases?: Json | null
          project_id: string
          rationale?: string | null
          run_id: string
          status?: string
          steps?: Json
          summary?: string | null
        }
        Update: {
          assumptions?: Json | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          markdown?: string | null
          mission?: string | null
          objective?: string | null
          out_of_scope?: Json | null
          phases?: Json | null
          project_id?: string
          rationale?: string | null
          run_id?: string
          status?: string
          steps?: Json
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_secrets: {
        Row: {
          hint: string
          name: string
          updated_at: string
          updated_by: string | null
          value_encrypted: string
        }
        Insert: {
          hint?: string
          name: string
          updated_at?: string
          updated_by?: string | null
          value_encrypted: string
        }
        Update: {
          hint?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
          value_encrypted?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          github_username: string | null
          id: string
          integration_prefs: Json
          onboarding_completed_at: string | null
          onboarding_step: string | null
          taste_chat_remaining: number
          taste_lead_consent_at: string | null
          taste_lead_email: string | null
          taste_start_remaining: number
          trial_messages_remaining: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_username?: string | null
          id: string
          integration_prefs?: Json
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          taste_chat_remaining?: number
          taste_lead_consent_at?: string | null
          taste_lead_email?: string | null
          taste_start_remaining?: number
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
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          taste_chat_remaining?: number
          taste_lead_consent_at?: string | null
          taste_lead_email?: string | null
          taste_start_remaining?: number
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
      project_skills: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          project_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          project_id: string
          skill_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          project_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_skills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
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
          kind: string
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
          kind?: string
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
          kind?: string
          meta?: Json
          name?: string
          owner_id?: string
          slug?: string
          template?: string
          updated_at?: string
        }
        Relationships: []
      }
      prometheus_auto_heal_config: {
        Row: {
          allowed_treatments: string[] | null
          check_interval_minutes: number | null
          created_at: string | null
          enabled: boolean | null
          error_spike_threshold: number | null
          flow_id: string
          id: string
          latency_spike_threshold_ms: number | null
          max_auto_corrections: number | null
          notify_email: string | null
          notify_on_heal: boolean | null
          quality_drop_threshold: number | null
          shadow_mode: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_treatments?: string[] | null
          check_interval_minutes?: number | null
          created_at?: string | null
          enabled?: boolean | null
          error_spike_threshold?: number | null
          flow_id: string
          id?: string
          latency_spike_threshold_ms?: number | null
          max_auto_corrections?: number | null
          notify_email?: string | null
          notify_on_heal?: boolean | null
          quality_drop_threshold?: number | null
          shadow_mode?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_treatments?: string[] | null
          check_interval_minutes?: number | null
          created_at?: string | null
          enabled?: boolean | null
          error_spike_threshold?: number | null
          flow_id?: string
          id?: string
          latency_spike_threshold_ms?: number | null
          max_auto_corrections?: number | null
          notify_email?: string | null
          notify_on_heal?: boolean | null
          quality_drop_threshold?: number | null
          shadow_mode?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prometheus_build_sessions: {
        Row: {
          architecture: Json | null
          build_time_seconds: number | null
          completed_at: string | null
          created_at: string | null
          fallback_model_id: string | null
          flow_definition: Json | null
          id: string
          intent: string
          iterations: number | null
          messages: Json | null
          output_flow_id: string | null
          phase: string
          prompts: Json | null
          quality_model: string
          report: Json | null
          requirements: Json | null
          research_cache: Json
          specialist_calls: Json | null
          success: boolean | null
          target_flow_id: string | null
          test_results: Json | null
          test_suite: Json | null
          token_budget: number
          tokens_used: number
          user_id: string
        }
        Insert: {
          architecture?: Json | null
          build_time_seconds?: number | null
          completed_at?: string | null
          created_at?: string | null
          fallback_model_id?: string | null
          flow_definition?: Json | null
          id?: string
          intent?: string
          iterations?: number | null
          messages?: Json | null
          output_flow_id?: string | null
          phase?: string
          prompts?: Json | null
          quality_model?: string
          report?: Json | null
          requirements?: Json | null
          research_cache?: Json
          specialist_calls?: Json | null
          success?: boolean | null
          target_flow_id?: string | null
          test_results?: Json | null
          test_suite?: Json | null
          token_budget?: number
          tokens_used?: number
          user_id: string
        }
        Update: {
          architecture?: Json | null
          build_time_seconds?: number | null
          completed_at?: string | null
          created_at?: string | null
          fallback_model_id?: string | null
          flow_definition?: Json | null
          id?: string
          intent?: string
          iterations?: number | null
          messages?: Json | null
          output_flow_id?: string | null
          phase?: string
          prompts?: Json | null
          quality_model?: string
          report?: Json | null
          requirements?: Json | null
          research_cache?: Json
          specialist_calls?: Json | null
          success?: boolean | null
          target_flow_id?: string | null
          test_results?: Json | null
          test_suite?: Json | null
          token_budget?: number
          tokens_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prometheus_build_sessions_output_flow_id_fkey"
            columns: ["output_flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prometheus_build_sessions_target_flow_id_fkey"
            columns: ["target_flow_id"]
            isOneToOne: false
            referencedRelation: "agent_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      prometheus_build_turns: {
        Row: {
          agent_display: string
          agent_key: string
          content: string
          created_at: string | null
          id: string
          message_type: string
          output_data: Json | null
          phase: string
          round: number | null
          session_id: string
          tool_calls: Json | null
        }
        Insert: {
          agent_display: string
          agent_key: string
          content: string
          created_at?: string | null
          id?: string
          message_type?: string
          output_data?: Json | null
          phase: string
          round?: number | null
          session_id: string
          tool_calls?: Json | null
        }
        Update: {
          agent_display?: string
          agent_key?: string
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string
          output_data?: Json | null
          phase?: string
          round?: number | null
          session_id?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prometheus_build_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "prometheus_build_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      prometheus_healing_log: {
        Row: {
          auto_rollback: boolean | null
          config_id: string | null
          created_at: string | null
          diagnosis: string | null
          diagnosis_latency_ms: number | null
          flow_id: string
          id: string
          metrics_after: Json | null
          metrics_before: Json | null
          model_used: string | null
          outcome: string | null
          resolved_at: string | null
          root_cause: string | null
          severity: string | null
          shadow_result: Json | null
          symptom: string
          symptom_data: Json | null
          treatment_applied: string | null
          treatment_data: Json | null
          user_id: string
        }
        Insert: {
          auto_rollback?: boolean | null
          config_id?: string | null
          created_at?: string | null
          diagnosis?: string | null
          diagnosis_latency_ms?: number | null
          flow_id: string
          id?: string
          metrics_after?: Json | null
          metrics_before?: Json | null
          model_used?: string | null
          outcome?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          shadow_result?: Json | null
          symptom: string
          symptom_data?: Json | null
          treatment_applied?: string | null
          treatment_data?: Json | null
          user_id: string
        }
        Update: {
          auto_rollback?: boolean | null
          config_id?: string | null
          created_at?: string | null
          diagnosis?: string | null
          diagnosis_latency_ms?: number | null
          flow_id?: string
          id?: string
          metrics_after?: Json | null
          metrics_before?: Json | null
          model_used?: string | null
          outcome?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          shadow_result?: Json | null
          symptom?: string
          symptom_data?: Json | null
          treatment_applied?: string | null
          treatment_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prometheus_healing_log_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "prometheus_auto_heal_config"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_store: {
        Row: {
          ab_experiment_id: string | null
          ab_group: string | null
          ab_traffic_percent: number | null
          avg_quality_score: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_version_id: string | null
          slug: string
          system_prompt: string
          template_variables: Json | null
          tenant_id: string | null
          total_uses: number | null
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          ab_experiment_id?: string | null
          ab_group?: string | null
          ab_traffic_percent?: number | null
          avg_quality_score?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_version_id?: string | null
          slug: string
          system_prompt: string
          template_variables?: Json | null
          tenant_id?: string | null
          total_uses?: number | null
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          ab_experiment_id?: string | null
          ab_group?: string | null
          ab_traffic_percent?: number | null
          avg_quality_score?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_version_id?: string | null
          slug?: string
          system_prompt?: string
          template_variables?: Json | null
          tenant_id?: string | null
          total_uses?: number | null
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: []
      }
      rag_chunks: {
        Row: {
          char_end: number | null
          char_start: number | null
          chunk_index: number
          content: string
          created_at: string | null
          document_id: string
          embedding: string | null
          heading: string | null
          id: string
          page_number: number | null
          tenant_id: string
        }
        Insert: {
          char_end?: number | null
          char_start?: number | null
          chunk_index: number
          content: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          heading?: string | null
          id?: string
          page_number?: number | null
          tenant_id: string
        }
        Update: {
          char_end?: number | null
          char_start?: number | null
          chunk_index?: number
          content?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          heading?: string | null
          id?: string
          page_number?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rag_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_documents: {
        Row: {
          chunk_overlap: number | null
          chunk_size: number | null
          chunk_strategy: string | null
          created_at: string | null
          document_metadata: Json | null
          embedding_model: string | null
          file_name: string | null
          file_size_bytes: number | null
          flow_id: string | null
          id: string
          last_indexed_at: string | null
          mime_type: string | null
          processing_status: string | null
          reindex_required: boolean | null
          source_type: string
          source_url: string | null
          storage_path: string | null
          tenant_id: string
          total_chunks: number | null
          updated_at: string | null
        }
        Insert: {
          chunk_overlap?: number | null
          chunk_size?: number | null
          chunk_strategy?: string | null
          created_at?: string | null
          document_metadata?: Json | null
          embedding_model?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          flow_id?: string | null
          id?: string
          last_indexed_at?: string | null
          mime_type?: string | null
          processing_status?: string | null
          reindex_required?: boolean | null
          source_type?: string
          source_url?: string | null
          storage_path?: string | null
          tenant_id: string
          total_chunks?: number | null
          updated_at?: string | null
        }
        Update: {
          chunk_overlap?: number | null
          chunk_size?: number | null
          chunk_strategy?: string | null
          created_at?: string | null
          document_metadata?: Json | null
          embedding_model?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          flow_id?: string | null
          id?: string
          last_indexed_at?: string | null
          mime_type?: string | null
          processing_status?: string | null
          reindex_required?: boolean | null
          source_type?: string
          source_url?: string | null
          storage_path?: string | null
          tenant_id?: string
          total_chunks?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      semantic_cache: {
        Row: {
          cached_response: string
          cost_saved_cents: number | null
          created_at: string | null
          expires_at: string | null
          flow_id: string | null
          flow_version: number | null
          hit_count: number | null
          id: string
          input_embedding: string | null
          input_hash: string | null
          input_text: string | null
          input_text_hash: string
          last_hit_at: string | null
          model_id: string | null
          quality_score: number | null
          response_quality_score: number | null
          response_text: string | null
          similarity_score: number | null
          similarity_threshold: number | null
          tenant_id: string | null
          tokens_saved: number | null
        }
        Insert: {
          cached_response: string
          cost_saved_cents?: number | null
          created_at?: string | null
          expires_at?: string | null
          flow_id?: string | null
          flow_version?: number | null
          hit_count?: number | null
          id?: string
          input_embedding?: string | null
          input_hash?: string | null
          input_text?: string | null
          input_text_hash: string
          last_hit_at?: string | null
          model_id?: string | null
          quality_score?: number | null
          response_quality_score?: number | null
          response_text?: string | null
          similarity_score?: number | null
          similarity_threshold?: number | null
          tenant_id?: string | null
          tokens_saved?: number | null
        }
        Update: {
          cached_response?: string
          cost_saved_cents?: number | null
          created_at?: string | null
          expires_at?: string | null
          flow_id?: string | null
          flow_version?: number | null
          hit_count?: number | null
          id?: string
          input_embedding?: string | null
          input_hash?: string | null
          input_text?: string | null
          input_text_hash?: string
          last_hit_at?: string | null
          model_id?: string | null
          quality_score?: number | null
          response_quality_score?: number | null
          response_text?: string | null
          similarity_score?: number | null
          similarity_threshold?: number | null
          tenant_id?: string | null
          tokens_saved?: number | null
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          description: string
          id: string
          installs: number
          is_public: boolean
          name: string
          owner_id: string | null
          system_prompt: string | null
          tools: Json
          updated_at: string
          validate_trigger: string | null
          version: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          installs?: number
          is_public?: boolean
          name: string
          owner_id?: string | null
          system_prompt?: string | null
          tools?: Json
          updated_at?: string
          validate_trigger?: string | null
          version?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          installs?: number
          is_public?: boolean
          name?: string
          owner_id?: string | null
          system_prompt?: string | null
          tools?: Json
          updated_at?: string
          validate_trigger?: string | null
          version?: string
        }
        Relationships: []
      }
      tenant_secrets: {
        Row: {
          access_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          encrypted_value: string
          encryption_key_id: string
          expires_at: string | null
          id: string
          is_platform_provided: boolean | null
          last_accessed_at: string | null
          provider_id: string | null
          rotated_at: string | null
          rotation_reminder_sent: boolean | null
          secret_name: string
          secret_type: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          access_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          encrypted_value: string
          encryption_key_id?: string
          expires_at?: string | null
          id?: string
          is_platform_provided?: boolean | null
          last_accessed_at?: string | null
          provider_id?: string | null
          rotated_at?: string | null
          rotation_reminder_sent?: boolean | null
          secret_name: string
          secret_type?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          access_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          encrypted_value?: string
          encryption_key_id?: string
          expires_at?: string | null
          id?: string
          is_platform_provided?: boolean | null
          last_accessed_at?: string | null
          provider_id?: string | null
          rotated_at?: string | null
          rotation_reminder_sent?: boolean | null
          secret_name?: string
          secret_type?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tool_circuit_breaker_state: {
        Row: {
          failures: number
          last_failure_at: string | null
          opened_at: string | null
          state: string
          tool_name: string
          updated_at: string
        }
        Insert: {
          failures?: number
          last_failure_at?: string | null
          opened_at?: string | null
          state?: string
          tool_name: string
          updated_at?: string
        }
        Update: {
          failures?: number
          last_failure_at?: string | null
          opened_at?: string | null
          state?: string
          tool_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_registry: {
        Row: {
          category: string | null
          circuit_breaker_threshold: number | null
          circuit_breaker_timeout_seconds: number | null
          created_at: string | null
          description: string | null
          display_name: string
          executor_config: Json
          executor_type: string
          icon: string | null
          id: string
          input_schema: Json
          is_active: boolean | null
          is_builtin: boolean | null
          name: string
          output_schema: Json
          rate_limit_per_minute: number | null
          rate_limit_per_tenant_per_minute: number | null
          required_secrets: string[] | null
          requires_idempotency: boolean | null
          sandbox_level: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          circuit_breaker_threshold?: number | null
          circuit_breaker_timeout_seconds?: number | null
          created_at?: string | null
          description?: string | null
          display_name: string
          executor_config?: Json
          executor_type?: string
          icon?: string | null
          id?: string
          input_schema?: Json
          is_active?: boolean | null
          is_builtin?: boolean | null
          name: string
          output_schema?: Json
          rate_limit_per_minute?: number | null
          rate_limit_per_tenant_per_minute?: number | null
          required_secrets?: string[] | null
          requires_idempotency?: boolean | null
          sandbox_level?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          circuit_breaker_threshold?: number | null
          circuit_breaker_timeout_seconds?: number | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          executor_config?: Json
          executor_type?: string
          icon?: string | null
          id?: string
          input_schema?: Json
          is_active?: boolean | null
          is_builtin?: boolean | null
          name?: string
          output_schema?: Json
          rate_limit_per_minute?: number | null
          rate_limit_per_tenant_per_minute?: number | null
          required_secrets?: string[] | null
          requires_idempotency?: boolean | null
          sandbox_level?: string | null
          updated_at?: string | null
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
      webhook_inbox: {
        Row: {
          body: Json
          created_at: string | null
          dedup_key: string | null
          error_message: string | null
          external_id: string | null
          headers: Json | null
          id: string
          max_retries: number | null
          next_retry_at: string | null
          processed_at: string | null
          retry_count: number | null
          signature: string | null
          signature_verified: boolean | null
          source: string
          status: string | null
        }
        Insert: {
          body: Json
          created_at?: string | null
          dedup_key?: string | null
          error_message?: string | null
          external_id?: string | null
          headers?: Json | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          processed_at?: string | null
          retry_count?: number | null
          signature?: string | null
          signature_verified?: boolean | null
          source: string
          status?: string | null
        }
        Update: {
          body?: Json
          created_at?: string | null
          dedup_key?: string | null
          error_message?: string | null
          external_id?: string | null
          headers?: Json | null
          id?: string
          max_retries?: number | null
          next_retry_at?: string | null
          processed_at?: string | null
          retry_count?: number | null
          signature?: string | null
          signature_verified?: boolean | null
          source?: string
          status?: string | null
        }
        Relationships: []
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
      acquire_agent_run_lock: {
        Args: {
          p_conversation_id: string
          p_project_id: string
          p_user_id: string
        }
        Returns: string
      }
      cleanup_expired_agent_memories: { Args: never; Returns: number }
      forge_agent_sql_readonly: { Args: { p_sql: string }; Returns: Json }
      forge_describe_table: { Args: { p_table: string }; Returns: Json }
      forge_list_public_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_cache_hit: { Args: { cache_id: string }; Returns: undefined }
      is_flow_editor: {
        Args: { _flow_id: string; _user_id: string }
        Returns: boolean
      }
      is_flow_member: {
        Args: { _flow_id: string; _user_id: string }
        Returns: boolean
      }
      is_flow_owner: {
        Args: { _flow_id: string; _user_id: string }
        Returns: boolean
      }
      kg_get_neighbors: {
        Args: {
          p_direction?: string
          p_max_depth?: number
          p_node_id: string
          p_relationship?: string
          p_tenant_id: string
        }
        Returns: {
          depth: number
          direction: string
          edge_id: string
          edge_properties: Json
          edge_relationship: string
          edge_weight: number
          node_id: string
          node_label: string
          node_properties: Json
          node_type: string
        }[]
      }
      kg_shortest_path: {
        Args: {
          p_max_depth?: number
          p_source_id: string
          p_target_id: string
          p_tenant_id: string
        }
        Returns: {
          path_edge_relationship: string
          path_node_id: string
          path_node_label: string
          path_step: number
        }[]
      }
      match_rag_chunks: {
        Args: {
          filter_document_ids?: string[]
          filter_tenant_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          heading: string
          id: string
          page_number: number
          similarity: number
        }[]
      }
      owns_build_session: { Args: { _session_id: string }; Returns: boolean }
      prometheus_increment_iteration: {
        Args: { p_session_id: string }
        Returns: number
      }
      search_codex_genomes: {
        Args: {
          p_embedding: string
          p_match_count?: number
          p_match_threshold?: number
        }
        Returns: {
          description: string
          domain: string
          genome_key: string
          id: string
          name: string
          similarity: number
        }[]
      }
      search_rag_chunks: {
        Args: {
          p_embedding: string
          p_match_count?: number
          p_match_threshold?: number
          p_tenant_id: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          heading: string
          id: string
          page_number: number
          similarity: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
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
