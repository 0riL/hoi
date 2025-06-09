const socket = io();
const app = document.getElementById('app');

// --- Panels ---
function render(state) {
  app.innerHTML = `
    <div class="panel status">
      <b>Status:</b> ${state.statusMsg}
      <br>
      <b>Bot:</b> ${state.isRunning ? '🟢 Running' : '🔴 Stopped'}
    </div>
    <div class="panel">
      <button onclick="window.startBot()">${state.isRunning ? '⏹️ Stop' : '▶️ Start'}</button>
      <button onclick="window.troubleshoot()">🛠️ Troubleshoot</button>
      <button onclick="window.exportNames('txt')">⬇️ Export .txt</button>
      <button onclick="window.exportNames('csv')">⬇️ Export .csv</button>
      <br>
      <label>Speed: <input type="range" min="1" max="20" value="${state.speed}" onchange="window.setSpeed(this.value)" />${state.speed} usernames/sec</label>
      <br>
      <label>Generator:
        <select onchange="window.setMode(this.value)">
          <option value="random" ${state.generatorMode==='random'?'selected':''}>Random</option>
          <option value="dictionary" ${state.generatorMode==='dictionary'?'selected':''}>Dictionary</option>
          <option value="hybrid" ${state.generatorMode==='hybrid'?'selected':''}>Hybrid</option>
        </select>
      </label>
    </div>
    <div class="panel">
      <b>Available Usernames (newest first):</b><br>
      <ul>
        ${state.available.map(n => `<li class="available">${n}</li>`).join('')}
      </ul>
    </div>
    <div class="panel errorlog">
      <b>Error Log:</b><br>
      <ul>
        ${state.errorLog.map(e => `<li>${new Date(e.time).toLocaleTimeString()} — ${e.msg}</li>`).join('')}
      </ul>
    </div>
    <div class="panel void-abyss">
      <b>Void Abyss Panel (False/Failed Checks):</b>
      <ul>
        ${state.voidAbyss.map(v => `<li>${v.username}: ${v.reason}</li>`).join('')}
      </ul>
    </div>
  `;
}

socket.on('init', render);
socket.on('update', render);
socket.on('status', s => {
  const st = document.querySelector('.status');
  if (st) st.innerHTML = `<b>Status:</b> ${s.statusMsg}`;
});
socket.on('found', d => {
  // Optionally trigger an animation
});
socket.on('void', d => {
  // Optionally trigger a void animation
});
socket.on('export', data => {
  const blob = new Blob([data], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'available_usernames.txt';
  a.click();
  URL.revokeObjectURL(url);
});

window.startBot = function() {
  socket.emit('control', 'start');
};
window.troubleshoot = function() {
  socket.emit('control', 'troubleshoot');
};
window.setSpeed = function(val) {
  socket.emit('setSpeed', Number(val));
};
window.setMode = function(val) {
  socket.emit('setMode', val);
};
window.exportNames = function(fmt) {
  socket.emit('export', fmt);
};
