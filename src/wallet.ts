import { ed25519 } from "@noble/curves/ed25519";
import { sha224 } from "@noble/hashes/sha2";

// ---------------------------------------------------------------------------
// FirstKey wallet: on ICP a "wallet" is just an Ed25519 keypair — no on-chain
// registration, no signup. The keypair IS the wallet. This module generates
// keys LOCALLY inside the agent runtime (sovereignty: the private key never
// leaves the machine) and derives the self-authenticating ICP principal per
// the IC interface spec:
//
//   blob     = SHA-224(DER(SubjectPublicKeyInfo(pubkey))) || 0x02
//   text     = base32(blob || CRC32(blob)), grouped in 5-char chunks
// ---------------------------------------------------------------------------

const ED25519_DER_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

const PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22, 0x04, 0x20,
]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) {
    crc = CRC32_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function base32Encode(data: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of data) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** DER SubjectPublicKeyInfo encoding of a raw 32-byte Ed25519 public key. */
export function ed25519PublicKeyToDer(pubkey: Uint8Array): Uint8Array {
  if (pubkey.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes");
  }
  const der = new Uint8Array(ED25519_DER_PREFIX.length + 32);
  der.set(ED25519_DER_PREFIX, 0);
  der.set(pubkey, ED25519_DER_PREFIX.length);
  return der;
}

/** Derive the textual self-authenticating ICP principal for an Ed25519 public key. */
export function publicKeyToPrincipalText(pubkey: Uint8Array): string {
  const der = ed25519PublicKeyToDer(pubkey);
  const hash = sha224(der);
  const blob = new Uint8Array(29);
  blob.set(hash, 0);
  blob[28] = 0x02;

  const checksum = crc32(blob);
  // Canonical IC text form: base32(CRC32(blob) || blob), big-endian checksum first.
  const combined = new Uint8Array(33);
  combined[0] = (checksum >>> 24) & 0xff;
  combined[1] = (checksum >>> 16) & 0xff;
  combined[2] = (checksum >>> 8) & 0xff;
  combined[3] = checksum & 0xff;
  combined.set(blob, 4);

  const encoded = base32Encode(combined);
  return encoded.match(/.{1,5}/g)!.join("-");
}

export function seedToPkcs8Pem(seed: Uint8Array): string {
  if (seed.length !== 32) throw new Error("Ed25519 seed must be 32 bytes");
  const der = new Uint8Array(PKCS8_PREFIX.length + 32);
  der.set(PKCS8_PREFIX, 0);
  der.set(seed, PKCS8_PREFIX.length);
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

export function pkcs8PemToSeed(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Buffer.from(b64, "base64");
  if (der.length !== PKCS8_PREFIX.length + 32) {
    throw new Error("PEM is not a PKCS#8 Ed25519 private key");
  }
  for (let i = 0; i < PKCS8_PREFIX.length; i++) {
    if (der[i] !== PKCS8_PREFIX[i]) {
      throw new Error("PEM is not a PKCS#8 Ed25519 private key");
    }
  }
  return new Uint8Array(der.subarray(PKCS8_PREFIX.length));
}

export function hexSeedToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("hex seed must be 64 hex chars (32 bytes)");
  }
  return new Uint8Array(Buffer.from(clean, "hex"));
}

export interface GeneratedWallet {
  seed: Uint8Array;
  publicKey: Uint8Array;
  principal: string;
  privateKeyPem: string;
}

export function generateWallet(): GeneratedWallet {
  const seed = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(seed);
  return {
    seed,
    publicKey,
    principal: publicKeyToPrincipalText(publicKey),
    privateKeyPem: seedToPkcs8Pem(seed),
  };
}

/** Build a wallet from a PKCS#8 PEM or a raw 32-byte hex seed. */
export function walletFromPrivateKey(input: string): GeneratedWallet {
  const trimmed = input.trim();
  const seed = trimmed.includes("BEGIN PRIVATE KEY")
    ? pkcs8PemToSeed(trimmed)
    : hexSeedToBytes(trimmed);
  const publicKey = ed25519.getPublicKey(seed);
  return {
    seed,
    publicKey,
    principal: publicKeyToPrincipalText(publicKey),
    privateKeyPem: seedToPkcs8Pem(seed),
  };
}

// ---------------------------------------------------------------------------
// In-runtime wallet holder. The plugin keeps the active wallet in memory for
// the life of the agent process. Nothing is ever written to disk by the
// plugin itself — persisting FIRSTKEY_ICP_PRIVATE_KEY is the operator's job.
// ---------------------------------------------------------------------------

let activeWallet: GeneratedWallet | null = null;

export function getActiveWallet(): GeneratedWallet | null {
  return activeWallet;
}

export function setActiveWallet(wallet: GeneratedWallet | null): void {
  activeWallet = wallet;
}

/** Load the wallet from FIRSTKEY_ICP_PRIVATE_KEY (env/settings) if present. */
export function loadWalletFromPrivateKeyEnv(
  value: string | undefined
): GeneratedWallet | null {
  if (!value) return null;
  try {
    const w = walletFromPrivateKey(value);
    setActiveWallet(w);
    return w;
  } catch {
    return null;
  }
}
