import type _algosdk from "algosdk";
import { PROVIDER_ID } from "../constants";
import type {
  WalletProvider,
  Asset,
  Wallet,
  AccountInfo,
  ConfirmedTxn,
  TxnType,
  TransactionsArray,
  TxnInfo,
} from "../types";
import { audio } from "../media/audio";

const getIsIOS = () => {
  if (typeof window !== "undefined") {
    return (
      /iPad|iPhone|iPod/.test(navigator?.userAgent) &&
      !(window as any)?.MSStream
    );
  } else {
    return false;
  }
};

const isIOS = getIsIOS();

export interface BaseWalletInterface {
  connect(onDisconnect: () => void): Promise<Wallet>;
  healthCheck(): Promise<Record<string, never>>;
  disconnect(): Promise<void>;
  reconnect(onDisconnect: () => void): Promise<Wallet | null>;
  decodeTransaction(txn: string, isSigned: boolean): _algosdk.Transaction;
  logEncodedTransaction(txn: string, isSigned: boolean): void;
  groupTransactionsBySender(
    transactions: TransactionsArray
  ): Record<string, TxnInfo[]>;
  signTransactions(
    connectedAccounts: string[],
    transactions: Array<Uint8Array>
  ): Promise<Uint8Array[]>;
  signEncodedTransactions(
    transactions: TransactionsArray
  ): Promise<Uint8Array[]>;
  sendRawTransactions(
    transactions: Uint8Array[]
  ): Promise<ConfirmedTxn & { id: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccountInfo(address: string): Promise<AccountInfo>;
  getAssets(address: string): Promise<Asset[]>;
  waitForConfirmation(txId: string, timeout?: number): Promise<ConfirmedTxn>;
}

abstract class BaseWallet implements BaseWalletInterface {
  algosdk: typeof _algosdk;
  algodClient: _algosdk.Algodv2;
  keepWCAlive: HTMLAudioElement;

  protected abstract id: PROVIDER_ID;
  protected abstract provider: WalletProvider;

  abstract connect(onDisconnect: () => void): Promise<Wallet>;
  abstract disconnect(): Promise<void>;
  abstract reconnect(onDisconnect: () => void): Promise<Wallet | null>;
  abstract signTransactions(
    connectedAccounts: string[],
    transactions: Array<Uint8Array>
  ): Promise<Uint8Array[]>;
  abstract signEncodedTransactions(
    transactions: TransactionsArray
  ): Promise<Uint8Array[]>;

  protected constructor(
    algosdk: typeof _algosdk,
    algodClient: _algosdk.Algodv2
  ) {
    this.algosdk = algosdk;
    this.algodClient = algodClient;
    this.keepWCAlive = new Audio();
  }

  async healthCheck() {
    return await this.algodClient.healthCheck().do();
  }

  async getAccountInfo(address: string) {
    const accountInfo = await this.algodClient.accountInformation(address).do();

    if (!accountInfo) {
      throw new Error("Unable to get account information");
    }

    return accountInfo as AccountInfo;
  }

  async getAssets(address: string) {
    const accountInfo = await this.algodClient.accountInformation(address).do();

    if (!accountInfo || accountInfo.assets === undefined) {
      throw new Error("Unable to get account assets");
    }

    return accountInfo.assets as Asset[];
  }

  async waitForConfirmation(txId: string, timeout = 4) {
    const confirmation = (await this.algosdk.waitForConfirmation(
      this.algodClient,
      txId,
      timeout
    )) as ConfirmedTxn;

    return { txId, ...confirmation };
  }

  decodeTransaction = (txn: string, isSigned: boolean) => {
    return isSigned
      ? this.algosdk.decodeSignedTransaction(
          new Uint8Array(Buffer.from(txn, "base64"))
        ).txn
      : this.algosdk.decodeUnsignedTransaction(
          new Uint8Array(Buffer.from(txn, "base64"))
        );
  };

  logEncodedTransaction(txn: string, isSigned: boolean) {
    const txnObj = this.decodeTransaction(txn, isSigned);

    console.log("TRANSACTION", {
      isSigned,
      from: txnObj.from && this.algosdk.encodeAddress(txnObj.from.publicKey),
      to: txnObj.to && this.algosdk.encodeAddress(txnObj.to.publicKey),
      type: txnObj.type,
      txn: txnObj,
    });
  }

  groupTransactionsBySender(transactions: TransactionsArray) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function groupBy(objectArray: Record<string, any>[], property: string) {
      return objectArray.reduce(function (acc, obj) {
        const key = obj[property];
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(obj);
        return acc;
      }, {});
    }

    const decodedGroup = transactions.reduce(
      (acc: TxnInfo[], [type, txn], index) => {
        if (type === "u") {
          const decodedTxn = this.decodeTransaction(txn, false);
          const from = decodedTxn.from
            ? this.algosdk.encodeAddress(decodedTxn.from.publicKey)
            : "";
          const to = decodedTxn.to
            ? this.algosdk.encodeAddress(decodedTxn.to.publicKey)
            : "";
          const type = (decodedTxn.type as TxnType) || "";
          const amount = Number(decodedTxn.amount) || 0; // convert from bigint to number

          const txnObj = {
            groupIndex: index,
            amount,
            from,
            to,
            type,
            txn,
          };

          acc.push(txnObj);
        }

        return acc;
      },
      []
    );
    return groupBy(decodedGroup, "from");
  }

  async sendRawTransactions(transactions: Uint8Array[]) {
    const sentTransaction = await this.algodClient
      .sendRawTransaction(transactions)
      .do();

    if (!sentTransaction) {
      throw new Error("Transaction failed.");
    }

    const confirmedTransaction = await this.waitForConfirmation(
      sentTransaction.txId
    );

    return {
      id: sentTransaction.txId,
      ...confirmedTransaction,
    };
  }

  keepWCAliveStart() {
    // Playing an audio file prevents Wallet Connect's
    // web socket connection from being dropped when
    // iOS goes into background mode

    if (!isIOS) {
      return;
    }

    this.keepWCAlive.src = audio;
    this.keepWCAlive.autoplay = true;
    this.keepWCAlive.volume = 0;
    this.keepWCAlive.loop = true;
    this.keepWCAlive.play();
  }

  keepWCAliveStop() {
    if (!isIOS) {
      return;
    }

    this.keepWCAlive.pause();
  }
}

export default BaseWallet;
