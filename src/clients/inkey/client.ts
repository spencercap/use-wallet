/**
 * Helpful resources:
 * https://github.com/thencc/inkey-client-js
 */
import BaseWallet from "../base";
// import type _MyAlgoConnect from "@randlabs/myalgo-connect";
import type { createInkeyClient } from "@thencc/inkey-client-js";
import type _algosdk from "algosdk";
import Algod, { getAlgodClient } from "../../algod";
import { DEFAULT_NETWORK, PROVIDER_ID } from "../../constants";
import {
  TransactionsArray,
  DecodedTransaction,
  DecodedSignedTransaction,
  Network,
} from "../../types";
// import { MyAlgoWalletClientConstructor, InitParams } from "./types";
import { InitParams, InkeyClientType, InkeyWalletClientConstructor } from "./types";
import { ICON } from "./constants";

class InkeyWalletClient extends BaseWallet {
  // #client: _MyAlgoConnect;
  // #client: InkeyWalletClientConstructor['client'];
  #client: InkeyClientType;
  network: Network;

  constructor({
    client,
    algosdk,
    algodClient,
    network,
  }: InkeyWalletClientConstructor) {
    super(algosdk, algodClient);
    this.#client = client;
    this.network = network;
  }

  static metadata = {
    id: PROVIDER_ID.INKEY,
    name: "Inkey Microwallet",
    icon: ICON,
    isWalletConnect: false,
  };

  static async init({
    clientOptions,
    algodOptions,
    clientStatic,
    algosdkStatic,
    network = DEFAULT_NETWORK,
  }: InitParams) {
    try {
      // const MyAlgoConnect = clientStatic || (await import("@randlabs/myalgo-connect")).default;
      // const createInkeyClient = clientStatic || (await import("@thencc/inkey-client-js")).inkeyClient();

      // const createInkeyClient = clientStatic || await (await import("@thencc/inkey-client-js")).inkeyClient()
      const inkeyClient = clientStatic || await (await import("@thencc/inkey-client-js")).createInkeyClient({
        // src: clientOptions?.iFrameUrl
        src: 'http://127.0.0.1:5200'
      });

      const algosdk = algosdkStatic || (await Algod.init(algodOptions)).algosdk;
      const algodClient = await getAlgodClient(algosdk, algodOptions);

      // const myAlgo = new MyAlgoConnect({
      //   ...(clientOptions ? clientOptions : { disableLedgerNano: false }),
      // });

      // return new MyAlgoWalletClient({
      //   client: myAlgo,
      //   algosdk: algosdk,
      //   algodClient: algodClient,
      //   network,
      // });



      // works... but not exaclty right.
      // const inkeyClientConstructed: InkeyWalletClientConstructor = {
      //   client: inkeyClient,
      //   algosdk: algosdk,
      //   algodClient: algodClient,
      //   network
      // };
      // return inkeyClientConstructed;

      return new InkeyWalletClient({
        client: inkeyClient,
        algosdk: algosdk,
        algodClient: algodClient,
        network
      });
    } catch (e) {
      console.error("Error initializing...", e);
      return null;
    }
  }

  async connect() {
    // const accounts = await this.#client.connect();

    const inkeyAccount = await this.#client.inkeyConnect(); // TODO return .address + .name/.username AND return as array
    const accounts = [{
      address: inkeyAccount.address,
      name: 'TODO - return inkey username',
    }];

    if (accounts.length === 0) {
      throw new Error(
        `No accounts found for ${InkeyWalletClient.metadata.id}`
      );
    }

    const mappedAccounts = accounts.map((account) => ({
      ...account,
      providerId: InkeyWalletClient.metadata.id,
    }));

    return {
      ...InkeyWalletClient.metadata,
      accounts: mappedAccounts,
    };
  }

  async reconnect() {
    console.warn('TODO inkey reconnect');
    return null;
  }

  async disconnect() {
    console.warn('TODO inkey disconnect');
    return;
  }

