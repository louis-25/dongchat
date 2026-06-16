// 서버 소켓/REST가 전달하는 메시지 표현 (Design Ref: §4.1 MessageView)
export type IncomingMessage = {
  id?: number;
  roomId?: number;
  sender: string;
  senderId?: number | null;
  message?: string;
  content?: string;
  replyTo?: { id: number; sender: string; message: string } | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  unreadCount?: number;
  createdAt?: string;
};

// 클라이언트 렌더링용 정규화 메시지 (Design Ref: §5)
export type ChatMessage = {
  id: number;
  sender: string;
  senderId: number | null;
  message: string;
  replyTo: { id: number; sender: string; message: string } | null;
  editedAt: string | null;
  deletedAt: string | null;
  unreadCount: number;
  createdAt?: string;
};

// 답장/수정 컨텍스트
export type ComposerContext =
  | { mode: "reply"; target: ChatMessage }
  | { mode: "edit"; target: ChatMessage }
  | null;

export type ChatRoom = {
  id: number;
  name: string | null;
  isGroup: boolean;
  participants?: { user: { id: number; username: string } }[];
};

export type FriendEntry = {
  id: number;
  friend: { id: number; username: string };
};

export type CreateRoomPayload = {
  name?: string;
  participants: string[];
  isGroup: boolean;
};

export type CreateRoomModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoomPayload) => void;
};
