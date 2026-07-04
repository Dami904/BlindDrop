/**
 * Pure-ish helpers for the optional "auto-send claim emails" feature.
 *
 * BlindDrop has no server, so bulk-sending claim-link emails is done straight
 * from the admin's browser through their OWN EmailJS account (a free
 * third-party transactional-email API: https://www.emailjs.com/). BlindDrop
 * itself never sees the recipient list or forwards it anywhere — the browser
 * talks directly to EmailJS's REST API using credentials the admin enters
 * and stores locally.
 *
 * Kept dependency-free (plain fetch, no SDK) and framework-free so the
 * config/storage/request-shaping logic is trivially unit-testable without a
 * live network call.
 */

export interface EmailJsConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
}

/** Minimal storage shape so tests can inject an in-memory stand-in for `localStorage`. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMAILJS_STORAGE_KEY = "blinddrop:emailjs:v1";

function isEmailJsConfig(value: unknown): value is EmailJsConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.serviceId === "string" &&
    typeof v.templateId === "string" &&
    typeof v.publicKey === "string"
  );
}

/** True when every field of `config` is non-empty (whitespace-trimmed). */
export function isEmailJsConfigComplete(config: EmailJsConfig | null | undefined): config is EmailJsConfig {
  if (!config) return false;
  return (
    config.serviceId.trim().length > 0 &&
    config.templateId.trim().length > 0 &&
    config.publicKey.trim().length > 0
  );
}

/** Reads the saved EmailJS config from `storage` (defaults to `window.localStorage`). Returns `null` if absent or malformed. */
export function loadEmailJsConfig(storage?: KeyValueStorage): EmailJsConfig | null {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!store) return null;
  const raw = store.getItem(EMAILJS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEmailJsConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persists `config` to `storage` (defaults to `window.localStorage`). */
export function saveEmailJsConfig(config: EmailJsConfig, storage?: KeyValueStorage): void {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!store) return;
  store.setItem(EMAILJS_STORAGE_KEY, JSON.stringify(config));
}

/**
 * The app-provided EmailJS config, baked in at build time via
 * `NEXT_PUBLIC_*` env vars. Any/all of these may be `undefined` — e.g. an
 * unconfigured deployment, or a fork run without the app's own EmailJS
 * account.
 */
export interface EmailJsEnvConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
}

/** Reads the build-time env config. Only call this at the edge (component/hook) — kept out of `resolveEmailJsConfig` itself so tests can inject env values directly instead of stubbing `process.env`. */
export function readEmailJsEnvConfig(): EmailJsEnvConfig {
  return {
    serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
    templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
    publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
  };
}

export type EmailJsConfigSource = "saved" | "env" | "none";

export interface ResolvedEmailJsConfig {
  /** The config to send with, or `null` if neither source is complete. */
  config: EmailJsConfig | null;
  /** Which source `config` came from. */
  source: EmailJsConfigSource;
  /** True when the app ships a complete env-provided config, regardless of
   * whether a saved override ends up winning. Drives whether the panel can
   * hide its setup fields by default. */
  envConfigured: boolean;
}

/**
 * Resolves the EmailJS config to actually send with.
 *
 * Precedence: a complete user-saved (localStorage) config always wins —
 * it's an explicit "use my own account" choice — otherwise the app-provided
 * build-time env config is used as the default, so a normal admin never has
 * to see or fill in a setup form.
 *
 * `env` and `storage` are both injectable so this is fully unit-testable
 * without touching `process.env` or the real `localStorage`.
 */
export function resolveEmailJsConfig(options?: {
  env?: EmailJsEnvConfig;
  storage?: KeyValueStorage;
}): ResolvedEmailJsConfig {
  const env = options?.env ?? readEmailJsEnvConfig();
  const envConfig: EmailJsConfig = {
    serviceId: env.serviceId ?? "",
    templateId: env.templateId ?? "",
    publicKey: env.publicKey ?? "",
  };
  const envComplete = isEmailJsConfigComplete(envConfig);

  const saved = loadEmailJsConfig(options?.storage);
  if (isEmailJsConfigComplete(saved)) {
    return { config: saved, source: "saved", envConfigured: envComplete };
  }
  if (envComplete) {
    return { config: envConfig, source: "env", envConfigured: true };
  }
  return { config: null, source: "none", envConfigured: false };
}

export interface ClaimEmailInput {
  toEmail: string;
  claimLink: string;
  recipientAddress: string;
}

/** Builds the exact JSON body EmailJS's REST API expects for `/api/v1.0/email/send`. Pure — no I/O. */
export function buildEmailJsRequestBody(config: EmailJsConfig, input: ClaimEmailInput) {
  return {
    service_id: config.serviceId,
    template_id: config.templateId,
    user_id: config.publicKey,
    template_params: {
      to_email: input.toEmail,
      claim_link: input.claimLink,
      recipient_address: input.recipientAddress,
    },
  };
}

export const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

export type SendClaimEmailResult = { ok: true } | { ok: false; message: string };

/**
 * Sends one claim-link email via the EmailJS REST API. EmailJS responds with
 * a plain `200 OK` body of the text `"OK"` on success; on failure it responds
 * with a non-200 status and a plain-text error body — surfaced verbatim (or a
 * generic fallback) as `message`.
 */
export async function sendClaimEmail(
  config: EmailJsConfig,
  input: ClaimEmailInput
): Promise<SendClaimEmailResult> {
  try {
    const res = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEmailJsRequestBody(config, input)),
    });
    if (res.ok) {
      return { ok: true };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, message: text.trim() || `EmailJS request failed (${res.status})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