  async signTransactions(
    connectedAccounts: string[],
    transactions: Uint8Array[]
  ) {
    // Decode the transactions to access their properties.
    const decodedTxns = transactions.map((txn) => {
      return this.algosdk.decodeObj(txn);
    }) as Array<DecodedTransaction | DecodedSignedTransaction>;
    console.log('decodedTxns', decodedTxns);

    // Get the unsigned transactions.
    const txnsToSign = decodedTxns.reduce<Uint8Array[]>((acc, txn, i) => {
      // If the transaction isn't already signed and is to be sent from a connected account,
      // add it to the arrays of transactions to be signed.

      console.log('readout txnsToSign:', {
        acc,
        txn,
        i
      });

      if (
        !("txn" in txn) &&
        connectedAccounts.includes(this.algosdk.encodeAddress(txn["snd"]))
      ) {
        // convert Uint8Array txn to base64 str txn for inkey

        acc.push(transactions[i]);
      }

      return acc;
    }, []);

    // Sign them with the client.
    // const result = await this.#client.signTransaction(txnsToSign);
    // const result = 'TODO' as any;
    const result = await this.#client.inkeySignTxnsUint8Array(txnsToSign);
    console.log('result', result);

    if (!result.success) {
      throw new Error('did not sign txns');
    }

    // put in extra array since incoming is a single txn...
    const preSignedTxns = [result.signedTxns] as Uint8Array[];
    console.log('preSignedTxns', preSignedTxns);

    // Join the newly signed transactions with the original group of transactions.
    const signedTxns = decodedTxns.reduce<Uint8Array[]>((acc, txn, i) => {
      if (!("txn" in txn)) {
        // const signedByUser = result.shift()?.blob;
        // const signedByUser = preSignedTxns.shift()?.blob;
        const signedByUser = preSignedTxns.shift();
        signedByUser && acc.push(signedByUser);
      } else {
        acc.push(transactions[i]);
      }

      return acc;
    }, []);

    return signedTxns;
  }

  // async signTransactions(
  //   connectedAccounts: string[],
  //   transactions: Uint8Array[]
  // ) {
  //   // Decode the transactions to access their properties.
  //   const decodedTxns = transactions.map((txn) => {
  //     return this.algosdk.decodeObj(txn);
  //   }) as Array<DecodedTransaction | DecodedSignedTransaction>;

  //   // Get the unsigned transactions.
  //   const txnsToSign = decodedTxns.reduce<Uint8Array[]>((acc, txn, i) => {
  //     // If the transaction isn't already signed and is to be sent from a connected account,
  //     // add it to the arrays of transactions to be signed.

  //     if (
  //       !("txn" in txn) &&
  //       connectedAccounts.includes(this.algosdk.encodeAddress(txn["snd"]))
  //     ) {
  //       acc.push(transactions[i]);
  //     }

  //     return acc;
  //   }, []);

  //   // Sign them with the client.
  //   const result = await this.#client.signTransaction(txnsToSign);

  //   // Join the newly signed transactions with the original group of transactions.
  //   const signedTxns = decodedTxns.reduce<Uint8Array[]>((acc, txn, i) => {
  //     if (!("txn" in txn)) {
  //       const signedByUser = result.shift()?.blob;
  //       signedByUser && acc.push(signedByUser);
  //     } else {
  //       acc.push(transactions[i]);
  //     }

  //     return acc;
  //   }, []);

  //   return signedTxns;
  // }

  /** @deprecated */
  async signEncodedTransactions(transactions: TransactionsArray) {
    // const transactionsToSign: string[] = [];
    const signedRawTransactions: Uint8Array[] = [];
    console.warn('signEncodedTransactions is deprecated...');

    // for (const [type, txn] of transactions) {
    //   if (type === "u") {
    //     transactionsToSign.push(txn);
    //   }
    // }

    // const result = await this.#client.signTransaction(transactionsToSign);

    // if (!result) {
    //   throw new Error("Signing failed.");
    // }

    // let resultIndex = 0;

    // for (const [type, txn] of transactions) {
    //   if (type === "u") {
    //     signedRawTransactions.push(result[resultIndex].blob);
    //     resultIndex++;
    //   } else {
    //     signedRawTransactions.push(new Uint8Array(Buffer.from(txn, "base64")));
    //   }
    // }

    return signedRawTransactions;
  }
}

export default InkeyWalletClient;
