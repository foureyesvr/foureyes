import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './helpers.mjs';

let app;
before(async () => { app = await openApp(); });
after(async () => { await app?.close(); });

// Where the screens end up when you enter VR away from the headset's starting point, turned to one
// side: they should be centred on your head and straight ahead of where you look.
for (const layout of ['1', '2', '4arc', '4grid']) {
  test(`${layout}: screens centre on your head and face the way you look, wherever the headset started`, async () => {
    const r = await app.run((layout) => {
      const F = window.FourEyes, T = window.T, V = F.THREE.Vector3;
      T.reset(layout, 1.6); T.fakeAll(1920, 1080);
      const cam = F.camera;
      cam.position.set(0.9, 1.25, -0.6); cam.rotation.set(-0.3, 1.1, 0, 'YXZ'); // seated, off to one side, turned left, looking a bit down
      F.centreOnHead(); F.arrange(); F.world.updateMatrixWorld(true);
      const head = cam.position.clone();
      const fwd = new V(-Math.sin(1.1), 0, -Math.cos(1.1)); // where you face, ignoring the look down
      const pts = F.visible().map(s => s.group.getWorldPosition(new V()));
      const mid = pts.reduce((a, p) => a.add(p), new V()).divideScalar(pts.length).sub(head);
      const flat = new V(mid.x, 0, mid.z);
      const faces = F.visible().map(s => { // the screen's front (+z) should point back at your eyes, sideways
        const n = new V(0, 0, 1).transformDirection(s.group.matrixWorld);
        const toEye = head.clone().sub(s.group.getWorldPosition(new V())); toEye.y = 0; n.y = 0;
        return n.normalize().angleTo(toEye.normalize()) * 180 / Math.PI;
      });
      const dist = F.visible().map(s => { const p = s.group.getWorldPosition(new V()).sub(head); return Math.hypot(p.x, p.z); });
      const out = { eye: F.eyeY(), offAxis: flat.angleTo(fwd) * 180 / Math.PI, faces, dist };
      cam.position.set(0, 1.6, 0); cam.rotation.set(0, 0, 0); F.world.position.set(0, 0, 0); F.world.rotation.set(0, 0, 0);
      return out;
    }, layout);
    assert.ok(Math.abs(r.eye - 1.25) < 1e-6, 'eye height measured from the head');
    assert.ok(r.offAxis < 0.5, `the screens are ${r.offAxis.toFixed(2)}° off straight ahead`);
    for (const a of r.faces) assert.ok(a < 1, `a screen is turned ${a.toFixed(2)}° away from you`);
    const spread = Math.max(...r.dist) - Math.min(...r.dist);
    assert.ok(spread < 0.05, `screens aren't the same distance away (${spread.toFixed(3)} m)`);
  });
}
