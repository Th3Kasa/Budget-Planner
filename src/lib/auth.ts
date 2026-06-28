// Local app-lock: a hashed PIN and an optional real WebAuthn (Face ID /
// fingerprint) credential that gate the dashboard once the Supabase session is
// established. Everything here is client-side and opt-in — if no PIN is set the
// app never locks, preserving the original behaviour.
//
// The PIN is never stored in plaintext: it's run through PBKDF2-SHA-256 with a
// per-device random salt. WebAuthn uses the platform authenticator for a real
// biometric check (there's no server to verify the signature, so a successful
// local assertion is treated as proof of presence — appropriate for a privacy
// lock, not a server credential).

const SALT_KEY = "pin_salt";
const HASH_KEY = "pin_hash";
const CRED_KEY = "webauthn_cred_id";

const toB64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function getSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_KEY);
  if (existing) return fromB64(existing);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, toB64(salt));
  return salt;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = getSalt();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return [...new Uint8Array(bits)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isPinSet(): boolean {
  return !!localStorage.getItem(HASH_KEY);
}

export async function setPin(pin: string): Promise<void> {
  localStorage.setItem(HASH_KEY, await hashPin(pin));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(HASH_KEY);
  if (!stored) return false;
  return (await hashPin(pin)) === stored;
}

export function clearPin(): void {
  localStorage.removeItem(HASH_KEY);
}

// ----- WebAuthn (platform biometric) -----

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

export function isBiometricRegistered(): boolean {
  return !!localStorage.getItem(CRED_KEY);
}

export async function registerBiometric(userName: string): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Budget Planner" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  localStorage.setItem(CRED_KEY, toB64(new Uint8Array(cred.rawId)));
  return true;
}

export async function verifyBiometric(): Promise<boolean> {
  const id = localStorage.getItem(CRED_KEY);
  if (!id || !isWebAuthnAvailable()) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: fromB64(id) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function clearBiometric(): void {
  localStorage.removeItem(CRED_KEY);
}
