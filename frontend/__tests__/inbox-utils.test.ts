import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  colorFromId,
  humanizeId,
  getInitials,
  getScoreTone,
  getScoreStyle,
  displayLabel,
  getMessageKey,
  formatRelativeAgo,
  type HistoryItem,
} from "@/app/admin/inbox/_components/utils";

// ── colorFromId ──────────────────────────────────────────────────────────────

describe("colorFromId", () => {
  it("returns a valid hsl string", () => {
    expect(colorFromId("abc123")).toMatch(/^hsl\(\d+deg 65% 85%\)$/);
  });

  it("returns same color for same id", () => {
    expect(colorFromId("test-id")).toBe(colorFromId("test-id"));
  });

  it("returns different colors for different ids", () => {
    expect(colorFromId("id-a")).not.toBe(colorFromId("id-b"));
  });
});

// ── humanizeId ───────────────────────────────────────────────────────────────

describe("humanizeId", () => {
  it("returns unknown label for null", () => {
    expect(humanizeId(null)).toBe("Usuario Desconocido");
  });

  it("returns unknown label for undefined", () => {
    expect(humanizeId(undefined)).toBe("Usuario Desconocido");
  });

  it("returns last 4 hex chars uppercased", () => {
    expect(humanizeId("abc123def456")).toBe("Visitante #F456");
  });

  it("returns 0000 fallback for non-hex id", () => {
    expect(humanizeId("zzzz")).toBe("Visitante #0000");
  });
});

// ── getInitials ───────────────────────────────────────────────────────────────

describe("getInitials", () => {
  it("uses first letters of two-word name", () => {
    expect(getInitials("Juan Pérez")).toBe("JP");
  });

  it("uses first two chars for single-word name", () => {
    expect(getInitials("Carlos")).toBe("CA");
  });

  it("falls back to last 2 chars of id when no name", () => {
    expect(getInitials(null, "abc123ef")).toBe("EF");
  });

  it("returns ?? when no name and no id", () => {
    expect(getInitials(null, "")).toBe("??");
  });
});

// ── getScoreTone ─────────────────────────────────────────────────────────────

describe("getScoreTone", () => {
  it("returns success for score >= 71", () => {
    expect(getScoreTone(71)).toBe("success");
    expect(getScoreTone(100)).toBe("success");
  });

  it("returns warning for score 41–70", () => {
    expect(getScoreTone(41)).toBe("warning");
    expect(getScoreTone(70)).toBe("warning");
  });

  it("returns error for score <= 40", () => {
    expect(getScoreTone(0)).toBe("error");
    expect(getScoreTone(40)).toBe("error");
  });
});

// ── getScoreStyle ────────────────────────────────────────────────────────────

describe("getScoreStyle", () => {
  it("returns correct label for success", () => {
    expect(getScoreStyle(90).label).toBe("Listo para comprar");
  });

  it("returns correct label for warning", () => {
    expect(getScoreStyle(50).label).toBe("Interés moderado");
  });

  it("returns correct label for error", () => {
    expect(getScoreStyle(20).label).toBe("Sin interés claro");
  });
});

// ── displayLabel ─────────────────────────────────────────────────────────────

describe("displayLabel", () => {
  it("returns name when provided", () => {
    expect(displayLabel({ name: "Ana García" })).toBe("Ana García");
  });

  it("returns channel + last 4 digits of numeric external id", () => {
    expect(
      displayLabel({ channel: "whatsapp", externalId: "+51987654321" }),
    ).toBe("WhatsApp · 4321");
  });

  it("falls back to humanizeId when no channel and no name", () => {
    const label = displayLabel({ conversationId: "abc123ef" });
    expect(label).toMatch(/^Visitante #/);
  });
});

// ── getMessageKey ────────────────────────────────────────────────────────────

describe("getMessageKey", () => {
  it("uses id field when present", () => {
    const msg = {
      role: "user",
      content: "hola",
      id: "msg-42",
    } as HistoryItem & { id: string };
    expect(getMessageKey(msg as unknown as HistoryItem, 0)).toBe("msg-42");
  });

  it("uses timestamp when no id", () => {
    const msg: HistoryItem = {
      role: "user",
      content: "hola",
      timestamp: "2024-01-01T00:00:00Z",
    };
    const key = getMessageKey(msg, 0);
    expect(key).toContain("user-");
  });

  it("generates stable key without timestamp", () => {
    const msg: HistoryItem = { role: "user", content: "hola" };
    expect(getMessageKey(msg, 0)).toBe(getMessageKey(msg, 0));
  });
});

// ── formatRelativeAgo ────────────────────────────────────────────────────────

describe("formatRelativeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'ahora mismo' for < 30s", () => {
    const d = new Date("2024-01-01T11:59:45Z");
    expect(formatRelativeAgo(d)).toBe("ahora mismo");
  });

  it("returns seconds for 30s–60s", () => {
    const d = new Date("2024-01-01T11:59:00Z");
    expect(formatRelativeAgo(d)).toBe("hace 60s");
  });

  it("returns minutes for < 1h", () => {
    const d = new Date("2024-01-01T11:30:00Z");
    expect(formatRelativeAgo(d)).toBe("hace 30 min");
  });

  it("returns hours for < 24h", () => {
    const d = new Date("2024-01-01T09:00:00Z");
    expect(formatRelativeAgo(d)).toBe("hace 3h");
  });

  it("returns days for >= 24h", () => {
    const d = new Date("2023-12-30T12:00:00Z");
    expect(formatRelativeAgo(d)).toBe("hace 2d");
  });
});
