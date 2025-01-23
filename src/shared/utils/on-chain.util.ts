import { ethers } from 'ethers';

export class OnChainUtil {
  static async waitForTransaction(
    txResponse: ethers.TransactionResponse,
    provider: ethers.Provider,
  ): Promise<ethers.TransactionReceipt | null> {
    let txReceipt: ethers.TransactionReceipt | null;
    // wait for 1 confirmation block or 1 minute
    txReceipt = await txResponse.wait(1, 60000);
    if (!txReceipt) {
      // 1 minute timeout and txResponse.wait() return null
      // try to get receipt from rpc provider
      // this is still null possible
      txReceipt = await provider.getTransactionReceipt(txResponse.hash);
    }
    return txReceipt;
  }
}
