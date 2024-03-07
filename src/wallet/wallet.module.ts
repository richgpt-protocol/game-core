import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserWallet } from './entities/user-wallet.entity';
import { CreditWalletTx } from './entities/credit-wallet-tx.entity';
import { ClaimTx } from './entities/claim-tx.entity';
import { DepositTx } from './entities/deposit-tx.entity';
import { RedeemTx } from './entities/redeem-tx.entity';
import { SupplyTx } from './entities/supply-tx.entity';
import { WalletTx } from './entities/wallet-tx.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserWallet,
      CreditWalletTx,
      ClaimTx,
      DepositTx,
      RedeemTx,
      SupplyTx,
      WalletTx,
    ]),
  ],
  providers: [],
  controllers: [],
  exports: [],
})
export class WalletlModule {}
