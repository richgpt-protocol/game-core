import { BadRequestException, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { WalletService } from 'src/wallet/wallet.service';
import { GetProfileDto } from './dtos/get-profile.dto';
import { UpdateUserGameDto } from './dtos/update-user-game.dto';

@Injectable()
export class PublicService {
  constructor(
    private userService: UserService,
    private walletService: WalletService,
  ) {}

  async findUser(payload: GetProfileDto) {
    let field = '';
    let property: string;

    if (payload.tgId) {
      field = 'telegramId';
      property = payload.tgId;
    } else if (payload.uid) {
      field = 'uid';
      property = payload.uid;
    }

    const user = await this.userService.findByCriteria(field, property);
    if (!user) {
      return null;
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      return null;
    }

    return {
      uid: user.uid,
      tgId: user.telegramId,
      xp: userWallet.pointBalance,
      walletBalance: userWallet.walletBalance,
      creditBalance: userWallet.creditBalance,
      userLevel: this.walletService.calculateLevel(userWallet.pointBalance),
    };
  }

  async calculateUserLevel(point: number) {
    return this.walletService.calculateLevel(point);
  }

  async updateUserGame(payload: UpdateUserGameDto) {
    const user = await this.userService.findByCriteria('uid', payload.uid);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const userWallet = await this.walletService.getWalletInfo(user.id);
    if (!userWallet) {
      throw new BadRequestException('User wallet not found');
    }

    // TODO: Synchronise user balances - Seshanth

    const xp = Number(userWallet.pointBalance) + payload.xp;
    return {
      uid: user.uid,
      xp,
      level: this.walletService.calculateLevel(xp),
      gameSessionToken: payload.gameSessionToken,
    };
  }
}
