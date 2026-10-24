import nacl from 'tweetnacl';
import {
  encodeBase64,
  decodeBase64,
  encodeUTF8,
  decodeUTF8,
} from 'tweetnacl-util';
import { KeyPair, EncryptedEnvelope, SignalPayload } from '../types';

export interface AddressValidation {
  valid: boolean;
  username: string;
  domain: string;
  fullAddress: string;
}

/**
 * Validates and normalizes sovereign .ilav addresses.
 * Pattern: username@domain.ilav
 */
export const normalizeAddress = (input: string): AddressValidation => {
  const clean = input.trim().toLowerCase();
  const parts = clean.split('@');

  if (parts.length !== 2) {
    return { valid: false, username: '', domain: '', fullAddress: clean };
  }

  const [username, domain] = parts;
  if (!username || !domain) {
    return { valid: false, username: '', domain: '', fullAddress: clean };
  }

  // Ensure domain suffix is .ilav
  const normalizedDomain = domain.endsWith('.ilav') ? domain : `${domain}.ilav`;
  const fullAddress = `${username}@${normalizedDomain}`;

  // Address regex rule: alphanumeric plus dots/hyphens
  const isValid = /^[a-z0-9._-]+@[a-z0-9.-]+\.ilav$/.test(fullAddress);

  return {
    valid: isValid,
    username,
    domain: normalizedDomain,
    fullAddress,
  };
};

/**
 * Deterministic standard SHA-256 implementation.
 * Produces a strict 32-byte seed for Ed25519/X25519 key derivation.
 */
export const sha256Bytes = (input: string): Uint8Array => {
  const rightRotate = (value: number, amount: number): number => {
    return (value >>> amount) | (value << (32 - amount));
  };

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words: number[] = [];
  const asciiBitLength = input.length * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isPrime: { [key: number]: boolean } = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isPrime[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isPrime[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let ascii = input + '\x80';
  while ((ascii.length % 64) - 56) {
    ascii += '\x00';
  }

  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);

      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0);

      const temp2 = (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  const result = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    result[i * 4] = (hash[i] >>> 24) & 255;
    result[i * 4 + 1] = (hash[i] >>> 16) & 255;
    result[i * 4 + 2] = (hash[i] >>> 8) & 255;
    result[i * 4 + 3] = hash[i] & 255;
  }
  return result;
};

/**
 * Derives a deterministic sovereign X25519 keypair from an address and secret.
 * Compatible with all sovereign .ilav client implementations.
 */
export const deriveKeypairFromSecret = (address: string, secret: string): KeyPair => {
  const norm = normalizeAddress(address);
  const salt = `ilav_identity_seed_v2:${norm.fullAddress}:${secret}`;
  const seed = sha256Bytes(salt);
  const boxKeys = nacl.box.keyPair.fromSecretKey(seed);

  return {
    publicKey: encodeBase64(boxKeys.publicKey),
    secretKey: encodeBase64(boxKeys.secretKey),
  };
};

/**
 * Encrypts a typed payload using authenticated TweetNaCl public-key box.
 */
export const encryptPayload = (
  payload: SignalPayload,
  recipientPublicKeyB64: string,
  mySecretKeyB64: string
): EncryptedEnvelope => {
  const messageBytes = decodeUTF8(JSON.stringify(payload));
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const recipientPubKey = decodeBase64(recipientPublicKeyB64);
  const mySecretKey = decodeBase64(mySecretKeyB64);

  const encryptedBox = nacl.box(messageBytes, nonce, recipientPubKey, mySecretKey);

  return {
    cipherText: encodeBase64(encryptedBox),
    nonce: encodeBase64(nonce),
  };
};

/**
 * Decrypts an incoming encrypted envelope using TweetNaCl authenticated box.open.
 * Returns null if the signature or payload is forged/invalid.
 */
export const decryptPayload = (
  cipherTextB64: string,
  nonceB64: string,
  senderPublicKeyB64: string,
  mySecretKeyB64: string
): SignalPayload | null => {
  try {
    const cipherText = decodeBase64(cipherTextB64);
    const nonce = decodeBase64(nonceB64);
    const senderPubKey = decodeBase64(senderPublicKeyB64);
    const mySecretKey = decodeBase64(mySecretKeyB64);

    const decryptedBytes = nacl.box.open(cipherText, nonce, senderPubKey, mySecretKey);
    if (!decryptedBytes) {
      return null;
    }

    const decryptedString = encodeUTF8(decryptedBytes);
    return JSON.parse(decryptedString) as SignalPayload;
  } catch {
    return null;
  }
};