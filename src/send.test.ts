import {describe, expect, test, beforeAll} from '@jest/globals';

import Ganache from "ganache";
import type { EthereumProvider as Provider } from "ganache";

import { Compile } from "@truffle/compile-solidity";
import * as CompileCommon from "@truffle/compile-common";

import * as Abi from "@truffle/abi-utils";
import * as Decoder from "@truffle/decoder";
import type { ContractDecoder, ContractInstanceDecoder } from "@truffle/decoder";
import * as Encoder from "@truffle/encoder";
import type { ContractEncoder, ContractInstanceEncoder } from "@truffle/encoder";

import { makeCreate } from "./create";
import { makeSend } from "./send";

const sources = {
  "Example.sol": `// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

contract Example {
  error Fail();

  event Succeed();

  constructor() {
  }

  function succeed() public {
    emit Succeed();
  }

  function fail() public {
    revert("fail!");
  }
}
`
};

describe("send", () => {
  let provider: Provider;
  let accounts: string[];
  let encoder: ContractInstanceEncoder;
  let decoder: ContractInstanceDecoder;

  beforeAll(async () => {
    provider = Ganache.provider();
    accounts = await provider.request({
      method: "eth_accounts",
      params: []
    }) as string[];


    const { contracts, compilations } = await Compile.sources({
      sources,
      options: {
        compilers: {
          solc: {
            version: "0.8.17"
          }
        }
      } as any
    });

    const Example = contracts.find(({ contractName }) => contractName === "Example");
    if (!Example) {
      throw new Error("Couldn't find contract");
    }

    const artifact = CompileCommon.Shims.NewToLegacy.forContract(Example);

    const contractEncoder = await Encoder.forArtifact(artifact, {
      provider,
      projectInfo: {
        commonCompilations: compilations
      }
    });

    const contractDecoder =  await Decoder.forArtifact(artifact, {
      provider,
      projectInfo: {
        commonCompilations: compilations
      }
    });

    const constructorAbiEntry = Example.abi.find(
      (entry: Abi.Entry): entry is Abi.ConstructorEntry =>
        entry.type === "constructor"
    );

    const create = makeCreate({
      provider,
      encoder: contractEncoder,
      decoder: contractDecoder,
      constructorAbiEntry
    });

    const address = await create(
      [],
      { from: accounts[0] }
    ).contractAddress();

    encoder = await contractEncoder.forInstance(address);
    decoder = await contractDecoder.forInstance(address);
  });


  test("reports custom errors", async () => {
    const send = makeSend({ provider, encoder, decoder });

    const receipt = await send(
      "fail",
      [],
      { from: accounts[0] }
    ).receipt();

    expect(receipt.status).toBe("0x0");

  });
});
