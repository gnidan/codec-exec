import * as Decoder from "@truffle/decoder";
import type { ContractInstanceDecoder } from "@truffle/decoder";
import * as Encoder from "@truffle/encoder";
import type { ContractInstanceEncoder } from "@truffle/encoder";
import type * as Codec from "@truffle/codec";
import type { EIP1193Provider as Provider } from "eip1193-provider";

export type Guard<V extends Codec.Format.Values.Value> = (
  value: Codec.Format.Values.Value
) => value is V;

export type Guards<Vs extends [...Codec.Format.Values.Value[]]> = {
  [I in keyof Vs]: Guard<Vs[I]>
} & { length: Vs["length"] };

export type Transform<A, B> = (a: A) => B;

export type Argument<V extends Codec.Format.Values.Value> = Codec.AbiArgument & {
  value: V
}

export type Schemas<
  Vs extends [...Codec.Format.Values.Value[]],
  Rs extends [...any[]] & { length: Vs["length"] }
> = {
  [I in keyof Vs]: {
    guard: Guard<Vs[I]>;
    transform: I extends keyof Rs
      ? Transform<Vs[I], Rs[I]>
      : never;
  }
} & { length: Vs["length"] };

export type Arguments<Vs extends [...Codec.Format.Values.Value[]]> = {
  [I in keyof Vs]: Argument<Vs[I]>
} & { length: Vs["length"] };

export interface Call {
  decode(): Promise<Codec.ReturndataDecoding[]>;

  decodeArguments<
    Vs extends [...Codec.Format.Values.Value[]],
    Rs extends [...any[]] & { length: Vs["length"] }
  >(
    schemas: Schemas<Vs, Rs>
  ): Promise<Rs>;
}

export const makeCall = (options: {
  provider: Provider;
  encoder: ContractInstanceEncoder;
  decoder: ContractInstanceDecoder;
}) => (
  ...args: Parameters<ContractInstanceEncoder["encodeTransaction"]>
): Call => {
  const {
    provider,
    encoder,
    decoder
  } = options;

  let promises: {
    encoding: ReturnType<typeof encoder.encodeTransaction>;
    result: Promise<{ data: string }>;
    decodings: ReturnType<typeof decoder.decodeReturnValue>;
  };
  {
    const encoding = (async () => {
      return await encoder.encodeTransaction(...args);
    })();

    const result = (async () => {
      const { tx } = await encoding;

      const data = await provider.request({
        method: "eth_call",
        params: [tx]
      }) as string;

      return { data }
    })();

    const decodings = (async () => {
      const { abi } = await encoding;
      const { data } = await result;

      return await decoder.decodeReturnValue(abi, data);
    })();

    promises = { encoding, result, decodings };
  }

  return {
    decode: async () => await promises.decodings,

    decodeArguments: async <
      Vs extends [...Codec.Format.Values.Value[]],
      Rs extends [...any[]] & { length: Vs["length"] }
    >(
      schemas: Schemas<Vs, Rs>
    ): Promise<Rs> => {
      const [decoding] = await promises.decodings;

      // internal guards
      //
      const isReturnDecoding = (
        decoding: Codec.ReturndataDecoding
      ): decoding is Codec.ReturnDecoding => decoding && decoding.kind === "return";

      function guardArguments(
        decodingArguments: Codec.AbiArgument[]
      ): asserts decodingArguments is Arguments<Vs> {
        if (decodingArguments.length !== schemas.length) {
          throw new Error(
            `Found ${decodingArguments.length} arguments but given ${schemas.length} schemas`
          );
        }

        for (const [
          index, guard, argument
        ] of schemas.map(
          ({ guard }, index) => [index, guard, decodingArguments[index]] as const
        )) {
          if (argument.value.kind !== "value") {
            throw new Error(`Error decoding argument at index ${index}`);
          }

          if (!guard(argument.value)) {
            throw new Error(
              `Argument at index ${index} failed guard`
            )
          }
        }
      }

      if (!isReturnDecoding(decoding)) {
        throw new Error("Bad decoding");
      }

      const decodingArguments: Codec.AbiArgument[] = decoding.arguments;

      guardArguments(decodingArguments);

      return decodingArguments.map(
        (argument, index) => schemas[index].transform(argument.value)
      ) as Rs;
    }
  }
}
