/**
 * Adapts the live `@zama-fhe/react-sdk` relayer (`useZamaSDK().relayer`) to
 * the `Encryptor` interface `@tokenops/sdk/fhe-airdrop` expects.
 *
 * The installed `@zama-fhe/sdk` v3 relayer's `encrypt()` resolves
 * `{ encryptedValues: Hex[], inputProof: Hex }`, while the tokenops SDK's
 * structural `Encryptor` interface expects
 * `{ handles: Uint8Array[], inputProof: Uint8Array }` (mirroring an older
 * relayer wire shape). The request (`values`/`contractAddress`/`userAddress`)
 * shapes are identical, so only the response needs bridging.
 */

import { hexToBytes, type Address, type Hex } from "viem";
import type { Encryptor, FheValueInput } from "@tokenops/sdk/fhe-airdrop";

interface ZamaEncryptResult {
  encryptedValues: Hex[];
  inputProof: Hex;
}

interface ZamaRelayerLike {
  encrypt(params: { values: FheValueInput[]; contractAddress: Address; userAddress: Address }): Promise<ZamaEncryptResult>;
}

/** Wrap a `ZamaSDK.relayer` instance so it satisfies `@tokenops/sdk`'s `Encryptor` interface. */
export function toTokenOpsEncryptor(relayer: ZamaRelayerLike): Encryptor {
  return {
    async encrypt(params) {
      const result = await relayer.encrypt(params);
      return {
        handles: result.encryptedValues.map((h) => hexToBytes(h)),
        inputProof: hexToBytes(result.inputProof),
      };
    },
  };
}
