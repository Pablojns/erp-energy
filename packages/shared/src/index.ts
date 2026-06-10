import { z } from "zod";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  timestamp: z.string().datetime()
});

export type HealthDto = z.infer<typeof healthSchema>;
