// Pixo: un robot cardenal beisbolero en pixel art que vive en un panel de Claude Code.
// Flota, pestañea y mira alrededor mientras Claude trabaja, saluda cuando
// termina una respuesta y avisa cuando Claude necesita tu permiso.
// Cada sesión tiene su propio plumaje: dentro de herdr lo elige por pane/agente,
// fuera de herdr por repositorio; /pixo color y /pixo nombre lo fijan a mano.

const PANE = 'pixo'
const W = 40              // ancho de la escena en píxeles
const H = 46              // alto en píxeles (par: cada fila de celdas dibuja 2 px)
const ROWS = H / 2
const HALF = '▀'.codePointAt(0)   // bloque superior: color = píxel de arriba, fondo = píxel de abajo
const TICK_MS = 100

// ---------- Paleta ----------
const P = {
  K: 0x1b1b2f, B: 0xe03a3a, b: 0xa82828, L: 0xff7b6b, S: 0x17171f,
  O: 0xff9f1c, o: 0xd97c12, E: 0xc8fcff, Y: 0xffe066,
  F: 0xffd65c, f: 0xff8c42, g: 0xff4d5e, X: 0xf3eccb, x: 0xd8cf9c,
  C: 0x2d4f91, c: 0x1b2f5c,   // gorra
  W: 0xc9a06a, w: 0x8f6a3e,   // bate de madera
  Q: 0xf4f4f4,                // pelota
  V: 0xb5733a, v: 0x8a5327,   // guante de cuero
}
const HORIZON = 43            // referencia del piso: la pelota cae a HORIZON-4 y la sombra va en HORIZON+2
const SHADOW = 0x6e4a2b

