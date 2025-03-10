/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumberish,
  BytesLike,
  FunctionFragment,
  Result,
  Interface,
  EventFragment,
  AddressLike,
  ContractRunner,
  ContractMethod,
  Listener,
} from "ethers";
import type {
  TypedContractEvent,
  TypedDeferredTopicFilter,
  TypedEventLog,
  TypedLogDescription,
  TypedListener,
  TypedContractMethod,
} from "./common";

export declare namespace ICore {
  export type BetParamsStruct = {
    epoch: BigNumberish;
    number: BigNumberish;
    amount: BigNumberish;
    forecast: BigNumberish;
  };

  export type BetParamsStructOutput = [
    epoch: bigint,
    number: bigint,
    amount: bigint,
    forecast: bigint
  ] & { epoch: bigint; number: bigint; amount: bigint; forecast: bigint };
}

export declare namespace IHelper {
  export type BetLastMinuteParamsStruct = {
    user: AddressLike;
    uid: BigNumberish;
    ticketId: BigNumberish;
    bets: ICore.BetParamsStruct[];
  };

  export type BetLastMinuteParamsStructOutput = [
    user: string,
    uid: bigint,
    ticketId: bigint,
    bets: ICore.BetParamsStructOutput[]
  ] & {
    user: string;
    uid: bigint;
    ticketId: bigint;
    bets: ICore.BetParamsStructOutput[];
  };
}

export interface HelperInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "UPGRADE_INTERFACE_VERSION"
      | "betLastMinutes"
      | "core"
      | "deposit"
      | "gameUSD"
      | "gameUSDPool"
      | "initialize"
      | "isWhitelisted"
      | "multiCallView"
      | "multicall"
      | "owner"
      | "payoutPool"
      | "proxiableUUID"
      | "renounceOwnership"
      | "setContracts"
      | "setMultipleWhitelist"
      | "setWhitelist"
      | "transferOwnership"
      | "upgradeToAndCall"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "BetLastMinutes"
      | "CoreContractSet"
      | "DepositContractSet"
      | "GameUSDPoolContractSet"
      | "Initialized"
      | "OwnershipTransferred"
      | "PayoutPoolContractSet"
      | "Upgraded"
      | "WhitelistSet"
  ): EventFragment;

  encodeFunctionData(
    functionFragment: "UPGRADE_INTERFACE_VERSION",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "betLastMinutes",
    values: [IHelper.BetLastMinuteParamsStruct[]]
  ): string;
  encodeFunctionData(functionFragment: "core", values?: undefined): string;
  encodeFunctionData(functionFragment: "deposit", values?: undefined): string;
  encodeFunctionData(functionFragment: "gameUSD", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "gameUSDPool",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "isWhitelisted",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "multiCallView",
    values: [AddressLike[], BytesLike[]]
  ): string;
  encodeFunctionData(
    functionFragment: "multicall",
    values: [AddressLike[], BytesLike[]]
  ): string;
  encodeFunctionData(functionFragment: "owner", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "payoutPool",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "proxiableUUID",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "renounceOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setContracts",
    values: [AddressLike, AddressLike, AddressLike, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "setMultipleWhitelist",
    values: [AddressLike[], boolean[]]
  ): string;
  encodeFunctionData(
    functionFragment: "setWhitelist",
    values: [AddressLike, boolean]
  ): string;
  encodeFunctionData(
    functionFragment: "transferOwnership",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "upgradeToAndCall",
    values: [AddressLike, BytesLike]
  ): string;

  decodeFunctionResult(
    functionFragment: "UPGRADE_INTERFACE_VERSION",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "betLastMinutes",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "core", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "deposit", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "gameUSD", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "gameUSDPool",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "isWhitelisted",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "multiCallView",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "multicall", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "payoutPool", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "proxiableUUID",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setContracts",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setMultipleWhitelist",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setWhitelist",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "upgradeToAndCall",
    data: BytesLike
  ): Result;
}

