// Heads-up display: hotbar (with counts + tool durability), inventory, crafting,
// F3 debug, and the survival HUD (hearts + hunger).

import { HOTBAR, INVENTORY } from './blocks.js';
import { RECIPES, ITEM_INVENTORY, stackTexture, stackName, isTool, itemDef } from './itemdefs.js';

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x + s / 2, y + s * 0.85);
  ctx.bezierCurveTo(x + s * 1.05, y + s * 0.42, x + s * 0.72, y - s * 0.05, x + s / 2, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.28, y - s * 0.05, x - s * 0.05, y + s * 0.42, x + s / 2, y + s * 0.85);
  ctx.closePath();
}

function drumstickPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x + s * 0.42, y + s * 0.42, s * 0.36, 0, Math.PI * 2);
  ctx.closePath();
}

export class UI {
  constructor(atlas) {
    this.atlas = atlas;
    this.selected = 0;
    this.slotBlocks = HOTBAR.slice();
    this.survival = false;
    this.onCraft = null;

    this.hotbarEl = document.getElementById('hotbar');
    this.debugEl = document.getElementById('debug');
    this.inventoryEl = document.getElementById('inventory');
    this.hudEl = document.getElementById('hud');
    this.modehintEl = document.getElementById('modehint');
    this.heartsCtx = document.getElementById('hearts').getContext('2d');
    this.hungerCtx = document.getElementById('hunger').getContext('2d');
    this.slots = [];
    this.counts = [];
    this.durbars = [];

    this._buildHotbar();
    this._buildInventory();
    this._buildCrafting();
    this.selectSlot(0);
  }

  _icon(stackId, px) {
    const icon = this.atlas.iconCanvas(stackTexture(stackId), px);
    icon.className = 'icon';
    return icon;
  }

  _buildHotbar() {
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    this.counts = [];
    this.durbars = [];
    this.slotBlocks.forEach((stackId, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.appendChild(this._icon(stackId, 44));
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      slot.appendChild(num);
      const count = document.createElement('span');
      count.className = 'count';
      slot.appendChild(count);
      const dur = document.createElement('span');
      dur.className = 'durbar';
      slot.appendChild(dur);
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
      this.counts.push(count);
      this.durbars.push(dur);
    });
  }

  _buildInventory() {
    if (!this.inventoryEl) return;
    const grid = this.inventoryEl.querySelector('.inv-grid');
    grid.innerHTML = '';
    [...INVENTORY, ...ITEM_INVENTORY].forEach((stackId) => {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.title = stackName(stackId);
      cell.appendChild(this._icon(stackId, 40));
      cell.addEventListener('click', () => this.setSlotBlock(this.selected, stackId));
      grid.appendChild(cell);
    });
  }

  _buildCrafting() {
    if (!this.inventoryEl) return;
    const list = this.inventoryEl.querySelector('.craft-list');
    list.innerHTML = '';
    this.craftRows = [];
    RECIPES.forEach((recipe, index) => {
      const row = document.createElement('div');
      row.className = 'craft-recipe';
      row.appendChild(this._icon(recipe.out.id, 24));
      const label = document.createElement('span');
      const ins = recipe.in.map((r) => `${r.n} ${stackName(r.id)}`).join(' + ');
      label.textContent = `${recipe.out.n} ${recipe.name}  ←  ${ins}`;
      row.appendChild(label);
      row.addEventListener('click', () => {
        if (!row.classList.contains('disabled') && this.onCraft) this.onCraft(index);
      });
      list.appendChild(row);
      this.craftRows.push(row);
    });
  }

  refreshCrafting(getCount) {
    if (!this.craftRows) return;
    RECIPES.forEach((recipe, i) => {
      const ok = recipe.in.every((r) => getCount(r.id) >= r.n);
      this.craftRows[i].classList.toggle('disabled', !ok);
    });
  }

  setSlotBlock(slotIndex, stackId) {
    this.slotBlocks[slotIndex] = stackId;
    const slot = this.slots[slotIndex];
    const old = slot.querySelector('.icon');
    slot.replaceChild(this._icon(stackId, 44), old);
  }

