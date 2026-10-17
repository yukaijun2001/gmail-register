import { z } from 'zod';
import {
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

/** Accounts are registered with birth years up to and including this year. */
export const MAX_BIRTH_YEAR = 2003;

export const GenderSchema = z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']);
export const ConsentStatusSchema = z.enum(['GRANTED', 'REVOKED']);

const PHONE_INPUT_PATTERN = /^[+\d().\s-]+$/;
const PHONE_ERROR = 'Enter a valid phone number for the selected country';

export const PhoneCountrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSupportedCountry, { message: 'Unsupported phone country' })
  .transform((value) => value as CountryCode);

export const PhoneReferenceSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const phone = PHONE_INPUT_PATTERN.test(value) ? parsePhoneNumberFromString(value) : undefined;
    if (!phone?.isValid()) {
      context.addIssue({ code: 'custom', message: PHONE_ERROR });
      return z.NEVER;
    }
    return phone.number;
  });

export const AccountCreateInputSchema = z
  .object({
    phoneCountry: PhoneCountrySchema.default('US'),
    phoneNumber: z.string().trim().min(1).max(40),
  })
  .transform((input, context) => {
    const phone =
      !input.phoneNumber.startsWith('+') && PHONE_INPUT_PATTERN.test(input.phoneNumber)
        ? parsePhoneNumberFromString(input.phoneNumber, input.phoneCountry)
        : undefined;
    if (!phone?.isValid() || phone.country !== input.phoneCountry) {
      context.addIssue({ code: 'custom', path: ['phoneNumber'], message: PHONE_ERROR });
      return z.NEVER;
    }
    return { phoneReference: phone.number };
  });

export const AccountInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthday: z.coerce
    .date()
    .refine(
      (value) => value.getUTCFullYear() <= MAX_BIRTH_YEAR,
      `Birth year must be ${MAX_BIRTH_YEAR} or earlier`,
    ),
  gender: GenderSchema,
  desiredUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.]{6,30}$/, 'Use 6-30 lowercase letters, numbers, or periods'),
  password: z.string().min(12).max(128),
  phoneReference: PhoneReferenceSchema,
  recoveryEmail: z.string().email().optional().or(z.literal('')),
  consentStatus: ConsentStatusSchema.refine((value) => value === 'GRANTED', {
    message: 'Explicit user consent is required',
  }),
});

export const AccountSummarySchema = AccountInputSchema.omit({ password: true }).extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AccountInput = z.infer<typeof AccountInputSchema>;
export type AccountCreateInput = z.infer<typeof AccountCreateInputSchema>;
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
export type PhoneCountry = z.infer<typeof PhoneCountrySchema>;
