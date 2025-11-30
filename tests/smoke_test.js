const io = require('socket.io-client');

const serverUrl = 'http://localhost:3000';
const roomCode = 'TST1';

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('Starting smoke test...');

  const a = io(serverUrl);
  const b = io(serverUrl);
  const c = io(serverUrl);
  const d = io(serverUrl);

  let aRound = null, bRound = null, cRound = null, dRound = null;
  let revealReceived = false;

  a.on('connect', () => { console.log('A connected', a.id); a.emit('joinRoom', { roomCode, playerName: 'Alice' }); });
  b.on('connect', () => { console.log('B connected', b.id); b.emit('joinRoom', { roomCode, playerName: 'Bob' }); });
  c.on('connect', () => { console.log('C connected', c.id); c.emit('joinRoom', { roomCode, playerName: 'Cara' }); });
  d.on('connect', () => { console.log('D connected', d.id); d.emit('joinRoom', { roomCode, playerName: 'Dan' }); });

  a.on('roundWord', (payload) => { console.log('A roundWord', payload); aRound = payload; });
  b.on('roundWord', (payload) => { console.log('B roundWord', payload); bRound = payload; });
  c.on('roundWord', (payload) => { console.log('C roundWord', payload); cRound = payload; });
  d.on('roundWord', (payload) => { console.log('D roundWord', payload); dRound = payload; });

  a.on('revealRound', (r) => { console.log('A revealRound', r && r.word); revealReceived = true; });
  b.on('revealRound', (r) => { console.log('B revealRound', r && r.word); revealReceived = true; });
  c.on('revealRound', (r) => { console.log('C revealRound', r && r.word); revealReceived = true; });
  d.on('revealRound', (r) => { console.log('D revealRound', r && r.word); revealReceived = true; });

  // wait for both to join
  await sleep(800);

  // start game from A
  const wordBank = { persian: { easy: [ { word: 'SMOKE' } ] } };
  console.log('A starting game');
  a.emit('startGame', { roomCode, wordBank });

  // wait for roundWord from all clients
  const timeoutAt = Date.now() + 5000;
  while ((!aRound || !bRound || !cRound || !dRound) && Date.now() < timeoutAt) {
    await sleep(100);
  }

  if (!aRound || !bRound || !cRound || !dRound) {
    console.error('Did not receive roundWord on all clients in time');
    process.exit(2);
  }

  // validate payload shape (accept legacy drawerId or new drawers object)
  const payload = aRound && typeof aRound === 'object' ? aRound : null;
  if (!payload || !payload.word) {
    console.error('roundWord payload missing expected fields:', aRound);
    process.exit(3);
  }

  // drawer info may be either payload.drawerId (legacy) or payload.drawers {team1,team2}
  let drawerIds = [];
  if (payload.drawerId) drawerIds.push(payload.drawerId);
  if (payload.drawers) {
    if (payload.drawers.team1) drawerIds.push(payload.drawers.team1);
    if (payload.drawers.team2) drawerIds.push(payload.drawers.team2);
  }
  if (drawerIds.length === 0) {
    console.error('No drawer info in roundWord payload:', payload);
    process.exit(4);
  }

  // ensure at least one drawerId belongs to one of the connected sockets
  const found = drawerIds.find(id => [a.id, b.id].includes(id));
  if (!found) {
    console.error('None of drawerIds are connected clients:', drawerIds, a.id, b.id);
    process.exit(5);
  }
  console.log('First round drawerId(s) OK:', drawerIds);

  // Have host (Alice) end the round
  console.log('A emitting endRound');
  a.emit('endRound', { roomCode });

  // wait for reveal
  const revealTimeout = Date.now() + 3000;
  while (!revealReceived && Date.now() < revealTimeout) await sleep(100);
  if (!revealReceived) { console.error('Reveal not received'); process.exit(5); }

  // Now have host continue
  console.log('A emitting continueRound');
  a.emit('continueRound', { roomCode });

  // wait for next roundWord
  let aRound2 = null, bRound2 = null, cRound2 = null, dRound2 = null;
  const timeout2 = Date.now() + 5000;
  a.on('roundWord', (p) => { aRound2 = p; console.log('A got roundWord 2', p); });
  b.on('roundWord', (p) => { bRound2 = p; console.log('B got roundWord 2', p); });
  c.on('roundWord', (p) => { cRound2 = p; console.log('C got roundWord 2', p); });
  d.on('roundWord', (p) => { dRound2 = p; console.log('D got roundWord 2', p); });

  while ((!aRound2 || !bRound2 || !cRound2 || !dRound2) && Date.now() < timeout2) await sleep(100);
  if (!aRound2 || !bRound2 || !cRound2 || !dRound2) { console.error('Did not get second roundWord'); process.exit(6); }

  console.log('Second round payloads received. Test passed.');

  a.disconnect(); b.disconnect();
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(99); });
