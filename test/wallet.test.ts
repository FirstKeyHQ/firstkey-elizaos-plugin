import { describe, expect, it } from "vitest";
import { Principal } from "@dfinity/principal";
import { ed25519 } from "@noble/curves/ed25519";
import {
  base32Encode,
  crc32,
  ed25519PublicKeyToDer,
  generateWallet,
  hexSeedToBytes,
  pkcs8PemToSeed,
  publicKeyToPrincipalText,
  seedToPkcs8Pem,
  walletFromPrivateKey,
  setActiveWallet,
} from "../src/wallet.js";

describe("principal derivation", () => {
  it("matches @dfinity/principal self-authenticating derivation for random keys", () => {
    for (let i = 0; i < 25; i++) {
      const seed = ed25519.utils.randomPrivateKey();
      const pubkey = ed25519.getPublicKey(seed);
      const mine = publicKeyToPrincipalText(pubkey);
      // selfAuthenticating() takes the DER-encoded key and appends 0x02 itself.
      const official = Principal.selfAuthenticating(
        ed25519PublicKeyToDer(pubkey)
      ).toText();
      expect(mine).toBe(official);
    }
  });

  it("produces the right shape for a fixed key", () => {
    const pubkey = new Uint8Array(32).fill(7);
    const text = publicKeyToPrincipalText(pubkey);
    expect(text).toBe(
      Principal.selfAuthenticating(ed25519PublicKeyToDer(pubkey)).toText()
    );
    expect(text).toMatch(/^([a-z0-9]{5}-)*[a-z0-9]{1,5}$/);
  });

  it("rejects non-32-byte public keys", () => {
    expect(() => publicKeyToPrincipalText(new Uint8Array(31))).toThrow();
  });
});

describe("crc32 / base32 helpers", () => {
  it("crc32 matches the well-known check value", () => {
    // CRC-32/ISO-HDLC of ASCII "123456789" is 0xCBF43926.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("base32 encodes without padding, lowercase", () => {
    expect(base32Encode(new TextEncoder().encode("f"))).toBe("my");
    expect(base32Encode(new Uint8Array([0xff]))).toBe("74");
  });
});

describe("PEM round-trips", () => {
  it("seed -> PEM -> seed is lossless", () => {
    const w = generateWallet();
    expect(pkcs8PemToSeed(w.privateKeyPem)).toEqual(w.seed);
  });

  it("walletFromPrivateKey restores the same principal", () => {
    const w = generateWallet();
    const restored = walletFromPrivateKey(w.privateKeyPem);
    expect(restored.principal).toBe(w.principal);
    expect(restored.publicKey).toEqual(w.publicKey);
  });

  it("accepts a raw 32-byte hex seed", () => {
    const seed = ed25519.utils.randomPrivateKey();
    const hex = Buffer.from(seed).toString("hex");
    const w = walletFromPrivateKey(hex);
    expect(w.seed).toEqual(seed);
    expect(hexSeedToBytes(hex)).toEqual(seed);
  });

  it("rejects malformed PEM and hex", () => {
    expect(() => pkcs8PemToSeed("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toThrow();
    expect(() => hexSeedToBytes("deadbeef")).toThrow();
  });

  it("PEM has the canonical PKCS#8 header", () => {
    const w = generateWallet();
    expect(w.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(w.privateKeyPem).toMatch(/-----END PRIVATE KEY-----\n$/);
    expect(seedToPkcs8Pem(w.seed)).toBe(w.privateKeyPem);
  });
});

describe("generateWallet", () => {
  it("produces unique wallets", () => {
    setActiveWallet(null);
    const a = generateWallet();
    const b = generateWallet();
    expect(a.principal).not.toBe(b.principal);
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  });
});
