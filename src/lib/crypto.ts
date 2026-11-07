// Simple password hashing using Web Crypto API (works in Cloudflare Workers)
// Uses PBKDF2 with SHA-256

const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function getKeyMaterial(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await getKeyMaterial(password);
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  
  // Combine salt + hash and encode as base64
  const combined = new Uint8Array(SALT_LENGTH + KEY_LENGTH);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hash), SALT_LENGTH);
  
  return btoa(String.fromCharCode(...combined));
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
  const salt = combined.slice(0, SALT_LENGTH);
  const originalHash = combined.slice(SALT_LENGTH);
  
  const keyMaterial = await getKeyMaterial(password);
  const newHash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  
  // Constant-time comparison
  const newHashArray = new Uint8Array(newHash);
  let result = 0;
  for (let i = 0; i < KEY_LENGTH; i++) {
    result |= originalHash[i] ^ newHashArray[i];
  }
  
  return result === 0;
}
