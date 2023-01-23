import * as Abi from "@truffle/abi-utils";
import * as Decoder from "@truffle/decoder";
import type { ContractDecoder, ContractInstanceDecoder } from "@truffle/decoder";
import * as Encoder from "@truffle/encoder";
import type { ContractEncoder } from "@truffle/encoder";
import type * as Codec from "@truffle/codec";
import type { EthereumProvider as Provider } from "ganache";
import type * as Ganache from "ganache";

type Transaction = Ganache.Ethereum.Transaction;
type TransactionReceipt = Ganache.Ethereum.Transaction.Receipt;

import { makeEstimate } from "./estimate";

export interface MakeCreateOptions {
  provider: Provider;
  constructorAbiEntry: Abi.ConstructorEntry;
  encoder: ContractEncoder;
  decoder: ContractDecoder;
  maxGas?: string;
}

export type CreateOptions = Partial<Pick<Transaction,
  | "from"
  | "nonce"
  | "gas"
  | "gasLimit" // alias for gas
  | "value"
  | "gasPrice"
  | "chainId"
  | "accessList"
  | "maxPriorityFeePerGas"
  | "maxFeePerGas"
>>;

export type Create = (
  inputs: unknown[],
  options?: CreateOptions
) => {
  transactionHash(): Promise<string>;
  receipt(): Promise<TransactionReceipt>;
  contractAddress(): Promise<string>;
}

export const makeCreate = ({
  provider,
  constructorAbiEntry,
  encoder,
  decoder,
  maxGas
}: MakeCreateOptions): Create => (
  inputs,
  options = {}
) => {
  let promises: {
    encoding: Promise<Transaction>;
    transaction: Promise<{ hash: string }>;
    receipt: Promise<TransactionReceipt>;
  };
  {
    const encoding = (async () => {
      const tx = await encoder.encodeTxNoResolution(constructorAbiEntry, inputs);

      return {
        ...tx,
        ...options
      } as Transaction;
    })();

    const gas = (async () => {
      const tx = await encoding;

      if (tx.gas) {
        return tx.gas
      }

      const estimate = makeEstimate({ provider, maxGas });
      try {
        const result: string = await estimate(tx).gas();

        return result;
      } catch {
        return;
      }
    })();


    const transaction = (async () => {
      const tx = await encoding;

      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          ...tx,
          gas: await gas
        }]
      }) as string;

      return { hash };
    })();

    const receipt = (async () => {
      const { hash } = await transaction;

      while (true) {
        try {
          return await provider.request({
            method: "eth_getTransactionReceipt",
            params: [hash]
          }) as TransactionReceipt;
        } catch (error) {
        }
      }
    })();

    promises = { encoding, transaction, receipt };
  }

  return {
    transactionHash: async () => (await promises.transaction).hash,

    receipt: async () => await promises.receipt,


    contractAddress: async () => {
      const contractAddress = (await promises.receipt).contractAddress as unknown as string;

      return contractAddress;
    }
  }
}
