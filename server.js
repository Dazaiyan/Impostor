import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { baseDataset, extraRandomWords } from './data.js';

const randomWords = [...baseDataset.flatMap(d => d.words), ...extraRandomWords];
const dataset = [...baseDataset, { name: 'Random', words: randomWords }];
const staticDirs = [path.join(__dirname, 'client', 'dist'), path.join(__dirname, 'public')];

function findStaticFile(urlPath) {
  for (const dir of staticDirs) {
    const candidate = path.join(dir, urlPath);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const urlPath = pathname === '/' ? '/index.html' : pathname; // ignore query strings, serve SPA

  let filePath = findStaticFile(urlPath);
  if (!filePath) {
    filePath = findStaticFile('/index.html');
  }
  if (!filePath) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.end('Error leyendo el archivo');
      return;
    }
    const ext = path.extname(filePath);
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json'
    }[ext] || 'text/plain';
    res.setHeader('Content-Type', mime);
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const lobbies = new Map(); // lobbyId -> { hostId, players: Map<id,{id,name,ws}>, settings, voting, round }

function randId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function broadcast(lobbyId, payload) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  for (const p of lobby.players.values()) {
    if (p.ws.readyState === p.ws.OPEN) {
      p.ws.send(JSON.stringify(payload));
    }
  }
}

function emitTo(playerId, lobbyId, payload) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const player = lobby.players.get(playerId);
  if (player && player.ws.readyState === player.ws.OPEN) {
    player.ws.send(JSON.stringify(payload));
  }
}

function summarizeLobby(lobby) {
  return {
    lobbyId: lobby.id,
    hostId: lobby.hostId,
    settings: lobby.settings,
    players: Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name }))
  };
}

function aliveList(round) {
  return Array.from(round.alive.values());
}

function sendLobbyUpdate(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  broadcast(lobbyId, { type: 'lobbyUpdate', lobby: summarizeLobby(lobby) });
}

function handleDisconnect(playerId, lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  lobby.players.delete(playerId);
  if (lobby.players.size === 0) {
    lobbies.delete(lobbyId);
    return;
  }
  if (lobby.hostId === playerId) {
    lobby.hostId = lobby.players.values().next().value.id; // next player becomes host
  }
  sendLobbyUpdate(lobbyId);
}

