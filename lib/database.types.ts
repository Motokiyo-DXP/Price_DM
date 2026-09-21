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
      account_card_bookmarks: {
        Row: {
          canonical_card_id: number
          created_at: string
          user_id: string
        }
        Insert: {
          canonical_card_id: number
          created_at?: string
          user_id: string
        }
        Update: {
          canonical_card_id?: number
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_card_bookmarks_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_card_market_summary"
            referencedColumns: ["canonical_card_id"]
          },
          {
            foreignKeyName: "account_card_bookmarks_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      account_recent_registration_shops: {
        Row: {
          last_registered_at: string
          shop_id: number
          user_id: string
        }
        Insert: {
          last_registered_at?: string
          shop_id: number
          user_id: string
        }
        Update: {
          last_registered_at?: string
          shop_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_recent_registration_shops_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
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
      profiles: {
        Row: {
          user_id: string
          display_name: string
          avatar_url: string | null
          deck_list_sort_mode: string
          unfiled_folder_sort_order: number
          friend_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name: string
          avatar_url?: string | null
          deck_list_sort_mode?: string
          unfiled_folder_sort_order?: number
          friend_code: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string
          avatar_url?: string | null
          deck_list_sort_mode?: string
          unfiled_folder_sort_order?: number
          friend_code?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      decks: {
        Row: {
          share_token: string | null
          folder_id: string | null
          icon_canonical_card_id: number | null
          user_sort_order: number
          id: string
          owner_id: string
          name: string
          format: string
          visibility: string
          description: string
          created_at: string
          updated_at: string
        }
        Insert: {
          share_token?: string | null
          folder_id?: string | null
          icon_canonical_card_id?: number | null
          user_sort_order?: number
          id?: string
          owner_id: string
          name: string
          format?: string
          visibility?: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          share_token?: string | null
          folder_id?: string | null
          icon_canonical_card_id?: number | null
          user_sort_order?: number
          id?: string
          owner_id?: string
          name?: string
          format?: string
          visibility?: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: "decks_folder_id_fkey"; columns: ["folder_id"]; isOneToOne: false; referencedRelation: "deck_folders"; referencedColumns: ["id"] }]
      }
      deck_folders: {
        Row: { id: string; owner_id: string; name: string; user_sort_order: number; created_at: string; updated_at: string }
        Insert: { id?: string; owner_id: string; name: string; user_sort_order?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; owner_id?: string; name?: string; user_sort_order?: number; created_at?: string; updated_at?: string }
        Relationships: []
      }
      game_rooms: {
        Row: {
          created_at: string
          expires_at: string
          time_limit_minutes: number
          started_at: string | null
          ended_at: string | null
          winner_user_id: string | null
          end_reason: string | null
          host_rematch_ready: boolean
          guest_rematch_ready: boolean
          format: string
          deck_is_public: boolean
          guest_deck_snapshot: Json | null
          guest_ready: boolean
          guest_user_id: string | null
          host_deck_snapshot: Json
          host_ready: boolean
          host_user_id: string
          id: string
          room_code: string
          state: Json
          state_version: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          time_limit_minutes?: number
          started_at?: string | null
          ended_at?: string | null
          winner_user_id?: string | null
          end_reason?: string | null
          host_rematch_ready?: boolean
          guest_rematch_ready?: boolean
          format: string
          deck_is_public?: boolean
          guest_deck_snapshot?: Json | null
          guest_ready?: boolean
          guest_user_id?: string | null
          host_deck_snapshot: Json
          host_ready?: boolean
          host_user_id: string
          id?: string
          room_code: string
          state?: Json
          state_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          time_limit_minutes?: number
          started_at?: string | null
          ended_at?: string | null
          winner_user_id?: string | null
          end_reason?: string | null
          host_rematch_ready?: boolean
          guest_rematch_ready?: boolean
          format?: string
          deck_is_public?: boolean
          guest_deck_snapshot?: Json | null
          guest_ready?: boolean
          guest_user_id?: string | null
          host_deck_snapshot?: Json
          host_ready?: boolean
          host_user_id?: string
          id?: string
          room_code?: string
          state?: Json
          state_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_room_spectators: {
        Row: { room_id: string; user_id: string; joined_at: string; last_seen_at: string }
        Insert: { room_id: string; user_id: string; joined_at?: string; last_seen_at?: string }
        Update: { room_id?: string; user_id?: string; joined_at?: string; last_seen_at?: string }
        Relationships: [{ foreignKeyName: "game_room_spectators_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "game_rooms"; referencedColumns: ["id"] }]
      }
      game_public_slots: {
        Row: { slot_number: number; room_id: string | null; updated_at: string }
        Insert: { slot_number: number; room_id?: string | null; updated_at?: string }
        Update: { slot_number?: number; room_id?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "game_public_slots_room_id_fkey"; columns: ["room_id"]; isOneToOne: true; referencedRelation: "game_rooms"; referencedColumns: ["id"] }]
      }
      online_lobbies: {
        Row: { id: string; kind: string; owner_user_id: string | null; join_code: string; passphrase_hash: string | null; created_at: string; updated_at: string; expires_at: string | null }
        Insert: { id?: string; kind: string; owner_user_id?: string | null; join_code: string; passphrase_hash?: string | null; created_at?: string; updated_at?: string; expires_at?: string | null }
        Update: { id?: string; kind?: string; owner_user_id?: string | null; join_code?: string; passphrase_hash?: string | null; created_at?: string; updated_at?: string; expires_at?: string | null }
        Relationships: []
      }
      online_lobby_members: {
        Row: { lobby_id: string; user_id: string; member_role: string; joined_at: string; last_seen_at: string; selected_deck_id: string | null }
        Insert: { lobby_id: string; user_id: string; member_role?: string; joined_at?: string; last_seen_at?: string; selected_deck_id?: string | null }
        Update: { lobby_id?: string; user_id?: string; member_role?: string; joined_at?: string; last_seen_at?: string; selected_deck_id?: string | null }
        Relationships: [{ foreignKeyName: "online_lobby_members_lobby_id_fkey"; columns: ["lobby_id"]; isOneToOne: false; referencedRelation: "online_lobbies"; referencedColumns: ["id"] }]
      }
      online_match_slots: {
        Row: { id: string; lobby_id: string; slot_number: number; format: string; time_limit_minutes: number; game_room_id: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; lobby_id: string; slot_number: number; format?: string; time_limit_minutes?: number; game_room_id?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; lobby_id?: string; slot_number?: number; format?: string; time_limit_minutes?: number; game_room_id?: string | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "online_match_slots_lobby_id_fkey"; columns: ["lobby_id"]; isOneToOne: false; referencedRelation: "online_lobbies"; referencedColumns: ["id"] },
          { foreignKeyName: "online_match_slots_game_room_id_fkey"; columns: ["game_room_id"]; isOneToOne: true; referencedRelation: "game_rooms"; referencedColumns: ["id"] },
        ]
      }
      online_lobby_invitations: {
        Row: { id: string; lobby_id: string; inviter_user_id: string; invitee_user_id: string; created_at: string; accepted_at: string | null; dismissed_at: string | null }
        Insert: { id?: string; lobby_id: string; inviter_user_id: string; invitee_user_id: string; created_at?: string; accepted_at?: string | null; dismissed_at?: string | null }
        Update: { id?: string; lobby_id?: string; inviter_user_id?: string; invitee_user_id?: string; created_at?: string; accepted_at?: string | null; dismissed_at?: string | null }
        Relationships: [{ foreignKeyName: "online_lobby_invitations_lobby_id_fkey"; columns: ["lobby_id"]; isOneToOne: false; referencedRelation: "online_lobbies"; referencedColumns: ["id"] }]
      }
      user_friendships: {
        Row: { requester_user_id: string; addressee_user_id: string; status: string; created_at: string; updated_at: string }
        Insert: { requester_user_id: string; addressee_user_id: string; status?: string; created_at?: string; updated_at?: string }
        Update: { requester_user_id?: string; addressee_user_id?: string; status?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      deck_cards: {
        Row: {
          id: number
          deck_id: string
          canonical_card_id: number
          card_print_id: number | null
          zone: string
          quantity: number
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          deck_id: string
          canonical_card_id: number
          card_print_id?: number | null
          zone?: string
          quantity: number
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          deck_id?: string
          canonical_card_id?: number
          card_print_id?: number | null
          zone?: string
          quantity?: number
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_canonical_card_id_fkey"
            columns: ["canonical_card_id"]
            isOneToOne: false
            referencedRelation: "canonical_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_card_print_id_fkey"
            columns: ["card_print_id"]
            isOneToOne: false
            referencedRelation: "card_prints"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_cards: {
        Row: {
          aliases: string[]
          aliases_kana: string[]
          civilizations: string[]
          card_types: string[]
          cost: number | null
          created_at: string
          deleted_at: string | null
          game_id: number
          id: number
          metadata_synced_at: string | null
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
          civilizations?: string[]
          card_types?: string[]
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          game_id: number
          id?: never
          metadata_synced_at?: string | null
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
          civilizations?: string[]
          card_types?: string[]
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          game_id?: number
          id?: never
          metadata_synced_at?: string | null
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
          image_byte_size: number | null
          image_height: number | null
          image_key: string | null
          image_updated_at: string | null
          image_width: number | null
          legacy_card_id: number | null
          manually_locked: boolean
          official_card_id: string | null
          official_url: string | null
          product_name: string | null
          product_id: number | null
          source_checked_at: string | null
          updated_at: string
        }
        Insert: {
          canonical_card_id: number
          card_number?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          image_byte_size?: number | null
          image_height?: number | null
          image_key?: string | null
          image_updated_at?: string | null
          image_width?: number | null
          legacy_card_id?: number | null
          manually_locked?: boolean
          official_card_id?: string | null
          official_url?: string | null
          product_name?: string | null
          product_id?: number | null
          source_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          canonical_card_id?: number
          card_number?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          image_byte_size?: number | null
          image_height?: number | null
          image_key?: string | null
          image_updated_at?: string | null
          image_width?: number | null
          legacy_card_id?: number | null
          manually_locked?: boolean
          official_card_id?: string | null
          official_url?: string | null
          product_name?: string | null
          product_id?: number | null
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
      shop_correction_requests: {
        Row: {
          id: number
          proposed_address_line: string | null
          proposed_aliases: string[] | null
          proposed_municipality: string | null
          proposed_name: string | null
          proposed_name_kana: string | null
          proposed_prefecture: string | null
          proposed_website_url: string | null
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shop_id: number
          status: string
          submitted_at: string
        }
        Insert: {
          id?: never
          proposed_address_line?: string | null
          proposed_aliases?: string[] | null
          proposed_municipality?: string | null
          proposed_name?: string | null
          proposed_name_kana?: string | null
          proposed_prefecture?: string | null
          proposed_website_url?: string | null
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_id: number
          status?: string
          submitted_at?: string
        }
        Update: {
          id?: never
          proposed_address_line?: string | null
          proposed_aliases?: string[] | null
          proposed_municipality?: string | null
          proposed_name?: string | null
          proposed_name_kana?: string | null
          proposed_prefecture?: string | null
          proposed_website_url?: string | null
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_id?: number
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_correction_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
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
          chain_name: string | null
          created_at: string
          id: number
          latitude: number | null
          longitude: number | null
          municipality: string | null
          name: string
          name_kana: string | null
          name_key: string | null
          operational_status: string
          prefecture: string | null
          source_store_id: string | null
          source_url: string | null
          source_verified_at: string | null
          superseded_by_shop_id: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address_line?: string | null
          aliases?: string[]
          chain_name?: string | null
          created_at?: string
          id?: never
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name: string
          name_kana?: string | null
          name_key?: string | null
          operational_status?: string
          prefecture?: string | null
          source_store_id?: string | null
          source_url?: string | null
          source_verified_at?: string | null
          superseded_by_shop_id?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address_line?: string | null
          aliases?: string[]
          chain_name?: string | null
          created_at?: string
          id?: never
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name?: string
          name_kana?: string | null
          name_key?: string | null
          operational_status?: string
          prefecture?: string | null
          source_store_id?: string | null
          source_url?: string | null
          source_verified_at?: string | null
          superseded_by_shop_id?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shops_superseded_by_shop_id_fkey"
            columns: ["superseded_by_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
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
      card_products: {
        Row: { id: number; game_id: number; product_code: string; product_name: string; release_date: string | null; release_date_precision: string; official_url: string | null; source_checked_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: never; game_id: number; product_code: string; product_name: string; release_date?: string | null; release_date_precision?: string; official_url?: string | null; source_checked_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: never; game_id?: number; product_code?: string; product_name?: string; release_date?: string | null; release_date_precision?: string; official_url?: string | null; source_checked_at?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
    }
    Functions: {
      get_or_create_deck_share_token: { Args: { p_deck_id: string }; Returns: string | null }
      get_shared_deck: { Args: { p_share_token: string }; Returns: Json | null }
      deck_filter_options: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      search_deck_cards_filtered: {
        Args: {
          p_query?: string
          p_limit?: number
          p_offset?: number
          p_sort?: string
          p_ascending?: boolean
          p_product_name?: string | null
          p_card_number?: string | null
          p_civilizations?: string[]
          p_civilization_mode?: string
          p_color?: string
          p_card_types?: string[]
          p_min_cost?: number | null
          p_max_cost?: number | null
          p_no_cost?: boolean
          p_image?: string
        }
        Returns: { id: number; name: string; name_kana: string | null; print_count: number; usage_count: number }[]
      }
      retire_stale_game_rooms: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      create_game_room: {
        Args: { p_deck_id: string }
        Returns: {
          id: string
          room_code: string
        }[]
      }
      join_game_room: {
        Args: { p_deck_id: string; p_room_code: string }
        Returns: {
          id: string
          room_code: string
        }[]
      }
      join_game_room_as_spectator: {
        Args: { p_room_code: string }
        Returns: { id: string; room_code: string }[]
      }
      enter_public_game_room: {
        Args: { p_deck_id: string; p_slot_number: number }
        Returns: { id: string; room_code: string; member_role: string }[]
      }
      list_public_game_rooms: {
        Args: Record<PropertyKey, never>
        Returns: { slot_number: number; room_id: string | null; room_code: string | null; status: string; format: string | null; player_count: number; spectator_count: number }[]
      }
      create_online_lobby: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; join_code: string }[]
      }
      get_public_online_lobby: {
        Args: Record<PropertyKey, never>
        Returns: { id: string }[]
      }
      join_online_lobby_by_code: {
        Args: { p_join_code: string }
        Returns: { id: string }[]
      }
      enter_online_match_slot: {
        Args: { p_slot_id: string; p_role: string; p_deck_id: string | null; p_format: string; p_time_limit_minutes: number; p_deck_is_public: boolean }
        Returns: { game_room_id: string; member_role: string }[]
      }
      list_online_match_slots: {
        Args: { p_lobby_id: string }
        Returns: { id: string; slot_number: number; format: string; time_limit_minutes: number; game_room_id: string | null; status: string; player_count: number; spectator_count: number; host_display_name: string | null; host_avatar_url: string | null; guest_display_name: string | null; guest_avatar_url: string | null; deck_is_public: boolean }[]
      }
      list_online_lobby_members: {
        Args: { p_lobby_id: string }
        Returns: { user_id: string; display_name: string; avatar_url: string | null; member_role: string; last_seen_at: string; is_online: boolean }[]
      }
      touch_online_lobby_presence: {
        Args: { p_lobby_id: string }
        Returns: undefined
      }
      touch_game_room_presence: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      list_game_room_presence: {
        Args: { p_room_id: string }
        Returns: { user_id: string; display_name: string; connection_role: string; last_seen_at: string | null; is_online: boolean }[]
      }
      list_resumable_game_rooms: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; room_code: string; status: string; member_role: string; format: string; updated_at: string }[]
      }
      reconcile_game_room_lifecycle: {
        Args: { p_room_id: string }
        Returns: { status: string; winner_user_id: string | null; end_reason: string | null; deadline: string | null; host_rematch_ready: boolean; guest_rematch_ready: boolean }[]
      }
      surrender_game_room: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      request_game_room_rematch: {
        Args: { p_room_id: string }
        Returns: { status: string; host_rematch_ready: boolean; guest_rematch_ready: boolean }[]
      }
      accept_online_lobby_invitation: {
        Args: { p_invitation_id: string }
        Returns: { lobby_id: string }[]
      }
      send_online_lobby_invitation_by_name: {
        Args: { p_display_name: string; p_lobby_id: string }
        Returns: undefined
      }
      list_invitable_lobby_friends: {
        Args: { p_lobby_id: string }
        Returns: { friend_user_id: string; display_name: string; invitation_status: string; is_online: boolean }[]
      }
      get_my_friend_code: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      list_my_friends: {
        Args: Record<PropertyKey, never>
        Returns: { friend_user_id: string; display_name: string; avatar_url: string | null; friends_since: string }[]
      }
      list_incoming_friend_requests: {
        Args: Record<PropertyKey, never>
        Returns: { requester_user_id: string; display_name: string; avatar_url: string | null; requested_at: string }[]
      }
      send_friend_request: {
        Args: { p_friend_code: string }
        Returns: string
      }
      respond_friend_request: {
        Args: { p_accept: boolean; p_requester_user_id: string }
        Returns: string
      }
      send_online_lobby_friend_invitation: {
        Args: { p_friend_user_id: string; p_lobby_id: string }
        Returns: undefined
      }
      set_game_room_ready: {
        Args: { p_deck_id: string; p_ready: boolean; p_room_id: string }
        Returns: { status: string; host_ready: boolean; guest_ready: boolean }[]
      }
      set_online_lobby_selected_deck: {
        Args: { p_deck_id: string; p_lobby_id: string }
        Returns: undefined
      }
      start_game_room: {
        Args: { p_room_id: string }
        Returns: { state: Json; state_version: number }[]
      }
      update_game_room_state: {
        Args: { p_expected_version: number; p_room_id: string; p_state: Json }
        Returns: { state: Json; state_version: number }[]
      }
      get_game_room_history_status: {
        Args: { p_room_id: string }
        Returns: {
          can_undo: boolean
          can_redo: boolean
          undo_requires_approval: boolean
          pending_request_id: string | null
          pending_requester_name: string | null
        }[]
      }
      get_game_room_state: {
        Args: { p_room_id: string }
        Returns: { state: Json; state_version: number }[]
      }
      get_game_room_deck_labels: {
        Args: { p_room_id: string }
        Returns: { host_name: string; guest_name: string | null; selected_deck_id: string | null; host_icon_image_key: string | null; guest_icon_image_key: string | null }[]
      }
      inspect_own_game_deck: {
        Args: { p_room_id: string; p_count?: number | null }
        Returns: Json
      }
      shuffle_game_cards: {
        Args: { p_room_id: string; p_expected_version: number; p_owner: string; p_zone: string; p_mode: string; p_card_ids?: string[] | null; p_stack_id?: string | null }
        Returns: { state: Json; state_version: number }[]
      }
      run_game_yobinion: {
        Args: { p_room_id: string; p_expected_version: number; p_owner: string; p_source_id: string; p_dragon_only?: boolean }
        Returns: { state: Json; state_version: number; found: boolean }[]
      }
      set_game_card_inspection: {
        Args: { p_room_id: string; p_expected_version: number; p_owner?: string | null; p_card_id?: string | null }
        Returns: { state: Json; state_version: number }[]
      }
      send_game_effect_warning: {
        Args: { p_room_id: string; p_expected_version: number; p_owner: string; p_card_id: string }
        Returns: { state: Json; state_version: number }[]
      }
      undo_game_room_action: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: { state: Json; state_version: number; result: string }[]
      }
      redo_game_room_action: {
        Args: { p_expected_version: number; p_room_id: string }
        Returns: { state: Json; state_version: number; result: string }[]
      }
      respond_game_room_undo_request: {
        Args: { p_approve: boolean; p_expected_version: number; p_request_id: string }
        Returns: { state: Json; state_version: number; result: string }[]
      }
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
      load_market_cards_with_images: {
        Args: { p_limit?: number }
        Returns: {
          aliases: string[]
          aliases_kana: string[]
          buy_price: number
          buy_record_count: number
          buy_trend: string
          canonical_card_id: number
          game_name: string
          image_key: string
          is_stale: boolean
          last_observed_on: string
          name: string
          name_kana: string
          print_count: number
          sale_price: number
          sale_record_count: number
          sale_trend: string
          stock_status: Database["public"]["Enums"]["stock_status"]
          uses_print_fallback: boolean
        }[]
      }
      delete_pending_shop_candidate_for_admin: {
        Args: { p_candidate_id: number }
        Returns: string
      }
      delete_registered_shop_for_admin: {
        Args: { p_shop_id: number }
        Returns: string
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
      list_pending_shop_corrections_for_admin: {
        Args: { p_limit?: number }
        Returns: {
          id: number
          original_address_line: string | null
          original_aliases: string[]
          original_municipality: string | null
          original_name: string
          original_name_kana: string | null
          original_prefecture: string | null
          original_website_url: string | null
          proposed_address_line: string | null
          proposed_aliases: string[] | null
          proposed_municipality: string | null
          proposed_name: string | null
          proposed_name_kana: string | null
          proposed_prefecture: string | null
          proposed_website_url: string | null
          reason: string
          shop_id: number
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
      list_shop_details_for_admin: {
        Args: { p_limit?: number }
        Returns: {
          address_line: string
          aliases: string[]
          id: number
          municipality: string
          name: string
          name_kana: string
          prefecture: string
          price_record_count: number
          website_url: string
        }[]
      }
      list_shop_details_page_for_admin: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          address_line: string
          aliases: string[]
          id: number
          municipality: string
          name: string
          name_kana: string
          prefecture: string
          price_record_count: number
          total_count: number
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
      review_shop_correction_for_admin: {
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
      search_deck_cards_by_usage: {
        Args: { p_query?: string; p_limit?: number; p_ascending?: boolean }
        Returns: { id: number; name: string; name_kana: string | null; print_count: number; usage_count: number }[]
      }
      search_canonical_cards_with_images: {
        Args: { p_query?: string; p_game_slug?: string; p_limit?: number; p_mode?: string }
        Returns: { id: number; game_slug: string; game_name: string; name: string; name_kana: string; print_count: number; image_key: string | null }[]
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
      search_registration_cards: {
        Args: {
          p_game_slug?: string
          p_limit?: number
          p_mode?: string
          p_query: string
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
      search_shops_page: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_prefecture?: string
          p_query?: string
        }
        Returns: {
          id: number
          municipality: string
          name: string
          prefecture: string
          total_count: number
        }[]
      }
      list_recent_registration_shops: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: number
          municipality: string
          name: string
          prefecture: string
        }[]
      }
      record_recent_registration_shop: {
        Args: { p_shop_id: number }
        Returns: undefined
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
      submit_shop_correction_request: {
        Args: {
          p_address_line?: string
          p_aliases?: string[]
          p_municipality?: string
          p_name?: string
          p_name_kana?: string
          p_prefecture?: string
          p_reason?: string
          p_session_token: string
          p_shop_id: number
          p_website_url?: string
        }
        Returns: number
      }
      update_shop_search_metadata_for_admin: {
        Args: { p_aliases?: string[]; p_name_kana?: string; p_shop_id: number }
        Returns: undefined
      }
      update_shop_details_for_admin: {
        Args: {
          p_address_line?: string
          p_aliases?: string[]
          p_municipality?: string
          p_name: string
          p_name_kana?: string
          p_prefecture?: string
          p_shop_id: number
          p_website_url?: string
        }
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
