import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const GlobeBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 3.5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 地球
    const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('/assets/earth-texture.jpg');
    const globeMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      transparent: true,
      opacity: 0.35,
      shininess: 25,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    globe.position.set(2.0, -0.3, 0);
    scene.add(globe);

    // 大气层光晕
    const atmosphereGeometry = new THREE.SphereGeometry(1.08, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          gl_FragColor = vec4(0.0, 0.94, 1.0, intensity * 0.4);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    atmosphere.position.copy(globe.position);
    scene.add(atmosphere);

    // 卫星轨道环
    const orbitCurve = new THREE.EllipseCurve(0, 0, 1.5, 1.5, 0, Math.PI * 2, false, 0);
    const orbitPoints = orbitCurve.getPoints(100);
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      orbitPoints.map(p => new THREE.Vector3(p.x, p.y, 0))
    );
    const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x74f7fd, transparent: true, opacity: 0.15 });
    const orbit = new THREE.Line(orbitGeometry, orbitMaterial);
    orbit.rotation.x = Math.PI * 0.35;
    orbit.rotation.z = Math.PI * 0.15;
    orbit.position.copy(globe.position);
    scene.add(orbit);

    // 第二条轨道
    const orbit2 = orbit.clone();
    orbit2.rotation.x = Math.PI * 0.6;
    orbit2.rotation.z = -Math.PI * 0.2;
    scene.add(orbit2);

    // 粒子星空
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 800;
    const positions = new Float32Array(starsCount * 3);
    const sizes = new Float32Array(starsCount);
    for (let i = 0; i < starsCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      sizes[i] = Math.random() * 2 + 0.5;
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(starsGeometry, starsMaterial));

    // 光源
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0x74f7fd, 0.8);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    const pointLight = new THREE.PointLight(0x5bc7fa, 0.5, 10);
    pointLight.position.set(-3, 2, 3);
    scene.add(pointLight);

    // 卫星光点（沿轨道运动）
    const satGeom = new THREE.SphereGeometry(0.03, 8, 8);
    const satMat = new THREE.MeshBasicMaterial({ color: 0x74fabd });
    const satellite1 = new THREE.Mesh(satGeom, satMat);
    scene.add(satellite1);
    const satellite2 = new THREE.Mesh(satGeom.clone(), new THREE.MeshBasicMaterial({ color: 0x74f7fd }));
    scene.add(satellite2);

    // 数据连线弧（地球表面两点间）
    const arcGroup = new THREE.Group();
    arcGroup.position.copy(globe.position);
    scene.add(arcGroup);

    const createArc = (lat1: number, lon1: number, lat2: number, lon2: number, color: number) => {
      const toVec = (lat: number, lon: number, r: number) => {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      };
      const p1 = toVec(lat1, lon1, 1.02);
      const p2 = toVec(lat2, lon2, 1.02);
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(1.4);
      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const points = curve.getPoints(30);
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
      return new THREE.Line(geom, mat);
    };

    arcGroup.add(createArc(30, 120, 40, -74, 0x74f7fd));
    arcGroup.add(createArc(35, 139, -33, 151, 0x5bc7fa));
    arcGroup.add(createArc(51, 0, 22, 114, 0x74fabd));
    arcGroup.add(createArc(48, 2, 37, 127, 0xff6b35));

    // 动画循环
    let animId: number;
    let time = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      time += 0.01;
      globe.rotation.y += 0.002;
      atmosphere.rotation.y += 0.002;
      orbit.rotation.y += 0.001;
      orbit2.rotation.y -= 0.0008;
      arcGroup.rotation.y += 0.002;

      // 卫星沿轨道运动
      const r1 = 1.5;
      satellite1.position.set(
        globe.position.x + r1 * Math.cos(time * 0.8) * Math.cos(0.35 * Math.PI),
        globe.position.y + r1 * Math.sin(0.35 * Math.PI) * Math.sin(time * 0.8),
        globe.position.z + r1 * Math.sin(time * 0.8) * Math.cos(0.35 * Math.PI)
      );
      satellite2.position.set(
        globe.position.x + r1 * Math.cos(time * 0.5 + 2),
        globe.position.y + r1 * Math.sin(time * 0.5 + 2) * 0.6,
        globe.position.z + r1 * Math.sin(time * 0.5 + 2) * 0.8
      );

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

export default GlobeBackground;