function rng(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Hora del día ----------
// Pixo mira el reloj de tu Mac: amanecer 6-7, día 8-16, atardecer 17-19, noche el resto
const PHASES = ['night', 'dawn', 'day', 'dusk']
const PHASE_ALIASES = { noche: 'night', amanecer: 'dawn', dia: 'day', 'día': 'day', atardecer: 'dusk', tarde: 'dusk', auto: 'auto' }
let forcePhase = 'auto'
// Equipo: bate o guante. En auto, bate mientras espera tu turno y guante en cuanto sale al campo
const GEAR_ALIASES = { bate: 'bat', bat: 'bat', guante: 'glove', glove: 'glove', auto: 'auto' }
let gearPref = 'auto'
function currentGear() {
  if (gearPref !== 'auto') return gearPref
  return st.mode === 'idle' || st.mode === 'bye' ? 'bat' : 'glove'
}
function phaseNow() {
  if (forcePhase !== 'auto') return forcePhase
  const h = new Date().getHours()
  if (h >= 6 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

// Colores del estadio según la hora
const THEMES = {
  night: {
    sky: [0x16103a, 0x1f2160, 0x27467f, 0x3a6f93],
    roof: 0x1b1b2f, seatA: 0x2a2d4a, seatB: 0x343857, rail: 0x454a6b,
    pole: 0x3a3f55, lamp: 0xfff3a3, glow: 0xffe066, lampOff: null,
    track: 0x6e4a2b, grassA: 0x2b6b3a, grassB: 0x245e33, dirt: 0x7d5634, base: 0xcfcfcf,
    crowd: [0x8a8aa8, 0x9a7f6a, 0x6f8aa0, 0xa08a6a], cloud: null, sun: null,
  },
  dawn: {
    sky: [0x3b2a6e, 0x7a4a8a, 0xd8798a, 0xf3b07a],
    roof: 0x2e2f4a, seatA: 0x474a6b, seatB: 0x555a7e, rail: 0x6a6f93,
    pole: 0x474b63, lamp: 0x9aa3bb, glow: null, lampOff: 0x9aa3bb,
    track: 0x9a6a3a, grassA: 0x3f9f4e, grassB: 0x379247, dirt: 0xb8804d, base: 0xf4f4f4,
    crowd: [0xffd9c0, 0xf2c14e, 0xe8e8ff, 0xd95f5f], cloud: 0xffd9c0, sun: { x: 29, y: 16, c: 0xffd27a, c2: 0xffb04a },
  },
  day: {
    sky: [0x5fb2ff, 0x8ccbff, 0xb6e0ff, 0xd9f1ff],
    roof: 0x3b4a66, seatA: 0x56637f, seatB: 0x68769a, rail: 0x8d99b8,
    pole: 0x4a526b, lamp: 0x9aa3bb, glow: null, lampOff: 0x9aa3bb,
    track: 0x9a6a3a, grassA: 0x3f9f4e, grassB: 0x379247, dirt: 0xb8804d, base: 0xf4f4f4,
    crowd: [0xffffff, 0xf2c14e, 0xd95f5f, 0x4a8fe0], cloud: 0xffffff, sun: { x: 30, y: 3, c: 0xffe066, c2: 0xffd23f },
  },
  dusk: {
    sky: [0x2b2250, 0x7a3a6e, 0xd96a5a, 0xf2a65a],
    roof: 0x23203a, seatA: 0x3a3658, seatB: 0x47426b, rail: 0x5c5781,
    pole: 0x3f4259, lamp: 0xfff3a3, glow: 0xffe066, lampOff: null,
    track: 0x8a5e34, grassA: 0x377e42, grassB: 0x2f713a, dirt: 0xa06f42, base: 0xe6e6e6,
    crowd: [0xffc9a0, 0xf2c14e, 0xd0d0f0, 0xd95f5f], cloud: 0xffb48a, sun: { x: 29, y: 16, c: 0xffb04a, c2: 0xff8a3a },
  },
}

// ---------- Fondo: un estadio de béisbol que cambia con la hora ----------
const BAYER = [[0, 2], [3, 1]]
const SKY_ROWS = 22
const crowdRand = rng(77)
const CROWD = []
for (let i = 0; i < 34; i++) {
  CROWD.push({ x: Math.floor(crowdRand() * W), y: 25 + Math.floor(crowdRand() * 6), c: Math.floor(crowdRand() * 4) })
}
const bgCache = new Map()
function bgFor(phase, wallColor) {
  const cacheKey = phase + ':' + wallColor
  if (bgCache.has(cacheKey)) return bgCache.get(cacheKey)
  const T = THEMES[phase] || THEMES.night
  const out = new Array(W * H)
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) out[y * W + x] = c }
  const fillRow = (y, c) => { for (let x = 0; x < W; x++) put(x, y, c) }

  // Cielo con degradado punteado
  for (let y = 0; y < SKY_ROWS; y++) {
    const f = (y / (SKY_ROWS - 1)) * (T.sky.length - 1)
    const i = Math.floor(f)
    const fr = f - i
    for (let x = 0; x < W; x++) {
      const th = (BAYER[y & 1][x & 1] + 0.5) / 4
      put(x, y, i < T.sky.length - 1 && fr > th ? T.sky[i + 1] : T.sky[i])
    }
  }
  // Sol (de día y en los cambios de luz) y nubes
  if (T.sun) {
    const r = 3
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy
      if (d <= r * r + 1 && T.sun.y + dy < SKY_ROWS) put(T.sun.x + dx, T.sun.y + dy, d > r * r - 3 ? T.sun.c2 : T.sun.c)
    }
  }
  if (T.cloud) {
    for (const [cx, cy] of [[3, 5], [19, 9]]) {
      for (let x = 1; x < 5; x++) put(cx + x, cy, T.cloud)
      for (let x = 0; x < 6; x++) put(cx + x, cy + 1, T.cloud)
    }
  }
  // Torres de luz
  for (const tx of [5, 34]) {
    for (let y = 11; y < SKY_ROWS; y++) put(tx, y, T.pole)
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 2; dy++) put(tx + dx, 9 + dy, T.lamp)
    put(tx - 2, 10, T.pole); put(tx + 2, 10, T.pole)
    if (T.glow) { put(tx - 2, 9, T.glow); put(tx + 2, 9, T.glow); put(tx, 8, T.glow); put(tx - 1, 11, T.glow); put(tx + 1, 11, T.glow) }
  }
  // Graderías: techo, filas de asientos y baranda
  fillRow(22, T.roof); fillRow(23, T.roof)
  for (let y = 24; y < 32; y++) for (let x = 0; x < W; x++) put(x, y, ((x >> 1) + y) & 1 ? T.seatA : T.seatB)
  for (const c of CROWD) put(c.x, c.y, T.crowd[c.c])
  fillRow(32, T.rail)
  // Barda de los jardines: línea amarilla arriba y el color del equipo
  fillRow(33, 0xf2c14e)
  fillRow(34, wallColor); fillRow(35, wallColor)
  // Pista de advertencia y césped con franjas
  fillRow(36, T.track)
  for (let y = 37; y < H; y++) for (let x = 0; x < W; x++) put(x, y, (x >> 2) & 1 ? T.grassA : T.grassB)
  // Tierra del cuadro y una base
  const widths = { 41: [16, 23], 42: [14, 25], 43: [12, 27], 44: [10, 29], 45: [8, 31] }
  for (const [row, [a, b]] of Object.entries(widths)) for (let x = a; x <= b; x++) put(x, Number(row), T.dirt)
  put(19, 44, T.base); put(20, 44, T.base)

  bgCache.set(cacheKey, out)
  return out
}

