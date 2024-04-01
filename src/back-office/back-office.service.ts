import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Admin } from 'src/admin/entities/admin.entity';
import { User } from 'src/user/entities/user.entity';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { Repository } from 'typeorm';

@Injectable()
export class BackOfficeService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
  ) {}

  async getUsers(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.userRepository
        .createQueryBuilder('user')
        .select([
          'user.phoneNumber',
          'user.id',
          'user.createdDate',
          'user.isMobileVerified',
          'user.emailAddress',
          'user.status',
          'wallet.walletAddress',
        ])
        .leftJoin('user.wallet', 'wallet')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      console.log(data);

      const users = data[0];

      const userInfo = users.map((user) => {
        const walletAddress = user.wallet.walletAddress;
        delete user.wallet;
        return {
          ...user,
          walletAddress,
          createdDate: user.createdDate.toLocaleDateString(),
        };
      });

      return {
        data: userInfo,
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getWallets(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const wallets = await this.userWalletRepository.findAndCount({
        select: [
          'user',
          'walletBalance',
          'creditBalance',
          'pointBalance',
          'walletAddress',
        ],
        skip: (page - 1) * limit,
        take: limit,
      });

      const walletsInfo = wallets[0].map((wallet) => {
        console.log(wallet);
        return {
          ...wallet,
          walletBalance: (+wallet.walletBalance).toFixed(2),
          creditBalance: (+wallet.creditBalance).toFixed(2),
          pointBalance: (+wallet.pointBalance).toFixed(2),
        };
      });

      return {
        data: walletsInfo,
        currentPage: page,
        totalPages: Math.ceil(wallets[1] / limit),
      };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getStaffs(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.adminRepository.findAndCount({
        select: [
          'id',
          'username',
          'name',
          'emailAddress',
          'adminType',
          'createdDate',
          'status',
          'createdBy',
        ],
        skip: (page - 1) * limit,
        take: limit,
      });

      console.log(data);

      return {
        data: data[0],
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getTransactions(page: number = 1, limit: number = 10): Promise<any> {
    try {
      const data = await this.walletTxRepository
        .createQueryBuilder('walletTx')
        .select([
          'walletTx.id',
          'walletTx.txType',
          'walletTx.txAmount',
          'walletTx.status',
          'walletTx.createdDate',
          'walletTx.userWalletId',
          'userWallet.walletAddress',
          'userWallet.userId',
        ])
        .leftJoin('walletTx.userWallet', 'userWallet')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const transactions = data[0].map((tx) => {
        return {
          ...tx,
          createdDate: tx.createdDate.toLocaleDateString(),
        };
      });

      console.log(transactions);

      return {
        data: transactions,
        currentPage: page,
        totalPages: Math.ceil(data[1] / limit),
      };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }
}
