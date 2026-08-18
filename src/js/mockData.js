/* ==========================================================================
   GeoLimp - Realistic Mock Data (Recife, Brazil Drainage Channels)
   ========================================================================== */

// Helper to generate simple, solid base64 SVGs for mock evidence photos
const createSvgDataUrl = (bg, text) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
    <rect width="100%" height="100%" fill="${bg}"/>
    <circle cx="320" cy="200" r="120" fill="white" opacity="0.1"/>
    <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="Outfit, sans-serif" font-size="28" font-weight="bold" fill="white">${text}</text>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Outfit, sans-serif" font-size="16" fill="rgba(255,255,255,0.7)">GeoLimp Registro Técnico • Recife/PE</text>
    <line x1="40" y1="360" x2="600" y2="360" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
};

export const MOCK_STRETCHES = [
  {
    id: 'CN-AG-01',
    name: 'Canal da Av. Agamenon Magalhães - Trecho 01',
    code: 'CN-AG-01',
    extension: 850,
    area: 4250,
    created: '2026-08-01',
    responsible: 'Eng. Gabriel Santos',
    status: 'em-andamento',
    observations: 'Canal de drenagem principal da avenida. Alto tráfego nas proximidades, requer sinalização reforçada.',
    coordinates: [
      [-8.0535, -34.8978],
      [-8.0560, -34.8985],
      [-8.0592, -34.8993]
    ]
  },
  {
    id: 'CN-AR-02',
    name: 'Canal do Arruda - Seção Norte',
    code: 'CN-AR-02',
    extension: 1200,
    area: 7200,
    created: '2026-08-01',
    responsible: 'Eng. Gabriel Santos',
    status: 'concluido',
    observations: 'Área com alta incidência de resíduos sólidos. Concluída desobstrução mecânica.',
    coordinates: [
      [-8.0255, -34.8912],
      [-8.0268, -34.8955],
      [-8.0282, -34.9010]
    ]
  },
  {
    id: 'CN-NT-03',
    name: 'Canal da Av. Norte - Trecho 02',
    code: 'CN-NT-03',
    extension: 650,
    area: 3250,
    created: '2026-08-02',
    responsible: 'Enga. Marina Rocha',
    status: 'nao-iniciado',
    observations: 'Requer remoção prévia de vegetação densa nas margens. Programado para início em breve.',
    coordinates: [
      [-8.0385, -34.9022],
      [-8.0410, -34.9055],
      [-8.0435, -34.9090]
    ]
  },
  {
    id: 'CN-BR-04',
    name: 'Canal Beira Rio - Setor Derby',
    code: 'CN-BR-04',
    extension: 900,
    area: 5400,
    created: '2026-08-03',
    responsible: 'Eng. Gabriel Santos',
    status: 'retrabalho',
    observations: 'Após chuvas recentes, houve novo assoreamento na foz do canal. Requer novo serviço de dragagem.',
    coordinates: [
      [-8.0588, -34.9050],
      [-8.0612, -34.9038],
      [-8.0628, -34.9002]
    ]
  },
  {
    id: 'CN-DB-05',
    name: 'Vala Coletora Derby-Madalena',
    code: 'CN-DB-05',
    extension: 400,
    area: 1600,
    created: '2026-08-04',
    responsible: 'Enga. Marina Rocha',
    status: 'bloqueado',
    observations: 'Obstrução física por interferência de rede de esgoto concessionária. Aguardando liberação técnica.',
    coordinates: [
      [-8.0560, -34.9042],
      [-8.0545, -34.9080]
    ]
  }
];

