export type FriendRequest = {
  id: number;
  requester?: { id: number; username: string };
  receiver?: { id: number; username: string };
  status: string;
};

export type FriendEntry = {
  id: number;
  friend: { id: number; username: string };
};