// ---------- Looks: un plumaje por sesión/agente ----------
// B = color principal, b = sombra, L = brillo (también tiñe la línea del horizonte)
const LOOKS = {
  cardenal: { B: 0xe03a3a, b: 0xa82828, L: 0xff7b6b },
  azulejo:  { B: 0x3a7bd5, b: 0x24569e, L: 0x7fb3ff },
  jilguero: { B: 0xf2c14e, b: 0xc4921f, L: 0xffe08a },
  lorito:   { B: 0x3cb371, b: 0x247a4c, L: 0x7fe0a5 },
  colibri:  { B: 0x8e5bd9, b: 0x5f3a9e, L: 0xbb95ff },
  turpial:  { B: 0xff8c42, b: 0xc45f1c, L: 0xffb37a },
  flamenco: { B: 0xff6fa3, b: 0xc23f73, L: 0xffa8c8 },
  grafito:  { B: 0x6c7a94, b: 0x46536b, L: 0xa3b1c9 },
}
const LOOK_NAMES = Object.keys(LOOKS)
const LOOK_ALIASES = {
  rojo: 'cardenal', azul: 'azulejo', amarillo: 'jilguero', verde: 'lorito',
  morado: 'colibri', violeta: 'colibri', 'colibrí': 'colibri', naranja: 'turpial',
  rosa: 'flamenco', rosado: 'flamenco', gris: 'grafito', negro: 'grafito',
}
function normalizeLook(name) {
  const n = String(name || '').trim().toLowerCase()
  if (LOOKS[n]) return n
  if (LOOK_ALIASES[n]) return LOOK_ALIASES[n]
  return null
}
function hashStr(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// Quién es esta sesión: clave estable, etiqueta visible y look elegido
const who = { key: 'default', label: 'Pixo', title: '', look: 'cardenal', source: 'auto', bin: '', paneId: '' }

function applyLook(name) {
  const look = LOOKS[name] || LOOKS.cardenal
  who.look = LOOKS[name] ? name : 'cardenal'
  P.B = look.B; P.b = look.b; P.L = look.L
}

// ---------- Sprites (25 px de ancho; '.' es transparente) ----------
const BODY = [
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '....KKKKKKLLLLLKKKKKK....',
  '...KLLLLLLLLLLLLLLLLLK...',
  '..KLBBBBBBBBBBBBBBBBBbK..',
  '..KLBKKKKKKKKKKKKKKKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKSSSSSSSSSSSSSKBbK..',
  '..KLBKKKKKKKKKKKKKKKBbK..',
  '...KBBBBBBBBBBBBBBBBbK...',
  '....KKKKKKKKKKKKKKKKK....',
  '..........KbBbK..........',
  '.......KKKKKKKKKKK.......',
  '......KLBBBBBBBBBbK......',
  '......KLBBBKKKBBBbK......',
  '......KLBBBK.KBBBbK......',
  '......KLBBBKKKBBBbK......',
  '......KLBBBBBBBBBbK......',
  '......KbbbbbbbbbbbK......',
  '.......KKKKKKKKKKK.......',
  '........KOOOOOOOK........',
  '.........KoooooK.........',
]
const CREST = ['.....K.', '..K.KLK', '.KLKLBK', 'KLBBBBK', 'KLBBBBK']              // en (9, 0)
const WING_L = ['.KKK', 'KLBB', 'KLBB', 'KbKb', '.K.K']                           // en (2, 22)
const WING_R = ['KKK.', 'BBbK', 'BBbK', 'bKbK', 'K.K.']                           // en (19, 22)
const WING_UP_A = [                                                              // en (19, 14)
  '....K.K.', '...KLKLK', '...KLBbK', '...KLBbK', '...KLBbK', '...KLBbK',
  '...KLBbK', '...KLBbK', 'KKKKLBbK', 'LBBBBBbK', 'bbbbbbbK', 'KKKKKKKK',
]
const WING_UP_B = [                                                              // en (19, 14)
  '.....K.K.', '....KLKLK', '....KLBbK', '....KLBbK', '....KLBbK', '...KLBbKK',
  '...KLBbK.', '...KLBbK.', 'KKKKLBbK.', 'LBBBBBbK.', 'bbbbbbbK.', 'KKKKKKKK.',
]
const FLAMES = [
  ['fFFFf', '.fFf.', '..g..', '.....'],
  ['fFFFf', 'fFFFf', '.fFf.', '..g..'],
  ['.fFf.', '.fFf.', '..g..', '.....'],
]
const MOON = ['..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXxXXX', 'XxXXXXX', '.XXXXX.', '..XXX..']
const CAP = [                                                                    // en (1, 0)
  '...........c...........',
  '.........KKKKK.........',
  '.......KKCCCCCKK.......',
  '.....KKCCCCCCCCCKK.....',
  '....KCCCCCCCCCCCCCK....',
  '...KCCCCCCCCCCCCCCCK...',
  '..KKcccccccccccccccKK..',
  '..KKKKKKKKKKKKKKKKKKK..',
]
const BAT = [                                                                    // en (-4, 10), detrás del cuerpo
  '.KKK......',
  'KWWwK.....',
  'KWWwK.....',
  '.KWWwK....',
  '.KWWwK....',
  '..KWWwK...',
  '..KWWwK...',
  '...KWwK...',
  '...KWwK...',
  '....KWwK..',
  '....KWwK..',
  '.....KWwK.',
  '.....KWwK.',
  '......KwwK',
  '......KKKK',
]
const GLOVE = [                                                                  // en (-2, 20), sobre el ala izquierda
  '.K.KK.K.',
  'KVKVVKVK',
  'KVVVVVVK',
  'KVvVVvVK',
  'KVVVVVVK',
  'KVVVVVVK',
  '.KVVVVK.',
  '.KvvvvK.',
  '..KKKK..',
]
const BALL = ['.KKK.', 'KQQRK', 'KQRQK', 'KRQQK', '.KKK.']
const BALL_SPIN = ['.KKK.', 'KRQQK', 'KQRQK', 'KQQRK', '.KKK.']

const rand = rng(2026)
const STARS = []
for (let i = 0; i < 26; i++) {
  STARS.push({
    x: Math.floor(rand() * W),
    y: 1 + Math.floor(rand() * 19),
    period: 500 + Math.floor(rand() * 1100),
    phase: Math.floor(rand() * 2000),
    big: i < 2,
  })
}

// ---------- Estado de Pixo ----------
// mode: idle | thinking | working | done | alert | error | bye
const st = {
  mode: 'idle',
  since: 0,
  detail: '',
  happyStart: -100000,
  nextWave: 2600,
  blinkAt: -100000,
  nextBlink: 1600,
  glanceAt: -100000,
  glanceDir: 0,
  nextGlance: 4200,
  phrase: 'Esperando el primer lanzamiento.',
  phraseAt: 0,
}
const HAPPY_MS = 1900
const t0 = Date.now()
const now = () => Date.now() - t0

// ---------- Frases de beisbolista ----------
const PHRASES = {
  idle: [
    'Esperando el primer lanzamiento.',
    'En el dugout, listo para salir al campo.',
    'Bateador al cajón cuando quieras.',
    'Guante puesto, espero tu señal.',
    'Novena entrada, todavía hay juego.',
  ],
  thinking: [
    '¡Play ball!',
    'Leyendo la señal del catcher',
    'Calentando el brazo en el bullpen',
    'Estudiando al pitcher',
    'Midiendo el swing',
    'Ajustando la gorra antes del lanzamiento',
  ],
  working: [
    'Bola en juego: {d}',
    'Jugada en curso: {d}',
    'Corriendo las bases: {d}',
    'Robando segunda: {d}',
    'Lanzamiento en camino: {d}',
  ],
  done: [
    '¡Jonrón! Se fue, se fue, se fue.',
    '¡Doble play! Cerramos la entrada.',
    '¡Tercer out! Entrada terminada.',
    '¡Safe en home!',
    '¡Hit al jardín central!',
    '¡Grand slam con las bases llenas!',
    '¡Fly atrapado! Out seguro.',
  ],
  alert: [
    '¡Tiempo! El mánager pide tu seña.',
    'El umpire espera tu decisión.',
    'Conferencia en el montículo: te necesita.',
    '¿Bola o strike? Tú cantas la jugada.',
  ],
  error: [
    '¡Foul! A batear de nuevo.',
    'Strike… pero seguimos en el cajón.',
    'Error del campocorto, repetimos la jugada.',
    'Bola mala, el pitcher lo intenta otra vez.',
  ],
  bye: [
    'Se apagan las luces del estadio.',
    'Fin del juego, hasta la próxima entrada.',
  ],
}
function pickPhrase(mode, detail) {
  const list = PHRASES[mode] || PHRASES.idle
  let next = list[Math.floor(Math.random() * list.length)]
  if (list.length > 1 && next === st.phrase) next = list[(list.indexOf(next) + 1) % list.length]
  return next.replace('{d}', detail || 'trabajando')
}

function setMode(mode, detail = '') {
  st.mode = mode
  st.detail = detail
  st.since = now()
  st.phrase = pickPhrase(mode, detail)
  st.phraseAt = st.since
  if (mode === 'done') st.happyStart = st.since
}

// Nombres amigables para lo que Claude está usando
function describeTool(tool) {
  const t = String(tool || '')
  if (/^(Bash|PowerShell)$/.test(t)) return 'ejecutando un comando'
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t)) return 'editando archivos'
  if (/^Read$/.test(t)) return 'leyendo código'
  if (/^(Grep|Glob)$/.test(t)) return 'buscando en el código'
  if (/^(WebSearch|WebFetch)$/.test(t)) return 'buscando en la web'
  if (/^(Task|Agent)$/.test(t)) return 'delegando a un subagente'
  if (/^mcp__/.test(t)) return 'usando un conector'
  return t ? 'usando ' + t : 'trabajando'
}

