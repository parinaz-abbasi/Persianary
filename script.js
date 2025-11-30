// Connect to server
const socket = io();

// DOM elements - Lobby
const initialChoice = document.getElementById('initialChoice');
const createGameBtn = document.getElementById('createGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const createGameForm = document.getElementById('createGameForm');
const joinGameForm = document.getElementById('joinGameForm');
const createPlayerName = document.getElementById('createPlayerName');
const joinPlayerName = document.getElementById('joinPlayerName');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const backFromCreate = document.getElementById('backFromCreate');
const backFromJoin = document.getElementById('backFromJoin');

// DOM elements - Waiting Room
const lobby = document.getElementById('lobby');
const waitingRoom = document.getElementById('waitingRoom');
const currentRoomSpan = document.getElementById('currentRoom');
const team1List = document.getElementById('team1List');
const team2List = document.getElementById('team2List');
const playerCount = document.getElementById('playerCount');
const startBtn = document.getElementById('startBtn');
const languageSelect = document.getElementById('languageSelect');
const categorySelect = document.getElementById('categorySelect');
const timeSelect = document.getElementById('timeSelect');
const roundsSelect = document.getElementById('roundsSelect');

// DOM elements - Game Screen
const gameScreen = document.getElementById('gameScreen');
const wordDisplay = document.getElementById('wordDisplay');
const timerDisplay = document.getElementById('timer');
const gameRoomCode = document.getElementById('gameRoomCode');
const guessesList = document.getElementById('guesses');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const replaySection = document.getElementById('replaySection');
const replayTeam1Canvas = document.getElementById('replayTeam1');
const replayTeam2Canvas = document.getElementById('replayTeam2');
const replayTeam1Ctx = replayTeam1Canvas ? replayTeam1Canvas.getContext('2d') : null;
const replayTeam2Ctx = replayTeam2Canvas ? replayTeam2Canvas.getContext('2d') : null;
const continueBtn = document.getElementById('continueBtn');
const drawerBanner = document.getElementById('drawerBanner');
const liveTeam1Canvas = document.getElementById('liveTeam1');
const liveTeam2Canvas = document.getElementById('liveTeam2');
const liveTeam1Ctx = liveTeam1Canvas ? liveTeam1Canvas.getContext('2d') : null;
const liveTeam2Ctx = liveTeam2Canvas ? liveTeam2Canvas.getContext('2d') : null;
let isHost = false;
let speedActive = false;
let speedWords = [];
let speedPanel = null;
let myTeam = null;
let isDrawer = false;

// Canvas setup
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;
// ensure canvas has a white background even before any drawing
canvas.style.background = 'white';

// Drawing tools
const colorPicker = document.getElementById('colorPicker');
const brushSizeSlider = document.getElementById('brushSize');
const clearBtn = document.getElementById('clearBtn');

// Game variables
let currentRoom = '';
let myName = '';
let isDrawing = false;
let currentColor = '#000000';
let brushSize = 5;
let isMyTurn = false;
let timeRemaining = 60;
let timerInterval = null;

// Create New Game Button
createGameBtn.addEventListener('click', () => {
    initialChoice.style.display = 'none';
    createGameForm.style.display = 'block';
});

// Join Game Button
joinGameBtn.addEventListener('click', () => {
    initialChoice.style.display = 'none';
    joinGameForm.style.display = 'block';
});

// Back buttons
backFromCreate.addEventListener('click', () => {
    createGameForm.style.display = 'none';
    initialChoice.style.display = 'flex';
});

backFromJoin.addEventListener('click', () => {
    joinGameForm.style.display = 'none';
    initialChoice.style.display = 'flex';
});

// Create Room
createRoomBtn.addEventListener('click', () => {
    const playerName = createPlayerName.value.trim();
    
    if (!playerName) {
        alert('Please enter your name!');
        return;
    }
    
    myName = playerName;
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    currentRoom = roomCode;
    
    socket.emit('joinRoom', { roomCode, playerName });
    createGameForm.style.display = 'none';
});

// Join Room
joinRoomBtn.addEventListener('click', () => {
    const playerName = joinPlayerName.value.trim();
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    
    if (!playerName || !roomCode) {
        alert('Please enter both name and room code!');
        return;
    }
    
    if (roomCode.length !== 4) {
        alert('Room code must be 4 letters!');
        return;
    }
    
    myName = playerName;
    currentRoom = roomCode;
    socket.emit('joinRoom', { roomCode, playerName });
    joinGameForm.style.display = 'none';
});

// Room update from server
socket.on('roomUpdate', (data) => {
    currentRoomSpan.textContent = currentRoom;
    waitingRoom.style.display = 'block';
    
    // Update team lists
    team1List.innerHTML = '';
    team2List.innerHTML = '';
    
    data.team1.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        li.dataset.id = player.id;
        team1List.appendChild(li);
    });
    
    data.team2.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        li.dataset.id = player.id;
        team2List.appendChild(li);
    });
    
    // Update player count
    playerCount.textContent = `Players: ${data.players.length}/10`;
    
    // Show start button if enough players
    if (data.canStart) {
        playerCount.textContent += ' - Ready to start!';
        startBtn.style.display = 'block';
    } else {
        const need = Math.max(0, 4 - data.players.length);
        playerCount.textContent += ` - Need ${need} more players`;
        startBtn.style.display = 'none';
    }

    // determine if current client is host
    const me = data.players.find(p => p.id === socket.id);
    isHost = me ? !!me.isHost : false;
    myTeam = me ? me.team : null;
});

