import { FallbackProvider, JsonRpcProvider } from 'ethers';
import 'dotenv/config';

export class ProviderUtil {
  public static createFallbackProvider = (chainId: string) => {
    return new FallbackProvider(
      [
        {
          provider: new JsonRpcProvider(
            process.env[`PROVIDER_RPC_URL_${chainId}`],
          ),
          priority: 1,
          stallTimeout: 3000,
          weight: 2,
        },
        {
          provider: new JsonRpcProvider(
            process.env[`PROVIDER_RPC_URL_BACKUP_${chainId}`],
          ),
          priority: 2,
          stallTimeout: 6000,
          weight: 1,
        },
      ],
      undefined,
      { quorum: 1 },
    );
  };
}
