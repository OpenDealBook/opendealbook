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
      account_event: {
        Row: {
          account_id: string
          created_at: string
          event_type: string
          global_seq: number
          id: string
          payload: Json
          xid: unknown
        }
        Insert: {
          account_id: string
          created_at?: string
          event_type: string
          global_seq?: never
          id?: string
          payload?: Json
          xid?: unknown
        }
        Update: {
          account_id?: string
          created_at?: string
          event_type?: string
          global_seq?: never
          id?: string
          payload?: Json
          xid?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "account_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_slug_history: {
        Row: {
          account_id: string
          slug: string
        }
        Insert: {
          account_id: string
          slug: string
        }
        Update: {
          account_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_slug_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_slug_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_slug_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          ai_redaction_enabled: boolean
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          last_team_account_id: string | null
          legal_entity_name: string | null
          name: string
          onboarded: boolean
          phone: string | null
          phone_asked_at: string | null
          picture_url: string | null
          primary_owner_user_id: string
          public_data: Json
          renamed_at: string | null
          sample_deals_seeded_at: string | null
          slug: string | null
          team_phone: string | null
          timezone: string | null
          trial_drip_started_at: string | null
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
          last_team_account_id?: string | null
          legal_entity_name?: string | null
          name: string
          onboarded?: boolean
          phone?: string | null
          phone_asked_at?: string | null
          picture_url?: string | null
          primary_owner_user_id?: string
          public_data?: Json
          renamed_at?: string | null
          sample_deals_seeded_at?: string | null
          slug?: string | null
          team_phone?: string | null
          timezone?: string | null
          trial_drip_started_at?: string | null
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
          last_team_account_id?: string | null
          legal_entity_name?: string | null
          name?: string
          onboarded?: boolean
          phone?: string | null
          phone_asked_at?: string | null
          picture_url?: string | null
          primary_owner_user_id?: string
          public_data?: Json
          renamed_at?: string | null
          sample_deals_seeded_at?: string | null
          slug?: string | null
          team_phone?: string | null
          timezone?: string | null
          trial_drip_started_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_last_team_account_id_fkey"
            columns: ["last_team_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_last_team_account_id_fkey"
            columns: ["last_team_account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_last_team_account_id_fkey"
            columns: ["last_team_account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
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
      activity_pool: {
        Row: {
          asking_price_banded: number | null
          confidence: Database["public"]["Enums"]["activity_confidence"] | null
          created_at: string
          created_quarter: string | null
          furthest_stage: string | null
          id: string
          industry_short: string | null
          loi_price_banded: number | null
          loss_reason: string | null
          naics3: string | null
          outcome: string | null
          outcome_reason: string | null
          pseudonym: string
          region: string | null
        }
        Insert: {
          asking_price_banded?: number | null
          confidence?: Database["public"]["Enums"]["activity_confidence"] | null
          created_at?: string
          created_quarter?: string | null
          furthest_stage?: string | null
          id?: string
          industry_short?: string | null
          loi_price_banded?: number | null
          loss_reason?: string | null
          naics3?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          pseudonym: string
          region?: string | null
        }
        Update: {
          asking_price_banded?: number | null
          confidence?: Database["public"]["Enums"]["activity_confidence"] | null
          created_at?: string
          created_quarter?: string | null
          furthest_stage?: string | null
          id?: string
          industry_short?: string | null
          loi_price_banded?: number | null
          loss_reason?: string | null
          naics3?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          pseudonym?: string
          region?: string | null
        }
        Relationships: []
      }
      activity_pool_key: {
        Row: {
          account_id: string | null
          created_at: string
          deal_id: string | null
          fingerprint: string
          id: string
          pseudonym: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          deal_id?: string | null
          fingerprint: string
          id?: string
          pseudonym: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          deal_id?: string | null
          fingerprint?: string
          id?: string
          pseudonym?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_pool_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_pool_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_pool_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_pool_key_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_action_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      agent: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          owner_user_id: string
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
          owner_user_id: string
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
          owner_user_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "agent_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
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
          firm_id: string | null
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
          firm_id?: string | null
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
          firm_id?: string | null
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
          {
            foreignKeyName: "ai_call_log_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
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
      attachment: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          owner_id: string
          owner_kind: string | null
          storage_path: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id: string
          owner_kind?: string | null
          storage_path: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string
          owner_kind?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark: {
        Row: {
          as_of: string | null
          created_at: string | null
          high: number | null
          id: string
          industry: string | null
          low: number | null
          median: number | null
          metric: string
          naics_code: string | null
          source_citation: string | null
          updated_at: string | null
        }
        Insert: {
          as_of?: string | null
          created_at?: string | null
          high?: number | null
          id?: string
          industry?: string | null
          low?: number | null
          median?: number | null
          metric: string
          naics_code?: string | null
          source_citation?: string | null
          updated_at?: string | null
        }
        Update: {
          as_of?: string | null
          created_at?: string | null
          high?: number | null
          id?: string
          industry?: string | null
          low?: number | null
          median?: number | null
          metric?: string
          naics_code?: string | null
          source_citation?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      business_match_review: {
        Row: {
          account_id: string
          business_id: string
          created_at: string
          form_5500_ack_id: string | null
          id: string
          ppp_loan_number: string | null
          registry_entity_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sba_loan_id: string | null
          score: number
          status: Database["public"]["Enums"]["match_review_status"]
        }
        Insert: {
          account_id: string
          business_id: string
          created_at?: string
          form_5500_ack_id?: string | null
          id?: string
          ppp_loan_number?: string | null
          registry_entity_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sba_loan_id?: string | null
          score: number
          status?: Database["public"]["Enums"]["match_review_status"]
        }
        Update: {
          account_id?: string
          business_id?: string
          created_at?: string
          form_5500_ack_id?: string | null
          id?: string
          ppp_loan_number?: string | null
          registry_entity_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sba_loan_id?: string | null
          score?: number
          status?: Database["public"]["Enums"]["match_review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "business_match_review_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_match_review_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_match_review_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_match_review_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_match_review_form_5500_ack_id_fkey"
            columns: ["form_5500_ack_id"]
            isOneToOne: false
            referencedRelation: "form_5500_filing"
            referencedColumns: ["ack_id"]
          },
          {
            foreignKeyName: "business_match_review_ppp_loan_number_fkey"
            columns: ["ppp_loan_number"]
            isOneToOne: false
            referencedRelation: "ppp_loan"
            referencedColumns: ["loan_number"]
          },
          {
            foreignKeyName: "business_match_review_registry_entity_id_fkey"
            columns: ["registry_entity_id"]
            isOneToOne: false
            referencedRelation: "state_registry_entity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_match_review_sba_loan_id_fkey"
            columns: ["sba_loan_id"]
            isOneToOne: false
            referencedRelation: "sba_loan"
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
      calc_input_citation: {
        Row: {
          account_id: string
          calc_version_id: string
          cell: string | null
          created_at: string
          created_by: string | null
          document_name: string
          document_version: number
          dr_document_id: string
          id: string
          input_key: string
          page: number | null
          row_id: string | null
          sheet: string | null
        }
        Insert: {
          account_id: string
          calc_version_id: string
          cell?: string | null
          created_at?: string
          created_by?: string | null
          document_name: string
          document_version: number
          dr_document_id: string
          id?: string
          input_key: string
          page?: number | null
          row_id?: string | null
          sheet?: string | null
        }
        Update: {
          account_id?: string
          calc_version_id?: string
          cell?: string | null
          created_at?: string
          created_by?: string | null
          document_name?: string
          document_version?: number
          dr_document_id?: string
          id?: string
          input_key?: string
          page?: number | null
          row_id?: string | null
          sheet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calc_input_citation_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_input_citation_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_input_citation_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_input_citation_calc_version_id_fkey"
            columns: ["calc_version_id"]
            isOneToOne: false
            referencedRelation: "calc_version"
            referencedColumns: ["id"]
          },
        ]
      }
      calc_version: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          is_primary: boolean
          name: string | null
          notes: string | null
          outputs_snapshot: Json
          type: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          is_primary?: boolean
          name?: string | null
          notes?: string | null
          outputs_snapshot?: Json
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          is_primary?: boolean
          name?: string | null
          notes?: string | null
          outputs_snapshot?: Json
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calc_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calc_version_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connection: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          nango_connection_id: string
          provider: string
          provider_config_key: string
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          nango_connection_id: string
          provider: string
          provider_config_key: string
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          nango_connection_id?: string
          provider?: string
          provider_config_key?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_connection_account_id_fkey"
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
          answer: string | null
          artifact_id: string | null
          artifact_type: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          deal_killer: boolean
          due_at: string | null
          due_offset_days: number | null
          due_set_manually: boolean
          id: string
          importance: string | null
          kind: string | null
          linked_document_id: string | null
          offer_term_key: string | null
          outcome: Database["public"]["Enums"]["checklist_outcome"] | null
          owner_role: string | null
          owner_user_id: string | null
          priority: number
          received_at: string | null
          removed_at: string | null
          requested_at: string | null
          review_due_at: string | null
          review_offset_days: number
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_week_id: string | null
          source_template_id: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at: string | null
          updated_by: string | null
          waiting_on: string | null
        }
        Insert: {
          account_id: string
          answer?: string | null
          artifact_id?: string | null
          artifact_type?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          deal_killer?: boolean
          due_at?: string | null
          due_offset_days?: number | null
          due_set_manually?: boolean
          id?: string
          importance?: string | null
          kind?: string | null
          linked_document_id?: string | null
          offer_term_key?: string | null
          outcome?: Database["public"]["Enums"]["checklist_outcome"] | null
          owner_role?: string | null
          owner_user_id?: string | null
          priority?: number
          received_at?: string | null
          removed_at?: string | null
          requested_at?: string | null
          review_due_at?: string | null
          review_offset_days?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_week_id?: string | null
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at?: string | null
          updated_by?: string | null
          waiting_on?: string | null
        }
        Update: {
          account_id?: string
          answer?: string | null
          artifact_id?: string | null
          artifact_type?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          deal_killer?: boolean
          due_at?: string | null
          due_offset_days?: number | null
          due_set_manually?: boolean
          id?: string
          importance?: string | null
          kind?: string | null
          linked_document_id?: string | null
          offer_term_key?: string | null
          outcome?: Database["public"]["Enums"]["checklist_outcome"] | null
          owner_role?: string | null
          owner_user_id?: string | null
          priority?: number
          received_at?: string | null
          removed_at?: string | null
          requested_at?: string | null
          review_due_at?: string | null
          review_offset_days?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_week_id?: string | null
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          waiting_on?: string | null
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
          {
            foreignKeyName: "checklist_item_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_template"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item_note: {
        Row: {
          author_user_id: string | null
          body: string
          checklist_item_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          checklist_item_id: string
          created_at: string
          id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          checklist_item_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_note_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_item"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item_seller_question: {
        Row: {
          checklist_item_id: string
          question_id: string
        }
        Insert: {
          checklist_item_id: string
          question_id: string
        }
        Update: {
          checklist_item_id?: string
          question_id?: string
        }
        Relationships: []
      }
      checklist_template: {
        Row: {
          account_id: string
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean
          kind: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: string | null
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
          importance: string | null
          offer_term_key: string | null
          owner_role: string | null
          priority: number
          review_offset_days: number
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          category?: string | null
          deal_killer?: boolean
          due_offset_days?: number | null
          id?: string
          importance?: string | null
          offer_term_key?: string | null
          owner_role?: string | null
          priority?: number
          review_offset_days?: number
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          category?: string | null
          deal_killer?: boolean
          due_offset_days?: number | null
          id?: string
          importance?: string | null
          offer_term_key?: string | null
          owner_role?: string | null
          priority?: number
          review_offset_days?: number
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
      comp: {
        Row: {
          account_id: string | null
          asking_price: number | null
          close_date: string | null
          confidence: string | null
          created_at: string | null
          created_by: string | null
          data_class: Database["public"]["Enums"]["comp_data_class"]
          deal_id: string | null
          ebitda: number | null
          id: string
          industry: string | null
          multiple_ebitda: number | null
          multiple_revenue: number | null
          multiple_sde: number | null
          naics_code: string | null
          price_basis: string | null
          region: string | null
          revenue: number | null
          sale_price: number | null
          sde: number | null
          source: string
          source_label: string | null
          source_ref: string | null
          state: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          asking_price?: number | null
          close_date?: string | null
          confidence?: string | null
          created_at?: string | null
          created_by?: string | null
          data_class: Database["public"]["Enums"]["comp_data_class"]
          deal_id?: string | null
          ebitda?: number | null
          id?: string
          industry?: string | null
          multiple_ebitda?: number | null
          multiple_revenue?: number | null
          multiple_sde?: number | null
          naics_code?: string | null
          price_basis?: string | null
          region?: string | null
          revenue?: number | null
          sale_price?: number | null
          sde?: number | null
          source: string
          source_label?: string | null
          source_ref?: string | null
          state?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          asking_price?: number | null
          close_date?: string | null
          confidence?: string | null
          created_at?: string | null
          created_by?: string | null
          data_class?: Database["public"]["Enums"]["comp_data_class"]
          deal_id?: string | null
          ebitda?: number | null
          id?: string
          industry?: string | null
          multiple_ebitda?: number | null
          multiple_revenue?: number | null
          multiple_sde?: number | null
          naics_code?: string | null
          price_basis?: string | null
          region?: string | null
          revenue?: number | null
          sale_price?: number | null
          sde?: number | null
          source?: string
          source_label?: string | null
          source_ref?: string | null
          state?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_import: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          filename: string | null
          id: string
          imported_at: string | null
          license_id: string | null
          row_count: number | null
          status: string
          storage_path: string | null
          updated_at: string | null
          updated_by: string | null
          vendor: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          filename?: string | null
          id?: string
          imported_at?: string | null
          license_id?: string | null
          row_count?: number | null
          status?: string
          storage_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          filename?: string | null
          id?: string
          imported_at?: string | null
          license_id?: string | null
          row_count?: number | null
          status?: string
          storage_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_import_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_import_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_import_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_import_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "comp_license"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_license: {
        Row: {
          account_id: string
          contributor_member: boolean
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          seats: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["comp_license_status"]
          storage_path: string | null
          updated_at: string | null
          updated_by: string | null
          vendor: string
        }
        Insert: {
          account_id: string
          contributor_member?: boolean
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          seats?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["comp_license_status"]
          storage_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor: string
        }
        Update: {
          account_id?: string
          contributor_member?: boolean
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          seats?: number | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["comp_license_status"]
          storage_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_license_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_license_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_license_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_pool: {
        Row: {
          close_quarter: string | null
          created_at: string
          id: string
          industry_short: string | null
          naics3: string | null
          outcome: string | null
          pseudonym: string
          region: string | null
          revenue_banded: number | null
          sale_price_banded: number | null
          sde_banded: number | null
          sde_multiple: number | null
        }
        Insert: {
          close_quarter?: string | null
          created_at?: string
          id?: string
          industry_short?: string | null
          naics3?: string | null
          outcome?: string | null
          pseudonym: string
          region?: string | null
          revenue_banded?: number | null
          sale_price_banded?: number | null
          sde_banded?: number | null
          sde_multiple?: number | null
        }
        Update: {
          close_quarter?: string | null
          created_at?: string
          id?: string
          industry_short?: string | null
          naics3?: string | null
          outcome?: string | null
          pseudonym?: string
          region?: string | null
          revenue_banded?: number | null
          sale_price_banded?: number | null
          sde_banded?: number | null
          sde_multiple?: number | null
        }
        Relationships: []
      }
      comp_pool_key: {
        Row: {
          account_id: string | null
          created_at: string
          deal_id: string | null
          fingerprint: string
          id: string
          pseudonym: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          deal_id?: string | null
          fingerprint: string
          id?: string
          pseudonym: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          deal_id?: string | null
          fingerprint?: string
          id?: string
          pseudonym?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_pool_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_pool_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_pool_key_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_pool_key_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_pool_optin: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          id: string
          opted_in: boolean
          opted_in_at: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          opted_in?: boolean
          opted_in_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          opted_in?: boolean
          opted_in_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_pool_optin_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_pool_optin_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_pool_optin_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_search_recipe: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          criteria: Json
          id: string
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          criteria?: Json
          id?: string
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          criteria?: Json
          id?: string
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_search_recipe_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_search_recipe_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_search_recipe_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_set: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_set_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_set_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_set_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_set_member: {
        Row: {
          comp_id: string
          comp_set_id: string
          created_at: string | null
          created_by: string | null
          id: string
        }
        Insert: {
          comp_id: string
          comp_set_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
        }
        Update: {
          comp_id?: string
          comp_set_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_set_member_comp_id_fkey"
            columns: ["comp_id"]
            isOneToOne: false
            referencedRelation: "comp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_set_member_comp_id_fkey"
            columns: ["comp_id"]
            isOneToOne: false
            referencedRelation: "comp_external"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_set_member_comp_set_id_fkey"
            columns: ["comp_set_id"]
            isOneToOne: false
            referencedRelation: "comp_set"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          comp_pool_min_bucket: number
          enable_account_billing: boolean
          enable_team_account_billing: boolean
          enable_team_accounts: boolean
          team_rename_limit: Database["public"]["Enums"]["team_rename_limit"]
        }
        Insert: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          comp_pool_min_bucket?: number
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
          team_rename_limit?: Database["public"]["Enums"]["team_rename_limit"]
        }
        Update: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          comp_pool_min_bucket?: number
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
          team_rename_limit?: Database["public"]["Enums"]["team_rename_limit"]
        }
        Relationships: []
      }
      contact: {
        Row: {
          account_id: string
          company: string | null
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
          company?: string | null
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
          company?: string | null
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
          source_offer_version_id: string | null
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
          source_offer_version_id?: string | null
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
          source_offer_version_id?: string | null
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
      contract_comment: {
        Row: {
          account_id: string
          author_side: Database["public"]["Enums"]["counsel_side"]
          author_user_id: string | null
          body: string
          contract_version_id: string
          created_at: string
          id: string
          internal: boolean
          parent_id: string | null
          quoted_text: string | null
          resolved_at: string | null
        }
        Insert: {
          account_id: string
          author_side: Database["public"]["Enums"]["counsel_side"]
          author_user_id?: string | null
          body: string
          contract_version_id: string
          created_at?: string
          id?: string
          internal?: boolean
          parent_id?: string | null
          quoted_text?: string | null
          resolved_at?: string | null
        }
        Update: {
          account_id?: string
          author_side?: Database["public"]["Enums"]["counsel_side"]
          author_user_id?: string | null
          body?: string
          contract_version_id?: string
          created_at?: string
          id?: string
          internal?: boolean
          parent_id?: string | null
          quoted_text?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_comment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_comment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_comment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_comment_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_comment_parent_id_contract_version_id_fkey"
            columns: ["parent_id", "contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_comment"
            referencedColumns: ["id", "contract_version_id"]
          },
        ]
      }
      contract_review_decision: {
        Row: {
          account_id: string
          contract_version_id: string
          decided_at: string
          decided_by: string
          decision: Database["public"]["Enums"]["contract_review_verdict"]
          id: string
          note: string | null
          side: Database["public"]["Enums"]["counsel_side"]
          without_counsel: boolean
        }
        Insert: {
          account_id: string
          contract_version_id: string
          decided_at?: string
          decided_by: string
          decision: Database["public"]["Enums"]["contract_review_verdict"]
          id?: string
          note?: string | null
          side: Database["public"]["Enums"]["counsel_side"]
          without_counsel: boolean
        }
        Update: {
          account_id?: string
          contract_version_id?: string
          decided_at?: string
          decided_by?: string
          decision?: Database["public"]["Enums"]["contract_review_verdict"]
          id?: string
          note?: string | null
          side?: Database["public"]["Enums"]["counsel_side"]
          without_counsel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_decision_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_decision_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_decision_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_decision_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_version"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_review_gate_default_change: {
        Row: {
          account_id: string
          changed_at: string
          changed_by: string
          contract_type: string
          id: string
          required: boolean
          was_required: boolean
        }
        Insert: {
          account_id: string
          changed_at?: string
          changed_by?: string
          contract_type: string
          id?: string
          required: boolean
          was_required?: boolean
        }
        Update: {
          account_id?: string
          changed_at?: string
          changed_by?: string
          contract_type?: string
          id?: string
          required?: boolean
          was_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_gate_default_change_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_gate_default_change_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_gate_default_change_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_review_request: {
        Row: {
          account_id: string
          contract_version_id: string
          id: string
          requested_at: string
          requested_by: string
        }
        Insert: {
          account_id: string
          contract_version_id: string
          id?: string
          requested_at?: string
          requested_by?: string
        }
        Update: {
          account_id?: string
          contract_version_id?: string
          id?: string
          requested_at?: string
          requested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_request_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_request_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_request_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_request_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_version"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_review_todo: {
        Row: {
          contract_version_id: string
          created_at: string
          request_id: string
          side: Database["public"]["Enums"]["counsel_side"]
          stage: string
          todo_id: string | null
          user_id: string
        }
        Insert: {
          contract_version_id: string
          created_at?: string
          request_id: string
          side: Database["public"]["Enums"]["counsel_side"]
          stage: string
          todo_id?: string | null
          user_id: string
        }
        Update: {
          contract_version_id?: string
          created_at?: string
          request_id?: string
          side?: Database["public"]["Enums"]["counsel_side"]
          stage?: string
          todo_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_todo_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_todo_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contract_review_request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_todo_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "personal_todo"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signing_override: {
        Row: {
          account_id: string
          contract_version_id: string
          id: string
          overridden_at: string
          overridden_by: string
          reason: string
        }
        Insert: {
          account_id: string
          contract_version_id: string
          id?: string
          overridden_at?: string
          overridden_by?: string
          reason: string
        }
        Update: {
          account_id?: string
          contract_version_id?: string
          id?: string
          overridden_at?: string
          overridden_by?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signing_override_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signing_override_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signing_override_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signing_override_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_version"
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
          docx_bucket: string | null
          docx_path: string | null
          id: string
          is_signed: boolean
          party: string
          pdf_bucket: string | null
          pdf_path: string | null
          seller_number: number | null
          shared_at: string | null
          signing_document_id: string | null
          signing_status: string | null
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
          docx_bucket?: string | null
          docx_path?: string | null
          id?: string
          is_signed?: boolean
          party: string
          pdf_bucket?: string | null
          pdf_path?: string | null
          seller_number?: number | null
          shared_at?: string | null
          signing_document_id?: string | null
          signing_status?: string | null
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
          docx_bucket?: string | null
          docx_path?: string | null
          id?: string
          is_signed?: boolean
          party?: string
          pdf_bucket?: string | null
          pdf_path?: string | null
          seller_number?: number | null
          shared_at?: string | null
          signing_document_id?: string | null
          signing_status?: string | null
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
      counsel_activity: {
        Row: {
          account_id: string
          action: Database["public"]["Enums"]["counsel_activity_action"]
          created_at: string
          deal_id: string
          dr_document_id: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          action: Database["public"]["Enums"]["counsel_activity_action"]
          created_at?: string
          deal_id: string
          dr_document_id: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          action?: Database["public"]["Enums"]["counsel_activity_action"]
          created_at?: string
          deal_id?: string
          dr_document_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counsel_activity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_activity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_activity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      counsel_message: {
        Row: {
          account_id: string
          author_user_id: string | null
          body: string
          created_at: string
          deal_id: string
          id: string
          side: Database["public"]["Enums"]["counsel_side"]
        }
        Insert: {
          account_id: string
          author_user_id?: string | null
          body: string
          created_at?: string
          deal_id: string
          id?: string
          side: Database["public"]["Enums"]["counsel_side"]
        }
        Update: {
          account_id?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          deal_id?: string
          id?: string
          side?: Database["public"]["Enums"]["counsel_side"]
        }
        Relationships: [
          {
            foreignKeyName: "counsel_message_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_message_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_message_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_message_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      counsel_upload: {
        Row: {
          created_at: string
          deal_id: string
          document_ids: string[] | null
          folder_id: string
          id: string
          keep_as_zip: boolean | null
          name: string
          registered_at: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          document_ids?: string[] | null
          folder_id: string
          id?: string
          keep_as_zip?: boolean | null
          name: string
          registered_at?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          document_ids?: string[] | null
          folder_id?: string
          id?: string
          keep_as_zip?: boolean | null
          name?: string
          registered_at?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "counsel_upload_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_upload_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      counsel_uploads_folder: {
        Row: {
          account_id: string
          deal_id: string
          folder_id: string
        }
        Insert: {
          account_id: string
          deal_id: string
          folder_id: string
        }
        Update: {
          account_id?: string
          deal_id?: string
          folder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counsel_uploads_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_uploads_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_uploads_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_uploads_folder_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counsel_uploads_folder_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      counsel_visit: {
        Row: {
          area: string
          deal_id: string
          user_id: string
          visited_at: string
        }
        Insert: {
          area: string
          deal_id: string
          user_id?: string
          visited_at?: string
        }
        Update: {
          area?: string
          deal_id?: string
          user_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counsel_visit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
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
          archived_at: string | null
          asking_price: number | null
          broker_contact_id: string | null
          capture_method: string | null
          code_name: string | null
          created_at: string | null
          created_by: string | null
          created_by_kind: string | null
          created_by_ref: string | null
          created_by_via: string | null
          deal_box_version: number | null
          description: string | null
          discovered_at: string | null
          duplicate_of: string | null
          earnings_basis: string
          ebitda_ttm: number | null
          firm_id: string | null
          id: string
          listing_status: string
          notes: string | null
          open_to_partnership: boolean
          outcome_reason: string | null
          owner_user_id: string | null
          resolution: string | null
          resolution_reason: string | null
          revenue_ttm: number | null
          sde_ttm: number | null
          search_tsv: unknown
          source: Database["public"]["Enums"]["deal_source"]
          source_url: string | null
          stage: string
          stage_changed_at: string | null
          updated_at: string | null
          updated_by: string | null
          close_date: string | null
        }
        Insert: {
          account_id: string
          archived_at?: string | null
          asking_price?: number | null
          broker_contact_id?: string | null
          capture_method?: string | null
          code_name?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_kind?: string | null
          created_by_ref?: string | null
          created_by_via?: string | null
          deal_box_version?: number | null
          description?: string | null
          discovered_at?: string | null
          duplicate_of?: string | null
          earnings_basis?: string
          ebitda_ttm?: number | null
          firm_id?: string | null
          id?: string
          listing_status?: string
          notes?: string | null
          open_to_partnership?: boolean
          outcome_reason?: string | null
          owner_user_id?: string | null
          resolution?: string | null
          resolution_reason?: string | null
          revenue_ttm?: number | null
          sde_ttm?: number | null
          search_tsv?: unknown
          source?: Database["public"]["Enums"]["deal_source"]
          source_url?: string | null
          stage?: string
          stage_changed_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          archived_at?: string | null
          asking_price?: number | null
          broker_contact_id?: string | null
          capture_method?: string | null
          code_name?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_kind?: string | null
          created_by_ref?: string | null
          created_by_via?: string | null
          deal_box_version?: number | null
          description?: string | null
          discovered_at?: string | null
          duplicate_of?: string | null
          earnings_basis?: string
          ebitda_ttm?: number | null
          firm_id?: string | null
          id?: string
          listing_status?: string
          notes?: string | null
          open_to_partnership?: boolean
          outcome_reason?: string | null
          owner_user_id?: string | null
          resolution?: string | null
          resolution_reason?: string | null
          revenue_ttm?: number | null
          sde_ttm?: number | null
          search_tsv?: unknown
          source?: Database["public"]["Enums"]["deal_source"]
          source_url?: string | null
          stage?: string
          stage_changed_at?: string | null
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
            foreignKeyName: "deal_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "deal"
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
          min_dscr: number | null
          required_personal_cash_flow: number | null
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
          min_dscr?: number | null
          required_personal_cash_flow?: number | null
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
          min_dscr?: number | null
          required_personal_cash_flow?: number | null
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
      deal_calc_defaults: {
        Row: {
          account_id: string
          after_standby: string
          created_at: string | null
          created_by: string | null
          minimum_dscr: number
          scenario_paths: Json | null
          updated_at: string | null
          updated_by: string | null
          year_basis: string
        }
        Insert: {
          account_id: string
          after_standby: string
          created_at?: string | null
          created_by?: string | null
          minimum_dscr?: number
          scenario_paths?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          year_basis?: string
        }
        Update: {
          account_id?: string
          after_standby?: string
          created_at?: string | null
          created_by?: string | null
          minimum_dscr?: number
          scenario_paths?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          year_basis?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_calc_defaults_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_defaults_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_defaults_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_calc_input: {
        Row: {
          account_id: string
          calc_version_id: string
          created_at: string | null
          created_by: string | null
          deal_box_id: string | null
          id: string
          imported_from_version_id: string | null
          inputs: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          calc_version_id: string
          created_at?: string | null
          created_by?: string | null
          deal_box_id?: string | null
          id?: string
          imported_from_version_id?: string | null
          inputs?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          calc_version_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_box_id?: string | null
          id?: string
          imported_from_version_id?: string | null
          inputs?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_calc_input_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_input_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_input_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_input_calc_version_id_fkey"
            columns: ["calc_version_id"]
            isOneToOne: true
            referencedRelation: "calc_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_input_deal_box_id_fkey"
            columns: ["deal_box_id"]
            isOneToOne: false
            referencedRelation: "deal_box"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calc_input_imported_from_version_id_fkey"
            columns: ["imported_from_version_id"]
            isOneToOne: false
            referencedRelation: "calc_version"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_checklist_application: {
        Row: {
          account_id: string
          applied_at: string
          applied_by: string | null
          deal_id: string
          template_id: string
        }
        Insert: {
          account_id: string
          applied_at?: string
          applied_by?: string | null
          deal_id: string
          template_id: string
        }
        Update: {
          account_id?: string
          applied_at?: string
          applied_by?: string | null
          deal_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_checklist_application_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_application_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_application_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_application_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_application_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_template"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_close_deadline: {
        Row: {
          account_id: string
          deal_id: string
          must_close_by: string | null
          must_close_reason: string | null
        }
        Insert: {
          account_id: string
          deal_id: string
          must_close_by?: string | null
          must_close_reason?: string | null
        }
        Update: {
          account_id?: string
          deal_id?: string
          must_close_by?: string | null
          must_close_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_close_deadline_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_deadline_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_deadline_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_close_deadline_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contact: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          role: Database["public"]["Enums"]["deal_person_role"]
          side: Database["public"]["Enums"]["deal_side"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          role: Database["public"]["Enums"]["deal_person_role"]
          side: Database["public"]["Enums"]["deal_side"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          role?: Database["public"]["Enums"]["deal_person_role"]
          side?: Database["public"]["Enums"]["deal_side"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contract_review_gate_change: {
        Row: {
          account_id: string
          changed_at: string
          changed_by: string
          contract_type: string
          deal_id: string
          id: string
          required: boolean
          was_required: boolean
        }
        Insert: {
          account_id: string
          changed_at?: string
          changed_by?: string
          contract_type: string
          deal_id: string
          id?: string
          required: boolean
          was_required?: boolean
        }
        Update: {
          account_id?: string
          changed_at?: string
          changed_by?: string
          contract_type?: string
          deal_id?: string
          id?: string
          required?: boolean
          was_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "deal_contract_review_gate_change_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contract_review_gate_change_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contract_review_gate_change_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contract_review_gate_change_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_counsel: {
        Row: {
          account_id: string
          company: string | null
          created_at: string
          deal_id: string
          email: string
          id: string
          invited_by: string | null
          name: string | null
          phone: string | null
          profile_asked_at: string | null
          side: Database["public"]["Enums"]["counsel_side"]
          user_id: string
        }
        Insert: {
          account_id: string
          company?: string | null
          created_at?: string
          deal_id: string
          email: string
          id?: string
          invited_by?: string | null
          name?: string | null
          phone?: string | null
          profile_asked_at?: string | null
          side: Database["public"]["Enums"]["counsel_side"]
          user_id: string
        }
        Update: {
          account_id?: string
          company?: string | null
          created_at?: string
          deal_id?: string
          email?: string
          id?: string
          invited_by?: string | null
          name?: string | null
          phone?: string | null
          profile_asked_at?: string | null
          side?: Database["public"]["Enums"]["counsel_side"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_counsel_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_counsel_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_counsel_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_counsel_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_counsel_removed: {
        Row: {
          account_id: string
          deal_id: string
          email: string
          id: string
          invited_at: string
          removed_at: string
          removed_by: string | null
          side: Database["public"]["Enums"]["counsel_side"]
          user_id: string
        }
        Insert: {
          account_id: string
          deal_id: string
          email: string
          id?: string
          invited_at: string
          removed_at?: string
          removed_by?: string | null
          side: Database["public"]["Enums"]["counsel_side"]
          user_id: string
        }
        Update: {
          account_id?: string
          deal_id?: string
          email?: string
          id?: string
          invited_at?: string
          removed_at?: string
          removed_by?: string | null
          side?: Database["public"]["Enums"]["counsel_side"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_counsel_removed_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_counsel_removed_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_counsel_removed_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_counsel_removed_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_discovery: {
        Row: {
          account_id: string
          call_date: string | null
          clean_books: boolean | null
          counterparty_type:
            | Database["public"]["Enums"]["discovery_counterparty_type"]
            | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          differentiation: string | null
          discovery_notes: string | null
          documented_processes: boolean | null
          employee_count: number | null
          estimated_margin: number | null
          expansion_notes: string | null
          financing_notes: string | null
          firm_timeline: boolean | null
          gaps_if_owner_leaves: string | null
          has_management_team: boolean | null
          id: string
          largest_customer_pct: number | null
          main_lead_source: string | null
          most_sensitive_issue: string | null
          open_to_seller_financing:
            | Database["public"]["Enums"]["discovery_financing_stance"]
            | null
          owner_dependency:
            | Database["public"]["Enums"]["discovery_owner_dependency"]
            | null
          owner_hours_per_week: number | null
          reason_for_selling:
            | Database["public"]["Enums"]["discovery_reason_for_selling"]
            | null
          recurring_revenue_pct: number | null
          revenue_trend:
            | Database["public"]["Enums"]["discovery_revenue_trend"]
            | null
          target_sale_date: string | null
          transition_months: number | null
          updated_at: string | null
          updated_by: string | null
          what_matters_most:
            | Database["public"]["Enums"]["discovery_priority"][]
            | null
          willing_to_train: boolean | null
          years_in_operation: number | null
        }
        Insert: {
          account_id: string
          call_date?: string | null
          clean_books?: boolean | null
          counterparty_type?:
            | Database["public"]["Enums"]["discovery_counterparty_type"]
            | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          differentiation?: string | null
          discovery_notes?: string | null
          documented_processes?: boolean | null
          employee_count?: number | null
          estimated_margin?: number | null
          expansion_notes?: string | null
          financing_notes?: string | null
          firm_timeline?: boolean | null
          gaps_if_owner_leaves?: string | null
          has_management_team?: boolean | null
          id?: string
          largest_customer_pct?: number | null
          main_lead_source?: string | null
          most_sensitive_issue?: string | null
          open_to_seller_financing?:
            | Database["public"]["Enums"]["discovery_financing_stance"]
            | null
          owner_dependency?:
            | Database["public"]["Enums"]["discovery_owner_dependency"]
            | null
          owner_hours_per_week?: number | null
          reason_for_selling?:
            | Database["public"]["Enums"]["discovery_reason_for_selling"]
            | null
          recurring_revenue_pct?: number | null
          revenue_trend?:
            | Database["public"]["Enums"]["discovery_revenue_trend"]
            | null
          target_sale_date?: string | null
          transition_months?: number | null
          updated_at?: string | null
          updated_by?: string | null
          what_matters_most?:
            | Database["public"]["Enums"]["discovery_priority"][]
            | null
          willing_to_train?: boolean | null
          years_in_operation?: number | null
        }
        Update: {
          account_id?: string
          call_date?: string | null
          clean_books?: boolean | null
          counterparty_type?:
            | Database["public"]["Enums"]["discovery_counterparty_type"]
            | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          differentiation?: string | null
          discovery_notes?: string | null
          documented_processes?: boolean | null
          employee_count?: number | null
          estimated_margin?: number | null
          expansion_notes?: string | null
          financing_notes?: string | null
          firm_timeline?: boolean | null
          gaps_if_owner_leaves?: string | null
          has_management_team?: boolean | null
          id?: string
          largest_customer_pct?: number | null
          main_lead_source?: string | null
          most_sensitive_issue?: string | null
          open_to_seller_financing?:
            | Database["public"]["Enums"]["discovery_financing_stance"]
            | null
          owner_dependency?:
            | Database["public"]["Enums"]["discovery_owner_dependency"]
            | null
          owner_hours_per_week?: number | null
          reason_for_selling?:
            | Database["public"]["Enums"]["discovery_reason_for_selling"]
            | null
          recurring_revenue_pct?: number | null
          revenue_trend?:
            | Database["public"]["Enums"]["discovery_revenue_trend"]
            | null
          target_sale_date?: string | null
          transition_months?: number | null
          updated_at?: string | null
          updated_by?: string | null
          what_matters_most?:
            | Database["public"]["Enums"]["discovery_priority"][]
            | null
          willing_to_train?: boolean | null
          years_in_operation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_discovery_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_discovery_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_discovery_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_discovery_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_event: {
        Row: {
          account_id: string
          actor_kind: Database["public"]["Enums"]["event_actor_kind"]
          actor_ref: string | null
          actor_via: string | null
          aggregate_id: string
          aggregate_seq: number
          aggregate_type: string
          created_at: string
          deal_id: string
          deal_seq: number
          event_type: string
          global_seq: number
          id: string
          payload: Json
          xid: unknown
        }
        Insert: {
          account_id: string
          actor_kind: Database["public"]["Enums"]["event_actor_kind"]
          actor_ref?: string | null
          actor_via?: string | null
          aggregate_id: string
          aggregate_seq: number
          aggregate_type: string
          created_at?: string
          deal_id: string
          deal_seq: number
          event_type: string
          global_seq?: never
          id?: string
          payload?: Json
          xid?: unknown
        }
        Update: {
          account_id?: string
          actor_kind?: Database["public"]["Enums"]["event_actor_kind"]
          actor_ref?: string | null
          actor_via?: string | null
          aggregate_id?: string
          aggregate_seq?: number
          aggregate_type?: string
          created_at?: string
          deal_id?: string
          deal_seq?: number
          event_type?: string
          global_seq?: never
          id?: string
          payload?: Json
          xid?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "deal_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_event_snapshot: {
        Row: {
          account_id: string
          aggregate_id: string
          aggregate_type: string
          created_at: string
          deal_id: string
          id: string
          state: Json
          through_seq: number
        }
        Insert: {
          account_id: string
          aggregate_id: string
          aggregate_type: string
          created_at?: string
          deal_id: string
          id?: string
          state: Json
          through_seq: number
        }
        Update: {
          account_id?: string
          aggregate_id?: string
          aggregate_type?: string
          created_at?: string
          deal_id?: string
          id?: string
          state?: Json
          through_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_event_snapshot_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_snapshot_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_snapshot_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_event_snapshot_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_financials: {
        Row: {
          account_id: string
          adopted_at: string | null
          adopted_by: string | null
          adopted_ebitda: number | null
          adopted_revenue: number | null
          adopted_sde: number | null
          adopted_years: Json | null
          deal_id: string
          source_calc_version_id: string | null
        }
        Insert: {
          account_id: string
          adopted_at?: string | null
          adopted_by?: string | null
          adopted_ebitda?: number | null
          adopted_revenue?: number | null
          adopted_sde?: number | null
          adopted_years?: Json | null
          deal_id: string
          source_calc_version_id?: string | null
        }
        Update: {
          account_id?: string
          adopted_at?: string | null
          adopted_by?: string | null
          adopted_ebitda?: number | null
          adopted_revenue?: number | null
          adopted_sde?: number | null
          adopted_years?: Json | null
          deal_id?: string
          source_calc_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_financials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financials_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financials_source_calc_version_fk"
            columns: ["source_calc_version_id"]
            isOneToOne: false
            referencedRelation: "calc_version"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_main_contact: {
        Row: {
          contact_id: string | null
          deal_id: string
          lender_room_id: string | null
          side: Database["public"]["Enums"]["deal_side"]
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          deal_id: string
          lender_room_id?: string | null
          side: Database["public"]["Enums"]["deal_side"]
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          deal_id?: string
          lender_room_id?: string | null
          side?: Database["public"]["Enums"]["deal_side"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_main_contact_deal_id_contact_id_side_fkey"
            columns: ["deal_id", "contact_id", "side"]
            isOneToOne: false
            referencedRelation: "deal_contact"
            referencedColumns: ["deal_id", "contact_id", "side"]
          },
          {
            foreignKeyName: "deal_main_contact_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_main_contact_lender_room_id_deal_id_fkey"
            columns: ["lender_room_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      deal_milestone: {
        Row: {
          account_id: string
          actual_on: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          id: string
          kind: Database["public"]["Enums"]["milestone_kind"]
          label: string | null
          shared: boolean
          target_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          actual_on?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          id?: string
          kind: Database["public"]["Enums"]["milestone_kind"]
          label?: string | null
          shared: boolean
          target_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          actual_on?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["milestone_kind"]
          label?: string | null
          shared?: boolean
          target_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_milestone_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_milestone_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_milestone_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_milestone_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_milestone_overdue_notice: {
        Row: {
          milestone_id: string
          target_on: string
        }
        Insert: {
          milestone_id: string
          target_on: string
        }
        Update: {
          milestone_id?: string
          target_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_milestone_overdue_notice_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "deal_milestone"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_operating_period: {
        Row: {
          account_id: string
          cash_balance: number | null
          cogs: number | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          debt_service: number | null
          headcount: number | null
          id: string
          notes: string | null
          opex: number | null
          period_month: string
          revenue: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          cash_balance?: number | null
          cogs?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          debt_service?: number | null
          headcount?: number | null
          id?: string
          notes?: string | null
          opex?: number | null
          period_month: string
          revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          cash_balance?: number | null
          cogs?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          debt_service?: number | null
          headcount?: number | null
          id?: string
          notes?: string | null
          opex?: number | null
          period_month?: string
          revenue?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_operating_period_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_operating_period_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_operating_period_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_operating_period_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
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
      deal_profile: {
        Row: {
          account_id: string
          business_model: string | null
          deal_id: string
          employee_band: string | null
          industry: string | null
          industry_id: string | null
          location_id: string | null
          location_raw: string | null
          owner_role: string | null
          reason_for_sale: string | null
          website: string | null
          year_established: number | null
        }
        Insert: {
          account_id: string
          business_model?: string | null
          deal_id: string
          employee_band?: string | null
          industry?: string | null
          industry_id?: string | null
          location_id?: string | null
          location_raw?: string | null
          owner_role?: string | null
          reason_for_sale?: string | null
          website?: string | null
          year_established?: number | null
        }
        Update: {
          account_id?: string
          business_model?: string | null
          deal_id?: string
          employee_band?: string | null
          industry?: string | null
          industry_id?: string | null
          location_id?: string | null
          location_raw?: string | null
          owner_role?: string | null
          reason_for_sale?: string | null
          website?: string | null
          year_established?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_profile_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_profile_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_profile_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_star: {
        Row: {
          account_id: string
          created_at: string
          deal_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          deal_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          deal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_star_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_star_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_star_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_star_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_terms_sought: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          loan_amount: number | null
          loan_type: string | null
          notes: string | null
          rate_type: Database["public"]["Enums"]["lender_rate_type"] | null
          seller_note_amount: number | null
          term_years: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          loan_amount?: number | null
          loan_type?: string | null
          notes?: string | null
          rate_type?: Database["public"]["Enums"]["lender_rate_type"] | null
          seller_note_amount?: number | null
          term_years?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          loan_amount?: number | null
          loan_type?: string | null
          notes?: string | null
          rate_type?: Database["public"]["Enums"]["lender_rate_type"] | null
          seller_note_amount?: number | null
          term_years?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_terms_sought_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_terms_sought_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_terms_sought_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_terms_sought_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_thesis: {
        Row: {
          account_id: string
          additional_info: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          main_concerns: string | null
          owner_involvement: string | null
          post_acquisition_plan: string | null
          updated_at: string | null
          updated_by: string | null
          why_this_business: string | null
        }
        Insert: {
          account_id: string
          additional_info?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          main_concerns?: string | null
          owner_involvement?: string | null
          post_acquisition_plan?: string | null
          updated_at?: string | null
          updated_by?: string | null
          why_this_business?: string | null
        }
        Update: {
          account_id?: string
          additional_info?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          main_concerns?: string | null
          owner_involvement?: string | null
          post_acquisition_plan?: string | null
          updated_at?: string | null
          updated_by?: string | null
          why_this_business?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_thesis_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_thesis_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_thesis_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_thesis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_update: {
        Row: {
          account_id: string
          author_id: string | null
          body: string
          created_at: string
          deal_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          picks: Json
          status: Database["public"]["Enums"]["deal_update_status"]
          subject: string
          submitted_at: string | null
          version: number
        }
        Insert: {
          account_id: string
          author_id?: string | null
          body: string
          created_at?: string
          deal_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          picks: Json
          status?: Database["public"]["Enums"]["deal_update_status"]
          subject: string
          submitted_at?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          author_id?: string | null
          body?: string
          created_at?: string
          deal_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          picks?: Json
          status?: Database["public"]["Enums"]["deal_update_status"]
          subject?: string
          submitted_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_update_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_update_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_update_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_update_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_update_recipient: {
        Row: {
          claimed_at: string | null
          contact_id: string | null
          email: string
          entries: Database["public"]["CompositeTypes"]["deal_person_entry"][]
          error: string | null
          failed_at: string | null
          id: string
          name: string | null
          sent_at: string | null
          update_id: string
          user_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          contact_id?: string | null
          email: string
          entries: Database["public"]["CompositeTypes"]["deal_person_entry"][]
          error?: string | null
          failed_at?: string | null
          id?: string
          name?: string | null
          sent_at?: string | null
          update_id: string
          user_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          contact_id?: string | null
          email?: string
          entries?: Database["public"]["CompositeTypes"]["deal_person_entry"][]
          error?: string | null
          failed_at?: string | null
          id?: string
          name?: string | null
          sent_at?: string | null
          update_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_update_recipient_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_update_recipient_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "deal_update"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_value_marker: {
        Row: {
          account_id: string
          category: Database["public"]["Enums"]["value_marker_category"]
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          notes: string | null
          question_key: string
          rating: Database["public"]["Enums"]["value_marker_rating"] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          category: Database["public"]["Enums"]["value_marker_category"]
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          notes?: string | null
          question_key: string
          rating?: Database["public"]["Enums"]["value_marker_rating"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          category?: Database["public"]["Enums"]["value_marker_category"]
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          notes?: string | null
          question_key?: string
          rating?: Database["public"]["Enums"]["value_marker_rating"] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_value_marker_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_value_marker_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_value_marker_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_value_marker_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_worksheet_row: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          data: Json
          deal_id: string
          id: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
          worksheet_type: Database["public"]["Enums"]["deal_worksheet_type"]
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          data?: Json
          deal_id: string
          id?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
          worksheet_type: Database["public"]["Enums"]["deal_worksheet_type"]
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          data?: Json
          deal_id?: string
          id?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
          worksheet_type?: Database["public"]["Enums"]["deal_worksheet_type"]
        }
        Relationships: [
          {
            foreignKeyName: "deal_worksheet_row_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_worksheet_row_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_worksheet_row_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_worksheet_row_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_fact: {
        Row: {
          account_id: string
          body: string
          created_at: string | null
          created_by: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
          verdict_id: string | null
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          verdict_id?: string | null
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          verdict_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_fact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_fact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_fact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_fact_verdict_id_account_id_fkey"
            columns: ["verdict_id", "account_id"]
            isOneToOne: false
            referencedRelation: "firm_verdict"
            referencedColumns: ["id", "account_id"]
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
          delivered_at: string | null
          expires_at: string | null
          first_viewed_at: string | null
          generated_document_id: string
          id: string
          permission: string | null
          recipient_user_id: string | null
          room_id: string | null
          sent_at: string | null
          workflow_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          delivered_at?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          generated_document_id: string
          id?: string
          permission?: string | null
          recipient_user_id?: string | null
          room_id?: string | null
          sent_at?: string | null
          workflow_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          delivered_at?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          generated_document_id?: string
          id?: string
          permission?: string | null
          recipient_user_id?: string | null
          room_id?: string | null
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
          {
            foreignKeyName: "document_share_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
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
          created_at: string | null
          deal_id: string
          folder_id: string
          id: string
          name: string
          removed_at: string | null
          storage_path: string
          updated_at: string | null
          uploaded_by: string | null
          version: number
        }
        Insert: {
          account_id: string
          created_at?: string | null
          deal_id: string
          folder_id: string
          id?: string
          name: string
          removed_at?: string | null
          storage_path: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          created_at?: string | null
          deal_id?: string
          folder_id?: string
          id?: string
          name?: string
          removed_at?: string | null
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
            foreignKeyName: "dr_folder_parent_id_deal_id_fkey"
            columns: ["parent_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      duplicate_candidate: {
        Row: {
          account_id: string
          candidate_deal_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          score: number | null
          signal: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          candidate_deal_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          score?: number | null
          signal?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          candidate_deal_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          score?: number | null
          signal?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_candidate_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidate_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidate_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidate_candidate_deal_id_fkey"
            columns: ["candidate_deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_candidate_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
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
          ein: string | null
          employee_band: string | null
          established_year: number | null
          icp_score: number | null
          id: string
          imported_at: string
          industry: string | null
          naics_code: string | null
          name: string
          name_confirmed: boolean
          owner_age_estimate: number | null
          owner_mailing_address_line1: string | null
          owner_mailing_city: string | null
          owner_mailing_postal_code: string | null
          owner_mailing_state: string | null
          owner_names: string[]
          profile: string | null
          profile_generated_at: string | null
          profile_model: string | null
          public_business_id: string | null
          revenue_estimate: number | null
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
          ein?: string | null
          employee_band?: string | null
          established_year?: number | null
          icp_score?: number | null
          id?: string
          imported_at?: string
          industry?: string | null
          naics_code?: string | null
          name: string
          name_confirmed?: boolean
          owner_age_estimate?: number | null
          owner_mailing_address_line1?: string | null
          owner_mailing_city?: string | null
          owner_mailing_postal_code?: string | null
          owner_mailing_state?: string | null
          owner_names?: string[]
          profile?: string | null
          profile_generated_at?: string | null
          profile_model?: string | null
          public_business_id?: string | null
          revenue_estimate?: number | null
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
          ein?: string | null
          employee_band?: string | null
          established_year?: number | null
          icp_score?: number | null
          id?: string
          imported_at?: string
          industry?: string | null
          naics_code?: string | null
          name?: string
          name_confirmed?: boolean
          owner_age_estimate?: number | null
          owner_mailing_address_line1?: string | null
          owner_mailing_city?: string | null
          owner_mailing_postal_code?: string | null
          owner_mailing_state?: string | null
          owner_names?: string[]
          profile?: string | null
          profile_generated_at?: string | null
          profile_model?: string | null
          public_business_id?: string | null
          revenue_estimate?: number | null
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
          {
            foreignKeyName: "firm_public_business_id_fkey"
            columns: ["public_business_id"]
            isOneToOne: false
            referencedRelation: "public_business"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_email: {
        Row: {
          account_id: string
          created_at: string
          email: string
          firm_id: string
          id: string
          provider: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          firm_id: string
          id?: string
          provider: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          firm_id?: string
          id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_email_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_email_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_email_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_email_firm_id_account_id_fkey"
            columns: ["firm_id", "account_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      firm_verdict: {
        Row: {
          account_id: string
          created_at: string
          endpoint_id: string | null
          firm_id: string
          fit: boolean
          id: string
          model: string
          reasons: string[]
        }
        Insert: {
          account_id: string
          created_at?: string
          endpoint_id?: string | null
          firm_id: string
          fit: boolean
          id?: string
          model: string
          reasons: string[]
        }
        Update: {
          account_id?: string
          created_at?: string
          endpoint_id?: string | null
          firm_id?: string
          fit?: boolean
          id?: string
          model?: string
          reasons?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "firm_verdict_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_verdict_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_verdict_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_verdict_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "llm_endpoint"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_verdict_firm_id_account_id_fkey"
            columns: ["firm_id", "account_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      firm_verdict_approval: {
        Row: {
          account_id: string
          approved_at: string
          approved_by: string
          reason: string | null
          verdict_id: string
        }
        Insert: {
          account_id: string
          approved_at?: string
          approved_by?: string
          reason?: string | null
          verdict_id: string
        }
        Update: {
          account_id?: string
          approved_at?: string
          approved_by?: string
          reason?: string | null
          verdict_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_verdict_approval_verdict_id_account_id_fkey"
            columns: ["verdict_id", "account_id"]
            isOneToOne: true
            referencedRelation: "firm_verdict"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      firm_verdict_revocation: {
        Row: {
          account_id: string
          reason: string
          revoked_at: string
          revoked_by: string
          verdict_id: string
        }
        Insert: {
          account_id: string
          reason: string
          revoked_at?: string
          revoked_by?: string
          verdict_id: string
        }
        Update: {
          account_id?: string
          reason?: string
          revoked_at?: string
          revoked_by?: string
          verdict_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_verdict_revocation_verdict_id_account_id_fkey"
            columns: ["verdict_id", "account_id"]
            isOneToOne: false
            referencedRelation: "firm_verdict_approval"
            referencedColumns: ["verdict_id", "account_id"]
          },
        ]
      }
      form_5500_filing: {
        Row: {
          ack_id: string
          address_line1: string | null
          business_id: string | null
          city: string | null
          ein: string
          import_id: string | null
          participant_count: number | null
          plan_year_begin: string | null
          postal_code: string | null
          sponsor_name: string
          state: string | null
        }
        Insert: {
          ack_id: string
          address_line1?: string | null
          business_id?: string | null
          city?: string | null
          ein: string
          import_id?: string | null
          participant_count?: number | null
          plan_year_begin?: string | null
          postal_code?: string | null
          sponsor_name: string
          state?: string | null
        }
        Update: {
          ack_id?: string
          address_line1?: string | null
          business_id?: string | null
          city?: string | null
          ein?: string
          import_id?: string | null
          participant_count?: number | null
          plan_year_begin?: string | null
          postal_code?: string | null
          sponsor_name?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_5500_filing_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_5500_filing_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_import"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_source: {
        Row: {
          account_id: string
          after_standby: string | null
          amount: number | null
          calc_version_id: string
          created_at: string | null
          created_by: string | null
          guarantee_fee: number | null
          id: string
          notes: string | null
          pct: number | null
          rate: number | null
          standby_months: number | null
          term_years: number | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          after_standby?: string | null
          amount?: number | null
          calc_version_id: string
          created_at?: string | null
          created_by?: string | null
          guarantee_fee?: number | null
          id?: string
          notes?: string | null
          pct?: number | null
          rate?: number | null
          standby_months?: number | null
          term_years?: number | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          after_standby?: string | null
          amount?: number | null
          calc_version_id?: string
          created_at?: string | null
          created_by?: string | null
          guarantee_fee?: number | null
          id?: string
          notes?: string | null
          pct?: number | null
          rate?: number | null
          standby_months?: number | null
          term_years?: number | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_source_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_source_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_source_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_source_calc_version_id_fkey"
            columns: ["calc_version_id"]
            isOneToOne: false
            referencedRelation: "calc_version"
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
      industry: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "industry"
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
      lead: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string | null
          source: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name?: string | null
          source?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string | null
          source?: string | null
        }
        Relationships: []
      }
      lead_import: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          rows_read: number
          rows_rejected: number
          rows_written: number
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_import_status"]
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          rows_read?: number
          rows_rejected?: number
          rows_written?: number
          source: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_import_status"]
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          rows_read?: number
          rows_rejected?: number
          rows_written?: number
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_import_status"]
        }
        Relationships: []
      }
      lender: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          domain: string
          id: string
          industries: string[]
          max_loan: number | null
          name: string
          notes: string | null
          rate_type: Database["public"]["Enums"]["lender_rate_type"] | null
          sba_preferred: boolean
          states: string[]
          tags: string[]
          typical_rate: number | null
          updated_at: string | null
          updated_by: string | null
          website: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          domain: string
          id?: string
          industries?: string[]
          max_loan?: number | null
          name: string
          notes?: string | null
          rate_type?: Database["public"]["Enums"]["lender_rate_type"] | null
          sba_preferred?: boolean
          states?: string[]
          tags?: string[]
          typical_rate?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          domain?: string
          id?: string
          industries?: string[]
          max_loan?: number | null
          name?: string
          notes?: string | null
          rate_type?: Database["public"]["Enums"]["lender_rate_type"] | null
          sba_preferred?: boolean
          states?: string[]
          tags?: string[]
          typical_rate?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_ask: {
        Row: {
          account_id: string
          body: string | null
          created_at: string
          created_by: string | null
          first_response_at: string | null
          id: string
          kind: Database["public"]["Enums"]["lender_ask_kind"]
          return_route:
            | Database["public"]["Enums"]["lender_return_route"]
            | null
          room_id: string
          status: Database["public"]["Enums"]["lender_ask_status"]
          title: string
        }
        Insert: {
          account_id: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          first_response_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["lender_ask_kind"]
          return_route?:
            | Database["public"]["Enums"]["lender_return_route"]
            | null
          room_id: string
          status?: Database["public"]["Enums"]["lender_ask_status"]
          title: string
        }
        Update: {
          account_id?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          first_response_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["lender_ask_kind"]
          return_route?:
            | Database["public"]["Enums"]["lender_return_route"]
            | null
          room_id?: string
          status?: Database["public"]["Enums"]["lender_ask_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_ask_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      lender_ask_file: {
        Row: {
          added_by: string | null
          ask_id: string
          created_at: string
          dr_document_id: string
          id: string
          role: Database["public"]["Enums"]["lender_ask_file_role"]
        }
        Insert: {
          added_by?: string | null
          ask_id: string
          created_at?: string
          dr_document_id: string
          id?: string
          role: Database["public"]["Enums"]["lender_ask_file_role"]
        }
        Update: {
          added_by?: string | null
          ask_id?: string
          created_at?: string
          dr_document_id?: string
          id?: string
          role?: Database["public"]["Enums"]["lender_ask_file_role"]
        }
        Relationships: [
          {
            foreignKeyName: "lender_ask_file_ask_id_fkey"
            columns: ["ask_id"]
            isOneToOne: false
            referencedRelation: "lender_ask"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_ask_message: {
        Row: {
          ask_id: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          side: Database["public"]["Enums"]["lender_side"]
        }
        Insert: {
          ask_id: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          side: Database["public"]["Enums"]["lender_side"]
        }
        Update: {
          ask_id?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          side?: Database["public"]["Enums"]["lender_side"]
        }
        Relationships: [
          {
            foreignKeyName: "lender_ask_message_ask_id_fkey"
            columns: ["ask_id"]
            isOneToOne: false
            referencedRelation: "lender_ask"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_brand: {
        Row: {
          domain: string
          fetched_at: string | null
          logo_path: string | null
          name: string | null
        }
        Insert: {
          domain: string
          fetched_at?: string | null
          logo_path?: string | null
          name?: string | null
        }
        Update: {
          domain?: string
          fetched_at?: string | null
          logo_path?: string | null
          name?: string | null
        }
        Relationships: []
      }
      lender_contact: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          lender_id: string
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
          id?: string
          is_primary?: boolean
          lender_id: string
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
          id?: string
          is_primary?: boolean
          lender_id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_contact_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_contact_lender_id_account_id_fkey"
            columns: ["lender_id", "account_id"]
            isOneToOne: false
            referencedRelation: "lender"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      lender_faq_entry: {
        Row: {
          account_id: string
          answer: string
          created_at: string
          created_by: string | null
          deal_id: string
          first_published_at: string | null
          id: string
          pinned: boolean
          question: string
          search_tsv: unknown
          status: Database["public"]["Enums"]["lender_faq_status"]
          updated_at: string
          version: number
        }
        Insert: {
          account_id: string
          answer: string
          created_at?: string
          created_by?: string | null
          deal_id: string
          first_published_at?: string | null
          id?: string
          pinned?: boolean
          question: string
          search_tsv?: unknown
          status?: Database["public"]["Enums"]["lender_faq_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          account_id?: string
          answer?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string
          first_published_at?: string | null
          id?: string
          pinned?: boolean
          question?: string
          search_tsv?: unknown
          status?: Database["public"]["Enums"]["lender_faq_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lender_faq_entry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_faq_entry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_faq_entry_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_faq_entry_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_faq_file: {
        Row: {
          added_by: string | null
          created_at: string
          deal_id: string
          entry_id: string
          id: string
          name: string
          source_dr_document_id: string | null
          storage_path: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          deal_id: string
          entry_id: string
          id?: string
          name: string
          source_dr_document_id?: string | null
          storage_path: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          deal_id?: string
          entry_id?: string
          id?: string
          name?: string
          source_dr_document_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_faq_file_entry_id_deal_id_fkey"
            columns: ["entry_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "lender_faq_entry"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      lender_faq_hidden: {
        Row: {
          created_at: string
          deal_id: string
          entry_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          entry_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          entry_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_faq_hidden_entry_id_deal_id_fkey"
            columns: ["entry_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "lender_faq_entry"
            referencedColumns: ["id", "deal_id"]
          },
          {
            foreignKeyName: "lender_faq_hidden_room_id_deal_id_fkey"
            columns: ["room_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      lender_faq_source: {
        Row: {
          ask_id: string
          created_at: string
          entry_id: string
        }
        Insert: {
          ask_id: string
          created_at?: string
          entry_id: string
        }
        Update: {
          ask_id?: string
          created_at?: string
          entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_faq_source_ask_id_fkey"
            columns: ["ask_id"]
            isOneToOne: false
            referencedRelation: "lender_ask"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_faq_source_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "lender_faq_entry"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_faq_upload: {
        Row: {
          created_at: string
          deal_id: string
          entry_id: string
          id: string
          name: string
          registered_at: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          entry_id: string
          id?: string
          name: string
          registered_at?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          entry_id?: string
          id?: string
          name?: string
          registered_at?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_faq_upload_entry_id_deal_id_fkey"
            columns: ["entry_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "lender_faq_entry"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      lender_form_signature: {
        Row: {
          ask_id: string
          created_at: string
          documenso_document_id: string
          editor_url: string | null
          id: string
          signers: Json
          status: Database["public"]["Enums"]["lender_signature_status"]
        }
        Insert: {
          ask_id: string
          created_at?: string
          documenso_document_id: string
          editor_url?: string | null
          id?: string
          signers: Json
          status?: Database["public"]["Enums"]["lender_signature_status"]
        }
        Update: {
          ask_id?: string
          created_at?: string
          documenso_document_id?: string
          editor_url?: string | null
          id?: string
          signers?: Json
          status?: Database["public"]["Enums"]["lender_signature_status"]
        }
        Relationships: [
          {
            foreignKeyName: "lender_form_signature_ask_id_fkey"
            columns: ["ask_id"]
            isOneToOne: false
            referencedRelation: "lender_ask"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_nudge_setting: {
        Row: {
          account_id: string
          quiet_days: number
        }
        Insert: {
          account_id: string
          quiet_days?: number
        }
        Update: {
          account_id?: string
          quiet_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "lender_nudge_setting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_nudge_setting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_nudge_setting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_nudge_todo: {
        Row: {
          created_at: string
          room_id: string
          todo_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          room_id: string
          todo_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          room_id?: string
          todo_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_nudge_todo_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_nudge_todo_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "personal_todo"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_outreach_template: {
        Row: {
          account_id: string
          body: string
          created_at: string | null
          created_by: string | null
          subject: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string | null
          created_by?: string | null
          subject: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string | null
          created_by?: string | null
          subject?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_outreach_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_outreach_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_outreach_template_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_oversize_file: {
        Row: {
          account_id: string
          created_at: string
          dr_folder_id: string
          id: string
          name: string
          size_bytes: number
        }
        Insert: {
          account_id: string
          created_at?: string
          dr_folder_id: string
          id?: string
          name: string
          size_bytes: number
        }
        Update: {
          account_id?: string
          created_at?: string
          dr_folder_id?: string
          id?: string
          name?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "lender_oversize_file_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_oversize_file_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_oversize_file_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_oversize_file_dr_folder_id_fkey"
            columns: ["dr_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_package: {
        Row: {
          account_id: string
          deal_id: string
          master_folder_id: string
        }
        Insert: {
          account_id: string
          deal_id: string
          master_folder_id: string
        }
        Update: {
          account_id?: string
          deal_id?: string
          master_folder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_package_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_package_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_package_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_package_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_package_master_folder_id_fkey"
            columns: ["master_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_person: {
        Row: {
          name: string | null
          name_asked_at: string | null
          user_id: string
        }
        Insert: {
          name?: string | null
          name_asked_at?: string | null
          user_id: string
        }
        Update: {
          name?: string | null
          name_asked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lender_rate_limit: {
        Row: {
          key: string
          last_at: string
        }
        Insert: {
          key: string
          last_at: string
        }
        Update: {
          key?: string
          last_at?: string
        }
        Relationships: []
      }
      lender_room: {
        Row: {
          account_id: string
          brand_domain: string | null
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          expires_at: string | null
          id: string
          lender_id: string | null
          name: string
          private_folder_id: string
          status: Database["public"]["Enums"]["lender_room_status"]
          updated_at: string | null
          updated_by: string | null
          welcome_note: string | null
        }
        Insert: {
          account_id: string
          brand_domain?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          expires_at?: string | null
          id?: string
          lender_id?: string | null
          name: string
          private_folder_id: string
          status?: Database["public"]["Enums"]["lender_room_status"]
          updated_at?: string | null
          updated_by?: string | null
          welcome_note?: string | null
        }
        Update: {
          account_id?: string
          brand_domain?: string | null
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          expires_at?: string | null
          id?: string
          lender_id?: string | null
          name?: string
          private_folder_id?: string
          status?: Database["public"]["Enums"]["lender_room_status"]
          updated_at?: string | null
          updated_by?: string | null
          welcome_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_room_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_room_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_room_brand_domain_fkey"
            columns: ["brand_domain"]
            isOneToOne: false
            referencedRelation: "lender_brand"
            referencedColumns: ["domain"]
          },
          {
            foreignKeyName: "lender_room_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_room_lender_fk"
            columns: ["lender_id", "account_id"]
            isOneToOne: false
            referencedRelation: "lender"
            referencedColumns: ["id", "account_id"]
          },
          {
            foreignKeyName: "lender_room_private_folder_id_fkey"
            columns: ["private_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_room_activity: {
        Row: {
          account_id: string
          action: Database["public"]["Enums"]["lender_activity_action"]
          created_at: string
          dr_document_id: string | null
          dr_folder_id: string | null
          faq_entry_id: string | null
          faq_file_id: string | null
          id: string
          payload: Json | null
          room_id: string
          side: Database["public"]["Enums"]["lender_side"]
          user_id: string | null
        }
        Insert: {
          account_id: string
          action: Database["public"]["Enums"]["lender_activity_action"]
          created_at?: string
          dr_document_id?: string | null
          dr_folder_id?: string | null
          faq_entry_id?: string | null
          faq_file_id?: string | null
          id?: string
          payload?: Json | null
          room_id: string
          side: Database["public"]["Enums"]["lender_side"]
          user_id?: string | null
        }
        Update: {
          account_id?: string
          action?: Database["public"]["Enums"]["lender_activity_action"]
          created_at?: string
          dr_document_id?: string | null
          dr_folder_id?: string | null
          faq_entry_id?: string | null
          faq_file_id?: string | null
          id?: string
          payload?: Json | null
          room_id?: string
          side?: Database["public"]["Enums"]["lender_side"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_activity_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      lender_room_email_reply: {
        Row: {
          account_id: string
          id: string
          provider_message_id: string
          received_at: string
          room_id: string
        }
        Insert: {
          account_id: string
          id?: string
          provider_message_id: string
          received_at: string
          room_id: string
        }
        Update: {
          account_id?: string
          id?: string
          provider_message_id?: string
          received_at?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_email_reply_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      lender_room_hidden: {
        Row: {
          dr_document_id: string | null
          dr_folder_id: string | null
          id: string
          room_id: string
        }
        Insert: {
          dr_document_id?: string | null
          dr_folder_id?: string | null
          id?: string
          room_id: string
        }
        Update: {
          dr_document_id?: string | null
          dr_folder_id?: string | null
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_hidden_dr_folder_id_fkey"
            columns: ["dr_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_room_hidden_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_room_member: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_member_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_room_outreach: {
        Row: {
          account_id: string
          body: string
          id: string
          kind: Database["public"]["Enums"]["lender_outreach_kind"]
          provider_message_id: string | null
          provider_thread_id: string | null
          room_id: string
          sent_at: string
          sent_by: string | null
          status: Database["public"]["Enums"]["lender_outreach_status"]
          subject: string
          to_email: string
        }
        Insert: {
          account_id: string
          body: string
          id?: string
          kind?: Database["public"]["Enums"]["lender_outreach_kind"]
          provider_message_id?: string | null
          provider_thread_id?: string | null
          room_id: string
          sent_at?: string
          sent_by?: string | null
          status?: Database["public"]["Enums"]["lender_outreach_status"]
          subject: string
          to_email: string
        }
        Update: {
          account_id?: string
          body?: string
          id?: string
          kind?: Database["public"]["Enums"]["lender_outreach_kind"]
          provider_message_id?: string | null
          provider_thread_id?: string | null
          room_id?: string
          sent_at?: string
          sent_by?: string | null
          status?: Database["public"]["Enums"]["lender_outreach_status"]
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_outreach_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      lender_room_removed_member: {
        Row: {
          email: string
          id: string
          invited_at: string
          removed_at: string
          removed_by: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          invited_at: string
          removed_at?: string
          removed_by?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          invited_at?: string
          removed_at?: string
          removed_by?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_removed_member_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_room_timeline_answer: {
        Row: {
          answer: Database["public"]["Enums"]["lender_timeline_answer"]
          answered_at: string
          answered_by: string | null
          earliest_close_date: string | null
          note: string | null
          room_id: string
          source: Database["public"]["Enums"]["lender_side"]
        }
        Insert: {
          answer: Database["public"]["Enums"]["lender_timeline_answer"]
          answered_at?: string
          answered_by?: string | null
          earliest_close_date?: string | null
          note?: string | null
          room_id: string
          source: Database["public"]["Enums"]["lender_side"]
        }
        Update: {
          answer?: Database["public"]["Enums"]["lender_timeline_answer"]
          answered_at?: string
          answered_by?: string | null
          earliest_close_date?: string | null
          note?: string | null
          room_id?: string
          source?: Database["public"]["Enums"]["lender_side"]
        }
        Relationships: [
          {
            foreignKeyName: "lender_room_timeline_answer_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "lender_room"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_upload: {
        Row: {
          created_at: string
          deal_id: string
          document_ids: string[] | null
          folder_id: string
          id: string
          keep_as_zip: boolean | null
          name: string
          registered_at: string | null
          room_id: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          document_ids?: string[] | null
          folder_id: string
          id?: string
          keep_as_zip?: boolean | null
          name: string
          registered_at?: string | null
          room_id?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          document_ids?: string[] | null
          folder_id?: string
          id?: string
          keep_as_zip?: boolean | null
          name?: string
          registered_at?: string | null
          room_id?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_upload_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_upload_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_upload_room_id_deal_id_fkey"
            columns: ["room_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "lender_room"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      llm_endpoint: {
        Row: {
          account_id: string
          api_key_secret_id: string | null
          api_key_secret_ref: string | null
          base_url: string | null
          chat_model: string | null
          created_at: string | null
          created_by: string | null
          id: string
          model: string | null
          provider: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          api_key_secret_id?: string | null
          api_key_secret_ref?: string | null
          base_url?: string | null
          chat_model?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          model?: string | null
          provider: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          api_key_secret_id?: string | null
          api_key_secret_ref?: string | null
          base_url?: string | null
          chat_model?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          model?: string | null
          provider?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_endpoint_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_endpoint_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_endpoint_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      location: {
        Row: {
          account_id: string
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          id: string
          metro: string | null
          region: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          metro?: string | null
          region?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          metro?: string | null
          region?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mailbox_connection: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          email_address: string
          id: string
          nango_connection_id: string
          provider: string
          provider_config_key: string
          status: string
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          email_address: string
          id?: string
          nango_connection_id: string
          provider: string
          provider_config_key: string
          status: string
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          email_address?: string
          id?: string
          nango_connection_id?: string
          provider?: string
          provider_config_key?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailbox_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailbox_connection_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
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
          recording_path: string | null
          recording_url: string | null
          scheduled_at: string | null
          series_id: string | null
          status: Database["public"]["Enums"]["meeting_status"] | null
          summary: string | null
          transcript_path: string | null
          transcript_text: string | null
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
          recording_path?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["meeting_status"] | null
          summary?: string | null
          transcript_path?: string | null
          transcript_text?: string | null
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
          recording_path?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["meeting_status"] | null
          summary?: string | null
          transcript_path?: string | null
          transcript_text?: string | null
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
          removed_at: string | null
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
          removed_at?: string | null
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
          removed_at?: string | null
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
      notification_reads: {
        Row: {
          notification_id: number
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: number
          read_at?: string
          user_id?: string
        }
        Update: {
          notification_id?: number
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
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
          deal_id: string | null
          dedupe_key: string | null
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
          deal_id?: string | null
          dedupe_key?: string | null
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
          deal_id?: string | null
          dedupe_key?: string | null
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
          {
            foreignKeyName: "notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      offer: {
        Row: {
          account_id: string
          current_version_id: string | null
          deal_id: string
          id: string
          responded_at: string | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          account_id: string
          current_version_id?: string | null
          deal_id: string
          id?: string
          responded_at?: string | null
          status: string
          submitted_at?: string | null
        }
        Update: {
          account_id?: string
          current_version_id?: string | null
          deal_id?: string
          id?: string
          responded_at?: string | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_version: {
        Row: {
          account_id: string
          approved_at: string | null
          approved_by: string | null
          author_side: string
          calc_version_id: string | null
          diligence_days: number | null
          exclusivity_days: number | null
          id: string
          number: number
          offer_expires_at: string | null
          offer_id: string
          purchase_price: number
          real_estate_portion: number | null
          target_close_date: string | null
          terms: Json
        }
        Insert: {
          account_id: string
          approved_at?: string | null
          approved_by?: string | null
          author_side: string
          calc_version_id?: string | null
          diligence_days?: number | null
          exclusivity_days?: number | null
          id?: string
          number: number
          offer_expires_at?: string | null
          offer_id: string
          purchase_price: number
          real_estate_portion?: number | null
          target_close_date?: string | null
          terms: Json
        }
        Update: {
          account_id?: string
          approved_at?: string | null
          approved_by?: string | null
          author_side?: string
          calc_version_id?: string | null
          diligence_days?: number | null
          exclusivity_days?: number | null
          id?: string
          number?: number
          offer_expires_at?: string | null
          offer_id?: string
          purchase_price?: number
          real_estate_portion?: number | null
          target_close_date?: string | null
          terms?: Json
        }
        Relationships: [
          {
            foreignKeyName: "offer_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_version_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_version_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offer"
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
      outreach_enrollment: {
        Row: {
          account_id: string
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          current_step: number
          firm_id: string | null
          id: string
          next_send_at: string
          sent_count: number
          sequence_id: string
          status: string
          target_email: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_step?: number
          firm_id?: string | null
          id?: string
          next_send_at?: string
          sent_count?: number
          sequence_id: string
          status?: string
          target_email: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_step?: number
          firm_id?: string | null
          id?: string
          next_send_at?: string
          sent_count?: number
          sequence_id?: string
          status?: string
          target_email?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_enrollment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_enrollment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_enrollment_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_enrollment_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_enrollment_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_enrollment_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "outreach_sequence"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_letter: {
        Row: {
          account_id: string
          address_line1: string
          city: string
          cost_cents: number | null
          created_at: string
          enrollment_id: string
          error: string | null
          id: string
          postal_code: string
          provider: string
          provider_letter_id: string | null
          state: string
          status: Database["public"]["Enums"]["letter_status"]
          step_ordinal: number
        }
        Insert: {
          account_id: string
          address_line1: string
          city: string
          cost_cents?: number | null
          created_at?: string
          enrollment_id: string
          error?: string | null
          id?: string
          postal_code: string
          provider: string
          provider_letter_id?: string | null
          state: string
          status?: Database["public"]["Enums"]["letter_status"]
          step_ordinal: number
        }
        Update: {
          account_id?: string
          address_line1?: string
          city?: string
          cost_cents?: number | null
          created_at?: string
          enrollment_id?: string
          error?: string | null
          id?: string
          postal_code?: string
          provider?: string
          provider_letter_id?: string | null
          state?: string
          status?: Database["public"]["Enums"]["letter_status"]
          step_ordinal?: number
        }
        Relationships: [
          {
            foreignKeyName: "outreach_letter_enrollment_id_account_id_fkey"
            columns: ["enrollment_id", "account_id"]
            isOneToOne: false
            referencedRelation: "outreach_enrollment"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      outreach_message: {
        Row: {
          body: string
          enrollment_id: string
          error: string | null
          id: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          step_id: number
          subject: string
          to_email: string
        }
        Insert: {
          body: string
          enrollment_id: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status: string
          step_id: number
          subject: string
          to_email: string
        }
        Update: {
          body?: string
          enrollment_id?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          step_id?: number
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_message_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "outreach_enrollment"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_sequence: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          is_default: boolean
          name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_sequence_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_sequence_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_sequence_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_setting: {
        Row: {
          account_id: string
          ai_monthly_cap: number
          created_at: string | null
          created_by: string | null
          daily_cap: number
          letter_monthly_cap: number
          lookup_monthly_cap: number
          max_touches: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          ai_monthly_cap?: number
          created_at?: string | null
          created_by?: string | null
          daily_cap: number
          letter_monthly_cap?: number
          lookup_monthly_cap?: number
          max_touches?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          ai_monthly_cap?: number
          created_at?: string | null
          created_by?: string | null
          daily_cap?: number
          letter_monthly_cap?: number
          lookup_monthly_cap?: number
          max_touches?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_setting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_setting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_setting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_step: {
        Row: {
          account_id: string
          body: string
          channel: Database["public"]["Enums"]["outreach_channel"]
          created_at: string | null
          created_by: string | null
          delay_days: number
          id: string
          ordinal: number
          sequence_id: string
          subject: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          body: string
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string | null
          created_by?: string | null
          delay_days?: number
          id?: string
          ordinal: number
          sequence_id: string
          subject?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          body?: string
          channel?: Database["public"]["Enums"]["outreach_channel"]
          created_at?: string | null
          created_by?: string | null
          delay_days?: number
          id?: string
          ordinal?: number
          sequence_id?: string
          subject?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_step_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_step_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_step_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_step_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "outreach_sequence"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_suppression: {
        Row: {
          account_id: string
          created_at: string
          email: string
          id: string
          reason: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          id?: string
          reason: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_suppression_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_suppression_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_suppression_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_lookup: {
        Row: {
          account_id: string
          cost_cents: number
          created_at: string
          firm_id: string | null
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          outcome: Database["public"]["Enums"]["paid_lookup_outcome"]
          provider: string
          result: Json
        }
        Insert: {
          account_id: string
          cost_cents: number
          created_at?: string
          firm_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["provider_kind"]
          outcome: Database["public"]["Enums"]["paid_lookup_outcome"]
          provider: string
          result: Json
        }
        Update: {
          account_id?: string
          cost_cents?: number
          created_at?: string
          firm_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["provider_kind"]
          outcome?: Database["public"]["Enums"]["paid_lookup_outcome"]
          provider?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "paid_lookup_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lookup_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lookup_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_lookup_firm_id_account_id_fkey"
            columns: ["firm_id", "account_id"]
            isOneToOne: false
            referencedRelation: "firm"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      personal_todo: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          done: boolean
          due_at: string | null
          id: string
          title: string
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          done?: boolean
          due_at?: string | null
          id?: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          done?: boolean
          due_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_todo_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_todo_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_todo_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_todo_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
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
      ppp_loan: {
        Row: {
          address_line1: string | null
          approved_on: string | null
          borrower_name: string
          business_age_description: string | null
          business_id: string | null
          city: string | null
          import_id: string | null
          jobs_reported: number | null
          loan_amount: number | null
          loan_number: string
          naics_code: string | null
          postal_code: string | null
          state: string | null
        }
        Insert: {
          address_line1?: string | null
          approved_on?: string | null
          borrower_name: string
          business_age_description?: string | null
          business_id?: string | null
          city?: string | null
          import_id?: string | null
          jobs_reported?: number | null
          loan_amount?: number | null
          loan_number: string
          naics_code?: string | null
          postal_code?: string | null
          state?: string | null
        }
        Update: {
          address_line1?: string | null
          approved_on?: string | null
          borrower_name?: string
          business_age_description?: string | null
          business_id?: string | null
          city?: string | null
          import_id?: string | null
          jobs_reported?: number | null
          loan_amount?: number | null
          loan_number?: string
          naics_code?: string | null
          postal_code?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ppp_loan_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppp_loan_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_import"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credential: {
        Row: {
          account_id: string
          api_key_secret_ref: string
          base_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          provider: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          api_key_secret_ref: string
          base_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["provider_kind"]
          provider: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          api_key_secret_ref?: string
          base_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["provider_kind"]
          provider?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_credential_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_credential_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_credential_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      public_business: {
        Row: {
          created_at: string
          ein: string | null
          id: string
          match_key: string | null
          name: string
        }
        Insert: {
          created_at?: string
          ein?: string | null
          id?: string
          match_key?: string | null
          name: string
        }
        Update: {
          created_at?: string
          ein?: string | null
          id?: string
          match_key?: string | null
          name?: string
        }
        Relationships: []
      }
      relay_cursor: {
        Row: {
          last_global_seq: number
          last_xid: unknown
          name: string
          updated_at: string
        }
        Insert: {
          last_global_seq: number
          last_xid?: unknown
          name: string
          updated_at?: string
        }
        Update: {
          last_global_seq?: number
          last_xid?: unknown
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      relay_failed_event: {
        Row: {
          attempts: number
          created_at: string
          error: string
          global_seq: number
          relay_name: string
          resolved_at: string | null
          retried_at: string | null
        }
        Insert: {
          attempts: number
          created_at?: string
          error: string
          global_seq: number
          relay_name: string
          resolved_at?: string | null
          retried_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string
          global_seq?: number
          relay_name?: string
          resolved_at?: string | null
          retried_at?: string | null
        }
        Relationships: []
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
      room_closing_todo: {
        Row: {
          created_at: string
          room_id: string
          room_kind: string
          todo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          room_id: string
          room_kind: string
          todo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          room_id?: string
          room_kind?: string
          todo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_closing_todo_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "personal_todo"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_view: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          filters: Json
          id: string
          name: string
          owner_user_id: string | null
          sort: Json | null
          updated_at: string | null
          updated_by: string | null
          visible_columns: Json | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          owner_user_id?: string | null
          sort?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          visible_columns?: Json | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          owner_user_id?: string | null
          sort?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          visible_columns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_view_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_view_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_view_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sba_loan: {
        Row: {
          address_line1: string | null
          approved_on: string | null
          borrower_name: string
          business_id: string | null
          city: string | null
          id: string
          import_id: string | null
          jobs_supported: number | null
          loan_amount: number | null
          naics_code: string | null
          postal_code: string | null
          program: Database["public"]["Enums"]["lead_source"]
          source_key: string
          state: string | null
        }
        Insert: {
          address_line1?: string | null
          approved_on?: string | null
          borrower_name: string
          business_id?: string | null
          city?: string | null
          id?: string
          import_id?: string | null
          jobs_supported?: number | null
          loan_amount?: number | null
          naics_code?: string | null
          postal_code?: string | null
          program: Database["public"]["Enums"]["lead_source"]
          source_key: string
          state?: string | null
        }
        Update: {
          address_line1?: string | null
          approved_on?: string | null
          borrower_name?: string
          business_id?: string | null
          city?: string | null
          id?: string
          import_id?: string | null
          jobs_supported?: number | null
          loan_amount?: number | null
          naics_code?: string | null
          postal_code?: string | null
          program?: Database["public"]["Enums"]["lead_source"]
          source_key?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sba_loan_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sba_loan_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_import"
            referencedColumns: ["id"]
          },
        ]
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
      sde_line: {
        Row: {
          account_id: string
          amount: number | null
          created_at: string | null
          created_by: string | null
          custom_label: string | null
          id: string
          line_code: string | null
          period_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_label?: string | null
          id?: string
          line_code?: string | null
          period_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_label?: string | null
          id?: string
          line_code?: string | null
          period_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sde_line_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sde_line_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sde_line_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sde_line_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "sde_period"
            referencedColumns: ["id"]
          },
        ]
      }
      sde_period: {
        Row: {
          account_id: string
          calc_version_id: string
          created_at: string | null
          created_by: string | null
          id: string
          label: string | null
          months: number | null
          updated_at: string | null
          updated_by: string | null
          weight: number | null
        }
        Insert: {
          account_id: string
          calc_version_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          label?: string | null
          months?: number | null
          updated_at?: string | null
          updated_by?: string | null
          weight?: number | null
        }
        Update: {
          account_id?: string
          calc_version_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          label?: string | null
          months?: number | null
          updated_at?: string | null
          updated_by?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sde_period_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sde_period_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sde_period_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sde_period_calc_version_id_fkey"
            columns: ["calc_version_id"]
            isOneToOne: false
            referencedRelation: "calc_version"
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
      seller_counsel_folder: {
        Row: {
          account_id: string
          deal_id: string
          folder_id: string
        }
        Insert: {
          account_id: string
          deal_id: string
          folder_id: string
        }
        Update: {
          account_id?: string
          deal_id?: string
          folder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_counsel_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_folder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_folder_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_folder_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_counsel_message: {
        Row: {
          account_id: string
          author_name: string
          author_side: Database["public"]["Enums"]["seller_counsel_author_side"]
          author_user_id: string | null
          body: string
          created_at: string
          deal_id: string
          id: string
        }
        Insert: {
          account_id: string
          author_name: string
          author_side: Database["public"]["Enums"]["seller_counsel_author_side"]
          author_user_id?: string | null
          body: string
          created_at?: string
          deal_id: string
          id?: string
        }
        Update: {
          account_id?: string
          author_name?: string
          author_side?: Database["public"]["Enums"]["seller_counsel_author_side"]
          author_user_id?: string | null
          body?: string
          created_at?: string
          deal_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_counsel_message_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_counsel_message_file: {
        Row: {
          account_id: string
          deal_id: string
          id: string
          message_id: string
          name: string
          storage_path: string
        }
        Insert: {
          account_id: string
          deal_id: string
          id?: string
          message_id: string
          name: string
          storage_path: string
        }
        Update: {
          account_id?: string
          deal_id?: string
          id?: string
          message_id?: string
          name?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_counsel_message_file_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_file_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_file_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_file_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_counsel_message_file_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "seller_counsel_message"
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
      seller_question_note: {
        Row: {
          account_id: string
          author_user_id: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          note: string
          seller_question_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_id: string
          author_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          note: string
          seller_question_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          author_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          note?: string
          seller_question_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_question_note_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_note_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_note_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_question_note_seller_question_id_fkey"
            columns: ["seller_question_id"]
            isOneToOne: false
            referencedRelation: "seller_question"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room: {
        Row: {
          account_id: string
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          updated_at: string | null
          updated_by: string | null
          uploads_folder_id: string
          welcome_note: string | null
        }
        Insert: {
          account_id: string
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          uploads_folder_id: string
          welcome_note?: string | null
        }
        Update: {
          account_id?: string
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
          uploads_folder_id?: string
          welcome_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_uploads_folder_id_fkey"
            columns: ["uploads_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_activity: {
        Row: {
          account_id: string
          action: Database["public"]["Enums"]["seller_activity_action"]
          created_at: string
          dr_document_id: string | null
          dr_folder_id: string | null
          id: string
          payload: Json | null
          room_id: string
          side: Database["public"]["Enums"]["seller_side"]
          user_id: string | null
        }
        Insert: {
          account_id: string
          action: Database["public"]["Enums"]["seller_activity_action"]
          created_at?: string
          dr_document_id?: string | null
          dr_folder_id?: string | null
          id?: string
          payload?: Json | null
          room_id: string
          side: Database["public"]["Enums"]["seller_side"]
          user_id?: string | null
        }
        Update: {
          account_id?: string
          action?: Database["public"]["Enums"]["seller_activity_action"]
          created_at?: string
          dr_document_id?: string | null
          dr_folder_id?: string | null
          id?: string
          payload?: Json | null
          room_id?: string
          side?: Database["public"]["Enums"]["seller_side"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_activity_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      seller_room_announcement: {
        Row: {
          announced_at: string
          item_id: string
          kind: string
          room_id: string
        }
        Insert: {
          announced_at?: string
          item_id: string
          kind: string
          room_id: string
        }
        Update: {
          announced_at?: string
          item_id?: string
          kind?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_announcement_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_comment: {
        Row: {
          account_id: string
          author_user_id: string
          body: string
          created_at: string
          dr_document_id: string | null
          id: string
          question_id: string | null
          room_id: string
        }
        Insert: {
          account_id: string
          author_user_id?: string
          body: string
          created_at?: string
          dr_document_id?: string | null
          id?: string
          question_id?: string | null
          room_id: string
        }
        Update: {
          account_id?: string
          author_user_id?: string
          body?: string
          created_at?: string
          dr_document_id?: string | null
          id?: string
          question_id?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_comment_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "seller_room_question"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_comment_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      seller_room_folder: {
        Row: {
          dr_folder_id: string
          id: string
          room_id: string
        }
        Insert: {
          dr_folder_id: string
          id?: string
          room_id: string
        }
        Update: {
          dr_folder_id?: string
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_folder_dr_folder_id_fkey"
            columns: ["dr_folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_folder_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_meeting: {
        Row: {
          id: string
          meeting_id: string
          room_id: string
        }
        Insert: {
          id?: string
          meeting_id: string
          room_id: string
        }
        Update: {
          id?: string
          meeting_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_meeting_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_member: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          name: string
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          name: string
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          name?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_member_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_question: {
        Row: {
          account_id: string
          body: string | null
          created_at: string
          created_by: string | null
          first_response_at: string | null
          id: string
          room_id: string
          status: Database["public"]["Enums"]["seller_room_question_status"]
          title: string
        }
        Insert: {
          account_id: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          first_response_at?: string | null
          id?: string
          room_id: string
          status?: Database["public"]["Enums"]["seller_room_question_status"]
          title: string
        }
        Update: {
          account_id?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          first_response_at?: string | null
          id?: string
          room_id?: string
          status?: Database["public"]["Enums"]["seller_room_question_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_question_room_id_account_id_fkey"
            columns: ["room_id", "account_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      seller_room_question_file: {
        Row: {
          added_by: string | null
          created_at: string
          dr_document_id: string
          id: string
          question_id: string
          side: Database["public"]["Enums"]["seller_side"]
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          dr_document_id: string
          id?: string
          question_id: string
          side: Database["public"]["Enums"]["seller_side"]
        }
        Update: {
          added_by?: string | null
          created_at?: string
          dr_document_id?: string
          id?: string
          question_id?: string
          side?: Database["public"]["Enums"]["seller_side"]
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_question_file_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "seller_room_question"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_question_message: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          question_id: string
          side: Database["public"]["Enums"]["seller_side"]
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          question_id: string
          side: Database["public"]["Enums"]["seller_side"]
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          question_id?: string
          side?: Database["public"]["Enums"]["seller_side"]
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_question_message_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "seller_room_question"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_question_route: {
        Row: {
          lender_ask_id: string
          question_id: string
        }
        Insert: {
          lender_ask_id: string
          question_id: string
        }
        Update: {
          lender_ask_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_question_route_lender_ask_id_fkey"
            columns: ["lender_ask_id"]
            isOneToOne: false
            referencedRelation: "lender_ask"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_room_question_route_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "seller_room_question"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_room_removed_member: {
        Row: {
          email: string
          id: string
          invited_at: string
          removed_at: string
          removed_by: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          invited_at: string
          removed_at?: string
          removed_by?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          invited_at?: string
          removed_at?: string
          removed_by?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_room_removed_member_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_send_limit: {
        Row: {
          account_id: string
          daily_limit: number
          updated_at: string
        }
        Insert: {
          account_id: string
          daily_limit: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          daily_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_send_limit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_send_limit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_send_limit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_upload: {
        Row: {
          created_at: string
          deal_id: string
          document_ids: string[] | null
          folder_id: string
          id: string
          keep_as_zip: boolean | null
          name: string
          registered_at: string | null
          room_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          document_ids?: string[] | null
          folder_id: string
          id?: string
          keep_as_zip?: boolean | null
          name: string
          registered_at?: string | null
          room_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          document_ids?: string[] | null
          folder_id?: string
          id?: string
          keep_as_zip?: boolean | null
          name?: string
          registered_at?: string | null
          room_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_upload_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_upload_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dr_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_upload_room_id_deal_id_fkey"
            columns: ["room_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "seller_room"
            referencedColumns: ["id", "deal_id"]
          },
        ]
      }
      state_registry_entity: {
        Row: {
          business_id: string | null
          entity_number: string
          fetched_at: string
          formation_date: string | null
          id: string
          import_id: string | null
          mailing_address_line1: string | null
          mailing_city: string | null
          mailing_postal_code: string | null
          mailing_state: string | null
          name: string
          registered_agent: string | null
          source: Database["public"]["Enums"]["registry_source"]
          state: string
          status: string | null
        }
        Insert: {
          business_id?: string | null
          entity_number: string
          fetched_at: string
          formation_date?: string | null
          id?: string
          import_id?: string | null
          mailing_address_line1?: string | null
          mailing_city?: string | null
          mailing_postal_code?: string | null
          mailing_state?: string | null
          name: string
          registered_agent?: string | null
          source: Database["public"]["Enums"]["registry_source"]
          state: string
          status?: string | null
        }
        Update: {
          business_id?: string | null
          entity_number?: string
          fetched_at?: string
          formation_date?: string | null
          id?: string
          import_id?: string | null
          mailing_address_line1?: string | null
          mailing_city?: string | null
          mailing_postal_code?: string | null
          mailing_state?: string | null
          name?: string
          registered_agent?: string | null
          source?: Database["public"]["Enums"]["registry_source"]
          state?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_registry_entity_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_registry_entity_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "lead_import"
            referencedColumns: ["id"]
          },
        ]
      }
      state_registry_officer: {
        Row: {
          entity_id: string
          id: string
          name: string
          title: string | null
        }
        Insert: {
          entity_id: string
          id?: string
          name: string
          title?: string | null
        }
        Update: {
          entity_id?: string
          id?: string
          name?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_registry_officer_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "state_registry_entity"
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
      team_home_visit: {
        Row: {
          account_id: string
          last_seen_at: string
          new_since: string
          user_id: string
        }
        Insert: {
          account_id: string
          last_seen_at?: string
          new_since: string
          user_id?: string
        }
        Update: {
          account_id?: string
          last_seen_at?: string
          new_since?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_home_visit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_home_visit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_home_visit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
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
      verification_finding: {
        Row: {
          account_id: string
          check_key: string
          checklist_item_ids: string[]
          created_at: string | null
          deal_id: string
          detail: Json
          dr_document_id: string | null
          id: string
          run_id: string
          severity: Database["public"]["Enums"]["verification_severity"]
          status: Database["public"]["Enums"]["verification_finding_status"]
          updated_at: string | null
        }
        Insert: {
          account_id: string
          check_key: string
          checklist_item_ids?: string[]
          created_at?: string | null
          deal_id: string
          detail?: Json
          dr_document_id?: string | null
          id?: string
          run_id: string
          severity: Database["public"]["Enums"]["verification_severity"]
          status?: Database["public"]["Enums"]["verification_finding_status"]
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          check_key?: string
          checklist_item_ids?: string[]
          created_at?: string | null
          deal_id?: string
          detail?: Json
          dr_document_id?: string | null
          id?: string
          run_id?: string
          severity?: Database["public"]["Enums"]["verification_severity"]
          status?: Database["public"]["Enums"]["verification_finding_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_finding_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_finding_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_finding_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_finding_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_finding_dr_document_id_fkey"
            columns: ["dr_document_id"]
            isOneToOne: false
            referencedRelation: "dr_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_finding_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "verification_run"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_run: {
        Row: {
          account_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          finished_at: string | null
          id: string
          started_at: string | null
          status: Database["public"]["Enums"]["verification_run_status"]
          trigger: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["verification_run_status"]
          trigger: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["verification_run_status"]
          trigger?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_run_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
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
      workflow: {
        Row: {
          account_id: string
          archived_at: string | null
          created_at: string
          enabled: boolean
          enabled_after_account_seq: number | null
          enabled_after_deal_seq: number | null
          id: string
          name: string
          system_key: string | null
        }
        Insert: {
          account_id: string
          archived_at?: string | null
          created_at?: string
          enabled?: boolean
          enabled_after_account_seq?: number | null
          enabled_after_deal_seq?: number | null
          id?: string
          name: string
          system_key?: string | null
        }
        Update: {
          account_id?: string
          archived_at?: string | null
          created_at?: string
          enabled?: boolean
          enabled_after_account_seq?: number | null
          enabled_after_deal_seq?: number | null
          id?: string
          name?: string
          system_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_approval: {
        Row: {
          account_id: string
          approved: boolean
          decided_at: string
          decided_by: string
          step_run_id: string
        }
        Insert: {
          account_id: string
          approved: boolean
          decided_at?: string
          decided_by?: string
          step_run_id: string
        }
        Update: {
          account_id?: string
          approved?: boolean
          decided_at?: string
          decided_by?: string
          step_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_approval_step_run_id_account_id_fkey"
            columns: ["step_run_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow_step_run"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      workflow_loop_saved_work: {
        Row: {
          account_id: string
          claimed_by_run_id: string | null
          context: Json
          created_at: string
          id: string
          items: Json
          node_id: string
          root_node_id: string
          saved_by_run_id: string
          workflow_id: string
        }
        Insert: {
          account_id: string
          claimed_by_run_id?: string | null
          context: Json
          created_at?: string
          id?: string
          items: Json
          node_id: string
          root_node_id: string
          saved_by_run_id: string
          workflow_id: string
        }
        Update: {
          account_id?: string
          claimed_by_run_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          items?: Json
          node_id?: string
          root_node_id?: string
          saved_by_run_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_loop_saved_work_claimed_by_run_id_account_id_fkey"
            columns: ["claimed_by_run_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow_run"
            referencedColumns: ["id", "account_id"]
          },
          {
            foreignKeyName: "workflow_loop_saved_work_saved_by_run_id_account_id_fkey"
            columns: ["saved_by_run_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow_run"
            referencedColumns: ["id", "account_id"]
          },
          {
            foreignKeyName: "workflow_loop_saved_work_workflow_id_account_id_fkey"
            columns: ["workflow_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      workflow_run: {
        Row: {
          account_id: string
          error: string | null
          finished_at: string | null
          id: string
          loop_items_processed: number
          loop_items_total: number
          started_at: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          trigger_kind: Database["public"]["Enums"]["workflow_trigger_kind"]
          trigger_node_id: string
          trigger_output: Json
          trigger_ref: string
          version_id: string
          workflow_id: string
        }
        Insert: {
          account_id: string
          error?: string | null
          finished_at?: string | null
          id?: string
          loop_items_processed?: number
          loop_items_total?: number
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          trigger_kind: Database["public"]["Enums"]["workflow_trigger_kind"]
          trigger_node_id: string
          trigger_output?: Json
          trigger_ref: string
          version_id: string
          workflow_id: string
        }
        Update: {
          account_id?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          loop_items_processed?: number
          loop_items_total?: number
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          trigger_kind?: Database["public"]["Enums"]["workflow_trigger_kind"]
          trigger_node_id?: string
          trigger_output?: Json
          trigger_ref?: string
          version_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_run_version_id_workflow_id_fkey"
            columns: ["version_id", "workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_version"
            referencedColumns: ["id", "workflow_id"]
          },
          {
            foreignKeyName: "workflow_run_workflow_id_account_id_fkey"
            columns: ["workflow_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      workflow_step_log: {
        Row: {
          account_id: string
          created_at: string
          details: Json
          id: string
          level: Database["public"]["Enums"]["workflow_log_level"]
          message: string
          step_run_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          details?: Json
          id?: string
          level: Database["public"]["Enums"]["workflow_log_level"]
          message: string
          step_run_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          details?: Json
          id?: string
          level?: Database["public"]["Enums"]["workflow_log_level"]
          message?: string
          step_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_log_step_run_id_account_id_fkey"
            columns: ["step_run_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow_step_run"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      workflow_step_run: {
        Row: {
          account_id: string
          attempt: number
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          input: Json | null
          iteration_path: number[]
          node_id: string
          output: Json | null
          run_id: string
          started_at: string
          status: Database["public"]["Enums"]["workflow_step_status"]
          waiting_on: string | null
          wake_at: string | null
        }
        Insert: {
          account_id: string
          attempt?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input?: Json | null
          iteration_path?: number[]
          node_id: string
          output?: Json | null
          run_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_step_status"]
          waiting_on?: string | null
          wake_at?: string | null
        }
        Update: {
          account_id?: string
          attempt?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input?: Json | null
          iteration_path?: number[]
          node_id?: string
          output?: Json | null
          run_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_step_status"]
          waiting_on?: string | null
          wake_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_run_run_id_account_id_fkey"
            columns: ["run_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow_run"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      workflow_trigger: {
        Row: {
          account_id: string
          event_type: string | null
          filter: Json
          id: string
          kind: Database["public"]["Enums"]["workflow_trigger_kind"]
          node_id: string
          temporal_schedule_id: string | null
          version_id: string
          workflow_id: string
        }
        Insert: {
          account_id: string
          event_type?: string | null
          filter?: Json
          id?: string
          kind: Database["public"]["Enums"]["workflow_trigger_kind"]
          node_id: string
          temporal_schedule_id?: string | null
          version_id: string
          workflow_id: string
        }
        Update: {
          account_id?: string
          event_type?: string | null
          filter?: Json
          id?: string
          kind?: Database["public"]["Enums"]["workflow_trigger_kind"]
          node_id?: string
          temporal_schedule_id?: string | null
          version_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_trigger_version_id_workflow_id_fkey"
            columns: ["version_id", "workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_version"
            referencedColumns: ["id", "workflow_id"]
          },
          {
            foreignKeyName: "workflow_trigger_workflow_id_account_id_fkey"
            columns: ["workflow_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      workflow_version: {
        Row: {
          account_id: string
          created_at: string
          graph: Json
          id: string
          published_at: string | null
          published_by: string | null
          schema_version: number
          workflow_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          graph: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          schema_version: number
          workflow_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          graph?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          schema_version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_version_workflow_id_account_id_fkey"
            columns: ["workflow_id", "account_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
    }
    Views: {
      activity_pool_public: {
        Row: {
          created_quarter: string | null
          industry_short: string | null
          median_asking_price: number | null
          median_loi_price: number | null
          n: number | null
          naics3: string | null
          outcome: string | null
          region: string | null
        }
        Relationships: []
      }
      comp_external: {
        Row: {
          asking_price: number | null
          close_date: string | null
          created_at: string | null
          ebitda: number | null
          id: string | null
          industry: string | null
          multiple_ebitda: number | null
          multiple_revenue: number | null
          multiple_sde: number | null
          naics_code: string | null
          region: string | null
          revenue: number | null
          sale_price: number | null
          sde: number | null
          source: string | null
          source_ref: string | null
          state: string | null
        }
        Insert: {
          asking_price?: number | null
          close_date?: string | null
          created_at?: string | null
          ebitda?: number | null
          id?: string | null
          industry?: string | null
          multiple_ebitda?: number | null
          multiple_revenue?: number | null
          multiple_sde?: number | null
          naics_code?: string | null
          region?: string | null
          revenue?: number | null
          sale_price?: number | null
          sde?: number | null
          source?: string | null
          source_ref?: string | null
          state?: string | null
        }
        Update: {
          asking_price?: number | null
          close_date?: string | null
          created_at?: string | null
          ebitda?: number | null
          id?: string | null
          industry?: string | null
          multiple_ebitda?: number | null
          multiple_revenue?: number | null
          multiple_sde?: number | null
          naics_code?: string | null
          region?: string | null
          revenue?: number | null
          sale_price?: number | null
          sde?: number | null
          source?: string | null
          source_ref?: string | null
          state?: string | null
        }
        Relationships: []
      }
      comp_pool_public: {
        Row: {
          close_quarter: string | null
          industry_short: string | null
          median_sale_price: number | null
          median_sde_multiple: number | null
          n: number | null
          naics3: string | null
          region: string | null
        }
        Relationships: []
      }
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
      add_default_deal_folders: {
        Args: { p_deal_ids: string[] }
        Returns: undefined
      }
      add_invitations_to_account: {
        Args: {
          account_slug: string
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
      ai_cap_reached: { Args: { p_account_id: string }; Returns: boolean }
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
      apa_counsel_ready: { Args: { deal_id: string }; Returns: boolean }
      apa_stage_gated: {
        Args: { account_id: string; stage: string }
        Returns: boolean
      }
      append_deal_event: {
        Args: {
          p_actor_kind?: Database["public"]["Enums"]["event_actor_kind"]
          p_actor_via?: string
          p_aggregate_id: string
          p_aggregate_type: string
          p_deal_id: string
          p_event_type: string
          p_expected_aggregate_seq?: number
          p_payload?: Json
        }
        Returns: {
          aggregate_seq: number
          deal_seq: number
        }[]
      }
      append_deal_events: {
        Args: { p_deal_id: string; p_events: Json }
        Returns: {
          aggregate_seq: number
          deal_seq: number
        }[]
      }
      assign_personal_todo: {
        Args: { assignee_id: string; todo_id: string }
        Returns: undefined
      }
      authored_deal_update: {
        Args: { update_id: string }
        Returns: {
          account_id: string
          author_id: string | null
          body: string
          created_at: string
          deal_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          picks: Json
          status: Database["public"]["Enums"]["deal_update_status"]
          subject: string
          submitted_at: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "deal_update"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backfill_deal_defaults: { Args: never; Returns: undefined }
      buyer_counsel_documents: {
        Args: { deal_id: string }
        Returns: {
          account_id: string
          created_at: string | null
          deal_id: string
          folder_id: string
          id: string
          name: string
          removed_at: string | null
          storage_path: string
          updated_at: string | null
          uploaded_by: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "dr_document"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buyer_counsel_folders: {
        Args: { deal_id: string }
        Returns: {
          account_id: string
          created_at: string | null
          deal_id: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dr_folder"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buyer_counsel_legacy_seller_questions: {
        Args: { deal_id: string }
        Returns: {
          answer: string
          answered_at: string
          id: string
          question: string
        }[]
      }
      buyer_counsel_seller_question_files: {
        Args: { deal_id: string }
        Returns: {
          dr_document_id: string
          name: string
          question_id: string
        }[]
      }
      buyer_counsel_seller_question_messages: {
        Args: { deal_id: string }
        Returns: {
          body: string
          created_at: string
          question_id: string
          side: Database["public"]["Enums"]["seller_side"]
        }[]
      }
      buyer_counsel_seller_questions: {
        Args: { deal_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["seller_room_question_status"]
          title: string
        }[]
      }
      calc_citation_refusal: {
        Args: { calc_version_id: string }
        Returns: string
      }
      calc_input_citations: {
        Args: { calc_version_id: string }
        Returns: {
          cell: string
          document_name: string
          document_removed: boolean
          document_version: number
          dr_document_id: string
          id: string
          input_key: string
          newer_version_uploaded: boolean
          page: number
          row_id: string
          sheet: string
        }[]
      }
      can_action_account_member: {
        Args: { target_team_account_id: string; target_user_id: string }
        Returns: boolean
      }
      can_ask_in_seller_room: { Args: { room_id: string }; Returns: boolean }
      can_edit_calc_version: {
        Args: { calc_version_id: string }
        Returns: boolean
      }
      can_manage_lender_room: { Args: { room_id: string }; Returns: boolean }
      can_manage_seller_room: { Args: { room_id: string }; Returns: boolean }
      can_route_lender_ask_to_seller: {
        Args: { lender_ask_id: string; question_id: string }
        Returns: boolean
      }
      can_work_lender_room: { Args: { room_id: string }; Returns: boolean }
      check_checklist_item_event: {
        Args: { p_account_id: string; p_deal_id: string; p_payload: Json }
        Returns: undefined
      }
      check_contract_event: {
        Args: {
          p_aggregate_id: string
          p_deal_id: string
          p_event_type: string
          p_payload: Json
        }
        Returns: undefined
      }
      check_deal_close_deadline_event: {
        Args: { p_event_type: string; p_payload: Json }
        Returns: undefined
      }
      check_dr_document_event: {
        Args: {
          p_actor_ref: string
          p_aggregate_id: string
          p_deal_id: string
          p_event_type: string
          p_payload: Json
        }
        Returns: undefined
      }
      checklist_anchor_dates: {
        Args: {
          p_deal_id: string
          p_due_offset_days: number
          p_kind: string
          p_review_offset_days: number
        }
        Returns: {
          due_at: string
          review_due_at: string
        }[]
      }
      claim_checklist_template_application: {
        Args: { p_deal_id: string; p_template_id: string }
        Returns: boolean
      }
      close_date: {
        Args: { "": Database["public"]["Tables"]["deal"]["Row"] }
        Returns: {
          error: true
        } & "the function public.close_date with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      code_name_contains_business_name: {
        Args: { business_name: string; code_name: string }
        Returns: boolean
      }
      consume_mfa_recovery_code: { Args: { p_code: string }; Returns: string }
      contract_comment_authors: {
        Args: { contract_version_ids: string[] }
        Returns: {
          author_name: string
          author_role: string
          comment_id: string
        }[]
      }
      contract_comment_thread_started_at: {
        Args: { comment_id: string }
        Returns: string
      }
      contract_event_changes_status: {
        Args: { p_contract_id: string; p_event_type: string; p_payload: Json }
        Returns: boolean
      }
      contract_review_required: {
        Args: { contract_type: string; deal_id: string }
        Returns: boolean
      }
      contract_review_team_required: {
        Args: { account_id: string; contract_type: string }
        Returns: boolean
      }
      contract_version_signing_ready: {
        Args: { contract_version_id: string }
        Returns: boolean
      }
      counsel_main_contacts: {
        Args: { deal_id: string }
        Returns: {
          company: string
          email: string
          name: string
          phone: string
          role: string
          side: Database["public"]["Enums"]["deal_side"]
        }[]
      }
      counsel_thread: {
        Args: {
          deal_id: string
          side: Database["public"]["Enums"]["counsel_side"]
        }
        Returns: {
          author_name: string
          body: string
          created_at: string
          from_team: boolean
          id: string
        }[]
      }
      counsel_timeline: {
        Args: { deal_id: string }
        Returns: {
          actual_on: string
          kind: Database["public"]["Enums"]["milestone_kind"]
          label: string
          target_on: string
        }[]
      }
      counsel_updates: {
        Args: { deal_id: string }
        Returns: {
          body: string
          sent_at: string
          subject: string
        }[]
      }
      create_deal_update: {
        Args: { body: string; deal_id: string; picks: Json; subject: string }
        Returns: string
      }
      create_diligence_schedule: {
        Args: {
          p_created_by?: string
          p_deal_id: string
          p_start_date: string
          p_template_id?: string
        }
        Returns: {
          created: boolean
          schedule_id: string
        }[]
      }
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
          last_team_account_id: string | null
          legal_entity_name: string | null
          name: string
          onboarded: boolean
          phone: string | null
          phone_asked_at: string | null
          picture_url: string | null
          primary_owner_user_id: string
          public_data: Json
          renamed_at: string | null
          sample_deals_seeded_at: string | null
          slug: string | null
          team_phone: string | null
          timezone: string | null
          trial_drip_started_at: string | null
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
      deal_aggregate_state: {
        Args: { p_aggregate_id: string; p_aggregate_type: string }
        Returns: Json
      }
      deal_event_permission: {
        Args: { p_aggregate_type: string; p_event_type: string }
        Returns: string
      }
      deal_loi_signed: { Args: { deal_id: string }; Returns: boolean }
      deal_main_contact_cards: {
        Args: { deal_id: string }
        Returns: {
          company: string
          email: string
          lender_room_id: string
          name: string
          phone: string
          role: string
          side: Database["public"]["Enums"]["deal_side"]
        }[]
      }
      deal_people: {
        Args: { deal_id: string }
        Returns: {
          email: string
          entries: Database["public"]["CompositeTypes"]["deal_person_entry"][]
          name: string
          user_id: string
        }[]
      }
      deal_side_of_email: {
        Args: { deal_id: string; email: string }
        Returns: Database["public"]["Enums"]["deal_side"][]
      }
      deal_updates_sent_to_me: {
        Args: { deal_id: string }
        Returns: {
          body: string
          sent_at: string
          subject: string
        }[]
      }
      deal_wide_manifest: { Args: { p_deal_id: string }; Returns: Json }
      decide_deal_update: {
        Args: {
          decision: Database["public"]["Enums"]["deal_update_decision"]
          expected_version: number
          note?: string
          update_id: string
        }
        Returns: undefined
      }
      decide_firm_verdict: {
        Args: {
          p_approved: boolean
          p_reason?: string
          p_step_run_id: string
          p_verdict_id: string
        }
        Returns: undefined
      }
      disconnect_llm_endpoint: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      dr_folder_count_below: { Args: { folder_id: string }; Returns: number }
      edit_deal_update: {
        Args: { body: string; picks: Json; subject: string; update_id: string }
        Returns: undefined
      }
      ensure_counsel_uploads_folder: {
        Args: { deal_id: string }
        Returns: string
      }
      ensure_seller_room: { Args: { deal_id: string }; Returns: string }
      expire_superseded_live_offers: { Args: never; Returns: undefined }
      firm_outreach_approved: { Args: { p_firm_id: string }; Returns: boolean }
      get_config: { Args: never; Returns: Json }
      get_upper_system_role: { Args: never; Returns: string }
      grant_workflow_loop_items: {
        Args: {
          p_context: Json
          p_items: Json
          p_root_node_id: string
          p_step_run_id: string
        }
        Returns: Json
      }
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
      is_account_locked: {
        Args: { target_account_id: string }
        Returns: boolean
      }
      is_account_owner: { Args: { account_id: string }; Returns: boolean }
      is_deal_counsel: {
        Args: {
          deal_id: string
          side: Database["public"]["Enums"]["counsel_side"]
        }
        Returns: boolean
      }
      is_deal_seller: { Args: { deal_id: string }; Returns: boolean }
      is_deal_seller_counsel_reader: {
        Args: { deal_id: string }
        Returns: boolean
      }
      is_deal_seller_room_member: {
        Args: { deal_id: string }
        Returns: boolean
      }
      is_deal_seller_side: { Args: { deal_id: string }; Returns: boolean }
      is_known_timezone: { Args: { name: string }; Returns: boolean }
      is_lender_folder: { Args: { folder_id: string }; Returns: boolean }
      is_lender_room_member: { Args: { room_id: string }; Returns: boolean }
      is_mfa_compliant: { Args: never; Returns: boolean }
      is_seller_counsel_document: {
        Args: { document_id: string }
        Returns: boolean
      }
      is_seller_counsel_folder: {
        Args: { folder_id: string }
        Returns: boolean
      }
      is_seller_counsel_object: { Args: { name: string }; Returns: boolean }
      is_seller_request_event: {
        Args: { p_event_type: string; p_payload: Json }
        Returns: boolean
      }
      is_seller_room_member: { Args: { room_id: string }; Returns: boolean }
      is_set: { Args: { field_name: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_team_member: {
        Args: { account_id: string; user_id: string }
        Returns: boolean
      }
      is_trial_active: { Args: { p_account_id: string }; Returns: boolean }
      is_user_super_admin: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      lender_can_read_document: {
        Args: { document_id: string }
        Returns: boolean
      }
      lender_can_read_folder: { Args: { folder_id: string }; Returns: boolean }
      lender_deal_faq_search: {
        Args: { deal_id: string; query: string }
        Returns: {
          id: string
          question: string
        }[]
      }
      lender_document_recipients: {
        Args: { document_id: string }
        Returns: {
          email: string
          room_id: string
          user_id: string
        }[]
      }
      lender_faq_recipients: {
        Args: { entry_id: string }
        Returns: {
          email: string
          room_id: string
          user_id: string
        }[]
      }
      lender_form_signature_status: {
        Args: { ask_id: string }
        Returns: {
          created_at: string
          id: string
          status: Database["public"]["Enums"]["lender_signature_status"]
        }[]
      }
      lender_history: {
        Args: { lender_id: string }
        Returns: {
          asks_count: number
          deal_id: string
          deal_name: string
          room_created_at: string
          room_id: string
          status: Database["public"]["Enums"]["lender_room_status"]
        }[]
      }
      lender_open_room_deal_ids: { Args: never; Returns: string[] }
      lender_package_folder_count: {
        Args: { deal_id: string }
        Returns: number
      }
      lender_person_visible_user_ids: { Args: never; Returns: string[] }
      lender_rate_limit_pass: {
        Args: { key: string; window_seconds: number }
        Returns: boolean
      }
      lender_room_deadline: {
        Args: { deal_id: string }
        Returns: {
          must_close_by: string
          must_close_reason: string
        }[]
      }
      lender_room_faq: {
        Args: { query?: string; room_id: string }
        Returns: {
          answer: string
          files: Json
          first_published_at: string
          id: string
          pinned: boolean
          question: string
          updated_at: string
        }[]
      }
      lender_room_folder_count: { Args: { room_id: string }; Returns: number }
      lender_room_is_open: {
        Args: { room: Database["public"]["Tables"]["lender_room"]["Row"] }
        Returns: boolean
      }
      lender_room_main_contacts: {
        Args: { room_id: string }
        Returns: {
          company: string
          email: string
          name: string
          phone: string
          role: string
          side: Database["public"]["Enums"]["deal_side"]
        }[]
      }
      lender_room_outreach_sent: {
        Args: { p_room_id: string }
        Returns: boolean
      }
      lender_room_people: {
        Args: { room_id: string }
        Returns: {
          email: string
          name: string
          user_id: string
        }[]
      }
      lender_room_shows_document: {
        Args: { document_id: string; room_id: string }
        Returns: boolean
      }
      lender_room_shows_document_unchecked: {
        Args: { document_id: string; room_id: string }
        Returns: boolean
      }
      lender_room_shows_faq_entry_unchecked: {
        Args: { entry_id: string; room_id: string }
        Returns: boolean
      }
      lender_room_shows_faq_file: {
        Args: { file_id: string; room_id: string }
        Returns: boolean
      }
      lender_room_shows_folder: {
        Args: { folder_id: string; room_id: string }
        Returns: boolean
      }
      lender_room_shows_folder_unchecked: {
        Args: { folder_id: string; room_id: string }
        Returns: boolean
      }
      lender_room_terms_sought: {
        Args: { deal_id: string }
        Returns: {
          loan_amount: number
          loan_type: string
          seller_note_amount: number
          term_years: number
        }[]
      }
      lender_room_timeline: {
        Args: { room_id: string }
        Returns: {
          actual_on: string
          kind: Database["public"]["Enums"]["milestone_kind"]
          label: string
          target_on: string
        }[]
      }
      lender_room_updates: {
        Args: { room_id: string }
        Returns: {
          body: string
          sent_at: string
          subject: string
        }[]
      }
      lender_room_view: {
        Args: { room_id: string }
        Returns: Database["public"]["CompositeTypes"]["lender_room_summary"][]
        SetofOptions: {
          from: "*"
          to: "lender_room_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lender_rooms_due_nudge: {
        Args: { p_account_id: string; p_as_of?: string }
        Returns: {
          days_silent: number
          deal_id: string
          deal_name: string
          due_since: string
          last_heard_at: string
          lender_id: string
          room_id: string
        }[]
      }
      lender_visible_documents: {
        Args: { document_ids: string[]; user_id: string }
        Returns: {
          document_id: string
          folder_id: string
          name: string
          room_id: string
          room_name: string
        }[]
      }
      lender_visible_faq_entries: {
        Args: { entry_ids: string[]; user_id: string }
        Returns: {
          entry_id: string
          question: string
          room_id: string
          room_name: string
        }[]
      }
      llm_endpoint_api_key: { Args: { p_account_id: string }; Returns: string }
      lookup_cap_reached: { Args: { p_account_id: string }; Returns: boolean }
      main_contact_on_side: {
        Args: {
          deal_id: string
          lender_room_id: string
          side: Database["public"]["Enums"]["deal_side"]
          user_id: string
        }
        Returns: boolean
      }
      manages_deal_in_account: {
        Args: { account_id: string; deal_id: string }
        Returns: boolean
      }
      mark_all_notifications_read: {
        Args: { target_account_id: string }
        Returns: undefined
      }
      match_document_chunks: {
        Args: { p_deal_id: string; p_embedding: string; p_match_count: number }
        Returns: {
          content: string
          distance: number
          id: string
        }[]
      }
      mfa_recovery_codes_status: {
        Args: never
        Returns: {
          last_generated_at: string
          total: number
          unused: number
        }[]
      }
      my_lender_room_list: {
        Args: never
        Returns: {
          last_activity_at: string
          new_count: number
          room: Database["public"]["CompositeTypes"]["lender_room_summary"]
          your_turn_count: number
        }[]
      }
      my_lender_rooms: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["lender_room_summary"][]
        SetofOptions: {
          from: "*"
          to: "lender_room_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_seller_rooms: {
        Args: never
        Returns: {
          deal_id: string
          deal_name: string
          id: string
          is_open: boolean
          team_name: string
          team_picture_url: string
        }[]
      }
      next_pool_pseudonym_number: { Args: never; Returns: number }
      open_document_share: { Args: { share_id: string }; Returns: string }
      post_seller_counsel_message: {
        Args: { body: string; deal_id: string; files?: Json }
        Returns: string
      }
      project_approval: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_checklist_item: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_contract: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal_box: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal_close_deadline: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal_event: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal_financials: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal_milestone: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_deal_participant: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_dr_document: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_meeting: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_meeting_action_item: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      project_offer: {
        Args: { ev: Database["public"]["Tables"]["deal_event"]["Row"] }
        Returns: undefined
      }
      prune_workflow_step_data: { Args: never; Returns: undefined }
      reads_contracts_as_seller_side: {
        Args: { deal_id: string }
        Returns: boolean
      }
      recompute_checklist_due_dates: {
        Args: { p_deal_id: string }
        Returns: number
      }
      record_deal_update_recipients: {
        Args: { recipients: Json; update_id: string }
        Returns: undefined
      }
      record_team_home_visit: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      registry_entity_needs_fetch: {
        Args: { p_entity_number: string; p_state: string }
        Returns: boolean
      }
      replace_mfa_recovery_codes: {
        Args: { p_codes: string[] }
        Returns: undefined
      }
      replay_deal: { Args: { p_deal_id: string }; Returns: undefined }
      reserve_ai_call: {
        Args: {
          p_account_id: string
          p_deal_id?: string
          p_endpoint_id?: string
          p_firm_id?: string
          p_model: string
        }
        Returns: string
      }
      room_close_ready: {
        Args: { room_id: string; room_kind: string }
        Returns: boolean
      }
      save_llm_endpoint: {
        Args: {
          p_account_id: string
          p_api_key?: string
          p_base_url: string
          p_model: string
          p_provider: string
        }
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
      seed_default_industries: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      seed_default_pipeline_stages: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      seed_sample_deals: {
        Args: { p_account_id: string; p_only_once: boolean; p_user_id: string }
        Returns: Json
      }
      seed_starter_checklist_templates: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      seller_can_read_document: {
        Args: { document_id: string }
        Returns: boolean
      }
      seller_can_read_folder: { Args: { folder_id: string }; Returns: boolean }
      seller_counsel_folder_ids: { Args: never; Returns: string[] }
      seller_counsel_read_until: { Args: { deal_id: string }; Returns: string }
      seller_deal_header: {
        Args: { deal_id: string }
        Returns: {
          contact_name: string
          contact_phone: string
          deal_name: string
          id: string
          public_stage: string
          stage: string
          today: string
        }[]
      }
      seller_deal_owner: { Args: { deal_id: string }; Returns: string }
      seller_digest_items: {
        Args: {
          document_ids: string[]
          folder_ids: string[]
          meeting_ids: string[]
          user_id: string
        }
        Returns: {
          folder_id: string
          item_id: string
          kind: string
          name: string
          room_id: string
          scheduled_at: string
          team_name: string
        }[]
      }
      seller_document_recipients: {
        Args: { document_id: string }
        Returns: {
          email: string
          room_id: string
          user_id: string
        }[]
      }
      seller_room_comments: {
        Args: { room_id: string }
        Returns: {
          author: string
          body: string
          created_at: string
          dr_document_id: string
          id: string
          question_id: string
        }[]
      }
      seller_room_deal_ids: { Args: never; Returns: string[] }
      seller_room_documents: {
        Args: { room_id: string }
        Returns: {
          firm_name: string
          sent_at: string
          share_id: string
          template_name: string
        }[]
      }
      seller_room_id_for_work: { Args: { deal_id: string }; Returns: string }
      seller_room_is_open: {
        Args: { room: Database["public"]["Tables"]["seller_room"]["Row"] }
        Returns: boolean
      }
      seller_room_legacy_questions: {
        Args: { room_id: string }
        Returns: {
          answer: string
          answered_at: string
          id: string
          question: string
        }[]
      }
      seller_room_main_contacts: {
        Args: { room_id: string }
        Returns: {
          company: string
          email: string
          name: string
          phone: string
          role: string
          side: Database["public"]["Enums"]["deal_side"]
        }[]
      }
      seller_room_meetings: {
        Args: { room_id: string }
        Returns: {
          id: string
          scheduled_at: string
          summary: string
          transcript_text: string
          type: string
        }[]
      }
      seller_room_names: {
        Args: { deal_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
        }[]
      }
      seller_room_shows_document: {
        Args: { document_id: string; room_id: string }
        Returns: boolean
      }
      seller_room_shows_folder_unchecked: {
        Args: { folder_id: string; room_id: string }
        Returns: boolean
      }
      seller_room_timeline: {
        Args: { room_id: string }
        Returns: {
          actual_on: string
          kind: Database["public"]["Enums"]["milestone_kind"]
          label: string
          target_on: string
        }[]
      }
      seller_room_updates: {
        Args: { room_id: string }
        Returns: {
          body: string
          sent_at: string
          subject: string
        }[]
      }
      seller_room_view: {
        Args: { room_id: string }
        Returns: {
          deal_id: string
          deal_name: string
          id: string
          is_open: boolean
          team_name: string
          team_picture_url: string
          uploads_folder_id: string
          welcome_note: string
        }[]
      }
      seller_send_allowance: {
        Args: { p_account_id: string }
        Returns: {
          daily_limit: number
          retry_after: string
          sent: number
        }[]
      }
      seller_side_contract_version: {
        Args: { contract_version_id: string }
        Returns: {
          account_id: string
          deal_id: string
          shown_since: string
        }[]
      }
      seller_side_contract_versions: {
        Args: { deal_id: string }
        Returns: {
          change_summary: string
          contract_id: string
          id: string
          is_signed: boolean
          party: string
          shown_at: string
          version: number
        }[]
      }
      seller_side_contracts: {
        Args: { deal_id: string }
        Returns: {
          current_version: number
          id: string
          type: string
        }[]
      }
      seller_side_read_only_reason: {
        Args: { deal_id: string }
        Returns: string
      }
      seller_side_reads_contract_comment: {
        Args: {
          comment_id: string
          contract_version_id: string
          created_at: string
        }
        Returns: boolean
      }
      seller_stage: { Args: { stage: string }; Returns: string }
      seller_waiting_items: {
        Args: { deal_id: string }
        Returns: {
          due_at: string
          title: string
        }[]
      }
      set_default_checklist_template: {
        Args: { template_id: string }
        Returns: undefined
      }
      set_lender_contact_primary: {
        Args: { contact_id: string }
        Returns: undefined
      }
      set_team_account_billing: {
        Args: { enabled: boolean }
        Returns: undefined
      }
      set_team_rename_limit: {
        Args: { rename_limit: Database["public"]["Enums"]["team_rename_limit"] }
        Returns: undefined
      }
      settled_trigger_events: {
        Args: {
          p_after_seq: number
          p_after_xid: unknown
          p_event_types: string[]
          p_limit: number
          p_log: string
        }
        Returns: {
          account_id: string
          deal_id: string
          event_type: string
          global_seq: number
          payload: Json
          xid: string
        }[]
      }
      shared_deal_timeline: {
        Args: { deal_id: string }
        Returns: {
          actual_on: string
          created_at: string
          kind: Database["public"]["Enums"]["milestone_kind"]
          label: string
          target_on: string
        }[]
      }
      start_workflow_step_run: {
        Args: {
          p_account_id: string
          p_idempotency_key: string
          p_input: Json
          p_iteration_path: number[]
          p_node_id: string
          p_run_id: string
        }
        Returns: {
          attempt: number
          id: string
          output: Json
          started_at: string
          status: Database["public"]["Enums"]["workflow_step_status"]
          waiting_on: string
          wake_at: string
        }[]
      }
      storage_object_team_locked: {
        Args: { bucket: string; object_name: string }
        Returns: boolean
      }
      submit_deal_update: { Args: { update_id: string }; Returns: undefined }
      super_admin_state: {
        Args: never
        Returns: {
          has_role: boolean
          is_super_admin: boolean
        }[]
      }
      team_account_current_slug: {
        Args: { former_slug: string }
        Returns: string
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
      team_agenda: {
        Args: { p_account_id: string; p_as_of?: string; p_whole_team: boolean }
        Returns: {
          at: string
          deal_id: string
          deal_name: string
          detail: string
          item_id: string
          kind: string
          room_id: string
          section: string
          title: string
        }[]
      }
      team_billing_standing: {
        Args: { target_account_id: string }
        Returns: Database["public"]["Enums"]["billing_standing"]
      }
      team_home_new_since: { Args: { p_account_id: string }; Returns: string }
      team_lender_contacts: {
        Args: { account_id: string }
        Returns: {
          brand_logo_path: string
          brand_name: string
          deal_description: string
          deal_id: string
          deal_name: string
          downloads: number
          email: string
          files_viewed: number
          first_visit_at: string
          forms_out_for_signature: number
          has_signed_in: boolean
          invited_at: string
          invited_by: string
          invited_by_email: string
          invited_by_name: string
          last_visit_at: string
          name: string
          removed_at: string
          requests_opened: number
          requests_waiting_on_lender: number
          requests_waiting_on_team: number
          room_id: string
          room_name: string
          room_status: Database["public"]["Enums"]["lender_room_status"]
          user_id: string
        }[]
      }
      team_lender_rooms: {
        Args: { account_id: string }
        Returns: {
          brand_domain: string
          brand_logo_path: string
          brand_name: string
          closed_at: string
          deal_description: string
          deal_id: string
          deal_name: string
          expires_at: string
          is_open: boolean
          last_lender_action_at: string
          last_lender_activity_at: string
          member_count: number
          requests_waiting_on_team: number
          room_id: string
          room_name: string
          status: Database["public"]["Enums"]["lender_room_status"]
        }[]
      }
      team_people_names: { Args: { p_account_id: string }; Returns: string[] }
      team_rename_allowed_at: {
        Args: { last_renamed_at: string }
        Returns: string
      }
      transfer_team_account_ownership: {
        Args: { new_owner_id: string; target_account_id: string }
        Returns: undefined
      }
      trigger_event_horizon: { Args: never; Returns: string }
      update_deal_profile: {
        Args: { p_business_name: string; p_deal_id: string; p_payload: Json }
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
      verification_finding_counts: {
        Args: { p_deal_id: string }
        Returns: {
          error: number
          info: number
          warning: number
        }[]
      }
      verify_agent_key: {
        Args: { prefix: string; raw: string }
        Returns: string
      }
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
      withdraw_deal_update: { Args: { update_id: string }; Returns: undefined }
    }
    Enums: {
      activity_confidence: "listed" | "screened" | "verified"
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
        | "api_keys.manage"
        | "deal_updates.approve"
        | "workflows.manage"
        | "deals.work"
      approval_decision: "approved" | "declined"
      approval_subject:
        | "stage_move"
        | "loi"
        | "apa"
        | "schedule"
        | "participant_change"
      billing_provider: "stripe" | "lemon-squeezy" | "paddle"
      billing_standing: "good" | "past_due" | "locked"
      broker_intake_status: "new" | "accepted" | "rejected"
      checklist_outcome: "accepted" | "follow_up" | "rejected"
      checklist_status: "not_started" | "requested" | "received" | "reviewed"
      comp_data_class: "external" | "proprietary" | "internal"
      comp_license_status: "active" | "expired" | "revoked"
      contract_review_verdict:
        | "approved"
        | "changes_needed"
        | "approved_with_comments"
      counsel_activity_action: "document_previewed" | "document_downloaded"
      counsel_side: "buyer" | "seller"
      deal_person_role: "principal" | "attorney" | "broker" | "cpa" | "other"
      deal_side: "buyer" | "seller" | "lender"
      deal_source: "manual" | "broker" | "outreach" | "marketplace" | "referral"
      deal_update_decision: "approved" | "rejected"
      deal_update_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "withdrawn"
      deal_worksheet_type:
        | "margin_analysis"
        | "retention_plan"
        | "process_sop"
        | "marketing_effectiveness"
      discovery_counterparty_type: "owner" | "broker"
      discovery_financing_stance: "yes" | "no" | "unsure"
      discovery_owner_dependency: "low" | "medium" | "high"
      discovery_priority:
        | "price"
        | "speed"
        | "legacy"
        | "employees"
        | "brand"
        | "reputation"
      discovery_reason_for_selling:
        | "retirement"
        | "burnout"
        | "new_venture"
        | "health"
        | "partnership_dissolution"
        | "financial"
        | "other"
      discovery_revenue_trend: "up" | "down" | "flat"
      embedding_job_status: "queued" | "running" | "done" | "failed"
      event_actor_kind: "user" | "service" | "api_key" | "system"
      lead_import_status: "running" | "succeeded" | "failed"
      lead_source: "ppp" | "sba_7a" | "sba_504" | "form_5500" | "state_registry"
      lender_activity_action:
        | "room_opened"
        | "folder_opened"
        | "document_previewed"
        | "document_downloaded"
        | "zip_downloaded"
        | "folder_created"
        | "faq_page_opened"
        | "faq_entry_opened"
        | "faq_file_previewed"
        | "faq_file_downloaded"
        | "faq_suggestion_opened"
        | "faq_suggestion_resolved"
        | "request_sent_after_suggestion"
      lender_ask_file_role:
        | "attachment"
        | "fulfilment"
        | "blank_form"
        | "completed_form"
        | "signed_form"
      lender_ask_kind: "ask" | "form"
      lender_ask_status: "open" | "answered" | "closed" | "withdrawn"
      lender_faq_status: "draft" | "published" | "unpublished"
      lender_outreach_kind: "outreach" | "nudge"
      lender_outreach_status: "sending" | "sent" | "failed"
      lender_rate_type: "fixed" | "variable" | "either"
      lender_return_route: "upload" | "esign"
      lender_room_status:
        | "invited"
        | "reviewing"
        | "term_sheet"
        | "declined"
        | "selected"
      lender_side: "lender" | "internal"
      lender_signature_status:
        | "draft"
        | "sent"
        | "completed"
        | "declined"
        | "expired"
        | "cancelled"
      lender_timeline_answer: "yes" | "no" | "need_to_talk"
      letter_status:
        | "queued"
        | "created"
        | "mailed"
        | "in_transit"
        | "delivered"
        | "returned"
        | "failed"
      match_review_status: "pending" | "accepted" | "rejected"
      meeting_status: "scheduled" | "held" | "skipped" | "cancelled"
      milestone_kind:
        | "loi_deadline"
        | "loi_signed"
        | "diligence_end"
        | "financing_contingency"
        | "apa_signing"
        | "closing"
        | "effective"
        | "custom"
      notification_channel: "in_app" | "email"
      notification_type: "info" | "warning" | "error"
      outreach_channel: "email" | "letter"
      paid_lookup_outcome: "found" | "not_found" | "failed"
      participant_party: "buyer" | "seller" | "broker" | "lender"
      participant_permission: "view" | "comment" | "suggest" | "edit" | "sign"
      participant_scope: "deal" | "contract" | "data_room_folder" | "checklist"
      payment_status: "pending" | "succeeded" | "failed"
      provider_kind: "email_lookup" | "registry" | "letters"
      registry_source: "api" | "bulk_file"
      seller_activity_action:
        | "room_opened"
        | "folder_opened"
        | "document_previewed"
        | "document_downloaded"
        | "zip_downloaded"
        | "document_uploaded"
        | "meeting_opened"
        | "question_answered"
        | "folder_created"
      seller_counsel_author_side: "seller" | "counsel"
      seller_room_question_status: "open" | "answered" | "closed" | "withdrawn"
      seller_side: "seller" | "internal"
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
      team_rename_limit: "monthly" | "off"
      upload_batch_kind: "single" | "group" | "zip"
      upload_batch_status:
        | "pending"
        | "extracting"
        | "ready"
        | "imported"
        | "failed"
      upload_item_status: "pending" | "imported" | "failed"
      value_marker_category:
        | "financial_viability"
        | "diversification"
        | "employee_risk"
        | "cashflow_quality"
        | "competitive_advantage"
        | "customer_satisfaction"
        | "recurring_revenue"
        | "owner_dependency"
        | "upside_potential"
        | "process_maturity"
      value_marker_rating: "looks_good" | "somewhat_risky" | "not_good"
      verification_finding_status: "open" | "resolved" | "dismissed"
      verification_run_status: "queued" | "running" | "done" | "failed"
      verification_severity: "info" | "warning" | "error"
      workflow_log_level: "info" | "warn" | "error"
      workflow_run_status:
        | "running"
        | "waiting"
        | "awaiting_approval"
        | "paused_locked"
        | "paused_cap"
        | "succeeded"
        | "failed"
        | "cancelled"
      workflow_step_status:
        | "running"
        | "waiting"
        | "succeeded"
        | "failed"
        | "cancelled"
      workflow_trigger_kind: "schedule" | "event" | "manual"
    }
    CompositeTypes: {
      deal_person_entry: {
        source: string | null
        contact_id: string | null
        name: string | null
        phone: string | null
        company: string | null
        side: Database["public"]["Enums"]["deal_side"] | null
        role: string | null
        lender_room_id: string | null
        room_closed: boolean | null
        is_main: boolean | null
      }
      invitation: {
        email: string | null
        role: string | null
      }
      lender_room_summary: {
        id: string | null
        deal_id: string | null
        name: string | null
        welcome_note: string | null
        expires_at: string | null
        is_open: boolean | null
        private_folder_id: string | null
        master_folder_id: string | null
        brand_name: string | null
        brand_logo_path: string | null
        deal_name: string | null
        target_close_date: string | null
        must_close_by: string | null
        must_close_reason: string | null
        buyer_team: string | null
        loan_amount: number | null
        loan_type: string | null
        term_years: number | null
        seller_note_amount: number | null
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
      activity_confidence: ["listed", "screened", "verified"],
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
        "api_keys.manage",
        "deal_updates.approve",
        "workflows.manage",
        "deals.work",
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
      billing_standing: ["good", "past_due", "locked"],
      broker_intake_status: ["new", "accepted", "rejected"],
      checklist_outcome: ["accepted", "follow_up", "rejected"],
      checklist_status: ["not_started", "requested", "received", "reviewed"],
      comp_data_class: ["external", "proprietary", "internal"],
      comp_license_status: ["active", "expired", "revoked"],
      contract_review_verdict: [
        "approved",
        "changes_needed",
        "approved_with_comments",
      ],
      counsel_activity_action: ["document_previewed", "document_downloaded"],
      counsel_side: ["buyer", "seller"],
      deal_person_role: ["principal", "attorney", "broker", "cpa", "other"],
      deal_side: ["buyer", "seller", "lender"],
      deal_source: ["manual", "broker", "outreach", "marketplace", "referral"],
      deal_update_decision: ["approved", "rejected"],
      deal_update_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ],
      deal_worksheet_type: [
        "margin_analysis",
        "retention_plan",
        "process_sop",
        "marketing_effectiveness",
      ],
      discovery_counterparty_type: ["owner", "broker"],
      discovery_financing_stance: ["yes", "no", "unsure"],
      discovery_owner_dependency: ["low", "medium", "high"],
      discovery_priority: [
        "price",
        "speed",
        "legacy",
        "employees",
        "brand",
        "reputation",
      ],
      discovery_reason_for_selling: [
        "retirement",
        "burnout",
        "new_venture",
        "health",
        "partnership_dissolution",
        "financial",
        "other",
      ],
      discovery_revenue_trend: ["up", "down", "flat"],
      embedding_job_status: ["queued", "running", "done", "failed"],
      event_actor_kind: ["user", "service", "api_key", "system"],
      lead_import_status: ["running", "succeeded", "failed"],
      lead_source: ["ppp", "sba_7a", "sba_504", "form_5500", "state_registry"],
      lender_activity_action: [
        "room_opened",
        "folder_opened",
        "document_previewed",
        "document_downloaded",
        "zip_downloaded",
        "folder_created",
        "faq_page_opened",
        "faq_entry_opened",
        "faq_file_previewed",
        "faq_file_downloaded",
        "faq_suggestion_opened",
        "faq_suggestion_resolved",
        "request_sent_after_suggestion",
      ],
      lender_ask_file_role: [
        "attachment",
        "fulfilment",
        "blank_form",
        "completed_form",
        "signed_form",
      ],
      lender_ask_kind: ["ask", "form"],
      lender_ask_status: ["open", "answered", "closed", "withdrawn"],
      lender_faq_status: ["draft", "published", "unpublished"],
      lender_outreach_kind: ["outreach", "nudge"],
      lender_outreach_status: ["sending", "sent", "failed"],
      lender_rate_type: ["fixed", "variable", "either"],
      lender_return_route: ["upload", "esign"],
      lender_room_status: [
        "invited",
        "reviewing",
        "term_sheet",
        "declined",
        "selected",
      ],
      lender_side: ["lender", "internal"],
      lender_signature_status: [
        "draft",
        "sent",
        "completed",
        "declined",
        "expired",
        "cancelled",
      ],
      lender_timeline_answer: ["yes", "no", "need_to_talk"],
      letter_status: [
        "queued",
        "created",
        "mailed",
        "in_transit",
        "delivered",
        "returned",
        "failed",
      ],
      match_review_status: ["pending", "accepted", "rejected"],
      meeting_status: ["scheduled", "held", "skipped", "cancelled"],
      milestone_kind: [
        "loi_deadline",
        "loi_signed",
        "diligence_end",
        "financing_contingency",
        "apa_signing",
        "closing",
        "effective",
        "custom",
      ],
      notification_channel: ["in_app", "email"],
      notification_type: ["info", "warning", "error"],
      outreach_channel: ["email", "letter"],
      paid_lookup_outcome: ["found", "not_found", "failed"],
      participant_party: ["buyer", "seller", "broker", "lender"],
      participant_permission: ["view", "comment", "suggest", "edit", "sign"],
      participant_scope: ["deal", "contract", "data_room_folder", "checklist"],
      payment_status: ["pending", "succeeded", "failed"],
      provider_kind: ["email_lookup", "registry", "letters"],
      registry_source: ["api", "bulk_file"],
      seller_activity_action: [
        "room_opened",
        "folder_opened",
        "document_previewed",
        "document_downloaded",
        "zip_downloaded",
        "document_uploaded",
        "meeting_opened",
        "question_answered",
        "folder_created",
      ],
      seller_counsel_author_side: ["seller", "counsel"],
      seller_room_question_status: ["open", "answered", "closed", "withdrawn"],
      seller_side: ["seller", "internal"],
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
      team_rename_limit: ["monthly", "off"],
      upload_batch_kind: ["single", "group", "zip"],
      upload_batch_status: [
        "pending",
        "extracting",
        "ready",
        "imported",
        "failed",
      ],
      upload_item_status: ["pending", "imported", "failed"],
      value_marker_category: [
        "financial_viability",
        "diversification",
        "employee_risk",
        "cashflow_quality",
        "competitive_advantage",
        "customer_satisfaction",
        "recurring_revenue",
        "owner_dependency",
        "upside_potential",
        "process_maturity",
      ],
      value_marker_rating: ["looks_good", "somewhat_risky", "not_good"],
      verification_finding_status: ["open", "resolved", "dismissed"],
      verification_run_status: ["queued", "running", "done", "failed"],
      verification_severity: ["info", "warning", "error"],
      workflow_log_level: ["info", "warn", "error"],
      workflow_run_status: [
        "running",
        "waiting",
        "awaiting_approval",
        "paused_locked",
        "paused_cap",
        "succeeded",
        "failed",
        "cancelled",
      ],
      workflow_step_status: [
        "running",
        "waiting",
        "succeeded",
        "failed",
        "cancelled",
      ],
      workflow_trigger_kind: ["schedule", "event", "manual"],
    },
  },
} as const

