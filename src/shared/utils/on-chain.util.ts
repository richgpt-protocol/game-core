import { ethers } from 'ethers';

export class OnChainUtil {
  static async waitForTransaction(
    txResponse: ethers.TransactionResponse,
    backupProvider?: ethers.Provider,
  ): Promise<ethers.TransactionReceipt | null> {
    let txReceipt: ethers.TransactionReceipt | null;
    try {
      // wait for 1 confirmation block or 1 minute
      txReceipt = await txResponse.wait(1, 60000);
      if (!txReceipt) {
        throw new Error('Transaction receipt not found');
      }
    } catch (error) {
      // if timeout, wait() will throw error "wait for transaction timeout"
      console.log('error', error);
      // try to get receipt from second provider
      txReceipt = await backupProvider.getTransactionReceipt(txResponse.hash);
      if (!txReceipt) {
        throw new Error('Transaction receipt not found');
      }
    }
    return txReceipt;
  }
}
