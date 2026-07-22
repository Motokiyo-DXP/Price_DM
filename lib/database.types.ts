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
      app_config: {
        Row: {
          id: boolean
          registration_pin_hash: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          registration_pin_hash?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          registration_pin_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      canonical_cards: {
        Row: {
          aliases: string[]
          aliases_kana: string[]
          created_at: string
          deleted_at: string | null
          game_id: number
          id: number
          manually_locked: boolean
          name: string
          name_kana: string | null
          source_checked_at: string | null
          source_name: string
          source_name_kana: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          aliases_kana?: string[]
          created_at?: string
          deleted_at?: string | null
          game_id: number
          id?: never
          manually_locked?: boolean
          name: string
          name_kana?: string | null
          source_checked_at?: string | null
          source_name: string
          source_name_kana?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          aliases_kana?: string[]
          created_at?: string
          deleted_at?: string | null
          game_id?: number
          id?: never
          manually_locked?: boolean
          name?: string
          name_kana?: string | null
          source_checked_at?: string | null
          source_name?: string
          source_name_kana?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "tcg_games"
            referencedColumns: ["id"]
          },
        ]
      }
      card_prints: {
        Row: {
          canonical_card_id: number
          card_number: string | null
          created_at: string
          deleted_at: string | null
          id: number
          legacy_card_id: number | null
          manually_locked: boolean
          official_card_id: string | null
          official_url: string | null
          product_name: string | null
          source_checked_at: string | null
          updated_at: string
        }
        Insert: {
          canonical_card_id: number
          card_number?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          legacy_card_id?: number | null
          manually_locked?: boolean
          official_card_id?: string | null
          official_url?: string | null
          product_name?: string | null
          source_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          canonical_card_id?: number
          card_number?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          legacy_card_id?: number | null
          manually_locked?: boolean
          official_card_id?: string | null
          official_url?: string | null
          product_name?: string | null
          source_checked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_prints_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_card_market_summary"
            referencedColumns: ["canonical_card_id"]
          },
          {
            foreignKeyName: "card_prints_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_prints_legacy_card_id_fkey"
            columns: ["legacy_card_id"]
            isOneToOne: true
            referencedRelation: "card_market_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_prints_legacy_card_id_fkey"
            columns: ["legacy_card_id"]
            isOneToOne: true
            referencedRelation: "card_price_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_prints_legacy_card_id_fkey"
            columns: ["legacy_card_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_search_terms: {
        Row: {
          canonical_card_id: number
          created_at: string
          id: number
          normalized_term: string
          priority: number
          source: string
          term: string
          term_kind: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          canonical_card_id: number
          created_at?: string
          id?: never
          normalized_term: string
          priority?: number
          source?: string
          term: string
          term_kind: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          canonical_card_id?: number
          created_at?: string
          id?: never
          normalized_term?: string
          priority?: number
          source?: string
          term?: string
          term_kind?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "card_search_terms_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_card_market_summary"
            referencedColumns: ["canonical_card_id"]
          },
          {
            foreignKeyName: "card_search_terms_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          aliases: string[]
          aliases_kana: string[]
          card_number: string | null
          created_at: string
          game_id: number
          id: number
          name: string
          name_kana: string | null
          official_url: string | null
          product_name: string | null
        }
        Insert: {
          aliases?: string[]
          aliases_kana?: string[]
          card_number?: string | null
          created_at?: string
          game_id: number
          id?: never
          name: string
          name_kana?: string | null
          official_url?: string | null
          product_name?: string | null
        }
        Update: {
          aliases?: string[]
          aliases_kana?: string[]
          card_number?: string | null
          created_at?: string
          game_id?: number
          id?: never
          name?: string
          name_kana?: string | null
          official_url?: string | null
          product_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "tcg_games"
            referencedColumns: ["id"]
          },
        ]
      }
      price_attribute_implications: {
        Row: {
          attribute_id: number
          implied_attribute_id: number
        }
        Insert: {
          attribute_id: number
          implied_attribute_id: number
        }
        Update: {
          attribute_id?: number
          implied_attribute_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_attribute_implications_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "price_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_attribute_implications_implied_attribute_id_fkey"
            columns: ["implied_attribute_id"]
            isOneToOne: false
            referencedRelation: "price_attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      price_attributes: {
        Row: {
          approval_status: string
          created_at: string
          deleted_at: string | null
          id: number
          is_builtin: boolean
          merged_into_id: number | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_builtin?: boolean
          merged_into_id?: number | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          created_at?: string
          deleted_at?: string | null
          id?: never
          is_builtin?: boolean
          merged_into_id?: number | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_attributes_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "price_attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      price_correction_requests: {
        Row: {
          id: number
          price_record_id: number
          proposed_buy_price: number | null
          proposed_note: string | null
          proposed_observed_on: string
          proposed_sale_price: number | null
          proposed_stock_status: Database["public"]["Enums"]["stock_status"]
          reason: string
          replacement_price_record_id: number | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          id?: never
          price_record_id: number
          proposed_buy_price?: number | null
          proposed_note?: string | null
          proposed_observed_on: string
          proposed_sale_price?: number | null
          proposed_stock_status: Database["public"]["Enums"]["stock_status"]
          reason: string
          replacement_price_record_id?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          id?: never
          price_record_id?: number
          proposed_buy_price?: number | null
          proposed_note?: string | null
          proposed_observed_on?: string
          proposed_sale_price?: number | null
          proposed_stock_status?: Database["public"]["Enums"]["stock_status"]
          reason?: string
          replacement_price_record_id?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_correction_requests_price_record_id_fkey"
            columns: ["price_record_id"]
            isOneToOne: false
            referencedRelation: "price_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_correction_requests_replacement_price_record_id_fkey"
            columns: ["replacement_price_record_id"]
            isOneToOne: false
            referencedRelation: "price_records"
            referencedColumns: ["id"]
          },
        ]
      }
      price_record_attributes: {
        Row: {
          attribute_id: number
          created_at: string
          price_record_id: number
        }
        Insert: {
          attribute_id: number
          created_at?: string
          price_record_id: number
        }
        Update: {
          attribute_id?: number
          created_at?: string
          price_record_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_record_attributes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "price_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_record_attributes_price_record_id_fkey"
            columns: ["price_record_id"]
            isOneToOne: false
            referencedRelation: "price_records"
            referencedColumns: ["id"]
          },
        ]
      }
      price_records: {
        Row: {
          buy_price: number | null
          canonical_card_id: number
          card_id: number | null
          card_print_id: number | null
          contributor_name: string | null
          created_at: string
          deleted_at: string | null
          id: number
          note: string | null
          observed_on: string
          sale_price: number | null
          shop_id: number
          stock_status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
        }
        Insert: {
          buy_price?: number | null
          canonical_card_id: number
          card_id?: number | null
          card_print_id?: number | null
          contributor_name?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          note?: string | null
          observed_on?: string
          sale_price?: number | null
          shop_id: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
        }
        Update: {
          buy_price?: number | null
          canonical_card_id?: number
          card_id?: number | null
          card_print_id?: number | null
          contributor_name?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          note?: string | null
          observed_on?: string
          sale_price?: number | null
          shop_id?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_records_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_card_market_summary"
            referencedColumns: ["canonical_card_id"]
          },
          {
            foreignKeyName: "price_records_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_records_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_market_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "price_records_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card_price_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "price_records_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_records_card_print_id_fkey"
            columns: ["card_print_id"]
            isOneToOne: false
            referencedRelation: "card_prints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_records_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "card_market_summary"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "price_records_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_candidates: {
        Row: {
          address_line: string | null
          approved_shop_id: number | null
          id: number
          last_submitted_at: string
          municipality: string | null
          name: string
          name_key: string | null
          prefecture: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submission_count: number
          submitted_at: string
          website_url: string | null
        }
        Insert: {
          address_line?: string | null
          approved_shop_id?: number | null
          id?: never
          last_submitted_at?: string
          municipality?: string | null
          name: string
          name_key?: string | null
          prefecture?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_count?: number
          submitted_at?: string
          website_url?: string | null
        }
        Update: {
          address_line?: string | null
          approved_shop_id?: number | null
          id?: never
          last_submitted_at?: string
          municipality?: string | null
          name?: string
          name_key?: string | null
          prefecture?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submission_count?: number
          submitted_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_candidates_approved_shop_id_fkey"
            columns: ["approved_shop_id"]
            isOneToOne: false
            referencedRelation: "card_market_summary"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "shop_candidates_approved_shop_id_fkey"
            columns: ["approved_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address_line: string | null
          aliases: string[]
          created_at: string
          id: number
          latitude: number | null
          longitude: number | null
          municipality: string | null
          name: string
          name_kana: string | null
          name_key: string | null
          prefecture: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address_line?: string | null
          aliases?: string[]
          created_at?: string
          id?: never
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name: string
          name_kana?: string | null
          name_key?: string | null
          prefecture?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address_line?: string | null
          aliases?: string[]
          created_at?: string
          id?: never
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name?: string
          name_kana?: string | null
          name_key?: string | null
          prefecture?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      tcg_games: {
        Row: {
          created_at: string
          id: number
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      canonical_card_market_summary: {
        Row: {
          aliases: string[] | null
          aliases_kana: string[] | null
          buy_price: number | null
          buy_record_count: number | null
          buy_trend: string | null
          canonical_card_id: number | null
          game_id: number | null
          game_name: string | null
          game_slug: string | null
          is_stale: boolean | null
          last_observed_on: string | null
          name: string | null
          name_kana: string | null
          print_count: number | null
          sale_price: number | null
          sale_record_count: number | null
          sale_trend: string | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
          uses_print_fallback: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "tcg_games"
            referencedColumns: ["id"]
          },
        ]
      }
      card_market_summary: {
        Row: {
          buy_price: number | null
          buy_trend: string | null
          card_id: number | null
          card_number: string | null
          game_id: number | null
          is_stale: boolean | null
          last_observed_on: string | null
          name: string | null
          name_kana: string | null
          previous_buy_price: number | null
          previous_sale_price: number | null
          product_name: string | null
          sale_price: number | null
          sale_trend: string | null
          shop_id: number | null
          shop_name: string | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "tcg_games"
            referencedColumns: ["id"]
          },
        ]
      }
      card_price_summary: {
        Row: {
          buy_price: number | null
          buy_trend: string | null
          card_id: number | null
          card_number: string | null
          game_id: number | null
          is_stale: boolean | null
          last_observed_on: string | null
          name: string | null
          name_kana: string | null
          previous_buy_price: number | null
          previous_sale_price: number | null
          product_name: string | null
          sale_price: number | null
          sale_trend: string | null
          shop_id: number | null
          shop_name: string | null
          stock_status: Database["public"]["Enums"]["stock_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "tcg_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_records_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "card_market_summary"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "price_records_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_shop_for_admin: {
        Args: {
          p_address_line?: string
          p_municipality?: string
          p_name: string
          p_prefecture: string
          p_review_note?: string
          p_website_url?: string
        }
        Returns: {
          address_line: string
          municipality: string
          prefecture: string
          shop_id: number
          shop_name: string
          website_url: string
        }[]
      }
      create_shop_for_admin_with_search: {
        Args: {
          p_address_line?: string
          p_aliases?: string[]
          p_municipality?: string
          p_name: string
          p_name_kana?: string
          p_prefecture: string
          p_review_note?: string
          p_website_url?: string
        }
        Returns: {
          address_line: string
          municipality: string
          prefecture: string
          shop_id: number
          shop_name: string
          website_url: string
        }[]
      }
      create_registration_session: { Args: { p_pin: string }; Returns: Json }
      get_canonical_card_best_prices: {
        Args: {
          p_canonical_card_id: number
          p_exclude_caution_attributes?: boolean
        }
        Returns: {
          attribute_names: string[]
          card_number: string
          card_print_id: number
          has_caution_attribute: boolean
          is_stale: boolean
          observed_on: string
          price: number
          price_kind: string
          product_name: string
          shop_id: number
          shop_name: string
          stock_status: Database["public"]["Enums"]["stock_status"]
        }[]
      }
      get_canonical_card_price_history: {
        Args: { p_canonical_card_id: number; p_days?: number }
        Returns: {
          buy_price: number
          buy_record_count: number
          observed_on: string
          sale_price: number
          sale_record_count: number
        }[]
      }
      get_canonical_card_recent_records: {
        Args: { p_canonical_card_id: number; p_limit?: number }
        Returns: {
          attribute_names: string[]
          buy_price: number
          card_number: string
          card_print_id: number
          contributor_name: string
          is_stale: boolean
          note: string
          observed_on: string
          price_record_id: number
          product_name: string
          sale_price: number
          shop_name: string
          stock_status: Database["public"]["Enums"]["stock_status"]
        }[]
      }
      get_card_price_history: {
        Args: { p_card_id: number; p_days?: number }
        Returns: {
          buy_price: number
          contributor_name: string
          note: string
          observed_on: string
          record_id: number
          sale_price: number
          shop_id: number
          shop_name: string
          stock_status: Database["public"]["Enums"]["stock_status"]
        }[]
      }
      list_card_prints: {
        Args: { p_canonical_card_id: number }
        Returns: {
          card_number: string
          id: number
          official_url: string
          product_name: string
        }[]
      }
      list_pending_price_corrections_for_admin: {
        Args: { p_limit?: number }
        Returns: {
          card_name: string
          id: number
          original_buy_price: number
          original_sale_price: number
          price_record_id: number
          proposed_buy_price: number
          proposed_note: string
          proposed_observed_on: string
          proposed_sale_price: number
          proposed_stock_status: Database["public"]["Enums"]["stock_status"]
          reason: string
          shop_name: string
          submitted_at: string
        }[]
      }
      list_pending_shop_candidates_for_admin: {
        Args: { p_limit?: number }
        Returns: {
          address_line: string
          id: number
          last_submitted_at: string
          municipality: string
          name: string
          prefecture: string
          submission_count: number
          submitted_at: string
          website_url: string
        }[]
      }
      list_shop_search_metadata_for_admin: {
        Args: { p_limit?: number }
        Returns: {
          aliases: string[]
          id: number
          name: string
          name_kana: string | null
        }[]
      }
      normalize_card_search: { Args: { p_value: string }; Returns: string }
      normalize_shop_search: { Args: { p_value: string }; Returns: string }
      review_price_correction_for_admin: {
        Args: {
          p_decision: string
          p_request_id: number
          p_review_note?: string
        }
        Returns: undefined
      }
      review_shop_candidate_for_admin: {
        Args: {
          p_candidate_id: number
          p_decision: string
          p_review_note?: string
        }
        Returns: {
          approved_shop_id: number
          candidate_id: number
          candidate_status: string
        }[]
      }
      search_canonical_cards: {
        Args: {
          p_game_slug?: string
          p_limit?: number
          p_mode?: string
          p_query?: string
        }
        Returns: {
          game_name: string
          game_slug: string
          id: number
          name: string
          name_kana: string
          print_count: number
        }[]
      }
      search_cards: {
        Args: {
          p_game_slug?: string
          p_limit?: number
          p_mode?: string
          p_query?: string
        }
        Returns: {
          card_number: string
          game_name: string
          game_slug: string
          id: number
          name: string
          name_kana: string
          product_name: string
        }[]
      }
      search_shops: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          id: number
          name: string
        }[]
      }
      search_shops_by_prefecture: {
        Args: { p_limit?: number; p_prefecture?: string; p_query?: string }
        Returns: {
          id: number
          municipality: string
          name: string
          prefecture: string
        }[]
      }
      submit_price_correction_request: {
        Args: {
          p_buy_price: number
          p_note: string
          p_observed_on: string
          p_price_record_id: number
          p_reason: string
          p_sale_price: number
          p_session_token: string
          p_stock_status: Database["public"]["Enums"]["stock_status"]
        }
        Returns: number
      }
      update_shop_search_metadata_for_admin: {
        Args: { p_aliases?: string[]; p_name_kana?: string; p_shop_id: number }
        Returns: undefined
      }
      submit_price_record: {
        Args: {
          p_buy_price?: number
          p_card_id: number
          p_contributor_name?: string
          p_note?: string
          p_observed_on?: string
          p_pin: string
          p_sale_price?: number
          p_shop_name: string
          p_stock_status?: Database["public"]["Enums"]["stock_status"]
        }
        Returns: number
      }
      submit_price_record_session: {
        Args: {
          p_buy_price?: number
          p_card_id: number
          p_contributor_name?: string
          p_note?: string
          p_observed_on?: string
          p_sale_price?: number
          p_session_token: string
          p_shop_name: string
          p_stock_status?: Database["public"]["Enums"]["stock_status"]
        }
        Returns: number
      }
      submit_price_record_session_v2: {
        Args: {
          p_attribute_slugs?: string[]
          p_buy_price?: number
          p_canonical_card_id: number
          p_card_print_id?: number
          p_contributor_name?: string
          p_note?: string
          p_observed_on?: string
          p_sale_price?: number
          p_session_token: string
          p_shop_name: string
          p_stock_status?: Database["public"]["Enums"]["stock_status"]
        }
        Returns: number
      }
      submit_price_record_session_v3: {
        Args: {
          p_attribute_slugs?: string[]
          p_buy_price?: number
          p_canonical_card_id: number
          p_card_print_id?: number
          p_contributor_name?: string
          p_note?: string
          p_observed_on?: string
          p_sale_price?: number
          p_session_token: string
          p_shop_id: number
          p_stock_status?: Database["public"]["Enums"]["stock_status"]
        }
        Returns: number
      }
      submit_shop_candidate_session: {
        Args: {
          p_address_line?: string
          p_municipality?: string
          p_name: string
          p_prefecture?: string
          p_session_token: string
          p_website_url?: string
        }
        Returns: Json
      }
      validate_registration_session: {
        Args: { p_session_token: string }
        Returns: string
      }
    }
    Enums: {
      stock_status:
        | "in_stock"
        | "low_stock"
        | "out_of_stock"
        | "unknown"
        | "buying"
        | "buying_paused"
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
      stock_status: [
        "in_stock",
        "low_stock",
        "out_of_stock",
        "unknown",
        "buying",
        "buying_paused",
      ],
    },
  },
} as const
