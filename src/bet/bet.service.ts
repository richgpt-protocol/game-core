/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BetDto, FormatBetsDTO, Permutations } from './dto/bet.dto';
import { Bet } from './entities/bet.entity';
import { Repository } from 'typeorm';
import {
  JsonRpcProvider,
  MaxUint256,
  Wallet as walletEthers,
  formatUnits,
  BigNumberish,
} from 'ethers';
import { Game } from 'src/game/entities/game.entity';
import { ConfigService } from 'src/config/config.service';
import { Contract, parseUnits } from 'ethers';
import { Core, Core__factory, Helper__factory } from 'src/contract';
import { Wallet } from 'src/wallet/entities/wallet.entity';

@Injectable()
export class BetService {
  constructor(
    @InjectRepository(Bet)
    private betRepository: Repository<Bet>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    private configService: ConfigService,
  ) {}

  async bet(id: number, payload: BetDto[]) {
    const provider = new JsonRpcProvider(this.configService.get('RPC_URL'));

    const coreContractAddr = this.configService.get('CORE_CONTRACT');
    const coreContract = Core__factory.connect(coreContractAddr, provider);

    const isClosed = await coreContract.isBetClosed();
    if (isClosed) throw new BadRequestException('Bet is closed');
    const currentEpoch = await coreContract.currentEpoch();

    //check total Bets exceeds maxBet for each bet //TODO

    const wallet = await this._getWallet(id);
    const userSigner = new walletEthers(wallet.privateKey, provider);
    await this._checkPreviousBetAndApprove(wallet, userSigner, coreContract);

    //credit checks
    const useCredit = false; //TODO check whether this is passed from
    const totalCredits = this._getTotalCredits(wallet);

    const { bets, creditUsed, gameUSDUsed } = await this._processBets(
      payload,
      currentEpoch,
      useCredit,
      totalCredits,
      wallet,
    );

    let tx = null;
    if (useCredit) {
      tx = await this._betWithCredit(payload, creditUsed, userSigner, provider);
    } else {
      tx = await this._betWithouCredit(payload, userSigner, provider);
    }

    //update txHash
    bets.forEach((bet) => {
      bet.txHash = tx.hash;
    });
    await this.betRepository.save(bets);

    await this._updateWalletAfterBet(wallet, gameUSDUsed, creditUsed);

    return {
      txHash: tx.hash,
      gameUsdBalance: wallet.balance - gameUSDUsed,
      creditBalance: totalCredits - creditUsed,
    };
  }

  async getUserBets(id: number, epoch: number) {
    const wallet = await this.walletRepository
      .createQueryBuilder('row')
      .where({ user: id })
      .getOne();
    const bets = await this.betRepository
      .createQueryBuilder('row')
      .select('row')
      .where({ wallet })
      .getMany();
    return bets.map((bet) => {
      delete bet.id;
      delete bet.walletId;
      delete bet.gameId;
      return bet;
    });
  }

  async estimateBetAmount(payload: FormatBetsDTO[]): Promise<number> {
    let totalAmount = 0;
    payload.forEach((bet) => {
      if (bet.permutation != Permutations.none) {
        if (!this._checkPermutation(bet.number, bet.permutation))
          throw new BadRequestException('Invalid permutation');

        if (bet.permutation === Permutations.pairs_24) {
          totalAmount += bet.amount * 24;
        }

        if (bet.permutation === Permutations.pairs_12) {
          totalAmount += bet.amount * 12;
        }

        if (bet.permutation === Permutations.pairs_6) {
          totalAmount += bet.amount * 6;
        }

        if (bet.permutation === Permutations.pairs_4) {
          totalAmount += bet.amount * 4;
        }
      } else {
        totalAmount += bet.amount;
      }
    });

    return totalAmount;
  }

