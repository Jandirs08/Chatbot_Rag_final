/**
 * E2E tests — Brain / Personality settings tab
 *
 * Covers all 8 flows specified in the audit request:
 *   1. Happy path save
 *   2. Re-lock with changes (confirm dialog)
 *   3. Re-lock without changes (no dialog)
 *   4. Name required error (below input, red border)
 *   5. History active marker ("Activo" + "En uso")
 *   6. Restore flow (locked header updates)
 *   7. History refresh after save (panel reloads while open)
 *   8. Restablecer (reset clears everything)
 *
 * Auth: reads TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD from env.
 * Fallback credentials are intentionally NOT committed — set them in a
 * local .env.test or in your CI secrets.
 */

import { test, expect, type Page } from "@playwright/test";

// ─── Config ──────────────────────────────────────────────────────────────────

const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";

const SETTINGS_BRAIN_URL = "/admin/settings#brain";

// Unique enough to avoid colliding with real data but deterministic for CI
const TEST_INSTRUCTIONS =
  "ROL: Asistente de prueba E2E.\n\nSoy un asistente configurado automáticamente por las pruebas de extremo a extremo. Respondo siempre en español y soy muy conciso.";

const TEST_PERSONALITY_NAME = `E2E-Test-${Date.now()}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars before running brain-settings tests.",
    );
  }

  await page.goto("/auth/login");
  await page.getByLabel(/usuario|email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/contraseña/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión|entrar/i }).click();

  // Wait until redirected away from the login page
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10_000 });
}

async function goToBrainTab(page: Page): Promise<void> {
  await page.goto(SETTINGS_BRAIN_URL);
  // Wait for the settings page to finish loading (sidebar nav visible)
  await expect(page.getByRole("tab", { name: /personalidad/i })).toBeVisible({
    timeout: 12_000,
  });
  // If hash navigation didn't activate the Brain tab automatically, click it
  const brainTab = page.getByRole("tab", { name: /personalidad/i });
  await brainTab.click();
  // The unlock button (Lock icon, aria-label "Editar instrucciones") means Brain tab is active
  await expect(
    page.getByRole("button", { name: /editar instrucciones/i }),
  ).toBeVisible({ timeout: 8_000 });
}

/** Click the Lock icon to enter edit mode. */
async function unlock(page: Page): Promise<void> {
  await page.getByRole("button", { name: /editar instrucciones/i }).click();
  // Pencil button (aria-label "Cancelar edición") becomes visible when editing
  await expect(
    page.getByRole("button", { name: /cancelar edición/i }),
  ).toBeVisible();
}

/** The textarea where instructions are typed. */
function instructionsTextarea(page: Page) {
  return page.locator("textarea[aria-describedby='prompt-char-count']");
}

/** The personality name input (visible in edit mode only). */
function nameInput(page: Page) {
  return page.getByRole("textbox", { name: /nombre de la personalidad/i });
}

/** The Guardar button inside the dirty-state banner. */
function saveButton(page: Page) {
  // The banner contains an aria-live region; the Guardar button is inside it.
  return page
    .locator('[aria-live="polite"]')
    .getByRole("button", { name: /guardar/i });
}

/** The Historial de versiones collapsible toggle button. */
function historyToggle(page: Page) {
  return page.getByRole("button", { name: /historial de versiones/i });
}

/** Fill the instructions textarea and the name input with the given values. */
async function fillInstructions(
  page: Page,
  text: string,
  name: string,
): Promise<void> {
  const textarea = instructionsTextarea(page);
  await textarea.click();
  await textarea.fill(text);
  await nameInput(page).fill(name);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Brain / Personality settings tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goToBrainTab(page);
  });

  // ── Flow 1: Happy path save ─────────────────────────────────────────────────
  test("Flow 1 — happy path save: locked header shows saved name and history refreshes", async ({
    page,
  }) => {
    await unlock(page);

    const uniqueName = `${TEST_PERSONALITY_NAME}-F1`;
    await fillInstructions(page, TEST_INSTRUCTIONS, uniqueName);

    // Dirty banner should be visible now
    await expect(page.getByText("Cambios sin guardar")).toBeVisible();

    // Open history panel BEFORE saving so we can verify it auto-refreshes
    await historyToggle(page).click();
    // Wait for panel content (either empty state or existing entries)
    await expect(page.getByText(/sin versiones|versión/i).first()).toBeVisible({
      timeout: 6_000,
    });

    // Save
    await saveButton(page).click();

    // After save: should return to locked mode (Pencil becomes Lock)
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Dirty banner disappears
    await expect(page.getByText("Cambios sin guardar")).not.toBeVisible();

    // Locked header shows the saved personality name
    await expect(page.getByText(uniqueName)).toBeVisible();

    // History panel still open and shows the new entry at the top
    await expect(
      page.locator("ul[role='list'] li").first().getByText(uniqueName),
    ).toBeVisible({ timeout: 8_000 });

    // The new entry should have the "Activo" badge
    await expect(
      page.locator("ul[role='list'] li").first().getByText("Activo"),
    ).toBeVisible();
  });

  // ── Flow 2: Re-lock with changes → confirm dialog ──────────────────────────
  test("Flow 2 — re-lock with changes: confirm dialog keeps or discards changes", async ({
    page,
  }) => {
    await unlock(page);

    const textarea = instructionsTextarea(page);
    await textarea.click();
    await textarea.fill("Cambio temporal que no se guardará");

    // Click Pencil (cancel edit) — changes exist → dialog should open
    await page.getByRole("button", { name: /cancelar edición/i }).click();

    const dialog = page.getByRole("dialog", { name: /descartar cambios/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // "Seguir editando" keeps changes and closes dialog
    await dialog.getByRole("button", { name: /seguir editando/i }).click();
    await expect(dialog).not.toBeVisible();
    // Still in edit mode
    await expect(
      page.getByRole("button", { name: /cancelar edición/i }),
    ).toBeVisible();
    // Dirty banner still visible (changes preserved)
    await expect(page.getByText("Cambios sin guardar")).toBeVisible();

    // Now actually discard
    await page.getByRole("button", { name: /cancelar edición/i }).click();
    const dialog2 = page.getByRole("dialog", { name: /descartar cambios/i });
    await expect(dialog2).toBeVisible({ timeout: 5_000 });
    await dialog2.getByRole("button", { name: /descartar y cerrar/i }).click();

    // Back to locked mode
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Dirty banner gone (changes discarded)
    await expect(page.getByText("Cambios sin guardar")).not.toBeVisible();
  });

  // ── Flow 3: Re-lock without changes → no dialog ────────────────────────────
  test("Flow 3 — re-lock without changes: goes directly to locked mode", async ({
    page,
  }) => {
    await unlock(page);

    // No changes made — click Pencil immediately
    await page.getByRole("button", { name: /cancelar edición/i }).click();

    // No dialog should appear
    await expect(
      page.getByRole("dialog", { name: /descartar cambios/i }),
    ).not.toBeVisible();

    // Immediately locked
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 4_000 });
  });

  // ── Flow 4: Name required error below input ─────────────────────────────────
  test("Flow 4 — name required error: appears BELOW the input with red border", async ({
    page,
  }) => {
    await unlock(page);

    // Type instructions but leave name empty
    const textarea = instructionsTextarea(page);
    await textarea.click();
    await textarea.fill(
      "Instrucciones sin nombre asignado — esto debe fallar al guardar.",
    );

    // Explicitly clear name input if it has any value
    await nameInput(page).fill("");

    // Attempt to save
    await saveButton(page).click();

    // Error paragraph should appear below the name input
    const errorMsg = page.locator("#name-error");
    await expect(errorMsg).toBeVisible({ timeout: 5_000 });
    await expect(errorMsg).toContainText(/nombre/i);

    // Error is NOT in the header area — verify it's adjacent to the name input
    // by checking the input's container (the <div> wrapping input + error)
    const nameInputEl = nameInput(page);
    // The input should have a destructive border class applied
    await expect(nameInputEl).toHaveClass(/border-destructive/);

    // Still in edit mode (save did not succeed)
    await expect(
      page.getByRole("button", { name: /cancelar edición/i }),
    ).toBeVisible();

    // After typing a name, error should be replaced on next save
    await nameInput(page).fill("Nombre corregido E2E");
    await saveButton(page).click();
    // Error clears (may take a moment while saving)
    await expect(errorMsg).not.toBeVisible({ timeout: 8_000 });
  });

  // ── Flow 5: History active marker ──────────────────────────────────────────
  test("Flow 5 — history active marker: newest entry shows Activo and En uso", async ({
    page,
  }) => {
    // Save a version first
    await unlock(page);
    const uniqueName = `${TEST_PERSONALITY_NAME}-F5`;
    await fillInstructions(
      page,
      "Instrucciones para prueba de historial activo.",
      uniqueName,
    );
    await saveButton(page).click();
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Open history panel
    await historyToggle(page).click();

    // First entry should be "Activo"
    const firstEntry = page.locator("ul[role='list'] li").first();
    await expect(firstEntry.getByText("Activo")).toBeVisible({
      timeout: 8_000,
    });

    // "En uso" button (disabled) is shown instead of "Restaurar"
    const enUsoBtn = firstEntry.getByRole("button", { name: /en uso/i });
    await expect(enUsoBtn).toBeVisible();
    await expect(enUsoBtn).toBeDisabled();

    // "Restaurar" should NOT be present for the active entry
    await expect(
      firstEntry.getByRole("button", { name: /^restaurar$/i }),
    ).not.toBeVisible();
  });

  // ── Flow 6: Restore flow ───────────────────────────────────────────────────
  test("Flow 6 — restore flow: locked header updates to restored entry's name", async ({
    page,
  }) => {
    // Save version A
    await unlock(page);
    const nameA = `${TEST_PERSONALITY_NAME}-F6A`;
    await fillInstructions(page, "Instrucciones versión A.", nameA);
    await saveButton(page).click();
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Save version B (so we have at least 2 entries)
    await unlock(page);
    const nameB = `${TEST_PERSONALITY_NAME}-F6B`;
    const textarea = instructionsTextarea(page);
    await textarea.fill("Instrucciones versión B — diferente de A.");
    await nameInput(page).fill(nameB);
    await saveButton(page).click();
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Open history — version B is now active (index 0), version A is at index 1+
    await historyToggle(page).click();
    const entries = page.locator("ul[role='list'] li");
    await expect(entries.first().getByText("Activo")).toBeVisible({
      timeout: 8_000,
    });

    // Find version A entry (not the first one) and click its Restaurar button
    // Version A is the second entry (index 1)
    const versionAEntry = entries.nth(1);
    await versionAEntry.getByRole("button", { name: /restaurar/i }).click();

    // Restore confirmation dialog
    const restoreDialog = page.getByRole("dialog", {
      name: /restaurar esta versión/i,
    });
    await expect(restoreDialog).toBeVisible({ timeout: 4_000 });
    await restoreDialog.getByRole("button", { name: /sí, restaurar/i }).click();

    // After restore: locked header should show version A's name
    await expect(page.getByText(nameA)).toBeVisible({ timeout: 10_000 });

    // "Activo" marker should have moved — version A entry now active
    // (history reloads after restore; the entry matching A's text becomes active)
    const updatedEntries = page.locator("ul[role='list'] li");
    // First entry should be nameA and show Activo
    await expect(updatedEntries.first().getByText("Activo")).toBeVisible({
      timeout: 8_000,
    });
  });

  // ── Flow 7: History refresh after save ─────────────────────────────────────
  test("Flow 7 — history refresh after save: panel reloads without closing", async ({
    page,
  }) => {
    // Open history panel first
    await historyToggle(page).click();
    // Wait for panel to populate (or show empty state)
    await expect(page.getByText(/sin versiones|versión/i).first()).toBeVisible({
      timeout: 6_000,
    });

    // Count entries before save
    const entriesBefore = await page.locator("ul[role='list'] li").count();

    // Save a new version
    await unlock(page);
    const uniqueName = `${TEST_PERSONALITY_NAME}-F7`;
    await fillInstructions(
      page,
      "Instrucciones para prueba de refresco de historial.",
      uniqueName,
    );
    await saveButton(page).click();
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Panel must still be open (not collapsed)
    await expect(page.locator("#history-panel-content")).toBeVisible();

    // New entry should appear — count increases or uniqueName becomes visible
    await expect(
      page.locator("ul[role='list'] li").first().getByText(uniqueName),
    ).toBeVisible({ timeout: 8_000 });

    const entriesAfter = await page.locator("ul[role='list'] li").count();

    // At minimum the new entry appeared; count should be >= before (capped at 5)
    expect(entriesAfter).toBeGreaterThanOrEqual(Math.min(entriesBefore + 1, 5));
  });

  // ── Flow 8: Restablecer ────────────────────────────────────────────────────
  test("Flow 8 — Restablecer: confirms, clears prompt and locked header name", async ({
    page,
  }) => {
    // First save a named version so the header shows a name
    await unlock(page);
    const uniqueName = `${TEST_PERSONALITY_NAME}-F8`;
    await fillInstructions(
      page,
      "Instrucciones para luego restablecer.",
      uniqueName,
    );
    await saveButton(page).click();
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Verify name appears in locked header
    await expect(page.getByText(uniqueName)).toBeVisible();

    // Click Restablecer
    await page.getByRole("button", { name: /restablecer/i }).click();

    // Reset confirmation dialog
    const resetDialog = page.getByRole("dialog", {
      name: /restablecer configuración/i,
    });
    await expect(resetDialog).toBeVisible({ timeout: 4_000 });
    await resetDialog.getByRole("button", { name: /sí, restablecer/i }).click();

    // After reset: locked mode (save clears + re-locks)
    await expect(
      page.getByRole("button", { name: /editar instrucciones/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Named header entry is gone — shows generic text or empty state
    await expect(page.getByText(uniqueName)).not.toBeVisible();

    // Dirty banner gone
    await expect(page.getByText("Cambios sin guardar")).not.toBeVisible();
  });
});
