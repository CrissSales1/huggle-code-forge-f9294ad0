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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      configuracoes_sistema: {
        Row: {
          created_at: string | null
          id: number
          tempo_deduplicacao_segundos: number
          total_prismas_magneticos: number
          total_vagas_visitantes: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          tempo_deduplicacao_segundos?: number
          total_prismas_magneticos?: number
          total_vagas_visitantes?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          tempo_deduplicacao_segundos?: number
          total_prismas_magneticos?: number
          total_vagas_visitantes?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      lpr_deteccoes: {
        Row: {
          casa_morador: string | null
          confidence: number | null
          created_at: string | null
          id: number
          is_morador: boolean | null
          placa_detectada: string
          timestamp: string
          updated_at: string | null
        }
        Insert: {
          casa_morador?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: number
          is_morador?: boolean | null
          placa_detectada: string
          timestamp: string
          updated_at?: string | null
        }
        Update: {
          casa_morador?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: number
          is_morador?: boolean | null
          placa_detectada?: string
          timestamp?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      prismas_magneticos: {
        Row: {
          created_at: string | null
          id: number
          is_em_uso: boolean | null
          numero: number
          updated_at: string | null
          visitante_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_em_uso?: boolean | null
          numero: number
          updated_at?: string | null
          visitante_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_em_uso?: boolean | null
          numero?: number
          updated_at?: string | null
          visitante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prismas_magneticos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "visitantes"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos_moradores: {
        Row: {
          casa: string
          created_at: string | null
          id: number
          placa_veiculo: string
          updated_at: string | null
        }
        Insert: {
          casa: string
          created_at?: string | null
          id?: number
          placa_veiculo: string
          updated_at?: string | null
        }
        Update: {
          casa?: string
          created_at?: string | null
          id?: number
          placa_veiculo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      visitantes: {
        Row: {
          casa_visitada: string
          created_at: string | null
          estacionar_vaga_morador: boolean | null
          hora_entrada: string
          hora_saida: string | null
          id: number
          is_ativo: boolean | null
          liberado_por: string | null
          nome: string
          numero_prisma: number | null
          observacoes: string | null
          placa_veiculo: string
          updated_at: string | null
        }
        Insert: {
          casa_visitada: string
          created_at?: string | null
          estacionar_vaga_morador?: boolean | null
          hora_entrada: string
          hora_saida?: string | null
          id?: number
          is_ativo?: boolean | null
          liberado_por?: string | null
          nome: string
          numero_prisma?: number | null
          observacoes?: string | null
          placa_veiculo: string
          updated_at?: string | null
        }
        Update: {
          casa_visitada?: string
          created_at?: string | null
          estacionar_vaga_morador?: boolean | null
          hora_entrada?: string
          hora_saida?: string | null
          id?: number
          is_ativo?: boolean | null
          liberado_por?: string | null
          nome?: string
          numero_prisma?: number | null
          observacoes?: string | null
          placa_veiculo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