  async formatBets(payload: FormatBetsDTO[]): Promise<Array<BetDto>> {
    const bets = [];
    let totalAmount = 0;
    payload.forEach((bet) => {
      if (bet.permutation != Permutations.none) {
        if (!this._checkPermutation(bet.number, bet.permutation))
          throw new BadRequestException('Invalid permutation');

        const permutations = this._generatePermutations(
          bet.number,
          bet.permutation,
        );

        totalAmount += bet.amount * permutations.length;

        permutations.forEach((permutation) => {
          bets.push({
            epoch: bet.epoch,
            number: permutation,
            forecast: bet.forecast,
            amount: +bet.amount,
          });
        });
      } else {
        totalAmount += bet.amount;
        bets.push({
          epoch: bet.epoch,
          number: bet.number,
          forecast: bet.forecast,
          amount: +bet.amount,
        });
      }
    });

    return bets;
  }

  private _generatePermutations(
    number: string,
    permutation: Permutations,
  ): Array<string> {
    const numbers = number.toString().split('');
    const result = [];

    if (permutation === Permutations.pairs_24) {
      result.push(...this._permutations(numbers, 4, 24));
    }

    if (permutation === Permutations.pairs_12) {
      result.push(...this._permutations(numbers, 4, 12));
    }

    if (permutation === Permutations.pairs_6) {
      result.push(...this._permutations(numbers, 4, 6));
    }

    if (permutation === Permutations.pairs_4) {
      result.push(...this._permutations(numbers, 4, 4));
    }

    return result;
  }

  private _permutations(letters, size, limit) {
    const results = [];
    for (let i = 0; i < letters.length; i++) {
      const res = letters[i];
      if (size === 1) {
        results.push(res);
        if (results.length === limit) return results; // Stop when limit is reached
      } else {
        const rest = this._permutations(
          letters,
          size - 1,
          limit - results.length,
        );
        for (let j = 0; j < rest.length; j++) {
          results.push(res + rest[j]);
          if (results.length === limit) return results; // Stop when limit is reached
        }
      }
    }
    return results;
  }
  /**
     * [
  {
"epoch": 0,
"amount": 1,
"number": "1231",
"permutation": 3
}
]
     */

  private _checkPermutation(
    selectedNumber: string,
    permutation: Permutations,
  ): boolean {
    const digits = selectedNumber.toString().split('');
    if (digits.length !== 4) return false;

    console.log(digits, permutation);

    if (permutation === Permutations.pairs_24) {
      //unique digits should be 4
      if (new Set(digits).size !== 4) return false;
    }

    if (permutation === Permutations.pairs_12) {
      //unique digits should be 3 or 4
      if (new Set(digits).size < 3) return false;
    }

    if (permutation === Permutations.pairs_6) {
      //should have atleast 2 unique digits
      if (new Set(digits).size < 2) return false;
    }

    if (permutation === Permutations.pairs_4) {
      if (new Set(digits).size < 1) return false;
    }
    return true;
  }

  private _getTotalCredits(wallet: Wallet): number {
    return wallet.credits.reduce((acc, credit) => {
      if (credit.expiryDate > new Date()) {
        return acc + credit.amount;
      } else {
        return acc;
      }
    }, 0);
  }

  private async _getCurrentEpoch(coreContract) {
    const currentEpoch = await coreContract.currentEpoch();
    console.log(currentEpoch.toString());
    return currentEpoch;
  }

  private async _getWallet(id: number) {
    return await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoinAndSelect('wallet.credits', 'credit')
      .where('wallet.user = :id', { id })
      .orderBy({
        'credit.amount': 'ASC',
        'credit.expiryDate': 'ASC',
      })
      .getOne();
  }

  private async _checkPreviousBetAndApprove(wallet: Wallet, signer, spender) {
    const previousBet = await this.betRepository.findOneBy({ wallet });
    if (!previousBet) {
      await this._approveToken(signer, spender);
    }
  }

  private async _approveToken(signer, spender) {
    const token = new Contract(
      this.configService.get('TOKEN_CONTRACT'),
      [
        'function allowance(address owner, address spender) public view returns (uint256)',
        'function approve(address spender, uint256 amount) public returns (bool)',
      ],
      signer,
    );

    const allowance = await token.allowance(signer.address, spender);

    if (allowance < MaxUint256) {
      const tx = await token.approve(spender, MaxUint256);
      await tx.wait();
    }
  }

