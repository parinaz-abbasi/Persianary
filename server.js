const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const rooms = {};

// Helper function to get random word
function getRandomWord(language, category, wordBank, usedWords = []) {
    // wordBank can be either an object that has language as top-level keys
    // (e.g. { persian: {...}, english: {...} }) or already the language map
    // (e.g. persianWords). Handle both shapes safely.
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

    // If all words for this category are exhausted, allow reuse by resetting the available pool.
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
            // pick a random drawer for each team for the first round
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

            // Get random word for the first round
            const wordObj = getRandomWord(room.settings.language, room.settings.category, wordBank, room.pastWords);
            if (!wordObj) {
                io.to(roomCode).emit('errorMessage', { message: 'No words available for selected language/category.' });
                return;
            }

            room.currentWord = wordObj;
            room.pastWords.push(wordObj.word);

            // Send game started to all
            io.to(roomCode).emit('gameStarted', {
                settings: room.settings,
                round: room.currentRound,
                drawers: {
                    team1: room.currentDrawer.team1,
                    team2: room.currentDrawer.team2
                },
                totalRounds: room.settings.rounds
            });

            // Broadcast the round word to ALL players (both teams will see the same word)
            // include drawer ids per team so clients can determine who may draw
            io.to(roomCode).emit('roundWord', { word: wordObj.word, drawers: { team1: room.currentDrawer.team1 ? room.currentDrawer.team1.id : null, team2: room.currentDrawer.team2 ? room.currentDrawer.team2.id : null } });
            // also keep compatibility: send to each drawer specifically
            if (room.currentDrawer.team1) io.to(room.currentDrawer.team1.id).emit('yourWord', wordObj.word);
            if (room.currentDrawer.team2) io.to(room.currentDrawer.team2.id).emit('yourWord', wordObj.word);

            // Send hint to all players as well (clients may show masked or full word depending on UI)
            const hint = '_'.repeat(wordObj.word.length);
            io.to(roomCode).emit('wordHint', hint);
            // start server-side timer for this room
            startRoomTimer(roomCode);
        }
    });

    // helper: start per-room timer
    function startRoomTimer(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        // clear previous timer if exists
        if (room.timerHandle) {
            clearInterval(room.timerHandle);
            room.timerHandle = null;
        }
        // set remaining time from settings
        room.timerRemaining = room.settings.time;
        // emit initial timer value
        io.to(roomCode).emit('timerUpdate', { time: room.timerRemaining });

        room.timerHandle = setInterval(() => {
            room.timerRemaining -= 1;
            if (room.timerRemaining < 0) room.timerRemaining = 0;
            io.to(roomCode).emit('timerUpdate', { time: room.timerRemaining });

            if (room.timerRemaining <= 0) {
                // stop timer
                clearInterval(room.timerHandle);
                room.timerHandle = null;
                // automatically end the round
                handleEndRound(roomCode);
            }
        }, 1000);
    }

    // helper: end round logic (extracted to function so server timer can call it)
    function handleEndRound(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        // prepare reveal payload and set pendingNext flag so host can continue
        const reveal = {
            round: room.currentRound,
            data: room.currentRoundData,
            word: room.currentWord ? room.currentWord.word : null,
            scores: room.scores,
            winner: room.currentRoundSolved ? (room.scores.team1 > room.scores.team2 ? 'team1' : (room.scores.team2 > room.scores.team1 ? 'team2' : null)) : null
        };

        room.roundHistory.push(reveal);
        io.to(roomCode).emit('revealRound', reveal);

        // mark that the room is waiting for host to continue
        room.pendingNext = true;

        // start an auto-advance timer in case host doesn't click continue
        // default auto-advance after 8 seconds; store handle so it can be cleared if host continues
        const autoMs = room.autoAdvanceMs || 8000;
        if (room.pendingTimerHandle) {
            clearTimeout(room.pendingTimerHandle);
            room.pendingTimerHandle = null;
        }
        room.pendingTimerHandle = setTimeout(() => {
            // Only auto-advance if still pending
            if (!room || !room.pendingNext) return;
            console.log(`Auto-advancing room ${roomCode} after ${autoMs}ms`);
            // perform the same advance logic as continueRound but without requiring host
            advanceToNextRound(roomCode, true);
        }, autoMs);
    }
    
    socket.on('draw', (data) => {
        const roomCode = data.room;
        const room = rooms[roomCode];
        if (!room) return;

        // find player's team
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.team) return;

        // save drawing event to current round data
        if (!room.currentRoundData) {
            room.currentRoundData = { team1: { drawings: [], guesses: [] }, team2: { drawings: [], guesses: [] } };
        }
        // Only allow the drawer for this player's team to draw
        const currentDrawerForTeam = room.currentDrawer && room.currentDrawer[player.team];
        if (!currentDrawerForTeam || currentDrawerForTeam.id !== socket.id) {
            // ignore drawing events from non-drawers
            return;
        }

        room.currentRoundData[player.team].drawings.push(data);

        // emit drawing only to teammates (not the other team)
        socket.to(`${roomCode}-${player.team}`).emit('draw', data);
    });
    
    socket.on('guess', (data) => {
        const { roomCode, guess, playerName } = data;
        const room = rooms[roomCode];
        if (!room) return;

        // find player's team
        const player = room.players.find(p => p.name === playerName && p.id === socket.id) || room.players.find(p => p.id === socket.id) || { team: null };
        const team = player.team || (room.team1.some(p => p.name === playerName) ? 'team1' : 'team2');

        // save guess to current round data (team-private)
        if (!room.currentRoundData) {
            room.currentRoundData = { team1: { drawings: [], guesses: [] }, team2: { drawings: [], guesses: [] } };
        }
        // prevent drawers from guessing
        if (room.currentDrawer && room.currentDrawer[team] && room.currentDrawer[team].id === socket.id) {
            // ignore guesses from the drawer
            return;
        }
        room.currentRoundData[team].guesses.push({ playerName, guess });

        // Broadcast guess only to teammates
        io.to(`${roomCode}-${team}`).emit('newGuess', { playerName, guess });

        // Check if correct and award point to the team that guessed first
        if (room.currentWord && !room.currentRoundSolved && guess.toLowerCase().trim() === room.currentWord.word.toLowerCase().trim()) {
            room.currentRoundSolved = true;
            room.scores[team] = (room.scores[team] || 0) + 1;

            // Notify all players about score update (score announcement only)
            io.to(roomCode).emit('scoreUpdate', room.scores);

            // Notify teammates that they guessed correctly (team-private confirmation)
            io.to(`${roomCode}-${team}`).emit('correctGuess', { playerName, word: room.currentWord.word });
        }
    });

    // End of round triggered by host or timeout client
    socket.on('endRound', ({ roomCode }) => {
        // server-side end round handling (host fallback)
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) return; // only host can force end
        handleEndRound(roomCode);
    });
    
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        // Remove player from any room they are in
        for (const roomCode of Object.keys(rooms)) {
            const room = rooms[roomCode];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                const [removed] = room.players.splice(idx, 1);
                // remove from team lists
                room.team1 = room.team1.filter(p => p.id !== socket.id);
                room.team2 = room.team2.filter(p => p.id !== socket.id);

                // if removed was host, assign new host
                if (removed.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                }

                // adjust currentDrawerIndex
                if (room.gameStarted) {
                    if (room.players.length === 0) {
                        // cleanup room
                        delete rooms[roomCode];
                        continue;
                    }

                    // if removed was a current drawer for any team, end the round early and reveal
                    if (room.gameStarted) {
                        const wasDrawerTeam1 = room.currentDrawer && room.currentDrawer.team1 && room.currentDrawer.team1.id === removed.id;
                        const wasDrawerTeam2 = room.currentDrawer && room.currentDrawer.team2 && room.currentDrawer.team2.id === removed.id;
                        if (wasDrawerTeam1 || wasDrawerTeam2) {
                            // stop timer if running
                            if (room.timerHandle) { clearInterval(room.timerHandle); room.timerHandle = null; }
                            handleEndRound(roomCode);
                        }

                        // ensure remaining drawers are valid; if players left, pick new drawers when continuing
                        // if no players left, cleanup
                        if (room.players.length === 0) {
                            delete rooms[roomCode];
                            continue;
                        }
                    }
                }

                // notify remaining players about update
                io.to(roomCode).emit('roomUpdate', {
                    players: room.players,
                    team1: room.team1,
                    team2: room.team2,
                    canStart: room.players.length >= 4
                });
            }
        }
    });

    // Speed round guesses: fast-pace guesses for previous words
    socket.on('speedGuess', ({ roomCode, guess, playerName }) => {
        const room = rooms[roomCode];
        if (!room || !room.speedActive) return;

        const player = room.players.find(p => p.id === socket.id) || { team: null };
        const team = player.team || (room.team1.some(p => p.name === playerName) ? 'team1' : 'team2');

        // find if guess matches any remaining speed word (case-insensitive)
        const idx = room.speedWords.findIndex(w => w.toLowerCase().trim() === guess.toLowerCase().trim());
        if (idx !== -1) {
            const foundWord = room.speedWords.splice(idx, 1)[0];
            // award point to team
            room.scores[team] = (room.scores[team] || 0) + 1;
            io.to(roomCode).emit('speedHit', { team, playerName, word: foundWord });
            io.to(roomCode).emit('scoreUpdate', room.scores);
            // if no words left, finish speed round
            if (room.speedWords.length === 0) {
                // stop any speed timer
                room.speedActive = false;
                if (room.speedTimerHandle) { clearInterval(room.speedTimerHandle); room.speedTimerHandle = null; }
                io.to(roomCode).emit('speedRoundEnd', { scores: room.scores });
            }
        }
    });

    // Host requests to continue to the next round (after reveal)
    socket.on('continueRound', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) return; // only host
        if (!room.pendingNext) return;
        // Advance via shared function (host-triggered)
        advanceToNextRound(roomCode, false);
    });

    // Shared function to advance to the next round. If forced=true, bypass host check (used by auto-advance).
    function advanceToNextRound(roomCode, forced = false) {
        const room = rooms[roomCode];
        if (!room) return;
        if (!forced) {
            // only proceed if pendingNext set
            if (!room.pendingNext) return;
        }

        // clear any pending auto-advance timer
        if (room.pendingTimerHandle) { clearTimeout(room.pendingTimerHandle); room.pendingTimerHandle = null; }

        // Advance to next round
        room.pendingNext = false;
        room.currentRound = (room.currentRound || 1) + 1;
        room.currentRoundData = { team1: { drawings: [], guesses: [] }, team2: { drawings: [], guesses: [] } };
        room.currentRoundSolved = false;

        // If we've completed normal rounds, start speed round instead
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

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
