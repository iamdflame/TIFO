/**
 * TIFO — TxLINE free-tier activation via Solana.
 *
 * One command performs the whole "sign up through Solana" flow:
 *   1. loads (or creates) a local Solana keypair
 *   2. sends the on-chain `subscribe(serviceLevel, weeks)` transaction to the
 *      TxLINE program (free World Cup tier — no TxL payment, only SOL fees)
 *   3. obtains a guest JWT from /auth/guest/start
 *   4. signs `${txSig}::${jwt}` with the wallet (detached ed25519, base64)
 *   5. POSTs /api/token/activate and writes TXLINE_* credentials to .env
 *
 * Usage:
 *   npm run activate                        # devnet, service level 1
 *   npm run activate -- --network mainnet --level 12   # mainnet real-time tier
 *   npm run activate -- --keypair ~/.config/solana/id.json
 */

import * as anchor from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// -- args -----------------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const NETWORK = opt('network', 'devnet') as 'mainnet' | 'devnet';
const LEVEL = Number(opt('level', '1'));      // mainnet: 1 = 60s delay, 12 = real-time
const WEEKS = Number(opt('weeks', '4'));
const KEYPAIR_PATH = opt('keypair', path.join(ROOT, 'keys', `tifo-${NETWORK}.keypair.json`));
const RESUME_TXSIG = opt('txsig', '');        // resume activation with an already-confirmed subscribe tx

const CONFIG = {
  mainnet: {
    rpcUrl: process.env.SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com',
    apiOrigin: 'https://txline.txodds.com',
    programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
    txlMint: 'Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL',
    idl: 'txoracle.mainnet.json',
  },
  devnet: {
    rpcUrl: process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com',
    apiOrigin: 'https://txline-dev.txodds.com',
    programId: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
    txlMint: '4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG',
    idl: 'txoracle.devnet.json',
  },
}[NETWORK];

const SELECTED_LEAGUES: number[] = []; // standard free bundle

