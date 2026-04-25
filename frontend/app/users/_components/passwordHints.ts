export interface PasswordHints {
  len: boolean;
  upper: boolean;
  special: boolean;
}

export const EMPTY_HINTS: PasswordHints = {
  len: false,
  upper: false,
  special: false,
};

export function evaluatePassword(value: string): PasswordHints {
  return {
    len: value.length >= 8,
    upper: /[A-Z]/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
}

export function isValidPassword(hints: PasswordHints): boolean {
  return hints.len && hints.upper && hints.special;
}
