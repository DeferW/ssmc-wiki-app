import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_DRAFT_KEY } from "./constants";
import { makeAdminDocument, normalizeApiDocument, readAdminDraft, readApiError } from "./adminApi";

describe("normalizeApiDocument", () => {
  it("keeps a valid category and hidden flag", () => {
    const result = normalizeApiDocument({
      schemaVersion: 1,
      items: { RMCWeaponPistolM13: { category: "Оружие", hidden: true } },
    });
    expect(result).toEqual({ RMCWeaponPistolM13: { category: "Оружие", hidden: true } });
  });

  it("drops a category that is not in CATEGORY_ORDER", () => {
    const result = normalizeApiDocument({
      schemaVersion: 1,
      items: { Foo: { category: "Не существующая категория" } },
    });
    expect(result).toEqual({});
  });

  it("drops an entry with neither category nor hidden", () => {
    const result = normalizeApiDocument({
      schemaVersion: 1,
      items: { Foo: { note: "irrelevant" } },
    });
    expect(result).toEqual({});
  });

  it("accepts a bare items map without the schemaVersion wrapper", () => {
    const result = normalizeApiDocument({ Foo: { hidden: false } });
    expect(result).toEqual({ Foo: { hidden: false } });
  });

  it("returns an empty draft for non-object input", () => {
    expect(normalizeApiDocument(null)).toEqual({});
    expect(normalizeApiDocument("garbage")).toEqual({});
  });
});

describe("makeAdminDocument", () => {
  it("wraps items with schemaVersion 1", () => {
    const items = { Foo: { hidden: true } };
    expect(makeAdminDocument(items)).toEqual({ schemaVersion: 1, items });
  });
});

describe("readApiError", () => {
  it("extracts the error field when present", () => {
    expect(readApiError({ error: "Неверный пароль" }, "fallback")).toBe("Неверный пароль");
  });

  it("falls back when there is no error field", () => {
    expect(readApiError({ ok: true }, "fallback")).toBe("fallback");
    expect(readApiError(null, "fallback")).toBe("fallback");
  });
});

describe("readAdminDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty draft when nothing is stored", () => {
    expect(readAdminDraft()).toEqual({});
  });

  it("reads back a previously stored draft", () => {
    window.localStorage.setItem(
      ADMIN_DRAFT_KEY,
      JSON.stringify({ Foo: { category: "Броня", hidden: true } }),
    );
    expect(readAdminDraft()).toEqual({ Foo: { category: "Броня", hidden: true } });
  });

  it("ignores malformed JSON instead of throwing", () => {
    window.localStorage.setItem(ADMIN_DRAFT_KEY, "{not json");
    expect(readAdminDraft()).toEqual({});
  });

  it("skips entries that are not objects", () => {
    window.localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify({ Foo: "not an override" }));
    expect(readAdminDraft()).toEqual({});
  });
});