// ---------- Dibujo de un frame ----------
function makeFrame(t) {
  const phase = phaseNow()
  const pix = bgFor(phase, P.b).slice()
  const put = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) pix[y * W + x] = c
  }
  const grid = (rows, ox, oy) => {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y]
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        if (ch !== '.' && P[ch] !== undefined) put(ox + x, oy + y, P[ch])
      }
    }
  }
  const rect = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c)
  }

  const mode = st.mode
  const busy = mode === 'thinking' || mode === 'working'
  const happy = mode === 'done' || t - st.happyStart < HAPPY_MS

  // Estrellas y luna solo de noche; al atardecer asoman las primeras estrellas
  if (phase === 'night' || phase === 'dusk') {
    const stars = phase === 'night' ? STARS : STARS.slice(0, 7)
    for (const s of stars) {
      const on = Math.floor((t + s.phase) / s.period) % 2 === 0
      const col = on ? 0xffffff : 0x9db6ff
      put(s.x, s.y, col)
      if (s.big && on && phase === 'night') {
        put(s.x - 1, s.y, 0x9db6ff); put(s.x + 1, s.y, 0x9db6ff)
        put(s.x, s.y - 1, 0x9db6ff); put(s.x, s.y + 1, 0x9db6ff)
      }
    }
  }
  if (phase === 'night') grid(MOON, 26, 2)

  // Flotación
  let amp = 2
  let speed = 1700
  if (busy) speed = 1200
  if (happy) { amp = 2; speed = 900 }
  if (mode === 'alert' || mode === 'bye' || mode === 'error') amp = 0
  const bob = Math.round(amp * Math.sin((t / speed) * Math.PI * 2))
  const drift = mode === 'alert' || mode === 'bye' ? 0 : Math.round(Math.sin((t / 2900) * Math.PI * 2))
  const ox = 7 + drift
  const oy = 6 + bob

  // Sombra en el piso
  const sw = 11 + bob * 2
  rect(ox + 12 - Math.floor(sw / 2), HORIZON + 2, sw, 1, SHADOW)

  // Propulsor
  if (mode !== 'bye') {
    const flameSpeed = busy ? 80 : 125
    const fi = Math.floor(t / flameSpeed) % 3
    grid(FLAMES[mode === 'alert' ? 2 : fi], ox + 10, oy + 31)
  }

  // Bate al hombro (detrás del cuerpo), cuerpo, cresta asomando por la gorra, gorra, alas y guante
  const gear = currentGear()
  if (gear === 'bat') grid(BAT, ox - 4, oy + 10)
  grid(BODY, ox, oy)
  grid(CREST, ox + 9, oy - 4)
  grid(CAP, ox + 1, oy - 2)
  grid(WING_L, ox + 2, oy + 22)
  if (happy) {
    const wave = Math.floor((t - st.happyStart) / 160) % 2
    grid(wave ? WING_UP_B : WING_UP_A, ox + 19, oy + 14)
  } else {
    grid(WING_R, ox + 19, oy + 22)
  }
  if (gear === 'glove') grid(GLOVE, ox - 2, oy + 20)

  // Mirada
  let glance = 0
  if (busy) {
    glance = Math.floor(t / 420) % 2 ? 1 : -1
  } else if (t - st.glanceAt < 750) {
    glance = st.glanceDir
  }
  const lx = ox + 8 + glance
  const rx = ox + 14 + glance
  const ey = oy + 11
  const blinking = t - st.blinkAt < 130

  if (happy) {
    put(lx + 1, ey, P.E); put(lx, ey + 1, P.E); put(lx + 2, ey + 1, P.E)
    put(rx + 1, ey, P.E); put(rx, ey + 1, P.E); put(rx + 2, ey + 1, P.E)
  } else if (mode === 'bye' || blinking) {
    rect(lx, ey + 2, 3, 1, P.E); rect(rx, ey + 2, 3, 1, P.E)
  } else if (mode === 'error') {
    for (const [ex, ey2] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) {
      put(lx + ex, ey + ey2, P.g); put(rx + ex, ey + ey2, P.g)
    }
  } else if (mode === 'alert') {
    rect(lx, ey, 3, 3, P.E); rect(rx, ey, 3, 3, P.E)
    put(lx + 1, ey + 1, P.S); put(rx + 1, ey + 1, P.S)
  } else {
    rect(lx, ey, 3, 3, P.E); rect(rx, ey, 3, 3, P.E)
  }

  // Boca
  if (happy) {
    rect(ox + 11, oy + 14, 3, 2, P.E)
  } else if (mode === 'alert' || mode === 'error') {
    rect(ox + 11, oy + 15, 3, 1, P.E)
  } else {
    put(ox + 10, oy + 14, P.E); put(ox + 14, oy + 14, P.E)
    rect(ox + 11, oy + 15, 3, 1, P.E)
  }

  // Pico
  put(ox + 10, oy + 17, P.K); put(ox + 11, oy + 17, P.Y); rect(ox + 12, oy + 17, 2, 1, P.O); put(ox + 14, oy + 17, P.K)
  put(ox + 10, oy + 18, P.K); rect(ox + 11, oy + 18, 3, 1, P.O); put(ox + 14, oy + 18, P.K)
  put(ox + 11, oy + 19, P.K); put(ox + 12, oy + 19, P.o); put(ox + 13, oy + 19, P.K)
  put(ox + 12, oy + 20, P.K)

  // Luz del pecho
  const chestPeriod = mode === 'alert' ? 125 : busy ? 300 : 900
  put(ox + 12, oy + 24, Math.floor(t / chestPeriod) % 2 === 0 ? P.Y : P.o)

  // La pelota: flota junto al ala, gira mientras trabaja, se lanza al celebrar y cae al piso cuando te espera
  let bx = ox + 24
  let by = oy + 27 - bob + Math.round(Math.sin((t / 1300) * Math.PI * 2))
  if (gear === 'glove') { bx = ox - 1; by = oy + 21 }
  if (happy) {
    const ph = Math.min(1, Math.max(0, (t - st.happyStart) / HAPPY_MS))
    if (gear === 'glove') {
      // Lanzada desde el ala derecha y atrapada en el guante
      bx = ox + 23 - Math.round(24 * ph)
      by = oy + 20 - Math.round(17 * Math.sin(ph * Math.PI))
    } else {
      bx = ox + 23
      by = oy + 20 - Math.round(16 * Math.sin(ph * Math.PI))
    }
  } else if (mode === 'alert' || mode === 'bye' || mode === 'error') {
    bx = ox + 27
    by = HORIZON - 4
    if (mode === 'error') bx += Math.round(2 * Math.sin((t / 700) * Math.PI * 2))
  }
  const spinning = busy || happy || mode === 'error'
  grid(spinning && Math.floor(t / 180) % 2 ? BALL_SPIN : BALL, bx, by)

  return pix
}

