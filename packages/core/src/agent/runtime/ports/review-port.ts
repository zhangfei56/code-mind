import type { ReviewEngine } from "@code-mind/verify";
import type { ReviewPort } from "../../kernel/ports.js";

export function createReviewPort(reviewEngine: ReviewEngine): ReviewPort {
  return {
    review: (input) => reviewEngine.review(input),
  };
}