export namespace BetLastMinutesEvent {
  export type InputTuple = [];
  export type OutputTuple = [];
  export interface OutputObject {}
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CoreContractSetEvent {
  export type InputTuple = [core: AddressLike];
  export type OutputTuple = [core: string];
  export interface OutputObject {
    core: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace DepositContractSetEvent {
  export type InputTuple = [deposit: AddressLike];
  export type OutputTuple = [deposit: string];
  export interface OutputObject {
    deposit: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace GameUSDPoolContractSetEvent {
  export type InputTuple = [gameUSDPool: AddressLike];
  export type OutputTuple = [gameUSDPool: string];
  export interface OutputObject {
    gameUSDPool: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace InitializedEvent {
  export type InputTuple = [version: BigNumberish];
  export type OutputTuple = [version: bigint];
  export interface OutputObject {
    version: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace OwnershipTransferredEvent {
  export type InputTuple = [previousOwner: AddressLike, newOwner: AddressLike];
  export type OutputTuple = [previousOwner: string, newOwner: string];
  export interface OutputObject {
    previousOwner: string;
    newOwner: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace PayoutPoolContractSetEvent {
  export type InputTuple = [payoutPool: AddressLike];
  export type OutputTuple = [payoutPool: string];
  export interface OutputObject {
    payoutPool: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace UpgradedEvent {
  export type InputTuple = [implementation: AddressLike];
  export type OutputTuple = [implementation: string];
  export interface OutputObject {
    implementation: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace WhitelistSetEvent {
  export type InputTuple = [whitelist: AddressLike, status: boolean];
  export type OutputTuple = [whitelist: string, status: boolean];
  export interface OutputObject {
    whitelist: string;
    status: boolean;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface Helper extends BaseContract {
  connect(runner?: ContractRunner | null): Helper;
  waitForDeployment(): Promise<this>;

  interface: HelperInterface;

  queryFilter<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;
  queryFilter<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;

  on<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  on<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  once<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  once<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  listeners<TCEvent extends TypedContractEvent>(
    event: TCEvent
  ): Promise<Array<TypedListener<TCEvent>>>;
  listeners(eventName?: string): Promise<Array<Listener>>;
  removeAllListeners<TCEvent extends TypedContractEvent>(
    event?: TCEvent
  ): Promise<this>;

  UPGRADE_INTERFACE_VERSION: TypedContractMethod<[], [string], "view">;

  betLastMinutes: TypedContractMethod<
    [params: IHelper.BetLastMinuteParamsStruct[]],
    [void],
    "nonpayable"
  >;

  core: TypedContractMethod<[], [string], "view">;

  deposit: TypedContractMethod<[], [string], "view">;

  gameUSD: TypedContractMethod<[], [string], "view">;

  gameUSDPool: TypedContractMethod<[], [string], "view">;

  initialize: TypedContractMethod<[owner: AddressLike], [void], "nonpayable">;

  isWhitelisted: TypedContractMethod<[arg0: AddressLike], [boolean], "view">;

  multiCallView: TypedContractMethod<
    [target: AddressLike[], data: BytesLike[]],
    [string[]],
    "view"
  >;

  multicall: TypedContractMethod<
    [target: AddressLike[], data: BytesLike[]],
    [string[]],
    "nonpayable"
  >;

  owner: TypedContractMethod<[], [string], "view">;

  payoutPool: TypedContractMethod<[], [string], "view">;

  proxiableUUID: TypedContractMethod<[], [string], "view">;

  renounceOwnership: TypedContractMethod<[], [void], "nonpayable">;

  setContracts: TypedContractMethod<
    [
      _core: AddressLike,
      _deposit: AddressLike,
      _gameUSDPool: AddressLike,
      _payoutPool: AddressLike
    ],
    [void],
    "nonpayable"
  >;

  setMultipleWhitelist: TypedContractMethod<
    [whitelists: AddressLike[], status: boolean[]],
    [void],
    "nonpayable"
  >;

  setWhitelist: TypedContractMethod<
    [whitelist: AddressLike, status: boolean],
    [void],
    "nonpayable"
  >;

  transferOwnership: TypedContractMethod<
    [newOwner: AddressLike],
    [void],
    "nonpayable"
  >;

  upgradeToAndCall: TypedContractMethod<
    [newImplementation: AddressLike, data: BytesLike],
    [void],
    "payable"
  >;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment
  ): T;

  getFunction(
    nameOrSignature: "UPGRADE_INTERFACE_VERSION"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "betLastMinutes"
  ): TypedContractMethod<
    [params: IHelper.BetLastMinuteParamsStruct[]],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "core"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "deposit"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "gameUSD"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "gameUSDPool"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "initialize"
  ): TypedContractMethod<[owner: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "isWhitelisted"
  ): TypedContractMethod<[arg0: AddressLike], [boolean], "view">;
  getFunction(
    nameOrSignature: "multiCallView"
  ): TypedContractMethod<
    [target: AddressLike[], data: BytesLike[]],
    [string[]],
    "view"
  >;
  getFunction(
    nameOrSignature: "multicall"
  ): TypedContractMethod<
    [target: AddressLike[], data: BytesLike[]],
    [string[]],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "owner"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "payoutPool"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "proxiableUUID"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "renounceOwnership"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setContracts"
  ): TypedContractMethod<
    [
      _core: AddressLike,
      _deposit: AddressLike,
      _gameUSDPool: AddressLike,
      _payoutPool: AddressLike
    ],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "setMultipleWhitelist"
  ): TypedContractMethod<
    [whitelists: AddressLike[], status: boolean[]],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "setWhitelist"
  ): TypedContractMethod<
    [whitelist: AddressLike, status: boolean],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "transferOwnership"
  ): TypedContractMethod<[newOwner: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "upgradeToAndCall"
  ): TypedContractMethod<
    [newImplementation: AddressLike, data: BytesLike],
    [void],
    "payable"
  >;

  getEvent(
    key: "BetLastMinutes"
  ): TypedContractEvent<
    BetLastMinutesEvent.InputTuple,
    BetLastMinutesEvent.OutputTuple,
    BetLastMinutesEvent.OutputObject
  >;
  getEvent(
    key: "CoreContractSet"
  ): TypedContractEvent<
    CoreContractSetEvent.InputTuple,
    CoreContractSetEvent.OutputTuple,
    CoreContractSetEvent.OutputObject
  >;
  getEvent(
    key: "DepositContractSet"
  ): TypedContractEvent<
    DepositContractSetEvent.InputTuple,
    DepositContractSetEvent.OutputTuple,
    DepositContractSetEvent.OutputObject
  >;
  getEvent(
    key: "GameUSDPoolContractSet"
  ): TypedContractEvent<
    GameUSDPoolContractSetEvent.InputTuple,
    GameUSDPoolContractSetEvent.OutputTuple,
    GameUSDPoolContractSetEvent.OutputObject
  >;
  getEvent(
    key: "Initialized"
  ): TypedContractEvent<
    InitializedEvent.InputTuple,
    InitializedEvent.OutputTuple,
    InitializedEvent.OutputObject
  >;
  getEvent(
    key: "OwnershipTransferred"
  ): TypedContractEvent<
    OwnershipTransferredEvent.InputTuple,
    OwnershipTransferredEvent.OutputTuple,
    OwnershipTransferredEvent.OutputObject
  >;
  getEvent(
    key: "PayoutPoolContractSet"
  ): TypedContractEvent<
    PayoutPoolContractSetEvent.InputTuple,
    PayoutPoolContractSetEvent.OutputTuple,
    PayoutPoolContractSetEvent.OutputObject
  >;
  getEvent(
    key: "Upgraded"
  ): TypedContractEvent<
    UpgradedEvent.InputTuple,
    UpgradedEvent.OutputTuple,
    UpgradedEvent.OutputObject
  >;
  getEvent(
    key: "WhitelistSet"
  ): TypedContractEvent<
    WhitelistSetEvent.InputTuple,
    WhitelistSetEvent.OutputTuple,
    WhitelistSetEvent.OutputObject
  >;

  filters: {
    "BetLastMinutes()": TypedContractEvent<
      BetLastMinutesEvent.InputTuple,
      BetLastMinutesEvent.OutputTuple,
      BetLastMinutesEvent.OutputObject
    >;
    BetLastMinutes: TypedContractEvent<
      BetLastMinutesEvent.InputTuple,
      BetLastMinutesEvent.OutputTuple,
      BetLastMinutesEvent.OutputObject
    >;

    "CoreContractSet(address)": TypedContractEvent<
      CoreContractSetEvent.InputTuple,
      CoreContractSetEvent.OutputTuple,
      CoreContractSetEvent.OutputObject
    >;
    CoreContractSet: TypedContractEvent<
      CoreContractSetEvent.InputTuple,
      CoreContractSetEvent.OutputTuple,
      CoreContractSetEvent.OutputObject
    >;

    "DepositContractSet(address)": TypedContractEvent<
      DepositContractSetEvent.InputTuple,
      DepositContractSetEvent.OutputTuple,
      DepositContractSetEvent.OutputObject
    >;
    DepositContractSet: TypedContractEvent<
      DepositContractSetEvent.InputTuple,
      DepositContractSetEvent.OutputTuple,
      DepositContractSetEvent.OutputObject
    >;

    "GameUSDPoolContractSet(address)": TypedContractEvent<
      GameUSDPoolContractSetEvent.InputTuple,
      GameUSDPoolContractSetEvent.OutputTuple,
      GameUSDPoolContractSetEvent.OutputObject
    >;
    GameUSDPoolContractSet: TypedContractEvent<
      GameUSDPoolContractSetEvent.InputTuple,
      GameUSDPoolContractSetEvent.OutputTuple,
      GameUSDPoolContractSetEvent.OutputObject
    >;

    "Initialized(uint64)": TypedContractEvent<
      InitializedEvent.InputTuple,
      InitializedEvent.OutputTuple,
      InitializedEvent.OutputObject
    >;
    Initialized: TypedContractEvent<
      InitializedEvent.InputTuple,
      InitializedEvent.OutputTuple,
      InitializedEvent.OutputObject
    >;

    "OwnershipTransferred(address,address)": TypedContractEvent<
      OwnershipTransferredEvent.InputTuple,
      OwnershipTransferredEvent.OutputTuple,
      OwnershipTransferredEvent.OutputObject
    >;
    OwnershipTransferred: TypedContractEvent<
      OwnershipTransferredEvent.InputTuple,
      OwnershipTransferredEvent.OutputTuple,
      OwnershipTransferredEvent.OutputObject
    >;

    "PayoutPoolContractSet(address)": TypedContractEvent<
      PayoutPoolContractSetEvent.InputTuple,
      PayoutPoolContractSetEvent.OutputTuple,
      PayoutPoolContractSetEvent.OutputObject
    >;
    PayoutPoolContractSet: TypedContractEvent<
      PayoutPoolContractSetEvent.InputTuple,
      PayoutPoolContractSetEvent.OutputTuple,
      PayoutPoolContractSetEvent.OutputObject
    >;

    "Upgraded(address)": TypedContractEvent<
      UpgradedEvent.InputTuple,
      UpgradedEvent.OutputTuple,
      UpgradedEvent.OutputObject
    >;
    Upgraded: TypedContractEvent<
      UpgradedEvent.InputTuple,
      UpgradedEvent.OutputTuple,
      UpgradedEvent.OutputObject
    >;

    "WhitelistSet(address,bool)": TypedContractEvent<
      WhitelistSetEvent.InputTuple,
      WhitelistSetEvent.OutputTuple,
      WhitelistSetEvent.OutputObject
    >;
    WhitelistSet: TypedContractEvent<
      WhitelistSetEvent.InputTuple,
      WhitelistSetEvent.OutputTuple,
      WhitelistSetEvent.OutputObject
    >;
  };
}
