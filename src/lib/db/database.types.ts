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
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          category: Database["public"]["Enums"]["audit_event_category"] | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          category?: Database["public"]["Enums"]["audit_event_category"] | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          category?: Database["public"]["Enums"]["audit_event_category"] | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          assigned_staff_id: string | null
          created_at: string
          guest_name: string
          guest_phone: string
          id: string
          notes: string | null
          party_size: number
          requested_at: string
          seating_preference: Database["public"]["Enums"]["seating_preference"]
          session_id: string | null
          source_channel: Database["public"]["Enums"]["source_channel"]
          state: Database["public"]["Enums"]["booking_state"]
          updated_at: string
          version: number
        }
        Insert: {
          assigned_staff_id?: string | null
          created_at?: string
          guest_name: string
          guest_phone: string
          id?: string
          notes?: string | null
          party_size: number
          requested_at: string
          seating_preference?: Database["public"]["Enums"]["seating_preference"]
          session_id?: string | null
          source_channel?: Database["public"]["Enums"]["source_channel"]
          state?: Database["public"]["Enums"]["booking_state"]
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_staff_id?: string | null
          created_at?: string
          guest_name?: string
          guest_phone?: string
          id?: string
          notes?: string | null
          party_size?: number
          requested_at?: string
          seating_preference?: Database["public"]["Enums"]["seating_preference"]
          session_id?: string | null
          source_channel?: Database["public"]["Enums"]["source_channel"]
          state?: Database["public"]["Enums"]["booking_state"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hour_exceptions: {
        Row: {
          closes_at: string | null
          closes_next_day: boolean
          created_at: string
          exception_date: string
          id: string
          is_closed: boolean
          opens_at: string | null
          publish_state: Database["public"]["Enums"]["publish_state"]
          reason: string | null
          updated_at: string
          version: number
        }
        Insert: {
          closes_at?: string | null
          closes_next_day?: boolean
          created_at?: string
          exception_date: string
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          publish_state?: Database["public"]["Enums"]["publish_state"]
          reason?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          closes_at?: string | null
          closes_next_day?: boolean
          created_at?: string
          exception_date?: string
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          publish_state?: Database["public"]["Enums"]["publish_state"]
          reason?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          closes_at: string
          closes_next_day: boolean
          created_at: string
          day_of_week: number
          id: string
          opens_at: string
          publish_state: Database["public"]["Enums"]["publish_state"]
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          closes_at: string
          closes_next_day?: boolean
          created_at?: string
          day_of_week: number
          id?: string
          opens_at: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          closes_at?: string
          closes_next_day?: boolean
          created_at?: string
          day_of_week?: number
          id?: string
          opens_at?: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          created_at: string
          description: string | null
          is_sensitive: boolean
          key: string
          updated_at: string
          value: Json
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_sensitive?: boolean
          key: string
          updated_at?: string
          value: Json
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          is_sensitive?: boolean
          key?: string
          updated_at?: string
          value?: Json
          version?: number
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          menu_item_id: string
          menu_variant_id: string | null
          quantity: number
          updated_at: string
          version: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          menu_item_id: string
          menu_variant_id?: string | null
          quantity: number
          updated_at?: string
          version?: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          menu_item_id?: string
          menu_variant_id?: string | null
          quantity?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_menu_variant_id_fkey"
            columns: ["menu_variant_id"]
            isOneToOne: false
            referencedRelation: "menu_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          menu_version_id: string
          session_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          menu_version_id: string
          session_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          menu_version_id?: string
          session_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "carts_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      confirmation_tokens: {
        Row: {
          action: Database["public"]["Enums"]["confirmation_action"]
          created_at: string
          expires_at: string
          id: string
          issued_context: Json
          review_hash: string
          session_id: string
          token_hash: string
          updated_at: string
          used_at: string | null
          version: number
        }
        Insert: {
          action: Database["public"]["Enums"]["confirmation_action"]
          created_at?: string
          expires_at: string
          id?: string
          issued_context?: Json
          review_hash: string
          session_id: string
          token_hash: string
          updated_at?: string
          used_at?: string | null
          version?: number
        }
        Update: {
          action?: Database["public"]["Enums"]["confirmation_action"]
          created_at?: string
          expires_at?: string
          id?: string
          issued_context?: Json
          review_hash?: string
          session_id?: string
          token_hash?: string
          updated_at?: string
          used_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "confirmation_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_events: {
        Row: {
          category: Database["public"]["Enums"]["consent_category"]
          correlation_id: string | null
          created_at: string
          granted: boolean
          id: string
          policy_version: string
          proof: Json
          session_id: string | null
          source: string
        }
        Insert: {
          category: Database["public"]["Enums"]["consent_category"]
          correlation_id?: string | null
          created_at?: string
          granted: boolean
          id?: string
          policy_version: string
          proof?: Json
          session_id?: string | null
          source: string
        }
        Update: {
          category?: Database["public"]["Enums"]["consent_category"]
          correlation_id?: string | null
          created_at?: string
          granted?: boolean
          id?: string
          policy_version?: string
          proof?: Json
          session_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          locale: Database["public"]["Enums"]["locale_code"]
          request_count: number
          theme: string
          token_hash: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          locale?: Database["public"]["Enums"]["locale_code"]
          request_count?: number
          theme?: string
          token_hash: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          locale?: Database["public"]["Enums"]["locale_code"]
          request_count?: number
          theme?: string
          token_hash?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      event_requests: {
        Row: {
          assigned_staff_id: string | null
          created_at: string
          decor_requested: boolean
          event_type: string
          guest_count: number | null
          guest_name: string
          guest_phone: string
          id: string
          notes: string | null
          quoted_amount_pkr: number | null
          quoted_at: string | null
          quoted_by: string | null
          requested_at: string
          session_id: string | null
          source_channel: Database["public"]["Enums"]["source_channel"]
          state: Database["public"]["Enums"]["event_state"]
          updated_at: string
          version: number
        }
        Insert: {
          assigned_staff_id?: string | null
          created_at?: string
          decor_requested?: boolean
          event_type: string
          guest_count?: number | null
          guest_name: string
          guest_phone: string
          id?: string
          notes?: string | null
          quoted_amount_pkr?: number | null
          quoted_at?: string | null
          quoted_by?: string | null
          requested_at: string
          session_id?: string | null
          source_channel?: Database["public"]["Enums"]["source_channel"]
          state?: Database["public"]["Enums"]["event_state"]
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_staff_id?: string | null
          created_at?: string
          decor_requested?: boolean
          event_type?: string
          guest_count?: number | null
          guest_name?: string
          guest_phone?: string
          id?: string
          notes?: string | null
          quoted_amount_pkr?: number | null
          quoted_at?: string | null
          quoted_by?: string | null
          requested_at?: string
          session_id?: string | null
          source_channel?: Database["public"]["Enums"]["source_channel"]
          state?: Database["public"]["Enums"]["event_state"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_requests_quoted_by_fkey"
            columns: ["quoted_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_requests_quoted_by_fkey"
            columns: ["quoted_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          config: Json
          created_at: string
          environment: string
          id: string
          is_enabled: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          config?: Json
          created_at?: string
          environment: string
          id?: string
          is_enabled?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          config?: Json
          created_at?: string
          environment?: string
          id?: string
          is_enabled?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flags_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          actor_key: string
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          operation: string
          request_fingerprint: string
          result_entity_id: string | null
          result_entity_type: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["idempotency_status"]
          updated_at: string
          version: number
        }
        Insert: {
          actor_key: string
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key: string
          operation: string
          request_fingerprint: string
          result_entity_id?: string | null
          result_entity_type?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["idempotency_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          actor_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          request_fingerprint?: string
          result_entity_id?: string | null
          result_entity_type?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["idempotency_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          bytes: number | null
          checksum: string
          created_at: string
          focal_x: number | null
          focal_y: number | null
          height_px: number | null
          id: string
          is_owner_approved: boolean
          license: string | null
          media_type: string
          mime_type: string
          publish_state: Database["public"]["Enums"]["publish_state"]
          rights_holder: string
          rights_note: string | null
          storage_path: string
          updated_at: string
          version: number
          width_px: number | null
        }
        Insert: {
          bytes?: number | null
          checksum: string
          created_at?: string
          focal_x?: number | null
          focal_y?: number | null
          height_px?: number | null
          id?: string
          is_owner_approved?: boolean
          license?: string | null
          media_type: string
          mime_type: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          rights_holder: string
          rights_note?: string | null
          storage_path: string
          updated_at?: string
          version?: number
          width_px?: number | null
        }
        Update: {
          bytes?: number | null
          checksum?: string
          created_at?: string
          focal_x?: number | null
          focal_y?: number | null
          height_px?: number | null
          id?: string
          is_owner_approved?: boolean
          license?: string | null
          media_type?: string
          mime_type?: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          rights_holder?: string
          rights_note?: string | null
          storage_path?: string
          updated_at?: string
          version?: number
          width_px?: number | null
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          menu_version_id: string
          name: string
          publish_state: Database["public"]["Enums"]["publish_state"]
          sort_order: number
          stable_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          menu_version_id: string
          name: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          sort_order?: number
          stable_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          menu_version_id?: string
          name?: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          sort_order?: number
          stable_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          availability: Database["public"]["Enums"]["availability_status"]
          base_price_pkr: number | null
          category_id: string
          created_at: string
          description: string | null
          dietary_claims: string[]
          group_label: string | null
          id: string
          is_signature: boolean
          menu_version_id: string
          name: string
          publish_state: Database["public"]["Enums"]["publish_state"]
          quantity_label: string | null
          served_with: string | null
          serves: string | null
          sort_order: number
          stable_id: string
          updated_at: string
          version: number
        }
        Insert: {
          availability?: Database["public"]["Enums"]["availability_status"]
          base_price_pkr?: number | null
          category_id: string
          created_at?: string
          description?: string | null
          dietary_claims?: string[]
          group_label?: string | null
          id?: string
          is_signature?: boolean
          menu_version_id: string
          name: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          quantity_label?: string | null
          served_with?: string | null
          serves?: string | null
          sort_order?: number
          stable_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          availability?: Database["public"]["Enums"]["availability_status"]
          base_price_pkr?: number | null
          category_id?: string
          created_at?: string
          description?: string | null
          dietary_claims?: string[]
          group_label?: string | null
          id?: string
          is_signature?: boolean
          menu_version_id?: string
          name?: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          quantity_label?: string | null
          served_with?: string | null
          serves?: string | null
          sort_order?: number
          stable_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_same_version"
            columns: ["menu_version_id", "category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["menu_version_id", "id"]
          },
          {
            foreignKeyName: "menu_items_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_variants: {
        Row: {
          created_at: string
          id: string
          item_id: string
          label: string
          menu_version_id: string
          price_pkr: number
          publish_state: Database["public"]["Enums"]["publish_state"]
          sort_order: number
          stable_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          label: string
          menu_version_id: string
          price_pkr: number
          publish_state?: Database["public"]["Enums"]["publish_state"]
          sort_order?: number
          stable_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          label?: string
          menu_version_id?: string
          price_pkr?: number
          publish_state?: Database["public"]["Enums"]["publish_state"]
          sort_order?: number
          stable_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_variants_item_same_version"
            columns: ["menu_version_id", "item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["menu_version_id", "id"]
          },
          {
            foreignKeyName: "menu_variants_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          imported_at: string
          notes: string | null
          published_at: string | null
          review_status: Database["public"]["Enums"]["menu_review_status"]
          source_checksum: string
          source_references: Json
          updated_at: string
          version: number
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          imported_at?: string
          notes?: string | null
          published_at?: string | null
          review_status?: Database["public"]["Enums"]["menu_review_status"]
          source_checksum: string
          source_references?: Json
          updated_at?: string
          version?: number
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          imported_at?: string
          notes?: string | null
          published_at?: string | null
          review_status?: Database["public"]["Enums"]["menu_review_status"]
          source_checksum?: string
          source_references?: Json
          updated_at?: string
          version?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          correlation_id: string | null
          created_at: string
          delivered_at: string | null
          destination: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          event_type: string
          failed_permanently_at: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          status: Database["public"]["Enums"]["outbox_status"]
          updated_at: string
          version: number
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          destination: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          event_type: string
          failed_permanently_at?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          destination?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          event_type?: string
          failed_permanently_at?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          applies_to: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          fixed_amount_pkr: number | null
          id: string
          is_active: boolean
          name: string
          rate_basis_points: number | null
          rule_type: string
          updated_at: string
          version: number
        }
        Insert: {
          applies_to?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          effective_from: string
          effective_to?: string | null
          fixed_amount_pkr?: number | null
          id?: string
          is_active?: boolean
          name: string
          rate_basis_points?: number | null
          rule_type: string
          updated_at?: string
          version?: number
        }
        Update: {
          applies_to?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          fixed_amount_pkr?: number | null
          id?: string
          is_active?: boolean
          name?: string
          rate_basis_points?: number | null
          rule_type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          code: string | null
          conditions: Json
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          name: string
          publish_state: Database["public"]["Enums"]["publish_state"]
          starts_at: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          starts_at: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          code?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          publish_state?: Database["public"]["Enums"]["publish_state"]
          starts_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      staff_role_memberships: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_profile_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_profile_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          staff_profile_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_role_memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_role_memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_role_memberships_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_role_memberships_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
        ]
      }
      status_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          correlation_id: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          metadata: Json
          new_state: string
          previous_state: string | null
          reason_code: string | null
          reason_note: string | null
          request_version: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          correlation_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          metadata?: Json
          new_state: string
          previous_state?: string | null
          reason_code?: string | null
          reason_note?: string | null
          request_version?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          correlation_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          metadata?: Json
          new_state?: string
          previous_state?: string | null
          reason_code?: string | null
          reason_note?: string | null
          request_version?: number | null
        }
        Relationships: []
      }
      takeaway_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          line_total_pkr: number
          menu_item_id: string | null
          menu_variant_id: string | null
          quantity: number
          takeaway_request_id: string
          unit_price_pkr: number
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          line_total_pkr: number
          menu_item_id?: string | null
          menu_variant_id?: string | null
          quantity: number
          takeaway_request_id: string
          unit_price_pkr: number
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          line_total_pkr?: number
          menu_item_id?: string | null
          menu_variant_id?: string | null
          quantity?: number
          takeaway_request_id?: string
          unit_price_pkr?: number
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "takeaway_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeaway_items_menu_variant_id_fkey"
            columns: ["menu_variant_id"]
            isOneToOne: false
            referencedRelation: "menu_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeaway_items_takeaway_request_id_fkey"
            columns: ["takeaway_request_id"]
            isOneToOne: false
            referencedRelation: "takeaway_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      takeaway_requests: {
        Row: {
          adjustments_pkr: number
          assigned_staff_id: string | null
          created_at: string
          guest_name: string
          guest_phone: string
          id: string
          menu_version_id: string
          notes: string | null
          requested_collection_note: string | null
          session_id: string | null
          source_channel: Database["public"]["Enums"]["source_channel"]
          state: Database["public"]["Enums"]["takeaway_state"]
          subtotal_pkr: number
          total_pkr: number
          updated_at: string
          version: number
        }
        Insert: {
          adjustments_pkr?: number
          assigned_staff_id?: string | null
          created_at?: string
          guest_name: string
          guest_phone: string
          id?: string
          menu_version_id: string
          notes?: string | null
          requested_collection_note?: string | null
          session_id?: string | null
          source_channel?: Database["public"]["Enums"]["source_channel"]
          state?: Database["public"]["Enums"]["takeaway_state"]
          subtotal_pkr: number
          total_pkr: number
          updated_at?: string
          version?: number
        }
        Update: {
          adjustments_pkr?: number
          assigned_staff_id?: string | null
          created_at?: string
          guest_name?: string
          guest_phone?: string
          id?: string
          menu_version_id?: string
          notes?: string | null
          requested_collection_note?: string | null
          session_id?: string | null
          source_channel?: Database["public"]["Enums"]["source_channel"]
          state?: Database["public"]["Enums"]["takeaway_state"]
          subtotal_pkr?: number
          total_pkr?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeaway_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeaway_requests_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeaway_requests_menu_version_id_fkey"
            columns: ["menu_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeaway_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          is_approved: boolean
          locale: Database["public"]["Enums"]["locale_code"]
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          value: string
          version: number
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          is_approved?: boolean
          locale: Database["public"]["Enums"]["locale_code"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          value: string
          version?: number
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          is_approved?: boolean
          locale?: Database["public"]["Enums"]["locale_code"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          value?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "translations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_requiring_mfa"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempt_count: number
          correlation_id: string | null
          created_at: string
          expires_at: string
          id: string
          payload_digest: string | null
          processing_state: Database["public"]["Enums"]["webhook_processing_state"]
          provider: Database["public"]["Enums"]["webhook_provider"]
          provider_event_id: string
          received_at: string
          signature_valid: boolean
          timestamp_valid: boolean
          updated_at: string
          version: number
        }
        Insert: {
          attempt_count?: number
          correlation_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          payload_digest?: string | null
          processing_state?: Database["public"]["Enums"]["webhook_processing_state"]
          provider: Database["public"]["Enums"]["webhook_provider"]
          provider_event_id: string
          received_at?: string
          signature_valid: boolean
          timestamp_valid: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          attempt_count?: number
          correlation_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          payload_digest?: string | null
          processing_state?: Database["public"]["Enums"]["webhook_processing_state"]
          provider?: Database["public"]["Enums"]["webhook_provider"]
          provider_event_id?: string
          received_at?: string
          signature_valid?: boolean
          timestamp_valid?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      public_business_settings: {
        Row: {
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      staff_requiring_mfa: {
        Row: {
          display_name: string | null
          id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_customer_session_id: { Args: never; Returns: string }
      current_staff_id: { Args: never; Returns: string }
      idempotency_find_or_begin: {
        Args: {
          p_actor_key: string
          p_expires_at: string
          p_idempotency_key: string
          p_now: string
          p_operation: string
          p_request_fingerprint: string
        }
        Returns: {
          actor_key: string
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          operation: string
          request_fingerprint: string
          result_entity_id: string | null
          result_entity_type: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["idempotency_status"]
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "idempotency_keys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_owner_or_manager: { Args: never; Returns: boolean }
      is_published_menu_version: {
        Args: { version_id: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      purge_expired_consent_events: {
        Args: { retention_days: number }
        Returns: number
      }
      staff_has_role: {
        Args: { required: Database["public"]["Enums"]["staff_role"][] }
        Returns: boolean
      }
    }
    Enums: {
      actor_type: "GUEST" | "STAFF" | "SYSTEM"
      audit_event_category:
        | "AUTH"
        | "ADMIN"
        | "MENU_PUBLISHING"
        | "FEATURE_CHANGE"
        | "EXPORT"
        | "PII_ACCESS"
      availability_status: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN"
      booking_state:
        | "DRAFT"
        | "REQUESTED"
        | "CONFIRMED"
        | "SEATED"
        | "COMPLETED"
        | "DECLINED"
        | "CANCELLED"
        | "NO_SHOW"
      confirmation_action:
        | "TAKEAWAY_REQUEST"
        | "BOOKING_REQUEST"
        | "EVENT_REQUEST"
      consent_category:
        | "ESSENTIAL_PREFERENCES"
        | "META_MARKETING"
        | "MICROPHONE"
        | "RECORDING"
      entity_type:
        | "TAKEAWAY_REQUEST"
        | "BOOKING_REQUEST"
        | "EVENT_REQUEST"
        | "MENU_VERSION"
        | "FEATURE_FLAG"
      event_state:
        | "ENQUIRY"
        | "REQUESTED"
        | "QUOTED"
        | "CUSTOMER_ACCEPTED"
        | "CONFIRMED"
        | "CANCELLED"
      idempotency_status: "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
      locale_code: "en" | "ur"
      menu_review_status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED"
      outbox_status: "PENDING" | "CLAIMED" | "DELIVERED" | "FAILED"
      publish_state: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      seating_preference: "GENERAL" | "TREEHOUSE"
      source_channel:
        | "WEB"
        | "TEXT_CONCIERGE"
        | "VOICE_EN"
        | "VOICE_UR"
        | "STAFF"
      staff_role:
        | "OWNER"
        | "MANAGER"
        | "ORDER_STAFF"
        | "BOOKING_STAFF"
        | "AUDITOR"
      staff_status: "ACTIVE" | "SUSPENDED" | "DISABLED"
      takeaway_state:
        | "DRAFT"
        | "REQUESTED"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "COLLECTED"
        | "REJECTED"
        | "CANCELLED"
      webhook_processing_state:
        | "RECEIVED"
        | "PROCESSED"
        | "REJECTED"
        | "DUPLICATE"
      webhook_provider: "VAPI" | "WHATSAPP" | "META"
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
      actor_type: ["GUEST", "STAFF", "SYSTEM"],
      audit_event_category: [
        "AUTH",
        "ADMIN",
        "MENU_PUBLISHING",
        "FEATURE_CHANGE",
        "EXPORT",
        "PII_ACCESS",
      ],
      availability_status: ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"],
      booking_state: [
        "DRAFT",
        "REQUESTED",
        "CONFIRMED",
        "SEATED",
        "COMPLETED",
        "DECLINED",
        "CANCELLED",
        "NO_SHOW",
      ],
      confirmation_action: [
        "TAKEAWAY_REQUEST",
        "BOOKING_REQUEST",
        "EVENT_REQUEST",
      ],
      consent_category: [
        "ESSENTIAL_PREFERENCES",
        "META_MARKETING",
        "MICROPHONE",
        "RECORDING",
      ],
      entity_type: [
        "TAKEAWAY_REQUEST",
        "BOOKING_REQUEST",
        "EVENT_REQUEST",
        "MENU_VERSION",
        "FEATURE_FLAG",
      ],
      event_state: [
        "ENQUIRY",
        "REQUESTED",
        "QUOTED",
        "CUSTOMER_ACCEPTED",
        "CONFIRMED",
        "CANCELLED",
      ],
      idempotency_status: ["IN_PROGRESS", "SUCCEEDED", "FAILED"],
      locale_code: ["en", "ur"],
      menu_review_status: ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"],
      outbox_status: ["PENDING", "CLAIMED", "DELIVERED", "FAILED"],
      publish_state: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      seating_preference: ["GENERAL", "TREEHOUSE"],
      source_channel: [
        "WEB",
        "TEXT_CONCIERGE",
        "VOICE_EN",
        "VOICE_UR",
        "STAFF",
      ],
      staff_role: [
        "OWNER",
        "MANAGER",
        "ORDER_STAFF",
        "BOOKING_STAFF",
        "AUDITOR",
      ],
      staff_status: ["ACTIVE", "SUSPENDED", "DISABLED"],
      takeaway_state: [
        "DRAFT",
        "REQUESTED",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "COLLECTED",
        "REJECTED",
        "CANCELLED",
      ],
      webhook_processing_state: [
        "RECEIVED",
        "PROCESSED",
        "REJECTED",
        "DUPLICATE",
      ],
      webhook_provider: ["VAPI", "WHATSAPP", "META"],
    },
  },
} as const

