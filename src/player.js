// Player: camera rig, look controls (pointer lock) and keyboard movement state.
// Actual movement + collision lives in physics.js; this module only tracks
// intent (which keys are down) and orientation (yaw/pitch).

import * as THREE from 'three';
import { PLAYER_EYE } from './constants.js';

const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.01;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, 80, 0); // feet position
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;   // rotation around Y, radians
    this.pitch = 0; // rotation around X, radians
    this.onGround = false;
    this.flying = false;

    this.keys = {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      sneak: false,
      sprint: false,
    };

    this._onFlyToggle = null; // optional callback when fly mode toggles
  }

  initControls(domElement) {
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== domElement) return;
      this.yaw -= e.movementX * LOOK_SENSITIVITY;
      this.pitch -= e.movementY * LOOK_SENSITIVITY;
      if (this.pitch > MAX_PITCH) this.pitch = MAX_PITCH;
      if (this.pitch < -MAX_PITCH) this.pitch = -MAX_PITCH;
    });
  }

  _onKey(e, down) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = down;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.back = down;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = down;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = down;
        break;
      case 'Space':
        this.keys.jump = down;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sneak = down;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.keys.sprint = down;
        break;
      case 'KeyF':
        if (down) this.toggleFly();
        break;
      default:
        return;
    }
    // Prevent the page from scrolling on space / arrows while playing.
    if (document.pointerLockElement) e.preventDefault();
  }

  toggleFly() {
    this.flying = !this.flying;
    this.velocity.y = 0;
    if (this._onFlyToggle) this._onFlyToggle(this.flying);
  }

  // Horizontal forward/right unit directions derived from yaw (ignores pitch).
  getHorizontalBasis(forward, right) {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  updateCamera() {
    this.camera.position.set(this.position.x, this.position.y + PLAYER_EYE, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }
}
