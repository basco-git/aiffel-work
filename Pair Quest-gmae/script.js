/* =========================================================
   루이의 라면가게 — 말티즈 루이와 함께하는 3D 라면 끓이기 게임
   Three.js r128 (전역 THREE), 이미지 파일 없이 기본 도형 + canvas 텍스처만 사용
   ========================================================= */
(() => {
  'use strict';

  // ---------- 유틸 ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const won = (n) => n.toLocaleString('ko-KR');

  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경 */ }
    },
  };

  // ---------- 트윈 ----------
  const tweens = [];
  function tween(dur, update, done) {
    const tw = { t: 0, dur, update, done };
    tweens.push(tw);
    return tw;
  }
  const wait = (sec, fn) => tween(sec, () => {}, fn);
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.done) tw.done();
      }
    }
  }

  // ---------- 게임 데이터 ----------
  const DAY_SECONDS = 180;
  const TOPPINGS = [
    { id: 'egg', name: '계란', emoji: '🥚', day: 1 },
    { id: 'onion', name: '파', emoji: '🌿', day: 1 },
    { id: 'cheese', name: '치즈', emoji: '🧀', day: 2 },
    { id: 'dumpling', name: '만두', emoji: '🥟', day: 3 },
    { id: 'fishcake', name: '어묵', emoji: '🍥', day: 4 },
    { id: 'chili', name: '고추', emoji: '🌶️', day: 5 },
  ];
  const TOPPING_MAP = Object.fromEntries(TOPPINGS.map((t) => [t.id, t]));
  const BROTH = {
    much: { label: '💧💧💧 국물 많이', icon: '💧💧💧', target: 0.84 },
    normal: { label: '💧💧 국물 보통', icon: '💧💧', target: 0.66 },
    less: { label: '💧 국물 조금', icon: '💧', target: 0.5 },
  };
  const DONENESS = {
    firm: { label: '🍜 꼬들꼬들', short: '꼬들', min: 0.55, max: 0.72 },
    normal: { label: '🍜 알맞게', short: '알맞게', min: 0.72, max: 0.88 },
    soft: { label: '🍜 푹 익혀서', short: '푹', min: 0.88, max: 1.02 },
  };
  const COOK_TIME = 12; // 팔팔 끓는 물에서 익힘 1.0까지 걸리는 시간(초)
  const COOK_BAR_MAX = 1.2;
  const PRICE_PER_STAR = 1000;
  const goalOf = (day) => 5000 + (day - 1) * 2000;
  const LOOKS = [
    { name: '초코', fur: 0x8a5a3b, light: 0xa87652, ear: 0x6e4528, vest: 0x8fc7ef, earType: 'floppy' },
    { name: '콩이', fur: 0xe9b77a, light: 0xf3cf9e, ear: 0xd99a5a, vest: 0xff9fb8, earType: 'pointy' },
    { name: '까미', fur: 0x3b3533, light: 0x5a524e, ear: 0x2c2725, vest: 0xffe07a, earType: 'floppy' },
    { name: '구름', fur: 0xd9dbe0, light: 0xeef0f3, ear: 0xbfc3ca, vest: 0xa8e6be, earType: 'pointy' },
    { name: '호두', fur: 0xb27a45, light: 0xf5e8d6, ear: 0x8e5a2e, vest: 0xd2b6ff, earType: 'pointy' },
    { name: '보리', fur: 0xd8a35d, light: 0xf1d3a3, ear: 0xb98340, vest: 0x9fc0ff, earType: 'floppy' },
    { name: '밤이', fur: 0x6f4a35, light: 0xd9b48f, ear: 0x553625, vest: 0xfff07a, earType: 'pointy' },
    { name: '두부', fur: 0xfaf6ef, light: 0xffffff, ear: 0xd8b48a, vest: 0xffc48a, earType: 'floppy' },
  ];
  const PRAISE = ['최고예요! 🥰', '완벽한 라면이에요!', '멍멍! 또 올게요!', '정말 맛있어요! 💕'];
  const HOWTO = [
    { icon: '📝👀', text: '손님 주문은 잠깐만 보여! 물 양, 익힘, 토핑을 꼭 기억해 줘. 잊으면 👀 버튼!' },
    { icon: '💧', text: '먼저 물을 부어 줘. 버튼을 꾹 누르고 있다가 초록 칸에서 손을 떼!' },
    { icon: '🔥', text: '불을 켜고 물이 보글보글 끓을 때까지 기다려!' },
    { icon: '🍜', text: '보글보글 끓으면 면을 퐁! 넣어 줘.' },
    { icon: '🧂', text: '그다음 스프를 솔솔~' },
    { icon: '🥚🌿', text: '손님이 말한 토핑만 쏙쏙 올려 줘. 기억나지?' },
    { icon: '🥣', text: '익힘 막대가 초록 칸에 오면 담아내기! 3분 안에 목표 돈을 모으자!' },
    { icon: '⌨️', text: '키보드도 돼! 1 물(꾹), 2 불, 3 면, 4 스프, 5~0 토핑, 엔터 담기, Q 다시 보기!' },
  ];

  // ---------- 렌더러 / 씬 ----------
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const FOG = 0xffd9e8;
  scene.fog = new THREE.Fog(FOG, 22, 48);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  const view = {
    mainPos: new THREE.Vector3(),
    mainLook: new THREE.Vector3(0.5, 1.95, -1.0),
    closePos: new THREE.Vector3(),
    closeLook: new THREE.Vector3(),
    look: new THREE.Vector3(0.6, 1.9, -1.9),
    mode: 'close',
  };
  camera.position.set(0.6, 2.3, 2.2);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const portrait = camera.aspect < 1;
    const halfW = portrait ? 4.6 : 5.3;
    const halfH = 2.7;
    const d = Math.min(26, Math.max(halfW / (t * camera.aspect), halfH / t));
    const dir = new THREE.Vector3(0, 0.26, 1).normalize();
    view.mainPos.copy(view.mainLook).addScaledVector(dir, d);
    if (portrait) {
      view.closePos.set(0.6, 2.1, 3.4);
      view.closeLook.set(0.6, 1.85, -1.9);
    } else {
      view.closePos.set(0.6, 2.05, 1.9);
      view.closeLook.set(0.6, 1.9, -1.9);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 조명 ----------
  scene.add(new THREE.HemisphereLight(0xfff6fa, 0xe6d6ff, 0.6));
  scene.add(new THREE.AmbientLight(0xffe8f1, 0.08));
  const sun = new THREE.DirectionalLight(0xfff4ea, 0.9);
  sun.position.set(-4, 8, 6);
  sun.target.position.set(0.5, 1, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -5;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ---------- canvas 텍스처 ----------
  function canvasTexture(w, h, draw, repeat, color = true) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    if (color) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    if (repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
    }
    return tex;
  }
  function heartPath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.3);
    g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.75, x, y + s);
    g.bezierCurveTo(x, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    g.fill();
  }

  // 분홍빛 하늘
  scene.background = canvasTexture(16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ff9cc6');
    grd.addColorStop(0.45, '#ffc7de');
    grd.addColorStop(0.8, '#ffe4ef');
    grd.addColorStop(1, '#fff2e6');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

  const furTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#fbfbfb';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 4 + Math.random() * 10;
      const a = Math.PI / 2 + rand(-0.6, 0.6);
      const v = (232 + Math.random() * 23) | 0;
      g.strokeStyle = `rgba(${v},${v},${v},0.8)`;
      g.lineWidth = 1 + Math.random() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  }, [2, 2]);

  const knitTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(140, 110, 70, 0.28)';
    g.lineWidth = 3;
    for (let y = 0; y < h; y += 11) {
      for (let x = 0; x < w; x += 12) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 6, y + 9);
        g.lineTo(x + 12, y);
        g.stroke();
      }
    }
  }, [6, 2]);

  // 바닥 무늬: 분홍·크림 체크 + 작은 하트
  const floorTex = canvasTexture(256, 256, (g, w) => {
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#fff4ea' : '#ffd3e3';
        g.fillRect(i * s, j * s, s, s);
        if ((i + j) % 2 === 0) {
          g.fillStyle = 'rgba(255, 255, 255, 0.85)';
          heartPath(g, i * s + s / 2, j * s + s * 0.3, s * 0.4);
        }
      }
    }
  }, [5, 3]);

  // 잔디: 민트색에 작은 꽃 점
  const grassTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c8f0d6';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.fillStyle = pick(['#ffffff', '#ffd1e3', '#fff0a6', '#e3d4ff']);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffc94a';
      g.beginPath();
      g.arc(x, y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }, [10, 10]);

  const awningTex = canvasTexture(256, 64, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#ff8fb8';
      g.fillRect((i * w) / n, 0, w / n, h);
    }
  });

  const noodleTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#efc35a';
    g.fillRect(0, 0, w, h);
    g.lineWidth = 6;
    for (let i = 0; i < 42; i++) {
      g.strokeStyle = i % 2 ? '#f8db82' : '#d6a23a';
      const y0 = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y0);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, y0 + Math.sin(x * 0.16 + i) * 6);
      g.stroke();
    }
  });

  const fishcakeTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#fffaf4';
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f07aa0';
    g.lineWidth = 9;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.1) {
      const r = 6 + a * 3.3;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.stroke();
  });

  const packTex = canvasTexture(256, 160, (g, w) => {
    g.fillStyle = '#ff6f8f';
    g.fillRect(0, 0, w, 160);
    g.fillStyle = '#fff6b0';
    g.font = '44px Jua, sans-serif';
    g.textAlign = 'center';
    g.fillText('루이라면', w / 2, 62);
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.ellipse(w / 2, 118, 70, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#efb33c';
    g.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      for (let x = -55; x <= 55; x += 5) g.lineTo(w / 2 + x, 110 + i * 5 + Math.sin(x * 0.3 + i) * 3);
      g.stroke();
    }
  });

  const soupTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ff8a5c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = '40px Jua, sans-serif';
    g.textAlign = 'center';
    g.fillText('스프', w / 2, 80);
  });

  // 간판·메뉴판 글자는 Jua 글꼴이 로드된 뒤 다시 그린다
  function textTexture(w, h, draw) {
    const tex = canvasTexture(w, h, draw);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('40px Jua').then(() => {
        draw(tex.image.getContext('2d'), w, h);
        tex.needsUpdate = true;
      }).catch(() => {});
    }
    return tex;
  }

  const signTex = textTexture(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff6fa';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff8fb8';
    g.lineWidth = 18;
    g.strokeRect(9, 9, w - 18, h - 18);
    g.textAlign = 'center';
    g.font = '118px Jua, sans-serif';
    g.lineWidth = 14;
    g.strokeStyle = '#ffd0e2';
    g.strokeText('루이의 라면가게', w / 2, 168);
    g.fillStyle = '#ff5f9a';
    g.fillText('루이의 라면가게', w / 2, 168);
    g.fillStyle = '#ffc94a';
    for (const x of [70, w - 70]) {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 18 : 42;
        g.lineTo(x + Math.cos(a) * r, 128 + Math.sin(a) * r);
      }
      g.fill();
    }
  });

  const menuTex = textTexture(512, 288, (g, w, h) => {
    g.fillStyle = '#fff8fb';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b99cff';
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.textAlign = 'center';
    g.font = '52px Jua, sans-serif';
    g.fillStyle = '#ff5f9a';
    g.fillText('🍜 메뉴 🍜', w / 2, 84);
    g.font = '38px Jua, sans-serif';
    g.fillStyle = '#6a3b55';
    g.fillText('루이 라면 한 그릇', w / 2, 156);
    g.fillStyle = '#9a6683';
    g.fillText('⭐ 하나에 1,000원!', w / 2, 220);
  });

  const counterTex = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#ffb6cf';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    for (let x = 16; x < w; x += 64) heartPath(g, x + 16, 44, 30);
  }, [3, 1]);

  const steamTex = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });

  // ---------- 메시 도우미 ----------
  const SPH = new THREE.SphereGeometry(1, 32, 24);
  const SPH_LOW = new THREE.SphereGeometry(1, 14, 10);
  function mesh(parent, geo, mat, pos, scale, rot, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    if (parent) parent.add(m);
    return m;
  }
  // r128에는 CapsuleGeometry가 없어서 원기둥 + 공 두 개로 만든다
  function capsule(parent, r, len, mat, pos, rot) {
    const g = new THREE.Group();
    mesh(g, new THREE.CylinderGeometry(r, r, len, 16), mat);
    mesh(g, SPH, mat, [0, len / 2, 0], [r, r, r]);
    mesh(g, SPH, mat, [0, -len / 2, 0], [r, r, r]);
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g);
    return g;
  }
  function clearGroup(g) {
    while (g.children.length) g.remove(g.children[0]);
  }
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra));

  const mats = {
    cream: std(0xfff4ea, { roughness: 0.7 }),
    pink: std(0xffa9c8, { roughness: 0.7 }),
    pinkDeep: std(0xff7fae, { roughness: 0.6 }),
    lav: std(0xd2bfff, { roughness: 0.7 }),
    counterTop: std(0xffffff, { roughness: 0.4 }),
    stove: std(0x8c8fa3, { roughness: 0.45, metalness: 0.2 }),
    iron: std(0x4a4a58, { roughness: 0.5, metalness: 0.3 }),
    steel: std(0xe4e8f0, { roughness: 0.25, metalness: 0.35 }),
    pot: std(0xf4c15a, { roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide }),
    white: std(0xfffaf3, { roughness: 0.35 }),
    red: std(0xff6f8f, { roughness: 0.5 }),
    eggWhite: std(0xfffdf7, { roughness: 0.4 }),
    yolk: std(0xffae1f, { roughness: 0.35 }),
    onion: std(0x5fb043, { roughness: 0.6 }),
    onionLight: std(0xc9e8a8, { roughness: 0.6 }),
    cheese: std(0xffcc33, { roughness: 0.45 }),
    dumpling: std(0xf3e6c8, { roughness: 0.6 }),
    chili: std(0xe23a2f, { roughness: 0.45 }),
    chiliGreen: std(0x3f8f2f, { roughness: 0.5 }),
    fishSide: std(0xfde6ee, { roughness: 0.6 }),
    fishTop: std(0xffffff, { map: fishcakeTex, roughness: 0.6 }),
    trunk: std(0xc9967a, { roughness: 0.9 }),
    cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffeef5, emissiveIntensity: 0.2 }),
  };
  const noodleMat = std(0xf2cf6b, { roughness: 0.45 });

  // ---------- 파스텔 세계 ----------
  const TOP = 1.06; // 조리대 윗면 높이
  const POT_POS = new THREE.Vector3(1.35, TOP + 0.22, -0.95);
  const POT_R = 0.355;
  const POT_D = 0.36;
  const SEAT = new THREE.Vector3(-3.2, 0.62, -0.4);
  const TABLE_POS = new THREE.Vector3(-3.05, 0.985, 0.25);
  const BOWL_START = new THREE.Vector3(-0.5, TOP + 0.24, -0.85);
  const clickables = [];

  // 둥근 잔디 섬 + 가게 바닥
  const island = mesh(scene, new THREE.CylinderGeometry(20, 20, 0.6, 64), std(0xffffff, { map: grassTex, roughness: 0.95 }), [0, -0.3, -2]);
  island.castShadow = false;
  const shopFloor = mesh(scene, new THREE.PlaneGeometry(10, 5.2), std(0xffffff, { map: floorTex, roughness: 0.8 }), [0.4, 0.005, -0.9], null, [-Math.PI / 2, 0, 0]);
  shopFloor.castShadow = false;

  // 뭉게구름
  const clouds = [];
  function makeCloud(x, y, z, s) {
    const g = new THREE.Group();
    const puffs = randInt(5, 7);
    for (let i = 0; i < puffs; i++) {
      const r = rand(0.7, 1.2) * (1 - Math.abs(i - puffs / 2) / puffs);
      mesh(g, SPH_LOW, mats.cloud, [(i - puffs / 2) * 0.75, rand(-0.1, 0.3) + r * 0.3, rand(-0.3, 0.3)], [r + 0.35, r + 0.2, r + 0.3], null, false);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    scene.add(g);
    clouds.push({ g, speed: rand(0.08, 0.2) });
  }
  for (let i = 0; i < 12; i++) makeCloud(rand(-22, 22), rand(4, 9), rand(-24, -12), rand(1, 1.8));
  for (let i = 0; i < 5; i++) makeCloud(rand(-16, 16), rand(0.8, 2), rand(-22, -16), rand(1.4, 2.2));

  // 별과 하트
  function starShape(R, r) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const rr = i % 2 ? r : R;
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    return s;
  }
  function heartShape() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.3);
    s.bezierCurveTo(-0.05, -0.22, -0.32, -0.08, -0.32, 0.08);
    s.bezierCurveTo(-0.32, 0.24, -0.12, 0.3, 0, 0.16);
    s.bezierCurveTo(0.12, 0.3, 0.32, 0.24, 0.32, 0.08);
    s.bezierCurveTo(0.32, -0.08, 0.05, -0.22, 0, -0.3);
    return s;
  }
  const extrudeOpts = { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 };
  const starGeo = new THREE.ExtrudeGeometry(starShape(0.32, 0.14), extrudeOpts);
  starGeo.center();
  const heartGeo = new THREE.ExtrudeGeometry(heartShape(), extrudeOpts);
  heartGeo.center();
  const floatMats = [
    std(0xffe27a, { emissive: 0xffd34d, emissiveIntensity: 0.35, roughness: 0.4 }),
    std(0xff8fb8, { emissive: 0xff6fa0, emissiveIntensity: 0.3, roughness: 0.4 }),
    std(0xc9a7ff, { emissive: 0xb28aff, emissiveIntensity: 0.3, roughness: 0.4 }),
    std(0x9fe6c4, { emissive: 0x7fd6a8, emissiveIntensity: 0.25, roughness: 0.4 }),
  ];
  const floaters = [];
  for (let i = 0; i < 30; i++) {
    const isStar = i % 2 === 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    const far = Math.random() < 0.6;
    const x = far ? rand(-14, 14) : side * rand(5.5, 9);
    const y = far ? rand(3.6, 8) : rand(1.5, 5);
    const z = far ? rand(-16, -6) : rand(-5, 0);
    const mat = isStar ? floatMats[i % 4 === 0 ? 0 : 2] : floatMats[i % 4 === 1 ? 1 : 3];
    const m = mesh(scene, isStar ? starGeo : heartGeo, mat, [x, y, z], null, null, false);
    m.scale.setScalar(rand(0.7, 1.5));
    floaters.push({ m, y, phase: rand(0, 6), spin: rand(0.3, 0.9) * (Math.random() < 0.5 ? -1 : 1) });
  }

  // 솜사탕 나무 & 꽃
  function lollipopTree(x, z, color, h) {
    mesh(scene, new THREE.CylinderGeometry(0.08, 0.11, h, 10), mats.trunk, [x, h / 2, z]);
    const top = std(color, { roughness: 0.75 });
    mesh(scene, SPH, top, [x, h + 0.35, z], [0.6, 0.55, 0.6]);
    mesh(scene, SPH, top, [x + 0.3, h + 0.15, z + 0.1], [0.38, 0.35, 0.38]);
    mesh(scene, SPH, top, [x - 0.28, h + 0.2, z - 0.1], [0.4, 0.37, 0.4]);
  }
  lollipopTree(-5.6, -2.8, 0xffb3d1, 1.6);
  lollipopTree(6.2, -2.6, 0xd4c0ff, 1.5);
  lollipopTree(-7.4, -5.5, 0xa8e6c4, 1.8);
  lollipopTree(7.8, -6, 0xffd6a8, 1.7);
  lollipopTree(-4.6, -6.5, 0xffe08a, 1.3);
  for (let i = 0; i < 26; i++) {
    const x = rand(-9, 9);
    const z = rand(-1, 3.5);
    if (Math.abs(x - 0.4) < 5.3 && z < 1.8) continue; // 가게 앞은 비워 둔다
    mesh(scene, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), mats.onion, [x, 0.11, z], null, null, false);
    mesh(scene, SPH_LOW, pick(floatMats), [x, 0.25, z], [0.07, 0.07, 0.07], null, false);
  }

  // ---------- 포장마차 가게 ----------
  mesh(scene, new THREE.BoxGeometry(6.2, 2.4, 0.12), mats.cream, [1.6, 1.2, -2.75]);
  mesh(scene, new THREE.BoxGeometry(6.24, 0.1, 0.18), mats.pinkDeep, [1.6, 2.42, -2.75]);
  mesh(scene, new THREE.PlaneGeometry(1.7, 0.95), std(0xffffff, { map: menuTex, roughness: 0.8 }), [2.0, 1.85, -2.68]);
  mesh(scene, new THREE.BoxGeometry(1.2, 0.05, 0.3), mats.lav, [3.85, 1.95, -2.6]);
  for (let i = 0; i < 4; i++) {
    const c = [0xffd66b, 0xff8fb8, 0xa8e6c4, 0xc9a7ff][i];
    const h = rand(0.2, 0.3);
    mesh(scene, new THREE.CylinderGeometry(0.09, 0.09, h, 16), std(c, { roughness: 0.4 }), [3.4 + i * 0.3, 1.975 + h / 2, -2.6]);
  }
  for (const [x, z] of [[-1.3, -0.4], [4.5, -0.4], [-1.3, -2.7], [4.5, -2.7]]) {
    mesh(scene, new THREE.CylinderGeometry(0.07, 0.07, 3.4, 12), mats.cream, [x, 1.7, z]);
  }
  // 줄무늬 차양 + 물결 장식
  const awningMat = std(0xffffff, { map: awningTex, roughness: 0.75, side: THREE.DoubleSide });
  mesh(scene, new THREE.BoxGeometry(6.2, 0.06, 2.9), awningMat, [1.6, 3.48, -1.45], null, [0.16, 0, 0]);
  const scallopGeo = new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    mesh(scene, scallopGeo, i % 2 ? mats.white : mats.pink, [-1.35 + i * 0.395 + 0.2, 3.27, 0.0], [1, 0.8, 0.5]);
  }
  // 꼬마전구
  const bulbs = [];
  for (let i = 0; i < 14; i++) {
    const b = mesh(scene, SPH_LOW, new THREE.MeshBasicMaterial({ color: [0xfff3a6, 0xffc2dc, 0xd9c8ff][i % 3] }), [-1.2 + i * 0.43, 3.0 + Math.sin(i * 0.9) * 0.04, 0.02], [0.05, 0.065, 0.05], null, false);
    bulbs.push(b);
  }
  // 간판
  mesh(scene, new THREE.BoxGeometry(3.4, 0.86, 0.1), mats.pinkDeep, [1.6, 4.15, -0.2]);
  mesh(scene, new THREE.PlaneGeometry(3.25, 0.76), new THREE.MeshBasicMaterial({ map: signTex }), [1.6, 4.15, -0.145], null, null, false);
  // 노렌
  const norenPanels = [];
  const norenTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b99cff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    heartPath(g, w / 2, 30, 64);
  });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Group();
    p.position.set(-0.4 + i * 0.5, 3.25, -0.1);
    scene.add(p);
    mesh(p, new THREE.PlaneGeometry(0.46, 0.36), std(0xffffff, { map: norenTex, side: THREE.DoubleSide, roughness: 0.95 }), [0, -0.18, 0], null, null, false);
    norenPanels.push(p);
  }

  // 조리대
  mesh(scene, new THREE.BoxGeometry(5.6, TOP - 0.06, 1.2), std(0xffffff, { map: counterTex, roughness: 0.7 }), [1.6, (TOP - 0.06) / 2, -0.95]);
  mesh(scene, new THREE.BoxGeometry(5.72, 0.06, 1.3), mats.counterTop, [1.6, TOP - 0.03, -0.95]);
  mesh(scene, new THREE.BoxGeometry(6, 0.72, 0.9), mats.lav, [1.6, 0.36, -2.2]); // 루이가 올라서는 발판

  // 손님 테이블 & 의자 & 파라솔
  mesh(scene, new THREE.CylinderGeometry(0.58, 0.58, 0.05, 32), mats.white, [-3.15, 0.96, 0.3]);
  mesh(scene, new THREE.CylinderGeometry(0.06, 0.08, 0.94, 12), mats.lav, [-3.15, 0.47, 0.3]);
  mesh(scene, new THREE.CylinderGeometry(0.32, 0.36, 0.04, 24), mats.lav, [-3.15, 0.02, 0.3]);
  mesh(scene, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24), mats.pinkDeep, [SEAT.x, SEAT.y - 0.03, SEAT.z]);
  for (const [dx, dz] of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]]) {
    mesh(scene, new THREE.CylinderGeometry(0.025, 0.025, SEAT.y - 0.06, 8), mats.cream, [SEAT.x + dx, (SEAT.y - 0.06) / 2, SEAT.z + dz]);
  }
  mesh(scene, new THREE.CylinderGeometry(0.03, 0.03, 2.4, 8), mats.cream, [-3.6, 1.2, -0.9]);
  mesh(scene, new THREE.ConeGeometry(1.15, 0.45, 16, 1, true), std(0xffffff, { map: awningTex, side: THREE.DoubleSide, roughness: 0.7 }), [-3.6, 2.55, -0.9]);

  // ---------- 가스레인지 & 냄비 ----------
  const stove = new THREE.Group();
  stove.position.set(POT_POS.x, TOP, POT_POS.z);
  scene.add(stove);
  mesh(stove, new THREE.BoxGeometry(1.0, 0.12, 0.86), mats.stove, [0, 0.06, 0]);
  mesh(stove, new THREE.CylinderGeometry(0.16, 0.18, 0.04, 24), mats.iron, [0, 0.14, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    mesh(stove, new THREE.BoxGeometry(0.05, 0.1, 0.24), mats.iron, [Math.cos(a) * 0.3, 0.17, Math.sin(a) * 0.3], null, [0, -a + Math.PI / 2, 0]);
  }
  const knob = new THREE.Group();
  knob.position.set(0.32, 0.06, 0.44);
  knob.userData.action = 'fire';
  stove.add(knob);
  mesh(knob, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 20), mats.red, [0, 0, 0.03], null, [Math.PI / 2, 0, 0]);
  mesh(knob, new THREE.BoxGeometry(0.03, 0.11, 0.03), mats.white, [0, 0, 0.07]);
  clickables.push(knob);

  const fireGroup = new THREE.Group();
  fireGroup.position.set(0, 0.16, 0);
  stove.add(fireGroup);
  const flames = [];
  const flameOuter = new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.85 });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0x6fb0ff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const f = new THREE.Group();
    f.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
    f.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    mesh(f, new THREE.ConeGeometry(0.045, 0.16, 8), flameOuter, [0, 0.08, 0], null, null, false);
    mesh(f, new THREE.ConeGeometry(0.025, 0.08, 8), flameInner, [0, 0.04, 0], null, null, false);
    fireGroup.add(f);
    flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff9a4a, 0, 2.5, 2);
  fireLight.position.set(0, 0.1, 0.3);
  stove.add(fireLight);
  fireGroup.visible = false;

  const potGroup = new THREE.Group();
  potGroup.position.copy(POT_POS);
  potGroup.userData.action = 'pot';
  scene.add(potGroup);
  clickables.push(potGroup);
  mesh(potGroup, new THREE.CylinderGeometry(0.385, 0.365, 0.38, 40, 1, true), mats.pot, [0, 0.19, 0]);
  mesh(potGroup, new THREE.CylinderGeometry(0.365, 0.365, 0.02, 40), mats.pot, [0, 0.01, 0]);
  mesh(potGroup, new THREE.TorusGeometry(0.385, 0.016, 8, 48), mats.pot, [0, 0.38, 0], null, [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) mesh(potGroup, new THREE.BoxGeometry(0.16, 0.035, 0.09), mats.pot, [s * 0.46, 0.33, 0]);

  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0xa8daf0, roughness: 0.08, transparent: true, opacity: 0.72 });
  const waterGeo = new THREE.CylinderGeometry(POT_R, POT_R, 1, 40);
  waterGeo.translate(0, 0.5, 0);
  const water = mesh(potGroup, waterGeo, waterMat, [0, 0.02, 0], null, null, false);
  water.visible = false;

  // 냄비 안 목표 물 높이 줄(주문이 보일 때만)
  const targetRingMat = new THREE.MeshBasicMaterial({ color: 0x4fd18b, transparent: true, opacity: 0.85 });
  const targetRing = mesh(potGroup, new THREE.TorusGeometry(POT_R + 0.004, 0.008, 6, 48), targetRingMat, [0, 0.2, 0], null, [Math.PI / 2, 0, 0], false);
  targetRing.visible = false;

  const noodleBlockGeo = new THREE.BoxGeometry(0.34, 0.08, 0.34);
  const noodleBlockMat = std(0xffffff, { map: noodleTex, roughness: 0.55 });
  const noodleBlock = mesh(potGroup, noodleBlockGeo, noodleBlockMat, [0, 0.1, 0], null, [0, 0.4, 0]);
  noodleBlock.visible = false;

  function buildStrands(radius, count, material) {
    const grp = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const pts = [];
      let a = rand(0, Math.PI * 2);
      let r = rand(0.03, radius * 0.6);
      for (let j = 0; j < 16; j++) {
        a += rand(0.25, 0.6);
        r = clamp(r + rand(-0.05, 0.05), 0.03, radius);
        const rr = r + Math.sin(j * 2.7 + i) * 0.015;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(j * 1.3 + i) * 0.012, Math.sin(a) * rr));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.011, 6, false);
      grp.add(new THREE.Mesh(geo, material));
    }
    return grp;
  }
  const strands = buildStrands(0.3, 18, noodleMat);
  strands.visible = false;
  potGroup.add(strands);

  const potToppings = new THREE.Group();
  potGroup.add(potToppings);
  const TOPPING_SLOTS = [[0.15, 0.1], [-0.15, 0.11], [0.02, -0.17], [-0.14, -0.1], [0.16, -0.09], [0.0, 0.18]];

  // 끓는 거품
  const BUBBLE_N = 60;
  const bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.1 }), BUBBLE_N);
  bubbleMesh.frustumCulled = false;
  potGroup.add(bubbleMesh);
  const bubbles = Array.from({ length: BUBBLE_N }, () => ({ alive: false, x: 0, y: 0, z: 0, v: 0, s: 0 }));
  const dummy = new THREE.Object3D();
  let bubbleAcc = 0;

  // 김
  const steamSprites = [];
  for (let i = 0; i < 22; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.userData = { life: Math.random(), speed: rand(0.35, 0.6), x: rand(-0.2, 0.2), z: rand(-0.2, 0.2) };
    potGroup.add(sp);
    steamSprites.push(sp);
  }

  // 물결
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const ripple = mesh(potGroup, new THREE.RingGeometry(0.08, 0.11, 32), rippleMat, [0, 0.1, 0], null, [-Math.PI / 2, 0, 0], false);
  function makeRipple() {
    tween(0.6, (k) => {
      ripple.position.y = surfaceY() + 0.004;
      ripple.scale.setScalar(1 + k * 2.4);
      rippleMat.opacity = 0.7 * (1 - k);
    });
  }

  // ---------- 주전자 ----------
  const KETTLE_HOME = new THREE.Vector3(2.25, TOP, -0.8);
  const KETTLE_POUR = new THREE.Vector3(POT_POS.x + 0.55, TOP + 0.85, POT_POS.z + 0.05);
  const kettle = new THREE.Group();
  kettle.position.copy(KETTLE_HOME);
  kettle.userData.action = 'pour';
  scene.add(kettle);
  clickables.push(kettle);
  const kettleMat = std(0x9fd8ff, { roughness: 0.35, metalness: 0.15 });
  mesh(kettle, SPH, kettleMat, [0, 0.16, 0], [0.18, 0.15, 0.18]);
  mesh(kettle, new THREE.CylinderGeometry(0.08, 0.1, 0.04, 16), kettleMat, [0, 0.31, 0]);
  mesh(kettle, SPH, mats.red, [0, 0.35, 0], [0.035, 0.03, 0.035]);
  mesh(kettle, new THREE.CylinderGeometry(0.022, 0.04, 0.24, 12), kettleMat, [-0.22, 0.24, 0], null, [0, 0, 0.9]);
  mesh(kettle, new THREE.TorusGeometry(0.13, 0.018, 8, 20, Math.PI), mats.red, [0, 0.3, 0]);
  const spoutTip = new THREE.Object3D();
  spoutTip.position.set(-0.32, 0.31, 0);
  kettle.add(spoutTip);
  const streamMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.7, roughness: 0.05 });
  const streamGeo = new THREE.CylinderGeometry(0.018, 0.022, 1, 10);
  streamGeo.translate(0, -0.5, 0);
  const stream = mesh(scene, streamGeo, streamMat, [0, 0, 0], null, null, false);
  stream.visible = false;
  let kettleK = 0;

  // ---------- 재료 소품 ----------
  const props = {};
  function makeProp(id, pos, build) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.action = id;
    build(g);
    scene.add(g);
    clickables.push(g);
    props[id] = g;
    return g;
  }
  function plate(g, r = 0.17) {
    mesh(g, new THREE.CylinderGeometry(r, r * 0.8, 0.03, 24), mats.white, [0, 0.015, 0]);
  }
  const PROP_X = [2.9, 3.35, 3.8, 4.22];
  const FRONT_Z = -0.62;
  const BACK_Z = -1.2;
  makeProp('noodle', new THREE.Vector3(PROP_X[0], TOP, FRONT_Z), (g) => {
    const packMat = [mats.red, mats.red, mats.red, mats.red, std(0xffffff, { map: packTex, roughness: 0.5 }), mats.red];
    for (let i = 0; i < 3; i++) mesh(g, new THREE.BoxGeometry(0.3, 0.07, 0.22), packMat, [0, 0.035 + i * 0.075, 0], null, [0, i * 0.15 - 0.15, 0]);
  });
  makeProp('soup', new THREE.Vector3(PROP_X[1], TOP, FRONT_Z), (g) => {
    mesh(g, new THREE.BoxGeometry(0.24, 0.14, 0.16), std(0xffe3c2, { roughness: 0.9 }), [0, 0.07, 0]);
    for (let i = 0; i < 4; i++) {
      mesh(g, new THREE.BoxGeometry(0.09, 0.12, 0.012), std(0xffffff, { map: soupTex, roughness: 0.6 }), [-0.08 + i * 0.055, 0.17, 0], null, [0.15, 0, 0]);
    }
  });
  makeProp('egg', new THREE.Vector3(PROP_X[2], TOP, FRONT_Z), (g) => {
    mesh(g, new THREE.CylinderGeometry(0.17, 0.12, 0.08, 20, 1, true), std(0xe8c49a, { side: THREE.DoubleSide, roughness: 0.9 }), [0, 0.04, 0]);
    mesh(g, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 20), std(0xe8c49a), [0, 0.005, 0]);
    for (const [x, z] of [[-0.06, 0.03], [0.06, 0.03], [0, -0.06]]) mesh(g, SPH, std(0xfff4e0, { roughness: 0.5 }), [x, 0.09, z], [0.06, 0.075, 0.06]);
  });
  makeProp('onion', new THREE.Vector3(PROP_X[3], TOP, FRONT_Z), (g) => {
    mesh(g, new THREE.BoxGeometry(0.34, 0.03, 0.22), std(0xf6d7b0), [0, 0.015, 0]);
    for (let i = 0; i < 4; i++) {
      mesh(g, new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), i % 2 ? mats.onion : mats.onionLight, [0, 0.05, -0.05 + i * 0.035], null, [0, 0.2, Math.PI / 2]);
    }
  });
  makeProp('cheese', new THREE.Vector3(PROP_X[0], TOP, BACK_Z), (g) => {
    plate(g);
    for (let i = 0; i < 4; i++) mesh(g, new THREE.BoxGeometry(0.17, 0.014, 0.17), mats.cheese, [0, 0.04 + i * 0.016, 0], null, [0, i * 0.2, 0]);
  });
  const dumplingGeo = new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  makeProp('dumpling', new THREE.Vector3(PROP_X[1], TOP, BACK_Z), (g) => {
    plate(g);
    for (const [x, z] of [[-0.06, 0.04], [0.06, 0.04], [0, -0.06]]) mesh(g, dumplingGeo, mats.dumpling, [x, 0.03, z], [1.3, 0.75, 0.8], [0, rand(0, 3), 0]);
  });
  const fishcakeGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24);
  makeProp('fishcake', new THREE.Vector3(PROP_X[2], TOP, BACK_Z), (g) => {
    plate(g);
    for (const [x, z] of [[-0.06, 0.02], [0.05, 0.05], [0.02, -0.06]]) mesh(g, fishcakeGeo, [mats.fishSide, mats.fishTop, mats.fishTop], [x, 0.045, z]);
  });
  makeProp('chili', new THREE.Vector3(PROP_X[3], TOP, BACK_Z), (g) => {
    plate(g);
    for (let i = 0; i < 3; i++) mesh(g, new THREE.ConeGeometry(0.025, 0.2, 10), mats.chili, [-0.05 + i * 0.05, 0.05, 0], null, [Math.PI / 2, 0, 0.2 - i * 0.2]);
  });

  const bowlProfile = [
    [0, 0], [0.12, 0], [0.13, 0.015], [0.2, 0.05], [0.27, 0.13], [0.3, 0.2], [0.29, 0.205], [0.26, 0.14], [0.19, 0.065], [0.0, 0.035],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bowlGeo = new THREE.LatheGeometry(bowlProfile, 40);
  const bowlMat = std(0xfffaf3, { roughness: 0.3, side: THREE.DoubleSide });
  const bowlRimGeo = new THREE.TorusGeometry(0.297, 0.01, 6, 40);
  makeProp('serve', new THREE.Vector3(-0.5, TOP, -0.85), (g) => {
    for (let i = 0; i < 3; i++) {
      mesh(g, bowlGeo, bowlMat, [0, i * 0.08, 0]);
      mesh(g, bowlRimGeo, mats.pinkDeep, [0, i * 0.08 + 0.2, 0], null, [Math.PI / 2, 0, 0]);
    }
  });

  // ---------- 토핑 메시 ----------
  const onionRingGeo = new THREE.TorusGeometry(0.022, 0.008, 6, 12);
  const chiliRingGeo = new THREE.TorusGeometry(0.016, 0.007, 6, 12);
  function makeTopping(id) {
    const g = new THREE.Group();
    if (id === 'egg') {
      mesh(g, SPH, mats.eggWhite, [0, 0.01, 0], [0.1, 0.03, 0.085]);
      mesh(g, SPH, mats.yolk, [0.01, 0.03, 0], [0.042, 0.028, 0.042]);
    } else if (id === 'onion') {
      for (let i = 0; i < 8; i++) mesh(g, onionRingGeo, i % 3 ? mats.onion : mats.onionLight, [rand(-0.08, 0.08), 0.012, rand(-0.08, 0.08)], null, [Math.PI / 2, 0, 0]);
    } else if (id === 'cheese') {
      mesh(g, new THREE.BoxGeometry(0.17, 0.012, 0.17), mats.cheese, [0, 0.012, 0], null, [0.05, 0.5, 0.05]);
    } else if (id === 'dumpling') {
      for (const x of [-0.06, 0.06]) mesh(g, dumplingGeo, mats.dumpling, [x, 0, rand(-0.03, 0.03)], [1.3, 0.75, 0.8], [0, rand(0, 3), 0]);
    } else if (id === 'fishcake') {
      for (const [x, z] of [[-0.05, 0.02], [0.05, -0.02]]) mesh(g, fishcakeGeo, [mats.fishSide, mats.fishTop, mats.fishTop], [x, 0.012, z]);
    } else if (id === 'chili') {
      for (let i = 0; i < 7; i++) mesh(g, chiliRingGeo, i % 3 ? mats.chili : mats.chiliGreen, [rand(-0.07, 0.07), 0.012, rand(-0.07, 0.07)], null, [Math.PI / 2, 0, 0]);
    }
    return g;
  }

  // ---------- 강아지 ----------
  const fuzzGeo = new THREE.SphereGeometry(1, 8, 6);
  const coneGeo = new THREE.ConeGeometry(0.035, 0.15, 6);
  function buildDog(options = {}) {
    const o = Object.assign({
      fur: 0xf6ead8, light: 0xfcf4e8, ear: 0xf9efe0, vest: 0xe2cca6,
      nose: 0x1a1412, earType: 'floppy', fuzz: 110,
    }, options);
    const furMat = new THREE.MeshStandardMaterial({ color: o.fur, map: furTex, bumpMap: furTex, bumpScale: 0.04, roughness: 1 });
    const lightMat = furMat.clone();
    lightMat.color = new THREE.Color(o.light);
    const earMat = furMat.clone();
    earMat.color = new THREE.Color(o.ear);
    const vestMat = new THREE.MeshStandardMaterial({ color: o.vest, map: knitTex, bumpMap: knitTex, bumpScale: 0.02, roughness: 1, side: THREE.DoubleSide });
    const noseMat = new THREE.MeshPhysicalMaterial({ color: o.nose, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x160d08, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blackMat = std(0x1d1d1f, { roughness: 0.5 });
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xffb3c8, transparent: true, opacity: 0.55 });
    const ownMats = [furMat, lightMat, earMat, vestMat, noseMat, eyeMat, shineMat, blackMat, cheekMat];

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    // 몸통 (앉은 자세)
    mesh(body, SPH, furMat, [0, 0.3, -0.08], [0.36, 0.3, 0.4]);
    mesh(body, SPH, furMat, [0, 0.62, 0.04], [0.31, 0.45, 0.31], [0.08, 0, 0]);
    for (const s of [-1, 1]) {
      mesh(body, SPH, furMat, [0.2 * s, 0.24, -0.02], [0.15, 0.2, 0.24]);
      mesh(body, SPH, lightMat, [0.24 * s, 0.06, 0.1], [0.1, 0.07, 0.16]);
    }
    capsule(body, 0.15, 0.22, furMat, [0, 0.98, 0.08], [0.2, 0, 0]);

    // 니트 하네스(조끼)
    mesh(body, new THREE.CylinderGeometry(0.265, 0.315, 0.27, 36, 1, true), vestMat, [0, 0.73, 0.04], [1, 1, 1.03], [0.08, 0, 0]);
    mesh(body, new THREE.TorusGeometry(0.265, 0.024, 10, 36), vestMat, [0, 0.86, 0.05], null, [Math.PI / 2 + 0.08, 0, 0]);
    mesh(body, new THREE.TorusGeometry(0.315, 0.024, 10, 36), vestMat, [0, 0.6, 0.03], null, [Math.PI / 2 + 0.08, 0, 0]);
    mesh(body, new THREE.BoxGeometry(0.05, 0.09, 0.11), blackMat, [0.33, 0.72, 0.02]);
    mesh(body, new THREE.TorusGeometry(0.045, 0.012, 8, 16), mats.steel, [0, 0.92, -0.27], null, [0.3, 0, 0]);

    // 앞다리
    const legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.14 * s, 0.6, 0.17);
      body.add(pivot);
      capsule(pivot, 0.075, 0.38, furMat, [0, -0.27, 0]);
      mesh(pivot, SPH, lightMat, [0, -0.54, 0.04], [0.09, 0.06, 0.11]);
      legs.push(pivot);
    }

    // 복슬복슬 꼬리
    const tail = new THREE.Group();
    tail.position.set(0, 0.42, -0.4);
    body.add(tail);
    for (const [y, z, r] of [[0.02, -0.04, 0.1], [0.12, -0.09, 0.12], [0.23, -0.07, 0.115], [0.3, 0.0, 0.09]]) {
      mesh(tail, SPH, lightMat, [0, y, z], [r, r, r]);
    }

    // 머리
    const head = new THREE.Group();
    head.position.set(0, 1.14, 0.12);
    body.add(head);
    mesh(head, SPH, furMat, [0, 0.14, 0], [0.33, 0.31, 0.31]);
    for (const s of [-1, 1]) {
      mesh(head, SPH, lightMat, [0.17 * s, 0.0, 0.14], [0.15, 0.14, 0.14]);
      mesh(head, SPH, lightMat, [0.08 * s, -0.08, 0.3], [0.085, 0.08, 0.08]);
      mesh(head, SPH, lightMat, [0.13 * s, 0.23, 0.22], [0.075, 0.06, 0.06]);
      mesh(head, SPH, cheekMat, [0.2 * s, 0.0, 0.25], [0.05, 0.03, 0.02], [0, 0.6 * s, 0], false);
    }
    mesh(head, SPH, lightMat, [0, 0.0, 0.25], [0.165, 0.13, 0.17]);
    mesh(head, SPH, lightMat, [0, -0.11, 0.28], [0.09, 0.07, 0.08]);
    mesh(head, SPH, noseMat, [0, 0.05, 0.405], [0.062, 0.048, 0.05]);
    mesh(head, SPH, shineMat, [-0.02, 0.07, 0.445], [0.012, 0.008, 0.006], null, false);
    const mouthGeo = new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI);
    for (const s of [-1, 1]) mesh(head, mouthGeo, noseMat, [0.03 * s, -0.035, 0.41], null, [0, 0, Math.PI], false);
    const eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(0.135 * s, 0.12, 0.27);
      head.add(e);
      mesh(e, SPH, eyeMat, [0, 0, 0], [0.068, 0.072, 0.05], null, false);
      mesh(e, SPH, shineMat, [-0.024, 0.03, 0.04], [0.014, 0.014, 0.008], null, false);
      mesh(e, SPH, shineMat, [0.022, -0.024, 0.042], [0.006, 0.006, 0.004], null, false);
      eyes.push(e);
    }
    if (o.fuzz > 0) {
      const fuzz = new THREE.InstancedMesh(fuzzGeo, lightMat, o.fuzz);
      let n = 0;
      while (n < o.fuzz) {
        const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
        if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
        v.normalize();
        if (v.y < -0.25) continue;
        if (v.z > 0.55 && v.y < 0.55) continue; // 얼굴 앞쪽은 비워 둔다
        dummy.position.set(v.x * 0.31, 0.14 + v.y * 0.29, v.z * 0.29);
        dummy.scale.setScalar(rand(0.025, 0.04));
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        fuzz.setMatrixAt(n, dummy.matrix);
        n++;
      }
      head.add(fuzz);
    }
    const ears = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.27 * s, 0.27, -0.02);
      head.add(pivot);
      if (o.earType === 'floppy') {
        mesh(pivot, SPH, earMat, [0.03 * s, -0.17, 0], [0.07, 0.22, 0.15]);
        for (let i = 0; i < 7; i++) {
          mesh(pivot, coneGeo, earMat, [0.035 * s + rand(-0.012, 0.012), -0.38 - Math.random() * 0.03, -0.11 + i * 0.037], null, [Math.PI, 0, rand(-0.2, 0.2)]);
        }
      } else {
        mesh(pivot, new THREE.ConeGeometry(0.1, 0.24, 12), earMat, [0, 0.1, 0], null, [0, 0, -0.3 * s]);
      }
      pivot.userData.side = s;
      ears.push(pivot);
    }
    // 털 뭉치끼리 그림자가 지면 얼룩처럼 보여서, 강아지는 그림자를 받지 않는다
    root.traverse((m) => { m.receiveShadow = false; });
    return { root, body, head, ears, legs, tail, eyes, floppy: o.earType === 'floppy', blink: rand(1, 4), ownMats };
  }

  function animateDog(d, t, dt, o = {}) {
    const happy = o.happy || 0;
    const sad = o.sad || 0;
    const wag = o.wag === undefined ? 0.6 : o.wag;
    const k = 1 - Math.pow(0.001, dt);
    d.body.scale.y = 1 + Math.sin(t * 2.2) * 0.012;
    d.head.rotation.z = Math.sin(t * 1.1) * 0.07 + happy * Math.sin(t * 9) * 0.12 + (o.talk ? Math.sin(t * 7) * 0.05 : 0);
    d.head.rotation.y = lerp(d.head.rotation.y, o.lookY || 0, k);
    d.head.rotation.x = lerp(d.head.rotation.x, (o.lookX || 0) + sad * 0.3, k);
    for (const e of d.ears) {
      const s = e.userData.side;
      const base = d.floppy ? s * (0.38 - sad * 0.3) : 0;
      e.rotation.z = base + s * Math.sin(t * 2 + s) * 0.04 + s * happy * Math.abs(Math.sin(t * 10)) * 0.4;
    }
    d.tail.rotation.z = Math.sin(t * (5 + wag * 12)) * (0.2 + wag * 0.25);
    d.tail.rotation.x = -sad * 0.6;
    d.blink -= dt;
    const closed = d.blink < 0.12;
    for (const e of d.eyes) e.scale.y = closed ? 0.12 : 1;
    if (d.blink < 0) d.blink = rand(2.5, 5);
    const paw = o.paw || 0;
    d.legs[1].rotation.x = -paw * 1.2;
    d.legs[1].rotation.z = paw * 0.35;
  }

  // 셰프 루이
  const louis = buildDog({ fuzz: 110 });
  louis.root.position.set(0.6, 0.72, -2.0);
  scene.add(louis.root);
  const louisState = { x: 0.6, targetX: 0.6, pawT: 0, happy: 0, sad: 0, lookY: 0.35, lookHold: 0, jumpT: 0, talkT: 0 };
  function louisDo(where) {
    louisState.pawT = 0.5;
    louisState.targetX = where === 'bowl' ? -0.05 : 0.62;
    louisState.lookY = where === 'bowl' ? -0.5 : 0.4;
    louisState.lookHold = 1.2;
  }
  function updateLouis(t, dt) {
    const s = louisState;
    const dx = s.targetX - s.x;
    const moving = Math.abs(dx) > 0.01;
    if (moving) s.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 2.2);
    let y = 0.72;
    if (moving) y += Math.abs(Math.sin(t * 14)) * 0.05;
    if (s.jumpT > 0) {
      s.jumpT -= dt;
      y += Math.max(0, Math.sin(s.jumpT * 12)) * 0.14;
    }
    louis.root.position.set(s.x, y, -2.0);
    const rotTarget = moving ? Math.sign(dx) * 0.9 : 0;
    louis.root.rotation.y = lerp(louis.root.rotation.y, rotTarget, 1 - Math.pow(0.0005, dt));
    s.pawT = Math.max(0, s.pawT - dt);
    s.lookHold -= dt;
    if (s.lookHold <= 0) {
      if (game.state === 'playing') s.lookY = customer && customer.state === 'wait' && Math.sin(t * 0.5) > 0.3 ? -0.55 : 0.3;
      else s.lookY = Math.sin(t * 0.6) * 0.2;
    }
    s.happy = Math.max(0, s.happy - dt * 0.4);
    s.sad = Math.max(0, s.sad - dt * 0.4);
    s.talkT = Math.max(0, s.talkT - dt);
    const paw = s.pawT > 0 ? Math.sin((1 - s.pawT / 0.5) * Math.PI) : 0;
    animateDog(louis, t, dt, {
      happy: Math.min(1, s.happy),
      sad: Math.min(1, s.sad),
      wag: 0.5 + s.happy + (pot.temp >= 99 ? 0.3 : 0),
      lookY: s.lookY,
      lookX: s.lookY > 0.2 && s.lookHold > 0 ? 0.25 : 0,
      paw,
      talk: s.talkT > 0,
    });
  }

  // ---------- 오디오 ----------
  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    return actx;
  }
  function ensureAudio() {
    const a = audio();
    if (a && a.state === 'suspended') a.resume();
  }
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0) {
    if (game.muted) return;
    const a = audio();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  }
  let noiseBuffer = null;
  function loopNoise(type, freq, vol) {
    if (game.muted) return null;
    const a = audio();
    if (!a) return null;
    if (!noiseBuffer) {
      noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = a.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
    return () => { try { src.stop(); } catch (e) { /* 이미 정지 */ } };
  }
  const sfx = {
    click: () => tone(660, 0.06, 'triangle', 0.12),
    plop: () => tone(320, 0.2, 'sine', 0.22, -170),
    coin: () => { tone(988, 0.08, 'square', 0.07); setTimeout(() => tone(1319, 0.18, 'square', 0.07), 80); },
    bark: () => { tone(560, 0.09, 'sawtooth', 0.07, -220); setTimeout(() => tone(620, 0.1, 'sawtooth', 0.07, -260), 130); },
    no: () => tone(260, 0.18, 'triangle', 0.12, -60),
    bad: () => tone(220, 0.35, 'triangle', 0.16, -100),
    bubble: () => tone(rand(180, 320), 0.06, 'sine', 0.05, 220),
    tick: () => tone(1200, 0.04, 'square', 0.05),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.12), i * 110)),
    sadTune: () => [392, 349, 311].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.1), i * 180)),
  };
  let stopPourSound = null;
  let stopFireSound = null;

  // ---------- 게임 상태 ----------
  const game = {
    state: 'title', paused: false, day: 1, sales: 0, timeLeft: DAY_SECONDS, timeUp: false,
    results: [], endScheduled: false, lastTick: 0,
    muted: storage.get('louis-ramen-muted', false),
    best: storage.get('louis-ramen-best', { day: 0 }),
  };
  function freshPot() {
    return {
      water: 0, temp: 20, fire: false, noodles: false, noodleShown: false,
      cook: 0, soup: false, soupMix: 0, stirSpin: 0, toppings: [],
    };
  }
  const pot = freshPot();
  let potGen = 0;
  let pouring = false;
  let customer = null;
  let nextCustomerTimer = 0;
  let lastLook = null;
  let waitHintShown = false;
  let elapsed = 0;

  const surfaceY = () => 0.02 + Math.max(pot.water, 0.005) * POT_D;
  const potWorld = (x, y, z) => potGroup.localToWorld(new THREE.Vector3(x, y, z));
  const isBoiling = () => pot.temp >= 99 && pot.water > 0.02;

  // ---------- UI ----------
  const ui = {
    hud: $('hud'), time: $('hud-time'), timerPill: $('timer-pill'), sales: $('hud-sales'), goal: $('hud-goal'), goalFill: $('goal-fill'),
    day: $('hud-day'), mute: $('btn-mute'), help: $('btn-help'),
    order: $('order-card'), orderName: $('order-name'), orderMood: $('order-mood'), orderList: $('order-list'),
    memoryBar: $('memory-bar'), memoryFill: $('memory-fill'), peek: $('btn-peek'), patience: $('patience-fill'),
    potPanel: $('pot-panel'), waterZone: $('water-zone'), waterFill: $('water-fill'), tempFill: $('temp-fill'), tempText: $('temp-text'),
    cookZone: $('cook-zone'), cookFill: $('cook-fill'),
    toolbar: $('toolbar'), toppingBtns: $('topping-btns'), fireBtn: $('btn-fire'), pourBtn: $('btn-pour'),
    noodleBtn: $('btn-noodle'), soupBtn: $('btn-soup'), serveBtn: $('btn-serve'),
    talk: $('louis-talk'), talkText: $('louis-text'), bubble: $('bubble'), floats: $('float-layer'),
    title: $('title-screen'), howto: $('howto-screen'), dayScreen: $('day-screen'), best: $('best-text'),
  };
  ui.mute.textContent = game.muted ? '🔇' : '🔊';

  const projV = new THREE.Vector3();
  function toScreen(world) {
    projV.copy(world).project(camera);
    return { x: (projV.x * 0.5 + 0.5) * window.innerWidth, y: (-projV.y * 0.5 + 0.5) * window.innerHeight };
  }
  function floatText(world, html, cls = '', delay = 0) {
    setTimeout(() => {
      const p = toScreen(world);
      const el = document.createElement('div');
      el.className = `float ${cls}`;
      el.innerHTML = html;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      ui.floats.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }, delay);
  }

  // 루이 말풍선: 첫 화면·방법·영업 끝에서는 계속, 게임 중에는 잠깐 보여 준다
  const talk = { until: 0, sticky: false };
  function louisSay(text, opts = {}) {
    ui.talkText.innerHTML = text;
    ui.talk.className = `talk${opts.warn ? ' warn' : ''}${game.state === 'playing' && !game.paused ? ' small' : ''}`;
    talk.sticky = !!opts.sticky;
    talk.until = elapsed + (opts.dur || 2.4);
    louisState.talkT = 0.8;
    ui.talk.style.animation = 'none';
    void ui.talk.offsetWidth; // 팝 애니메이션 재시작
    ui.talk.style.animation = '';
    if (opts.warn) sfx.no();
  }
  function hideTalk() {
    talk.sticky = false;
    talk.until = 0;
    ui.talk.classList.add('hidden');
  }
  const headV = new THREE.Vector3();
  function updateTalk() {
    if (!(talk.sticky || elapsed < talk.until)) {
      ui.talk.classList.add('hidden');
      return;
    }
    ui.talk.classList.remove('hidden');
    louis.head.getWorldPosition(headV);
    headV.y += 0.45;
    const p = toScreen(headV);
    const w = ui.talk.offsetWidth;
    const h = ui.talk.offsetHeight;
    const x = clamp(p.x, w / 2 + 8, window.innerWidth - w / 2 - 8);
    const y = clamp(p.y, h + 8, window.innerHeight);
    ui.talk.style.left = `${x}px`;
    ui.talk.style.top = `${y}px`;
    ui.talk.style.setProperty('--tail', `${clamp(50 + ((p.x - x) / w) * 100, 12, 88)}%`);
  }

  function renderToppingButtons() {
    ui.toppingBtns.innerHTML = '';
    const unlocked = TOPPINGS.filter((t) => t.day <= game.day);
    for (const t of TOPPINGS) props[t.id].visible = t.day <= game.day;
    unlocked.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.act = t.id;
      const key = i === 5 ? '0' : String(5 + i);
      b.innerHTML = `${t.emoji}<span>${t.name}</span><kbd>${key}</kbd>${t.day === game.day && game.day > 1 ? '<i class="badge">NEW</i>' : ''}`;
      ui.toppingBtns.appendChild(b);
    });
  }

  const orderShown = (c) => !!c && (c.reveal > 0 || c.peek > 0);

  function renderOrder() {
    const c = customer;
    if (!c || !['wait', 'served', 'eat'].includes(c.state)) {
      ui.order.classList.add('hidden');
      ui.waterZone.style.display = 'none';
      ui.cookZone.style.display = 'none';
      targetRing.visible = false;
      return;
    }
    ui.order.classList.remove('hidden');
    ui.orderName.textContent = c.name;
    const o = c.order;
    const shown = orderShown(c) || c.state !== 'wait';
    let items;
    if (shown) {
      items = [`<li>${BROTH[o.broth].label}</li>`, `<li>${DONENESS[o.done].label}</li>`];
      if (o.toppings.length === 0) items.push('<li>✨ 토핑 없이!</li>');
      for (const id of o.toppings) {
        items.push(`<li class="${pot.toppings.includes(id) ? 'done' : ''}">${TOPPING_MAP[id].emoji} ${TOPPING_MAP[id].name}</li>`);
      }
    } else {
      items = ['<li class="secret">💧 ❓</li>', '<li class="secret">🍜 ❓</li>', '<li class="secret">✨ ❓</li>'];
    }
    ui.orderList.innerHTML = items.join('');
    ui.memoryBar.classList.toggle('hidden', !(c.state === 'wait' && shown));
    ui.peek.classList.toggle('hidden', !(c.state === 'wait' && !shown));
    const target = BROTH[o.broth].target;
    ui.waterZone.style.display = shown ? '' : 'none';
    ui.waterZone.style.left = `${(target - 0.06) * 100}%`;
    ui.waterZone.style.width = '12%';
    const d = DONENESS[o.done];
    ui.cookZone.style.display = shown ? '' : 'none';
    ui.cookZone.style.left = `${(d.min / COOK_BAR_MAX) * 100}%`;
    ui.cookZone.style.width = `${((d.max - d.min) / COOK_BAR_MAX) * 100}%`;
    targetRing.visible = shown && c.state === 'wait' && !pot.noodles;
    targetRing.position.y = 0.02 + target * POT_D;
  }

  // 지금 해야 할 단계: 물 → 불 → 면 → 스프 → 토핑 → 서빙
  function nextStep() {
    if (!customer || customer.state !== 'wait') return null;
    if (!pot.noodles) {
      if (pot.water < 0.15) return 'pour';
      if (!pot.fire) return 'fire';
      return isBoiling() ? 'noodle' : 'wait';
    }
    if (!pot.soup) return 'soup';
    return 'serve';
  }

  let lastStep = '';
  function renderSteps() {
    const step = nextStep();
    const key = `${step}|${pot.noodles}|${pot.soup}|${pot.fire}|${pot.toppings.join()}`;
    if (key === lastStep) return;
    lastStep = key;
    ui.pourBtn.classList.toggle('next', step === 'pour');
    ui.fireBtn.classList.toggle('next', step === 'fire');
    ui.noodleBtn.classList.toggle('next', step === 'noodle');
    ui.soupBtn.classList.toggle('next', step === 'soup');
    ui.serveBtn.classList.toggle('next', step === 'serve');
    ui.toppingBtns.classList.toggle('next', step === 'serve');
    ui.noodleBtn.classList.toggle('done', pot.noodles);
    ui.soupBtn.classList.toggle('done', pot.soup);
    for (const b of ui.toppingBtns.children) b.classList.toggle('done', pot.toppings.includes(b.dataset.act));
    ui.fireBtn.classList.toggle('on', pot.fire);
    ui.fireBtn.querySelector('span').textContent = pot.fire ? '불 끄기' : '불 켜기';
    if (step === 'wait' && !waitHintShown) {
      waitHintShown = true;
      louisSay('보글보글 끓을 때까지 기다려 줘! ♨️');
    }
  }

  function renderHud() {
    ui.day.textContent = game.day;
    const goal = goalOf(game.day);
    ui.sales.textContent = won(game.sales);
    ui.goal.textContent = won(goal);
    ui.goalFill.style.width = `${clamp(game.sales / goal, 0, 1) * 100}%`;
    ui.goalFill.classList.toggle('done', game.sales >= goal);
  }

  function updateHudTimer() {
    const s = Math.max(0, Math.ceil(game.timeLeft));
    ui.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    ui.timerPill.classList.toggle('hurry', s <= 20 && s > 0);
    if (s <= 10 && s > 0 && s !== game.lastTick) {
      game.lastTick = s;
      sfx.tick();
    }
  }

  function updateGauges() {
    ui.waterFill.style.width = `${clamp(pot.water, 0, 1) * 100}%`;
    ui.tempFill.style.width = `${clamp((pot.temp - 20) / 80, 0, 1) * 100}%`;
    ui.tempText.textContent = isBoiling() ? '보글!' : `${Math.round(pot.temp)}°`;
    ui.cookFill.style.width = `${clamp(pot.cook / COOK_BAR_MAX, 0, 1) * 100}%`;
    const max = customer ? DONENESS[customer.order.done].max : 1.02;
    ui.cookFill.classList.toggle('over', pot.cook > max);
  }

  let lastShown = null;
  function updateBubble() {
    const c = customer;
    if (!c || c.state !== 'wait' || game.state !== 'playing') {
      ui.bubble.classList.add('hidden');
      return;
    }
    const shown = orderShown(c);
    if (shown !== lastShown) {
      lastShown = shown;
      renderOrder();
    }
    const head = c.dog.head.getWorldPosition(new THREE.Vector3());
    head.y += 0.55 * c.scale;
    const p = toScreen(head);
    const r = c.patience / c.max;
    const mood = r > 0.6 ? '😊' : r > 0.3 ? '😐' : '😣';
    if (shown) {
      const tops = c.order.toppings.map((id) => TOPPING_MAP[id].emoji).join('');
      ui.bubble.innerHTML = `${mood} ${BROTH[c.order.broth].icon} ${DONENESS[c.order.done].short}${tops ? ` + ${tops}` : ''}`;
    } else {
      ui.bubble.innerHTML = `${mood} 기억하지? 🤔`;
    }
    const half = ui.bubble.offsetWidth / 2 + 6;
    ui.bubble.style.left = `${clamp(p.x, half, window.innerWidth - half)}px`;
    ui.bubble.style.top = `${p.y}px`;
    ui.bubble.classList.remove('hidden');
    ui.orderMood.textContent = mood;
    ui.patience.style.width = `${clamp(r, 0, 1) * 100}%`;
    ui.patience.style.background = r > 0.6 ? 'var(--mint)' : r > 0.3 ? '#ffc94a' : '#ff7f8e';
    ui.memoryFill.style.width = `${clamp(c.reveal / c.revealMax, 0, 1) * 100}%`;
  }

  // ---------- 조리 동작 ----------
  function setFire(on) {
    pot.fire = on;
    fireGroup.visible = on;
    if (on && !stopFireSound) stopFireSound = loopNoise('lowpass', 380, 0.05);
    if (!on && stopFireSound) { stopFireSound(); stopFireSound = null; }
    const from = knob.rotation.z;
    const to = on ? -1.2 : 0;
    tween(0.25, (k) => { knob.rotation.z = lerp(from, to, easeOut(k)); });
  }

  function toggleFire() {
    if (!pot.fire && pot.water < 0.15) return louisSay('먼저 물을 부어 줘! 💧', { warn: true });
    setFire(!pot.fire);
    sfx.click();
    louisDo('pot');
  }

  function startPour() {
    if (game.state !== 'playing' || game.paused || pouring) return;
    ensureAudio();
    if (pot.noodles) return louisSay('면을 넣은 뒤에는 물을 더 붓지 않아요!', { warn: true });
    if (pot.water >= 1) return louisSay('냄비가 가득 찼어요!', { warn: true });
    pouring = true;
    ui.pourBtn.classList.add('pressed');
    louisDo('pot');
    stopPourSound = loopNoise('bandpass', 900, 0.08);
  }
  function stopPour() {
    if (!pouring) return;
    pouring = false;
    ui.pourBtn.classList.remove('pressed');
    if (stopPourSound) { stopPourSound(); stopPourSound = null; }
  }

  function flyTo(obj, from, toFn, dur, arc, done) {
    scene.add(obj);
    obj.position.copy(from);
    const start = from.clone();
    tween(dur, (k) => {
      obj.position.lerpVectors(start, toFn(), easeInOut(k));
      obj.position.y += Math.sin(Math.PI * k) * arc;
      obj.rotation.y += 0.12;
    }, done);
  }
  const propOrigin = (id) => props[id].position.clone().add(new THREE.Vector3(0, 0.2, 0));

  function addNoodles() {
    if (pot.noodles) return louisSay('면은 벌써 넣었어!');
    if (pot.water < 0.15) return louisSay('먼저 물을 부어 줘! 💧', { warn: true });
    if (!pot.fire) return louisSay('불을 켜 줘! 🔥', { warn: true });
    if (!isBoiling()) return louisSay('아직이야! 보글보글 끓을 때까지 기다려 ♨️', { warn: true });
    pot.noodles = true;
    louisDo('pot');
    sfx.click();
    const gen = potGen;
    const flyer = new THREE.Mesh(noodleBlockGeo, noodleBlockMat);
    flyTo(flyer, propOrigin('noodle'), () => potWorld(0, surfaceY() + 0.03, 0), 0.55, 0.7, () => {
      scene.remove(flyer);
      if (gen !== potGen) return;
      pot.noodleShown = true;
      sfx.plop();
      makeRipple();
    });
    renderOrder();
  }

  function addSoup() {
    if (pot.soup) return louisSay('스프는 벌써 넣었어!');
    if (!pot.noodles) return louisSay(pot.water < 0.15 ? '먼저 물을 부어 줘! 💧' : '면 먼저 넣어 줘! 🍜', { warn: true });
    pot.soup = true;
    louisDo('pot');
    sfx.click();
    const gen = potGen;
    const flyer = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.012), std(0xffffff, { map: soupTex }));
    flyTo(flyer, propOrigin('soup'), () => potWorld(0, surfaceY() + 0.15, 0), 0.5, 0.6, () => {
      scene.remove(flyer);
      if (gen !== potGen) return;
      sfx.plop();
      makeRipple();
    });
  }

  function addTopping(id) {
    if (pot.toppings.includes(id)) return louisSay(`${TOPPING_MAP[id].emoji} 벌써 넣었어!`);
    if (!pot.soup) return louisSay(!pot.noodles ? '토핑은 면이랑 스프 다음이야! 🍜🧂' : '스프 먼저 넣어 줘! 🧂', { warn: true });
    const slot = TOPPING_SLOTS[pot.toppings.length % TOPPING_SLOTS.length];
    pot.toppings.push(id);
    louisDo('pot');
    sfx.click();
    const gen = potGen;
    const item = makeTopping(id);
    flyTo(item, propOrigin(id), () => potWorld(slot[0], surfaceY() + 0.02, slot[1]), 0.5, 0.6, () => {
      if (gen !== potGen) { scene.remove(item); return; }
      potToppings.add(item);
      item.position.set(slot[0], 0, slot[1]);
      item.rotation.y = rand(0, Math.PI * 2);
      sfx.plop();
    });
    renderOrder();
  }

  function stirPot() {
    if (!pot.noodleShown) return;
    pot.stirSpin = 6;
    sfx.click();
    makeRipple();
  }

  function resetPot() {
    stopPour();
    if (pot.fire) setFire(false);
    Object.assign(pot, freshPot());
    potGen++;
    clearGroup(potToppings);
    noodleBlock.visible = false;
    strands.visible = false;
    water.visible = false;
    for (const b of bubbles) b.alive = false;
    waitHintShown = false;
    lastStep = '';
    renderOrder();
  }

  function trashPot() {
    if (pot.water < 0.01 && !pot.noodles) return louisSay('냄비가 벌써 비어 있어!');
    resetPot();
    sfx.plop();
    louisSay('괜찮아! 처음부터 다시 해 보자 🧽');
  }

  function peekOrder() {
    const c = customer;
    if (!c || c.state !== 'wait' || orderShown(c)) return;
    c.peek = 3;
    c.patience = Math.max(1, c.patience - 3);
    sfx.click();
    renderOrder();
  }

  // ---------- 평가 ----------
  function evaluate(order) {
    const issues = [];
    let score = 0;

    const target = BROTH[order.broth].target;
    const diff = pot.water - target;
    const ad = Math.abs(diff);
    score += ad <= 0.06 ? 30 : ad <= 0.12 ? 18 : ad <= 0.2 ? 8 : 0;
    if (diff > 0.12) issues.push([2, '국물이 너무 많아요 💧']);
    if (diff < -0.12) issues.push([2, '국물이 너무 적어요…']);

    const d = DONENESS[order.done];
    const c = pot.cook;
    if (c < 0.4) issues.push([4, '면이 딱딱해요! 😣']);
    else if (c > 1.1) issues.push([4, '면이 퉁퉁 불었어요… 😵']);
    else if (c >= d.min && c <= d.max) score += 40;
    else {
      score += c >= d.min - 0.08 && c <= d.max + 0.08 ? 22 : 8;
      issues.push([3, c < d.min ? '면이 조금 덜 익었어요' : '면이 조금 많이 익었어요']);
    }

    const want = order.toppings;
    const have = pot.toppings;
    const got = want.filter((id) => have.includes(id)).length;
    const extra = have.filter((id) => !want.includes(id));
    let ts = want.length ? (30 * got) / want.length : 30;
    ts = Math.max(0, ts - extra.length * 10);
    score += ts;
    if (got < want.length) {
      const miss = want.find((id) => !have.includes(id));
      issues.push([3, `${TOPPING_MAP[miss].emoji} ${TOPPING_MAP[miss].name}이(가) 없어요!`]);
    }
    if (extra.length) issues.push([2, `${TOPPING_MAP[extra[0]].emoji} 이건 안 시켰는데요?`]);

    score = Math.round(clamp(score, 0, 100));
    issues.sort((a, b) => b[0] - a[0]);
    return { score, comment: score >= 90 || !issues.length ? pick(PRAISE) : issues[0][1] };
  }
  const starsOf = (score) => (score >= 90 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0);

  // ---------- 손님 ----------
  function makeOrder() {
    const unlocked = TOPPINGS.filter((t) => t.day <= game.day).map((t) => t.id);
    const maxT = Math.min(unlocked.length, 1 + Math.floor(game.day / 2));
    let n = randInt(0, maxT);
    if (n === 0 && Math.random() < 0.6) n = 1;
    return {
      broth: pick(Object.keys(BROTH)),
      done: pick(Object.keys(DONENESS)),
      toppings: shuffle(unlocked).slice(0, n),
    };
  }

  function spawnCustomer() {
    let look;
    do { look = pick(LOOKS); } while (look === lastLook);
    lastLook = look;
    const dog = buildDog(Object.assign({}, look, { fuzz: 50 }));
    const scale = 0.85;
    dog.root.scale.setScalar(scale);
    dog.root.position.set(-8, 0, SEAT.z);
    dog.root.rotation.y = Math.PI / 2;
    scene.add(dog.root);
    const max = Math.max(40, 75 - (game.day - 1) * 5);
    const revealMax = Math.max(5, 10 - (game.day - 1));
    customer = {
      dog, scale, name: look.name, order: makeOrder(), patience: max, max,
      reveal: revealMax, revealMax, peek: 0, state: 'enter', x: -8, t: 0, stars: 0, bowl: null,
    };
  }

  function removeCustomer() {
    const c = customer;
    if (!c) return;
    scene.remove(c.dog.root);
    for (const m of c.dog.ownMats) m.dispose();
    customer = null;
    nextCustomerTimer = 1.2;
    renderOrder();
  }

  function customerLeave(c) {
    c.state = 'leave';
    c.t = 0;
    lastShown = null;
    renderOrder();
  }

  function customerAngry(c) {
    c.stars = 0;
    game.results.push({ name: c.name, stars: 0, note: 'angry' });
    const head = c.dog.head.getWorldPosition(new THREE.Vector3());
    floatText(head.add(new THREE.Vector3(0, 0.5, 0)), '😠 너무 늦어요!', 'big');
    sfx.bad();
    louisState.sad = 1.5;
    louisSay('앗, 손님이 가 버렸어… 다음엔 더 빨리!');
    customerLeave(c);
  }

  function updateCustomer(t, dt) {
    const c = customer;
    if (!c) return;
    c.t += dt;
    const d = c.dog;
    let happy = 0;
    let sad = 0;
    let lookX = 0;
    let lookY = 0;
    if (c.state === 'enter') {
      c.x = Math.min(SEAT.x, c.x + dt * 2.4);
      d.root.position.set(c.x, Math.abs(Math.sin(c.t * 9)) * 0.12, SEAT.z);
      d.root.rotation.y = Math.PI / 2;
      if (c.x >= SEAT.x) { c.state = 'sit'; c.t = 0; }
    } else if (c.state === 'sit') {
      const k = Math.min(1, c.t / 0.4);
      d.root.position.y = k * SEAT.y + Math.sin(k * Math.PI) * 0.35;
      d.root.rotation.y = lerp(Math.PI / 2, 0.35, k);
      if (k >= 1) {
        c.state = 'wait';
        sfx.bark();
        lastShown = null;
        renderOrder();
        louisSay(`${c.name} 손님 주문이야! 잘 기억해 👀`);
      }
    } else if (c.state === 'wait') {
      if (c.reveal > 0) {
        c.reveal -= dt;
        if (c.reveal <= 0) louisSay('주문 기억났지? 잊으면 👀 다시 보기!', { dur: 2 });
      }
      if (c.peek > 0) c.peek -= dt;
      c.patience -= dt;
      const r = c.patience / c.max;
      sad = r < 0.3 ? 0.7 : 0;
      lookY = 0.3;
      if (c.patience <= 0) customerAngry(c);
    } else if (c.state === 'eat') {
      lookX = 0.45 + Math.sin(t * 14) * 0.12;
      happy = 0.2;
    } else if (c.state === 'react') {
      happy = c.stars >= 2 ? 1 : 0;
      sad = c.stars <= 1 ? 1 : 0;
    } else if (c.state === 'leave') {
      if (c.t < 0.4) {
        const k = c.t / 0.4;
        d.root.position.y = Math.max(0, SEAT.y * (1 - k) + Math.sin(k * Math.PI) * 0.3);
        d.root.rotation.y = lerp(0.35, -Math.PI / 2, k);
      } else {
        c.x -= dt * 2.8;
        d.root.position.set(c.x, Math.abs(Math.sin(c.t * 9)) * 0.12, SEAT.z);
        d.root.rotation.y = -Math.PI / 2;
        if (c.x < -8.5) removeCustomer();
      }
    }
    animateDog(d, t, dt, { happy, sad, wag: happy ? 1.5 : sad ? 0 : 0.6, lookX, lookY });
  }

  // ---------- 서빙 ----------
  function buildBowl() {
    const g = new THREE.Group();
    mesh(g, bowlGeo, bowlMat, [0, 0, 0]);
    mesh(g, bowlRimGeo, mats.pinkDeep, [0, 0.2, 0], null, [Math.PI / 2, 0, 0]);
    const contents = new THREE.Group();
    contents.position.y = 0.165;
    g.add(contents);
    const soupMat = new THREE.MeshStandardMaterial({ color: waterMat.color.clone(), roughness: 0.2 });
    mesh(contents, new THREE.CircleGeometry(0.265, 32), soupMat, [0, 0, 0], null, [-Math.PI / 2, 0, 0], false);
    const ns = strands.clone();
    const nm = noodleMat.clone();
    ns.traverse((m) => { if (m.isMesh) m.material = nm; });
    ns.visible = true;
    ns.scale.set(0.8, 1, 0.8);
    ns.position.y = 0.005;
    contents.add(ns);
    for (const tp of potToppings.children) {
      const cl = tp.clone();
      cl.position.set(tp.position.x * 0.8, 0.015, tp.position.z * 0.8);
      contents.add(cl);
    }
    g.userData.contents = contents;
    return g;
  }

  function serve() {
    const c = customer;
    if (!c || c.state !== 'wait') return louisSay('손님이 앉으면 내줄 수 있어!');
    if (!pot.noodleShown) return louisSay(pot.water < 0.15 ? '먼저 물을 부어 줘! 💧' : '아직 면이 없어! 🍜', { warn: true });
    if (!pot.soup) return louisSay('스프를 안 넣었어! 🧂', { warn: true });
    const res = evaluate(c.order);
    const bowl = buildBowl();
    resetPot();
    c.state = 'served';
    ui.bubble.classList.add('hidden');
    renderOrder();
    louisDo('bowl');
    sfx.click();
    scene.add(bowl);
    bowl.position.copy(BOWL_START);
    wait(0.35, () => {
      const from = bowl.position.clone();
      tween(0.9, (k) => {
        bowl.position.lerpVectors(from, TABLE_POS, easeInOut(k));
        bowl.position.y += Math.sin(Math.PI * k) * 0.9;
        bowl.rotation.y = k * Math.PI * 2;
      }, () => {
        sfx.plop();
        c.state = 'eat';
        c.bowl = bowl;
        tween(2.0, (k) => bowl.userData.contents.scale.setScalar(Math.max(0.05, 1 - k * 0.9)), () => finishCustomer(c, res));
      });
    });
  }

  function finishCustomer(c, res) {
    const stars = starsOf(res.score);
    c.stars = stars;
    c.state = 'react';
    const tip = stars === 3 && c.patience / c.max > 0.5 ? 500 : 0;
    const earned = stars * PRICE_PER_STAR + tip;
    const goal = goalOf(game.day);
    const before = game.sales;
    game.sales += earned;
    game.results.push({ name: c.name, stars });
    renderHud();
    const head = c.dog.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.55, 0));
    floatText(head, `${stars ? '⭐'.repeat(stars) : '💧'}<br><small>${res.comment}</small>`, 'big');
    if (earned) floatText(head.clone().add(new THREE.Vector3(0.7, -0.3, 0)), `+${won(earned)}원${tip ? ' 💝팁' : ''}`, 'coin', 450);
    if (stars === 3) {
      for (let i = 0; i < 5; i++) floatText(head.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.3, 0.2), 0)), '❤️', '', 150 + i * 120);
      sfx.fanfare();
    } else if (stars >= 1) {
      sfx.coin();
    } else {
      sfx.bad();
    }
    if (stars >= 2) {
      louisState.happy = 2;
      louisState.jumpT = 1.0;
      setTimeout(sfx.bark, 300);
      louisSay(stars === 3 ? '우와, 완벽해! 🥰' : '잘했어! 👍');
    } else {
      louisState.sad = 2;
      louisSay('괜찮아, 다음엔 더 잘할 수 있어! 💪');
    }
    if (game.sales >= goal && before < goal) {
      wait(1.6, () => { if (game.state === 'playing') louisSay('목표 달성! 🎉 남은 시간도 힘내자!'); });
    }
    wait(1.6, () => {
      if (c.bowl) scene.remove(c.bowl);
      customerLeave(c);
    });
  }

  // ---------- 하루 진행 ----------
  function showGameUi(show) {
    for (const el of [ui.hud, ui.potPanel, ui.toolbar]) el.classList.toggle('hidden', !show);
    if (!show) {
      ui.order.classList.add('hidden');
      ui.bubble.classList.add('hidden');
    }
  }

  function startDay() {
    if (customer) {
      scene.remove(customer.dog.root);
      customer = null;
    }
    game.state = 'playing';
    game.paused = false;
    game.sales = 0;
    game.timeLeft = DAY_SECONDS;
    game.timeUp = false;
    game.results = [];
    game.endScheduled = false;
    game.lastTick = 0;
    resetPot();
    renderToppingButtons();
    renderHud();
    updateHudTimer();
    nextCustomerTimer = 1.5;
    view.mode = 'main';
    showGameUi(true);
    ui.title.classList.add('hidden');
    ui.dayScreen.classList.add('hidden');
    ui.howto.classList.add('hidden');
    hideTalk();
    louisSay(`${game.day}일째 영업 시작! 3분 안에 ${won(goalOf(game.day))}원 모으자! 💪`, { dur: 3 });
  }

  function endDay() {
    game.state = 'dayEnd';
    resetPot();
    showGameUi(false);
    view.mode = 'close';
    const goal = goalOf(game.day);
    const success = game.sales >= goal;
    $('result-big').textContent = success ? '🎉🍜🎉' : '😢🍜';
    $('result-sales').textContent = won(game.sales);
    $('result-goal').textContent = won(goal);
    $('result-bowls').innerHTML = game.results.length
      ? game.results.map((r) => (r.note ? '😠' : r.stars ? '⭐'.repeat(r.stars) : '💧')).join(' · ')
      : '손님이 없었어요';
    const btn = $('btn-next');
    btn.textContent = success ? '다음 날 ▶' : '다시 도전 ↺';
    btn.dataset.success = success ? '1' : '';
    ui.dayScreen.classList.remove('hidden');
    if (success) {
      const next = TOPPINGS.filter((t) => t.day === game.day + 1);
      const extra = next.length ? `<br>내일은 ${next.map((t) => `${t.emoji} ${t.name}`).join(', ')}도 나와!` : '';
      louisSay(`우와! 목표 달성! 넌 최고의 셰프야! 🎉${extra}`, { sticky: true });
      louisState.happy = 3;
      louisState.jumpT = 1.2;
      sfx.fanfare();
      if (game.day > (game.best.day || 0)) {
        game.best = { day: game.day };
        storage.set('louis-ramen-best', game.best);
      }
    } else {
      louisSay(`아깝다! ${won(goal - game.sales)}원만 더 모으면 됐어.<br>다시 해 보자! 💪`, { sticky: true });
      louisState.sad = 2;
      sfx.sadTune();
    }
  }

  function updateGame(t, dt) {
    if (game.state !== 'playing') return;
    if (!game.timeUp) {
      game.timeLeft -= dt;
      updateHudTimer();
      if (game.timeLeft <= 0) {
        game.timeLeft = 0;
        game.timeUp = true;
        stopPour();
        louisSay('땡! 영업 시간 끝! ⏰');
        if (customer && ['enter', 'sit', 'wait'].includes(customer.state)) customerLeave(customer);
      }
    }
    if (!customer) {
      if (!game.timeUp) {
        nextCustomerTimer -= dt;
        if (nextCustomerTimer <= 0) spawnCustomer();
      } else if (!game.endScheduled) {
        game.endScheduled = true;
        wait(0.8, endDay);
      }
    }
  }

  // ---------- 냄비 ----------
  let bubbleSoundAcc = 0;
  function updatePot(t, dt) {
    if (game.state === 'playing') {
      if (pouring) {
        if (pot.water >= 1) {
          stopPour();
          louisSay('넘치겠어! 💦', { warn: true });
        } else {
          const add = dt * 0.3;
          const w0 = pot.water;
          pot.water = Math.min(1, w0 + add);
          if (w0 + add > 0) pot.temp = (pot.temp * w0 + 20 * add) / (w0 + add);
        }
      }
      if (pot.fire && pot.water > 0.02) {
        pot.temp = Math.min(100, pot.temp + (dt * 12) / (0.3 + pot.water));
        if (pot.temp >= 100) pot.water = Math.max(0.03, pot.water - dt * 0.003);
      } else if (!pot.fire) {
        pot.temp = Math.max(20, pot.temp - dt * 3);
      }
      if (pot.noodles) {
        const rate = pot.temp >= 98 ? 1 : pot.temp >= 75 ? 0.45 : pot.temp >= 50 ? 0.15 : 0.03;
        pot.cook += (dt * rate) / COOK_TIME;
      }
    }

    const surf = surfaceY();
    water.visible = pot.water > 0.005;
    water.scale.y = Math.max(0.001, pot.water * POT_D);
    pot.soupMix = lerp(pot.soupMix, pot.soup ? 1 : 0, 1 - Math.pow(0.2, dt));
    waterMat.color.set(0xa8daf0).lerp(new THREE.Color(0xf07a4a), pot.soupMix);
    waterMat.opacity = 0.7 + pot.soupMix * 0.22;

    const boiling = isBoiling();
    const k = clamp(pot.cook / 0.45, 0, 1);
    const over = clamp((pot.cook - 0.9) / 0.3, 0, 1);
    noodleBlock.visible = pot.noodleShown && k < 0.95;
    noodleBlock.scale.set(1 - k * 0.7, 1 - k * 0.5, 1 - k * 0.7);
    noodleBlock.position.y = surf - 0.02 + (boiling ? Math.sin(t * 12) * 0.006 : 0);
    strands.visible = pot.noodleShown && k > 0.05;
    const sc = (0.35 + 0.65 * k) * (1 + over * 0.15);
    strands.scale.set(sc, 1, sc);
    strands.position.y = surf - 0.012;
    noodleMat.color.set(0xf2cf6b).lerp(new THREE.Color(0xf7e6b5), over);
    pot.stirSpin *= Math.pow(0.15, dt);
    strands.rotation.y += (pot.stirSpin + (boiling ? 0.25 : 0)) * dt;
    noodleBlock.rotation.y += pot.stirSpin * dt;
    potToppings.position.y = surf + 0.002 + (boiling ? Math.sin(t * 10) * 0.005 : 0);
    potToppings.rotation.y += pot.stirSpin * dt * 0.5;
    targetRingMat.opacity = 0.55 + Math.sin(t * 6) * 0.3;

    const rate = boiling ? 70 : pot.water > 0.02 && pot.temp > 75 ? (pot.temp - 75) * 1.5 : 0;
    bubbleAcc += rate * dt;
    while (bubbleAcc > 1) {
      bubbleAcc -= 1;
      const b = bubbles.find((x) => !x.alive);
      if (!b) break;
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * (POT_R - 0.04);
      Object.assign(b, { alive: true, x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.03, v: rand(0.5, 1.0), s: rand(0.008, 0.02) });
    }
    for (let i = 0; i < BUBBLE_N; i++) {
      const b = bubbles[i];
      if (b.alive) {
        b.y += b.v * dt;
        if (b.y > surf) {
          b.alive = false;
          bubbleSoundAcc += 1;
        }
      }
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.setScalar(b.alive ? b.s * (1 + (b.y / Math.max(surf, 0.05)) * 1.2) : 0);
      dummy.updateMatrix();
      bubbleMesh.setMatrixAt(i, dummy.matrix);
    }
    bubbleMesh.instanceMatrix.needsUpdate = true;
    if (boiling && bubbleSoundAcc > 6) {
      bubbleSoundAcc = 0;
      if (Math.random() < 0.5) sfx.bubble();
    }

    const steamAmt = pot.water > 0.02 ? clamp((pot.temp - 55) / 45, 0, 1) : 0;
    for (const sp of steamSprites) {
      const u = sp.userData;
      u.life += dt * u.speed * 0.6;
      if (u.life > 1) { u.life = 0; u.x = rand(-0.2, 0.2); u.z = rand(-0.2, 0.2); }
      sp.position.set(u.x + Math.sin(t + u.z * 10) * 0.05 * u.life, surf + u.life * 1.1, u.z);
      sp.scale.setScalar(0.15 + u.life * 0.5);
      sp.material.opacity = steamAmt * 0.5 * Math.sin(Math.PI * u.life);
    }

    if (pot.fire) {
      flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 25 + i * 1.7) * 0.2 + Math.random() * 0.1; });
      fireLight.intensity = 1.2 + Math.sin(t * 30) * 0.2;
    } else {
      fireLight.intensity = 0;
    }

    kettleK = clamp(kettleK + (pouring ? dt : -dt) * 4, 0, 1);
    const kk = easeInOut(kettleK);
    kettle.position.lerpVectors(KETTLE_HOME, KETTLE_POUR, kk);
    kettle.rotation.z = kk * 0.7;
    stream.visible = pouring && kettleK > 0.9;
    if (stream.visible) {
      const from = spoutTip.getWorldPosition(new THREE.Vector3());
      const to = potWorld(0.12, surf, 0);
      const dir = to.clone().sub(from);
      const len = dir.length();
      stream.position.copy(from);
      stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      stream.scale.set(1, len, 1);
      if (Math.random() < dt * 8) makeRipple();
    }
  }

  // ---------- 세계 애니메이션 ----------
  function updateWorld(t, dt) {
    for (const c of clouds) {
      c.g.position.x += c.speed * dt;
      if (c.g.position.x > 26) c.g.position.x = -26;
    }
    for (const f of floaters) {
      f.m.position.y = f.y + Math.sin(t * 0.8 + f.phase) * 0.25;
      f.m.rotation.y = t * f.spin + f.phase;
      f.m.rotation.z = Math.sin(t * 0.6 + f.phase) * 0.2;
    }
    bulbs.forEach((b, i) => {
      const s = 1 + 0.25 * Math.max(0, Math.sin(t * 3 + i));
      b.scale.set(0.05 * s, 0.065 * s, 0.05 * s);
    });
    norenPanels.forEach((p, i) => { p.rotation.x = Math.sin(t * 1.3 + i) * 0.08; });
  }

  // ---------- 입력: 마우스 · 터치 ----------
  const raycaster = new THREE.Raycaster();
  raycaster.camera = camera;
  const pointer = new THREE.Vector2();
  function isShown(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }
  function pickAction(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables, true);
    for (const h of hits) {
      if (h.object.isSprite || !isShown(h.object)) continue;
      let o = h.object;
      while (o && !o.userData.action) o = o.parent;
      if (o) return o;
    }
    return null;
  }
  let hovered = null;
  const canPlay = () => game.state === 'playing' && !game.paused;
  canvas.addEventListener('pointermove', (e) => {
    if (!canPlay()) return;
    const o = pickAction(e);
    canvas.style.cursor = o ? 'pointer' : 'default';
    if (hovered && hovered !== o) hovered.scale.setScalar(1);
    hovered = o && o !== potGroup ? o : null;
    if (hovered) hovered.scale.setScalar(1.08);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!canPlay()) return;
    const o = pickAction(e);
    if (!o) return;
    if (o.userData.action === 'pour') startPour();
    else act(o.userData.action);
  });
  window.addEventListener('pointerup', stopPour);
  window.addEventListener('pointercancel', stopPour);
  window.addEventListener('blur', stopPour);

  ui.toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.dataset.act === 'pour') return;
    act(b.dataset.act);
  });
  ui.pourBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startPour();
  });
  ui.pourBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  ui.peek.addEventListener('click', peekOrder);

  function act(a) {
    if (!canPlay()) return;
    ensureAudio();
    if (a === 'fire') return toggleFire();
    if (a === 'noodle') return addNoodles();
    if (a === 'soup') return addSoup();
    if (a === 'serve') return serve();
    if (a === 'trash') return trashPot();
    if (a === 'pot') return stirPot();
    if (a === 'peek') return peekOrder();
    if (TOPPING_MAP[a] && TOPPING_MAP[a].day <= game.day) return addTopping(a);
  }

  // ---------- 입력: 키보드 ----------
  const KEY_ACTS = { '2': 'fire', '3': 'noodle', '4': 'soup', Enter: 'serve', ' ': 'serve', Backspace: 'trash', Delete: 'trash', q: 'peek', Q: 'peek', 'ㅂ': 'peek' };
  const TOPPING_KEYS = ['5', '6', '7', '8', '9', '0'];
  window.addEventListener('keydown', (e) => {
    if (!ui.howto.classList.contains('hidden')) {
      if (['ArrowRight', 'Enter', ' '].includes(e.key)) { e.preventDefault(); howtoGo(1); }
      else if (e.key === 'ArrowLeft') howtoGo(-1);
      else if (e.key === 'Escape') closeHowto();
      return;
    }
    if (game.state === 'title') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); }
      return;
    }
    if (game.state === 'dayEnd') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextDay(); }
      return;
    }
    if (!canPlay()) return;
    if (e.key === '1') {
      e.preventDefault();
      if (!e.repeat) startPour();
      return;
    }
    if (e.repeat) return;
    const ti = TOPPING_KEYS.indexOf(e.key);
    if (ti >= 0) {
      const t = TOPPINGS.filter((x) => x.day <= game.day)[ti];
      if (t) act(t.id);
      return;
    }
    if (KEY_ACTS[e.key]) {
      e.preventDefault();
      act(KEY_ACTS[e.key]);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === '1') stopPour();
  });

  // ---------- 화면: 첫 화면 · 방법 · 영업 끝 ----------
  let howtoIndex = 0;
  function renderHowto() {
    const step = HOWTO[howtoIndex];
    $('howto-icon').textContent = step.icon;
    $('howto-dots').innerHTML = HOWTO.map((_, i) => `<i class="${i === howtoIndex ? 'on' : ''}"></i>`).join('');
    $('howto-prev').disabled = howtoIndex === 0;
    $('howto-next').textContent = howtoIndex === HOWTO.length - 1 ? (game.paused ? '계속하기 ▶' : '알겠어! ✔') : '다음 ▶';
    louisSay(step.text, { sticky: true });
  }
  function openHowto() {
    howtoIndex = 0;
    ui.howto.classList.remove('hidden');
    if (game.state === 'playing') {
      game.paused = true;
      stopPour();
      showGameUi(false);
    } else {
      ui.title.classList.add('hidden');
    }
    view.mode = 'close';
    renderHowto();
  }
  function closeHowto() {
    ui.howto.classList.add('hidden');
    hideTalk();
    if (game.paused) {
      game.paused = false;
      view.mode = 'main';
      showGameUi(true);
      lastShown = null;
      renderOrder();
    } else {
      showTitle();
    }
  }
  function howtoGo(dir) {
    const next = howtoIndex + dir;
    if (next < 0) return;
    if (next >= HOWTO.length) return closeHowto();
    howtoIndex = next;
    sfx.click();
    renderHowto();
  }
  function showTitle() {
    game.state = 'title';
    view.mode = 'close';
    ui.title.classList.remove('hidden');
    ui.best.textContent = game.best.day > 0 ? `🏆 최고 기록: ${game.best.day}일째까지 성공!` : '';
    louisSay('안녕! 나는 말티즈 <b>루이</b>야 🐶<br>나랑 같이 맛있는 라면 끓이자!', { sticky: true });
  }
  function startGame() {
    if (game.state !== 'title') return;
    ensureAudio();
    game.day = 1;
    sfx.bark();
    startDay();
  }
  function nextDay() {
    if (game.state !== 'dayEnd') return;
    ensureAudio();
    if ($('btn-next').dataset.success) game.day++;
    startDay();
  }

  $('btn-start').addEventListener('click', startGame);
  $('btn-howto').addEventListener('click', () => { ensureAudio(); sfx.click(); openHowto(); });
  $('howto-next').addEventListener('click', () => howtoGo(1));
  $('howto-prev').addEventListener('click', () => howtoGo(-1));
  $('btn-next').addEventListener('click', nextDay);
  ui.help.addEventListener('click', () => { if (canPlay()) openHowto(); });
  ui.mute.addEventListener('click', () => {
    game.muted = !game.muted;
    ui.mute.textContent = game.muted ? '🔇' : '🔊';
    storage.set('louis-ramen-muted', game.muted);
    if (game.muted) {
      if (stopFireSound) { stopFireSound(); stopFireSound = null; }
      if (stopPourSound) { stopPourSound(); stopPourSound = null; }
    } else if (pot.fire) {
      stopFireSound = loopNoise('lowpass', 380, 0.05);
    }
  });

  // ---------- 메인 루프 ----------
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const t = elapsed;
    const gdt = game.paused ? 0 : dt;

    updateTweens(gdt);
    updateGame(t, gdt);
    updatePot(t, gdt);
    updateLouis(t, dt);
    updateCustomer(t, gdt);
    updateWorld(t, dt);

    // 카메라: 첫 화면·방법·영업 끝에선 루이 클로즈업, 게임 중엔 가게 전체
    const camPos = view.mode === 'close' ? view.closePos : view.mainPos;
    const camLook = view.mode === 'close' ? view.closeLook : view.mainLook;
    const ck = 1 - Math.pow(0.08, dt);
    camera.position.lerp(camPos, ck);
    view.look.lerp(camLook, ck);
    camera.lookAt(view.look);

    if (game.state === 'playing' && !game.paused) {
      updateGauges();
      updateBubble();
      renderSteps();
    }
    updateTalk();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  showTitle();
  frame();
})();