// Update drawer highlight in team lists
function updateDrawerHighlight(drawers) {
    // clear existing highlights
    const allLis = document.querySelectorAll('#team1List li, #team2List li');
    allLis.forEach(li => li.classList.remove('drawer-highlight'));

    if (!drawers) return;

    const t1Id = drawers.team1 || (drawers.team1 && drawers.team1.id) || null;
    const t2Id = drawers.team2 || (drawers.team2 && drawers.team2.id) || null;

    if (t1Id) {
        const el = document.querySelector(`#team1List li[data-id="${t1Id}"]`);
        if (el) el.classList.add('drawer-highlight');
    }
    if (t2Id) {
        const el = document.querySelector(`#team2List li[data-id="${t2Id}"]`);
        if (el) el.classList.add('drawer-highlight');
    }
}

// Start game
startBtn.addEventListener('click', () => {
    const settings = {
        language: languageSelect.value,
        category: categorySelect.value,
        time: parseInt(timeSelect.value),
        rounds: parseInt(roundsSelect.value)
    };
    
    socket.emit('updateSettings', { roomCode: currentRoom, settings });
    
    // Send word bank based on language
    const wordBank = settings.language === 'persian' ? persianWords : englishWords;
    
    socket.emit('startGame', { roomCode: currentRoom, wordBank });
});

// Game started
socket.on('gameStarted', (data) => {
    lobby.style.display = 'none';
    gameScreen.style.display = 'block';
    // show room code
    if (gameRoomCode) gameRoomCode.textContent = currentRoom;
    
    timeRemaining = data.settings.time;
    
    // Show who's drawing
    // server provides drawers per team: data.drawers.team1 and data.drawers.team2
    const drawers = data.drawers || {};
    const drawerTeam1Id = drawers.team1 ? (drawers.team1.id || drawers.team1) : null;
    const drawerTeam2Id = drawers.team2 ? (drawers.team2.id || drawers.team2) : null;

    // Determine if this client is a drawer (for either team)
    isDrawer = (socket.id === drawerTeam1Id) || (socket.id === drawerTeam2Id);
    // allow drawing only if this client is drawer for their own team
    isMyTurn = (myTeam === 'team1' && socket.id === drawerTeam1Id) || (myTeam === 'team2' && socket.id === drawerTeam2Id);

    if (isMyTurn) {
        wordDisplay.textContent = 'You are drawing! Word: (waiting...)';
    } else if (isDrawer) {
        // drawer but not for this client's team (shouldn't happen normally)
        wordDisplay.textContent = 'You are a drawer';
    } else {
        // show both drawers' names if available
        const name1 = drawers.team1 && drawers.team1.name ? drawers.team1.name : 'Team1 drawer';
        const name2 = drawers.team2 && drawers.team2.name ? drawers.team2.name : 'Team2 drawer';
        wordDisplay.textContent = `${name1} and ${name2} are drawing...`;
    }

    // show drawer banner appropriately
    if (drawerBanner) {
        if (isMyTurn) {
            drawerBanner.textContent = 'You are the drawer — draw now!';
            drawerBanner.style.display = 'block';
        } else {
            const name1 = drawers.team1 && drawers.team1.name ? drawers.team1.name : 'Team1 drawer';
            const name2 = drawers.team2 && drawers.team2.name ? drawers.team2.name : 'Team2 drawer';
            drawerBanner.textContent = `${name1} (Team1)  —  ${name2} (Team2)`;
            drawerBanner.style.display = 'block';
        }
    }
    // highlight drawer in team lists
    if (data.drawers) updateDrawerHighlight(data.drawers);
    
    // Show/hide canvases based on drawer status
    if (isMyTurn) {
        // Drawer: show main canvas, hide live canvases
        if (canvas) canvas.style.display = 'block';
        if (liveTeam1Canvas) {
            liveTeam1Canvas.style.display = 'none';
            liveTeam1Canvas.classList.remove('enlarged');
        }
        if (liveTeam2Canvas) {
            liveTeam2Canvas.style.display = 'none';
            liveTeam2Canvas.classList.remove('enlarged');
        }
    } else {
        // Non-drawer: hide main canvas, show and enlarge team's live canvas
        if (canvas) canvas.style.display = 'none';
        if (myTeam === 'team1' && liveTeam1Canvas) {
            liveTeam1Canvas.style.display = 'block';
            liveTeam1Canvas.classList.add('enlarged');
        }
        if (myTeam === 'team2' && liveTeam2Canvas) {
            liveTeam2Canvas.style.display = 'block';
            liveTeam2Canvas.classList.add('enlarged');
        }
    }
    
    // timer will be provided by server via 'timerUpdate' events
});

