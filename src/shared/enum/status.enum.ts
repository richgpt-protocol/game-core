export enum AdminStatus {
  ACTIVE = 'A',
  INACTIVE = 'I',
  SUSPENDED = 'S',
}

export enum GeneralStatus {
  ACTIVE = 'A',
  INACTIVE = 'I',
}

export enum UserStatus {
  ACTIVE = 'A',
  INACTIVE = 'I',
  SUSPENDED = 'S',
  TERMINATED = 'T',
  UNVERIFIED = 'U',
  PENDING = 'P',
  REJECTED = 'R',
}

export enum TxStatus {
  SUCCESS = 'S',
  PENDING = 'P',
  FAILED = 'F',
  PENDING_ADMIN = 'PA',
  PENDING_DEVELOPER = 'PD',
}

export enum ReferralTxStatus {
  SUCCESS = 'S',
  PENDING = 'P',
  PENDING_DEVELOPER = 'PD',
  FAILED = 'F',
}