wss.on('connection', (ws) => {
  const playerId = randId(10);
  ws.send(JSON.stringify({ type: 'hello', playerId, dataset: dataset.map(d => ({ name: d.name, words: d.words.length })) }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    if (msg.type === 'createLobby') {
      const lobbyId = randId(6);
      const lobby = {
        id: lobbyId,
        hostId: playerId,
        players: new Map(),
        settings: { themeIndex: msg.themeIndex ?? 0, impostors: msg.impostors ?? 1 },
        voting: { active: false, tally: new Map(), voted: new Set() }
      };
      lobby.players.set(playerId, { id: playerId, name: msg.name || 'Host', ws });
      lobbies.set(lobbyId, lobby);
      ws.send(JSON.stringify({ type: 'lobbyJoined', lobby: summarizeLobby(lobby), isHost: true }));
      sendLobbyUpdate(lobbyId);
      return;
    }

    if (msg.type === 'joinLobby') {
      const lobby = lobbies.get(msg.lobbyId);
      if (!lobby) {
        ws.send(JSON.stringify({ type: 'error', message: 'Lobby no encontrado' }));
        return;
      }
      lobby.players.set(playerId, { id: playerId, name: msg.name || 'Jugador', ws });
      ws.send(JSON.stringify({ type: 'lobbyJoined', lobby: summarizeLobby(lobby), isHost: lobby.hostId === playerId }));
      sendLobbyUpdate(msg.lobbyId);
      return;
    }

    if (msg.type === 'updateSettings') {
      const lobby = lobbies.get(msg.lobbyId);
      if (!lobby || lobby.hostId !== playerId) return;
      lobby.settings.themeIndex = msg.themeIndex ?? lobby.settings.themeIndex;
      lobby.settings.impostors = msg.impostors ?? lobby.settings.impostors;
      sendLobbyUpdate(msg.lobbyId);
      return;
    }

    if (msg.type === 'startGame') {
      const lobby = lobbies.get(msg.lobbyId);
      if (!lobby || lobby.hostId !== playerId) return;
      const players = Array.from(lobby.players.values());
      if (players.length < 3) {
        emitTo(playerId, msg.lobbyId, { type: 'error', message: 'Necesitas al menos 3 jugadores.' });
        return;
      }
      const impostorCount = Math.max(1, Math.min(msg.impostors ?? lobby.settings.impostors, players.length - 1));
      const theme = dataset[msg.themeIndex ?? lobby.settings.themeIndex] || dataset[0];
      const secretObj = pickRandom(theme.words);
      const secretWord = secretObj.word;
      const secretHint = secretObj.hint;
      const pickList = [...players].sort(() => Math.random() - 0.5); // para roles
      const orderList = [...players].sort(() => Math.random() - 0.5); // para orden de hablar
      const impostorIds = new Set(pickList.slice(0, impostorCount).map(p => p.id));
      const order = orderList.map(p => ({ id: p.id, name: p.name }));

      // reset voting state
      lobby.voting = { active: true, tally: new Map(), voters: new Map() }; // voterId -> targetId
      lobby.round = {
        impostors: impostorIds,
        alive: new Set(order.map(o => o.id)),
        order
      };

      players.forEach(p => {
        const isImpostor = impostorIds.has(p.id);
        let message;
        if (isImpostor) {
          if (theme.name === 'Random') {
            message = `Eres el impostor. Pista: ${secretHint}`;
          } else {
            message = 'Eres el impostor. Finge que sabes la palabra.';
          }
        } else {
          message = `Tu palabra es: ${secretWord}`;
        }
        emitTo(p.id, msg.lobbyId, { type: 'roundAssigned', lobbyId: msg.lobbyId, isImpostor, word: message, theme: theme.name, secretWord });
      });
      broadcast(msg.lobbyId, { type: 'roundStarted', theme: theme.name, impostors: impostorCount, order, alive: order.map(o => o.id) });
      return;
    }

    if (msg.type === 'vote') {
      const lobby = lobbies.get(msg.lobbyId);
      if (!lobby || !lobby.voting?.active || !lobby.round) return;
      if (!lobby.round.alive.has(playerId)) {
        emitTo(playerId, msg.lobbyId, { type: 'error', message: 'Estás eliminado, no puedes votar.' });
        return;
      }
      const currentVotes = lobby.voting.voters;
      if (!lobby.round.alive.has(msg.targetId)) {
        emitTo(playerId, msg.lobbyId, { type: 'error', message: 'Jugador no válido o eliminado.' });
        return;
      }
      // restar voto previo si existía
      if (currentVotes.has(playerId)) {
        const prevTarget = currentVotes.get(playerId);
        const prevCount = lobby.voting.tally.get(prevTarget) || 0;
        lobby.voting.tally.set(prevTarget, Math.max(0, prevCount - 1));
      }
      currentVotes.set(playerId, msg.targetId);
      const current = lobby.voting.tally.get(msg.targetId) || 0;
      lobby.voting.tally.set(msg.targetId, current + 1);

      const tallyArray = Array.from(lobby.voting.tally.entries()).map(([id, votes]) => {
        const p = lobby.players.get(id);
        return { id, name: p ? p.name : 'Jugador', votes };
      });
      broadcast(msg.lobbyId, { type: 'voteUpdate', votes: tallyArray, totalVoters: lobby.round.alive.size, votedCount: currentVotes.size });

      if (currentVotes.size >= lobby.round.alive.size) {
        let eliminated = null;
        let maxVotes = -1;
        for (const [id, votes] of lobby.voting.tally.entries()) {
          if (votes > maxVotes) {
            maxVotes = votes;
            eliminated = id;
          }
        }
        const eliminatedPlayer = eliminated ? lobby.players.get(eliminated) : null;
        if (eliminated) lobby.round.alive.delete(eliminated);
        lobby.voting.active = false;

        const aliveIds = aliveList(lobby.round);
        const impostorsAlive = Array.from(lobby.round.impostors).filter(id => lobby.round.alive.has(id)).length;
        broadcast(msg.lobbyId, {
          type: 'elimination',
          eliminatedId: eliminated,
          eliminatedName: eliminatedPlayer ? eliminatedPlayer.name : 'Jugador',
          votes: maxVotes,
          aliveIds,
          order: lobby.round.order.filter(o => lobby.round.alive.has(o.id)),
          impostorsAlive
        });

        if (impostorsAlive === 0) {
          broadcast(msg.lobbyId, { type: 'gameEnd', result: 'civilians' });
        } else if (lobby.round.alive.size === 2 && impostorsAlive === 1) {
          broadcast(msg.lobbyId, { type: 'gameEnd', result: 'impostor' });
        } else if (lobby.round.alive.size === 1 && impostorsAlive === 1) {
          broadcast(msg.lobbyId, { type: 'gameEnd', result: 'impostor' });
        } else {
          // nueva ronda de votación
          lobby.voting = { active: true, tally: new Map(), voters: new Map() };
          broadcast(msg.lobbyId, { type: 'votingReset', aliveIds, order: lobby.round.order.filter(o => lobby.round.alive.has(o.id)) });
        }
      }
      return;
    }

    if (msg.type === 'cancelVote') {
      const lobby = lobbies.get(msg.lobbyId);
      if (!lobby || !lobby.voting?.active || !lobby.round) return;
      if (!lobby.round.alive.has(playerId)) return;
      const currentVotes = lobby.voting.voters;
      if (!currentVotes.has(playerId)) return;
      const prevTarget = currentVotes.get(playerId);
      currentVotes.delete(playerId);
      const prevCount = lobby.voting.tally.get(prevTarget) || 0;
      lobby.voting.tally.set(prevTarget, Math.max(0, prevCount - 1));

      const tallyArray = Array.from(lobby.voting.tally.entries()).map(([id, votes]) => {
        const p = lobby.players.get(id);
        return { id, name: p ? p.name : 'Jugador', votes };
      });
      broadcast(msg.lobbyId, { type: 'voteUpdate', votes: tallyArray, totalVoters: lobby.round.alive.size, votedCount: currentVotes.size });
      return;
    }
  });

  ws.on('close', () => {
    for (const [lobbyId, lobby] of lobbies.entries()) {
      if (lobby.players.has(playerId)) {
        handleDisconnect(playerId, lobbyId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor HTTP + WS en http://localhost:${PORT}`);
});
