// Copyright 2017-2025 @polkadot/util-crypto authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Keypair, KeypairType } from '../types.js';
import type { DeriveJunction } from './DeriveJunction.js';

import { keyHdkdEcdsa } from './hdkdEcdsa.js';
import { keyHdkdEd25519 } from './hdkdEd25519.js';
import { keyHdkdSr25519 } from './hdkdSr25519.js';
import { keyHdkdMldsa } from '../mldsa/hdkd.js';

const generators = {
  ecdsa: keyHdkdEcdsa,
  ed25519: keyHdkdEd25519,
  // FIXME This is Substrate-compatible, not Ethereum-compatible
  ethereum: keyHdkdEcdsa,
  mldsa: keyHdkdMldsa,
  sr25519: keyHdkdSr25519
};

export function keyFromPath (pair: Keypair, path: DeriveJunction[], type: KeypairType): Keypair {
  const keyHdkd = generators[type];

  if (!keyHdkd) {
    throw new Error(`Unsupported keypair type: ${type}`);
  }

  let result = pair;

  for (const junction of path) {
    result = keyHdkd(result, junction);
  }

  return result;
}
