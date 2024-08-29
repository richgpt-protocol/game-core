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

export interface GameUSDPoolInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "UPGRADE_INTERFACE_VERSION"
      | "core"
      | "gameUSD"
      | "initialize"
      | "isWhitelisted"
      | "owner"
      | "proxiableUUID"
      | "renounceOwnership"
      | "setCoreContract"
      | "setMultipleWhitelist"
      | "setWhitelist"
      | "supply"
      | "transferOwnership"
      | "upgradeToAndCall"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "CoreContractSet"
      | "Initialized"
      | "OwnershipTransferred"
      | "Supply"
      | "Upgraded"
      | "WhitelistSet"
  ): EventFragment;

  encodeFunctionData(
    functionFragment: "UPGRADE_INTERFACE_VERSION",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "core", values?: undefined): string;
  encodeFunctionData(functionFragment: "gameUSD", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values: [AddressLike, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "isWhitelisted",
    values: [AddressLike]
  ): string;
  encodeFunctionData(functionFragment: "owner", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "proxiableUUID",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "renounceOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setCoreContract",
    values: [AddressLike]
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
    functionFragment: "supply",
    values: [AddressLike, BigNumberish]
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
  decodeFunctionResult(functionFragment: "core", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "gameUSD", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "isWhitelisted",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "proxiableUUID",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setCoreContract",
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
  decodeFunctionResult(functionFragment: "supply", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "upgradeToAndCall",
    data: BytesLike
  ): Result;
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

export namespace SupplyEvent {
  export type InputTuple = [user: AddressLike, amount: BigNumberish];
  export type OutputTuple = [user: string, amount: bigint];
  export interface OutputObject {
    user: string;
    amount: bigint;
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
  export type InputTuple = [addr: AddressLike, status: boolean];
  export type OutputTuple = [addr: string, status: boolean];
  export interface OutputObject {
    addr: string;
    status: boolean;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface GameUSDPool extends BaseContract {
  connect(runner?: ContractRunner | null): GameUSDPool;
  waitForDeployment(): Promise<this>;

  interface: GameUSDPoolInterface;

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

  core: TypedContractMethod<[], [string], "view">;

  gameUSD: TypedContractMethod<[], [string], "view">;

  initialize: TypedContractMethod<
    [owner: AddressLike, _gameUSD: AddressLike],
    [void],
    "nonpayable"
  >;

  isWhitelisted: TypedContractMethod<[arg0: AddressLike], [boolean], "view">;

  owner: TypedContractMethod<[], [string], "view">;

  proxiableUUID: TypedContractMethod<[], [string], "view">;

  renounceOwnership: TypedContractMethod<[], [void], "nonpayable">;

  setCoreContract: TypedContractMethod<
    [_core: AddressLike],
    [void],
    "nonpayable"
  >;

  setMultipleWhitelist: TypedContractMethod<
    [addr: AddressLike[], status: boolean[]],
    [void],
    "nonpayable"
  >;

  setWhitelist: TypedContractMethod<
    [addr: AddressLike, status: boolean],
    [void],
    "nonpayable"
  >;

  supply: TypedContractMethod<
    [user: AddressLike, amount: BigNumberish],
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
    nameOrSignature: "core"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "gameUSD"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "initialize"
  ): TypedContractMethod<
    [owner: AddressLike, _gameUSD: AddressLike],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "isWhitelisted"
  ): TypedContractMethod<[arg0: AddressLike], [boolean], "view">;
  getFunction(
    nameOrSignature: "owner"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "proxiableUUID"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "renounceOwnership"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setCoreContract"
  ): TypedContractMethod<[_core: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setMultipleWhitelist"
  ): TypedContractMethod<
    [addr: AddressLike[], status: boolean[]],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "setWhitelist"
  ): TypedContractMethod<
    [addr: AddressLike, status: boolean],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "supply"
  ): TypedContractMethod<
    [user: AddressLike, amount: BigNumberish],
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
    key: "CoreContractSet"
  ): TypedContractEvent<
    CoreContractSetEvent.InputTuple,
    CoreContractSetEvent.OutputTuple,
    CoreContractSetEvent.OutputObject
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
    key: "Supply"
  ): TypedContractEvent<
    SupplyEvent.InputTuple,
    SupplyEvent.OutputTuple,
    SupplyEvent.OutputObject
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

    "Supply(address,uint256)": TypedContractEvent<
      SupplyEvent.InputTuple,
      SupplyEvent.OutputTuple,
      SupplyEvent.OutputObject
    >;
    Supply: TypedContractEvent<
      SupplyEvent.InputTuple,
      SupplyEvent.OutputTuple,
      SupplyEvent.OutputObject
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