export const MOCK_DIARIOS = [
  {
    id: 1,
    date: '2026-08-07',
    stretchId: 'CN-AR-02',
    team: 'Equipe A',
    workers: 6,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 400,
    extension: 80,
    bags: 90,
    volume: 13.5,
    weather: 'Ensolarado',
    equipments: 'Enxadas, Carrinhos de Mão, Caminhão Caçamba',
    status: 'em-andamento',
    observations: 'Início dos serviços pelo bordo norte do canal. Alto volume de plástico e garrafas PET.'
  },
  {
    id: 2,
    date: '2026-08-08',
    stretchId: 'CN-AR-02',
    team: 'Equipe A',
    workers: 6,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 450,
    extension: 90,
    bags: 110,
    volume: 16.2,
    weather: 'Ensolarado',
    equipments: 'Enxadas, Roçadeiras, Caminhão Caçamba',
    status: 'em-andamento',
    observations: 'Retirada de vegetação das encostas concluída nesse trecho secundário.'
  },
  {
    id: 3,
    date: '2026-08-09',
    stretchId: 'CN-AR-02',
    team: 'Equipe B',
    workers: 5,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 320,
    extension: 70,
    bags: 75,
    volume: 11.0,
    weather: 'Nublado',
    equipments: 'Enxadas, Carrinhos de Mão',
    status: 'em-andamento',
    observations: 'Solo argiloso úmido, dificultando a locomoção de carrinhos.'
  },
  {
    id: 4,
    date: '2026-08-10',
    stretchId: 'CN-AR-02',
    team: 'Equipe C',
    workers: 4,
    hours: 8,
    start: '08:00',
    end: '17:00',
    area: 800,
    extension: 150,
    bags: 40,
    volume: 22.0,
    weather: 'Ensolarado',
    equipments: 'Mini Retroescavadeira, Caminhão Caçamba',
    status: 'em-andamento',
    observations: 'Utilização de maquinário pesado para desassoreamento de leito de canal.'
  },
  {
    id: 5,
    date: '2026-08-11',
    stretchId: 'CN-AR-02',
    team: 'Equipe A',
    workers: 7,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 500,
    extension: 100,
    bags: 105,
    volume: 15.0,
    weather: 'Chuva Leve',
    equipments: 'Enxadas, Capas de chuva',
    status: 'em-andamento',
    observations: 'Chuva rápida na parte da tarde. Serviços não foram suspensos.'
  },
  {
    id: 6,
    date: '2026-08-12',
    stretchId: 'CN-AR-02',
    team: 'Equipe C',
    workers: 4,
    hours: 4, // Paralisado
    start: '08:00',
    end: '12:00',
    area: 200,
    extension: 40,
    bags: 15,
    volume: 6.0,
    weather: 'Chuva Forte',
    equipments: 'Mini Retroescavadeira (paralisada)',
    status: 'bloqueado',
    observations: 'Devido à forte precipitação e elevação do nível da água no canal, as atividades foram suspensas às 12h por segurança.'
  },
  {
    id: 7,
    date: '2026-08-13',
    stretchId: 'CN-AR-02',
    team: 'Equipe D',
    workers: 8,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 900,
    extension: 170,
    bags: 140,
    volume: 24.5,
    weather: 'Nublado',
    equipments: 'Mini Retroescavadeira, Roçadeiras, Caminhão Caçamba',
    status: 'em-andamento',
    observations: 'Equipe mista acelerou o ritmo após a paralisação do dia anterior.'
  },
  {
    id: 8,
    date: '2026-08-14',
    stretchId: 'CN-AR-02',
    team: 'Equipe A',
    workers: 6,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 550,
    extension: 110,
    bags: 98,
    volume: 14.8,
    weather: 'Ensolarado',
    equipments: 'Roçadeiras, Enxadas',
    status: 'em-andamento',
    observations: 'Fase final de limpeza de talude de canal.'
  },
  {
    id: 9,
    date: '2026-08-15',
    stretchId: 'CN-AR-02',
    team: 'Equipe A',
    workers: 6,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 600,
    extension: 120,
    bags: 85,
    volume: 12.8,
    weather: 'Ensolarado',
    equipments: 'Carrinhos de Mão, Enxadas',
    status: 'em-andamento',
    observations: 'Varrição e recolhimento de resíduos flutuantes finalizados.'
  },
  {
    id: 10,
    date: '2026-08-16',
    stretchId: 'CN-AR-02',
    team: 'Equipe A',
    workers: 5,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 250,
    extension: 50,
    bags: 30,
    volume: 4.5,
    weather: 'Ensolarado',
    equipments: 'Enxadas',
    status: 'concluido',
    observations: 'Finalização do Canal do Arruda. Toda a extensão de 1200m limpa e liberada.'
  },
  {
    id: 11,
    date: '2026-08-16',
    stretchId: 'CN-AG-01',
    team: 'Equipe B',
    workers: 6,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 300,
    extension: 60,
    bags: 75,
    volume: 9.0,
    weather: 'Ensolarado',
    equipments: 'Roçadeiras, Enxadas',
    status: 'em-andamento',
    observations: 'Início dos serviços no canal da Agamenon Magalhães.'
  },
  {
    id: 12,
    date: '2026-08-16',
    stretchId: 'CN-BR-04',
    team: 'Equipe D',
    workers: 5,
    hours: 8,
    start: '07:30',
    end: '16:30',
    area: 150,
    extension: 30,
    bags: 45,
    volume: 6.0,
    weather: 'Ensolarado',
    equipments: 'Enxadas',
    status: 'retrabalho',
    observations: 'Tentativa de remoção de lodo assoreado manualmente.'
  }
];

export const MOCK_PHOTOS = [
  {
    id: 1,
    stretchId: 'CN-AR-02',
    type: 'antes',
    desc: 'Margem do canal antes da desobstrução, lixo flutuante concentrado',
    date: '2026-08-07',
    time: '07:45',
    lat: -8.0256,
    lng: -34.8915,
    image: createSvgDataUrl('#ef4444', 'ANTES - Acúmulo de Lixo (Canal do Arruda)')
  },
  {
    id: 2,
    stretchId: 'CN-AR-02',
    type: 'durante',
    desc: 'Serviço de roçada e remoção mecânica das margens',
    date: '2026-08-10',
    time: '10:30',
    lat: -8.0269,
    lng: -34.8960,
    image: createSvgDataUrl('#3b82f6', 'DURANTE - Dragagem e Roçada de Taludes')
  },
  {
    id: 3,
    stretchId: 'CN-AR-02',
    type: 'depois',
    desc: 'Trecho 100% limpo, margens regularizadas e água fluindo livre',
    date: '2026-08-16',
    time: '15:20',
    lat: -8.0281,
    lng: -34.9008,
    image: createSvgDataUrl('#10b981', 'DEPOIS - Seção Finalizada e Limpa')
  },
  {
    id: 4,
    stretchId: 'CN-AG-01',
    type: 'antes',
    desc: 'Vegetação alta obstruindo a passagem da água e acúmulo de entulho',
    date: '2026-08-15',
    time: '08:15',
    lat: -8.0538,
    lng: -34.8979,
    image: createSvgDataUrl('#f59e0b', 'ANTES - Canal Av. Agamenon Magalhães')
  }
];

export const DEFAULT_GOALS = {
  id: 'goals',
  area: 400,       // m² por dia
  extension: 80,  // m por dia
  bags: 80,       // sacos por dia
  volume: 15      // m³ por dia
};
