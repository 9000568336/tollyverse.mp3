// ============================================================
//  TollyVerse.mp3 — Interactive 3D Background (Three.js)
// ============================================================

let scene, camera, renderer, particles;
let mouseX = 0, mouseY = 0;
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

function initThreeBackground() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || !window.THREE) return;

  // 1. Scene Setup
  scene = new THREE.Scene();
  // We keep the scene background transparent so CSS gradient shows through
  scene.background = null;

  // 2. Camera Setup
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.z = 1000;

  // 3. Renderer Setup
  renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 4. Create Particles (Starfield / Dust)
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const sizes = [];
  const colors = [];

  const color1 = new THREE.Color('#ffffff'); // Diamond White
  const color2 = new THREE.Color('#94a3b8'); // Metallic Silver

  for (let i = 0; i < 2000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    vertices.push(x, y, z);
    sizes.push(Math.random() * 2.5);

    // Mix colors
    const mixedColor = color1.clone().lerp(color2, Math.random());
    colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  // Custom shader material to make glowing dots
  const material = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // 5. Event Listeners
  document.addEventListener('mousemove', onDocumentMouseMove, false);
  window.addEventListener('resize', onWindowResize, false);

  // 6. Start Loop
  animate();
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onDocumentMouseMove(event) {
  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;
}

function animate() {
  requestAnimationFrame(animate);
  
  // Smoothly move camera based on mouse with slightly more momentum
  camera.position.x += (mouseX * 0.6 - camera.position.x) * 0.05;
  camera.position.y += (-mouseY * 0.6 - camera.position.y) * 0.05;
  camera.lookAt(scene.position);

  // Faster rotation for the premium animated feel
  particles.rotation.x += 0.0015;
  particles.rotation.y += 0.0025;

  renderer.render(scene, camera);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initThreeBackground);
