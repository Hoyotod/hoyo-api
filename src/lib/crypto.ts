// Token encryption at rest (AES-GCM via Web Crypto, Workers-compatible).
// cookieToken is a HoYoverse session secret — never store in plaintext in D1.
//
// Format: "v1:<base64(iv)>:<base64(ciphertext)>"
// Legacy plaintext values (no "v1:" prefix) are returned as-is on decrypt
// so existing rows keep working; new writes are always encrypted. Callers
// should re-save a legacy value via PUT to upgrade it to ciphertext.

const IV_LEN = 12;

function b64Encode(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function b64Decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function buildSecretFromKeyMaterial(keyMaterial: string): string {
  return keyMaterial || "";
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(buildSecretFromKeyMaterial(secret)));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `v1:${b64Encode(iv)}:${b64Encode(new Uint8Array(ct))}`;
}

export async function decryptToken(ciphertext: string, secret: string): Promise<string> {
  if (!ciphertext.startsWith("v1:")) {
    // Legacy plaintext — decrypt is a no-op (lazy upgrade on next write).
    return ciphertext;
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const key = await getKey(secret);
  const iv = b64Decode(parts[1]);
  const data = b64Decode(parts[2]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(pt);
}

// Back-compat aliases — old password helpers removed (better-auth hashes
// credentials itself). Callers must not use these for passwords.
export const encryptCookieToken = encryptToken;
export const decryptCookieToken = decryptToken;
