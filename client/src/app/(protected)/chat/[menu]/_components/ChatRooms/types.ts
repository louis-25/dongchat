export type IncomingMessage = {
  roomId?: number;
  sender: string;
  message?: string;
  content?: string;
  createdAt?: string;
};

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

