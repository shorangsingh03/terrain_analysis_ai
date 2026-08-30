import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [metrics, setMetrics] = useState({
    max_slope_deg: 0,
    landslide_risk_area_pct: 0,
    flood_prone_area_pct: 0,
  });

  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. THE STRICT MODE FIX: Forcefully destroy any existing duplicate canvases
    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 15, 25);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 30, 10);
    scene.add(dirLight);

    // Create the initial placeholder wireframe
    const geom = new THREE.PlaneGeometry(24, 24, 40, 40);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.4) * Math.cos(z * 0.4) * 1.5);
    }
    geom.computeVertexNormals();
    geom.center(); 

    const wireframeMesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ 
        color: 0x0284c7, 
        wireframe: true,
        side: THREE.DoubleSide 
      })
    );
    // Tag the mesh so we can easily find and destroy it later
    wireframeMesh.name = "terrain_mesh"; 
    scene.add(wireframeMesh);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setVideoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) return alert('Please select a video file first!');

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('http://localhost:8000/api/process-video', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Backend failed to process video');
      const data = await response.json();

      if (data.status === 'success') {
        setMetrics(data.metrics);

        const matrix = data.elevation_matrix;
        const rows = matrix.length;
        const cols = matrix[0].length;

        const newGeom = new THREE.PlaneGeometry(24, 24, cols - 1, rows - 1);
        newGeom.rotateX(-Math.PI / 2);

        const posAttr = newGeom.attributes.position;
        let vertexIdx = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            posAttr.setY(vertexIdx, matrix[r][c]);
            vertexIdx++;
          }
        }
        newGeom.computeVertexNormals();
        
        // 2. Center the geometry exactly at (0,0,0) so it doesn't float below the camera
        newGeom.center(); 

        const textureLoader = new THREE.TextureLoader();
        const textureUrl = `http://localhost:8000/output_assets/3d_mesh/texture.jpg?t=${Date.now()}`;
        const texture = await textureLoader.loadAsync(textureUrl);
        texture.colorSpace = THREE.SRGBColorSpace;

        if (sceneRef.current) {
          // 3. NUCLEAR OPTION: Identify and obliterate absolutely ANY mesh currently in the scene
          const meshesToNuke = sceneRef.current.children.filter(child => child.isMesh);
          meshesToNuke.forEach(mesh => {
            sceneRef.current.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
              } else {
                mesh.material.dispose();
              }
            }
          });
          
          // 4. Add the clean, newly textured terrain
          const texturedMesh = new THREE.Mesh(
            newGeom,
            new THREE.MeshStandardMaterial({
              map: texture,
              roughness: 0.8,
              metalness: 0.1,
              side: THREE.DoubleSide,
            })
          );
          texturedMesh.name = "terrain_mesh";
          
          sceneRef.current.add(texturedMesh);
        }
      }
    } catch (err) {
      console.error('Processing error:', err);
      alert('Error connecting to backend API.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#06090e', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif', padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
          <span>🌌</span> AeroTerrain AI Engine
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input type="file" accept="video/*" onChange={handleFileChange} style={{ display: 'none' }} id="video-upload" />
          <label htmlFor="video-upload" style={{ padding: '10px 15px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer' }}>
            {selectedFile ? selectedFile.name : 'Select Drone Video'}
          </label>
          <button onClick={handleUploadAndAnalyze} disabled={isProcessing} style={{ padding: '10px 20px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isProcessing ? 'AI Processing...' : 'Upload & Analyze'}
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 300px', gap: '20px', height: 'calc(100vh - 120px)' }}>
        <div style={{ backgroundColor: '#0f172a', padding: '15px', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <h4 style={{ marginTop: 0 }}>▷ Source Drone Feed</h4>
          {videoPreviewUrl ? (
            <video src={videoPreviewUrl} controls style={{ width: '100%', borderRadius: '6px', marginTop: '10px' }} />
          ) : (
            <div style={{ height: '200px', backgroundColor: '#1e293b', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No Video Selected
            </div>
          )}
        </div>

        <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', overflow: 'hidden', position: 'relative' }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
        </div>

        <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '10px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ marginTop: 0 }}>Hazard Analytics</h3>
          
          <div style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ color: '#f97316', fontSize: '14px', fontWeight: 'bold' }}>Landslide Risk</span>
            <h1 style={{ margin: '5px 0 0 0' }}>{metrics.landslide_risk_area_pct}%</h1>
          </div>

          <div style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ color: '#38bdf8', fontSize: '14px', fontWeight: 'bold' }}>Flood Prone Area</span>
            <h1 style={{ margin: '5px 0 0 0' }}>{metrics.flood_prone_area_pct}%</h1>
          </div>

          <div style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ color: '#ef4444', fontSize: '14px', fontWeight: 'bold' }}>Max Slope</span>
            <h1 style={{ margin: '5px 0 0 0' }}>{metrics.max_slope_deg}°</h1>
          </div>
        </div>
      </div>
    </div>
  );
}