// Avanza la "vida" de Pixo entre frames: parpadeo, miradas, saludos, tiempos de cada estado
function advance(t) {
  if (t >= st.nextBlink) { st.blinkAt = t; st.nextBlink = t + 2200 + Math.random() * 2800 }
  if (t >= st.nextGlance) {
    st.glanceAt = t
    st.glanceDir = Math.random() < 0.5 ? -1 : 1
    st.nextGlance = t + 2800 + Math.random() * 3200
  }
  if (st.mode === 'idle' && t >= st.nextWave) {
    st.happyStart = t
    st.nextWave = t + HAPPY_MS + 8000 + Math.random() * 8000
  }
  if (st.mode === 'done' && t - st.since > 4000) setMode('idle')
  if (st.mode === 'error' && t - st.since > 3500) setMode('thinking')
  if ((st.mode === 'thinking' || st.mode === 'idle') && t - st.phraseAt > 9000) {
    st.phrase = pickPhrase(st.mode, st.detail)
    st.phraseAt = t
  }
}

function statusLine(t) {
  const dots = '.'.repeat(1 + (Math.floor(t / 400) % 3))
  const busy = st.mode === 'thinking' || st.mode === 'working'
  const phrase = st.phrase || ''
  if (busy && !/[.!?…]$/.test(phrase)) return phrase + dots
  return phrase
}