  selectSlot(i) {
    this.selected = ((i % this.slots.length) + this.slots.length) % this.slots.length;
    this.slots.forEach((s, idx) => s.classList.toggle('active', idx === this.selected));
  }

  cycle(dir) {
    this.selectSlot(this.selected + (dir > 0 ? 1 : -1));
  }

  getSelectedBlock() {
    return this.slotBlocks[this.selected];
  }

  setInventoryOpen(open) {
    if (this.inventoryEl) this.inventoryEl.classList.toggle('hidden', !open);
  }

  setMode(survival) {
    this.survival = survival;
    this.hudEl.classList.toggle('hidden', !survival);
    this.modehintEl.textContent = survival ? 'Survival (G)' : 'Creative (G)';
    const craftTitle = this.inventoryEl && this.inventoryEl.querySelector('.craft-title');
    const craftList = this.inventoryEl && this.inventoryEl.querySelector('.craft-list');
    if (craftTitle) craftTitle.style.display = survival ? '' : 'none';
    if (craftList) craftList.style.display = survival ? '' : 'none';
  }

  // Hotbar counts + tool durability bars (survival only).
  updateHotbar(getCount, getDurability) {
    this.counts.forEach((el, i) => {
      const stackId = this.slotBlocks[i];
      if (!this.survival) {
        el.textContent = '';
        this.durbars[i].style.display = 'none';
        return;
      }
      const n = getCount(stackId);
      el.textContent = n > 0 ? String(n) : '0';
      el.style.color = n > 0 ? '#fff' : '#e06a6a';

      const bar = this.durbars[i];
      if (isTool(stackId) && n > 0) {
        const d = getDurability(stackId);
        const max = itemDef(stackId).durability;
        if (d < max) {
          const frac = Math.max(0, d / max);
          bar.style.display = 'block';
          bar.style.width = Math.round(frac * 100) + '%';
          bar.style.background = `hsl(${Math.round(frac * 120)},80%,45%)`;
        } else {
          bar.style.display = 'none';
        }
      } else {
        bar.style.display = 'none';
      }
    });
  }

  updateHUD(health, hunger) {
    if (!this.survival) return;
    this._drawIcons(this.heartsCtx, health, '#d63a31', '#3a0d0a', heartPath);
    this._drawIcons(this.hungerCtx, hunger, '#c8822e', '#2e1d0a', drumstickPath);
  }

  _drawIcons(ctx, value, fill, empty, pathFn) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const s = 16;
    const gap = 5;
    for (let i = 0; i < 10; i++) {
      const x = i * (s + gap) + 1;
      const y = 1;
      pathFn(ctx, x, y, s);
      ctx.fillStyle = empty;
      ctx.fill();
      const units = value - i * 2;
      if (units <= 0) continue;
      if (units >= 2) {
        pathFn(ctx, x, y, s);
        ctx.fillStyle = fill;
        ctx.fill();
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, s / 2, H);
        ctx.clip();
        pathFn(ctx, x, y, s);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  updateDebug(info) {
    if (!this.debugEl) return;
    const p = info.position;
    const facing = ['north (-Z)', 'west (-X)', 'south (+Z)', 'east (+X)'];
    const yawDeg = ((info.yaw * 180) / Math.PI) % 360;
    const dirIdx = ((Math.round(yawDeg / 90) % 4) + 4) % 4;
    const lines = [
      `MCraft (web) — ${info.fps} fps`,
      `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`,
      `Chunk: ${info.chunkX}, ${info.chunkZ}  (${info.loadedChunks} loaded)`,
      `Facing: ${facing[dirIdx]}`,
      `Mode: ${info.gameMode}${info.flying ? ' (flying)' : info.onGround ? ' walk' : ' fall'}`,
    ];
    if (info.time !== undefined) {
      const h = Math.floor(info.time * 24);
      const m = Math.floor((info.time * 24 - h) * 60);
      lines.push(`Time: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    if (info.mobs !== undefined) lines.push(`Mobs: ${info.mobs}`);
    if (info.held) lines.push(`Held: ${info.held}`);
    if (info.looking) lines.push(`Targeted: ${info.looking}`);
    this.debugEl.textContent = lines.join('\n');
  }
}
