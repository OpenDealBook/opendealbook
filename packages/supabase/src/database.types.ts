export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          ai_redaction_enabled: boolean
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          public_data: Json
          slug: string | null
          trial_ends_at: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ai_redaction_enabled?: boolean
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_personal_account?: boolean
          name: string
          picture_url?: string | null
          primary_owner_user_id?: string
          public_data?: Json
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ai_redaction_enabled?: boolean
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_personal_account?: boolean
          name?: string
          picture_url?: string | null
          primary_owner_user_id?: string
          public_data?: Json
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      accounts_memberships: {
        Row: {
          account_id: string
          account_role: string
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_role: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_role?: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_role_fkey"
            columns: ["account_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      ai_call_log: {
        Row: {
          account_id: string
          completion_tokens: number | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          endpoint_id: string | null
          id: string
          model: string
          prompt_tokens: number | null
        }
        Insert: {
          account_id: string
          completion_tokens?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          endpoint_id?: string | null
          id?: string
          model: string
          prompt_tokens?: number | null
        }
        Update: {
          account_id?: string
          completion_tokens?: number | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          endpoint_id?: string | null
          id?: string
          model?: string
          prompt_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_log_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "llm_endpoint"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      approval: {
        Row: {
          created_at: string
          deal_id: string
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["approval_decision"] | null
          id: string
          requested_by: string
          subject: Database["public"]["Enums"]["approval_subject"]
        }
        Insert: {
          created_at?: string
          deal_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"] | null
          id?: string
          requested_by?: string
          subject: Database["public"]["Enums"]["approval_subject"]
        }
        Update: {
          created_at?: string
          deal_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"] | null
          id?: string
          requested_by?: string
          subject?: Database["public"]["Enums"]["approval_subject"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_event: {
        Row: {
          account_id: string
          actor_user_id: string
          created_at: string
          deal_id: string | null
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          account_id: string
          actor_user_id?: string
          created_at?: string
          deal_id?: string | null
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          account_id?: string
          actor_user_id?: string
          created_at?: string
          deal_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_event_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          account_id: string
          customer_id: string
          email: string | null
          id: number
          provider: Database["public"]["Enums"]["billing_provider"]
        }
        Insert: {
          account_id: string
          customer_id: string
          email?: string | null
          id?: number
          provider: Database["public"]["Enums"]["billing_provider"]
        }
        Update: {
          account_id?: string
          customer_id?: string
          email?: string | null
          id?: number
          provider?: Database["public"]["Enums"]["billing_provider"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_intake: {
        Row: {
          account_id: string
          asking_price: number | null
          created_at: string
          firm_id: string | null
          firm_name: string
          id: string
          nda_required: boolean
          status: Database["public"]["Enums"]["broker_intake_status"]
          submitted_by_contact_id: string | null
          teaser: string | null
        }
        Insert: {
          account_id: string
          asking_price?: number | null
          created_at?: string
          firm_id?: string | null
          firm_name: string
          id?: string
          nda_required?: boolean
          status?: Database["public"]["Enums"]["broker_intake_status"]
          submitted_by_contact_id?: string | null
          teaser?: string | null
        }
        Update: {
          account_id?: string
          asking_price?: number | null
          created_at?: string
          firm_id?: string | null
          firm_name?: string
          id?: string
          nda_required?: boolean
          status?: Database["public"]["Enums"]["broker_intake_status"]
          submitted_by_contact_id?: string | null
          teaser?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_intake_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_intake_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_intake_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_intake_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_intake_submitted_by_contact_id_fkey"
            columns: ["submitted_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_profile: {
        Row: {
          about: string | null
          account_id: string
          contact_json: Json | null
          created_at: string | null
          created_by: string | null
          display_name: string | null
          experience: string | null
          expertise_json: Json | null
          financing_json: Json | null
          headline: string | null
          id: string
          include_sensitive: boolean
          interested_json: Json | null
          motivation: string | null
          not_interested_json: Json | null
          photo_path: string | null
          sensitive_json: Json | null
          target_statement: string | null
          updated_at: string | null
          updated_by: string | null
          value_proposition: string | null
          version: number
        }
        Insert: {
          about?: string | null
          account_id: string
          contact_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          experience?: string | null
          expertise_json?: Json | null
          financing_json?: Json | null
          headline?: string | null
          id?: string
          include_sensitive?: boolean
          interested_json?: Json | null
          motivation?: string | null
          not_interested_json?: Json | null
          photo_path?: string | null
          sensitive_json?: Json | null
          target_statement?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value_proposition?: string | null
          version: number
        }
        Update: {
          about?: string | null
          account_id?: string
          contact_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          experience?: string | null
          expertise_json?: Json | null
          financing_json?: Json | null
          headline?: string | null
          id?: string
          include_sensitive?: boolean
          interested_json?: Json | null
          motivation?: string | null
          not_interested_json?: Json | null
          photo_path?: string | null
          sensitive_json?: Json | null
          target_statement?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value_proposition?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "buyer_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item: {
        Row: {
          account_id: string
          artifact_id: string | null
          artifact_type: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          deal_killer: boolean
          due_at: string | null
          due_offset_days: number | null
          id: string
          outcome: Database["public"]["Enums"]["checklist_outcome"] | null
          owner_user_id: string | null
          priority: number
          received_at: string | null
          requested_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_week_id: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          artifact_id?: string | null
          artifact_type?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          deal_killer?: boolean
          due_at?: string | null
          due_offset_days?: number | null
          id?: string
          outcome?: Database["public"]["Enums"]["checklist_outcome"] | null
          owner_user_id?: string | null
          priority?: number
          received_at?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_week_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          artifact_id?: string | null
          artifact_type?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          deal_killer?: boolean
          due_at?: string | null
          due_offset_days?: number | null
          id?: string
          outcome?: Database["public"]["Enums"]["checklist_outcome"] | null
          owner_user_id?: string | null
          priority?: number
          received_at?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_week_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_schedule_week_id_fkey"
            columns: ["schedule_week_id"]
            isOneToOne: false
            referencedRelation: "schedule_week"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template: {
        Row: {
          account_id: string
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_item: {
        Row: {
          category: string | null
          deal_killer: boolean
          due_offset_days: number | null
          id: string
          priority: number
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          category?: string | null
          deal_killer?: boolean
          due_offset_days?: number | null
          id?: string
          priority?: number
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          category?: string | null
          deal_killer?: boolean
          due_offset_days?: number | null
          id?: string
          priority?: number
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_item_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_template"
            referencedColumns: ["id"]
          },
        ]
      }
      client_transition: {
        Row: {
          account_id: string
          client_name: string
          consent_7216_status: Database["public"]["Enums"]["checklist_status"]
          created_at: string | null
          created_by: string | null
          deal_id: string
          efile_auth_status: Database["public"]["Enums"]["checklist_status"]
          engagement_letter_status: Database["public"]["Enums"]["checklist_status"]
          id: string
          portal_migration_status: Database["public"]["Enums"]["checklist_status"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          client_name: string
          consent_7216_status?: Database["public"]["Enums"]["checklist_status"]
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          efile_auth_status?: Database["public"]["Enums"]["checklist_status"]
          engagement_letter_status?: Database["public"]["Enums"]["checklist_status"]
          id?: string
          portal_migration_status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          client_name?: string
          consent_7216_status?: Database["public"]["Enums"]["checklist_status"]
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          efile_auth_status?: Database["public"]["Enums"]["checklist_status"]
          engagement_letter_status?: Database["public"]["Enums"]["checklist_status"]
          id?: string
          portal_migration_status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_transition_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transition_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transition_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transition_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing: boolean
          enable_team_account_billing: boolean
          enable_team_accounts: boolean
        }
        Insert: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
        }
        Update: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
        }
        Relationships: []
      }
      contact: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          email: string | null
          firm_id: string | null
          id: string
          kind: string
          name: string
          phone: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          firm_id?: string | null
          id?: string
          kind?: string
          name: string
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          firm_id?: string | null
          id?: string
          kind?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
        ]
      }
      contract: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          current_version: number | null
          deal_id: string
          id: string
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          current_version?: number | null
          deal_id: string
          id?: string
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          current_version?: number | null
          deal_id?: string
          id?: string
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_version: {
        Row: {
          account_id: string
          author_user_id: string | null
          change_summary: string | null
          content_hash: string | null
          contract_id: string
          created_at: string
          docx_path: string | null
          id: string
          is_signed: boolean
          party: string
          pdf_path: string | null
          source: string
          version: number
        }
        Insert: {
          account_id: string
          author_user_id?: string | null
          change_summary?: string | null
          content_hash?: string | null
          contract_id: string
          created_at?: string
          docx_path?: string | null
          id?: string
          is_signed?: boolean
          party: string
          pdf_path?: string | null
          source: string
          version: number
        }
        Update: {
          account_id?: string
          author_user_id?: string | null
          change_summary?: string | null
          content_hash?: string | null
          contract_id?: string
          created_at?: string
          docx_path?: string | null
          id?: string
          is_signed?: boolean
          party?: string
          pdf_path?: string | null
          source?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_version_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract"
            referencedColumns: ["id"]
          },
        ]
      }
      data_source: {
        Row: {
          account_id: string
          config_json: Json
          created_at: string | null
          created_by: string | null
          id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          config_json?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          config_json?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_source_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_source_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_source_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal: {
        Row: {
          account_id: string
          asking_price: number | null
          broker_contact_id: string | null
          close_date: string | null
          created_at: string | null
          created_by: string | null
          deal_box_version: number | null
          description: string | null
          ebitda_ttm: number | null
          firm_id: string | null
          id: string
          notes: string | null
          owner_user_id: string | null
          revenue_ttm: number | null
          sde_ttm: number | null
          source: Database["public"]["Enums"]["deal_source"]
          stage: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          asking_price?: number | null
          broker_contact_id?: string | null
          close_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_box_version?: number | null
          description?: string | null
          ebitda_ttm?: number | null
          firm_id?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          revenue_ttm?: number | null
          sde_ttm?: number | null
          source?: Database["public"]["Enums"]["deal_source"]
          stage?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          asking_price?: number | null
          broker_contact_id?: string | null
          close_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_box_version?: number | null
          description?: string | null
          ebitda_ttm?: number | null
          firm_id?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          revenue_ttm?: number | null
          sde_ttm?: number | null
          source?: Database["public"]["Enums"]["deal_source"]
          stage?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_broker_contact_id_fkey"
            columns: ["broker_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_pipeline_stage_fk"
            columns: ["account_id", "stage"]
            isOneToOne: false
            referencedRelation: "pipeline_stage"
            referencedColumns: ["account_id", "key"]
          },
        ]
      }
      deal_box: {
        Row: {
          account_id: string
          broker_summary: string | null
          created_at: string | null
          created_by: string | null
          criteria_json: Json
          id: string
          updated_at: string | null
          updated_by: string | null
          version: number
        }
        Insert: {
          account_id: string
          broker_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          criteria_json?: Json
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          version: number
        }
        Update: {
          account_id?: string
          broker_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          criteria_json?: Json
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_box_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_box_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_box_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_participant: {
        Row: {
          created_at: string | null
          created_by: string | null
          deal_id: string
          expires_at: string | null
          id: string
          party: Database["public"]["Enums"]["participant_party"]
          permission: Database["public"]["Enums"]["participant_permission"]
          role: string | null
          scope: Database["public"]["Enums"]["participant_scope"]
          scope_id: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          expires_at?: string | null
          id?: string
          party: Database["public"]["Enums"]["participant_party"]
          permission?: Database["public"]["Enums"]["participant_permission"]
          role?: string | null
          scope?: Database["public"]["Enums"]["participant_scope"]
          scope_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          expires_at?: string | null
          id?: string
          party?: Database["public"]["Enums"]["participant_party"]
          permission?: Database["public"]["Enums"]["participant_permission"]
          role?: string | null
          scope?: Database["public"]["Enums"]["participant_scope"]
          scope_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_participant_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_schedule: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          start_date: string | null
          status: string
          target_apa_date: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          start_date?: string | null
          status?: string
          target_apa_date?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          start_date?: string | null
          status?: string
          target_apa_date?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diligence_schedule_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_schedule_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_schedule_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_schedule_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunk: {
        Row: {
          account_id: string
          chunk_index: number
          content: string
          created_at: string
          deal_id: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          account_id: string
          chunk_index: number
          content: string
          created_at?: string
          deal_id: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          account_id?: string
          chunk_index?: number
          content?: string
          created_at?: string
          deal_id?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunk_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunk_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dr_document"
            referencedColumns: ["id"]
          },
        ]
      }
      document_share: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string | null
          first_viewed_at: string | null
          generated_document_id: string
          id: string
          permission: string | null
          recipient_user_id: string | null
          sent_at: string | null
          workflow_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at?: string | null
          first_viewed_at?: string | null
          generated_document_id: string
          id?: string
          permission?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string | null
          first_viewed_at?: string | null
          generated_document_id?: string
          id?: string
          permission?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_share_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_share_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_share_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_share_generated_document_id_fkey"
            columns: ["generated_document_id"]
            isOneToOne: false
            referencedRelation: "generated_document"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          docx_path: string | null
          id: string
          name: string
          type: string
          updated_at: string | null
          version: number
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          docx_path?: string | null
          id?: string
          name: string
          type: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          docx_path?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dr_document: {
        Row: {
          account_id: string
          checklist_item_id: string | null
          created_at: string | null
          deal_id: string
          folder_id: string
          id: string
          name: string
          storage_path: string
          updated_at: string | null
          uploaded_by: string | null
          version: number
        }
        Insert: {
          account_id: string
          checklist_item_id?: string | null
          created_at?: string | null
          deal_id: string
          folder_id: string
          id?: string
          name: string
          storage_path: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          checklist_item_id?: string | null
          created_at?: string | null
          deal_id?: string
          folder_id?: string
          id?: string
          name?: string
          storage_path?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dr_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_document_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_document_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_document_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      dr_folder: {
        Row: {
          account_id: string
          created_at: string | null
          deal_id: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          deal_id: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          deal_id?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dr_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_folder_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dr_folder_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_job: {
        Row: {
          account_id: string
          chunk_count: number | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          dr_document_id: string
          error: string | null
          id: string
          model: string | null
          status: Database["public"]["Enums"]["embedding_job_status"]
          updated_at: string | null
        }
        Insert: {
          account_id: string
          chunk_count?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          dr_document_id: string
          error?: string | null
          id?: string
          model?: string | null
          status?: Database["public"]["Enums"]["embedding_job_status"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          chunk_count?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          dr_document_id?: string
          error?: string | null
          id?: string
          model?: string | null
          status?: Database["public"]["Enums"]["embedding_job_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embedding_job_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_job_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_job_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_job_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embedding_job_dr_document_id_fkey"
            columns: ["dr_document_id"]
            isOneToOne: false
            referencedRelation: "dr_document"
            referencedColumns: ["id"]
          },
        ]
      }
      employee: {
        Row: {
          account_id: string
          comp: number | null
          created_at: string | null
          created_by: string | null
          credentials: string | null
          deal_id: string
          id: string
          key_person: boolean
          name: string
          non_compete: boolean
          non_solicit: boolean
          role: string | null
          tenure_years: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          comp?: number | null
          created_at?: string | null
          created_by?: string | null
          credentials?: string | null
          deal_id: string
          id?: string
          key_person?: boolean
          name: string
          non_compete?: boolean
          non_solicit?: boolean
          role?: string | null
          tenure_years?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          comp?: number | null
          created_at?: string | null
          created_by?: string | null
          credentials?: string | null
          deal_id?: string
          id?: string
          key_person?: boolean
          name?: string
          non_compete?: boolean
          non_solicit?: boolean
          role?: string | null
          tenure_years?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      firm: {
        Row: {
          account_id: string
          city: string | null
          created_at: string | null
          created_by: string | null
          employee_band: string | null
          established_year: number | null
          icp_score: number | null
          id: string
          imported_at: string
          industry: string | null
          name: string
          owner_age_estimate: number | null
          owner_name: string | null
          service_mix_json: Json
          source: string | null
          source_url: string | null
          state: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          account_id: string
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_band?: string | null
          established_year?: number | null
          icp_score?: number | null
          id?: string
          imported_at?: string
          industry?: string | null
          name: string
          owner_age_estimate?: number | null
          owner_name?: string | null
          service_mix_json?: Json
          source?: string | null
          source_url?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          account_id?: string
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_band?: string | null
          established_year?: number | null
          icp_score?: number | null
          id?: string
          imported_at?: string
          industry?: string | null
          name?: string
          owner_age_estimate?: number | null
          owner_name?: string | null
          service_mix_json?: Json
          source?: string | null
          source_url?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_document: {
        Row: {
          account_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          docx_path: string | null
          id: string
          pdf_path: string | null
          template_id: string | null
          template_version: number | null
          values_json: Json
        }
        Insert: {
          account_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          docx_path?: string | null
          id?: string
          pdf_path?: string | null
          template_id?: string | null
          template_version?: number | null
          values_json?: Json
        }
        Update: {
          account_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          docx_path?: string | null
          id?: string
          pdf_path?: string | null
          template_id?: string | null
          template_version?: number | null
          values_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "generated_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_document_contract_id_fk"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_document_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_document_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_template"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_audit_engagement: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          due_at: string | null
          findings_json: Json
          id: string
          ordered_at: string | null
          provider: string
          report_document_id: string | null
          scope: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          updated_at: string | null
          updated_by: string | null
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          due_at?: string | null
          findings_json?: Json
          id?: string
          ordered_at?: string | null
          provider: string
          report_document_id?: string | null
          scope?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
          updated_by?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          due_at?: string | null
          findings_json?: Json
          id?: string
          ordered_at?: string | null
          provider?: string
          report_document_id?: string | null
          scope?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
          updated_by?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_audit_engagement_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_audit_engagement_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_audit_engagement_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_audit_engagement_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_audit_engagement_report_document_id_fkey"
            columns: ["report_document_id"]
            isOneToOne: false
            referencedRelation: "dr_document"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connection: {
        Row: {
          account_id: string
          connected_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          nango_connection_id: string
          provider: string
          scopes: string[] | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          connected_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          nango_connection_id: string
          provider: string
          scopes?: string[] | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          connected_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          nango_connection_id?: string
          provider?: string
          scopes?: string[] | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          account_id: string
          created_at: string
          email: string
          expires_at: string
          id: number
          invite_token: string
          invited_by: string
          role: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: number
          invite_token?: string
          invited_by: string
          role: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: number
          invite_token?: string
          invited_by?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      llm_endpoint: {
        Row: {
          account_id: string
          base_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          model: string
          provider: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          base_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          model: string
          provider: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          base_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          model?: string
          provider?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_endpoint_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_endpoint_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_endpoint_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting: {
        Row: {
          account_id: string
          attendees: Json
          created_at: string | null
          created_by: string | null
          deal_id: string
          decisions: string | null
          id: string
          notes: string | null
          recording_url: string | null
          scheduled_at: string | null
          series_id: string | null
          status: Database["public"]["Enums"]["meeting_status"] | null
          type: string
          updated_at: string | null
          updated_by: string | null
          video_url: string | null
        }
        Insert: {
          account_id: string
          attendees?: Json
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          decisions?: string | null
          id?: string
          notes?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["meeting_status"] | null
          type: string
          updated_at?: string | null
          updated_by?: string | null
          video_url?: string | null
        }
        Update: {
          account_id?: string
          attendees?: Json
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          decisions?: string | null
          id?: string
          notes?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["meeting_status"] | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "meeting_series"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_action_item: {
        Row: {
          account_id: string
          checklist_item_id: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          description: string
          due_at: string | null
          id: string
          meeting_id: string
          owner_is_seller: boolean
          owner_user_id: string | null
          schedule_week_id: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          checklist_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          description: string
          due_at?: string | null
          id?: string
          meeting_id: string
          owner_is_seller?: boolean
          owner_user_id?: string | null
          schedule_week_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          checklist_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          description?: string
          due_at?: string | null
          id?: string
          meeting_id?: string
          owner_is_seller?: boolean
          owner_user_id?: string | null
          schedule_week_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_item_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_schedule_week_id_fkey"
            columns: ["schedule_week_id"]
            isOneToOne: false
            referencedRelation: "schedule_week"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_series: {
        Row: {
          account_id: string
          attendees: Json
          created_at: string | null
          created_by: string | null
          deal_id: string
          duration_mins: number | null
          id: string
          status: string | null
          time_of_day: string | null
          timezone: string | null
          updated_at: string | null
          updated_by: string | null
          video_provider: string | null
          weekday: number | null
        }
        Insert: {
          account_id: string
          attendees?: Json
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          duration_mins?: number | null
          id?: string
          status?: string | null
          time_of_day?: string | null
          timezone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          video_provider?: string | null
          weekday?: number | null
        }
        Update: {
          account_id?: string
          attendees?: Json
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          duration_mins?: number | null
          id?: string
          status?: string | null
          time_of_day?: string | null
          timezone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          video_provider?: string | null
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_series_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hmac: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hmac: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hmac?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nonces: {
        Row: {
          account_id: string | null
          created_at: string
          expires_at: string
          id: string
          metadata: Json
          purpose: string
          scopes: string[]
          token_hash: string
          used_at: string | null
          user_id: string | null
          verification_attempts: number
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          metadata?: Json
          purpose: string
          scopes?: string[]
          token_hash: string
          used_at?: string | null
          user_id?: string | null
          verification_attempts?: number
        }
        Update: {
          account_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json
          purpose?: string
          scopes?: string[]
          token_hash?: string
          used_at?: string | null
          user_id?: string | null
          verification_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "nonces_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nonces_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nonces_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preference: {
        Row: {
          account_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string | null
          deal_id: string | null
          enabled: boolean
          event_type: string
          id: string
          recipient_user_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          deal_id?: string | null
          enabled?: boolean
          event_type: string
          id?: string
          recipient_user_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          deal_id?: string | null
          enabled?: boolean
          event_type?: string
          id?: string
          recipient_user_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preference_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preference_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preference_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preference_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          account_id: string
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dismissed: boolean
          expires_at: string | null
          id: number
          link: string | null
          recipient_user_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          account_id: string
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dismissed?: boolean
          expires_at?: string | null
          id?: never
          link?: string | null
          recipient_user_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          account_id?: string
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dismissed?: boolean
          expires_at?: string | null
          id?: never
          link?: string | null
          recipient_user_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_amount: number | null
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          order_id: string
          price_amount?: number | null
          product_id: string
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_amount?: number | null
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at?: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          billing_customer_id?: number
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          created_at?: string
          currency?: string
          id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stage: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_terminal: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_terminal?: boolean
          key: string
          label: string
          sort_order: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_terminal?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stage_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          id: number
          permission: Database["public"]["Enums"]["app_permissions"]
          role: string
        }
        Insert: {
          id?: number
          permission: Database["public"]["Enums"]["app_permissions"]
          role: string
        }
        Update: {
          id?: number
          permission?: Database["public"]["Enums"]["app_permissions"]
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      roles: {
        Row: {
          hierarchy_level: number
          name: string
        }
        Insert: {
          hierarchy_level: number
          name: string
        }
        Update: {
          hierarchy_level?: number
          name?: string
        }
        Relationships: []
      }
      schedule_week: {
        Row: {
          account_id: string
          created_at: string | null
          id: string
          schedule_id: string
          starts_on: string | null
          status: string | null
          theme: string | null
          updated_at: string | null
          week_no: number | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id?: string
          schedule_id: string
          starts_on?: string | null
          status?: string | null
          theme?: string | null
          updated_at?: string | null
          week_no?: number | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: string
          schedule_id?: string
          starts_on?: string | null
          status?: string | null
          theme?: string | null
          updated_at?: string | null
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_week_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_week_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_week_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_week_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "diligence_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      search_document: {
        Row: {
          account_id: string
          deal_id: string | null
          entity_id: string
          entity_type: string
          tsv: unknown
        }
        Insert: {
          account_id: string
          deal_id?: string | null
          entity_id: string
          entity_type: string
          tsv: unknown
        }
        Update: {
          account_id?: string
          deal_id?: string | null
          entity_id?: string
          entity_type?: string
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "search_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_document_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_document_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_question: {
        Row: {
          account_id: string
          answer: string | null
          answered_at: string | null
          asked_by: string | null
          created_at: string | null
          deal_id: string
          id: string
          question: string
          schedule_week_id: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          updated_at: string | null
        }
        Insert: {
          account_id: string
          answer?: string | null
          answered_at?: string | null
          asked_by?: string | null
          created_at?: string | null
          deal_id: string
          id?: string
          question: string
          schedule_week_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          answer?: string | null
          answered_at?: string | null
          asked_by?: string | null
          created_at?: string | null
          deal_id?: string
          id?: string
          question?: string
          schedule_week_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_question_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_schedule_week_id_fkey"
            columns: ["schedule_week_id"]
            isOneToOne: false
            referencedRelation: "schedule_week"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          created_at: string
          id: string
          interval: string
          interval_count: number
          price_amount: number | null
          product_id: string
          quantity: number
          subscription_id: string
          type: Database["public"]["Enums"]["subscription_item_type"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          interval: string
          interval_count: number
          price_amount?: number | null
          product_id: string
          quantity?: number
          subscription_id: string
          type: Database["public"]["Enums"]["subscription_item_type"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval?: string
          interval_count?: number
          price_amount?: number | null
          product_id?: string
          quantity?: number
          subscription_id?: string
          type?: Database["public"]["Enums"]["subscription_item_type"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at?: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          billing_customer_id?: number
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          id?: string
          period_ends_at?: string
          period_starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field: {
        Row: {
          format: string | null
          id: string
          key: string
          label: string | null
          required: boolean
          sort_order: number | null
          source: string | null
          source_path: string | null
          template_id: string
          type: string | null
        }
        Insert: {
          format?: string | null
          id?: string
          key: string
          label?: string | null
          required?: boolean
          sort_order?: number | null
          source?: string | null
          source_path?: string | null
          template_id: string
          type?: string | null
        }
        Update: {
          format?: string | null
          id?: string
          key?: string
          label?: string | null
          required?: boolean
          sort_order?: number | null
          source?: string | null
          source_path?: string | null
          template_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_field_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_template"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_batch: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          file_count: number
          id: string
          kind: Database["public"]["Enums"]["upload_batch_kind"]
          source_filename: string | null
          status: Database["public"]["Enums"]["upload_batch_status"]
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          file_count?: number
          id?: string
          kind: Database["public"]["Enums"]["upload_batch_kind"]
          source_filename?: string | null
          status?: Database["public"]["Enums"]["upload_batch_status"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          file_count?: number
          id?: string
          kind?: Database["public"]["Enums"]["upload_batch_kind"]
          source_filename?: string | null
          status?: Database["public"]["Enums"]["upload_batch_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_batch_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_batch_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_batch_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_batch_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_item: {
        Row: {
          batch_id: string
          content_type: string | null
          created_at: string | null
          dr_document_id: string | null
          error: string | null
          id: string
          original_path: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["upload_item_status"]
          storage_path: string
          target_folder_id: string | null
          updated_at: string | null
        }
        Insert: {
          batch_id: string
          content_type?: string | null
          created_at?: string | null
          dr_document_id?: string | null
          error?: string | null
          id?: string
          original_path: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["upload_item_status"]
          storage_path: string
          target_folder_id?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_id?: string
          content_type?: string | null
          created_at?: string | null
          dr_document_id?: string | null
          error?: string | null
          id?: string
          original_path?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["upload_item_status"]
          storage_path?: string
          target_folder_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_item_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "upload_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_item_dr_document_id_fkey"
            columns: ["dr_document_id"]
            isOneToOne: false
            referencedRelation: "dr_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_item_target_folder_id_fkey"
            columns: ["target_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook: {
        Row: {
          account_id: string
          config_json: Json
          created_at: string | null
          created_by: string | null
          id: string
          next_run_at: string | null
          status: string | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          config_json?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          next_run_at?: string | null
          status?: string | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          config_json?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          next_run_at?: string | null
          status?: string | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workbook_template"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run: {
        Row: {
          account_id: string
          created_at: string
          exceptions: Json | null
          finished_at: string | null
          id: string
          items_done: number | null
          items_total: number | null
          started_at: string
          status: string | null
          workbook_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          exceptions?: Json | null
          finished_at?: string | null
          id?: string
          items_done?: number | null
          items_total?: number | null
          started_at?: string
          status?: string | null
          workbook_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          exceptions?: Json | null
          finished_at?: string | null
          id?: string
          items_done?: number | null
          items_total?: number | null
          started_at?: string
          status?: string | null
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "workbook"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_template: {
        Row: {
          account_id: string | null
          config_schema: Json
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          scope: string
          updated_at: string | null
          workflow_type: string
        }
        Insert: {
          account_id?: string | null
          config_schema?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          scope: string
          updated_at?: string | null
          workflow_type: string
        }
        Update: {
          account_id?: string | null
          config_schema?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          scope?: string
          updated_at?: string | null
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_account_workspace: {
        Row: {
          id: string | null
          name: string | null
          picture_url: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
        }
        Relationships: []
      }
      user_accounts: {
        Row: {
          id: string | null
          name: string | null
          picture_url: string | null
          role: string | null
          slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_memberships_account_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { token: string; user_id: string }
        Returns: string
      }
      add_invitations_to_account: {
        Args: {
          account_slug: string
          invited_by: string
          invites: Database["public"]["CompositeTypes"]["invitation"][]
        }
        Returns: {
          account_id: string
          created_at: string
          email: string
          expires_at: string
          id: number
          invite_token: string
          invited_by: string
          role: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      analytics_broker_deal_flow_by_quarter: {
        Args: { p_account_id: string; p_include_revenue?: boolean }
        Returns: {
          broker_contact_id: string
          deal_count: number
          quarter: string
          total_revenue: number
        }[]
      }
      analytics_checklist_status_by_deal: {
        Args: { p_account_id: string }
        Returns: {
          deal_id: string
          item_count: number
          status: Database["public"]["Enums"]["checklist_status"]
        }[]
      }
      analytics_contract_turns_per_deal: {
        Args: { p_account_id: string }
        Returns: {
          deal_id: string
          turns: number
        }[]
      }
      analytics_deals_added_lost_by_month: {
        Args: { p_account_id: string }
        Returns: {
          added: number
          lost: number
          month: string
        }[]
      }
      analytics_median_days_in_stage: {
        Args: { p_account_id: string }
        Returns: {
          median_days: number
          stage: string
        }[]
      }
      analytics_meetings_held_vs_skipped: {
        Args: { p_account_id: string }
        Returns: {
          held: number
          skipped: number
        }[]
      }
      analytics_open_action_items_by_owner: {
        Args: { p_account_id: string }
        Returns: {
          open_count: number
          owner_is_seller: boolean
          owner_user_id: string
        }[]
      }
      analytics_pipeline_by_stage: {
        Args: { p_account_id: string; p_include_revenue?: boolean }
        Returns: {
          deal_count: number
          label: string
          stage: string
          total_revenue: number
        }[]
      }
      analytics_requested_to_received_median: {
        Args: { p_account_id: string }
        Returns: number
      }
      can_action_account_member: {
        Args: { target_team_account_id: string; target_user_id: string }
        Returns: boolean
      }
      consume_mfa_recovery_code: { Args: { p_code: string }; Returns: string }
      create_nonce: {
        Args: {
          account_id?: string
          expires_in_seconds?: number
          metadata?: Json
          purpose: string
          scopes?: string[]
          user_id?: string
        }
        Returns: string
      }
      create_team_account: {
        Args: { account_name: string; account_slug?: string; user_id: string }
        Returns: {
          ai_redaction_enabled: boolean
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          public_data: Json
          slug: string | null
          trial_ends_at: string | null
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_buyer_profile: {
        Args: { account_id: string }
        Returns: {
          about: string | null
          account_id: string
          contact_json: Json | null
          created_at: string | null
          created_by: string | null
          display_name: string | null
          experience: string | null
          expertise_json: Json | null
          financing_json: Json | null
          headline: string | null
          id: string
          include_sensitive: boolean
          interested_json: Json | null
          motivation: string | null
          not_interested_json: Json | null
          photo_path: string | null
          sensitive_json: Json | null
          target_statement: string | null
          updated_at: string | null
          updated_by: string | null
          value_proposition: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "buyer_profile"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_config: { Args: never; Returns: Json }
      get_upper_system_role: { Args: never; Returns: string }
      has_active_subscription: {
        Args: { target_account_id: string }
        Returns: boolean
      }
      has_deal_permission: {
        Args: { deal_id: string; permission: string }
        Returns: boolean
      }
      has_more_elevated_role: {
        Args: {
          role_name: string
          target_account_id: string
          target_user_id: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: {
          account_id: string
          permission_name: Database["public"]["Enums"]["app_permissions"]
          user_id: string
        }
        Returns: boolean
      }
      has_role_on_account: {
        Args: { account_id: string; account_role?: string }
        Returns: boolean
      }
      has_super_admin_role: { Args: never; Returns: boolean }
      is_aal2: { Args: never; Returns: boolean }
      is_account_owner: { Args: { account_id: string }; Returns: boolean }
      is_mfa_compliant: { Args: never; Returns: boolean }
      is_set: { Args: { field_name: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_team_member: {
        Args: { account_id: string; user_id: string }
        Returns: boolean
      }
      is_trial_active: { Args: { p_account_id: string }; Returns: boolean }
      mfa_recovery_codes_status: {
        Args: never
        Returns: {
          last_generated_at: string
          total: number
          unused: number
        }[]
      }
      replace_mfa_recovery_codes: {
        Args: { p_codes: string[] }
        Returns: undefined
      }
      search_documents: {
        Args: { p_account_id: string; p_query: string }
        Returns: {
          deal_id: string
          entity_id: string
          entity_type: string
          rank: number
        }[]
      }
      seed_default_pipeline_stages: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      super_admin_state: {
        Args: never
        Returns: {
          has_role: boolean
          is_super_admin: boolean
        }[]
      }
      team_account_workspace: {
        Args: { account_slug: string }
        Returns: {
          id: string
          name: string
          permissions: Database["public"]["Enums"]["app_permissions"][]
          picture_url: string
          primary_owner_user_id: string
          role: string
          role_hierarchy_level: number
          slug: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
        }[]
      }
      transfer_team_account_ownership: {
        Args: { new_owner_id: string; target_account_id: string }
        Returns: undefined
      }
      upsert_order: {
        Args: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          currency: string
          line_items: Json
          status: Database["public"]["Enums"]["payment_status"]
          target_account_id: string
          target_customer_id: string
          target_order_id: string
          total_amount: number
        }
        Returns: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_subscription: {
        Args: {
          active: boolean
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          currency: string
          line_items: Json
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          target_account_id: string
          target_customer_id: string
          target_subscription_id: string
          trial_ends_at?: string
          trial_starts_at?: string
        }
        Returns: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_has_verified_mfa: { Args: never; Returns: boolean }
      verify_api_key: { Args: { prefix: string; raw: string }; Returns: string }
      verify_nonce: {
        Args: {
          max_verification_attempts?: number
          purpose: string
          required_scopes?: string[]
          token: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_permissions:
        | "roles.manage"
        | "billing.manage"
        | "settings.manage"
        | "members.manage"
        | "invites.manage"
        | "deals.create"
        | "deals.manage"
        | "checklists.manage"
        | "participants.manage"
        | "buyer_profile.manage"
      approval_decision: "approved" | "declined"
      approval_subject:
        | "stage_move"
        | "loi"
        | "apa"
        | "schedule"
        | "participant_change"
      billing_provider: "stripe" | "lemon-squeezy" | "paddle"
      broker_intake_status: "new" | "accepted" | "rejected"
      checklist_outcome: "accepted" | "follow_up" | "rejected"
      checklist_status: "not_started" | "requested" | "received" | "reviewed"
      deal_source: "manual" | "broker" | "outreach" | "marketplace" | "referral"
      embedding_job_status: "queued" | "running" | "done" | "failed"
      meeting_status: "scheduled" | "held" | "skipped" | "cancelled"
      notification_channel: "in_app" | "email"
      notification_type: "info" | "warning" | "error"
      participant_party: "buyer" | "seller" | "broker" | "lender"
      participant_permission: "view" | "comment" | "suggest" | "edit" | "sign"
      participant_scope: "deal" | "contract" | "data_room_folder" | "checklist"
      payment_status: "pending" | "succeeded" | "failed"
      subscription_item_type: "flat" | "per_seat" | "metered"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
      upload_batch_kind: "single" | "group" | "zip"
      upload_batch_status:
        | "pending"
        | "extracting"
        | "ready"
        | "imported"
        | "failed"
      upload_item_status: "pending" | "imported" | "failed"
    }
    CompositeTypes: {
      invitation: {
        email: string | null
        role: string | null
      }
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
      app_permissions: [
        "roles.manage",
        "billing.manage",
        "settings.manage",
        "members.manage",
        "invites.manage",
        "deals.create",
        "deals.manage",
        "checklists.manage",
        "participants.manage",
        "buyer_profile.manage",
      ],
      approval_decision: ["approved", "declined"],
      approval_subject: [
        "stage_move",
        "loi",
        "apa",
        "schedule",
        "participant_change",
      ],
      billing_provider: ["stripe", "lemon-squeezy", "paddle"],
      broker_intake_status: ["new", "accepted", "rejected"],
      checklist_outcome: ["accepted", "follow_up", "rejected"],
      checklist_status: ["not_started", "requested", "received", "reviewed"],
      deal_source: ["manual", "broker", "outreach", "marketplace", "referral"],
      embedding_job_status: ["queued", "running", "done", "failed"],
      meeting_status: ["scheduled", "held", "skipped", "cancelled"],
      notification_channel: ["in_app", "email"],
      notification_type: ["info", "warning", "error"],
      participant_party: ["buyer", "seller", "broker", "lender"],
      participant_permission: ["view", "comment", "suggest", "edit", "sign"],
      participant_scope: ["deal", "contract", "data_room_folder", "checklist"],
      payment_status: ["pending", "succeeded", "failed"],
      subscription_item_type: ["flat", "per_seat", "metered"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ],
      upload_batch_kind: ["single", "group", "zip"],
      upload_batch_status: [
        "pending",
        "extracting",
        "ready",
        "imported",
        "failed",
      ],
      upload_item_status: ["pending", "imported", "failed"],
    },
  },
} as const

