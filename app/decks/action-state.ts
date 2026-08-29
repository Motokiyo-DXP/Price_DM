export type DeckActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialDeckActionState: DeckActionState = {
  status: "idle",
  message: "",
};
