import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';

/**
 * SplitView360 — shows Left (-90°) | Center (0°) | Right (+90°) of a 360 video
 * using a SINGLE Three.js WebGL renderer with scissored viewports.
 * One video element, one WebGL context, three camera angles — no black-screen issues.
 */
const SplitView360 = forwardRef(function SplitView360(
  {
    videoUrl,
    isAdmin,
    is360 = true,
    hideBigPlayButton = false,
    remoteTime,
    remotePlaying,
    remoteSpherical,
    onPlay,
    onPause,
    onSeek,
    onSphericalChange,
    syncThresholdSec = 2,
  },
  ref
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const camerasRef = useRef([]); // [left, center, right]
  const textureRef = useRef(null);
  const rafRef = useRef(null);
  const resizeObserverRef = useRef(null);

  // Master yaw offset for the center camera (driven by drag / remoteSpherical)
  const yawRef = useRef(0);   // radians — center camera longitude
  const pitchRef = useRef(0); // radians — center camera latitude

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  // Track last drag position
  const dragRef = useRef({ active: false, x: 0, y: 0 });

  // Expose getInternalPlayer so Room.jsx heartbeat works
  // Room.jsx calls player.getCurrentTime() (videojs style), so we shim it
  useImperativeHandle(ref, () => ({
    getInternalPlayer: () => {
      const video = videoRef.current;
      if (!video) return null;
      return {
        getCurrentTime: () => video.currentTime,
        currentTime: () => video.currentTime,
        paused: () => video.paused,
      };
    },
  }));

  // ─── Three.js Setup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    // Video element
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.display = 'none';
    document.body.appendChild(video);
    videoRef.current = video;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    rendererRef.current = renderer;

    // Scene + texture
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBFormat;
    textureRef.current = texture;

    // Sphere (inward-facing normals for 360 equirectangular)
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // flip normals inward
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Three cameras: left(-90°), center(0°), right(+90°)
    const HALF_PI = Math.PI / 2;
    const cameras = [-HALF_PI, 0, HALF_PI].map((yawOffset) => {
      const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
      cam.userData.yawOffset = yawOffset;
      return cam;
    });
    camerasRef.current = cameras;

    // Resize handling
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      const panelW = Math.floor(w / 3);
      cameras.forEach((cam) => {
        cam.aspect = panelW / h;
        cam.updateProjectionMatrix();
      });
    };
    onResize();
    resizeObserverRef.current = new ResizeObserver(onResize);
    resizeObserverRef.current.observe(container);

    // Camera orientation helper
    const updateCameraOrientation = (cam, centerYaw, centerPitch) => {
      const totalYaw = centerYaw + cam.userData.yawOffset;
      const euler = new THREE.Euler(centerPitch, totalYaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(euler);
    };

    // Render loop
    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      if (texture.image.readyState >= 2) {
        texture.needsUpdate = true;
      }

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      const panelW = Math.floor(w / 3);
      renderer.setSize(w, h, false);

      renderer.clear();
      cameras.forEach((cam, i) => {
        updateCameraOrientation(cam, yawRef.current, pitchRef.current);
        const x = i * panelW;
        renderer.setScissorTest(true);
        renderer.setScissor(x, 0, panelW, h);
        renderer.setViewport(x, 0, panelW, h);
        renderer.render(scene, cam);
      });
    };
    render();

    // Video events
    const onLoaded = () => setDuration(video.duration || 0);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlayEvt = () => {
      setIsPlaying(true);
      if (isAdmin) onPlay?.(video.currentTime);
    };
    const onPauseEvt = () => {
      setIsPlaying(false);
      if (isAdmin) onPause?.(video.currentTime);
    };
    const onSeekedEvt = () => {
      if (isAdmin) onSeek?.(video.currentTime);
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlayEvt);
    video.addEventListener('pause', onPauseEvt);
    video.addEventListener('seeked', onSeekedEvt);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserverRef.current?.disconnect();
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlayEvt);
      video.removeEventListener('pause', onPauseEvt);
      video.removeEventListener('seeked', onSeekedEvt);
      video.pause();
      video.src = '';
      document.body.removeChild(video);
      texture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      videoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load video URL ────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    video.src = videoUrl;
    video.load();
  }, [videoUrl]);

  // ─── Sync play state (non-admin) ───────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isAdmin) return;

    const diff = Math.abs(video.currentTime - (remoteTime ?? 0));
    if (diff > syncThresholdSec) {
      video.currentTime = remoteTime ?? 0;
    }

    if (remotePlaying && video.paused) {
      video.play().catch(() => { });
    } else if (!remotePlaying && !video.paused) {
      video.pause();
    }
  }, [remoteTime, remotePlaying, isAdmin, syncThresholdSec]);

  // ─── Sync camera angle (non-admin) ────────────────────────────────────────
  useEffect(() => {
    if (isAdmin || !remoteSpherical) return;
    if (typeof remoteSpherical.yaw === 'number') yawRef.current = remoteSpherical.yaw;
    if (typeof remoteSpherical.pitch === 'number') pitchRef.current = remoteSpherical.pitch;
  }, [isAdmin, remoteSpherical]);

  // ─── Drag to look (center panel only) — admin controls camera ─────────────
  const handlePointerDown = useCallback((e) => {
    if (!isAdmin) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
  }, [isAdmin]);

  const handlePointerMove = useCallback((e) => {
    if (!isAdmin || !dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    yawRef.current += dx * 0.005;
    pitchRef.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchRef.current - dy * 0.005));
    onSphericalChange?.({ yaw: yawRef.current, pitch: pitchRef.current });
  }, [isAdmin, onSphericalChange]);

  const handlePointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  // ─── Play / Pause toggle ─────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isAdmin) return;
    if (video.paused) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }
  }, [isAdmin]);

  // ─── Seek slider ──────────────────────────────────────────────────────────
  const handleSeekChange = useCallback((e) => {
    const video = videoRef.current;
    if (!video || !isAdmin) return;
    video.currentTime = Number(e.target.value);
  }, [isAdmin]);

  // ─── Mute toggle ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const fmt = (s) => {
    const t = Math.floor(s || 0);
    const m = Math.floor(t / 60);
    const sec = String(t % 60).padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Single shared canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* Panel labels */}
      <span className="absolute top-2 left-[2%] z-30 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded pointer-events-none select-none">
        ← Left (-90°)
      </span>
      <span className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded pointer-events-none select-none">
        Center
      </span>
      <span className="absolute top-2 right-[2%] z-30 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded pointer-events-none select-none">
        Right (+90°) →
      </span>

      {/* Dividers */}
      <div className="absolute inset-y-0 pointer-events-none" style={{ left: '33.33%', width: 1, background: 'rgba(255,255,255,0.2)' }} />
      <div className="absolute inset-y-0 pointer-events-none" style={{ left: '66.66%', width: 1, background: 'rgba(255,255,255,0.2)' }} />

      {/* Controls bar (admin only) */}
      {isAdmin && (
        <div
          className="absolute bottom-0 left-0 right-0 z-40 flex items-center gap-3 px-4 py-2 bg-black/70"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
        >
          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="text-white hover:text-gray-300 transition-colors text-sm font-mono w-8 text-center shrink-0"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Time */}
          <span className="text-white text-xs font-mono shrink-0">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeekChange}
            className="flex-1 accent-white h-1 cursor-pointer"
          />

          {/* Mute */}
          <button
            type="button"
            onClick={toggleMute}
            className="text-white hover:text-gray-300 transition-colors text-sm shrink-0"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      )}

      {/* No-video placeholder */}
      {!videoUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
          {isAdmin ? 'Select a 360° video from the dropdown above.' : 'Waiting for host to load a video…'}
        </div>
      )}
    </div>
  );
});

export default SplitView360;
