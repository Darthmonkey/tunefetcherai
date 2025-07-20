export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      download_jobs: {
        Row: {
          created_at: string
          download_url: string | null
          error_message: string | null
          id: string
          progress: number | null
          session_id: string
          status: string
          track_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          download_url?: string | null
          error_message?: string | null
          id?: string
          progress?: number | null
          session_id: string
          status?: string
          track_ids: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          download_url?: string | null
          error_message?: string | null
          id?: string
          progress?: number | null
          session_id?: string
          status?: string
          track_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "search_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_urls: {
        Row: {
          created_at: string
          download_url: string | null
          error_message: string | null
          id: string
          status: string
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          download_url?: string | null
          error_message?: string | null
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          download_url?: string | null
          error_message?: string | null
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      search_sessions: {
        Row: {
          ai_prompt: string | null
          album: string
          artist: string
          created_at: string
          id: string
          musicbrainz_data: Json | null
          updated_at: string
          year: number | null
        }
        Insert: {
          ai_prompt?: string | null
          album: string
          artist: string
          created_at?: string
          id?: string
          musicbrainz_data?: Json | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          ai_prompt?: string | null
          album?: string
          artist?: string
          created_at?: string
          id?: string
          musicbrainz_data?: Json | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      tracks: {
        Row: {
          artist: string
          created_at: string
          duration: number | null
          id: string
          musicbrainz_id: string | null
          selected: boolean | null
          session_id: string
          title: string
          track_number: number | null
        }
        Insert: {
          artist: string
          created_at?: string
          duration?: number | null
          id?: string
          musicbrainz_id?: string | null
          selected?: boolean | null
          session_id: string
          title: string
          track_number?: number | null
        }
        Update: {
          artist?: string
          created_at?: string
          duration?: number | null
          id?: string
          musicbrainz_id?: string | null
          selected?: boolean | null
          session_id?: string
          title?: string
          track_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "search_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_urls: {
        Row: {
          created_at: string
          duration: number | null
          id: string
          quality_score: number | null
          title: string | null
          track_id: string
          url: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          id?: string
          quality_score?: number | null
          title?: string | null
          track_id: string
          url: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          id?: string
          quality_score?: number | null
          title?: string | null
          track_id?: string
          url?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_urls_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
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
