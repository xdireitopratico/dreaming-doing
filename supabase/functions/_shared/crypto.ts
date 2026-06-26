/**
 * AES-256-GCM encryption for platform secrets.
 * Key derived via HKDF from PLATFORM_SECRETS_KEY (or SUPABASE_SERVICE_ROLE_KEY fallback).
 */

const ENC_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const SALT = new TextEncoder().encode("platform_secrets_v1");
const INFO = new TextEncoder().encode("aes-256-gcm");

let _cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const raw = Deno.env.get("PLATFORM_SECRETS_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!raw) throw new Error("No encryption key available (set PLATFORM_SECRETS_KEY)");

  if (!Deno.env.get("PLATFORM_SECRETS_KEY")) {
    console.warn(
      "[crypto] PLATFORM_SECRETS_KEY not set — deriving from SUPABASE_SERVICE_ROLE_KEY. " +
        "Set a dedicated key for production.",
    );
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw),
    "HKDF",
    false,
    ["deriveKey"],
  );

  _cachedKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return _cachedKey;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv);
  combined.set(ct, iv.length);
  return ENC_PREFIX + toBase64(combined);
}

export async function decryptSecret(stored: string): Promise<string> {
  if (!isEncrypted(stored)) return stored;

  const key = await getEncryptionKey();
  const raw = fromBase64(stored.slice(ENC_PREFIX.length));
  const iv = raw.slice(0, IV_BYTES);
  const ct = raw.slice(IV_BYTES);

  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plainBuf);
}
