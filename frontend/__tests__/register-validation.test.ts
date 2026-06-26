import { describe, it, expect } from "vitest";

// Replication of RegisterForm's validateForm logic as a pure function
// so it can be unit-tested without rendering the full component.
type FormData = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  full_name?: string;
};

function validateForm(formData: FormData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!formData.username.trim()) {
    errors.username = "El nombre de usuario es requerido";
  } else if (formData.username.length < 3) {
    errors.username = "El nombre de usuario debe tener al menos 3 caracteres";
  } else if (formData.username.length > 50) {
    errors.username = "El nombre de usuario no puede tener más de 50 caracteres";
  }

  if (!formData.email.trim()) {
    errors.email = "El email es requerido";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = "Por favor ingresa un email válido";
  }

  if (!formData.password) {
    errors.password = "La contraseña es requerida";
  } else if (formData.password.length < 6) {
    errors.password = "La contraseña debe tener al menos 6 caracteres";
  }

  if (formData.password && formData.password !== formData.confirmPassword) {
    errors.confirmPassword = "Las contraseñas no coinciden";
  }

  return errors;
}

const valid: FormData = {
  username: "jandir",
  email: "hola@campusromero.pe",
  password: "segura123",
  confirmPassword: "segura123",
};

// ── username ──────────────────────────────────────────────────────────────────

describe("validateForm — username", () => {
  it("passes with valid username", () => {
    expect(validateForm(valid)).not.toHaveProperty("username");
  });

  it("fails when empty", () => {
    expect(validateForm({ ...valid, username: "" })).toHaveProperty(
      "username",
      "El nombre de usuario es requerido",
    );
  });

  it("fails when only whitespace", () => {
    expect(validateForm({ ...valid, username: "   " })).toHaveProperty(
      "username",
    );
  });

  it("fails when < 3 chars", () => {
    expect(validateForm({ ...valid, username: "ab" })).toHaveProperty(
      "username",
      "El nombre de usuario debe tener al menos 3 caracteres",
    );
  });

  it("fails when > 50 chars", () => {
    expect(
      validateForm({ ...valid, username: "a".repeat(51) }),
    ).toHaveProperty(
      "username",
      "El nombre de usuario no puede tener más de 50 caracteres",
    );
  });

  it("passes at exactly 3 chars", () => {
    expect(validateForm({ ...valid, username: "abc" })).not.toHaveProperty(
      "username",
    );
  });

  it("passes at exactly 50 chars", () => {
    expect(
      validateForm({ ...valid, username: "a".repeat(50) }),
    ).not.toHaveProperty("username");
  });
});

// ── email ────────────────────────────────────────────────────────────────────

describe("validateForm — email", () => {
  it("passes with valid email", () => {
    expect(validateForm(valid)).not.toHaveProperty("email");
  });

  it("fails when empty", () => {
    expect(validateForm({ ...valid, email: "" })).toHaveProperty(
      "email",
      "El email es requerido",
    );
  });

  it("fails with invalid format", () => {
    expect(
      validateForm({ ...valid, email: "no-es-email" }),
    ).toHaveProperty("email", "Por favor ingresa un email válido");
  });

  it("fails without domain", () => {
    expect(validateForm({ ...valid, email: "test@" })).toHaveProperty("email");
  });
});

// ── password ──────────────────────────────────────────────────────────────────

describe("validateForm — password", () => {
  it("passes with valid password", () => {
    expect(validateForm(valid)).not.toHaveProperty("password");
  });

  it("fails when empty", () => {
    expect(
      validateForm({ ...valid, password: "", confirmPassword: "" }),
    ).toHaveProperty("password", "La contraseña es requerida");
  });

  it("fails when < 6 chars", () => {
    expect(
      validateForm({ ...valid, password: "abc12", confirmPassword: "abc12" }),
    ).toHaveProperty(
      "password",
      "La contraseña debe tener al menos 6 caracteres",
    );
  });

  it("passes at exactly 6 chars", () => {
    expect(
      validateForm({ ...valid, password: "abc123", confirmPassword: "abc123" }),
    ).not.toHaveProperty("password");
  });
});

// ── confirmPassword ───────────────────────────────────────────────────────────

describe("validateForm — confirmPassword", () => {
  it("passes when passwords match", () => {
    expect(validateForm(valid)).not.toHaveProperty("confirmPassword");
  });

  it("fails when passwords do not match", () => {
    expect(
      validateForm({ ...valid, confirmPassword: "diferente" }),
    ).toHaveProperty("confirmPassword", "Las contraseñas no coinciden");
  });

  it("does not add confirmPassword error when password is empty", () => {
    expect(
      validateForm({ ...valid, password: "", confirmPassword: "algo" }),
    ).not.toHaveProperty("confirmPassword");
  });
});

// ── full valid form ───────────────────────────────────────────────────────────

describe("validateForm — full valid form", () => {
  it("returns no errors for a fully valid form", () => {
    expect(Object.keys(validateForm(valid))).toHaveLength(0);
  });

  it("returns all errors when all fields are empty", () => {
    const errors = validateForm({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
    expect(errors).toHaveProperty("username");
    expect(errors).toHaveProperty("email");
    expect(errors).toHaveProperty("password");
  });
});
