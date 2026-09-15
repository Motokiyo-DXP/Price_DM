export type FriendActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialFriendActionState: FriendActionState = {
  status: "idle",
  message: "",
};
