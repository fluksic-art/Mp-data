import { z } from "zod/v4";

export const leadSourceSchema = z.enum([
  "whatsapp_cta",
  "contact_form",
  "phone_click",
  "other",
]);
export type LeadSource = z.infer<typeof leadSourceSchema>;

export const leadSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  source: leadSourceSchema,
  name: z.string().nullable().default(null),
  email: z.string().email().nullable().default(null),
  phone: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
  locale: z.enum(["es", "en", "fr"]).default("es"),
  createdAt: z.string().datetime(),
});
export type Lead = z.infer<typeof leadSchema>;

export const createLeadSchema = leadSchema.pick({
  propertyId: true,
  source: true,
  name: true,
  email: true,
  phone: true,
  message: true,
  locale: true,
});
export type CreateLead = z.infer<typeof createLeadSchema>;
