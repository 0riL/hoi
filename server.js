require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const simpleGit = require('simple-git');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const LOG_FILE = 'checked_usernames.txt';
const AVAIL_FILE = 'available_usernames.txt';

let isRunning = false;
let statusMsg = 'Idle';
let speed = 1; // usernames per second
let checked = new Set();
let available = [];
let errorLog = [];
let voidAbyss = [];
let generatorMode = 'random'; // or 'dictionary' or 'hybrid'

// --- Load checked usernames from file ---
if (fs.existsSync(LOG_FILE)) {
  checked = new Set(fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean));
}
if (fs.existsSync(AVAIL_FILE)) {
  available = fs.readFileSync(AVAIL_FILE, 'utf8').split('\n').filter(Boolean);
}

// --- Sample dictionary for demo ---
const DICTIONARY = ['apple', 'star', 'game', 'code', 'roblox', 'ninja', 'hero', 'quest', 'magic', 'pixel'];

// --- Helper Functions ---
function randomUsername(len = 5) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0; i < len; i++) name += chars[Math.floor(Math.random() * chars.length)];
  return name;
}
function dictUsername() {
  return DICTIONARY[Math.floor(Math.random() * DICTIONARY.length)] + Math.floor(Math.random() * 1000);
}
function hybridUsername() {
  return DICTIONARY[Math.floor(Math.random() * DICTIONARY.length)] + randomUsername(2 + Math.floor(Math.random() * 3));
}

// --- Username Generator ---
function nextUsername() {
  if (generatorMode === 'random') return randomUsername(5 + Math.floor(Math.random() * 2));
  if (generatorMode === 'dictionary') return dictUsername();
  return hybridUsername();
}

// --- Roblox username check ---
async function checkUsername(name) {
  try {
    const resp = await axios.get(`https://auth.roblox.com/v1/usernames/validate?request.username=${encodeURIComponent(name)}&request.birthday=2000-01-01&request.context=Signup`, {
      headers: { Cookie: `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}` }
    });
    if (resp.data.code === 0 && resp.data.message === 'Username is valid') return true;
    if (resp.data.code === 1 && resp.data.message.includes('already in use')) return false;
    // Integrity/void abyss check
    voidAbyss.push({ username: name, reason: 'Unexpected API response', data: resp.data });
    return null;
  } catch (e) {
    errorLog.push({ time: Date.now(), msg: e.message });
    if (e.response && e.response.status === 429) {
      statusMsg = 'Healing: Rate limited. Pausing...';
      await sleep(30000); // Wait 30s
      statusMsg = 'Running';
    }
    return null;
  }
}

// --- Logger & GitHub Sync ---
function logUsername(name, isAvail) {
  fs.appendFileSync(LOG_FILE, name + '\n');
  checked.add(name);
  if (isAvail) {
    fs.appendFileSync(AVAIL_FILE, name + '\n');
    available.push(name);
  }
}

async function syncToGitHub() {
  try {
    const git = simpleGit();
    await git.add('.');
    await git.commit('Auto: sync logs and data');
    await git.push();
  } catch (e) {
    errorLog.push({ time: Date.now(), msg: 'GitHub Sync: ' + e.message });
  }
}

// --- Web Server & UI ---
app.use(express.static('public'));

// --- Socket.IO for real-time UI ---
io.on('connection', (socket) => {
  socket.emit('init', {
    isRunning, statusMsg, speed, available: available.slice(-20),
    errorLog: errorLog.slice(-20), voidAbyss: voidAbyss.slice(-10), generatorMode
  });

  socket.on('control', (cmd) => {
    if (cmd === 'start') { isRunning = true; statusMsg = 'Running'; }
    if (cmd === 'stop') { isRunning = false; statusMsg = 'Stopped'; }
    if (cmd === 'troubleshoot') { statusMsg = 'Healing...'; errorLog = []; voidAbyss = []; statusMsg = isRunning ? 'Running' : 'Idle'; }
  });

  socket.on('setSpeed', (val) => { speed = Math.max(1, Math.min(20, val)); });
  socket.on('setMode', (mode) => { generatorMode = mode; });
  socket.on('export', (fmt) => {
    if (fmt === 'txt') socket.emit('export', available.join('\n'));
    if (fmt === 'csv') socket.emit('export', available.join(','));
  });
});

// --- Main Bot Loop ---
async function mainLoop() {
  while (true) {
    if (isRunning) {
      const username = nextUsername();
      if (!checked.has(username)) {
        io.emit('status', { statusMsg: `Checking: ${username}` });
        const isAvail = await checkUsername(username);
        if (isAvail === true) {
          logUsername(username, true);
          io.emit('found', { username });
        } else if (isAvail === false) {
          logUsername(username, false);
        } else {
          io.emit('void', { username });
        }
        await syncToGitHub();
      }
      await sleep(1000 / speed);
    } else {
      await sleep(500);
    }
    io.emit('update', {
      isRunning, statusMsg, speed, available: available.slice(-20),
      errorLog: errorLog.slice(-20), voidAbyss: voidAbyss.slice(-10), generatorMode
    });
  }
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
  mainLoop();
});
