const { ethers } = require('ethers');
const fs = require('fs');

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

async function getNonce(address) {
  const url = `https://api.aiw3.ai/api/nonce?wallet_address=${address}&invitation_code=&inviteCode=`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
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
    body: JSON.stringify({
      network: 'BSC',
      publicKey: address,
      signature,
      type: 'MetaMask',
    }),
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error('login failed: ' + JSON.stringify(json));
  return { token: json.data.accessToken, address };
}

async function getCheckInInfo(token) {
  const res = await fetch('https://api.aiw3.ai/api/reward/getCheckInInfo', {
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json;
}

async function checkIn(token) {
  const res = await fetch('https://api.aiw3.ai/api/reward/checkIn', {
    method: 'POST',
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  return json;
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

async function prompt(q) {
  process.stdout.write(q);
  return new Promise(r => {
    process.stdin.once('data', d => r(d.toString().trim()));
  });
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

  process.stdin.destroy();
  console.log(`\nJalanin ${targets.length} akun...\n`);
  for (const [pk, i] of targets) {
    await runAccount(pk, i);
    if (i < targets.length - 1) await sleep(10000);
  }
  console.log('\nSelesai.');
}

main();
