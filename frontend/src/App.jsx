import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

// ---------------------------------------------------------
// Helper: Load Three.js safely once globally
// ---------------------------------------------------------
const loadThreeScripts = async () => {
  const loadScript = (src, globalVar) => {
    return new Promise((resolve) => {
      if (window[globalVar]) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      document.head.appendChild(s);
    });
  };

  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", "THREE");
  await loadScript("https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/OBJLoader.js", "OBJLoader");
  await loadScript("https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/controls/OrbitControls.js", "OrbitControls");
};

// Helper: Material view mode applicator
const applyMaterialViewMode = (engine, viewMode) => {
  if (!engine.mesh) return;

  engine.mesh.traverse((child) => {
    if (!child.isMesh) return;

    if (viewMode === 'wireframe') {
      child.material = new window.THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true });
    } else if (viewMode === 'heatmap') {
      const count = child.geometry.attributes.position.count;
      const colors = [];
      const normals = child.geometry.attributes.normal.array;

      for (let i = 0; i < count; i++) {
        const ny = Math.abs(normals[i * 3 + 1]); 
        if (ny < 0.6) colors.push(1.0, 0.2, 0.2); // Steep
        else if (ny < 0.85) colors.push(1.0, 1.0, 0.0); // Moderate
        else colors.push(0.5, 1.0, 0.5); // Flat
      }
      child.geometry.setAttribute('color', new window.THREE.Float32BufferAttribute(colors, 3));
      child.material = new window.THREE.MeshStandardMaterial({
        map: engine.activeTexture,
        vertexColors: true,
        roughness: 0.9,
        side: window.THREE.DoubleSide
      });
    } else {
      child.material = new window.THREE.MeshStandardMaterial({
        map: engine.activeTexture,
        roughness: 0.9,
        side: window.THREE.DoubleSide
      });
    }
  });
};

