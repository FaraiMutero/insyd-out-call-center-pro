import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

/* ---------- PlayerContext ---------- */
export const PlayerContext = createContext(null);
export function usePlayer() { return useContext(PlayerContext); }

/* ---------- SVG icons ---------- */
function IconHome() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>;
}
function IconSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
}
function IconRecordings() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
}
function IconUsers() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IconAudit() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>;
}
function IconProfile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function IconLib() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
}
function IconPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>;
}
function IconPause() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>;
}
function IconSkipBack() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h2v16H6zM20 4 9 12l11 8z"/></svg>;
}
function IconSkipForward() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 4h2v16h-2zM4 4l11 8L4 20z"/></svg>;
}
function IconShuffle() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>;
}
function IconRepeat() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>;
}
function IconHeart() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>;
}
function IconVolume() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{color:'var(--muted)'}}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19 5a9 9 0 0 1 0 14"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>;
}
function IconQueue() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h11M4 12h11M4 18h7"/><path d="M16 14v6l4-3z"/></svg>;
}
function IconAdd() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg>;
}
function IconSun() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
}
function IconMoon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}
function IconBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>;
}
function IconForward() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>;
}
function IconSearchSm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
}
function IconImport() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
}
function IconAuditSm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>;
}

/* ---------- helpers ---------- */
function fmt(s) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function seedRand(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function agentColor(name) {
  const COLORS = ['#7C6CFF', '#5B8DEF', '#37D399', '#F4B740', '#FF6B6B', '#C084FC'];
  if (!name) return '#5E667C';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}

function WaveSVG({ seed, hex, w = 70, h = 34, className = 'wave' }) {
  const r = seedRand(seed + 'w');
  const n = 22;
  const bars = Array.from({ length: n }, (_, i) => {
    const bh = (0.18 + r() * 0.82) * h;
    const x = (i / n) * w + 1;
    return (
      <rect key={i} x={x.toFixed(1)} y={(h - bh).toFixed(1)}
        width={((w / n) - 1.2).toFixed(1)} height={bh.toFixed(1)} rx="1"
        fill={hex} opacity={(0.4 + r() * 0.6).toFixed(2)} />
    );
  });
  return <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">{bars}</svg>;
}

function coverStyle(seed, hex) {
  const r = seedRand(seed);
  const a = Math.floor(r() * 360);
  const b = (a + 40 + r() * 60) % 360;
  return {
    background: `
      radial-gradient(120% 120% at ${(20 + r() * 30).toFixed(0)}% ${(10 + r() * 20).toFixed(0)}%, ${hex} 0%, transparent 55%),
      radial-gradient(120% 120% at ${(70 + r() * 20).toFixed(0)}% ${(70 + r() * 20).toFixed(0)}%, hsl(${b} 55% 22%) 0%, transparent 60%),
      linear-gradient(135deg, hsl(${a} 45% 16%), hsl(${b} 50% 9%))`
  };
}

function sentHex(sent) {
  return { crit: '#FF6B6B', risk: '#F4B740', neu: '#6FA8FF', pos: '#37D399' }[sent] || '#6FA8FF';
}

/* ---------- nav config ---------- */
const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Home',            Icon: IconHome,       roles: ['admin','manager','qa','agent'] },
  { to: '/recordings', label: 'Recordings',       Icon: IconRecordings, roles: ['admin','manager','qa'] },
  { to: '/users',      label: 'User management',  Icon: IconUsers,      roles: ['admin'] },
  { to: '/audit',      label: 'Audit log',         Icon: IconAudit,      roles: ['admin'] },
  { to: '/profile',    label: 'Profile',           Icon: IconProfile,    roles: ['admin','manager','qa','agent'] },
];

/* ---------- playlist builder ---------- */
function buildPlaylists(recordings) {
  if (!recordings.length) {
    return [{ name: 'All recordings', meta: 'Library · 0 calls', grad: ['#9AA3B8','#363B4D'], count: 0 }];
  }
  const list = [];
  // Build agent playlists
  const byAgent = {};
  recordings.forEach(r => {
    const a = r.agentName || 'Unknown Agent';
    byAgent[a] = (byAgent[a] || 0) + 1;
  });
  Object.entries(byAgent).forEach(([name, count]) => {
    const c = agentColor(name);
    list.push({ name, meta: `Agent · ${count} call${count !== 1 ? 's' : ''}`, grad: [c, '#1A1F30'], count });
  });
  list.push({ name: 'All recordings', meta: `Library · ${recordings.length} call${recordings.length !== 1 ? 's' : ''}`, grad: ['#9AA3B8', '#363B4D'], count: recordings.length });
  return list;
}