  private async _processBets(
    payload: BetDto[],
    currentEpoch: BigNumberish,
    useCredit: boolean,
    totalCredits: number,
    wallet: Wallet,
  ): Promise<{
    bets: Bet[];
    gameUSDUsed: number;
    creditUsed: number;
  }> {
    const maxCreditAllowed = +this.configService.get('MAX_CREDIT_ALLOWED');
    let creditUsed = 0;
    let gameUSDUsed = 0;
    const bets = [];
    for (const bet of payload) {
      if (bet.amount <= 0) throw new BadRequestException('Invalid bet amount');
      const game = await this.gameRepository.findOneBy({ epoch: bet.epoch });
      if (!game) throw new BadRequestException('Game not found');
      if (game.epoch < +currentEpoch.toString())
        throw new BadRequestException('Invalid epoch');

      let credit = 0;
      if (useCredit) {
        //remaining credits are enough to cover the bet
        if (totalCredits - creditUsed >= bet.amount) {
          //use full credit if bet amount is greater than maxCreditAllowed.
          credit =
            bet.amount > maxCreditAllowed ? maxCreditAllowed : bet.amount;
          creditUsed += credit;
          gameUSDUsed +=
            bet.amount > maxCreditAllowed ? bet.amount - maxCreditAllowed : 0;
        } else if (totalCredits - creditUsed > 0) {
          //not enough credits to cover the bet

          //use remaining credits
          const remainingCredit = totalCredits - creditUsed;
          credit = remainingCredit;
          creditUsed += remainingCredit;
          gameUSDUsed += bet.amount - remainingCredit;
        }
      } else {
        gameUSDUsed += bet.amount;
      }

      if (game.closeAt < new Date())
        throw new BadRequestException('last minute bet');

      bets.push(
        this.betRepository.create({
          number: bet.number,
          forecast: bet.forecast,
          amount: bet.amount,
          wallet,
          game,
          credit,
          txHash: null,
        }),
      );
    }
    if (wallet.balance < gameUSDUsed)
      throw new BadRequestException('Insufficient balance');
    if (creditUsed > totalCredits)
      throw new BadRequestException('Invalid credit'); //won't happen

    const betEntities = await this.betRepository.save(bets);

    return { bets: betEntities, gameUSDUsed, creditUsed };
  }

  private async _betWithCredit(
    payload: BetDto[],
    creditUsed: number,
    userSigner,
    provider,
  ) {
    const helperSigner = new walletEthers(process.env.HELPER_BOT_PK, provider);

    const helperContract = Helper__factory.connect(
      this.configService.get('HELPER_CONTRACT'),
      helperSigner,
    );

    const bets = payload.map((bet) => {
      return {
        epoch: bet.epoch,
        number: bet.number,
        amount: parseUnits(bet.amount.toString(), 18),
        forecast: bet.forecast ? 1 : 0,
      };
    });

    const betWithCreditParams = {
      user: userSigner.address,
      bets,
      credit: parseUnits(creditUsed.toString(), 18),
    };

    const tx = await helperContract.betWithCredit(betWithCreditParams);

    return tx;
  }

  private async _betWithouCredit(payload: BetDto[], userSigner, provider) {
    const coreContractAddr = this.configService.get('CORE_CONTRACT');
    const coreContract = Core__factory.connect(coreContractAddr, provider);

    const bets = payload.map((bet) => {
      return {
        epoch: bet.epoch,
        number: bet.number,
        amount: parseUnits(bet.amount.toString(), 18),
        forecast: bet.forecast ? 1 : 0,
      };
    });

    const tx = await coreContract
      .connect(userSigner)
      ['bet((uint256,uint256,uint256,uint8)[])'](bets);

    return tx;
  }

  private async _updateWalletAfterBet(
    wallet: Wallet,
    gameUSDUsed: number,
    creditUsed: number,
  ) {
    wallet.balance -= gameUSDUsed;
    wallet.credits = wallet.credits.map((credit) => {
      if (credit.expiryDate > new Date()) {
        if (creditUsed > credit.amount) {
          creditUsed -= credit.amount;
          return { ...credit, amount: 0 };
        } else {
          creditUsed = 0;
          return { ...credit, amount: credit.amount - creditUsed };
        }
      } else {
        return credit;
      }
    });
    await this.walletRepository.save(wallet);
  }
}