// ---------- Empaquetado para Raster (terminal) ----------
function packCells(numbers) {
  const u8 = new Uint8Array(Uint32Array.from(numbers).buffer)
  if (typeof u8.toBase64 === 'function') return u8.toBase64()
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}

function rasterCells(pix) {
  const cells = []
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < W; x++) {
      cells.push(HALF, pix[(2 * r) * W + x], pix[(2 * r + 1) * W + x])
    }
  }
  return packCells(cells)
}

// Para apps sin Raster (Desktop, VS Code): filas de texto con medios bloques
function hex(c) { return '#' + c.toString(16).padStart(6, '0') }
function textRows(pix, Box, Text) {
  const rows = []
  for (let r = 0; r < ROWS; r++) {
    const runs = []
    let runTop = -1, runBot = -1, len = 0
    const flush = () => {
      if (len > 0) runs.push(Text({ color: hex(runTop), backgroundColor: hex(runBot), children: ['▀'.repeat(len)] }))
    }
    for (let x = 0; x < W; x++) {
      const top = pix[(2 * r) * W + x]
      const bot = pix[(2 * r + 1) * W + x]
      if (top === runTop && bot === runBot) { len++; continue }
      flush()
      runTop = top; runBot = bot; len = 1
    }
    flush()
    rows.push(Box({ flexDirection: 'row', children: runs }))
  }
  return rows
}

// ---------- Identidad de la sesión (herdr, repo, overrides) ----------
function basename(p) {
  const parts = String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || ''
}

async function herdrJson($, bin, args) {
  try {
    const r = await $.process.run([bin, ...args], { timeoutMs: 3000 })
    if (r.exitCode !== 0 || !r.stdout.trim()) return null
    return JSON.parse(r.stdout)
  } catch {
    return null
  }
}

// Encuentra el registro de un pane en lo que devuelve `herdr pane get` o `herdr pane list`
function findPaneRecord(json, paneId) {
  const res = json && json.result
  if (!res) return null
  if (res.pane && res.pane.pane_id === paneId) return res.pane
  const list = res.panes || res.agents || []
  for (const p of list) if (p && p.pane_id === paneId) return p
  if (res.pane) return res.pane
  return null
}

// Lo que herdr sabe de este pane: nombre del agente (si lo nombraste), etiqueta del pane,
// grupo/workspace y el título de la sesión de Claude Code
function paneInfo(p) {
  if (!p) return null
  const agentName =
    (typeof p.name === 'string' && p.name) ||
    (typeof p.agent_name === 'string' && p.agent_name) ||
    (p.agent && typeof p.agent === 'object' && typeof p.agent.name === 'string' && p.agent.name) ||
    ''
  let group = ''
  if (p.tokens && typeof p.tokens === 'object') {
    for (const [k, v] of Object.entries(p.tokens)) {
      if (k.startsWith('group') && typeof v === 'string' && v.trim()) { group = v.trim(); break }
    }
  }
  return {
    agentName: agentName.trim(),
    paneLabel: typeof p.label === 'string' ? p.label.trim() : '',
    group,
    title: String(p.terminal_title_stripped || p.terminal_title || '').replace(/^[^\p{L}\p{N}]+/u, '').trim(),
    cwd: typeof p.cwd === 'string' ? p.cwd : '',
  }
}

async function herdrPane($, bin, paneId) {
  const got = await herdrJson($, bin, ['pane', 'get', paneId])
  let rec = findPaneRecord(got, paneId)
  if (!rec) {
    const list = await herdrJson($, bin, ['pane', 'list'])
    rec = findPaneRecord(list, paneId)
  }
  return paneInfo(rec)
}

// Elige un look para esta sesión repartiendo los colores entre las sesiones vivas de la máquina
async function chooseLook($, key, label) {
  const fixed = normalizeLook(await $.store.get('look:' + key).catch(() => undefined))
  if (fixed) return fixed
  const previous = normalizeLook(await $.store.get('auto-look:' + key).catch(() => undefined))
  if (previous) return previous

  const used = Object.fromEntries(LOOK_NAMES.map((n) => [n, 0]))
  try {
    const keys = await $.store.keys()
    const cutoff = Date.now() - 90000
    for (const k of keys) {
      if (!k.startsWith('seen:')) continue
      const other = k.slice(5)
      if (other === key) continue
      const seen = Number(await $.store.get(k))
      if (!seen || seen < cutoff) continue
      const look = normalizeLook((await $.store.get('look:' + other)) || (await $.store.get('auto-look:' + other)))
      if (look) used[look] += 1
    }
  } catch {}
  const start = hashStr(label + '|' + key) % LOOK_NAMES.length
  let best = LOOK_NAMES[start]
  for (let i = 0; i < LOOK_NAMES.length; i++) {
    const n = LOOK_NAMES[(start + i) % LOOK_NAMES.length]
    if (used[n] < used[best]) best = n
  }
  try { await $.store.set('auto-look:' + key, best) } catch {}
  return best
}

