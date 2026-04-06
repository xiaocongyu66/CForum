/**
 * CForum End-to-End Encryption Library
 * Uses Web Crypto API (ECDH P-256 + AES-GCM)
 *
 * Flow:
 *   1. On registration, client generates ECDH key pair
 *   2. Public key is stored on the server (users.e2e_public_key)
 *   3. Private key is stored encrypted in localStorage using a
 *      key derived from the user's password (PBKDF2)
 *   4. When creating an encrypted post/comment, sender encrypts
 *      with recipient's public key + ephemeral ECDH
 *   5. Client decrypts using their private key
 */

const ALGO = { name: 'ECDH', namedCurve: 'P-256' } as const;
const AES  = { name: 'AES-GCM', length: 256 } as const;

// ── Key Generation ────────────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ALGO, true, ['deriveKey', 'deriveBits']);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('spki', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('pkcs8', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', raw, ALGO, true, []);
}

export async function importPrivateKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', raw, ALGO, true, ['deriveKey', 'deriveBits']);
}

// ── PBKDF2 password-based key wrapping ───────────────────────────────────────

async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    AES,
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKeyWithPassword(
  privateKeyB64: string,
  password: string
): Promise<{ encrypted: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveKeyFromPassword(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    enc.encode(privateKeyB64)
  );
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    salt: btoa(String.fromCharCode(...salt)),
    iv:   btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptPrivateKeyWithPassword(
  encrypted: string,
  salt: string,
  iv: string,
  password: string
): Promise<string> {
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  const ivBytes   = Uint8Array.from(atob(iv),   c => c.charCodeAt(0));
  const ctBytes   = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const wrapKey   = await deriveKeyFromPassword(password, saltBytes);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, wrapKey, ctBytes);
  return new TextDecoder().decode(plain);
}

// ── ECDH Encrypt / Decrypt ────────────────────────────────────────────────────

export async function encryptForRecipient(
  plaintext: string,
  recipientPublicKeyB64: string
): Promise<{ ciphertext: string; ephemeralPub: string; iv: string }> {
  const recipientKey = await importPublicKey(recipientPublicKeyB64);

  // Generate ephemeral key pair
  const ephemeral = await generateKeyPair();
  const ephemeralPub = await exportPublicKey(ephemeral.publicKey);

  // Derive shared AES key via ECDH
  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientKey },
    ephemeral.privateKey,
    AES,
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, enc.encode(plaintext));

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    ephemeralPub,
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptFromSender(
  ciphertext: string,
  ephemeralPubB64: string,
  ivB64: string,
  myPrivateKey: CryptoKey
): Promise<string> {
  const ephemeralKey = await importPublicKey(ephemeralPubB64);

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: ephemeralKey },
    myPrivateKey,
    AES,
    false,
    ['decrypt']
  );

  const iv          = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ctBytes     = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ctBytes);
  return new TextDecoder().decode(plainBuffer);
}

// ── Local Key Storage ────────────────────────────────────────────────────────

const LS_PREFIX = 'cforum_e2e_';

export function saveEncryptedPrivateKey(
  userId: number,
  data: { encrypted: string; salt: string; iv: string }
) {
  localStorage.setItem(`${LS_PREFIX}privkey_${userId}`, JSON.stringify(data));
}

export function loadEncryptedPrivateKey(userId: number) {
  const raw = localStorage.getItem(`${LS_PREFIX}privkey_${userId}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as { encrypted: string; salt: string; iv: string }; }
  catch { return null; }
}

export function clearPrivateKey(userId: number) {
  localStorage.removeItem(`${LS_PREFIX}privkey_${userId}`);
}

// ── Setup Flow (call after login) ────────────────────────────────────────────

export async function setupE2EKeys(
  userId: number,
  password: string,
  uploadPublicKey: (b64: string) => Promise<void>
): Promise<void> {
  const existing = loadEncryptedPrivateKey(userId);
  if (existing) return; // Already set up

  const pair = await generateKeyPair();
  const pubB64  = await exportPublicKey(pair.publicKey);
  const privB64 = await exportPrivateKey(pair.privateKey);

  const wrapped = await encryptPrivateKeyWithPassword(privB64, password);
  saveEncryptedPrivateKey(userId, wrapped);
  await uploadPublicKey(pubB64);
}

export async function unlockPrivateKey(
  userId: number,
  password: string
): Promise<CryptoKey | null> {
  const stored = loadEncryptedPrivateKey(userId);
  if (!stored) return null;
  try {
    const privB64 = await decryptPrivateKeyWithPassword(
      stored.encrypted, stored.salt, stored.iv, password
    );
    return importPrivateKey(privB64);
  } catch {
    return null;
  }
}
