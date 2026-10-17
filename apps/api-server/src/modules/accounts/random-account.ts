import { randomBytes, randomInt } from 'node:crypto';
import { MAX_BIRTH_YEAR, PhoneReferenceSchema, type AccountInput } from '@gmail-manager/contracts';

const FIRST_NAMES = [
  'alex',
  'casey',
  'jamie',
  'jordan',
  'morgan',
  'riley',
  'samuel',
  'taylor',
] as const;

const LAST_NAMES = [
  'adams',
  'bennett',
  'carter',
  'collins',
  'morgan',
  'parker',
  'reed',
  'walker',
] as const;

const GENDERS = ['FEMALE', 'MALE'] as const;
const MIN_BIRTH_YEAR = 1965;
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const NUMBERS = '23456789';
const SYMBOLS = '!@#$%&*?';
const PASSWORD_CHARACTERS = LOWERCASE + UPPERCASE + NUMBERS + SYMBOLS;

function choose<T>(values: readonly T[]): T {
  const value = values[randomInt(values.length)];
  if (value === undefined) throw new Error('Cannot choose from an empty collection');
  return value;
}

function shuffle(value: string): string {
  const characters = [...value];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const current = characters[index];
    const replacement = characters[swapIndex];
    if (current === undefined || replacement === undefined) continue;
    characters[index] = replacement;
    characters[swapIndex] = current;
  }
  return characters.join('');
}

export function generateBirthday(): Date {
  const year = randomInt(MIN_BIRTH_YEAR, MAX_BIRTH_YEAR + 1);
  const month = randomInt(12);
  const day = randomInt(1, 29);
  return new Date(Date.UTC(year, month, day));
}

function generatePassword(): string {
  const required =
    choose([...LOWERCASE]) + choose([...UPPERCASE]) + choose([...NUMBERS]) + choose([...SYMBOLS]);
  const remainder = Array.from({ length: 14 }, () => choose([...PASSWORD_CHARACTERS])).join('');
  return shuffle(required + remainder);
}

export function generateRandomUsername(firstName: string, lastName: string): string {
  const suffix = randomBytes(6).toString('hex');
  const prefix = `${firstName}${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30 - suffix.length);
  return `${prefix}${suffix}`;
}

export function generateRandomAccount(phoneReference: string): AccountInput {
  const firstName = choose(FIRST_NAMES);
  const lastName = choose(LAST_NAMES);

  return {
    firstName,
    lastName,
    birthday: generateBirthday(),
    gender: choose(GENDERS),
    desiredUsername: generateRandomUsername(firstName, lastName),
    password: generatePassword(),
    phoneReference: PhoneReferenceSchema.parse(phoneReference),
    recoveryEmail: '',
    consentStatus: 'GRANTED',
  };
}
