export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }
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
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          address: string | null
          bank_accounts: NonNullable<Json>
          default_validity_days: number
          email: string | null
          id: boolean
          legal_name: string | null
          payment_terms: string | null
          phones: string[]
          return_policy: string | null
          ruc: string | null
          trade_name: string | null
          updated_at: string
          wallets: NonNullable<Json>
          whatsapp_message: string | null
        }
        Insert: {
          address?: string | null
          bank_accounts?: NonNullable<Json>
          default_validity_days?: number
          email?: string | null
          id?: boolean
          legal_name?: string | null
          payment_terms?: string | null
          phones?: string[]
          return_policy?: string | null
          ruc?: string | null
          trade_name?: string | null
          updated_at?: string
          wallets?: NonNullable<Json>
          whatsapp_message?: string | null
        }
        Update: {
          address?: string | null
          bank_accounts?: NonNullable<Json>
          default_validity_days?: number
          email?: string | null
          id?: boolean
          legal_name?: string | null
          payment_terms?: string | null
          phones?: string[]
          return_policy?: string | null
          ruc?: string | null
          trade_name?: string | null
          updated_at?: string
          wallets?: NonNullable<Json>
          whatsapp_message?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          name: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          name: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          name?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      proformas: {
        Row: {
          client_document: string
          client_name: string
          client_phone: string
          created_at: string
          document: NonNullable<Json>
          id: string
          issued_at: string
          item_count: number
          number: number
          total: number
          updated_at: string
          valid_until: string
        }
        Insert: {
          client_document?: string
          client_name: string
          client_phone?: string
          created_at?: string
          document: NonNullable<Json>
          id?: string
          issued_at: string
          item_count: number
          number: number
          total: number
          updated_at?: string
          valid_until: string
        }
        Update: {
          client_document?: string
          client_name?: string
          client_phone?: string
          created_at?: string
          document?: NonNullable<Json>
          id?: string
          issued_at?: string
          item_count?: number
          number?: number
          total?: number
          updated_at?: string
          valid_until?: string
        }
        Relationships: []
      }
      whatsapp_session: {
        Row: {
          id: boolean
          linked_at: string | null
          locked_until: string | null
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          linked_at?: string | null
          locked_until?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          linked_at?: string | null
          locked_until?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      catalog_stats: { Args: Record<PropertyKey, never>; Returns: Json }
      export_products: {
        Args: {
          category?: string
          date_by?: string
          date_from?: string
          date_to?: string
          max_rows?: number
          search?: string
          sort?: string
        }
        Returns: Json
      }
      export_proformas: {
        Args: { date_from?: string; date_to?: string; max_rows?: number; search?: string }
        Returns: Json
      }
      filter_products: {
        Args: {
          category?: string
          date_by?: string
          date_from?: string
          date_to?: string
          search?: string
          sort?: string
        }
        Returns: {
          category_id: string
          category_name: string
          code: string
          created_at: string
          description: string
          id: string
          image_path: string
          name: string
          sort_position: number
          unit_price: number
          updated_at: string
        }[]
      }
      filter_proformas: {
        Args: { date_from?: string; date_to?: string; search?: string }
        Returns: {
          client_document: string
          client_name: string
          client_phone: string
          id: string
          issued_at: string
          item_count: number
          number: number
          sort_position: number
          total: number
          valid_until: string
        }[]
      }
      import_products: { Args: { columns: string[]; mode?: string; rows: Json }; Returns: Json }
      next_proforma_number: { Args: Record<PropertyKey, never>; Returns: number }
      photo_in_use: { Args: { path: string }; Returns: boolean }
      preview_product_import: { Args: { columns: string[]; rows: Json }; Returns: Json }
      product_import_plan: {
        Args: { columns: string[]; rows: Json }
        Returns: {
          category: string
          category_changed: boolean
          category_id: string
          category_name: string
          code: string
          current_category: string
          current_description: string
          current_name: string
          current_price: number
          description: string
          description_changed: boolean
          line: number
          name: string
          name_changed: boolean
          name_taken_by: string
          price: number
          price_changed: boolean
          product_id: string
        }[]
      }
      search_products: {
        Args: {
          category?: string
          date_by?: string
          date_from?: string
          date_to?: string
          page?: number
          page_size?: number
          search?: string
          sort?: string
        }
        Returns: Json
      }
      search_proformas: {
        Args: {
          date_from?: string
          date_to?: string
          page?: number
          page_size?: number
          search?: string
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
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