/* ---------- component ---------- */
export default function AppLayout({ user, onLogout, recordings = [], children }) {
  const location = useLocation();
  const contentRef = useRef(null);
  const audioRef = useRef(null);

  const [stuck, setStuck] = useState(false);
  const [libFilter, setLibFilter] = useState('all');
  const [activePl, setActivePl] = useState(0);

  /* player state */
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playing, setPlaying]   = useState(false);
  const [pos, setPos]           = useState(0);
  const [dur, setDur]           = useState(0);
  const [liked, setLiked]       = useState(false);
  const accessToken = localStorage.getItem('accessToken') || '';

  /* theme */
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('io-theme') || 'dark';
    document.documentElement.classList.toggle('light', stored === 'light');
    return stored;
  });

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('io-theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  }

  /* topbar scroll shadow */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = () => setStuck(el.scrollTop > 12);
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  /* audio sync */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setPos(audio.currentTime);
    const onMeta  = () => setDur(audio.duration || 0);
    const onEnded = () => { setPlaying(false); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const onPlay = useCallback((recording) => {
    if (currentTrack?.id === recording.id) {
      togglePlay();
      return;
    }
    setCurrentTrack(recording);
    setPos(0); setDur(0); setPlaying(true); setLiked(false);
    const audio = audioRef.current;
    if (audio) {
      if (recording.storagePath) {
        audio.src = `/api/recordings/${recording.id}/stream?token=${encodeURIComponent(accessToken)}`;
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        audio.src = '';
      }
    }
  }, [currentTrack, accessToken]);

  function togglePlay() {
    if (!currentTrack) return;
    const audio = audioRef.current;
    if (playing) { audio?.pause(); setPlaying(false); }
    else { audio?.play().catch(() => {}); setPlaying(true); }
  }

  function step(dir) {
    if (!currentTrack || !recordings.length) return;
    const idx = recordings.findIndex(r => r.id === currentTrack.id);
    const next = recordings[(idx + dir + recordings.length) % recordings.length];
    onPlay(next);
  }

  function handleBarClick(e) {
    if (!currentTrack || !audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newPos = frac * (dur || 0);
    setPos(newPos);
    if (audioRef.current.src) audioRef.current.currentTime = newPos;
  }

  const progressPct = dur > 0 ? (pos / dur * 100) : 0;

  const playerCtx = useMemo(() => ({
    currentTrack, playing, pos, dur, onPlay, togglePlay, step,
  }), [currentTrack, playing, pos, dur, onPlay]);

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(user.role));
  const playlists  = useMemo(() => buildPlaylists(recordings), [recordings]);

  const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || 'U';

  /* current track display data */
  const ctSeed = currentTrack?.originalFilename || 'idle';
  const ctHex  = currentTrack ? sentHex('neu') : '#6FA8FF';
  const ctName = currentTrack ? (currentTrack.originalFilename || '').replace(/\.(wav|mp3|m4a|ogg|opus|wma|amr)$/i,'').replace(/[-_]/g,' ').replace(/\b\w/g,m=>m.toUpperCase()) : 'Select a call to begin';
  const ctAgent = currentTrack ? `${currentTrack.agentName || 'Unknown'} · ${currentTrack.direction || 'call'}` : 'Nothing playing';

  return (
    <div className="app">
      {/* hidden audio element */}
      <audio ref={audioRef} preload="none" style={{ display: 'none' }} />

      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar">
        {/* brand + nav */}
        <div className="panel brand-block">
          <div className="brand">
            <div className="brand-mark">IO</div>
            <div>
              <div className="brand-name">InsydOut</div>
              <div className="brand-sub">Call Center Pro</div>
            </div>
          </div>
          <nav className="side-nav" style={{ paddingTop: 18 }}>
            {visibleNav.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                <Icon />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* library */}
        <div className="panel library">
          <div className="library-head">
            <div className="library-title">
              <IconLib />
              Your library
            </div>
            <NavLink to="/recordings" className="lib-add" title="Import a call">
              <IconAdd />
            </NavLink>
          </div>
          <div className="lib-filters">
            {['Playlists','By agent','Flagged'].map((lbl, i) => {
              const key = ['all','agent','risk'][i];
              return (
                <button key={key} className={`chip${libFilter === key ? ' on' : ''}`}
                  onClick={() => setLibFilter(key)}>
                  {lbl}
                </button>
              );
            })}
          </div>
          <div className="playlists">
            {playlists.map((pl, i) => (
              <button key={pl.name} className={`pl-item${activePl === i ? ' active' : ''}`}
                onClick={() => setActivePl(i)}>
                <div className="pl-cover" style={{ background: `linear-gradient(135deg,${pl.grad[0]},${pl.grad[1]})` }}>
                  <IconLib />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="pl-name">{pl.name}</div>
                  <div className="pl-meta">{pl.meta}</div>
                </div>
                <span className="pl-count">{pl.count}</span>
              </button>
            ))}
          </div>
          <div className="who">
            <div className="who-av">{initials}</div>
            <div>
              <div className="who-name">{user.firstName} {user.lastName}</div>
              <div className="who-role">{user.role} · {user.email}</div>
            </div>
            <div className="who-dot" title="Online" />
          </div>
        </div>
      </aside>

      {/* ===== CONTENT ===== */}
      <main className="content" ref={contentRef}>
        <div className={`topbar${stuck ? ' stuck' : ''}`}>
          <div className="nav-arrows">
            <button className="round" aria-label="Back" onClick={() => window.history.back()}>
              <IconBack />
            </button>
            <button className="round" aria-label="Forward" onClick={() => window.history.forward()}>
              <IconForward />
            </button>
          </div>
          <div className="search-bar">
            <IconSearchSm />
            <input type="search" placeholder="Search calls, agents, or recordings…" aria-label="Search" />
          </div>
          <div className="top-actions">
            <button className="theme-btn" onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <NavLink to="/recordings" className="btn btn-primary">
              <IconImport />
              Import call
            </NavLink>
            <button className="top-av" title={`${user.firstName} ${user.lastName}`} onClick={onLogout}>
              {initials}
            </button>
          </div>
        </div>

        <PlayerContext.Provider value={playerCtx}>
          {children}
        </PlayerContext.Provider>
      </main>

      {/* ===== PLAYER BAR ===== */}
      <footer className={`player${!currentTrack ? ' idle' : ''}`}>
        {/* now playing */}
        <div className="np">
          <div className="np-cover" style={currentTrack ? coverStyle(ctSeed, ctHex) : { background: 'var(--panel)' }}>
            {currentTrack && <WaveSVG seed={ctSeed} hex={ctHex} w={70} h={34} />}
          </div>
          <div className="np-info">
            <div className="np-name">{ctName}</div>
            <div className="np-agent">{ctAgent}</div>
          </div>
          <button className={`np-like${liked ? ' on' : ''}`} aria-label="Flag for follow-up"
            onClick={() => setLiked(v => !v)}>
            <IconHeart />
          </button>
        </div>

        {/* controls */}
        <div className="pcenter">
          <div className="pcontrols">
            <button className="pbtn sm" aria-label="Shuffle"><IconShuffle /></button>
            <button className="pbtn" aria-label="Previous" onClick={() => step(-1)}><IconSkipBack /></button>
            <button className="play-main" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <button className="pbtn" aria-label="Next" onClick={() => step(1)}><IconSkipForward /></button>
            <button className="pbtn sm" aria-label="Repeat"><IconRepeat /></button>
          </div>
          <div className="scrub">
            <time>{fmt(pos)}</time>
            <div className="bar" onClick={handleBarClick}>
              <div className="bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <time>{fmt(dur)}</time>
          </div>
        </div>

        {/* right panel */}
        <div className="pright">
          <button className="pbtn" aria-label="Queue"><IconQueue /></button>
          <div className="vol">
            <IconVolume />
            <div className="vol-bar" onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              if (audioRef.current) audioRef.current.volume = frac;
              e.currentTarget.querySelector('.vol-fill').style.width = `${frac * 100}%`;
            }}>
              <div className="vol-fill" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
