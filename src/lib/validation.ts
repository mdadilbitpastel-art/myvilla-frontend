// Reusable, framework-agnostic form validators.
// Kept separate from the UI so every form (auth, booking, profile…) shares
// the same rules and error messages.

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

// Pragmatic email check — mirrors what most browsers accept and what
// Django's validate_email will accept on the backend.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Email is required.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  return undefined;
}

export function validateRequired(value: string, label: string): string | undefined {
  if (!value.trim()) return `${label} is required.`;
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return "Password is required.";
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value))
    return "Password must contain letters and numbers.";
  return undefined;
}

export function validateConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return "Please confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return undefined;
}

export function validatePhone(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return "Phone number is required.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "Enter a valid phone number.";
  return undefined;
}

// Returns true when every value in the errors object is undefined/empty.
export function isValid<T extends string>(errors: FieldErrors<T>): boolean {
  return Object.values(errors).every((e) => !e);
}
