import { z } from "zod";
export const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const money = z.string().regex(/^(0|[1-9][0-9]{0,14})$/);
export const constraintsSchema = z.object({
 query: z.string().min(1).max(600), maxTotal: money,
 quantity: z.number().int().min(1).max(100000), requiredName: z.string().max(300).optional(),
 excludedBrands: z.array(z.string().max(100)).max(50).default([])
}).strict();
export const policySchema = z.object({
 currency: z.string().regex(/^[A-Z]{3}$/).refine(c=>Intl.supportedValuesOf("currency").includes(c),"UNSUPPORTED_CURRENCY").default("KRW"),
 minorDigits: z.number().int().min(0).max(8).default(0),
 maxBudget: money, maxPerTransaction: money, minimumRemaining: money,
 validUntil: z.iso.datetime({offset:true}),
 allowedMerchants: z.array(z.string().max(200)).max(100),
 blockedMerchants: z.array(z.string().max(200)).max(100),
 blockedBrands: z.array(z.string().max(100)).max(100),
 minimumReviewScore: z.number().min(0).max(5).nullable(),
 preferLowerPrice: z.boolean(), preferHigherReviewScore: z.boolean(),
}).strict().refine(p=>p.minorDigits===new Intl.NumberFormat("en",{style:"currency",currency:p.currency}).resolvedOptions().maximumFractionDigits,"CURRENCY_UNIT_MISMATCH");
export type Policy = z.infer<typeof policySchema>;
export type Constraints = z.infer<typeof constraintsSchema>;
export const startSchema = z.object({
 scopeId:id, track:z.enum(["Plan","HardInput"]),
 autoPurchase:z.boolean().default(false),
 input:z.object({query:z.string().min(1).max(600),maxTotal:money.optional(),
 quantity:z.number().int().min(1).max(100000).optional(),requiredName:z.string().max(300).optional()}).strict()
}).strict();
