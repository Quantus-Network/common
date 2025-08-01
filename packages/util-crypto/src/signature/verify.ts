// Copyright 2017-2025 @polkadot/util-crypto authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeypairType, VerifyResult } from '../types.js';

import { u8aIsWrapped, u8aToU8a, u8aUnwrapBytes, u8aWrapBytes } from '@polkadot/util';

import { decodeAddress } from '../address/decode.js';
import { ed25519Verify } from '../ed25519/verify.js';
import { mldsaVerify } from '../mldsa/verify.js';
import { MLDSA_SIGNATURE_LENGTH } from '../mldsa/constants.js';
import { secp256k1Verify } from '../secp256k1/verify.js';
import { sr25519Verify } from '../sr25519/verify.js';

interface VerifyInput {
  message: Uint8Array;
  publicKey: Uint8Array;
  signature: Uint8Array;
}

type Verifier = [KeypairType, (message: Uint8Array | string, signature: Uint8Array, publicKey: Uint8Array) => boolean];

type VerifyFn = (result: VerifyResult, input: VerifyInput) => VerifyResult;

const secp256k1VerifyHasher = (hashType: 'blake2' | 'keccak') =>
  (message: Uint8Array | string, signature: Uint8Array, publicKey: Uint8Array) =>
    secp256k1Verify(message, signature, publicKey, hashType);

const VERIFIERS_ECDSA: Verifier[] = [
  ['ecdsa', secp256k1VerifyHasher('blake2')],
  ['ethereum', secp256k1VerifyHasher('keccak')]
];

const VERIFIERS: Verifier[] = [
  ['ed25519', ed25519Verify],
  ['mldsa', mldsaVerify],
  ['sr25519', sr25519Verify]
];

function verifyDetect (result: VerifyResult, { message, publicKey, signature }: VerifyInput, verifiers = [...VERIFIERS, ...VERIFIERS_ECDSA]): VerifyResult {
  result.isValid = verifiers.some(([crypto, verify]): boolean => {
    try {
      if (verify(message, signature, publicKey)) {
        result.crypto = crypto;

        return true;
      }
    } catch {
      // do nothing, result.isValid still set to false
    }

    return false;
  });

  return result;
}

function verifyMultisig (result: VerifyResult, { message, publicKey, signature }: VerifyInput): VerifyResult {
  if ((![0, 1, 2].includes(signature[0]) || ![65, 66].includes(signature.length)) &&
      !(signature[0] === 3 && signature.length === MLDSA_SIGNATURE_LENGTH + 1)) {
    throw new Error(`Unknown crypto type, expected signature prefix [0..3], found ${signature[0]}`);
  }

  // If the signature is MLDSA with prefix (4628 bytes)
  if (signature[0] === 3 && signature.length === MLDSA_SIGNATURE_LENGTH + 1) {
    result = verifyDetect(result, { message, publicKey, signature: signature.subarray(1) }, [['mldsa', mldsaVerify]]);
  }
  // If the signature is 66 bytes it must be an ecdsa signature
  // containing: prefix [1 byte] + signature [65] bytes.
  // Remove the and then verify
  else if (signature.length === 66) {
    result = verifyDetect(result, { message, publicKey, signature: signature.subarray(1) }, VERIFIERS_ECDSA);
  } else {
    // The signature contains 65 bytes which is either
    // - A ed25519 or sr25519 signature [1 byte prefix + 64 bytes]
    // - An ecdsa signature [65 bytes]
    result = verifyDetect(result, { message, publicKey, signature: signature.subarray(1) }, VERIFIERS);

    if (!result.isValid) {
      result = verifyDetect(result, { message, publicKey, signature }, VERIFIERS_ECDSA);
    }

    // If both failed, explicitly set crypto to 'none'
    if (!result.isValid) {
      result.crypto = 'none';
    }
  }

  return result;
}

function getVerifyFn (signature: Uint8Array): VerifyFn {
  return ([0, 1, 2].includes(signature[0]) && [65, 66].includes(signature.length)) ||
         (signature[0] === 3 && signature.length === MLDSA_SIGNATURE_LENGTH + 1)
    ? verifyMultisig
    : verifyDetect;
}

export function signatureVerify (message: string | Uint8Array, signature: string | Uint8Array, addressOrPublicKey: string | Uint8Array): VerifyResult {
  const signatureU8a = u8aToU8a(signature);

  if (![64, 65, 66, MLDSA_SIGNATURE_LENGTH, MLDSA_SIGNATURE_LENGTH + 1].includes(signatureU8a.length)) {
    throw new Error(`Invalid signature length, expected [64..66], ${MLDSA_SIGNATURE_LENGTH}, or ${MLDSA_SIGNATURE_LENGTH + 1} bytes, found ${signatureU8a.length}`);
  }

  const publicKey = decodeAddress(addressOrPublicKey);
  const input = { message: u8aToU8a(message), publicKey, signature: signatureU8a };
  const result: VerifyResult = { crypto: 'none', isValid: false, isWrapped: u8aIsWrapped(input.message, true), publicKey };
  const isWrappedBytes = u8aIsWrapped(input.message, false);
  const verifyFn = getVerifyFn(signatureU8a);

  verifyFn(result, input);

  if (result.crypto !== 'none' || (result.isWrapped && !isWrappedBytes)) {
    return result;
  }

  input.message = isWrappedBytes
    ? u8aUnwrapBytes(input.message)
    : u8aWrapBytes(input.message);

  return verifyFn(result, input);
}
