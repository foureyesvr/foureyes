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

test('the media browser opens straight ahead in the turned layout, not where the headset started', async () => {
  const r = await app.run(() => {
    const F = window.FourEyes, T = window.T, V = F.THREE.Vector3;
    T.reset('4arc', 1.6); T.fakeAll(1920, 1080);
    const cam = F.camera;
    cam.position.set(0.9, 1.25, -0.6); cam.rotation.set(-0.3, 1.1, 0, 'YXZ'); // turned left, looking a bit down
    F.centreOnHead(); F.arrange();
    cam.rotation.set(0, 1.6, 0, 'YXZ'); // now looking further left, at the end screen
    F.openBrowser(0); F.panel.updateMatrixWorld(true);
    const head = cam.position.clone(), fwd = new V(-Math.sin(1.1), 0, -Math.cos(1.1));
    const to = F.panel.position.clone().sub(head); to.y = 0;
    const n = new V(0, 0, 1).transformDirection(F.panel.matrixWorld); n.y = 0;
    const back = head.clone().sub(F.panel.position); back.y = 0;
    const out = { off: to.angleTo(fwd) * 180 / Math.PI, faces: n.normalize().angleTo(back.normalize()) * 180 / Math.PI };
    F.closeBrowser(); cam.position.set(0, 1.6, 0); cam.rotation.set(0, 0, 0); F.world.position.set(0, 0, 0); F.world.rotation.set(0, 0, 0);
    return out;
  });
  assert.ok(r.off < 0.5, `the browser opened ${r.off.toFixed(1)}° away from the middle of the layout`);
  assert.ok(r.faces < 1, `the browser is turned ${r.faces.toFixed(1)}° away from you`);
});

test('recentring from the headset is noticed by the jump it causes, even without a reset event', async () => {
  const r = await app.run(() => {
    const F = window.FourEyes, cam = F.camera, out = {};
    const step = (yaw, x = 0, pitch = 0) => { cam.position.set(x, 1.6, 0); cam.rotation.set(pitch, yaw, 0, 'YXZ'); return F.watchRecentre(1000, true); };
    F.watchRecentre(0, false); // not in VR: starts fresh
    step(1.2); out.turnHead = [step(1.25), step(1.32), step(1.4)].some(Boolean); // turning your head quickly is not a recentre
    out.recentre = step(0); out.due = F.recentreDue() > 0; // the view snapping back to straight ahead is
    out.moved = (step(0, 0), step(0, 0.6)); // and so is the origin jumping 60 cm
    out.lookDown = (step(0.2, 0, -1.55), step(2.5, 0, -1.55)); // looking straight down, the turn means nothing
    F.watchRecentre(0, false); cam.position.set(0, 1.6, 0); cam.rotation.set(0, 0, 0);
    return out;
  });
  assert.equal(r.turnHead, false);
  assert.equal(r.recentre, true);
  assert.equal(r.due, true, 'a recentre is scheduled');
  assert.equal(r.moved, true);
  assert.equal(r.lookDown, false);
});
