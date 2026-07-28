const { ethers } = require('ethers');
const fs = require('fs');
const readline = require('readline');

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'host': 'api.aiw3.ai',
  'lang': 'en',
  'origin': 'https://aiw3.ai',
  'referer': 'https://aiw3.ai/',
  'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, ans => { rl.close(); r(ans.trim()); }));
}

async function safeJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('Response bukan JSON: ' + text.slice(0, 100)); }
}

async function getNonce(address) {
  const url = `https://api.aiw3.ai/api/nonce?wallet_address=${address}&invitation_code=&inviteCode=`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await safeJson(res);
  if (json.code !== 200) throw new Error('getNonce failed: ' + JSON.stringify(json));
  return json.data.nonce;
}

async function login(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;
  const nonce = await getNonce(address);
  const message = `Welcome to AIW3.\n\nPlease sign this message to login AIW3.\n\nTimestamp: ${nonce}`;
  const signature = await wallet.signMessage(message);
  const res = await fetch('https://api.aiw3.ai/api/solanachainauth/verify', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ network: 'BSC', publicKey: address, signature, type: 'MetaMask' }),
  });
  const json = await safeJson(res);
  if (json.code !== 200) throw new Error('login failed: ' + JSON.stringify(json));
  return { token: json.data.accessToken, address };
}

async function getCheckInInfo(token) {
  const res = await fetch('https://api.aiw3.ai/api/reward/getCheckInInfo', {
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
  });
  return safeJson(res);
}

async function checkIn(token) {
  const res = await fetch('https://api.aiw3.ai/api/reward/checkIn', {
    method: 'POST',
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  return safeJson(res);
}

async function runAccount(pk, index) {
  try {
    console.log(`\n[${index + 1}] Login...`);
    const { token, address } = await login(pk);
    console.log(`[${index + 1}] ${address} - token OK`);

    const info = await getCheckInInfo(token);
    console.log(`[${index + 1}] CheckIn info:`, JSON.stringify(info?.data || info));

    const result = await checkIn(token);
    if (result.code === 200) {
      console.log(`[${index + 1}] ✓ CheckIn sukses`);
    } else {
      console.log(`[${index + 1}] CheckIn response:`, JSON.stringify(result));
    }
  } catch (e) {
    console.error(`[${index + 1}] Error:`, e.message);
  }
}

async function main() {
  const pks = fs.readFileSync('wallet.txt', 'utf8').trim().split('\n').map(l => l.trim()).filter(Boolean);
  console.log(`Total akun: ${pks.length}`);
  console.log('1. Semua akun');
  console.log('2. Satu akun (index 0)');
  console.log('3. Mulai dari index N');

  const pilih = await prompt('Pilih (1/2/3): ');

  let targets = [];
  if (pilih === '2') {
    targets = [[pks[0], 0]];
  } else if (pilih === '3') {
    const n = parseInt(await prompt('Mulai dari index: '));
    targets = pks.slice(n).map((pk, i) => [pk, n + i]);
  } else {
    targets = pks.map((pk, i) => [pk, i]);
  }

  console.log(`\nJalanin ${targets.length} akun...\n`);
  for (const [pk, i] of targets) {
    await runAccount(pk, i);
    if (i < targets.length - 1) await sleep(10000);
  }
  console.log('\nSelesai.');
}

main();
