export enum QueueName {
  BET = 'BET_QUEUE',
  GAME = 'GAME_QUEUE',
  CREDIT = 'CREDIT_QUEUE',
  DEPOSIT = 'DEPOSIT_QUEUE',
  WITHDRAW = 'WITHDRAW_QUEUE',
  REFERRAL_BONUS = 'REFERRAL_BONUS_QUEUE',
  TERMINATE = 'TERMINATE_QUEUE',
  MESSAGE = 'MESSAGE_QUEUE',
  JACKPOT = 'JACKPOT_QUEUE',
  CLAIM = 'CLAIM_QUEUE',
}

export enum QueueType {
  SUBMIT_BET = 'SUBMIT_BET',
  DEPOSIT_ESCROW = 'DEPOSIT_ESCROW',
  DEPOSIT_GAMEUSD_ONCHAIN = 'DEPOSIT_GAMEUSD_ONCHAIN',
  DEPOSIT_GAMEUSD_DB = 'DEPOSIT_GAMEUSD_DB',
  SUBMIT_SUCCESS_PROCESS = 'SUBMIT_SUCCESS_PROCESS',
  SUBMIT_DRAW_RESULT = 'SUBMIT_DRAW_RESULT',
  SUBMIT_CREDIT = 'SUBMIT_CREDIT',
  REVOKE_CREDIT = 'REVOKE_CREDIT',
  PROCESS_WITHDRAW = 'PROCESS_WITHDRAW',
  PROCESS_PAYOUT = 'PROCESS_PAYOUT',
  WINNING_REFERRAL_BONUS = 'WINNING_REFERRAL_BONUS',
  BETTING_REFERRAL_DISTRIBUTION = 'BETTING_REFERRAL_DISTRIBUTION',
  RECALL_GAMEUSD = 'RECALL_GAMEUSD',
  RECALL_GAS = 'RECALL_GAS',
  SEND_TELEGRAM_MESSAGE = 'SEND_TELEGRAM_MESSAGE',
  PARTICIPATE_JACKPOT = 'PARTICIPATE_JACKPOT',
  CLAIM_JACKPOT = 'CLAIM_JACKPOT',
}
