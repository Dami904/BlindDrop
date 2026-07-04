import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildEmailJsRequestBody,
  EMAILJS_SEND_URL,
  EMAILJS_STORAGE_KEY,
  isEmailJsConfigComplete,
  loadEmailJsConfig,
  resolveEmailJsConfig,
  saveEmailJsConfig,
  sendClaimEmail,
  type EmailJsConfig,
  type EmailJsEnvConfig,
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

const ENV_CONFIG: EmailJsEnvConfig = {
  serviceId: "service_env",
  templateId: "template_env",
  publicKey: "pk_env",
};

const OVERRIDE_CONFIG: EmailJsConfig = {
  serviceId: "service_own",
  templateId: "template_own",
  publicKey: "pk_own",
};

describe("resolveEmailJsConfig", () => {
  it("resolves to 'none' when neither env nor a saved config is present", () => {
    const storage = memoryStorage();
    const resolved = resolveEmailJsConfig({ env: {}, storage });
    expect(resolved).toEqual({ config: null, source: "none", envConfigured: false });
  });

  it("falls back to the env config when no saved override exists", () => {
    const storage = memoryStorage();
    const resolved = resolveEmailJsConfig({ env: ENV_CONFIG, storage });
    expect(resolved).toEqual({
      config: { serviceId: "service_env", templateId: "template_env", publicKey: "pk_env" },
      source: "env",
      envConfigured: true,
    });
  });

  it("prefers a complete saved override over the env config", () => {
    const storage = memoryStorage();
    saveEmailJsConfig(OVERRIDE_CONFIG, storage);
    const resolved = resolveEmailJsConfig({ env: ENV_CONFIG, storage });
    expect(resolved).toEqual({ config: OVERRIDE_CONFIG, source: "saved", envConfigured: true });
  });

  it("ignores an incomplete saved config and falls back to env", () => {
    const storage = memoryStorage();
    storage.setItem(EMAILJS_STORAGE_KEY, JSON.stringify({ ...OVERRIDE_CONFIG, publicKey: "" }));
    const resolved = resolveEmailJsConfig({ env: ENV_CONFIG, storage });
    expect(resolved.source).toBe("env");
    expect(resolved.config).toEqual({ serviceId: "service_env", templateId: "template_env", publicKey: "pk_env" });
  });

  it("ignores a partial env config (missing fields count as unset)", () => {
    const storage = memoryStorage();
    const resolved = resolveEmailJsConfig({ env: { serviceId: "service_env" }, storage });
    expect(resolved).toEqual({ config: null, source: "none", envConfigured: false });
  });

  it("is 'none' when neither source is complete, even with a saved-but-incomplete config", () => {
    const storage = memoryStorage();
    storage.setItem(EMAILJS_STORAGE_KEY, JSON.stringify({ serviceId: "only-this" }));
    const resolved = resolveEmailJsConfig({ env: {}, storage });
    expect(resolved).toEqual({ config: null, source: "none", envConfigured: false });
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
