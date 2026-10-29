import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type View = 'side' | 'front';
type ModelStatus = 'loading' | 'ready' | 'error';

/** Loaded only after the user requests the one licensed demonstration. */
export default function ExerciseModel3D() {
  const stageRef = useRef<HTMLDivElement>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [view, setView] = useState<View>('side');
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [status, setStatus] = useState<ModelStatus>('loading');
  const playingRef = useRef(playing);
  const viewRef = useRef(view);
  const speedRef = useRef(speed);
  playingRef.current = playing;
  viewRef.current = view;
  speedRef.current = speed;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setStatus('error');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x101814, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 20);
    scene.add(new THREE.HemisphereLight(0xf5fff7, 0x40564b, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9ecaa, 1);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    let alive = true;
    let inView = true;
    let frame = 0;
    let lastTime = 0;
    let mixer: THREE.AnimationMixer | null = null;
    let model: THREE.Object3D | null = null;
    let cameraDistance = 3.1;
    let floor: THREE.Mesh | null = null;
    const abort = new AbortController();

    function draw(time: number) {
      frame = 0;
      if (!alive || document.hidden || !inView) { lastTime = 0; return; }
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.08) : 0;
      lastTime = time;
      if (playingRef.current) mixer?.update(delta * speedRef.current);
      const side = viewRef.current === 'side';
      camera.position.set(side ? cameraDistance : 0.01, cameraDistance * 0.32, side ? 0.01 : cameraDistance);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (playingRef.current && mixer) frame = requestAnimationFrame(draw);
      else lastTime = 0;
    }
    function requestDraw() {
      if (alive && !frame) frame = requestAnimationFrame(draw);
    }
    redrawRef.current = requestDraw;
    function resize() {
      const width = stage!.clientWidth;
      const height = stage!.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestDraw();
    }
    function onVisibility() { lastTime = 0; requestDraw(); }
    function onContextLost(event: Event) {
      event.preventDefault();
      playingRef.current = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (alive) { setPlaying(false); setStatus('error'); }
    }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibility);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(stage);
    if (!resizeObserver) window.addEventListener('resize', resize);
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      lastTime = 0;
      if (inView) requestDraw();
    });
    intersection?.observe(stage);
    resize();

    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}models/push-up-3f77e479.glb`, { signal: abort.signal });
        if (!response.ok) throw new Error('Model unavailable');
        const buffer = await response.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        if (!alive) return;
        if (!gltf.animations.length) throw new Error('Model has no animation');
        model = gltf.scene;
        // Neutral material avoids suggesting that the original painted regions are measured activation.
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const old = Array.isArray(object.material) ? object.material : [object.material];
          old.forEach((material) => material.dispose());
          object.material = new THREE.MeshStandardMaterial({ color: 0xc3d0c7, roughness: 0.75, metalness: 0.05 });
        });
        scene.add(model);
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(gltf.animations[0]!).play();
        mixer.update(0);
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model, true);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        model.position.sub(center);
        cameraDistance = Math.max(2.2, Math.max(size.x, size.y, size.z) * 1.65);
        floor = new THREE.Mesh(
          new THREE.CircleGeometry(1.7, 48),
          new THREE.MeshBasicMaterial({ color: 0x709a72, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = bounds.min.y - center.y - 0.02;
        scene.add(floor);
        setStatus('ready');
        requestDraw();
      } catch {
        if (alive && !abort.signal.aborted) setStatus('error');
      }
    })();

    return () => {
      alive = false;
      abort.abort();
      redrawRef.current = null;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      mixer?.stopAllAction();
      if (model) {
        mixer?.uncacheRoot(model);
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        });
      }
      if (floor) { floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { redrawRef.current?.(); }, [playing, view, speed]);

  return (
    <div className="exercise-3d__player">
      <div className="exercise-3d__stage" ref={stageRef}>
        {status === 'loading' && <p className="exercise-3d__message" role="status">در حال دریافت مدل سه‌بعدی…</p>}
        {status === 'error' && <p className="exercise-3d__message" role="alert">نمای سه‌بعدی در دسترس نیست. تصویرهای حرکت پایین صفحه همچنان قابل استفاده‌اند.</p>}
      </div>
      <div className="exercise-3d__controls" role="group" aria-label="کنترل نمایش سه‌بعدی">
        <button type="button" className="button button--secondary button--small" disabled={status !== 'ready'} onClick={() => setPlaying((value) => !value)}>
          {playing ? <><Pause size={15} /> توقف حرکت</> : <><Play size={15} /> پخش حرکت</>}
        </button>
        <button type="button" className="button button--ghost button--small" disabled={status !== 'ready'} onClick={() => setView((value) => value === 'side' ? 'front' : 'side')}>
          <RotateCcw size={15} /> {view === 'side' ? 'نمای روبه‌رو' : 'نمای کنار'}
        </button>
        <button type="button" className="button button--ghost button--small" disabled={status !== 'ready'} onClick={() => setSpeed((value) => value === 1 ? 0.5 : 1)}>
          سرعت {speed === 1 ? 'عادی' : 'نیمه'}
        </button>
      </div>
    </div>
  );
}