async function main() {
  console.log(`\nTIFO × TxLINE activation — ${NETWORK}, service level ${LEVEL}, ${WEEKS} weeks\n`);

  // 1. wallet
  let keypair: Keypair;
  if (fs.existsSync(KEYPAIR_PATH)) {
    keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))));
    console.log(`wallet: ${keypair.publicKey.toBase58()} (loaded from ${KEYPAIR_PATH})`);
  } else {
    keypair = Keypair.generate();
    fs.mkdirSync(path.dirname(KEYPAIR_PATH), { recursive: true });
    fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(keypair.secretKey)));
    console.log(`wallet: ${keypair.publicKey.toBase58()} (NEW — saved to ${KEYPAIR_PATH})`);
    console.log(`\nFund this wallet with a little SOL for transaction fees, then re-run.`);
    if (NETWORK === 'devnet') console.log(`devnet faucet:  solana airdrop 1 ${keypair.publicKey.toBase58()} -u devnet`);
    process.exit(0);
  }

  const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`balance: ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 3_000_000) {
    console.error(`\nInsufficient SOL for fees/rent. Fund ${keypair.publicKey.toBase58()} and re-run.`);
    if (NETWORK === 'devnet') console.error(`devnet faucet:  solana airdrop 1 ${keypair.publicKey.toBase58()} -u devnet`);
    process.exit(1);
  }

  /** Confirm via HTTP polling — websocket subscriptions are blocked in many dev environments. */
  const confirmByPolling = async (sig: string, label: string): Promise<boolean> => {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 2_000));
      const st = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
      if (st) {
        if (st.err) throw new Error(`${label} failed on-chain: ${JSON.stringify(st.err)}`);
        if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return true;
      }
    }
    return false;
  };

  /** Send with a priority fee, retrying with a fresh blockhash if it expires. */
  const sendWithRetry = async (instructions: Transaction['instructions'], label: string): Promise<string> => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ...instructions,
      );
      const bh = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = bh.blockhash;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair);
      const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
      console.log(`  ${label}: sent ${sig} — polling for confirmation…`);
      if (await confirmByPolling(sig, label)) return sig;
      console.log(`  ${label}: not confirmed in time (attempt ${attempt}/4) — retrying…`);
    }
    throw new Error(`${label}: exhausted retries`);
  };

  // 2. anchor program (patch IDL address so one IDL layout serves both networks)
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, 'idl', CONFIG.idl), 'utf8'));
  idl.address = CONFIG.programId;
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  const tokenMint = new PublicKey(CONFIG.txlMint);
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from('pricing_matrix')], program.programId);
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from('token_treasury_v2')], program.programId);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(tokenMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userTokenAccount = getAssociatedTokenAddressSync(tokenMint, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  // free tiers still need the user's TxL associated token account to exist
  const ataInfo = await connection.getAccountInfo(userTokenAccount);
  if (!ataInfo) {
    console.log('creating TxL token account (one-time rent)…');
    await sendWithRetry([
      createAssociatedTokenAccountInstruction(
        keypair.publicKey, userTokenAccount, keypair.publicKey, tokenMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    ], 'create ATA');
    for (let i = 0; i < 5; i++) {
      try { await getAccount(connection, userTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID); break; }
      catch { await new Promise(r => setTimeout(r, 2_000)); }
    }
  }

  // 3. on-chain subscribe (or resume with an already-confirmed signature)
  let txSig: string;
  if (RESUME_TXSIG) {
    console.log(`resuming with existing subscribe tx: ${RESUME_TXSIG}`);
    const st = (await connection.getSignatureStatuses([RESUME_TXSIG], { searchTransactionHistory: true })).value[0];
    if (!st || st.err) throw new Error(`provided txsig not found or failed on-chain: ${JSON.stringify(st?.err ?? 'not found')}`);
    txSig = RESUME_TXSIG;
  } else {
    console.log(`subscribing on-chain: level ${LEVEL}, ${WEEKS} weeks…`);
    const subTx: Transaction = await (program.methods as any)
      .subscribe(LEVEL, WEEKS)
      .accounts({
        user: keypair.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    txSig = await sendWithRetry(subTx.instructions, 'subscribe');
  }
  console.log(`subscribe confirmed: ${txSig}`);
  console.log(`explorer: https://explorer.solana.com/tx/${txSig}${NETWORK === 'devnet' ? '?cluster=devnet' : ''}`);

  // 4. guest JWT + activation signature
  const jwtRes = await fetch(`${CONFIG.apiOrigin}/auth/guest/start`, { method: 'POST' });
  if (!jwtRes.ok) throw new Error(`guest/start -> ${jwtRes.status}`);
  const { token: jwt } = await jwtRes.json() as { token: string };

  const message = new TextEncoder().encode(`${txSig}:${SELECTED_LEAGUES.join(',')}:${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, keypair.secretKey)).toString('base64');

  // 5. activate
  const actRes = await fetch(`${CONFIG.apiOrigin}/api/token/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
  });
  const actText = await actRes.text();
  if (!actRes.ok) throw new Error(`token/activate -> ${actRes.status}: ${actText}`);
  // token may arrive as plain text or as JSON {token}
  let apiToken: string | undefined;
  try {
    const j = JSON.parse(actText) as { token?: string; apiToken?: string } | string;
    apiToken = typeof j === 'string' ? j : j?.token ?? j?.apiToken;
  } catch {
    apiToken = actText.trim() || undefined;
  }
  if (!apiToken) throw new Error(`activation returned no token: ${actText.slice(0, 200)}`);

  // write .env
  const envPath = path.join(ROOT, '.env');
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const set = (k: string, v: string) => {
    env = env.match(new RegExp(`^${k}=`, 'm')) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : env + `${k}=${v}\n`;
  };
  set('TXLINE_NETWORK', NETWORK);
  set('TXLINE_API_TOKEN', apiToken);
  set('TXLINE_JWT', jwt);
  fs.writeFileSync(envPath, env);

  console.log(`\n✅ Activated. Credentials written to .env`);
  console.log(`   Start TIFO with:  npm run build && npm start`);
}

main().catch(err => { console.error('\n❌', err.message ?? err); process.exit(1); });
