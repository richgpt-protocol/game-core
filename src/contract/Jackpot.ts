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

export declare namespace IJackpot {
  export type ClaimParamsStruct = {
    projectName: string;
    winningRound: BigNumberish;
    jackpotHashToClaim: BytesLike;
  };

  export type ClaimParamsStructOutput = [
    projectName: string,
    winningRound: bigint,
    jackpotHashToClaim: string
  ] & { projectName: string; winningRound: bigint; jackpotHashToClaim: string };
}

export interface JackpotInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "UPGRADE_INTERFACE_VERSION"
      | "claim"
      | "drawJackpotHash"
      | "getProjectRewardAmount"
      | "getProjectRoundData"
      | "getProjectRoundParticipantHashes"
      | "initialize"
      | "isJackpotHashClaimed"
      | "owner"
      | "participate"
      | "projects"
      | "proxiableUUID"
      | "renounceOwnership"
      | "setJackpotHash"
      | "setProject"
      | "transferOwnership"
      | "upgradeToAndCall"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "Claimed"
      | "Initialized"
      | "JackpotContractSet"
      | "JackpotHashDrawn"
      | "JackpotHashSet"
      | "OwnershipTransferred"
      | "Participated"
      | "ProjectSet"
      | "Upgraded"
  ): EventFragment;

  encodeFunctionData(
    functionFragment: "UPGRADE_INTERFACE_VERSION",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "claim",
    values: [AddressLike, IJackpot.ClaimParamsStruct[]]
  ): string;
  encodeFunctionData(
    functionFragment: "drawJackpotHash",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "getProjectRewardAmount",
    values: [string, BigNumberish[]]
  ): string;
  encodeFunctionData(
    functionFragment: "getProjectRoundData",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getProjectRoundParticipantHashes",
    values: [string, BigNumberish, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "isJackpotHashClaimed",
    values: [string, BytesLike]
  ): string;
  encodeFunctionData(functionFragment: "owner", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "participate",
    values: [
      string,
      AddressLike,
      BigNumberish,
      BigNumberish,
      AddressLike,
      BigNumberish,
      BytesLike
    ]
  ): string;
  encodeFunctionData(functionFragment: "projects", values: [string]): string;
  encodeFunctionData(
    functionFragment: "proxiableUUID",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "renounceOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setJackpotHash",
    values: [string, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "setProject",
    values: [
      string,
      AddressLike,
      AddressLike,
      AddressLike,
      AddressLike,
      BigNumberish,
      BigNumberish,
      boolean,
      BigNumberish[],
      BigNumberish[]
    ]
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
  decodeFunctionResult(functionFragment: "claim", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "drawJackpotHash",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getProjectRewardAmount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getProjectRoundData",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getProjectRoundParticipantHashes",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "isJackpotHashClaimed",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "participate",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "projects", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "proxiableUUID",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setJackpotHash",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "setProject", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "upgradeToAndCall",
    data: BytesLike
  ): Result;
}

export namespace ClaimedEvent {
  export type InputTuple = [
    projectName: string,
    participantAddress: AddressLike,
    winningRound: BigNumberish,
    jackpotHash: BytesLike,
    charMatched: BigNumberish,
    rewardTokenAddress: AddressLike,
    rewardAmount: BigNumberish
  ];
  export type OutputTuple = [
    projectName: string,
    participantAddress: string,
    winningRound: bigint,
    jackpotHash: string,
    charMatched: bigint,
    rewardTokenAddress: string,
    rewardAmount: bigint
  ];
  export interface OutputObject {
    projectName: string;
    participantAddress: string;
    winningRound: bigint;
    jackpotHash: string;
    charMatched: bigint;
    rewardTokenAddress: string;
    rewardAmount: bigint;
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

export namespace JackpotContractSetEvent {
  export type InputTuple = [jackpotContract: AddressLike];
  export type OutputTuple = [jackpotContract: string];
  export interface OutputObject {
    jackpotContract: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace JackpotHashDrawnEvent {
  export type InputTuple = [projectName: string, drawCount: BigNumberish];
  export type OutputTuple = [projectName: string, drawCount: bigint];
  export interface OutputObject {
    projectName: string;
    drawCount: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace JackpotHashSetEvent {
  export type InputTuple = [projectName: string, jackpotHash: BytesLike];
  export type OutputTuple = [projectName: string, jackpotHash: string];
  export interface OutputObject {
    projectName: string;
    jackpotHash: string;
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

export namespace ParticipatedEvent {
  export type InputTuple = [
    projectName: string,
    participantAddress: AddressLike,
    participantUid: BigNumberish,
    participantTicketId: BigNumberish,
    feeTokenAddress: AddressLike,
    feeAmount: BigNumberish,
    randomHash: BytesLike
  ];
  export type OutputTuple = [
    projectName: string,
    participantAddress: string,
    participantUid: bigint,
    participantTicketId: bigint,
    feeTokenAddress: string,
    feeAmount: bigint,
    randomHash: string
  ];
  export interface OutputObject {
    projectName: string;
    participantAddress: string;
    participantUid: bigint;
    participantTicketId: bigint;
    feeTokenAddress: string;
    feeAmount: bigint;
    randomHash: string;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace ProjectSetEvent {
  export type InputTuple = [projectName: string];
  export type OutputTuple = [projectName: string];
  export interface OutputObject {
    projectName: string;
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

export interface Jackpot extends BaseContract {
  connect(runner?: ContractRunner | null): Jackpot;
  waitForDeployment(): Promise<this>;

  interface: JackpotInterface;

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

  claim: TypedContractMethod<
    [
      participantAddress: AddressLike,
      claimParams: IJackpot.ClaimParamsStruct[]
    ],
    [void],
    "nonpayable"
  >;

  drawJackpotHash: TypedContractMethod<
    [projectName: string],
    [void],
    "nonpayable"
  >;

  getProjectRewardAmount: TypedContractMethod<
    [projectName: string, charMatched: BigNumberish[]],
    [bigint[]],
    "view"
  >;

  getProjectRoundData: TypedContractMethod<
    [projectName: string, round: BigNumberish],
    [[bigint, string] & { drawCount: bigint; winningHash: string }],
    "view"
  >;

  getProjectRoundParticipantHashes: TypedContractMethod<
    [projectName: string, round: BigNumberish, participantAddress: AddressLike],
    [string[]],
    "view"
  >;

  initialize: TypedContractMethod<[owner: AddressLike], [void], "nonpayable">;

  isJackpotHashClaimed: TypedContractMethod<
    [projectName: string, jackpotHash: BytesLike],
    [boolean],
    "view"
  >;

  owner: TypedContractMethod<[], [string], "view">;

  participate: TypedContractMethod<
    [
      projectName: string,
      participantAddress: AddressLike,
      participantUid: BigNumberish,
      participantTicketId: BigNumberish,
      feeTokenAddress: AddressLike,
      feeAmount: BigNumberish,
      signature: BytesLike
    ],
    [void],
    "payable"
  >;

  projects: TypedContractMethod<
    [arg0: string],
    [
      [string, string, string, string, bigint, bigint, bigint, boolean] & {
        ownerAddress: string;
        signerAddress: string;
        rewardTokenAddress: string;
        feeAndRewardContractAddress: string;
        currentRound: bigint;
        currentRoundStartTime: bigint;
        roundDuration: bigint;
        isPaused: boolean;
      }
    ],
    "view"
  >;

  proxiableUUID: TypedContractMethod<[], [string], "view">;

  renounceOwnership: TypedContractMethod<[], [void], "nonpayable">;

  setJackpotHash: TypedContractMethod<
    [projectName: string, jackpotHash: BytesLike],
    [void],
    "nonpayable"
  >;

  setProject: TypedContractMethod<
    [
      projectName: string,
      ownerAddress: AddressLike,
      signerAddress: AddressLike,
      rewardTokenAddress: AddressLike,
      feeAndRewardContractAddress: AddressLike,
      currentRoundStartTime: BigNumberish,
      roundDuration: BigNumberish,
      isPaused: boolean,
      charMatched: BigNumberish[],
      rewardAmount: BigNumberish[]
    ],
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
    nameOrSignature: "claim"
  ): TypedContractMethod<
    [
      participantAddress: AddressLike,
      claimParams: IJackpot.ClaimParamsStruct[]
    ],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "drawJackpotHash"
  ): TypedContractMethod<[projectName: string], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "getProjectRewardAmount"
  ): TypedContractMethod<
    [projectName: string, charMatched: BigNumberish[]],
    [bigint[]],
    "view"
  >;
  getFunction(
    nameOrSignature: "getProjectRoundData"
  ): TypedContractMethod<
    [projectName: string, round: BigNumberish],
    [[bigint, string] & { drawCount: bigint; winningHash: string }],
    "view"
  >;
  getFunction(
    nameOrSignature: "getProjectRoundParticipantHashes"
  ): TypedContractMethod<
    [projectName: string, round: BigNumberish, participantAddress: AddressLike],
    [string[]],
    "view"
  >;
  getFunction(
    nameOrSignature: "initialize"
  ): TypedContractMethod<[owner: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "isJackpotHashClaimed"
  ): TypedContractMethod<
    [projectName: string, jackpotHash: BytesLike],
    [boolean],
    "view"
  >;
  getFunction(
    nameOrSignature: "owner"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "participate"
  ): TypedContractMethod<
    [
      projectName: string,
      participantAddress: AddressLike,
      participantUid: BigNumberish,
      participantTicketId: BigNumberish,
      feeTokenAddress: AddressLike,
      feeAmount: BigNumberish,
      signature: BytesLike
    ],
    [void],
    "payable"
  >;
  getFunction(
    nameOrSignature: "projects"
  ): TypedContractMethod<
    [arg0: string],
    [
      [string, string, string, string, bigint, bigint, bigint, boolean] & {
        ownerAddress: string;
        signerAddress: string;
        rewardTokenAddress: string;
        feeAndRewardContractAddress: string;
        currentRound: bigint;
        currentRoundStartTime: bigint;
        roundDuration: bigint;
        isPaused: boolean;
      }
    ],
    "view"
  >;
  getFunction(
    nameOrSignature: "proxiableUUID"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "renounceOwnership"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setJackpotHash"
  ): TypedContractMethod<
    [projectName: string, jackpotHash: BytesLike],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "setProject"
  ): TypedContractMethod<
    [
      projectName: string,
      ownerAddress: AddressLike,
      signerAddress: AddressLike,
      rewardTokenAddress: AddressLike,
      feeAndRewardContractAddress: AddressLike,
      currentRoundStartTime: BigNumberish,
      roundDuration: BigNumberish,
      isPaused: boolean,
      charMatched: BigNumberish[],
      rewardAmount: BigNumberish[]
    ],
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
    key: "Claimed"
  ): TypedContractEvent<
    ClaimedEvent.InputTuple,
    ClaimedEvent.OutputTuple,
    ClaimedEvent.OutputObject
  >;
  getEvent(
    key: "Initialized"
  ): TypedContractEvent<
    InitializedEvent.InputTuple,
    InitializedEvent.OutputTuple,
    InitializedEvent.OutputObject
  >;
  getEvent(
    key: "JackpotContractSet"
  ): TypedContractEvent<
    JackpotContractSetEvent.InputTuple,
    JackpotContractSetEvent.OutputTuple,
    JackpotContractSetEvent.OutputObject
  >;
  getEvent(
    key: "JackpotHashDrawn"
  ): TypedContractEvent<
    JackpotHashDrawnEvent.InputTuple,
    JackpotHashDrawnEvent.OutputTuple,
    JackpotHashDrawnEvent.OutputObject
  >;
  getEvent(
    key: "JackpotHashSet"
  ): TypedContractEvent<
    JackpotHashSetEvent.InputTuple,
    JackpotHashSetEvent.OutputTuple,
    JackpotHashSetEvent.OutputObject
  >;
  getEvent(
    key: "OwnershipTransferred"
  ): TypedContractEvent<
    OwnershipTransferredEvent.InputTuple,
    OwnershipTransferredEvent.OutputTuple,
    OwnershipTransferredEvent.OutputObject
  >;
  getEvent(
    key: "Participated"
  ): TypedContractEvent<
    ParticipatedEvent.InputTuple,
    ParticipatedEvent.OutputTuple,
    ParticipatedEvent.OutputObject
  >;
  getEvent(
    key: "ProjectSet"
  ): TypedContractEvent<
    ProjectSetEvent.InputTuple,
    ProjectSetEvent.OutputTuple,
    ProjectSetEvent.OutputObject
  >;
  getEvent(
    key: "Upgraded"
  ): TypedContractEvent<
    UpgradedEvent.InputTuple,
    UpgradedEvent.OutputTuple,
    UpgradedEvent.OutputObject
  >;

  filters: {
    "Claimed(string,address,uint256,bytes32,uint256,address,uint256)": TypedContractEvent<
      ClaimedEvent.InputTuple,
      ClaimedEvent.OutputTuple,
      ClaimedEvent.OutputObject
    >;
    Claimed: TypedContractEvent<
      ClaimedEvent.InputTuple,
      ClaimedEvent.OutputTuple,
      ClaimedEvent.OutputObject
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

    "JackpotContractSet(address)": TypedContractEvent<
      JackpotContractSetEvent.InputTuple,
      JackpotContractSetEvent.OutputTuple,
      JackpotContractSetEvent.OutputObject
    >;
    JackpotContractSet: TypedContractEvent<
      JackpotContractSetEvent.InputTuple,
      JackpotContractSetEvent.OutputTuple,
      JackpotContractSetEvent.OutputObject
    >;

    "JackpotHashDrawn(string,uint256)": TypedContractEvent<
      JackpotHashDrawnEvent.InputTuple,
      JackpotHashDrawnEvent.OutputTuple,
      JackpotHashDrawnEvent.OutputObject
    >;
    JackpotHashDrawn: TypedContractEvent<
      JackpotHashDrawnEvent.InputTuple,
      JackpotHashDrawnEvent.OutputTuple,
      JackpotHashDrawnEvent.OutputObject
    >;

    "JackpotHashSet(string,bytes32)": TypedContractEvent<
      JackpotHashSetEvent.InputTuple,
      JackpotHashSetEvent.OutputTuple,
      JackpotHashSetEvent.OutputObject
    >;
    JackpotHashSet: TypedContractEvent<
      JackpotHashSetEvent.InputTuple,
      JackpotHashSetEvent.OutputTuple,
      JackpotHashSetEvent.OutputObject
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

    "Participated(string,address,uint256,uint256,address,uint256,bytes32)": TypedContractEvent<
      ParticipatedEvent.InputTuple,
      ParticipatedEvent.OutputTuple,
      ParticipatedEvent.OutputObject
    >;
    Participated: TypedContractEvent<
      ParticipatedEvent.InputTuple,
      ParticipatedEvent.OutputTuple,
      ParticipatedEvent.OutputObject
    >;

    "ProjectSet(string)": TypedContractEvent<
      ProjectSetEvent.InputTuple,
      ProjectSetEvent.OutputTuple,
      ProjectSetEvent.OutputObject
    >;
    ProjectSet: TypedContractEvent<
      ProjectSetEvent.InputTuple,
      ProjectSetEvent.OutputTuple,
      ProjectSetEvent.OutputObject
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
  };
}
