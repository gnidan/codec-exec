import type { EthereumProvider as Provider } from "ganache";
import type * as Ganache from "ganache";

type Transaction = Ganache.Ethereum.Transaction;
type TransactionReceipt = Ganache.Ethereum.Transaction.Receipt;

export interface MakeEstimateOptions {
  provider: Provider;
  maxGas?: string;
}

export type Estimate = (tx: Transaction) => {
  gas(): Promise<string>;
}

export const makeEstimate = ({
  provider,
  maxGas
}: MakeEstimateOptions): Estimate => (tx: Transaction) => {
  const estimate = (async () => {
    const gasToSend = tx.gas ? tx.gas : maxGas;

    const gas = await provider.request({
      method: "eth_estimateGas",
      params: [{
        ...tx,
        gas: gasToSend
      }]
    });

    return gas;
  })();

  return {
    gas: async () => await estimate
  }
}
