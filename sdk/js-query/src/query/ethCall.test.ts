import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import Web3, { ETH_DATA_FORMAT } from "web3";
import axios from "axios";
import * as elliptic from "elliptic";
import {
  EthCallData,
  EthCallQueryRequest,
  PerChainQueryRequest,
  QueryRequest,
  QueryResponse,
  sign,
} from "..";

jest.setTimeout(60000);

const CI = false;
const ENV = "DEVNET";
const ETH_NODE_URL = CI ? "ws://eth-devnet:8545" : "ws://localhost:8545";

const QUERY_SERVER_URL = "http://localhost:6069/v1/query";
const PRIVATE_KEY =
  "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";
const WETH_ADDRESS = "0xDDb64fE46a91D46ee29420539FC25FD07c5FEa3E";

let web3: Web3;

beforeAll(() => {
  web3 = new Web3(ETH_NODE_URL);
});

afterAll(() => {
  web3.provider?.disconnect();
});

function createTestEthCallData(
  to: string,
  name: string,
  outputType: string
): EthCallData {
  return {
    to,
    data: web3.eth.abi.encodeFunctionCall(
      {
        constant: true,
        inputs: [],
        name,
        outputs: [{ name, type: outputType }],
        payable: false,
        stateMutability: "view",
        type: "function",
      },
      []
    ),
  };
}

describe("eth call", () => {
  test("serialize request", () => {
    const toAddress = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
    const nameCallData = createTestEthCallData(toAddress, "name", "string");
    const totalSupplyCallData = createTestEthCallData(
      toAddress,
      "totalSupply",
      "uint256"
    );
    const ethCall = new EthCallQueryRequest("0x28d9630", [
      nameCallData,
      totalSupplyCallData,
    ]);
    const chainId = 5;
    const ethQuery = new PerChainQueryRequest(chainId, ethCall);
    const nonce = 1;
    const request = new QueryRequest(nonce, [ethQuery]);
    const serialized = request.serialize();
    expect(Buffer.from(serialized).toString("hex")).toEqual(
      "0100000001010005010000004600000009307832386439363330020d500b1d8e8ef31e21c99d1db9a6444d3adf12700000000406fdde030d500b1d8e8ef31e21c99d1db9a6444d3adf12700000000418160ddd"
    );
  });
  test("parse response", async () => {
    const nameCallData = createTestEthCallData(WETH_ADDRESS, "name", "string");
    const totalSupplyCallData = createTestEthCallData(
      WETH_ADDRESS,
      "totalSupply",
      "uint256"
    );
    const blockNumber = await web3.eth.getBlockNumber(ETH_DATA_FORMAT);
    const ethCall = new EthCallQueryRequest(blockNumber, [
      nameCallData,
      totalSupplyCallData,
    ]);
    const chainId = 2;
    const ethQuery = new PerChainQueryRequest(chainId, ethCall);
    const nonce = 1;
    const request = new QueryRequest(nonce, [ethQuery]);
    const serialized = request.serialize();
    const digest = QueryRequest.digest(ENV, serialized);
    const signature = sign(PRIVATE_KEY, digest);
    const response = await axios.put<QueryResponse>(
      QUERY_SERVER_URL,
      {
        signature,
        bytes: Buffer.from(serialized).toString("hex"),
      },
      { headers: { "X-API-Key": "my_secret_key" } }
    );
    expect(response.status).toBe(200);
    const queryResponse = QueryResponse.fromBytes(
      Buffer.from(response.data.bytes, "hex")
    );
    // TODO: verify signatures
    // TOOD: verify query response
  });
  test("missing api-key should fail", async () => {
    const nameCallData = createTestEthCallData(WETH_ADDRESS, "name", "string");
    const totalSupplyCallData = createTestEthCallData(
      WETH_ADDRESS,
      "totalSupply",
      "uint256"
    );
    const blockNumber = await web3.eth.getBlockNumber(ETH_DATA_FORMAT);
    const ethCall = new EthCallQueryRequest(blockNumber, [
      nameCallData,
      totalSupplyCallData,
    ]);
    const chainId = 2;
    const ethQuery = new PerChainQueryRequest(chainId, ethCall);
    const nonce = 1;
    const request = new QueryRequest(nonce, [ethQuery]);
    const serialized = request.serialize();
    const digest = QueryRequest.digest(ENV, serialized);
    const signature = sign(PRIVATE_KEY, digest);
    let err = false;
    await axios
      .put<QueryResponse>(QUERY_SERVER_URL, {
        signature,
        bytes: Buffer.from(serialized).toString("hex"),
      })
      .catch(function (error) {
        err = true;
        expect(error.response.status).toBe(400);
        expect(error.response.data).toBe("api key is missing\n");
      });
    expect(err).toBe(true);
  });
  test("invalid api-key should fail", async () => {
    const nameCallData = createTestEthCallData(WETH_ADDRESS, "name", "string");
    const totalSupplyCallData = createTestEthCallData(
      WETH_ADDRESS,
      "totalSupply",
      "uint256"
    );
    const blockNumber = await web3.eth.getBlockNumber(ETH_DATA_FORMAT);
    const ethCall = new EthCallQueryRequest(blockNumber, [
      nameCallData,
      totalSupplyCallData,
    ]);
    const chainId = 2;
    const ethQuery = new PerChainQueryRequest(chainId, ethCall);
    const nonce = 1;
    const request = new QueryRequest(nonce, [ethQuery]);
    const serialized = request.serialize();
    const digest = QueryRequest.digest(ENV, serialized);
    const signature = sign(PRIVATE_KEY, digest);
    let err = false;
    await axios
      .put<QueryResponse>(
        QUERY_SERVER_URL,
        {
          signature,
          bytes: Buffer.from(serialized).toString("hex"),
        },
        { headers: { "X-API-Key": "some_junk" } }
      )
      .catch(function (error) {
        err = true;
        expect(error.response.status).toBe(400);
        expect(error.response.data).toBe("invalid api key\n");
      });
    expect(err).toBe(true);
  });
  test("unauthorized call should fail", async () => {
    const nameCallData = createTestEthCallData(WETH_ADDRESS, "name", "string");
    const totalSupplyCallData = createTestEthCallData(
      WETH_ADDRESS,
      "totalSupply",
      "uint256"
    );
    const blockNumber = await web3.eth.getBlockNumber(ETH_DATA_FORMAT);
    const ethCall = new EthCallQueryRequest(blockNumber, [
      nameCallData,
      totalSupplyCallData, // API key "my_secret_key_2" is not authorized to do total supply.
    ]);
    const chainId = 2;
    const ethQuery = new PerChainQueryRequest(chainId, ethCall);
    const nonce = 1;
    const request = new QueryRequest(nonce, [ethQuery]);
    const serialized = request.serialize();
    const digest = QueryRequest.digest(ENV, serialized);
    const signature = sign(PRIVATE_KEY, digest);
    let err = false;
    await axios
      .put<QueryResponse>(
        QUERY_SERVER_URL,
        {
          signature,
          bytes: Buffer.from(serialized).toString("hex"),
        },
        { headers: { "X-API-Key": "my_secret_key_2" } }
      )
      .catch(function (error) {
        err = true;
        expect(error.response.status).toBe(400);
        expect(error.response.data).toBe(
          `call "ethCall:2:000000000000000000000000ddb64fe46a91d46ee29420539fc25fd07c5fea3e:18160ddd" not authorized\n`
        );
      });
    expect(err).toBe(true);
  });
});