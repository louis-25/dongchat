export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      chat_room_participants: {
        Row: {
          joined_at: string;
          last_read_message_id: number | null;
          room_id: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          joined_at?: string;
          last_read_message_id?: number | null;
          room_id: number;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          last_read_message_id?: number | null;
          room_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_room_participants_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "chat_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_room_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_rooms: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: number;
          is_group: boolean;
          name: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_group?: boolean;
          name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_group?: boolean;
          name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_rooms_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friends: {
        Row: {
          created_at: string;
          id: number;
          receiver_id: string;
          requester_id: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          receiver_id: string;
          requester_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          receiver_id?: string;
          requester_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friends_receiver_id_fkey";
            columns: ["receiver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friends_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: number;
          image_path: string | null;
          reply_to_id: number | null;
          room_id: number;
          sender_id: string | null;
          sticker: string | null;
        };
        ComputedFields: never;
        Insert: {
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: never;
          image_path?: string | null;
          reply_to_id?: number | null;
          room_id: number;
          sender_id?: string | null;
          sticker?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: never;
          image_path?: string | null;
          reply_to_id?: number | null;
          room_id?: number;
          sender_id?: string | null;
          sticker?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey";
            columns: ["reply_to_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "chat_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          nickname: string | null;
          status_message: string | null;
          updated_at: string;
          username: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          nickname?: string | null;
          status_message?: string | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          nickname?: string | null;
          status_message?: string | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: number;
          p256dh: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: never;
          p256dh: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: never;
          p256dh?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: {
        Args: { p_code: string };
        Returns: {
          already: boolean;
          username: string;
        }[];
      };
      admin_ban: {
        Args: { p_reason?: string; p_until: string; p_user_id: string };
        Returns: undefined;
      };
      admin_force_logout: { Args: { p_user_id: string }; Returns: undefined };
      admin_list_rooms: {
        Args: { p_limit?: number; p_page?: number };
        Returns: Json;
      };
      admin_list_users: {
        Args: {
          p_limit?: number;
          p_order?: string;
          p_page?: number;
          p_sort?: string;
        };
        Returns: Json;
      };
      admin_unban: { Args: { p_user_id: string }; Returns: undefined };
      create_room: {
        Args: { p_is_group: boolean; p_name: string; p_usernames: string[] };
        Returns: number;
      };
      delete_message: { Args: { p_id: number }; Returns: undefined };
      edit_message: {
        Args: { p_content: string; p_id: number };
        Returns: undefined;
      };
      get_me: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_invite_code: { Args: Record<PropertyKey, never>; Returns: string };
      is_username_available: { Args: { p_username: string }; Returns: boolean };
      kick_member: {
        Args: { p_room_id: number; p_user_id: string };
        Returns: undefined;
      };
      leave_room: { Args: { p_room_id: number }; Returns: undefined };
      list_my_rooms: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          is_group: boolean;
          last_message_at: string;
          last_message_content: string;
          last_message_deleted: boolean;
          last_message_id: number;
          last_message_sender_id: string;
          member_count: number;
          name: string;
          room_id: number;
          unread_count: number;
          last_message_sticker: string;
          muted: boolean;
        }[];
      };
      invite_to_room: { Args: { p_room_id: number; p_usernames: string[] }; Returns: undefined };
      mark_read: { Args: { p_room_id: number }; Returns: number };
      set_reaction: { Args: { p_message_id: number; p_reaction: string }; Returns: undefined };
      set_room_muted: { Args: { p_room_id: number; p_muted: boolean }; Returns: undefined };
      set_room_notice: { Args: { p_room_id: number; p_message_id: number | null }; Returns: undefined };
      search_messages: {
        Args: { p_room_id: number; p_query: string; p_before_id: number | null };
        Returns: { id: number; sender_id: string | null; sender_name: string | null; content: string; created_at: string }[];
      };
      open_direct_room: { Args: { p_username: string }; Returns: number };
      preview_invite: {
        Args: { p_code: string };
        Returns: {
          avatar_url: string;
          nickname: string;
          username: string;
        }[];
      };
      push_targets: {
        Args: { p_message_id: number };
        Returns: {
          auth: string;
          body: string;
          endpoint: string;
          p256dh: string;
          room_id: number;
          sticker: string;
          title: string;
        }[];
      };
      register_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string };
        Returns: undefined;
      };
      reset_my_invite_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      respond_friend_request: {
        Args: { p_action: string; p_id: number };
        Returns: undefined;
      };
      send_friend_request: {
        Args: { p_username: string };
        Returns: {
          created_at: string;
          id: number;
          receiver_id: string;
          requester_id: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "friends";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
