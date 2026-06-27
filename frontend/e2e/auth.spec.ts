import { test, expect } from "@playwright/test";

test.describe("Login flow", () => {
  test("login page loads and shows form", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/usuario|email/i)).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /iniciar sesión|entrar/i }),
    ).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/usuario|email/i).fill("usuario_invalido");
    await page.getByLabel(/contraseña/i).fill("wrongpassword");
    await page.getByRole("button", { name: /iniciar sesión|entrar/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 8000 });
  });

  test("unauthenticated access to admin redirects to login", async ({
    page,
  }) => {
    await page.goto("/admin/inbox");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 8000 });
  });
});
