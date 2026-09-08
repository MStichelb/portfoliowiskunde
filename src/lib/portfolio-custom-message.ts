import { z } from "zod";

export const PORTFOLIO_CUSTOM_TEXT_MAX_LENGTH = 2000;

export const portfolioCustomTextPositionSchema = z.enum(["above_documents", "below_documents"]);

export type PortfolioCustomTextPosition = z.infer<typeof portfolioCustomTextPositionSchema>;

export const portfolioCustomMessageSchema = z.object({
  customText: z.string().max(PORTFOLIO_CUSTOM_TEXT_MAX_LENGTH).transform((value) => value.trim() || null),
  customTextPosition: portfolioCustomTextPositionSchema,
});