async function heartbeat($) {
  if (!who.key) return
  try { await $.store.set('seen:' + who.key, Date.now()) } catch {}
}

// Vuelve a preguntar a herdr por el pane: el título de la sesión cambia con el tiempo
async function refreshHerdr($) {
  if (who.source !== 'herdr' || !who.paneId) return
  const info = await herdrPane($, who.bin, who.paneId)
  if (!info) return
  const before = who.title + '|' + who.label
  who.title = info.title
  if (!who.fixedName) {
    const label = info.agentName || info.paneLabel || info.group
    if (label) who.label = label
  }
  if (visible && before !== who.title + '|' + who.label) $.ui.invalidate('ui.render')
}

async function resolveWho($) {
  const safe = async (fn) => { try { return await fn() } catch { return undefined } }
  const herdrEnv = await safe(() => $.env.get('HERDR_ENV'))
  const paneId = await safe(() => $.env.get('HERDR_PANE_ID'))
  const binPath = await safe(() => $.env.get('HERDR_BIN_PATH'))
  const envName = await safe(() => $.env.get('PIXO_NAME'))
  const envColor = normalizeLook(await safe(() => $.env.get('PIXO_COLOR')))
  let label = ''
  let title = ''
  let key = ''
  let source = 'repo'

  // 1) Dentro de un pane de herdr: la clave es el pane; la etiqueta, el agente, el pane o el workspace
  if (herdrEnv === '1' && paneId) {
    const bin = binPath || 'herdr'
    key = 'herdr:' + paneId
    source = 'herdr'
    who.bin = bin
    who.paneId = paneId
    const info = await herdrPane($, bin, paneId)
    if (info) {
      label = info.agentName || info.paneLabel || info.group
      title = info.title
    }
  }

  // 2) El repo o la carpeta de trabajo: clave fuera de herdr, y etiqueta cuando herdr no dio ninguna
  if (!key || !label) {
    let root = ''
    try { const repo = await $.session.repo(); root = repo && repo.root ? repo.root : '' } catch {}
    if (!root) { try { root = await $.session.cwd() } catch {} }
    if (!key) key = 'dir:' + root
    if (!label) label = basename(root)
  }
  if (!label) label = 'Pixo'

  // 3) Overrides: variables PIXO_NAME / PIXO_COLOR, y lo guardado con /pixo nombre …
  let savedName = ''
  try { savedName = (await $.store.get('name:' + key)) || '' } catch {}
  try { gearPref = GEAR_ALIASES[String((await $.store.get('gear:' + key)) || 'auto')] || 'auto' } catch {}

  who.key = key
  who.source = source
  who.title = title
  who.fixedName = Boolean(envName || savedName)
  who.label = envName || savedName || label
  applyLook(envColor || (await chooseLook($, key, who.label)))
  await heartbeat($)
}

function paneTitle() { return 'Pixo · ' + who.label }

// ---------- Registro de hooks ----------
let visible = false
let placed = false

