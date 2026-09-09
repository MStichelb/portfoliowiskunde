import { z } from "zod";

export const ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH = 500;

const htmlPattern = /<\/?[a-z][^>]*>/i;
const markdownPattern = /(^|\n)\s{0,3}(?:#{1,6}\s|>\s|[-+*]\s|\d+\.\s)|```|`[^`]+`|!??\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__/;

export const errorReportTeacherResponseSchema = z.string()
  .transform((value) => value.trim())
  .pipe(z.string()
    .max(ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH)
    .refine((value) => !htmlPattern.test(value) && !markdownPattern.test(value), "Gebruik alleen platte tekst."))
  .transform((value) => value || null);

