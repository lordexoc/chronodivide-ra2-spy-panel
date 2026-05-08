// ChronoDivide / Red Alert 2 Online - Spy Panel + Radar v3
// https://github.com/lordexoc/chronodivide-ra2-spy-panel
(function() {
  if (window._spyInterval) clearInterval(window._spyInterval);
  if (document.getElementById('spy-panel')) document.getElementById('spy-panel').remove();
  
  function findModule(suffix) {
    let mods = System._loader.modules;
    for (let key of Object.keys(mods)) {
      if (key.endsWith(suffix)) return mods[key];
    }
    return null;
  }

  let lsMod = findModule('/network/gamestate/LockstepManager');
  if (!lsMod) { console.error('[SPY] LockstepManager module not found'); return; }
  let LS = lsMod.module.LockstepManager;
  let pqMod = findModule('/game/player/production/ProductionQueue');
  if (!pqMod) { console.error('[SPY] ProductionQueue module not found'); return; }
  let QueueStatus = pqMod.module.QueueStatus;
  let QueueType = pqMod.module.QueueType;
  
  let origSend = LS.prototype.sendActions;
  LS.prototype.sendActions = function() {
    window._ls = this;
    window._game = this.game;
    window._inputActions = this.inputActions;
    return origSend.call(this);
  };
  
  let panelScale = 1;
  let panelMinimized = false;
  let radarVisible = true;
  
  let panel = document.createElement('div');
  panel.id = 'spy-panel';
  panel.style.cssText = `
    position:fixed; top:10px; left:10px; z-index:999999;
    background:rgba(10,10,30,0.92); border:2px solid #e94560;
    border-radius:8px; padding:0; font-family:monospace;
    color:#fff; font-size:11px; width:320px;
    text-shadow: 1px 1px 2px #000; max-height:90vh; overflow-y:auto;
    transform-origin: top left;
  `;
  
  let toolbar = document.createElement('div');
  toolbar.style.cssText = `
    display:flex; justify-content:space-between; align-items:center;
    padding:3px 8px; background:rgba(233,69,96,0.3); border-bottom:1px solid #e94560;
    cursor:move; user-select:none; border-radius:6px 6px 0 0;
  `;
  toolbar.innerHTML = `
    <span style="color:#e94560;font-weight:bold;font-size:10px;">SPY PANEL</span>
    <div>
      <button id="spy-map" style="background:#030;border:1px solid #0f0;color:#0f0;width:30px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:8px;font-weight:bold;">MAP</button>
      <button id="spy-minus" style="background:none;border:1px solid #888;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:12px;">−</button>
      <button id="spy-plus" style="background:none;border:1px solid #888;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:12px;">+</button>
      <button id="spy-mini" style="background:none;border:1px solid #888;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:12px;">_</button>
      <button id="spy-dc" style="background:#600;border:1px solid #f00;color:#fff;width:26px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:9px;font-weight:bold;">RQ</button>
    </div>
  `;
  panel.appendChild(toolbar);
  
  let content = document.createElement('div');
  content.id = 'spy-content';
  content.style.cssText = 'padding:8px 10px; pointer-events:none;';
  content.innerHTML = '<div style="color:#fa0;">⏳ Waiting for game...</div>';
  panel.appendChild(content);
  
  let radarWrap = document.createElement('div');
  radarWrap.style.cssText = 'padding:4px 10px 8px; border-top:1px solid #333;';
  let radarCanvas = document.createElement('canvas');
  const RADAR_SIZE = 300;
  radarCanvas.width = RADAR_SIZE;
  radarCanvas.height = RADAR_SIZE;
  radarCanvas.style.cssText = 'display:block; width:100%; border:1px solid #0f0; border-radius:3px; background:#000;';
  radarWrap.appendChild(radarCanvas);
  panel.appendChild(radarWrap);
  
  document.body.appendChild(panel);
  const ctx = radarCanvas.getContext('2d');
  
  let terrainCache = null;
  let terrainCacheTick = 0;
  
  document.getElementById('spy-map').onclick = () => {
    radarVisible = !radarVisible;
    radarWrap.style.display = radarVisible ? 'block' : 'none';
    let btn = document.getElementById('spy-map');
    btn.style.background = radarVisible ? '#030' : '#300';
    btn.style.borderColor = radarVisible ? '#0f0' : '#f00';
    btn.style.color = radarVisible ? '#0f0' : '#f00';
  };
  document.getElementById('spy-minus').onclick = () => {
    panelScale = Math.max(0.5, panelScale - 0.1);
    panel.style.transform = `scale(${panelScale})`;
  };
  document.getElementById('spy-plus').onclick = () => {
    panelScale = Math.min(1.5, panelScale + 0.1);
    panel.style.transform = `scale(${panelScale})`;
  };
  document.getElementById('spy-mini').onclick = () => {
    panelMinimized = !panelMinimized;
    content.style.display = panelMinimized ? 'none' : 'block';
    radarWrap.style.display = (panelMinimized || !radarVisible) ? 'none' : 'block';
    document.getElementById('spy-mini').textContent = panelMinimized ? '□' : '_';
  };
  
  document.getElementById('spy-dc').onclick = () => {
    try {
      let playerMod = findModule('/game/Player');
      if (!playerMod) return;
      let PlayerClass = playerMod.module.Player;
      let desc = Object.getOwnPropertyDescriptor(PlayerClass.prototype, 'credits');
      let game = window._game;
      if (!game) return;
      let players = game.getAllPlayers().filter(p => !p.isNeutral);
      let myName = findMyName(game);
      let me = players.find(p => p.name === myName) || players[0];
      desc.set.call(me, desc.get.call(me) + 1);
      Object.defineProperty(PlayerClass.prototype, 'credits', desc);
    } catch(e) {}
  };
  
  let dragging = false, dx = 0, dy = 0;
  toolbar.onmousedown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    dx = e.clientX - panel.offsetLeft;
    dy = e.clientY - panel.offsetTop;
  };
  document.onmousemove = (e) => {
    if (!dragging) return;
    panel.style.left = (e.clientX - dx) + 'px';
    panel.style.top = (e.clientY - dy) + 'px';
  };
  document.onmouseup = () => { dragging = false; };
  
  let cachedMyName = null;
  function findMyName(game) {
    if (cachedMyName) return cachedMyName;
    try {
      let gc = window._ls?.gservCon;
      if (gc) {
        for (let key of Object.keys(gc)) {
          let val = gc[key];
          if (typeof val === 'string') {
            let allNames = game.getAllPlayers().map(p => p.name);
            if (allNames.includes(val) && val !== '@@NEUTRAL@@') {
              cachedMyName = val;
              return cachedMyName;
            }
          }
        }
      }
    } catch(e) {}
    try {
      let sel = game.getUnitSelection();
      if (sel && sel.selectedUnits) {
        for (let item of sel.selectedUnits) {
          if (typeof item === 'number') {
            let obj = game.getObjectById(item);
            if (obj) {
              let owner = obj.owner;
              cachedMyName = (typeof owner === 'string') ? owner : owner?.name;
              if (cachedMyName && cachedMyName !== '@@NEUTRAL@@') return cachedMyName;
              cachedMyName = null;
            }
          }
        }
      }
    } catch(e) {}
    return null;
  }
  
  // ===== ISO TRANSFORM (45° döndürme, canvas'ı tam doldurur) =====
  function createIsoTransform(bounds) {
    const bx = bounds.x, by = bounds.y, bw = bounds.width, bh = bounds.height;
    const S = RADAR_SIZE;
    return function(rx, ry) {
      const nx = (rx - bx) / bw;
      const ny = (ry - by) / bh;
      return {
        x: ((nx - ny + 1) * 0.5) * S,
        y: ((nx + ny) * 0.5) * S
      };
    };
  }
  
  // ===== TERRAIN CACHE =====
  function buildTerrainCache(game, iso) {
    const off = document.createElement('canvas');
    off.width = RADAR_SIZE;
    off.height = RADAR_SIZE;
    const oc = off.getContext('2d');
    
    oc.fillStyle = '#0a0a14';
    oc.fillRect(0, 0, RADAR_SIZE, RADAR_SIZE);
    
    // Harita sınırı (ince çizgi)
    const bounds = game.map.mapBounds.localSize;
    const c = [
      iso(bounds.x, bounds.y),
      iso(bounds.x + bounds.width, bounds.y),
      iso(bounds.x + bounds.width, bounds.y + bounds.height),
      iso(bounds.x, bounds.y + bounds.height)
    ];
    oc.strokeStyle = 'rgba(0,150,0,0.3)';
    oc.lineWidth = 0.5;
    oc.beginPath();
    oc.moveTo(c[0].x, c[0].y);
    c.forEach(p => oc.lineTo(p.x, p.y));
    oc.closePath();
    oc.stroke();
    
    // Terrain renkleri
    try {
      game.map.tiles.forEach((tile) => {
        if (!tile) return;
        let color;
        try { color = game.map.tiles.getTileRadarColor(tile); } catch(e) { return; }
        if (!color) return;
        const p = iso(tile.rx, tile.ry);
        if (typeof color === 'object' && color.r !== undefined) {
          oc.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
        } else if (typeof color === 'number') {
          oc.fillStyle = `rgb(${(color>>16)&0xFF},${(color>>8)&0xFF},${color&0xFF})`;
        } else if (typeof color === 'string') {
          oc.fillStyle = color;
        } else return;
        oc.fillRect(p.x - 0.5, p.y - 0.5, 1.5, 1.5);
      });
    } catch(e) {}
    
    // Ore ağaçları
    try {
      game.updatableObjects.forEach((obj) => {
        if (!obj || !obj.tile) return;
        if ((obj.name || '').includes('TIB')) {
          const p = iso(obj.tile.rx, obj.tile.ry);
          oc.fillStyle = '#cc8800';
          oc.beginPath();
          oc.moveTo(p.x, p.y - 3);
          oc.lineTo(p.x + 3, p.y);
          oc.lineTo(p.x, p.y + 3);
          oc.lineTo(p.x - 3, p.y);
          oc.closePath();
          oc.fill();
        }
      });
    } catch(e) {}
    
    return off;
  }
  
  // ===== RADAR UPDATE =====
  function updateRadar() {
    if (!radarVisible) return;
    let game = window._game;
    if (!game) return;
    
    let bounds;
    try { bounds = game.map.mapBounds.localSize; } catch(e) { return; }
    
    const iso = createIsoTransform(bounds);
    const tick = game.currentTick || 0;
    
    if (!terrainCache || tick - terrainCacheTick > 300) {
      terrainCache = buildTerrainCache(game, iso);
      terrainCacheTick = tick;
    }
    
    ctx.drawImage(terrainCache, 0, 0);
    
    let myName = findMyName(game);
    let allPlayers;
    try { allPlayers = game.getAllPlayers(); } catch(e) { return; }
    let nonNeutral = allPlayers.filter(p => !p.isNeutral);
    const enemyColors = ['#e94560', '#ff6b35', '#ffd700', '#ff00ff'];
    
    nonNeutral.forEach((player, pIdx) => {
      const isMe = player.name === myName;
      try {
        player.getOwnedObjects().forEach(u => {
          if (!u.tile) return;
          const p = iso(u.tile.rx, u.tile.ry);
          
          if (isMe) {
            ctx.fillStyle = '#0f0';
            if (u.isBuilding && u.isBuilding()) {
              ctx.fillRect(p.x - 2, p.y - 2, 5, 5);
            } else {
              ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
            }
          } else {
            const color = enemyColors[pIdx % enemyColors.length];
            ctx.fillStyle = color;
            if (u.isBuilding && u.isBuilding()) {
              ctx.fillRect(p.x - 3, p.y - 3, 7, 7);
              ctx.strokeStyle = 'rgba(255,255,255,0.6)';
              ctx.lineWidth = 0.5;
              ctx.strokeRect(p.x - 3, p.y - 3, 7, 7);
            } else {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
            if (u.name === 'HARV' || u.name === 'CMIN' || (u.rules && u.rules.harvester)) {
              ctx.strokeStyle = '#ff0';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        });
      } catch(e) {}
    });
    
    ctx.font = '9px monospace';
    ctx.fillStyle = '#0f0'; ctx.fillText('■ Me', 4, RADAR_SIZE - 6);
    ctx.fillStyle = '#e94560'; ctx.fillText('● Enemy', 50, RADAR_SIZE - 6);
    ctx.fillStyle = '#ff0'; ctx.fillText('○ Harv', 120, RADAR_SIZE - 6);
    ctx.fillStyle = '#cc8800'; ctx.fillText('◆ Ore', 175, RADAR_SIZE - 6);
  }
  
  // ===== TEXT PANEL =====
  function updatePanel() {
    if (panelMinimized) return;
    let game = window._game;
    if (!game) { content.innerHTML = '<div style="color:#fa0;">⏳ Waiting for game...</div>'; return; }
    
    let allPlayers;
    try { allPlayers = game.getAllPlayers(); } catch(e) { return; }
    let nonNeutral = allPlayers.filter(p => !p.isNeutral);
    if (!nonNeutral.length) return;
    
    let myName = findMyName(game);
    let myPlayer = myName ? (nonNeutral.find(p => p.name === myName) || nonNeutral[0]) : nonNeutral[0];
    if (!myName) myName = myPlayer.name;
    
    let enemies = [], allies = [];
    nonNeutral.forEach(p => {
      if (p.name === myName) return;
      try {
        if (game.areFriendly(myName, p.name)) { allies.push(p); }
        else { enemies.push(p); }
      } catch(e) { enemies.push(p); }
    });
    if (enemies.length === 0 && nonNeutral.length > 1) {
      enemies = nonNeutral.filter(p => p.name !== myName);
      allies = [];
    }
    
    let html = `<div style="color:#0f0;margin-bottom:3px;font-size:12px;">🟢 ${myName} | $${myPlayer.credits}</div>`;
    if (allies.length) {
      html += `<div style="color:#88f;font-size:10px;">👥 Ally: ${allies.map(a => a.name).join(', ')}</div>`;
    }
    
    enemies.forEach((enemy, idx) => {
      let color = ['#e94560','#ff6b35','#ffd700','#ff00ff'][idx % 4];
      html += `<div style="margin-top:5px;padding:4px 6px;border-left:3px solid ${color};background:rgba(255,255,255,0.03);">`;
      html += `<div style="color:${color};font-weight:bold;font-size:11px;">🔍 ${enemy.name} | 💰 $${enemy.credits}</div>`;
      
      try {
        if (enemy.powerTrait) {
          let pw = enemy.powerTrait.power || 0, dr = enemy.powerTrait.drain || 0;
          html += `<div style="color:${pw >= dr ? '#0f0' : '#f00'};">⚡ ${pw}/${dr}${pw < dr ? ' ⚠️ LOW!' : ''}</div>`;
        }
      } catch(e) {}
      
      try {
        if (enemy.production) {
          let anyActive = false;
          for (let [qType, queue] of enemy.production.queues) {
            if (queue.status === QueueStatus.Idle) continue;
            let first = queue.getFirst();
            if (first) {
              anyActive = true;
              let pct = (first.progress * 100).toFixed(0);
              let barLen = Math.floor(first.progress * 12);
              let bar = '█'.repeat(barLen) + '░'.repeat(12 - barLen);
              html += `<div>📦 ${QueueType[qType]}: <span style="color:#ff0;">${first.rules.name}</span> [<span style="color:#0f0;">${bar}</span>] ${pct}%</div>`;
            }
          }
          if (!anyActive) html += `<div style="color:#666;">📦 (idle)</div>`;
        }
      } catch(e) {}
      
      try {
        let enemyUnits = enemy.getOwnedObjects();
        
        let swBuildings = enemyUnits.filter(u => u.superWeaponTrait);
        if (swBuildings.length) {
          html += `<div style="color:#f00;font-weight:bold;">☢️ Super Weapons:</div>`;
          swBuildings.forEach(sw => {
            try {
              let trait = sw.superWeaponTrait;
              let ready = trait.isReady ? trait.isReady() : (trait.ready || false);
              let timer = trait.timer || trait.cooldown || '?';
              html += `<div style="color:${ready ? '#f00' : '#fa0'}"> ${sw.name}: ${ready ? '⚠️ READY!' : 'charging... ' + timer}</div>`;
            } catch(e) { html += `<div style="color:#fa0;"> ${sw.name}</div>`; }
          });
        }
        
        let harvesters = enemyUnits.filter(u =>
          u.name === 'HARV' || u.name === 'CMIN' || u.name === 'CHRONO' ||
          u.harvesterTrait || (u.rules && u.rules.harvester)
        );
        if (harvesters.length) {
          html += `<div style="color:#fa0;">🚜 Harvesters (${harvesters.length}):</div>`;
          harvesters.forEach(h => {
            if (h.tile) html += `<div style="color:#ffa;font-size:10px;"> ${h.name} @ (${h.tile.rx}, ${h.tile.ry})</div>`;
          });
        }
        
        let armyTypes = {}, totalArmy = 0;
        enemyUnits.forEach(u => {
          if (u.isBuilding && u.isBuilding()) return;
          armyTypes[u.name] = (armyTypes[u.name]||0) + 1;
          totalArmy++;
        });
        let sorted = Object.entries(armyTypes).sort((a,b) => b[1]-a[1]);
        html += `<div style="color:#aaa;font-size:10px;">⚔️(${totalArmy}) ${sorted.map(([k,v])=>`${k}x${v}`).join(', ')}</div>`;
        
        let buildTypes = {};
        enemyUnits.forEach(u => {
          if (u.isBuilding && u.isBuilding()) buildTypes[u.name] = (buildTypes[u.name]||0) + 1;
        });
        html += `<div style="color:#aaa;font-size:10px;">🏗️(${Object.values(buildTypes).reduce((a,b)=>a+b,0)}) ${Object.entries(buildTypes).map(([k,v])=>`${k}x${v}`).join(', ')}</div>`;
        
      } catch(e) {}
      
      try {
        let myBuildings = myPlayer.getOwnedObjects().filter(u => u.isBuilding && u.isBuilding());
        if (myBuildings.length) {
          let base = myBuildings[0].tile;
          let enemyUnits = enemy.getOwnedObjects();
          let nearby = enemyUnits.filter(u => {
            if (!u.tile || (u.isBuilding && u.isBuilding())) return false;
            return Math.sqrt((u.tile.rx-base.rx)**2 + (u.tile.ry-base.ry)**2) < 30;
          });
          if (nearby.length > 0) {
            let tt = {};
            nearby.forEach(u => { tt[u.name]=(tt[u.name]||0)+1; });
            html += `<div style="padding:2px 4px;background:#600;border:1px solid #f00;border-radius:3px;margin-top:2px;">`;
            html += `<span style="color:#f00;font-weight:bold;">🚨 ${nearby.length} NEAR BASE!</span> `;
            html += `<span style="color:#faa;font-size:10px;">${Object.entries(tt).map(([k,v])=>`${k}x${v}`).join(' ')}</span></div>`;
          }
        }
      } catch(e) {}
      
      html += `</div>`;
    });
    
    content.innerHTML = html;
    updateRadar();
  }
  
  window._spyInterval = setInterval(updatePanel, 500);
  console.log('[SPY] ✓ Panel + Radar v3. Full-size 45° iso map.');
})();
