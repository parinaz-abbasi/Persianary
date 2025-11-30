const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const rooms = {};

function getRandomWord(language, category, wordBank, usedWords = []) {
    
    let words = wordBank;
    if (wordBank && typeof wordBank === 'object' && wordBank[language]) {
        words = wordBank[language];
    }

    let pool = [];

    if (!words || typeof words !== 'object') {
        return null; // no words available
    }

    if (category === 'all') {
        // Combine all categories
        Object.keys(words).forEach(cat => {
            const list = words[cat] || [];
            pool = pool.concat(list);
        });
    } else {
        pool = words[category] || [];
    }

    if (!Array.isArray(pool) || pool.length === 0) return null;

    const normalizeWord = (entry) => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry;
        if (typeof entry.word === 'string') return entry.word;
        return '';
    };

    const usedSet = new Set((usedWords || []).map(normalizeWord).filter(Boolean));

    let available = pool.filter(entry => {
        const wordText = normalizeWord(entry);
        if (!wordText) return false;
        return !usedSet.has(wordText);
    });

    if (available.length === 0) {
        available = pool.slice();
    }

    if (available.length === 0) return null;

    const chosen = available[Math.floor(Math.random() * available.length)];
    return typeof chosen === 'string' ? { word: chosen } : chosen;
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    socket.on('joinRoom', (data) => {
        const { roomCode, playerName } = data;
        
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: [],
                team1: [],
                team2: [],
                gameStarted: false,
                currentRound: 0,
                currentDrawer: null,
                currentWord: null,
                settings: {
                    language: 'persian',
                    category: 'easy',
                    time: 60,
                    rounds: 5
                }
            };
        }
        
        const room = rooms[roomCode];
        
        if (room.players.length >= 10) {
            socket.emit('roomFull');
            return;
        }
        
        const player = {
            id: socket.id,
            name: playerName,
            score: 0,
            isHost: room.players.length === 0,
            team: null
        };
        
        room.players.push(player);
        socket.join(roomCode);
        
        if (room.team1.length <= room.team2.length) {
            player.team = 'team1';
            room.team1.push(player);
            socket.join(`${roomCode}-team1`);
        } else {
            player.team = 'team2';
            room.team2.push(player);
            socket.join(`${roomCode}-team2`);
        }
        
        io.to(roomCode).emit('roomUpdate', {
            players: room.players,
            team1: room.team1,
            team2: room.team2,
            // minimum 4 players (2 per team) to start
            canStart: room.players.length >= 4
        });
    });
    
    socket.on('updateSettings', (data) => {
        const { roomCode, settings } = data;
        if (rooms[roomCode]) {
            rooms[roomCode].settings = settings;
        }
    });
    
    socket.on('startGame', (data) => {
        const { roomCode, wordBank } = data;
        const room = rooms[roomCode];
        
    if (room && room.players.length >= 4) {
            // Initialize game state
            room.gameStarted = true;
            room.currentRound = 1;
            const pickDrawerFrom = (teamArr) => teamArr && teamArr.length ? teamArr[Math.floor(Math.random() * teamArr.length)] : null;
            room.currentDrawer = {
                team1: pickDrawerFrom(room.team1),
                team2: pickDrawerFrom(room.team2)
            };
            room.wordBank = wordBank;
            room.pastWords = [];
            room.scores = { team1: 0, team2: 0 };
            room.currentRoundData = {
                team1: { drawings: [], guesses: [] },
                team2: { drawings: [], guesses: [] }
            };
            room.roundHistory = [];
            room.currentRoundSolved = false;

            const wordObj = getRandomWord(room.settings.language, room.settings.category, wordBank, room.pastWords);
            if (!wordObj) {
                io.to(roomCode).emit('errorMessage', { message: 'No words available for selected language/category.' });
                return;
            }

            room.currentWord = wordObj;
            room.pastWords.push(wordObj.word);

            io.to(roomCode).emit('gameStarted', {
                settings: room.settings,
                round: room.currentRound,
                drawers: {
                    team1: room.currentDrawer.team1,
                    team2: room.currentDrawer.team2
                },
                totalRounds: room.settings.rounds
            });

            
            io.to(roomCode).emit('roundWord', { word: wordObj.word, drawers: { team1: room.currentDrawer.team1 ? room.currentDrawer.team1.id : null, team2: room.currentDrawer.team2 ? room.currentDrawer.team2.id : null } });
            if (room.currentDrawer.team1) io.to(room.currentDrawer.team1.id).emit('yourWord', wordObj.word);
            if (room.currentDrawer.team2) io.to(room.currentDrawer.team2.id).emit('yourWord', wordObj.word);

            const hint = '_'.repeat(wordObj.word.length);
            io.to(roomCode).emit('wordHint', hint);
            startRoomTimer(roomCode);
        }
    });

    function startRoomTimer(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        if (room.timerHandle) {
            clearInterval(room.timerHandle);
            room.timerHandle = null;
        }
        room.timerRemaining = room.settings.time;
        io.to(roomCode).emit('timerUpdate', { time: room.timerRemaining });

        room.timerHandle = setInterval(() => {
            room.timerRemaining -= 1;
            if (room.timerRemaining < 0) room.timerRemaining = 0;
            io.to(roomCode).emit('timerUpdate', { time: room.timerRemaining });

            if (room.timerRemaining <= 0) {
                clearInterval(room.timerHandle);
                room.timerHandle = null;
                handleEndRound(roomCode);
            }
        }, 1000);
    }

    function handleEndRound(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        const reveal = {
            round: room.currentRound,
            data: room.currentRoundData,
            word: room.currentWord ? room.currentWord.word : null,
            scores: room.scores,
            winner: room.currentRoundSolved ? (room.scores.team1 > room.scores.team2 ? 'team1' : (room.scores.team2 > room.scores.team1 ? 'team2' : null)) : null
        };

        room.roundHistory.push(reveal);
        io.to(roomCode).emit('revealRound', reveal);

        room.pendingNext = true;

        
        const autoMs = room.autoAdvanceMs || 8000;
        if (room.pendingTimerHandle) {
            clearTimeout(room.pendingTimerHandle);
            room.pendingTimerHandle = null;
        }
        room.pendingTimerHandle = setTimeout(() => {
            // Only auto-advance if still pending
            if (!room || !room.pendingNext) return;
            console.log(`Auto-advancing room ${roomCode} after ${autoMs}ms`);
            advanceToNextRound(roomCode, true);
        }, autoMs);
    }
    
    socket.on('draw', (data) => {
        const roomCode = data.room;
        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.team) return;

        if (!room.currentRoundData) {
            room.currentRoundData = { team1: { drawings: [], guesses: [] }, team2: { drawings: [], guesses: [] } };
        }
        const currentDrawerForTeam = room.currentDrawer && room.currentDrawer[player.team];
        if (!currentDrawerForTeam || currentDrawerForTeam.id !== socket.id) {
            // ignore drawing events from non-drawers
            return;
        }

        room.currentRoundData[player.team].drawings.push(data);

        socket.to(`${roomCode}-${player.team}`).emit('draw', data);
    });
    
    socket.on('guess', (data) => {
        const { roomCode, guess, playerName } = data;
        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.name === playerName && p.id === socket.id) || room.players.find(p => p.id === socket.id) || { team: null };
        const team = player.team || (room.team1.some(p => p.name === playerName) ? 'team1' : 'team2');

        
        if (!room.currentRoundData) {
            room.currentRoundData = { team1: { drawings: [], guesses: [] }, team2: { drawings: [], guesses: [] } };
        }
        if (room.currentDrawer && room.currentDrawer[team] && room.currentDrawer[team].id === socket.id) {
            return;
        }
        room.currentRoundData[team].guesses.push({ playerName, guess });

        io.to(`${roomCode}-${team}`).emit('newGuess', { playerName, guess });

        if (room.currentWord && !room.currentRoundSolved && guess.toLowerCase().trim() === room.currentWord.word.toLowerCase().trim()) {
            room.currentRoundSolved = true;
            room.scores[team] = (room.scores[team] || 0) + 1;

            io.to(roomCode).emit('scoreUpdate', room.scores);

            io.to(`${roomCode}-${team}`).emit('correctGuess', { playerName, word: room.currentWord.word });
        }
    });

    socket.on('endRound', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) return; // only host can force end
        handleEndRound(roomCode);
    });
    
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        for (const roomCode of Object.keys(rooms)) {
            const room = rooms[roomCode];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                const [removed] = room.players.splice(idx, 1);
                room.team1 = room.team1.filter(p => p.id !== socket.id);
                room.team2 = room.team2.filter(p => p.id !== socket.id);

                if (removed.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                }

                if (room.gameStarted) {
                    if (room.players.length === 0) {
                        delete rooms[roomCode];
                        continue;
                    }

                    if (room.gameStarted) {
                        const wasDrawerTeam1 = room.currentDrawer && room.currentDrawer.team1 && room.currentDrawer.team1.id === removed.id;
                        const wasDrawerTeam2 = room.currentDrawer && room.currentDrawer.team2 && room.currentDrawer.team2.id === removed.id;
                        if (wasDrawerTeam1 || wasDrawerTeam2) {
                            // stop timer if running
                            if (room.timerHandle) { clearInterval(room.timerHandle); room.timerHandle = null; }
                            handleEndRound(roomCode);
                        }

                        
                        if (room.players.length === 0) {
                            delete rooms[roomCode];
                            continue;
                        }
                    }
                }

                io.to(roomCode).emit('roomUpdate', {
                    players: room.players,
                    team1: room.team1,
                    team2: room.team2,
                    canStart: room.players.length >= 4
                });
            }
        }
    });

    
    socket.on('speedGuess', ({ roomCode, guess, playerName }) => {
        const room = rooms[roomCode];
        if (!room || !room.speedActive) return;

        const player = room.players.find(p => p.id === socket.id) || { team: null };
        const team = player.team || (room.team1.some(p => p.name === playerName) ? 'team1' : 'team2');

        const idx = room.speedWords.findIndex(w => w.toLowerCase().trim() === guess.toLowerCase().trim());
        if (idx !== -1) {
            const foundWord = room.speedWords.splice(idx, 1)[0];
            room.scores[team] = (room.scores[team] || 0) + 1;
            io.to(roomCode).emit('speedHit', { team, playerName, word: foundWord });
            io.to(roomCode).emit('scoreUpdate', room.scores);
            if (room.speedWords.length === 0) {
                room.speedActive = false;
                if (room.speedTimerHandle) { clearInterval(room.speedTimerHandle); room.speedTimerHandle = null; }
                io.to(roomCode).emit('speedRoundEnd', { scores: room.scores });
            }
        }
    });

    socket.on('continueRound', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) return; // only host
        if (!room.pendingNext) return;
        advanceToNextRound(roomCode, false);
    });

    function advanceToNextRound(roomCode, forced = false) {
        const room = rooms[roomCode];
        if (!room) return;
        if (!forced) {
            if (!room.pendingNext) return;
        }

        if (room.pendingTimerHandle) { clearTimeout(room.pendingTimerHandle); room.pendingTimerHandle = null; }

        room.pendingNext = false;
        room.currentRound = (room.currentRound || 1) + 1;
        room.currentRoundData = { team1: { drawings: [], guesses: [] }, team2: { drawings: [], guesses: [] } };
        room.currentRoundSolved = false;

        if (room.currentRound > room.settings.rounds) {
            room.speedWords = room.pastWords.slice();
            room.speedActive = true;
            io.to(roomCode).emit('startSpeedRound', { words: room.speedWords });
            // start server-side speed timer
            const speedTime = room.settings.speedTime || 60;
            room.speedTimerRemaining = speedTime;
            io.to(roomCode).emit('speedTimerUpdate', { time: room.speedTimerRemaining });
            if (room.speedTimerHandle) { clearInterval(room.speedTimerHandle); room.speedTimerHandle = null; }
            room.speedTimerHandle = setInterval(() => {
                room.speedTimerRemaining -= 1;
                if (room.speedTimerRemaining < 0) room.speedTimerRemaining = 0;
                io.to(roomCode).emit('speedTimerUpdate', { time: room.speedTimerRemaining });
                if (room.speedTimerRemaining <= 0) {
                    clearInterval(room.speedTimerHandle);
                    room.speedTimerHandle = null;
                    room.speedActive = false;
                    io.to(roomCode).emit('speedRoundEnd', { scores: room.scores });
                }
            }, 1000);
            return;
        }

        // pick next drawers for both teams
        const pickDrawerFrom = (teamArr) => teamArr && teamArr.length ? teamArr[Math.floor(Math.random() * teamArr.length)] : null;
        room.currentDrawer = {
            team1: pickDrawerFrom(room.team1),
            team2: pickDrawerFrom(room.team2)
        };

        // pick next word and notify players
        const nextWordObj = getRandomWord(room.settings.language, room.settings.category, room.wordBank, room.pastWords);
        if (nextWordObj) {
            room.currentWord = nextWordObj;
            room.pastWords.push(nextWordObj.word);
            io.to(roomCode).emit('gameStarted', {
                settings: room.settings,
                round: room.currentRound,
                drawers: {
                    team1: room.currentDrawer.team1,
                    team2: room.currentDrawer.team2
                },
                totalRounds: room.settings.rounds
            });
            // broadcast the round word with drawer ids per team
            io.to(roomCode).emit('roundWord', { word: nextWordObj.word, drawers: { team1: room.currentDrawer.team1 ? room.currentDrawer.team1.id : null, team2: room.currentDrawer.team2 ? room.currentDrawer.team2.id : null } });
            if (room.currentDrawer.team1) io.to(room.currentDrawer.team1.id).emit('yourWord', nextWordObj.word);
            if (room.currentDrawer.team2) io.to(room.currentDrawer.team2.id).emit('yourWord', nextWordObj.word);
            const hint = nextWordObj.word ? '_'.repeat(nextWordObj.word.length) : '';
            io.to(roomCode).emit('wordHint', hint);
            // start timer
            startRoomTimer(roomCode);
        } else {
            io.to(roomCode).emit('errorMessage', { message: 'No more words available.' });
        }
    }
});

// Allow overriding host/port via env (handy if 3000/0.0.0.0 are blocked)
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
http.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});
