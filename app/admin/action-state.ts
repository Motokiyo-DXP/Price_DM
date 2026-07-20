export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialReviewActionState: ReviewActionState = {
  status: "idle",
  message: "",
};

export type ShopRegistrationActionState = ReviewActionState;

export const initialShopRegistrationActionState: ShopRegistrationActionState = {
  status: "idle",
  message: "",
};