// Server authoritative timer updates
socket.on('timerUpdate', ({ time }) => {
    timeRemaining = time;
    timerDisplay.textContent = `Time: ${timeRemaining}s`;
    if (timeRemaining <= 10) timerDisplay.style.color = '#ff4757';
    else timerDisplay.style.color = '';
});

// Receive guesses from server
socket.on('newGuess', ({ playerName, guess }) => {
    addGuessToList(playerName, guess, false);
});

// When someone guesses correctly
socket.on('correctGuess', ({ playerName, word }) => {
    addGuessToList(playerName, `${word} (correct)` , true);
});

// Server-side error messages
socket.on('errorMessage', ({ message }) => {
    alert(message || 'Server error');
});

// Send guess
if (guessBtn) {
    guessBtn.addEventListener('click', () => {
        const guess = guessInput.value.trim();
        if (!guess) return;
        // don't allow drawers to send guesses
        if (isDrawer) {
            // optionally show a small notification
            return;
        }
        if (speedActive) {
            socket.emit('speedGuess', { roomCode: currentRoom, guess, playerName: myName });
        } else {
            socket.emit('guess', { roomCode: currentRoom, guess, playerName: myName });
        }
        guessInput.value = '';
    });
}

function addGuessToList(playerName, guess, correct = false) {
    if (!guessesList) return;
    const div = document.createElement('div');
    div.className = 'guess-item' + (correct ? ' correct' : '');
    div.textContent = `${playerName}: ${guess}`;
    guessesList.appendChild(div);
    guessesList.scrollTop = guessesList.scrollHeight;
}

// Word for drawer
// Word specifically for drawer (compatibility)
socket.on('yourWord', (word) => {
    // drawer receives a targeted message; show prominently if this client is the drawer
    if (isMyTurn) {
        wordDisplay.textContent = `Your word: ${word}`;
    } else {
        wordDisplay.textContent = `Word: ${word}`;
    }
    wordDisplay.style.color = '#667eea';
    wordDisplay.style.fontSize = '32px';
});

