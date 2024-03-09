import { split, combine } from 'shamirs-secret-sharing-ts';
import { ethers } from 'ethers';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const serverUrls = [ // TO CHANGE
  process.env.MPC_SERVER_URL_1,
  process.env.MPC_SERVER_URL_2,
  process.env.MPC_SERVER_URL_3,
]

export class MPC {

  // generate random private key, split & send to servers
  public static createWallet = async (): Promise<string> => {
    const wallet = ethers.Wallet.createRandom()
    const privateKey = wallet.privateKey
    const secret = Buffer.from(privateKey)
    const shares = split(secret, { shares: 3, threshold: 2 })
    for (let i = 0; i < serverUrls.length; i++) {
      const url = serverUrls[i]
      await axios.post(
        url + '/storeShare',
        {
          walletAddress: wallet.address,
          share: shares[i].toString('hex')
        }
      )
    }
    // TODO: catch error if cannot post to server and alert
    return wallet.address
  }

  // retrieve share from servers and combine
  public static retrievePrivateKey = async (walletAddress: string): Promise<string> => {
    const shares = []
    for (const url of serverUrls) {
      let res
      try {
        res = await axios.get(
          url + `/getShare/?walletAddress=${walletAddress}`,
          { timeout: 3000 }
        )
      } catch (e) {
        // TODO: alert
        console.error('error when fetch share from server')
        console.error(e)
        continue
      }
      const share = res.data.share
      if (share === 'not found') {
        console.error('retrievePrivateKey: share not found')
        console.error(url)
        // TODO: handle share not found
        return ''
      }
      shares.push(share)
    }

    if (shares.length < 2) {
      console.error('collected shares under threshold')
      // TODO: handle shares under threshold
      return ''
    }
    const privateKey = combine(shares).toString()
    return privateKey
  }

  public static replaceShares = async (walletAddress: string) => {
    // TODO: check if old shares is same as new shares
    const privateKey = await this.retrievePrivateKey(walletAddress)
    const secret = Buffer.from(privateKey)
    const shares = split(secret, { shares: 4, threshold: 2 })
    for (let i = 0; i < serverUrls.length; i++) {
      const url = serverUrls[i]
      await axios.post(
        url + '/replaceShare',
        {
          walletAddress: walletAddress,
          share: shares[i].toString('hex')
        }
      )
      console.log(shares[i].toString('hex'))
    }
    // TODO: catch error if cannot post to server and alert
  }
}
