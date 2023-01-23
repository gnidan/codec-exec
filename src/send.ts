import * as Abi from "@truffle/abi-utils";
import * as Decoder from "@truffle/decoder";
import type { ContractInstanceDecoder } from "@truffle/decoder";
import * as Encoder from "@truffle/encoder";
import type { ContractInstanceEncoder } from "@truffle/encoder";
import type * as Codec from "@truffle/codec";
import type { EthereumProvider as Provider } from "ganache";
import type * as Ganache from "ganache";

type Transaction = Ganache.Ethereum.Transaction;
type TransactionReceipt = Ganache.Ethereum.Transaction.Receipt;

import { makeEstimate } from "./estimate";

export interface MakeSendOptions {
  provider: Provider;
  encoder: ContractInstanceEncoder;
  decoder: ContractInstanceDecoder;
  maxGas?: string;
}

export type SendOptions = Partial<Pick<Transaction,
  | "to"
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

export type Send = (
  abisOrName: string | Abi.FunctionEntry[],
  inputs: unknown[],
  options?: SendOptions
) => {
  transactionHash(): Promise<string>;
  receipt(): Promise<TransactionReceipt>;
}

export const makeSend = ({
  provider,
  encoder,
  decoder,
  maxGas
}: MakeSendOptions): Send => (
  abisOrName,
  inputs,
  options = {}
) => {

  let promises: {
    encoding: Promise<{
      tx: Transaction;
      abi: Abi.FunctionEntry
    }>;
    transaction: Promise<{ hash: string }>;
    receipt: Promise<TransactionReceipt>;
  };
  {
    const encoding = (async () => {
      const { tx, abi } = await encoder.encodeTransaction(abisOrName, inputs);

      return {
        abi,
        tx: {
          ...tx,
          ...options
        } as Transaction
      };
    })();

    const gas = (async () => {
      const { tx } = await encoding;

      if (tx.gas) {
        return tx.gas
      }

      const estimate = makeEstimate({ provider, maxGas });
      try {
        return await estimate(tx).gas();
      } catch {
        return;
      }
    })();

    const transaction = (async () => {
      const { tx } = await encoding;

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
          const receipt = await provider.request({
            method: "eth_getTransactionReceipt",
            params: [hash]
          });

          return receipt
        } catch {
        }
      }
    })();

    promises = { encoding, transaction, receipt };
  }

  return {
    transactionHash: async () => (await promises.transaction).hash,

    receipt: async () => await promises.receipt,
  }
}
