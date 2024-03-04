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

export interface PayoutInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "nonce"
      | "owner"
      | "payout"
      | "payoutAdmin"
      | "redeemAdmin"
      | "renounceOwnership"
      | "setPayoutAdmin"
      | "setRedeemAdmin"
      | "transferOwnership"
      | "usdt"
      | "withdraw"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "OwnershipTransferred"
      | "Payout"
      | "PayoutAdminUpdated"
      | "RedeemAdminUpdated"
      | "Withdraw"
  ): EventFragment;

  encodeFunctionData(functionFragment: "nonce", values: [AddressLike]): string;
  encodeFunctionData(functionFragment: "owner", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "payout",
    values: [BigNumberish, AddressLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "payoutAdmin",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "redeemAdmin",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "renounceOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setPayoutAdmin",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "setRedeemAdmin",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "transferOwnership",
    values: [AddressLike]
  ): string;
  encodeFunctionData(functionFragment: "usdt", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "withdraw",
    values: [AddressLike, AddressLike, BigNumberish]
  ): string;

  decodeFunctionResult(functionFragment: "nonce", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "payout", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "payoutAdmin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "redeemAdmin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setPayoutAdmin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setRedeemAdmin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "usdt", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "withdraw", data: BytesLike): Result;
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

export namespace PayoutEvent {
  export type InputTuple = [to: AddressLike, amount: BigNumberish];
  export type OutputTuple = [to: string, amount: bigint];
  export interface OutputObject {
    to: string;
    amount: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace PayoutAdminUpdatedEvent {
  export type InputTuple = [admin: AddressLike];
  export type OutputTuple = [admin: string];
  export interface OutputObject {
    admin: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace RedeemAdminUpdatedEvent {
  export type InputTuple = [admin: AddressLike];
  export type OutputTuple = [admin: string];
  export interface OutputObject {
    admin: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace WithdrawEvent {
  export type InputTuple = [to: AddressLike, amount: BigNumberish];
  export type OutputTuple = [to: string, amount: bigint];
  export interface OutputObject {
    to: string;
    amount: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface Payout extends BaseContract {
  connect(runner?: ContractRunner | null): Payout;
  waitForDeployment(): Promise<this>;

  interface: PayoutInterface;

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

  nonce: TypedContractMethod<[arg0: AddressLike], [bigint], "view">;

  owner: TypedContractMethod<[], [string], "view">;

  payout: TypedContractMethod<
    [amount: BigNumberish, destination: AddressLike, signature: BytesLike],
    [void],
    "nonpayable"
  >;

  payoutAdmin: TypedContractMethod<[], [string], "view">;

  redeemAdmin: TypedContractMethod<[], [string], "view">;

  renounceOwnership: TypedContractMethod<[], [void], "nonpayable">;

  setPayoutAdmin: TypedContractMethod<
    [_payoutAdmin: AddressLike],
    [void],
    "nonpayable"
  >;

  setRedeemAdmin: TypedContractMethod<
    [_redeemAdmin: AddressLike],
    [void],
    "nonpayable"
  >;

  transferOwnership: TypedContractMethod<
    [newOwner: AddressLike],
    [void],
    "nonpayable"
  >;

  usdt: TypedContractMethod<[], [string], "view">;

  withdraw: TypedContractMethod<
    [token: AddressLike, user: AddressLike, amount: BigNumberish],
    [void],
    "nonpayable"
  >;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment
  ): T;

  getFunction(
    nameOrSignature: "nonce"
  ): TypedContractMethod<[arg0: AddressLike], [bigint], "view">;
  getFunction(
    nameOrSignature: "owner"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "payout"
  ): TypedContractMethod<
    [amount: BigNumberish, destination: AddressLike, signature: BytesLike],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "payoutAdmin"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "redeemAdmin"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "renounceOwnership"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setPayoutAdmin"
  ): TypedContractMethod<[_payoutAdmin: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setRedeemAdmin"
  ): TypedContractMethod<[_redeemAdmin: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "transferOwnership"
  ): TypedContractMethod<[newOwner: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "usdt"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "withdraw"
  ): TypedContractMethod<
    [token: AddressLike, user: AddressLike, amount: BigNumberish],
    [void],
    "nonpayable"
  >;

  getEvent(
    key: "OwnershipTransferred"
  ): TypedContractEvent<
    OwnershipTransferredEvent.InputTuple,
    OwnershipTransferredEvent.OutputTuple,
    OwnershipTransferredEvent.OutputObject
  >;
  getEvent(
    key: "Payout"
  ): TypedContractEvent<
    PayoutEvent.InputTuple,
    PayoutEvent.OutputTuple,
    PayoutEvent.OutputObject
  >;
  getEvent(
    key: "PayoutAdminUpdated"
  ): TypedContractEvent<
    PayoutAdminUpdatedEvent.InputTuple,
    PayoutAdminUpdatedEvent.OutputTuple,
    PayoutAdminUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "RedeemAdminUpdated"
  ): TypedContractEvent<
    RedeemAdminUpdatedEvent.InputTuple,
    RedeemAdminUpdatedEvent.OutputTuple,
    RedeemAdminUpdatedEvent.OutputObject
  >;
  getEvent(
    key: "Withdraw"
  ): TypedContractEvent<
    WithdrawEvent.InputTuple,
    WithdrawEvent.OutputTuple,
    WithdrawEvent.OutputObject
  >;

  filters: {
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

    "Payout(address,uint256)": TypedContractEvent<
      PayoutEvent.InputTuple,
      PayoutEvent.OutputTuple,
      PayoutEvent.OutputObject
    >;
    Payout: TypedContractEvent<
      PayoutEvent.InputTuple,
      PayoutEvent.OutputTuple,
      PayoutEvent.OutputObject
    >;

    "PayoutAdminUpdated(address)": TypedContractEvent<
      PayoutAdminUpdatedEvent.InputTuple,
      PayoutAdminUpdatedEvent.OutputTuple,
      PayoutAdminUpdatedEvent.OutputObject
    >;
    PayoutAdminUpdated: TypedContractEvent<
      PayoutAdminUpdatedEvent.InputTuple,
      PayoutAdminUpdatedEvent.OutputTuple,
      PayoutAdminUpdatedEvent.OutputObject
    >;

    "RedeemAdminUpdated(address)": TypedContractEvent<
      RedeemAdminUpdatedEvent.InputTuple,
      RedeemAdminUpdatedEvent.OutputTuple,
      RedeemAdminUpdatedEvent.OutputObject
    >;
    RedeemAdminUpdated: TypedContractEvent<
      RedeemAdminUpdatedEvent.InputTuple,
      RedeemAdminUpdatedEvent.OutputTuple,
      RedeemAdminUpdatedEvent.OutputObject
    >;

    "Withdraw(address,uint256)": TypedContractEvent<
      WithdrawEvent.InputTuple,
      WithdrawEvent.OutputTuple,
      WithdrawEvent.OutputObject
    >;
    Withdraw: TypedContractEvent<
      WithdrawEvent.InputTuple,
      WithdrawEvent.OutputTuple,
      WithdrawEvent.OutputObject
    >;
  };
}
