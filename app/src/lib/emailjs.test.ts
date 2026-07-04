import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildEmailJsRequestBody,
  EMAILJS_SEND_URL,
  EMAILJS_STORAGE_KEY,
  isEmailJsConfigComplete,
  loadEmailJsConfig,
  saveEmailJsConfig,
  sendClaimEmail,
  type EmailJsConfig,
  type KeyValueStorage,
} from "./emailjs";

/** Trivial in-memory stand-in for `localStorage`, for tests that don't want a DOM. */
function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const CONFIG: EmailJsConfig = {
  serviceId: "service_abc",
  templateId: "template_def",
  publicKey: "pk_123",
};

describe("isEmailJsConfigComplete", () => {
  it("is false for null/undefined", () => {
    expect(isEmailJsConfigComplete(null)).toBe(false);
    expect(isEmailJsConfigComplete(undefined)).toBe(false);
  });

  it("is false when any field is empty or whitespace", () => {
    expect(isEmailJsConfigComplete({ ...CONFIG, serviceId: "" })).toBe(false);
    expect(isEmailJsConfigComplete({ ...CONFIG, templateId: "   " })).toBe(false);
    expect(isEmailJsConfigComplete({ ...CONFIG, publicKey: "" })).toBe(false);
  });

  it("is true when all fields are non-empty", () => {
    expect(isEmailJsConfigComplete(CONFIG)).toBe(true);
  });
});

describe("config round-trip via injected storage", () => {
  it("returns null when nothing is saved", () => {
    expect(loadEmailJsConfig(memoryStorage())).toBeNull();
  });

  it("saves and reloads the same config", () => {
    const storage = memoryStorage();
    saveEmailJsConfig(CONFIG, storage);
    expect(loadEmailJsConfig(storage)).toEqual(CONFIG);
  });

  it("writes under the documented storage key", () => {
    const storage = memoryStorage();
    saveEmailJsConfig(CONFIG, storage);
    expect(storage.getItem(EMAILJS_STORAGE_KEY)).toBe(JSON.stringify(CONFIG));
  });

  it("returns null for malformed JSON", () => {
    const storage = memoryStorage();
    storage.setItem(EMAILJS_STORAGE_KEY, "{not json");
    expect(loadEmailJsConfig(storage)).toBeNull();
  });

  it("returns null when the saved shape is missing fields", () => {
    const storage = memoryStorage();
    storage.setItem(EMAILJS_STORAGE_KEY, JSON.stringify({ serviceId: "only-this" }));
    expect(loadEmailJsConfig(storage)).toBeNull();
  });
});

describe("buildEmailJsRequestBody", () => {
  it("maps config + input onto EmailJS's expected field names", () => {
    const body = buildEmailJsRequestBody(CONFIG, {
      toEmail: "alice@example.com",
      claimLink: "https://blinddrop.example/claim#pkt=abc",
      recipientAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(body).toEqual({
      service_id: "service_abc",
      template_id: "template_def",
      user_id: "pk_123",
      template_params: {
        to_email: "alice@example.com",
        claim_link: "https://blinddrop.example/claim#pkt=abc",
        recipient_address: "0x1111111111111111111111111111111111111111",
      },
    });
  });
});

describe("sendClaimEmail", () => {
  const input = {
    toEmail: "alice@example.com",
    claimLink: "https://blinddrop.example/claim#pkt=abc",
    recipientAddress: "0x1111111111111111111111111111111111111111",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the EmailJS REST endpoint with the built body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendClaimEmail(CONFIG, input);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      EMAILJS_SEND_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(buildEmailJsRequestBody(CONFIG, input)),
      })
    );
  });

  it("surfaces the response body text on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422, text: async () => "Template not found" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendClaimEmail(CONFIG, input);

    expect(result).toEqual({ ok: false, message: "Template not found" });
  });

  it("falls back to a generic message when the failure body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendClaimEmail(CONFIG, input);

    expect(result).toEqual({ ok: false, message: "EmailJS request failed (500)" });
  });

  it("surfaces a network/thrown error's message", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendClaimEmail(CONFIG, input);

    expect(result).toEqual({ ok: false, message: "network down" });
  });
});
