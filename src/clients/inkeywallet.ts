import BaseWallet from "./base";
// import type MyAlgoConnect from "@randlabs/myalgo-connect";
import type { inkeyClient } from "@thencc/inkey-client-js";
import type _algosdk from "algosdk";
import type { Transaction } from "algosdk";
import Algod from "../algod";
import { PROVIDER_ID } from "../constants";
import { providers } from "../providers";
import type { WalletProvider, Account as UseWalletAccount } from "../types";
import { TransactionsArray } from "../types";
import { DecodedTransaction, DecodedSignedTransaction } from "../types";
import { Account } from "algosdk/dist/types/src/client/v2/algod/models/types";

// TODO support multisig + logic sig txn signing...

export interface InkeyTransaction {
	txn: Transaction;
	/**
	 * Optional list of addresses that must sign the transactions.
	 * Wallet skips to sign this txn if signers is empty array.
	 * If undefined, wallet tries to sign it.
	 */
	signers?: string[];
}

type InitWallet = {
	id: PROVIDER_ID;
	// client: MyAlgoConnect;
	client: Awaited<ReturnType<typeof inkeyClient>>;
	provider: WalletProvider;
	algosdk: typeof _algosdk;
	algodClient: _algosdk.Algodv2;
};

class InkeyWalletClient extends BaseWallet {
	// #client: MyAlgoConnect;
	#client: Awaited<ReturnType<typeof inkeyClient>>;
	id: PROVIDER_ID;
	provider: WalletProvider;

	constructor({ client, id, provider, algosdk, algodClient }: InitWallet) {
		super(algosdk, algodClient);

		this.#client = client;
		this.id = id;
		this.provider = provider;
	}

	static async init() {
		console.log('inkeywallet init');
		const { algosdk, algodClient } = await Algod.init();

		// const MyAlgoConnect = (await import("@randlabs/myalgo-connect")).default;
		// const myAlgo = new MyAlgoConnect({ disableLedgerNano: false });

		const createInkeyClient = (await import("@thencc/inkey-client-js")).inkeyClient;
		// const inkeyClient = await createInkeyClient();
		const inkeyClient = await createInkeyClient({
			src: 'http://127.0.0.1:5200'
		});

		return new InkeyWalletClient({
			id: PROVIDER_ID.INKEY_WALLET,
			client: inkeyClient,
			provider: providers[PROVIDER_ID.INKEY_WALLET],
			algosdk: algosdk,
			algodClient: algodClient,
		});
	}

	async connect() {
		// const accounts = await this.#client.connect();
		const accounts = [await this.#client.inkeyConnect()]; // TODO return array

		if (accounts.length === 0) {
			throw new Error(`No accounts found for ${this.provider}`);
		}

		const mappedAccounts = accounts.map((account) => ({
			...account,
			name: 'TODO',
			providerId: this.provider.id,
		}));

		return {
			...this.provider,
			accounts: mappedAccounts,
		};
	}

	async reconnect() {
		console.warn('inkeywallet reconnect TODO');

		// let acct = getActiveAcct();
		// if (acct) {
		// 	// this.#client.account = {
		// 	// 	addr: acct.address,
		// 	// 	sk: new Uint8Array()
		// 	// };

		// 	// desired api...
		// 	// this.#client.reconnectAcct(acct.address);

		// } else {
		// 	console.warn('no incoming acct to connect to algonaut');
		// }

		return null;
	}

	async disconnect() {
		console.warn('TODO - disconnect');
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

	async signEncodedTransactions(transactions: TransactionsArray) {
		const transactionsToSign: string[] = [];
		const signedRawTransactions: Uint8Array[] = [];

		for (const [type, txn] of transactions) {
			if (type === "u") {
				transactionsToSign.push(txn);
			}
		}

		// const result = await this.#client.signTransaction(transactionsToSign);
		const result = 'TODO' as any;

		if (!result) {
			throw new Error("Signing failed.");
		}

		let resultIndex = 0;

		for (const [type, txn] of transactions) {
			if (type === "u") {
				signedRawTransactions.push(result[resultIndex].blob);
				resultIndex++;
			} else {
				signedRawTransactions.push(new Uint8Array(Buffer.from(txn, "base64")));
			}
		}

		return signedRawTransactions;
	}
}

export default InkeyWalletClient;