// Round word broadcast to all players (both teams see the actual word)
// server may send either a plain string (legacy) or an object { word, drawerId }
socket.on('roundWord', (payload) => {
    let word = null;
    let drawers = null;
    if (typeof payload === 'string') {
        word = payload;
    } else if (payload && typeof payload === 'object') {
        word = payload.word;
        drawers = payload.drawers || null;
    }

    // If server indicated drawers per team, set drawing permission accordingly
    if (drawers) {
        const drawerTeam1Id = drawers.team1 || null;
        const drawerTeam2Id = drawers.team2 || null;
        isDrawer = (socket.id === drawerTeam1Id) || (socket.id === drawerTeam2Id);
        isMyTurn = (myTeam === 'team1' && socket.id === drawerTeam1Id) || (myTeam === 'team2' && socket.id === drawerTeam2Id);

        if (isMyTurn) {
            wordDisplay.textContent = `Your word: ${word}`;
        } else {
            wordDisplay.textContent = `Word: ${word}`;
        }
    } else {
        // legacy fallback
        wordDisplay.textContent = `Word: ${word}`;
    }

    wordDisplay.style.color = '#667eea';
    wordDisplay.style.fontSize = '28px';

    // Clear main canvas at the start of a new round and set a white background
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // ensure white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // clear and show/hide live team canvases depending on myTeam
    if (liveTeam1Ctx && liveTeam2Ctx) {
        // clear both
        liveTeam1Ctx.clearRect(0, 0, liveTeam1Canvas.width, liveTeam1Canvas.height);
        liveTeam2Ctx.clearRect(0, 0, liveTeam2Canvas.width, liveTeam2Canvas.height);

        if (isMyTurn) {
            // Drawer: hide live canvases, show main canvas for drawing
            liveTeam1Canvas.style.display = 'none';
            liveTeam2Canvas.style.display = 'none';
            canvas.style.display = 'block';
            // remove enlarged class if any
            liveTeam1Canvas.classList.remove('enlarged');
            liveTeam2Canvas.classList.remove('enlarged');
        } else {
            // Non-drawer: hide main canvas, show and enlarge team's live canvas
            canvas.style.display = 'none';
            if (myTeam === 'team1') {
                liveTeam1Canvas.style.display = 'block';
                liveTeam1Canvas.classList.add('enlarged');
                liveTeam2Canvas.style.display = 'none';
                liveTeam2Canvas.classList.remove('enlarged');
            } else if (myTeam === 'team2') {
                liveTeam2Canvas.style.display = 'block';
                liveTeam2Canvas.classList.add('enlarged');
                liveTeam1Canvas.style.display = 'none';
                liveTeam1Canvas.classList.remove('enlarged');
            } else {
                liveTeam1Canvas.style.display = 'none';
                liveTeam2Canvas.style.display = 'none';
            }
        }
    }

    // enable/disable drawing tools depending on whether this client is the drawer
    if (isMyTurn) {
        // allow drawing
        canvas.style.cursor = 'crosshair';
        colorPicker.disabled = false;
        brushSizeSlider.disabled = false;
        clearBtn.disabled = false;
    } else {
        // lock drawing UI
        canvas.style.cursor = 'default';
        colorPicker.disabled = true;
        brushSizeSlider.disabled = true;
        clearBtn.disabled = true;
    }

    // update drawer banner as well
    if (drawerBanner) {
        if (isMyTurn) {
            drawerBanner.textContent = 'You are the drawer — draw now!';
            drawerBanner.style.display = 'block';
        } else {
            drawerBanner.textContent = 'Drawing in progress';
            drawerBanner.style.display = 'block';
        }
    }
    
    // drawers should NOT be able to type guesses
    if (guessInput && guessBtn) {
        if (isDrawer) {
            guessInput.disabled = true;
            guessBtn.disabled = true;
        } else {
            guessInput.disabled = false;
            guessBtn.disabled = false;
        }
    }
    // update drawer highlights as well (if payload included drawers)
    if (typeof payload === 'object' && payload.drawers) updateDrawerHighlight(payload.drawers);
});

function dataIsCurrentDrawer(word) {
    // placeholder check: we don't have drawer info here, so return true
    // drawer-specific UI uses the `gameStarted` event to set isMyTurn
    return isMyTurn;
}

// Word hint for guessers
socket.on('wordHint', (hint) => {
    if (!isMyTurn) {
        wordDisplay.textContent = `Word: ${hint}`;
    }
});

