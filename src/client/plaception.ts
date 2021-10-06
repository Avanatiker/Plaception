/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import fs from 'mz/fs';
import path from 'path';
import * as borsh from 'borsh';

import {getPayer, getRpcUrl, createKeypairFromFile} from './utils';

/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Keypair associated to the fees' payer
 */
let payer: Keypair;

/**
 * Plaception's program id
 */
let programId: PublicKey;

/**
 * The public key of the canvas account
 */
let greetedPubkey: PublicKey;

/**
 * Path to program files
 */
const PROGRAM_PATH = path.resolve(__dirname, '../../dist/program');

/**
 * Path to program shared object file which should be deployed on chain.
 * This file is created when running:
 *   - `npm run build:program-rust`
 */
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, 'plaception.so');

/**
 * Path to the keypair of the deployed program.
 * This file is created when running `solana program deploy dist/program/plaception.so`
 */
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'plaception-keypair.json');

class Canvas {
  canvas = new Array(128);
  constructor(fields: { canvas: number[] } | undefined = undefined) {
    if (fields) {
      this.canvas = fields.canvas;
    }
  }
}

const CanvasSchema = new Map([
  [Canvas, {kind: 'struct', fields: [['canvas', ['u32', 128]]]}],
]);

/**
 * The expected size of each canvas account
 */
const CANVAS_SIZE = borsh.serialize(
  CanvasSchema,
  new Canvas({canvas: new Array(128)}),
).length;

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
  const rpcUrl = await getRpcUrl();
  connection = new Connection(rpcUrl, 'confirmed');
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', rpcUrl, version);
}

/**
 * Establish an account to pay for expenses
 */
export async function establishPayer(): Promise<void> {
  let fees = 0;
  if (!payer) {
    const {feeCalculator} = await connection.getRecentBlockhash();

    // Calculate the cost to fund the greeter account
    fees += await connection.getMinimumBalanceForRentExemption(CANVAS_SIZE);

    // Calculate the cost of sending transactions
    fees += feeCalculator.lamportsPerSignature * 100; // wag

    payer = await getPayer();
  }

  let lamports = await connection.getBalance(payer.publicKey);
  if (lamports < fees) {
    // If current balance is not enough to pay for fees, request an airdrop
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports,
    );
    await connection.confirmTransaction(sig);
    lamports = await connection.getBalance(payer.publicKey);
  }

  console.log(
    'Using account',
    payer.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'SOL to pay for fees',
  );
}

/**
 * Check if the plaception BPF program has been deployed
 */
export async function checkProgram(): Promise<void> {
  // Read program id from keypair file
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err as Error).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/plaception.so\``,
    );
  }

  // Check if the program has been deployed
  const programInfo = await connection.getAccountInfo(programId);
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_SO_PATH)) {
      throw new Error(
        'Program needs to be deployed with `solana program deploy dist/program/plaception.so`',
      );
    } else {
      throw new Error('Program needs to be built and deployed');
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`);
  }
  console.log(`Using program ${programId.toBase58()}`);

  // Derive the address (public key) of a greeting account from the program so that it's easy to find later.
  const CANVAS_SEED = 'c1234c41231234c';
  greetedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    CANVAS_SEED,
    programId,
  );

  // Check if the greeting account has already been created
  const greetedAccount = await connection.getAccountInfo(greetedPubkey);
  if (greetedAccount === null) {
    console.log(
      'Creating canvas on account:',
      greetedPubkey.toBase58(),
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      CANVAS_SIZE,
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: CANVAS_SEED,
        newAccountPubkey: greetedPubkey,
        lamports,
        space: CANVAS_SIZE,
        programId,
      }),
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
}

class Command {
  private x = 0;
  private y = 0;
  private color = 0;

  constructor(param: { x: number; y: number; color: number; }) {
    this.x = param.x;
    this.y = param.y;
    this.color = param.color;
  }
}

export async function place(x: number, y: number, color: number): Promise<void> {
  console.log('Placing pixel at canvas:', greetedPubkey.toBase58());
  const value = new Command({ x: x, y: y, color: color });
  const schema = new Map([[Command, { kind: 'struct', fields: [['x', 'u8'], ['y', 'u8'], ['color', 'u32']] }]]);
  const instruction = new TransactionInstruction({
    keys: [{pubkey: greetedPubkey, isSigner: false, isWritable: true}],
    programId,
    data: Buffer.from(borsh.serialize(schema, value)),
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer],
  );
}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function getCanvas(): Promise<void> {
  const accountInfo = await connection.getAccountInfo(greetedPubkey);
  if (accountInfo === null) {
    throw 'Error: cannot find canvas account';
  }
  const greeting = borsh.deserialize(
    CanvasSchema,
    Canvas,
    accountInfo.data,
  );
  console.log(
    greetedPubkey.toBase58(),
    'has canvas:',
  );
  console.log(greeting.canvas)
}