export function register(on) {
  // Al empezar la sesión: comando /pixo, animación y el panel
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pixo',
      description: 'Pixo: /pixo muestra u oculta el panel · /pixo color <look> · /pixo nombre <texto> · /pixo equipo <bate|guante|auto> · /pixo hora <fase> · /pixo colores · /pixo auto',
      argumentHint: '[color <look> | nombre <texto> | equipo <bate|guante|auto> | hora <fase> | colores | auto]',
      immediate: true,
    })

    await resolveWho($)

    let ticks = 0
    $.clock.every(TICK_MS, () => {
      ticks += 1
      advance(now())
      if (visible) $.ui.invalidate('ui.render')
      if (ticks % 150 === 0) heartbeat($).catch(() => {})
      if (ticks % 200 === 0 && visible) refreshHerdr($).catch(() => {})
    })

    const opened = await $.ui.open({ id: PANE, title: paneTitle(), columns: W + 4, rows: ROWS + 5 })
    placed = Boolean(opened && opened.isPlaced)
    if (!placed) $.ui.toast('Pixo (' + who.label + ') está listo: escribe /pixo para abrir su panel.')
    return next(e)
  })

  // /pixo abre o cierra el panel; con argumentos cambia el look o el nombre de esta sesión
  on('command.run', { command: 'pixo' }, async ($, e) => {
    const args = String(e.args || '').trim()
    const [verb, ...rest] = args.split(/\s+/)
    const value = rest.join(' ').trim()
    const open = async (focus) => {
      const req = { id: PANE, title: paneTitle(), columns: W + 4, rows: ROWS + 5 }
      const opened = await $.ui.open(focus ? { ...req, focus: true } : req)
      placed = Boolean(opened && opened.isPlaced)
    }

    if (verb === 'colores') {
      return { text: 'Looks de Pixo: ' + LOOK_NAMES.join(', ') + '. Ahora: ' + who.look + ' (' + who.label + ').' }
    }
    if (verb === 'color') {
      const look = normalizeLook(value)
      if (!look) return { text: 'No conozco ese color. Prueba: ' + LOOK_NAMES.join(', ') + '.' }
      applyLook(look)
      await $.store.set('look:' + who.key, look)
      if (visible) $.ui.invalidate('ui.render')
      return { text: 'Pixo ahora es ' + look + ' en esta sesión (' + who.label + ').' }
    }
    if (verb === 'nombre' && value) {
      who.label = value.slice(0, 40)
      who.fixedName = true
      await $.store.set('name:' + who.key, who.label)
      if (visible) await open(false)
      return { text: 'Pixo ahora se llama «' + who.label + '» en esta sesión.' }
    }
    if (verb === 'auto') {
      try { await $.store.delete('look:' + who.key) } catch {}
      try { await $.store.delete('name:' + who.key) } catch {}
      try { await $.store.delete('auto-look:' + who.key) } catch {}
      try { await $.store.delete('gear:' + who.key) } catch {}
      gearPref = 'auto'
      await resolveWho($)
      if (visible) await open(false)
      return { text: 'Pixo vuelve a elegir solo: ' + who.label + ', look ' + who.look + '.' }
    }
    if (verb === 'equipo') {
      const g = GEAR_ALIASES[String(value).toLowerCase()]
      if (!g) return { text: 'Usa /pixo equipo bate | guante | auto. Ahora: ' + gearPref + '.' }
      gearPref = g
      await $.store.set('gear:' + who.key, g)
      if (visible) $.ui.invalidate('ui.render')
      return { text: g === 'auto' ? 'Pixo decide solo: bate cuando espera, guante cuando sale al campo.' : 'Pixo usa ' + value + ' en esta sesión.' }
    }
    if (verb === 'hora') {
      const ph = PHASE_ALIASES[String(value).toLowerCase()]
      if (!ph) return { text: 'Usa /pixo hora dia | noche | amanecer | atardecer | auto. Ahora: ' + phaseNow() + '.' }
      forcePhase = ph
      if (visible) $.ui.invalidate('ui.render')
      return { text: ph === 'auto' ? 'Pixo vuelve a mirar el reloj (' + phaseNow() + ').' : 'Estadio en modo ' + value + ' durante esta sesión.' }
    }
    if (verb === 'ayuda' || (verb && verb !== '')) {
      return { text: '/pixo · /pixo color <look> · /pixo nombre <texto> · /pixo equipo <bate|guante|auto> · /pixo hora <dia|noche|amanecer|atardecer|auto> · /pixo colores · /pixo auto' }
    }

    if (visible) {
      await $.ui.close({ id: PANE })
      visible = false
    } else {
      await open(true)
    }
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) visible = false
    return next(e)
  }).catch(($, e, next) => next(e))

  // Lo que pasa en la sesión mueve a Pixo
  on('prompt.submit', async ($, e, next) => {
    setMode('thinking')
    return next(e)
  }).catch(($, e, next) => next(e))
  on('turn.start', async ($, e, next) => {
    if (st.mode !== 'working') setMode('thinking')
    return next(e)
  }).catch(($, e, next) => next(e))
  on('tool.call', async ($, e, next) => {
    setMode('working', describeTool(e.tool))
    try {
      return await next(e)
    } finally {
      if (st.mode === 'working') setMode('thinking')
    }
  }).catch(($, e, next) => next(e))
  on('classic.PostToolUseFailure', async ($, e, next) => {
    setMode('error')
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.Notification', async ($, e, next) => {
    const kind = e.notification_type
    if (kind === 'permission_prompt' || kind === 'idle_prompt' || kind === 'agent_needs_input') setMode('alert')
    return next(e)
  }).catch(($, e, next) => next(e))
  on('turn.complete', async ($, e, next) => {
    setMode('done')
    return next(e)
  }).catch(($, e, next) => next(e))
  on('session.end', async ($, e, next) => {
    setMode('bye')
    try { await $.store.delete('seen:' + who.key) } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  // El panel
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    visible = true
    const { Box, Text, Button, Raster } = $.ui.resolve(e)
    const t = now()
    const pix = makeFrame(t)

    const picture =
      e.surface === 'terminal'
        ? [Raster({ key: 'scene', columns: W, rows: ROWS, cells: rasterCells(pix) })]
        : textRows(pix, Box, Text)

    const narrow = e.props && typeof e.props.bodyColumns === 'number' && e.props.bodyColumns < W
    const children = []
    children.push(
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: hex(P.B), bold: true, wrap: 'truncate-end', children: ['● ' + who.label] }),
          Text({ dimColor: true, children: ['· ' + who.look] }),
        ],
      }),
    )
    if (who.title && who.title !== who.label && who.title !== 'Claude Code') {
      children.push(Text({ dimColor: true, wrap: 'truncate-end', children: [who.title] }))
    }
    if (narrow) children.push(Text({ dimColor: true, children: ['Ensancha el panel: Ctrl+X y luego ←'] }))
    children.push(...picture)
    children.push(Text({ children: [statusLine(t)] }))
    children.push(
      Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Button({
            key: 'wave',
            label: 'Play ball',
            hotkey: 'p',
            plain: true,
            onPress: () => { st.happyStart = now() },
          }),
          Text({ dimColor: true, children: ['/pixo oculta el panel'] }),
        ],
      }),
    )
    return Box({ flexDirection: 'column', children })
  })
}

// Para pruebas fuera de Claude Code
export const __pixo = { setPhase: (p) => { forcePhase = p }, setGear: (g) => { gearPref = g }, makeFrame, advance, statusLine, setMode, st, W, H, ROWS, applyLook, LOOKS, LOOK_NAMES, normalizeLook, resolveWho, who, paneInfo, findPaneRecord, chooseLook }
