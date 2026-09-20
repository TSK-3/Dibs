// server/secretbox.js — symmetric encryption for provider tokens at rest.
//
// The identity service stores the GitHub access token it exchanged during
// sign-in so it can call the GitHub API later (repository listing). Tokens
// never reach the browser, and they are encrypted in .data/users.json with a
// key derived from the session secret, so a stolen snapshot file alone is not
// enough to replay them.
//
// Envelope format: v1.<iv>.<tag>.<ciphertext>  (base64url parts)
import crypto from 'node:crypto';

const VERSION = 'v1';

function deriveKey(secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('secretbox requires a secret of at least 16 characters');
  }
  // The session secret is already high-entropy (32 random bytes); a plain
  // sha256 keeps the derivation dependency-free and deterministic.
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/** Encrypts a UTF-8 string. Returns the v1 envelope, or null for empty input. */
export function encryptSecret(plaintext, secret) {
  if (plaintext == null || plaintext === '') return null;
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Decrypts a v1 envelope. Returns null for anything malformed or tampered. */
export function decryptSecret(payload, secret) {
  try {
    const [version, ivB64, tagB64, dataB64] = String(payload).split('.');
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
    const key = deriveKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return null; // wrong key, tampered tag, truncated payload — all "no data"
  }
}

/** True when the value looks like a v1 secretbox envelope (never a plaintext). */
export const isSealed = (value) => typeof value === 'string' && value.startsWith(`${VERSION}.`);
