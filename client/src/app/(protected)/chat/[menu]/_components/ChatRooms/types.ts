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
