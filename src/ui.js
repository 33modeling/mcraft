// Heads-up display: Minecraft-style hotbar, creative inventory and F3 debug.

import { HOTBAR, INVENTORY, BLOCKS, textureForFace } from './blocks.js';

export class UI {
  constructor(atlas) {
    this.atlas = atlas;
    this.selected = 0;
    this.slotBlocks = HOTBAR.slice(); // mutable: inventory can reassign slots
    this.hotbarEl = document.getElementById('hotbar');
    this.debugEl = document.getElementById('debug');
    this.inventoryEl = document.getElementById('inventory');
    this.slots = [];

    this._buildHotbar();
    this._buildInventory();
    this.selectSlot(0);
  }

  _buildHotbar() {
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    this.slotBlocks.forEach((blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const icon = this.atlas.iconCanvas(textureForFace(blockId, 'side'), 44);
      icon.className = 'icon';
      slot.appendChild(icon);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      slot.appendChild(num);
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    });
  }

  _buildInventory() {
    if (!this.inventoryEl) return;
    const grid = this.inventoryEl.querySelector('.inv-grid');
    grid.innerHTML = '';
    INVENTORY.forEach((blockId) => {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.title = BLOCKS[blockId].name;
      const icon = this.atlas.iconCanvas(textureForFace(blockId, 'side'), 40);
      icon.className = 'icon';
      cell.appendChild(icon);
      cell.addEventListener('click', () => {
        this.setSlotBlock(this.selected, blockId);
      });
      grid.appendChild(cell);
    });
  }

  setSlotBlock(slotIndex, blockId) {
    this.slotBlocks[slotIndex] = blockId;
    const slot = this.slots[slotIndex];
    const old = slot.querySelector('.icon');
    const icon = this.atlas.iconCanvas(textureForFace(blockId, 'side'), 44);
    icon.className = 'icon';
    slot.replaceChild(icon, old);
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

  updateDebug(info) {
    if (!this.debugEl) return;
    const p = info.position;
    const facing = ['north (-Z)', 'west (-X)', 'south (+Z)', 'east (+X)'];
    const yawDeg = ((info.yaw * 180) / Math.PI) % 360;
    const dirIdx = (Math.round(yawDeg / 90) % 4 + 4) % 4;
    const lines = [
      `MCraft (web) — ${info.fps} fps`,
      `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`,
      `Chunk: ${info.chunkX}, ${info.chunkZ}  (${info.loadedChunks} loaded)`,
      `Facing: ${facing[dirIdx]}`,
      `Mode: ${info.flying ? 'fly (creative)' : info.onGround ? 'walk' : 'fall'}`,
    ];
    if (info.looking) lines.push(`Targeted: ${info.looking}`);
    this.debugEl.textContent = lines.join('\n');
  }
}
