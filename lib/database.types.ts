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
      cards: {
        Row: {
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
      price_records: {
        Row: {
          buy_price: number | null
          card_id: number
          contributor_name: string | null
          created_at: string
          id: number
          note: string | null
          observed_on: string
          sale_price: number | null
          shop_id: number
          stock_status: Database["public"]["Enums"]["stock_status"]
        }
        Insert: {
          buy_price?: number | null
          card_id: number
          contributor_name?: string | null
          created_at?: string
          id?: never
          note?: string | null
          observed_on?: string
          sale_price?: number | null
          shop_id: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
        }
        Update: {
          buy_price?: number | null
          card_id?: number
          contributor_name?: string | null
          created_at?: string
          id?: never
          note?: string | null
          observed_on?: string
          sale_price?: number | null
          shop_id?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
        }
        Relationships: [
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
      shops: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
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
      search_cards: {
        Args: { p_game_slug?: string; p_limit?: number; p_query?: string }
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

