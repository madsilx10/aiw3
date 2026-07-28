const { ethers } = require('ethers');
const fs = require('fs');

const HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'lang': 'en',
  'origin': 'https://aiw3.ai',
  'referer': 'https://aiw3.ai/',
  'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function promptSync(q) {
  process.stdout.write(q);
  const buf = Buffer.alloc(64);
  const fd = fs.openSync('/dev/tty', 'r');
  const n = fs.readSync(fd, buf, 0, 64);
  fs.closeSync(fd);
  return buf.slice(0, n).toString().trim();
}

async function safeJson(res, label) {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${label} ${res.status}: ` + text.slice(0, 150)); }
}

async function getNonce(address) {
  const url = `https://api.aiw3.ai/api/nonce?wallet_address=${address}&invitation_code=&inviteCode=`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await safeJson(res, 'getNonce');
  if (json.code !== 200) throw new Error('getNonce failed: ' + JSON.stringify(json));
  return json.data.nonce;
}

async function login(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;
  console.log('  >> getNonce');
  const nonce = await getNonce(address);
  console.log('  >> sign');
  const message = `Welcome to AIW3.\n\nPlease sign this message to login AIW3.\n\nTimestamp: ${nonce}`;
  const signature = await wallet.signMessage(message);
  console.log('  >> verify');
  const res = await fetch('https://api.aiw3.ai/api/solanachainauth/verify', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ network: 'BSC', publicKey: address, signature, type: 'MetaMask' }),
  });
  const json = await safeJson(res, 'verify');
  if (json.code !== 200) throw new Error('login failed: ' + JSON.stringify(json));
  return { token: json.data.accessToken, address };
}

async function getDoneTasks(token) {
  console.log('  >> pointsRecord');
  const res = await fetch('https://api.aiw3.ai/api/reward/pointsRecord?page=1&pageSize=100', {
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
  });
  const json = await safeJson(res, 'pointsRecord');
  const records = json?.data?.pointsRecord || [];
  return new Set(records.map(r => r.type));
}

async function doTask(token, name, url, body = {}) {
  console.log(`  >> ${name}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await safeJson(res, name);
  if (json.code === 200) {
    console.log(`  ✓ ${name} sukses`);
  } else {
    console.log(`  ✗ ${name}:`, JSON.stringify(json));
  }
}

const TASKS = [
  { type: 'daily_checkin',  name: 'Daily Check-in', url: 'https://api.aiw3.ai/api/reward/checkIn' },
  { type: 'follow_twitter', name: 'Follow Twitter',  url: 'https://api.aiw3.ai/api/reward/followTwitter' },
  { type: 'retweet',        name: 'Retweet',         url: 'https://api.aiw3.ai/api/reward/retweet' },
];

async function runAccount(pk, index) {
  try {
    console.log(`\n[Akun ${index + 1}] Login...`);
    const { token, address } = await login(pk);
    console.log(`[Akun ${index + 1}] ${address} - OK`);

    const done = await getDoneTasks(token);
    console.log(`[Akun ${index + 1}] Sudah done: ${[...done].join(', ') || 'belum ada'}`);

    for (const task of TASKS) {
      if (done.has(task.type)) {
        console.log(`  - ${task.name}: skip`);
        continue;
      }
      await doTask(token, task.name, task.url);
      await sleep(2000);
    }
  } catch (e) {
    console.error(`[Akun ${index + 1}] Error:`, e.message);
  }
}

async function main() {
  const pks = fs.readFileSync('wallet.txt', 'utf8').trim().split('\n').map(l => l.trim()).filter(Boolean);
  console.log(`Total akun: ${pks.length}`);
  console.log('1. 1 akun');
  console.log('2. Semua akun');
  console.log('3. Range (dari akun N)');

  const pilih = promptSync('Pilih (1/2/3): ');

  let targets = [];
  if (pilih === '1') {
    const n = parseInt(promptSync(`Akun ke berapa? (1-${pks.length}): `)) - 1;
    targets = [[pks[n], n]];
  } else if (pilih === '2') {
    targets = pks.map((pk, i) => [pk, i]);
  } else if (pilih === '3') {
    const n = parseInt(promptSync(`Mulai dari akun ke berapa? (1-${pks.length}): `)) - 1;
    targets = pks.slice(n).map((pk, i) => [pk, n + i]);
  } else {
    console.log('Pilihan gak valid:', pilih);
    return;
  }

  console.log(`\nJalanin ${targets.length} akun...\n`);
  for (const [pk, i] of targets) {
    await runAccount(pk, i);
    if (i < targets.length - 1) await sleep(10000);
  }
  console.log('\nSelesai.');
}

main();