// When a round is revealed, show drawings and guesses from both teams
socket.on('revealRound', (reveal) => {
    // show reveal section
    if (replaySection) replaySection.style.display = 'block';

    // clear replay canvases
    if (replayTeam1Ctx) {
        replayTeam1Ctx.clearRect(0, 0, replayTeam1Canvas.width, replayTeam1Canvas.height);
    }
    if (replayTeam2Ctx) {
        replayTeam2Ctx.clearRect(0, 0, replayTeam2Canvas.width, replayTeam2Canvas.height);
    }

    // display revealed word
    if (reveal.word) {
        wordDisplay.textContent = `Revealed word: ${reveal.word}`;
        wordDisplay.style.color = '#2f855a';
    }

    // append guesses from both teams with team label
    if (reveal.data) {
        const t1 = reveal.data.team1 || { guesses: [] };
        const t2 = reveal.data.team2 || { guesses: [] };

        // Before replaying server-sent drawing events, copy whatever teammates saw live into the replay canvases
        try {
            if (liveTeam1Canvas && replayTeam1Canvas) {
                // copy current bitmap from liveTeam1 into replayTeam1
                replayTeam1Ctx.drawImage(liveTeam1Canvas, 0, 0, replayTeam1Canvas.width, replayTeam1Canvas.height);
            }
            if (liveTeam2Canvas && replayTeam2Canvas) {
                replayTeam2Ctx.drawImage(liveTeam2Canvas, 0, 0, replayTeam2Canvas.width, replayTeam2Canvas.height);
            }
        } catch (err) {
            // ignore if drawing isn't possible (cross-origin or not supported) and fall back to server replay
            console.warn('Could not copy live canvas into replay canvas:', err && err.message);
        }

        // show team1 guesses
        t1.guesses.forEach(g => addGuessToList(`Team1 - ${g.playerName}`, g.guess, false));
        // show team2 guesses
        t2.guesses.forEach(g => addGuessToList(`Team2 - ${g.playerName}`, g.guess, false));

        // replay drawings on small canvases
        if (t1.drawings && replayTeam1Ctx) replayDraw(t1.drawings, replayTeam1Ctx, replayTeam1Canvas);
        if (t2.drawings && replayTeam2Ctx) replayDraw(t2.drawings, replayTeam2Ctx, replayTeam2Canvas);
    }

        // show continue button only to host
        if (continueBtn) {
            if (isHost) {
                continueBtn.style.display = 'inline-block';
                continueBtn.disabled = false;
            } else {
                continueBtn.style.display = 'none';
            }
        }
});

// hide drawer banner on reveal/end of round
socket.on('revealRound', () => {
    if (drawerBanner) drawerBanner.style.display = 'none';
    // clear drawer highlight after reveal
    updateDrawerHighlight(null);
    // show both live canvases as replay canvases are visible — hide live canvases
    if (liveTeam1Canvas) liveTeam1Canvas.style.display = 'none';
    if (liveTeam2Canvas) liveTeam2Canvas.style.display = 'none';
});

// Score updates (announce)
socket.on('scoreUpdate', (scores) => {
    // create or update a simple scoreboard element
    let scoreBoard = document.getElementById('scoreBoard');
    if (!scoreBoard) {
        scoreBoard = document.createElement('div');
        scoreBoard.id = 'scoreBoard';
        scoreBoard.style.cssText = 'position: absolute; top: 12px; right: 12px; background:#fff; padding:8px 12px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.1); font-weight:bold;';
        document.body.appendChild(scoreBoard);
    }
    scoreBoard.textContent = `Score — Team1: ${scores.team1 || 0}  Team2: ${scores.team2 || 0}`;
});

// Speed round start
socket.on('startSpeedRound', ({ words }) => {
    speedActive = true;
    speedWords = Array.isArray(words) ? words.slice() : [];

    // create or update speed panel
    if (!speedPanel) {
        speedPanel = document.createElement('div');
        speedPanel.id = 'speedPanel';
        speedPanel.style.cssText = 'position: fixed; bottom: 12px; left: 12px; background: rgba(255,255,255,0.95); padding:12px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.1); z-index:9999;';
        document.body.appendChild(speedPanel);
    }
    renderSpeedPanel();
});

socket.on('speedHit', ({ team, playerName, word }) => {
    // show a short message
    addGuessToList(`${team.toUpperCase()} - ${playerName}`, `guessed speed word: ${word}`, true);
    if (speedWords) {
        const idx = speedWords.findIndex(w => w.toLowerCase().trim() === word.toLowerCase().trim());
        if (idx !== -1) speedWords.splice(idx, 1);
    }
    renderSpeedPanel();
});

socket.on('speedRoundEnd', ({ scores }) => {
    speedActive = false;
    if (speedPanel) {
        speedPanel.textContent = 'Speed round finished';
        setTimeout(() => { if (speedPanel) speedPanel.remove(); speedPanel = null; }, 3000);
    }
    // show final scores
    let scoreBoard = document.getElementById('scoreBoard');
    if (scoreBoard) scoreBoard.textContent = `Score — Team1: ${scores.team1 || 0}  Team2: ${scores.team2 || 0}`;
});

