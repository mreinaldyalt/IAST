const locale = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'id';

const copy = {
  id: {
    title: 'LINTASAN PLANET', subtitle: 'MODEL GERAK JANGKA PANJANG', canvas: 'Visualisasi interaktif lintasan Matahari dan planet',
    model: 'IAST / MODEL VISUAL', elapsed: 'Waktu simulasi', travelled: 'Jarak tempuh Matahari (nilai model)',
    controls: 'PENGATURAN', pause: 'Jeda simulasi', resume: 'Lanjutkan simulasi', close: 'Tutup pengaturan',
    scale: 'Skala waktu', mode: 'Mode tampilan', speed: 'Kecepatan Matahari di Bima Sakti',
    trails: 'Jejak lintasan', labels: 'Label benda langit', stars: 'Bintang latar', gc: 'Pusat galaksi',
    direction: 'Arah gerak Matahari', orbits: 'Garis orbit planet',
    note: 'Seret untuk memutar pandangan, cubit layar atau gulir untuk mengatur zoom, klik dua kali pada Matahari atau planet untuk mengikutinya. Tombol panah memutar pandangan, + dan - mengatur zoom. Lintasan galaksi disederhanakan untuk visualisasi.',
    modes: {
      short: ['Dekat', 'orbit planet'], medium: ['Menengah', 'lintasan Matahari mulai tampak'],
      long: ['Jangka panjang', 'lintasan Matahari diperluas'], galaxy: ['Skala galaksi', 'pusat galaksi terlihat'],
    },
    planets: { mercury: 'Merkurius', venus: 'Venus', earth: 'Bumi', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturnus', uranus: 'Uranus', neptune: 'Neptunus' },
    tags: { mercury: 'Orbit rapat', venus: 'Orbit menengah', earth: 'Orbit menengah', mars: 'Orbit lebar', jupiter: 'Orbit lebar', saturn: 'Orbit sangat lebar', uranus: 'Orbit luar', neptune: 'Orbit terluar' },
    sun: 'Matahari', sunMotion: 'Arah gerak Matahari', throughGalaxy: 'melintasi Bima Sakti', year: 'th', perSecond: 'th/dtk',
  },
  en: {
    title: 'PLANETARY TRAJECTORIES', subtitle: 'LONG-TERM MOTION MODEL', canvas: 'Interactive visualization of the Sun and planetary trajectories',
    model: 'IAST / VISUAL MODEL', elapsed: 'Simulation time', travelled: 'Sun travel distance (model value)',
    controls: 'CONTROLS', pause: 'Pause simulation', resume: 'Resume simulation', close: 'Close controls',
    scale: 'Time scale', mode: 'View mode', speed: 'Sun speed through the Milky Way',
    trails: 'Trajectory trails', labels: 'Celestial body labels', stars: 'Background stars', gc: 'Galactic centre',
    direction: 'Sun direction of motion', orbits: 'Planet orbit paths',
    note: 'Drag to rotate the view, pinch or scroll to zoom, and double-click the Sun or a planet to follow it. Arrow keys rotate the view; + and - adjust zoom. Galactic paths are simplified for visualization.',
    modes: {
      short: ['Close view', 'planetary orbits'], medium: ['Medium range', 'the Sun path becomes visible'],
      long: ['Long range', 'extended solar trajectory'], galaxy: ['Galaxy scale', 'galactic centre visible'],
    },
    planets: { mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune' },
    tags: { mercury: 'Tight orbit', venus: 'Medium orbit', earth: 'Medium orbit', mars: 'Wide orbit', jupiter: 'Wide orbit', saturn: 'Very wide orbit', uranus: 'Outer orbit', neptune: 'Farthest orbit' },
    sun: 'Sun', sunMotion: "Sun's direction of motion", throughGalaxy: 'through the Milky Way', year: 'yr', perSecond: 'yr/s',
  },
};

document.documentElement.lang = locale;
document.title = `${locale === 'id' ? 'Simulasi Lintasan Planet' : 'Planetary Trajectory Simulation'} | IAST`;

export { locale };
export default copy[locale];
