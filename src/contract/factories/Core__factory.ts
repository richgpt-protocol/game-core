/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Interface, type ContractRunner } from "ethers";
import type { Core, CoreInterface } from "../Core";

const _abi = [
  {
    type: "function",
    name: "UPGRADE_INTERFACE_VERSION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "bet",
    inputs: [
      {
        name: "_bets",
        type: "tuple[]",
        internalType: "struct ICore.BetParams[]",
        components: [
          {
            name: "epoch",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "number",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "forecast",
            type: "uint8",
            internalType: "enum ICore.Forecast",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "bet",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "_bets",
        type: "tuple[]",
        internalType: "struct ICore.BetParams[]",
        components: [
          {
            name: "epoch",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "number",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "forecast",
            type: "uint8",
            internalType: "enum ICore.Forecast",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "claimParams",
        type: "tuple[]",
        internalType: "struct ICore.ClaimParams[]",
        components: [
          {
            name: "epoch",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "number",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "forecast",
            type: "uint8",
            internalType: "enum ICore.Forecast",
          },
          {
            name: "drawResultIndex",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "currentEpoch",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentEpochTimestamp",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "drawMultiplier",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "bigMultiplier",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "smallMultiplier",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "drawResults",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "gameUSD",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IERC20",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "gameUSDPool",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IGameUSDPool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBets",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "epoch",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "bets_",
        type: "tuple[]",
        internalType: "struct ICore.Bet[]",
        components: [
          {
            name: "epoch",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "number",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "forecast",
            type: "uint8",
            internalType: "enum ICore.Forecast",
          },
          {
            name: "isClaimed",
            type: "bool",
            internalType: "bool",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "helper",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "admin",
        type: "address",
        internalType: "address",
      },
      {
        name: "_gameUSDPool",
        type: "address",
        internalType: "address",
      },
      {
        name: "_redeem",
        type: "address",
        internalType: "address",
      },
      {
        name: "_pointReward",
        type: "address",
        internalType: "address",
      },
      {
        name: "_maxBet",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isBetClosed",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxBet",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pointReward",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPointReward",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proxiableUUID",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "redeem",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IRedeem",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setBetClose",
    inputs: [
      {
        name: "_isBetClosed",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setDrawMultipliers",
    inputs: [
      {
        name: "_drawMultipliers",
        type: "tuple[]",
        internalType: "struct ICore.Multiplier[]",
        components: [
          {
            name: "bigMultiplier",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "smallMultiplier",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setDrawResults",
    inputs: [
      {
        name: "numbers",
        type: "uint256[]",
        internalType: "uint256[]",
      },
      {
        name: "maxBetAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "proof",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setGameUSDPoolContract",
    inputs: [
      {
        name: "_gameUSDPool",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setHelperContract",
    inputs: [
      {
        name: "_helper",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPointRewardContract",
    inputs: [
      {
        name: "_pointReward",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setRedeemContract",
    inputs: [
      {
        name: "_redeem",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setVRFCoordinator",
    inputs: [
      {
        name: "vrfCoordinators",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "isValidated",
        type: "bool[]",
        internalType: "bool[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalBetsForNumber",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      {
        name: "newImplementation",
        type: "address",
        internalType: "address",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "userBet",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint8",
        internalType: "enum ICore.Forecast",
      },
    ],
    outputs: [
      {
        name: "epoch",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "number",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "forecast",
        type: "uint8",
        internalType: "enum ICore.Forecast",
      },
      {
        name: "isClaimed",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "userBetNumbers",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BetCloseSet",
    inputs: [
      {
        name: "isBetClose",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Betted",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "epoch",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "number",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "forecast",
        type: "uint8",
        indexed: false,
        internalType: "enum ICore.Forecast",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "epoch",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "number",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "forecast",
        type: "uint8",
        indexed: false,
        internalType: "enum ICore.Forecast",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "drawResultIndex",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DrawMultipliersSet",
    inputs: [
      {
        name: "multiplier",
        type: "tuple[]",
        indexed: false,
        internalType: "struct ICore.Multiplier[]",
        components: [
          {
            name: "bigMultiplier",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "smallMultiplier",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DrawResultsSet",
    inputs: [
      {
        name: "epoch",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "vrfCoordinator",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "proof",
        type: "bytes",
        indexed: false,
        internalType: "bytes",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameUSDPoolContractSet",
    inputs: [
      {
        name: "gameUSDPool",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "HelperContractSet",
    inputs: [
      {
        name: "helper",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Initialized",
    inputs: [
      {
        name: "version",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PointRewardContractSet",
    inputs: [
      {
        name: "pointReward",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RedeemContractSet",
    inputs: [
      {
        name: "redeem",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Upgraded",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "VRFCoordinatorSet",
    inputs: [
      {
        name: "vrfCoordinator",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "isValidated",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ALREADY_CLAIMED",
    inputs: [],
  },
  {
    type: "error",
    name: "AMOUNT_NOT_MATCH",
    inputs: [],
  },
  {
    type: "error",
    name: "AddressEmptyCode",
    inputs: [
      {
        name: "target",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "BET_CLOSED",
    inputs: [],
  },
  {
    type: "error",
    name: "DRAW_RESULT_INDEX_NOT_MATCH",
    inputs: [],
  },
  {
    type: "error",
    name: "EPOCH_OR_NUMBER_OR_FORECAST_NOT_MATCH",
    inputs: [],
  },
  {
    type: "error",
    name: "ERC1967InvalidImplementation",
    inputs: [
      {
        name: "implementation",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1967NonPayable",
    inputs: [],
  },
  {
    type: "error",
    name: "FailedInnerCall",
    inputs: [],
  },
  {
    type: "error",
    name: "INVALID_BET_AMOUNT",
    inputs: [],
  },
  {
    type: "error",
    name: "INVALID_EPOCH",
    inputs: [],
  },
  {
    type: "error",
    name: "INVALID_ISCLAIM",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: [],
  },
  {
    type: "error",
    name: "MAX_BETS_REACHED",
    inputs: [],
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: [],
  },
  {
    type: "error",
    name: "ONLY_HELPER",
    inputs: [],
  },
  {
    type: "error",
    name: "ONLY_VRF_COORDINATOR",
    inputs: [],
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UUPSUnauthorizedCallContext",
    inputs: [],
  },
  {
    type: "error",
    name: "UUPSUnsupportedProxiableUUID",
    inputs: [
      {
        name: "slot",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
] as const;

export class Core__factory {
  static readonly abi = _abi;
  static createInterface(): CoreInterface {
    return new Interface(_abi) as CoreInterface;
  }
  static connect(address: string, runner?: ContractRunner | null): Core {
    return new Contract(address, _abi, runner) as unknown as Core;
  }
}