// ---------------------------------------------------------
// Optimized 3D Viewer Component
// ---------------------------------------------------------
function TerrainViewer({ objUrl, textureUrl, viewMode, heightElevation }) {
  const mountRef = useRef(null);
  const engineRef = useRef({});
  const [isReady, setIsReady] = useState(false);

  // 1. Initialize WebGL Engine
  useEffect(() => {
    let isMounted = true;
    
    const initEngine = async () => {
      await loadThreeScripts();
      if (!isMounted || !mountRef.current) return;

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      const scene = new window.THREE.Scene();
      scene.background = new window.THREE.Color(0x0a0f1d);

      const camera = new window.THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
      camera.position.set(0, 14, 20);

      const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = window.THREE.sRGBEncoding;
      renderer.toneMapping = window.THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(renderer.domElement);

      const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      const hemiLight = new window.THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
      hemiLight.position.set(0, 50, 0);
      scene.add(hemiLight);

      const dirLight = new window.THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(20, 40, 20);
      scene.add(dirLight);

      engineRef.current = { scene, camera, renderer, controls, mesh: null, activeTexture: null };

      const animate = () => {
        if (!isMounted) return;
        engineRef.current.animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      if (isMounted) setIsReady(true);
    };

    initEngine();

    return () => {
      isMounted = false;
      if (engineRef.current.animId) cancelAnimationFrame(engineRef.current.animId);
      if (engineRef.current.renderer) engineRef.current.renderer.dispose();
    };
  }, []);

  // 2. Load / Hot-Swap Mesh & Texture (Runs instantly as soon as isReady is true)
  useEffect(() => {
    if (!isReady || !objUrl || !textureUrl) return;
    const engine = engineRef.current;
    if (!engine.scene) return;

    const textureLoader = new window.THREE.TextureLoader();
    textureLoader.load(textureUrl, (texture) => {
      texture.encoding = window.THREE.sRGBEncoding;
      texture.anisotropy = engine.renderer.capabilities.getMaxAnisotropy();
      engine.activeTexture = texture;

      const objLoader = new window.THREE.OBJLoader();
      objLoader.load(objUrl, (obj) => {
        // Clear previous geometry to avoid leaks
        if (engine.mesh) {
          engine.scene.remove(engine.mesh);
          engine.mesh.traverse(child => {
            if (child.isMesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
              else child.material.dispose();
            }
          });
        }

        const box = new window.THREE.Box3().setFromObject(obj);
        obj.position.sub(box.getCenter(new window.THREE.Vector3()));
        obj.scale.set(1, heightElevation, 1);
        
        engine.mesh = obj;
        engine.scene.add(obj);

        applyMaterialViewMode(engine, viewMode);
      });
    });
  }, [isReady, objUrl, textureUrl]);

  // 3. Instant Y-Axis Scale Update
  useEffect(() => {
    if (engineRef.current.mesh) {
      engineRef.current.mesh.scale.set(1, heightElevation, 1);
    }
  }, [heightElevation]);

  // 4. Instant Material Toggle
  useEffect(() => {
    if (isReady && engineRef.current.mesh) {
      applyMaterialViewMode(engineRef.current, viewMode);
    }
  }, [viewMode, isReady]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />;
}

// ---------------------------------------------------------
// Main App Component
// ---------------------------------------------------------
export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  
  const [isProcessing3D, setIsProcessing3D] = useState(false);
  const [meshUrl, setMeshUrl] = useState(null);
  const [textureUrl, setTextureUrl] = useState(null);

  const [heightElevation, setHeightElevation] = useState(2.0);
  const [foliageBlur, setFoliageBlur] = useState(8);
  const [edgeFeathering, setEdgeFeathering] = useState(36);
  const [viewMode, setViewMode] = useState('mesh');

  const [isSimulating, setIsSimulating] = useState(false);
  const [simVideoUrl, setSimVideoUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fileInputRef = useRef(null);
  const hasGeneratedInitial = useRef(false);
  const abortControllerRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setMeshUrl(null);
      setTextureUrl(null);
      setSimVideoUrl(null);
      setErrorMessage(null);
      hasGeneratedInitial.current = false; 
    }
  };

  const generateMesh = useCallback(async (file, blur, feather) => {
    if (!file) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsProcessing3D(true);
    setErrorMessage(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('height_scale', 1.0); 
    fd.append('foliage_blur', blur);
    fd.append('edge_feathering', feather);

    try {
      const res = await fetch('http://localhost:8000/api/upload-video', { 
        method: 'POST', 
        body: fd,
        signal: abortControllerRef.current.signal 
      });
      
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed processing');
      const data = await res.json();
      
      const ts = Date.now();
      setMeshUrl(`${data.mesh_url}?t=${ts}`);
      setTextureUrl(`${data.texture_url}?t=${ts}`);
      setSimVideoUrl(null);
      hasGeneratedInitial.current = true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message);
      }
    } finally {
      setIsProcessing3D(false);
    }
  }, []);

  // Slider debouncer for background recalculations
  useEffect(() => {
    if (!hasGeneratedInitial.current || !selectedFile) return; 
    const timer = setTimeout(() => {
      generateMesh(selectedFile, foliageBlur, edgeFeathering);
    }, 600);

    return () => clearTimeout(timer);
  }, [foliageBlur, edgeFeathering, selectedFile, generateMesh]); 

  const handleSimulate = async () => {
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      const res = await fetch('http://localhost:8000/api/simulate-landslide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesh_filename: 'terrain.obj' })
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Simulation error');
      const data = await res.json();
      setSimVideoUrl(`${data.video_url}?t=${Date.now()}`);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="engine-app">
      <header className="engine-header">
        <h1 className="brand-title">AeroTerrain AI Engine</h1>
        <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
          Upload 2D Image / Video
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/mp4, image/*" style={{ display: 'none' }} />
      </header>

      <main className="engine-grid">
        {/* PANEL 1: 2D Source Media */}
        <div className="engine-panel">
          <h2 className="panel-heading">2D Source Media</h2>
          <div className="viewport-container">
            {videoPreview ? (
              <video src={videoPreview} controls autoPlay loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="empty-viewport">No media selected. Upload source media.</div>
            )}
          </div>

          <button 
            className="btn-action btn-green"
            onClick={() => generateMesh(selectedFile, foliageBlur, edgeFeathering)}
            disabled={!selectedFile || (isProcessing3D && !hasGeneratedInitial.current)}
          >
            {isProcessing3D && !hasGeneratedInitial.current ? 'BUILDING MESH...' : 'Convert Current Source Media to 3D'}
          </button>

          <div className="status-box">
            <span className="status-title">Filtering Engine</span>
            <p className="status-item">• Low-Pass Noise Filter Active ({foliageBlur}px)</p>
            <p className="status-item">• Edge Falloff Mask Active ({edgeFeathering}%)</p>
          </div>
        </div>

        {/* PANEL 2: 3D Render Viewport */}
        <div className="engine-panel">
          <div className="panel-header-row">
            <h2 className="panel-heading">3D Refined Terrain Mesh</h2>
            <div className="view-toggle-group">
              <button className={`toggle-btn ${viewMode === 'mesh' ? 'active' : ''}`} onClick={() => setViewMode('mesh')}>Mesh</button>
              <button className={`toggle-btn ${viewMode === 'wireframe' ? 'active' : ''}`} onClick={() => setViewMode('wireframe')}>Wireframe</button>
              <button className={`toggle-btn ${viewMode === 'heatmap' ? 'active' : ''}`} onClick={() => setViewMode('heatmap')}>Slope Heatmap</button>
            </div>
          </div>

          <div className="viewport-container">
            {isSimulating ? (
              <div className="empty-viewport active-state">
                <p style={{ color: '#22d3ee', fontWeight: 'bold' }}>BAKING BLENDER PHYSICS & RENDERING MP4...</p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>Executing local background Blender process</p>
              </div>
            ) : simVideoUrl ? (
              <video key={simVideoUrl} src={simVideoUrl} autoPlay loop controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : meshUrl && textureUrl ? (
              <>
                <TerrainViewer 
                  objUrl={meshUrl} 
                  textureUrl={textureUrl} 
                  viewMode={viewMode} 
                  heightElevation={heightElevation} 
                />
                {isProcessing3D && (
                   <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 4, color: '#22d3ee', fontSize: '0.8rem', zIndex: 10 }}>
                     Recalculating Topography...
                   </div>
                )}
              </>
            ) : (
              <div className="empty-viewport">
                {isProcessing3D ? "Reticulating Splines..." : "Generate 3D mesh to inspect terrain in interactive viewport."}
              </div>
            )}
          </div>

          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <button 
            className="btn-action btn-blue"
            onClick={handleSimulate}
            disabled={!meshUrl || isSimulating || isProcessing3D}
          >
            {isSimulating ? 'SIMULATING...' : 'Start Landslide Simulation'}
          </button>
        </div>

        {/* PANEL 3: 3D Terrain Controls */}
        <div className="engine-panel">
          <h2 className="panel-heading">3D Terrain Controls</h2>

          <div className="controls-group">
            <div className="control-field">
              <div className="field-label-row">
                <span style={{ color: '#22d3ee' }}>HEIGHT ELEVATION:</span>
                <span className="field-value">{heightElevation}</span>
              </div>
              <input 
                type="range" min="0.5" max="5.0" step="0.1" 
                value={heightElevation} 
                onChange={(e) => setHeightElevation(Number(e.target.value))} 
              />
            </div>

            <div className="control-field">
              <div className="field-label-row">
                <span>FOLIAGE NOISE BLUR:</span>
                <span className="field-value">{foliageBlur}px</span>
              </div>
              <input 
                type="range" min="1" max="21" step="2" 
                value={foliageBlur} 
                onChange={(e) => setFoliageBlur(Number(e.target.value))} 
              />
            </div>

            <div className="control-field">
              <div className="field-label-row">
                <span>EDGE FEATHERING:</span>
                <span className="field-value">{edgeFeathering}%</span>
              </div>
              <input 
                type="range" min="0" max="40" step="2" 
                value={edgeFeathering} 
                onChange={(e) => setEdgeFeathering(Number(e.target.value))} 
              />
            </div>
          </div>

          <button className="btn-secondary full-width" onClick={() => fileInputRef.current?.click()}>
            Load New Source Media
          </button>
        </div>
      </main>
    </div>
  );
}