function renderSpeedPanel() {
    if (!speedPanel) return;
    speedPanel.innerHTML = '';
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.textContent = 'Speed Round — words left: ' + (speedWords ? speedWords.length : 0);
    speedPanel.appendChild(title);

    if (speedWords && speedWords.length > 0) {
        const hint = document.createElement('div');
        hint.style.fontSize = '12px';
        hint.style.marginTop = '8px';
        hint.textContent = 'Type guesses into the main input and press Send.';
        speedPanel.appendChild(hint);
    } else {
        const done = document.createElement('div');
        done.style.marginTop = '8px';
        done.textContent = 'No words remaining.';
        speedPanel.appendChild(done);
    }
}

function replayDraw(events, ctx, canvasEl) {
    if (!events || events.length === 0) return;
    // assume original drawing canvas size is 800x600
    const srcW = 800, srcH = 600;
    const scaleX = canvasEl.width / srcW;
    const scaleY = canvasEl.height / srcH;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;
    events.forEach(ev => {
        if (ev.type === 'start') {
            ctx.beginPath();
            ctx.moveTo(ev.x * scaleX, ev.y * scaleY);
            drawing = true;
        } else if (ev.type === 'draw') {
            if (!drawing) ctx.beginPath();
            ctx.lineTo(ev.x * scaleX, ev.y * scaleY);
            ctx.strokeStyle = ev.color || '#000';
            ctx.lineWidth = (ev.size || 5) * Math.max(scaleX, scaleY);
            ctx.stroke();
            drawing = true;
        } else if (ev.type === 'stop') {
            ctx.closePath();
            drawing = false;
        } else if (ev.type === 'clear') {
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            drawing = false;
        }
    });
}

// Timer
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        timerDisplay.textContent = `Time: ${timeRemaining}s`;
        
        if (timeRemaining <= 10) {
            timerDisplay.style.color = '#ff4757';
        }
        
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = 'Time\'s up!';
            // only host should signal end of round to avoid duplicates
            if (isHost) {
                socket.emit('endRound', { roomCode: currentRoom });
            }
        }
    }, 1000);
}

// Drawing functionality
canvas.addEventListener('mousedown', startDrawingHandler);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

function startDrawingHandler(e) {
    if (!isMyTurn) return; // Only drawer can draw
    
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Send to other players
    socket.emit('draw', {
        room: currentRoom,
        type: 'start',
        x, y,
        color: currentColor,
        size: brushSize
    });
}

function draw(e) {
    if (!isDrawing || !isMyTurn) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Send to other players
    socket.emit('draw', {
        room: currentRoom,
        type: 'draw',
        x, y,
        color: currentColor,
        size: brushSize
    });
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    
    socket.emit('draw', {
        room: currentRoom,
        type: 'stop'
    });
}

// Receive drawing from other players
socket.on('draw', (data) => {
    // Incoming draw events are sent only to teammates by the server.
    // If this client is the drawer (isMyTurn) they won't receive these events.
    // For teammates, render the drawing on the small live canvas for their team.
    const targetCtx = (!isMyTurn && myTeam === 'team1') ? liveTeam1Ctx : ((!isMyTurn && myTeam === 'team2') ? liveTeam2Ctx : ctx);
    if (!targetCtx) return;

    // Scale coordinates from main canvas (800x600) to the target canvas size
    const srcW = 800, srcH = 600;
    const scaleX = (targetCtx.canvas.width) / srcW;
    const scaleY = (targetCtx.canvas.height) / srcH;

    if (data.type === 'start') {
        targetCtx.beginPath();
        targetCtx.moveTo(data.x * scaleX, data.y * scaleY);
    } else if (data.type === 'draw') {
        targetCtx.lineTo(data.x * scaleX, data.y * scaleY);
        targetCtx.strokeStyle = data.color || '#000';
        targetCtx.lineWidth = (data.size || 5) * Math.max(scaleX, scaleY);
        targetCtx.lineCap = 'round';
        targetCtx.stroke();
    } else if (data.type === 'stop') {
        targetCtx.closePath();
    } else if (data.type === 'clear') {
        targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
    }
});

// Tools
colorPicker.addEventListener('change', (e) => {
    currentColor = e.target.value;
});

brushSizeSlider.addEventListener('input', (e) => {
    brushSize = e.target.value;
});

clearBtn.addEventListener('click', () => {
    if (!isMyTurn) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('draw', {
        room: currentRoom,
        type: 'clear'
    });
});

console.log('Persianary loaded!');

// Continue button for host to advance rounds
if (continueBtn) {
    continueBtn.addEventListener('click', () => {
        continueBtn.disabled = true;
        socket.emit('continueRound', { roomCode: currentRoom });
        continueBtn.style.display = 'none';
    });
}