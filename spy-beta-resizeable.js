(function() {
  if (window._spyInterval) clearInterval(window._spyInterval);
  if (document.getElementById('spy-panel')) document.getElementById('spy-panel').remove();
  
  let lsMod = System._loader.modules['https://dos.zone/chronodivide/v17/network/gamestate/LockstepManager'];
  let LS = lsMod.module.LockstepManager;
  let pqMod = System._loader.modules['https://dos.zone/chronodivide/v17/game/player/production/ProductionQueue'];
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
  
  let panel = document.createElement('div');
  panel.id = 'spy-panel';
  panel.style.cssText = `
    position:fixed; top:10px; left:10px; z-index:999999;
    background:rgba(10,10,30,0.92); border:2px solid #e94560;
    border-radius:8px; padding:0; font-family:monospace;
    color:#fff; font-size:11px; width:300px;
    text-shadow: 1px 1px 2px #000; max-height:90vh; overflow-y:auto;
    transform-origin: top left;
  `;
  
  // Toolbar
  let toolbar = document.createElement('div');
  toolbar.style.cssText = `
    display:flex; justify-content:space-between; align-items:center;
    padding:3px 8px; background:rgba(233,69,96,0.3); border-bottom:1px solid #e94560;
    cursor:move; user-select:none; border-radius:6px 6px 0 0;
  `;
  toolbar.innerHTML = `
    <span style="color:#e94560;font-weight:bold;font-size:10px;">SPY PANEL</span>
    <div>
      <button id="spy-minus" style="background:none;border:1px solid #888;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:12px;">−</button>
      <button id="spy-plus" style="background:none;border:1px solid #888;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:12px;">+</button>
      <button id="spy-mini" style="background:none;border:1px solid #888;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;margin:0 2px;font-size:12px;">_</button>
    </div>
  `;
  panel.appendChild(toolbar);
  
  // Content
  let content = document.createElement('div');
  content.id = 'spy-content';
  content.style.cssText = 'padding:8px 10px; pointer-events:none;';
  content.innerHTML = '<div style="color:#fa0;">⏳ Waiting for game...</div>';
  panel.appendChild(content);
  
  document.body.appendChild(panel);
  
  // Buton eventleri
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
    document.getElementById('spy-mini').textContent = panelMinimized ? '□' : '_';
  };
  
  // Drag
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
  
  // Benim player'ımı bul
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
  }
  
  window._spyInterval = setInterval(updatePanel, 500);
  console.log('[SPY] ✓ Panel with resize/minimize/drag. Use +/- to scale, _ to minimize.');
})();
