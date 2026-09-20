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
      alliance_declines: {
        Row: {
          alliance_id: string
          client_created_at: string
          created_at: string
          deleted_at: string | null
          id: string
          team_id: string
          updated_at: string
          version: number
        }
        Insert: {
          alliance_id: string
          client_created_at: string
          created_at?: string
          deleted_at?: string | null
          id: string
          team_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          alliance_id?: string
          client_created_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          team_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "alliance_declines_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alliance_declines_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      alliance_slots: {
        Row: {
          alliance_id: string
          client_created_at: string
          client_updated_at: string
          created_at: string
          id: string
          slot: string
          team_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          alliance_id: string
          client_created_at: string
          client_updated_at: string
          created_at?: string
          id: string
          slot: string
          team_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          alliance_id?: string
          client_created_at?: string
          client_updated_at?: string
          created_at?: string
          id?: string
          slot?: string
          team_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "alliance_slots_alliance_id_fkey"
            columns: ["alliance_id"]
            isOneToOne: false
            referencedRelation: "alliances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alliance_slots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      alliances: {
        Row: {
          created_at: string
          event_id: string
          id: string
          number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id: string
          number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alliances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          active_event_id: string | null
          active_season_id: string | null
          created_at: string
          id: boolean
          updated_at: string
        }
        Insert: {
          active_event_id?: string | null
          active_season_id?: string | null
          created_at?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          active_event_id?: string | null
          active_season_id?: string | null
          created_at?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_active_event_id_fkey"
            columns: ["active_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_active_season_id_fkey"
            columns: ["active_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      applied_operations: {
        Row: {
          applied_at: string
          op_id: string
        }
        Insert: {
          applied_at?: string
          op_id: string
        }
        Update: {
          applied_at?: string
          op_id?: string
        }
        Relationships: []
      }
      dashboard_charts: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          id: string
          position: number
          span: number
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          dashboard_id: string
          id: string
          position: number
          span: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          id?: string
          position?: number
          span?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_charts_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          created_at: string
          filters: Json
          id: string
          kind: string
          name: string
          scope: Json
          season_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id: string
          kind: string
          name: string
          scope: Json
          season_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          kind?: string
          name?: string
          scope?: Json
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      do_not_pick: {
        Row: {
          client_created_at: string
          client_updated_at: string
          created_at: string
          created_by: string
          deleted_at: string | null
          event_id: string
          id: string
          reason: string
          team_id: string
          updated_at: string
          version: number
        }
        Insert: {
          client_created_at: string
          client_updated_at: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          event_id: string
          id: string
          reason: string
          team_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_created_at?: string
          client_updated_at?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          event_id?: string
          id?: string
          reason?: string
          team_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "do_not_pick_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "do_not_pick_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "do_not_pick_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_teams: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          season_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id: string
          name: string
          season_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          season_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          category: string | null
          config: Json
          created_at: string
          default_value: Json | null
          deprecated: boolean
          description: string | null
          direction: string | null
          display_order: number
          expected_range: Json | null
          form_version_id: string
          help_text: string | null
          id: string
          include_in_ai_context: boolean | null
          is_ordinal: boolean | null
          key: string
          label: string
          phase: string | null
          required: boolean
          section: string | null
          type: string
          unit: string | null
          updated_at: string
          visibility_condition: Json | null
        }
        Insert: {
          category?: string | null
          config?: Json
          created_at?: string
          default_value?: Json | null
          deprecated?: boolean
          description?: string | null
          direction?: string | null
          display_order: number
          expected_range?: Json | null
          form_version_id: string
          help_text?: string | null
          id: string
          include_in_ai_context?: boolean | null
          is_ordinal?: boolean | null
          key: string
          label: string
          phase?: string | null
          required?: boolean
          section?: string | null
          type: string
          unit?: string | null
          updated_at?: string
          visibility_condition?: Json | null
        }
        Update: {
          category?: string | null
          config?: Json
          created_at?: string
          default_value?: Json | null
          deprecated?: boolean
          description?: string | null
          direction?: string | null
          display_order?: number
          expected_range?: Json | null
          form_version_id?: string
          help_text?: string | null
          id?: string
          include_in_ai_context?: boolean | null
          is_ordinal?: boolean | null
          key?: string
          label?: string
          phase?: string | null
          required?: boolean
          section?: string | null
          type?: string
          unit?: string | null
          updated_at?: string
          visibility_condition?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_versions: {
        Row: {
          created_at: string
          form_id: string
          id: string
          is_locked: boolean
          published_at: string | null
          updated_at: string
          version_no: number
        }
        Insert: {
          created_at?: string
          form_id: string
          id: string
          is_locked?: boolean
          published_at?: string | null
          updated_at?: string
          version_no: number
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          is_locked?: boolean
          published_at?: string | null
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          active_version_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          season_id: string
          timer_config: Json
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          id: string
          kind: string
          name: string
          season_id: string
          timer_config?: Json
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          season_id?: string
          timer_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_active_version_fk"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      match_teams: {
        Row: {
          alliance: string
          created_at: string
          id: string
          match_id: string
          station: number
          team_id: string
          updated_at: string
        }
        Insert: {
          alliance: string
          created_at?: string
          id: string
          match_id: string
          station: number
          team_id: string
          updated_at?: string
        }
        Update: {
          alliance?: string
          created_at?: string
          id?: string
          match_id?: string
          station?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_teams_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          event_id: string
          id: string
          match_type: string
          number: number
          official_blue_rp: number | null
          official_blue_score: number | null
          official_red_rp: number | null
          official_red_score: number | null
          official_winner: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id: string
          match_type: string
          number: number
          official_blue_rp?: number | null
          official_blue_score?: number | null
          official_red_rp?: number | null
          official_red_score?: number | null
          official_winner?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          match_type?: string
          number?: number
          official_blue_rp?: number | null
          official_blue_score?: number | null
          official_red_rp?: number | null
          official_red_score?: number | null
          official_winner?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          created_at: string
          definition: Json
          description: string | null
          form_id: string | null
          id: string
          name: string
          season_id: string
          source_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition: Json
          description?: string | null
          form_id?: string | null
          id: string
          name: string
          season_id: string
          source_kind: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: Json
          description?: string | null
          form_id?: string | null
          id?: string
          name?: string
          season_id?: string
          source_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metrics_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_list_entries: {
        Row: {
          client_created_at: string
          client_updated_at: string
          created_at: string
          deleted_at: string | null
          id: string
          note: string | null
          pick_list_id: string
          rank: number
          team_id: string
          updated_at: string
          version: number
        }
        Insert: {
          client_created_at: string
          client_updated_at: string
          created_at?: string
          deleted_at?: string | null
          id: string
          note?: string | null
          pick_list_id: string
          rank: number
          team_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_created_at?: string
          client_updated_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          pick_list_id?: string
          rank?: number
          team_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pick_list_entries_pick_list_id_fkey"
            columns: ["pick_list_id"]
            isOneToOne: false
            referencedRelation: "pick_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_list_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_lists: {
        Row: {
          client_created_at: string
          client_updated_at: string
          created_at: string
          event_id: string
          id: string
          kind: string
          seeded_from_preset_id: string | null
          seeded_from_weights: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          client_created_at: string
          client_updated_at: string
          created_at?: string
          event_id: string
          id: string
          kind: string
          seeded_from_preset_id?: string | null
          seeded_from_weights?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          client_created_at?: string
          client_updated_at?: string
          created_at?: string
          event_id?: string
          id?: string
          kind?: string
          seeded_from_preset_id?: string | null
          seeded_from_weights?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pick_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_lists_seeded_from_preset_id_fkey"
            columns: ["seeded_from_preset_id"]
            isOneToOne: false
            referencedRelation: "weight_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          created_at: string
          field_key: string
          form_id: string
          id: string
          option_points: Json | null
          points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          form_id: string
          id: string
          option_points?: Json | null
          points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          form_id?: string
          id?: string
          option_points?: Json | null
          points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      scouting_entries: {
        Row: {
          alliance: string | null
          breakdown_seconds: number | null
          client_created_at: string
          client_updated_at: string
          created_at: string
          data: Json
          deleted_at: string | null
          event_id: string
          form_kind: string
          form_version_id: string
          id: string
          match_id: string | null
          robot_status: string | null
          scouter_id: string
          team_id: string
          updated_at: string
          version: number
        }
        Insert: {
          alliance?: string | null
          breakdown_seconds?: number | null
          client_created_at: string
          client_updated_at: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          event_id: string
          form_kind: string
          form_version_id: string
          id: string
          match_id?: string | null
          robot_status?: string | null
          scouter_id: string
          team_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          alliance?: string | null
          breakdown_seconds?: number | null
          client_created_at?: string
          client_updated_at?: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          event_id?: string
          form_kind?: string
          form_version_id?: string
          id?: string
          match_id?: string | null
          robot_status?: string | null
          scouter_id?: string
          team_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scouting_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_entries_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_entries_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_entries_scouter_id_fkey"
            columns: ["scouter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scouting_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          field_image_path: string
          game_name: string
          id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          field_image_path: string
          game_name: string
          id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          field_image_path?: string
          game_name?: string
          id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          base_version: number | null
          created_at: string
          duplicate_row_id: string | null
          entity: string
          event_id: string
          id: string
          kind: string
          resolved_at: string | null
          resolved_by: string | null
          row_id: string
          superseded_author_id: string | null
          superseded_client_updated_at: string | null
          superseded_payload: Json | null
          updated_at: string
        }
        Insert: {
          base_version?: number | null
          created_at?: string
          duplicate_row_id?: string | null
          entity: string
          event_id: string
          id: string
          kind: string
          resolved_at?: string | null
          resolved_by?: string | null
          row_id: string
          superseded_author_id?: string | null
          superseded_client_updated_at?: string | null
          superseded_payload?: Json | null
          updated_at?: string
        }
        Update: {
          base_version?: number | null
          created_at?: string
          duplicate_row_id?: string | null
          entity?: string
          event_id?: string
          id?: string
          kind?: string
          resolved_at?: string | null
          resolved_by?: string | null
          row_id?: string
          superseded_author_id?: string | null
          superseded_client_updated_at?: string | null
          superseded_payload?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_superseded_author_id_fkey"
            columns: ["superseded_author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          number?: number
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          disabled_at: string | null
          full_name: string
          id: string
          must_change_password: boolean
          password_hash: string
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          full_name: string
          id: string
          must_change_password?: boolean
          password_hash: string
          role: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          full_name?: string
          id?: string
          must_change_password?: boolean
          password_hash?: string
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      weight_presets: {
        Row: {
          created_at: string
          id: string
          name: string
          season_id: string
          updated_at: string
          weights: Json
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          season_id: string
          updated_at?: string
          weights: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          season_id?: string
          updated_at?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "weight_presets_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
