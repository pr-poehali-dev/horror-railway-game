import { useState, useEffect, useRef, useCallback } from 'react';

type Screen = 'menu' | 'game' | 'settings' | 'levels' | 'stats' | 'achievements';
type AnomalyType = 'none' | 'flying' | 'ghost' | 'reversed' | 'multiple' | 'disappeared';
type Quality = 'low' | 'medium' | 'high';

interface GameState {
  level: number;
  score: number;
  trainsChecked: number;
  anomaliesFound: number;
  anomaliesMissed: number;
  survived: boolean;
  alarmActive: boolean;
  anomalyType: AnomalyType;
  trainApproach: number;
  trainVisible: boolean;
  phase: 'waiting' | 'approaching' | 'anomaly_window' | 'passed';
  logs: string[];
  lightsOn: boolean;
}

interface Settings {
  soundVolume: number;
  musicVolume: number;
  ambientVolume: number;
  quality: Quality;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private volume = 0.7;
  private ambVol = 0.5;
  private ambientNode: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private alarmInterval: ReturnType<typeof setInterval> | null = null;
  private windInterval: ReturnType<typeof setInterval> | null = null;

  init() {
    if (!this.ctx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  setVolumes(sfx: number, _music: number, ambient: number) {
    this.volume = sfx / 100;
    this.ambVol = ambient / 100;
    if (this.ambientGain) this.ambientGain.gain.value = this.ambVol * 0.04;
  }

  private getCtx(): AudioContext {
    this.init();
    return this.ctx!;
  }

  playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 1) {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(this.volume * vol * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  playNoise(duration: number, vol = 1) {
    const ctx = this.getCtx();
    const bufSize = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * vol * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  playTrainApproach() {
    const ctx = this.getCtx();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.value = 40 + i * 15;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
      gain.gain.linearRampToValueAtTime(this.volume * 0.1, ctx.currentTime + 0.5);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 2.5);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + 3);
    }
  }

  playTrainHorn() {
    this.playTone(220, 0.8, 'sawtooth', 0.6);
    setTimeout(() => this.playTone(165, 0.5, 'sawtooth', 0.4), 900);
  }

  playAlarmSound() {
    this.stopAlarm();
    let toggle = true;
    this.alarmInterval = setInterval(() => {
      this.playTone(toggle ? 880 : 660, 0.25, 'square', 0.5);
      toggle = !toggle;
    }, 300);
  }

  stopAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  playScreamer() {
    this.playNoise(0.5, 2);
    this.playTone(150, 0.8, 'sawtooth', 1.5);
    setTimeout(() => this.playTone(80, 0.5, 'sine', 1), 200);
  }

  playButtonClick() {
    this.playTone(600, 0.1, 'square', 0.3);
  }

  playSuccess() {
    this.playTone(440, 0.15, 'sine', 0.4);
    setTimeout(() => this.playTone(550, 0.15, 'sine', 0.4), 150);
    setTimeout(() => this.playTone(660, 0.3, 'sine', 0.4), 300);
  }

  playAnomalyDetected() {
    this.playNoise(0.2, 0.8);
    this.playTone(300, 0.3, 'sawtooth', 0.5);
  }

  startAmbient() {
    this.stopAmbient();
    const ctx = this.getCtx();
    this.ambientNode = ctx.createOscillator();
    this.ambientGain = ctx.createGain();
    this.ambientNode.type = 'sine';
    this.ambientNode.frequency.value = 60;
    this.ambientGain.gain.value = this.ambVol * 0.04;
    this.ambientNode.connect(this.ambientGain);
    this.ambientGain.connect(ctx.destination);
    this.ambientNode.start();
    this.windInterval = setInterval(() => {
      this.playNoise(1.5, 0.05 + Math.random() * 0.1);
    }, 3000 + Math.random() * 4000);
  }

  stopAmbient() {
    if (this.ambientNode) { try { this.ambientNode.stop(); } catch(_e) { /* ignore */ } this.ambientNode = null; }
    if (this.windInterval) { clearInterval(this.windInterval); this.windInterval = null; }
  }
}

const audio = new AudioEngine();

const generateStars = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 50,
    size: Math.random() * 2 + 0.5,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 3,
  }));

const STARS = generateStars(80);

const ANOMALY_TYPES: AnomalyType[] = ['flying', 'ghost', 'reversed', 'multiple', 'disappeared'];

const ANOMALY_NAMES: Record<AnomalyType, string> = {
  none: '',
  flying: 'ПОЕЗД ЛЕТИТ',
  ghost: 'ПОЕЗД-ПРИЗРАК',
  reversed: 'ДВИЖЕНИЕ НАЗАД',
  multiple: 'ДВОЙНИК',
  disappeared: 'ИСЧЕЗНОВЕНИЕ',
};

const LEVELS = [
  { id: 1, name: 'Первая смена', anomalyChance: 0.25, timeLimit: 120, unlocked: true },
  { id: 2, name: 'Ночная вахта', anomalyChance: 0.40, timeLimit: 100, unlocked: true },
  { id: 3, name: 'Туман', anomalyChance: 0.55, timeLimit: 90, unlocked: false },
  { id: 4, name: 'Буря', anomalyChance: 0.65, timeLimit: 80, unlocked: false },
  { id: 5, name: 'Тьма', anomalyChance: 0.75, timeLimit: 70, unlocked: false },
  { id: 6, name: 'Кошмар', anomalyChance: 0.9, timeLimit: 60, unlocked: false },
];

const ACHIEVEMENTS = [
  { id: 1, icon: '🚂', name: 'Первый поезд', desc: 'Зарегистрировать 1 поезд', locked: false },
  { id: 2, icon: '⚠️', name: 'Охотник за аномалиями', desc: 'Обнаружить 5 аномалий', locked: true },
  { id: 3, icon: '🌙', name: 'Ночная смена', desc: 'Пережить полную смену', locked: true },
  { id: 4, icon: '🔔', name: 'Быстрая реакция', desc: 'Подать сигнал за 2 секунды', locked: true },
  { id: 5, icon: '💀', name: 'Мёртвый час', desc: 'Получить скример', locked: false },
  { id: 6, icon: '👁️', name: 'Всевидящее око', desc: 'Не пропустить ни одной аномалии', locked: true },
];

export default function Index() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>({
    soundVolume: 70,
    musicVolume: 30,
    ambientVolume: 50,
    quality: 'high',
  });
  const [gameState, setGameState] = useState<GameState>({
    level: 1, score: 0, trainsChecked: 0, anomaliesFound: 0, anomaliesMissed: 0,
    survived: true, alarmActive: false, anomalyType: 'none',
    trainApproach: 0, trainVisible: false, phase: 'waiting',
    logs: ['[23:00] → Начало дежурства. Следите за поездами.'],
    lightsOn: true,
  });
  const [showScreamer, setShowScreamer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [clock, setClock] = useState('23:00');
  const [showAlarmBar, setShowAlarmBar] = useState(false);
  const [alarmSuccess, setAlarmSuccess] = useState(false);

  const gameRef = useRef<GameState>(gameState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anomalyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approachRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef(0);

  gameRef.current = gameState;

  const addLog = useCallback((msg: string, type: 'normal' | 'warn' | 'error' = 'normal') => {
    const h = 23 + Math.floor(clockRef.current / 60);
    const m = clockRef.current % 60;
    const time = `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const prefix = type === 'warn' ? '⚠ ' : type === 'error' ? '✖ ' : '→ ';
    setGameState(s => ({
      ...s,
      logs: [`[${time}] ${prefix}${msg}`, ...s.logs.slice(0, 19)],
    }));
  }, []);

  useEffect(() => {
    if (screen !== 'game') return;
    const id = setInterval(() => {
      clockRef.current += 1;
      const h = 23 + Math.floor(clockRef.current / 60);
      const m = clockRef.current % 60;
      setClock(`${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(id);
  }, [screen]);

  const triggerGameOver = useCallback(() => {
    audio.stopAlarm();
    audio.stopAmbient();
    audio.playScreamer();
    if (approachRef.current) clearInterval(approachRef.current);
    if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
    if (trainTimerRef.current) clearTimeout(trainTimerRef.current);
    setShowScreamer(true);
    setTimeout(() => {
      setShowScreamer(false);
      setShowAlarmBar(false);
      setScreen('menu');
    }, 3000);
  }, []);

  const scheduleTrain = useCallback(() => {
    const level = LEVELS.find(l => l.id === gameRef.current.level) || LEVELS[0];
    const wait = 4000 + Math.random() * 5000;

    trainTimerRef.current = setTimeout(() => {
      if (!gameRef.current.survived) return;

      const hasAnomaly = Math.random() < level.anomalyChance;
      const anomalyType: AnomalyType = hasAnomaly
        ? ANOMALY_TYPES[Math.floor(Math.random() * ANOMALY_TYPES.length)]
        : 'none';

      audio.playTrainApproach();

      setGameState(s => ({
        ...s,
        trainVisible: anomalyType !== 'disappeared',
        trainApproach: 0,
        anomalyType,
        phase: 'approaching',
        alarmActive: false,
      }));

      if (anomalyType !== 'none') {
        audio.playAnomalyDetected();
        addLog(`Аномалия зафиксирована: ${ANOMALY_NAMES[anomalyType]}`, 'warn');
      } else {
        addLog(`Поезд №${Math.floor(Math.random() * 900) + 100} на подходе`);
      }

      let progress = 0;
      approachRef.current = setInterval(() => {
        progress += 4;
        setGameState(s => ({ ...s, trainApproach: Math.min(progress, 100) }));
        if (progress >= 100) {
          clearInterval(approachRef.current!);
          audio.playTrainHorn();
          setGameState(s => ({ ...s, phase: 'anomaly_window' }));

          anomalyTimerRef.current = setTimeout(() => {
            const st = gameRef.current;
            if (st.anomalyType !== 'none' && !st.alarmActive) {
              addLog('АНОМАЛИЯ ПРОПУЩЕНА! УГРОЗА!', 'error');
              setGameState(s => ({ ...s, anomaliesMissed: s.anomaliesMissed + 1 }));
              triggerGameOver();
            } else {
              setGameState(s => ({
                ...s,
                trainVisible: false,
                trainApproach: 0,
                anomalyType: 'none',
                phase: 'waiting',
                trainsChecked: s.trainsChecked + 1,
                score: s.score + (st.anomalyType !== 'none' ? 0 : 50),
                alarmActive: false,
              }));
              if (st.anomalyType === 'none') addLog('Поезд проследовал без отклонений');
              setShowAlarmBar(false);
              scheduleTrain();
            }
          }, 8000);
        }
      }, 200);
    }, wait);
  }, [addLog, triggerGameOver]);

  const startGame = useCallback((levelId: number) => {
    audio.init();
    audio.setVolumes(settings.soundVolume, settings.musicVolume, settings.ambientVolume);
    audio.startAmbient();
    const level = LEVELS.find(l => l.id === levelId) || LEVELS[0];
    setTimeLeft(level.timeLimit);
    clockRef.current = 0;
    setClock('23:00');
    setAlarmSuccess(false);
    setShowAlarmBar(false);
    setGameState({
      level: levelId, score: 0, trainsChecked: 0, anomaliesFound: 0,
      anomaliesMissed: 0, survived: true, alarmActive: false, anomalyType: 'none',
      trainApproach: 0, trainVisible: false, phase: 'waiting',
      logs: ['[23:00] → Начало дежурства. Следите за поездами!'],
      lightsOn: true,
    });
    setScreen('game');
    setTimeout(scheduleTrain, 2000);
  }, [settings, scheduleTrain]);

  useEffect(() => {
    if (screen !== 'game') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          audio.playSuccess();
          audio.stopAmbient();
          setTimeout(() => setScreen('menu'), 500);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [screen]);

  const handleAlarm = () => {
    const st = gameRef.current;
    if (st.phase !== 'anomaly_window') return;
    audio.playButtonClick();
    if (st.anomalyType !== 'none') {
      audio.playAlarmSound();
      setShowAlarmBar(true);
      setAlarmSuccess(true);
      addLog(`✓ Сигнал подан! Подтверждено: ${ANOMALY_NAMES[st.anomalyType]}`);
      setGameState(s => ({ ...s, alarmActive: true, anomaliesFound: s.anomaliesFound + 1, score: s.score + 300 }));
      if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
      setTimeout(() => {
        audio.stopAlarm();
        setShowAlarmBar(false);
        setAlarmSuccess(false);
        setGameState(s => ({
          ...s, trainVisible: false, trainApproach: 0, anomalyType: 'none',
          phase: 'waiting', trainsChecked: s.trainsChecked + 1, alarmActive: false,
        }));
        scheduleTrain();
      }, 4000);
    } else {
      audio.playTone(200, 0.3, 'square', 0.5);
      addLog('Ложная тревога! -50 очков', 'warn');
      setGameState(s => ({ ...s, score: Math.max(0, s.score - 50) }));
    }
  };

  const handleNormal = () => {
    const st = gameRef.current;
    if (st.phase !== 'anomaly_window') return;
    audio.playButtonClick();
    if (st.anomalyType !== 'none') {
      addLog('Аномалия пропущена! Опасность!', 'error');
      setGameState(s => ({ ...s, anomaliesMissed: s.anomaliesMissed + 1 }));
      if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
      triggerGameOver();
    } else {
      audio.playTone(440, 0.1, 'sine', 0.3);
      addLog(`Поезд №${Math.floor(Math.random() * 900) + 100} — норма, отмечен`);
      if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
      setGameState(s => ({
        ...s, trainVisible: false, trainApproach: 0, anomalyType: 'none',
        phase: 'waiting', trainsChecked: s.trainsChecked + 1, score: s.score + 100, alarmActive: false,
      }));
      scheduleTrain();
    }
  };

  const handleToggleLights = () => {
    audio.playButtonClick();
    setGameState(s => ({ ...s, lightsOn: !s.lightsOn }));
  };

  const exitGame = () => {
    audio.stopAlarm();
    audio.stopAmbient();
    if (timerRef.current) clearInterval(timerRef.current);
    if (trainTimerRef.current) clearTimeout(trainTimerRef.current);
    if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
    if (approachRef.current) clearInterval(approachRef.current);
    setShowAlarmBar(false);
    setShowScreamer(false);
    setScreen('menu');
  };

  const { anomalyType, trainVisible, trainApproach, phase, logs, lightsOn } = gameState;
  const isAnomaly = anomalyType !== 'none';
  const trainScale = 0.3 + (trainApproach / 100) * 0.7;
  const trainBottom = 46 + (1 - trainApproach / 100) * 8;

  // === SETTINGS ===
  if (screen === 'settings') return (
    <div className="overlay-screen">
      <div className="overlay-title">Настройки</div>
      {[
        { label: 'Громкость звуков', key: 'soundVolume' as keyof Settings },
        { label: 'Громкость музыки', key: 'musicVolume' as keyof Settings },
        { label: 'Окружающие звуки', key: 'ambientVolume' as keyof Settings },
      ].map(({ label, key }) => (
        <div className="setting-row" key={key}>
          <span className="setting-label">{label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={0} max={100} value={settings[key] as number}
              className="range-slider"
              onChange={e => setSettings(s => ({ ...s, [key]: +e.target.value }))}
            />
            <span style={{ fontFamily: 'Oswald', fontSize: '0.85rem', color: 'rgba(220,180,80,0.8)', minWidth: 35 }}>
              {settings[key]}%
            </span>
          </div>
        </div>
      ))}
      <div className="setting-row">
        <span className="setting-label">Качество графики</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['low', 'medium', 'high'] as Quality[]).map(q => (
            <button key={q} className={`quality-btn ${settings.quality === q ? 'selected' : ''}`}
              onClick={() => setSettings(s => ({ ...s, quality: q }))}>
              {q === 'low' ? 'Низкое' : q === 'medium' ? 'Среднее' : 'Высокое'}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <span className="setting-label">Полноэкранный режим</span>
        <button className="quality-btn" onClick={() => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else document.exitFullscreen();
        }}>Переключить</button>
      </div>
      <button className="back-btn" onClick={() => setScreen('menu')}>← Назад</button>
    </div>
  );

  // === LEVELS ===
  if (screen === 'levels') return (
    <div className="overlay-screen">
      <div className="overlay-title">Выбор уровня</div>
      <div className="level-grid">
        {LEVELS.map(level => (
          <div key={level.id} className={`level-card ${!level.unlocked ? 'locked' : ''}`}
            onClick={() => level.unlocked && startGame(level.id)}>
            <div className="level-num">{level.id}</div>
            <div className="level-name">{level.name}</div>
            <div className="level-stars">{level.unlocked ? '★★★' : '🔒'}</div>
            <div style={{ fontSize: '0.6rem', marginTop: 6, fontFamily: 'Oswald', letterSpacing: '0.1em', color: 'rgba(150,120,60,0.6)' }}>
              {level.unlocked ? `Аномалии: ${Math.round(level.anomalyChance * 100)}%` : 'ЗАБЛОКИРОВАНО'}
            </div>
          </div>
        ))}
      </div>
      <button className="back-btn" onClick={() => setScreen('menu')}>← Назад</button>
    </div>
  );

  // === STATS ===
  if (screen === 'stats') return (
    <div className="overlay-screen">
      <div className="overlay-title">Статистика</div>
      {[
        { name: 'Очки', value: gameState.score },
        { name: 'Поездов проверено', value: gameState.trainsChecked },
        { name: 'Аномалий обнаружено', value: gameState.anomaliesFound },
        { name: 'Аномалий пропущено', value: gameState.anomaliesMissed, danger: true },
        { name: 'Пройденный уровень', value: gameState.level },
        { name: 'Точность', value: gameState.trainsChecked > 0
          ? `${Math.round((gameState.anomaliesFound / Math.max(gameState.anomaliesFound + gameState.anomaliesMissed, 1)) * 100)}%`
          : '—' },
      ].map(({ name, value, danger }) => (
        <div className="stat-row" key={name}>
          <span className="stat-name">{name}</span>
          <span className="stat-value" style={danger && (value as number) > 0 ? { color: '#ff4400' } : undefined}>{value}</span>
        </div>
      ))}
      <button className="back-btn" onClick={() => setScreen('menu')}>← Назад</button>
    </div>
  );

  // === ACHIEVEMENTS ===
  if (screen === 'achievements') return (
    <div className="overlay-screen">
      <div className="overlay-title">Достижения</div>
      <div style={{ width: 520, overflowY: 'auto', maxHeight: '60vh' }}>
        {ACHIEVEMENTS.map(a => (
          <div key={a.id} className={`achievement-card ${a.locked ? 'locked' : ''}`}>
            <div className="achievement-icon">{a.icon}</div>
            <div className="achievement-info">
              <div className="achievement-name">{a.name}</div>
              <div className="achievement-desc">{a.desc}</div>
            </div>
            <div style={{ fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.15em',
              color: a.locked ? 'rgba(100,80,40,0.5)' : 'rgba(80,200,80,0.8)' }}>
              {a.locked ? 'ЗАБЛОК.' : '✓ ОТКРЫТО'}
            </div>
          </div>
        ))}
      </div>
      <button className="back-btn" onClick={() => setScreen('menu')}>← Назад</button>
    </div>
  );

  // === MENU ===
  if (screen === 'menu') return (
    <div className="screen">
      <div className="menu-bg" />
      <div className="menu-overlay" />
      <div className="fog-layer" />
      <div className="stars" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {STARS.slice(0, 40).map(s => (
          <div key={s.id} className="star" style={{
            left: `${s.x}%`, top: `${s.y * 0.5}%`,
            width: s.size, height: s.size,
            animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s`,
          }} />
        ))}
      </div>
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="title-main">Железная Дорога</div>
          <div className="title-sub">Ночное дежурство · Хоррор · Аномалии</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', alignItems: 'center' }}>
          <button className="menu-btn" onClick={() => startGame(1)}>Новая игра</button>
          <button className="menu-btn" onClick={() => setScreen('levels')}>Уровни</button>
          <button className="menu-btn" onClick={() => setScreen('stats')}>Статистика</button>
          <button className="menu-btn" onClick={() => setScreen('achievements')}>Достижения</button>
          <button className="menu-btn" onClick={() => setScreen('settings')}>Настройки</button>
          <button className="menu-btn danger" onClick={() => window.close()}>Выход</button>
        </div>
        <div style={{ fontFamily: 'Roboto', fontSize: '0.58rem', letterSpacing: '0.3em', color: 'rgba(150,120,70,0.4)', textTransform: 'uppercase' }}>
          Версия 1.0 · Все аномалии реальны
        </div>
      </div>
    </div>
  );

  // === GAME ===
  // FPS view: player looks out of booth window onto the tracks
  const fpsTrainZ = 1 - trainApproach / 100; // 1=far, 0=close
  const fpsTrainScale = 0.08 + (1 - fpsTrainZ) * 0.92;
  const fpsTrainY = 38 + fpsTrainZ * 12; // % from top of outside world

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#050508', overflow: 'hidden' }}>

      {showScreamer && (
        <div className="screamer-screen">
          <img src="https://cdn.poehali.dev/projects/4b785629-1c72-4e60-a5ac-0bb0e2f13d76/files/43dda910-f93c-48d5-a889-563535d7b161.jpg"
            alt="" className="screamer-img" />
          <div className="screamer-text">ТЫ НЕ ОДИН</div>
        </div>
      )}

      {showAlarmBar && <div className="alarm-bar">⚠ СИГНАЛИЗАЦИЯ АКТИВНА ⚠</div>}

      {isAnomaly && phase === 'anomaly_window' && !alarmSuccess && (
        <div className="anomaly-warning">⚠ АНОМАЛИЯ — {ANOMALY_NAMES[anomalyType]}</div>
      )}

      {/* HUD */}
      <div className="game-hud">
        <div className="hud-item">Очки: <span>{gameState.score}</span></div>
        <div className="hud-item">Поездов: <span>{gameState.trainsChecked}</span></div>
        <div className="hud-item">Аномалий: <span>{gameState.anomaliesFound}</span></div>
        <div className="hud-item" style={{ color: timeLeft < 30 ? '#ff6600' : undefined }}>
          Время: <span>{String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}</span>
        </div>
        <button onClick={exitGame} style={{
          fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.2em',
          padding: '5px 10px', border: '1px solid rgba(150,120,60,0.4)',
          background: 'rgba(5,4,3,0.7)', color: 'rgba(180,150,80,0.8)',
          cursor: 'pointer', textTransform: 'uppercase',
        }}>← МЕНЮ</button>
      </div>

      {/* ===================== FPS GAME WORLD ===================== */}
      {/* Layer 1 — outside world seen through window */}
      <div style={{ position: 'absolute', inset: 0 }}>

        {/* SKY — top 58% of screen */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '58%',
          background: 'radial-gradient(ellipse at 40% 30%, #0e1020 0%, #050508 70%)',
        }}>
          {STARS.map(s => (
            <div key={s.id} className="star" style={{
              left: `${s.x}%`, top: `${s.y * 1.6}%`,
              width: s.size, height: s.size,
              animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s`,
            }} />
          ))}
          {/* Moon */}
          <div style={{
            position: 'absolute', top: '12%', right: '18%',
            width: 55, height: 55, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #f0e8c8, #c8b880)',
            boxShadow: '0 0 20px rgba(240,220,150,0.4), 0 0 60px rgba(200,180,100,0.12)',
          }} />
          {/* Fog at horizon */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
            background: 'linear-gradient(to top, rgba(60,80,70,0.25) 0%, transparent 100%)',
          }} />
        </div>

        {/* GROUND — bottom 42% */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%',
          background: 'linear-gradient(to bottom, #0a0e08 0%, #0d1209 40%, #101408 100%)',
        }} />

        {/* TRACKS SVG — full screen, perspective from eye level */}
        <svg
          viewBox="0 0 1000 600"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="railGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a3828" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#6a5040" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="groundFog" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#0d1209" />
              <stop offset="100%" stopColor="#0a0e08" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Ballast / gravel strip */}
          <polygon points="460,348 540,348 780,600 220,600" fill="#1a1410" opacity="0.8" />

          {/* Left rail */}
          <path d="M 490 348 L 180 600" stroke="url(#railGrad)" strokeWidth="5" fill="none" strokeLinecap="round" />
          {/* Right rail */}
          <path d="M 510 348 L 820 600" stroke="url(#railGrad)" strokeWidth="5" fill="none" strokeLinecap="round" />

          {/* Rail shine */}
          <path d="M 490 348 L 180 600" stroke="#8a7060" strokeWidth="1.5" fill="none" opacity="0.4" />
          <path d="M 510 348 L 820 600" stroke="#8a7060" strokeWidth="1.5" fill="none" opacity="0.4" />

          {/* Sleepers — perspective */}
          {Array.from({ length: 22 }, (_, i) => {
            const t = Math.pow(i / 21, 0.7);
            const y = 348 + t * 252;
            const xl = 490 - (490 - 180) * t;
            const xr = 510 + (820 - 510) * t;
            const w = 2 + t * 11;
            return (
              <line key={i}
                x1={xl - 6 * t} y1={y} x2={xr + 6 * t} y2={y}
                stroke="#251808" strokeWidth={w} opacity={0.3 + t * 0.6}
              />
            );
          })}

          {/* Distance fog on ground */}
          <rect x="0" y="340" width="1000" height="30" fill="url(#groundFog)" opacity="0.6" />

          {/* Horizon atmospheric haze */}
          <rect x="0" y="335" width="1000" height="20"
            fill="rgba(80,110,100,0.12)" />
        </svg>

        {/* TRAIN — rendered in the outside world */}
        {trainVisible && (() => {
          const glowColor = anomalyType === 'ghost' ? '#00ffee' : anomalyType === 'flying' ? '#cc00ff' : '#ff2200';
          const trainW = Math.round(fpsTrainScale * 460);
          const trainH = Math.round(fpsTrainScale * 180);
          const trainLeft = `calc(50% - ${trainW / 2}px)`;
          const trainTop = `calc(${fpsTrainY}% - ${trainH / 2}px)`;

          return (
            <div
              style={{
                position: 'absolute',
                left: trainLeft,
                top: trainTop,
                width: trainW,
                height: trainH,
                transition: 'left 0.15s linear, top 0.15s linear, width 0.15s linear, height 0.15s linear',
                zIndex: 20,
              }}
              className={
                anomalyType === 'flying' ? 'fps-train-flying' :
                anomalyType === 'ghost' ? 'fps-train-ghost' : ''
              }
            >
              {/* Train body SVG */}
              <svg
                viewBox="0 0 460 180"
                width={trainW} height={trainH}
                style={{
                  transform: anomalyType === 'reversed' ? 'scaleX(-1)' : undefined,
                  filter: anomalyType === 'ghost' ? 'hue-rotate(180deg) brightness(1.8) blur(1px)' : undefined,
                  display: 'block',
                }}
              >
                {/* Locomotive body */}
                <rect x="10" y="30" width="380" height="130" rx="8" fill="#1e1a14" stroke="#2e2820" strokeWidth="2" />
                {/* Cab */}
                <rect x="340" y="10" width="110" height="150" rx="6" fill="#252018" stroke="#3a3020" strokeWidth="1.5" />
                {/* Roof */}
                <rect x="8" y="28" width="385" height="12" rx="4" fill="#2a2418" />
                {/* Front face */}
                <rect x="440" y="30" width="16" height="130" rx="3" fill="#1a1510" />

                {/* Windows cab */}
                <rect x="355" y="22" width="40" height="30" rx="3" fill="rgba(255,200,80,0.25)" stroke="rgba(200,150,50,0.5)" strokeWidth="1" />
                <rect x="402" y="22" width="40" height="30" rx="3" fill="rgba(255,200,80,0.25)" stroke="rgba(200,150,50,0.5)" strokeWidth="1" />

                {/* Side windows */}
                <rect x="50" y="50" width="55" height="45" rx="4" fill="rgba(255,180,60,0.15)" stroke="rgba(180,130,40,0.4)" strokeWidth="1" />
                <rect x="120" y="50" width="55" height="45" rx="4" fill="rgba(255,180,60,0.15)" stroke="rgba(180,130,40,0.4)" strokeWidth="1" />
                <rect x="190" y="50" width="55" height="45" rx="4" fill="rgba(255,180,60,0.2)" stroke="rgba(180,130,40,0.4)" strokeWidth="1" />
                <rect x="260" y="50" width="55" height="45" rx="4" fill="rgba(255,180,60,0.15)" stroke="rgba(180,130,40,0.4)" strokeWidth="1" />

                {/* Headlight */}
                <circle cx="450" cy="90" r="14" fill="rgba(255,240,160,0.9)" />
                <circle cx="450" cy="90" r="8" fill="#fff8d0" />
                {/* Headlight beam */}
                <ellipse cx="450" cy="90" rx="60" ry="25" fill="rgba(255,220,100,0.06)" />

                {/* Undercarriage */}
                <rect x="15" y="148" width="440" height="16" rx="2" fill="#151210" stroke="#1e1a14" />
                {/* Wheels */}
                {[40, 100, 170, 240, 310, 390].map((cx, i) => (
                  <g key={i}>
                    <circle cx={cx} cy="165" r="18" fill="#111" stroke="#2a2018" strokeWidth="2" />
                    <circle cx={cx} cy="165" r="9" fill="#1a1510" />
                    <circle cx={cx} cy="165" r="3" fill="#3a3020" />
                  </g>
                ))}

                {/* Smokestack */}
                <rect x="60" y="12" width="16" height="20" rx="2" fill="#1a1510" stroke="#2a2018" />

                {/* Number plate */}
                <rect x="50" y="108" width="60" height="20" rx="2" fill="#0a0806" stroke="#2a2018" />
                <text x="80" y="122" textAnchor="middle" fill="rgba(200,160,60,0.8)" fontSize="11" fontFamily="Oswald">№347</text>

                {/* Anomaly glow overlay */}
                {isAnomaly && (
                  <rect x="8" y="8" width="447" height="166" rx="8"
                    fill="none"
                    stroke={glowColor}
                    strokeWidth="3"
                    opacity="0.8"
                    style={{ filter: `drop-shadow(0 0 12px ${glowColor})` }}
                  />
                )}
              </svg>

              {/* Headlight cone */}
              {!isAnomaly && fpsTrainScale > 0.3 && (
                <div style={{
                  position: 'absolute',
                  right: -60,
                  top: '40%',
                  width: 80,
                  height: 40,
                  background: 'radial-gradient(ellipse at left, rgba(255,220,100,0.25) 0%, transparent 100%)',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Smoke */}
              {fpsTrainScale > 0.15 && (
                <div style={{ position: 'absolute', top: -30, left: Math.round(trainW * 0.12) }}>
                  {[0, 0.8, 1.6].map((d, i) => (
                    <div key={i} className="smoke-puff" style={{
                      width: Math.round(fpsTrainScale * 40 + i * 10),
                      height: Math.round(fpsTrainScale * 40 + i * 10),
                      left: i * 12,
                      animationDelay: `${d}s`,
                    }} />
                  ))}
                </div>
              )}

              {/* Ghost twin for MULTIPLE */}
              {anomalyType === 'multiple' && (
                <div style={{
                  position: 'absolute', top: -Math.round(trainH * 0.35),
                  left: Math.round(trainW * 0.1),
                  opacity: 0.4,
                  filter: 'hue-rotate(180deg) brightness(2) blur(2px)',
                }}>
                  <svg viewBox="0 0 460 180" width={Math.round(trainW * 0.8)} height={Math.round(trainH * 0.8)}>
                    <rect x="10" y="30" width="380" height="130" rx="8" fill="#1e1a14" stroke="#00ffee" strokeWidth="3" />
                    <rect x="340" y="10" width="110" height="150" rx="6" fill="#252018" />
                  </svg>
                </div>
              )}
            </div>
          );
        })()}

        {/* DISAPPEARED anomaly — empty tracks hint */}
        {anomalyType === 'disappeared' && phase === 'anomaly_window' && (
          <div style={{
            position: 'absolute', left: '50%', top: '44%',
            transform: 'translate(-50%, -50%)',
            fontFamily: 'Oswald', fontSize: 'clamp(0.7rem, 1.5vw, 1rem)',
            letterSpacing: '0.35em', color: 'rgba(220,40,10,0.95)',
            textTransform: 'uppercase', zIndex: 30, whiteSpace: 'nowrap',
            animation: 'warning-blink 0.7s steps(1) infinite',
            textShadow: '0 0 12px rgba(220,40,10,0.7)',
            background: 'rgba(5,2,2,0.6)',
            padding: '8px 18px',
            border: '1px solid rgba(200,30,10,0.4)',
          }}>??? ПОЕЗД ИСЧЕЗ ???</div>
        )}

        {/* Darkness when lights off */}
        {!lightsOn && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 18, pointerEvents: 'none',
          }} />
        )}

        {/* Anomaly vignette */}
        {isAnomaly && phase === 'anomaly_window' && !alarmSuccess && (
          <div className="anomaly-effect red-vignette" style={{ zIndex: 19 }} />
        )}
      </div>

      {/* ===================== BOOTH INTERIOR — FPS FRAME ===================== */}
      {/* This overlays the outside world as if you're sitting inside the booth */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>

        {/* LEFT WALL of booth */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: '18%',
          background: 'linear-gradient(to right, #0c0a07 60%, rgba(12,10,7,0) 100%)',
          pointerEvents: 'none',
        }}>
          {/* Wall texture boards */}
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              position: 'absolute', top: `${i * 25}%`, left: 0, right: 0,
              borderBottom: '1px solid rgba(50,35,15,0.3)',
            }} />
          ))}
          {/* Coat hook */}
          <div style={{ position: 'absolute', top: '18%', right: 24, width: 8, height: 20, background: '#3a2a18', borderRadius: '0 0 4px 4px', border: '1px solid #5a3a20' }} />
          {/* Calendar on wall */}
          <div style={{
            position: 'absolute', top: '28%', right: 10,
            width: 44, height: 55, background: '#f0ead8',
            border: '2px solid #4a3020', transform: 'rotate(-1deg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 9, fontFamily: 'Oswald', color: '#cc2200', letterSpacing: '0.05em' }}>ОКТ</div>
            <div style={{ fontSize: 18, fontFamily: 'Oswald', color: '#1a1000', fontWeight: 700, lineHeight: 1 }}>13</div>
            <div style={{ fontSize: 7, color: '#666', marginTop: 2 }}>2037</div>
          </div>
        </div>

        {/* RIGHT WALL of booth */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: '18%',
          background: 'linear-gradient(to left, #0c0a07 60%, rgba(12,10,7,0) 100%)',
          pointerEvents: 'none',
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              position: 'absolute', top: `${i * 25}%`, left: 0, right: 0,
              borderBottom: '1px solid rgba(50,35,15,0.3)',
            }} />
          ))}
          {/* Radio / intercom unit */}
          <div style={{
            position: 'absolute', top: '15%', left: 10,
            width: 55, height: 70, background: '#1a1510',
            border: '1px solid #2a2018', padding: 6,
          }}>
            <div style={{ fontSize: 6, fontFamily: 'Oswald', color: 'rgba(180,140,60,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>Связь</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['#22aa44','#cc2200','#ddaa00'].map((c, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }} />
              ))}
            </div>
            <div style={{ marginTop: 6, height: 20, background: '#050403', border: '1px solid #2a2018', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Oswald', fontSize: 7, color: 'rgba(80,200,80,0.8)' }}>ОК</span>
            </div>
          </div>
          {/* Window latch */}
          <div style={{ position: 'absolute', top: '55%', left: 18, width: 12, height: 30, background: '#3a2a18', borderRadius: 2, border: '1px solid #5a3a20' }} />
        </div>

        {/* TOP of booth (ceiling strip) */}
        <div style={{
          position: 'absolute', top: 0, left: '18%', right: '18%',
          height: '5%',
          background: 'linear-gradient(to bottom, #0c0a07 0%, rgba(12,10,7,0) 100%)',
        }}>
          {/* Ceiling lamp */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: 30, height: 12, background: lightsOn ? '#ddcc80' : '#2a2018',
            boxShadow: lightsOn ? '0 0 20px 10px rgba(220,200,100,0.25)' : 'none',
            borderRadius: '0 0 4px 4px',
            transition: 'all 0.3s',
          }} />
        </div>

        {/* WINDOW FRAME — the wooden frame around the view */}
        {/* Top beam */}
        <div style={{
          position: 'absolute', top: '5%', left: '18%', right: '18%',
          height: 18,
          background: 'linear-gradient(to bottom, #3a2a18, #2a1e10)',
          borderBottom: '2px solid #4a3020',
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
        }} />
        {/* Bottom sill */}
        <div style={{
          position: 'absolute', top: '62%', left: '18%', right: '18%',
          height: 22,
          background: 'linear-gradient(to bottom, #2a1e10, #3a2a18)',
          borderTop: '2px solid #4a3020',
          borderBottom: '2px solid #1a1208',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.5)',
        }} />
        {/* Left frame post */}
        <div style={{
          position: 'absolute', top: '5%', bottom: '38%', left: '18%',
          width: 16,
          background: 'linear-gradient(to right, #3a2a18, #2a1e10)',
          borderRight: '2px solid #4a3020',
        }} />
        {/* Right frame post */}
        <div style={{
          position: 'absolute', top: '5%', bottom: '38%', right: '18%',
          width: 16,
          background: 'linear-gradient(to left, #3a2a18, #2a1e10)',
          borderLeft: '2px solid #4a3020',
        }} />

        {/* Booth interior floor area (bottom 38%) */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '38%',
          background: 'linear-gradient(to top, #090807 0%, #110e0a 55%, rgba(10,8,6,0.97) 100%)',
          borderTop: '2px solid #2a2018',
          pointerEvents: 'all',
        }}>
          {/* Floor boards texture */}
          {[0,1,2].map(i => (
            <div key={i} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${20 + i * 30}%`,
              borderLeft: '1px solid rgba(40,30,15,0.2)',
            }} />
          ))}

          {/* DESK SURFACE */}
          <div style={{
            position: 'absolute', top: 0, left: '12%', right: '12%',
            height: 8,
            background: 'linear-gradient(to bottom, #2a2218, #1a1610)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }} />
        </div>

        {/* CONTROL PANEL inside the booth — takes bottom 38% */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '38%',
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 5% 12px',
          pointerEvents: 'all',
          zIndex: 40,
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 8, paddingBottom: 6,
            borderBottom: '1px solid rgba(80,60,28,0.35)',
          }}>
            <span style={{ fontFamily: 'Oswald', fontSize: '0.6rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(180,140,70,0.45)' }}>
              Пульт управления · Будка №3 · Перегон Тьма–Светлый
            </span>
            <span style={{ fontFamily: 'Oswald', fontSize: '1.15rem', color: '#ff4400', letterSpacing: '0.1em', textShadow: '0 0 10px rgba(255,60,0,0.5)', marginLeft: 'auto' }}>
              {clock}
            </span>
          </div>

          {/* Main controls row */}
          <div style={{ display: 'flex', gap: 14, flex: 1, alignItems: 'flex-start' }}>

            {/* Indicators */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center', minWidth: 44 }}>
              {[
                { label: 'Поезд', cls: phase === 'approaching' || phase === 'anomaly_window' ? 'amber-on' : 'green-on' },
                { label: 'Тревога', cls: isAnomaly && phase === 'anomaly_window' ? 'red-on' : 'off' },
                { label: 'Свет', cls: lightsOn ? 'green-on' : 'off' },
                { label: 'Сигнал', cls: alarmSuccess ? 'green-on' : 'off' },
              ].map(({ label, cls }) => (
                <div className="indicator" key={label}>
                  <div className={`indicator-light ${cls}`} />
                  <div className="indicator-label">{label}</div>
                </div>
              ))}
            </div>

            {/* Big action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div className="section-label">Управление</div>
              <button
                className={`ctrl-btn btn-alarm ${isAnomaly && phase === 'anomaly_window' && !alarmSuccess ? 'pulsing' : ''}`}
                onClick={handleAlarm}
                style={{ minWidth: 148 }}
              >
                ⚠ Сигнализация
              </button>
              <button className="ctrl-btn btn-normal" onClick={handleNormal} style={{ minWidth: 148 }}>
                ✓ Норма
              </button>
              <button className="ctrl-btn btn-light" onClick={handleToggleLights} style={{ minWidth: 148 }}>
                {lightsOn ? '○ Свет выкл' : '● Свет вкл'}
              </button>
              <button className="ctrl-btn btn-log" onClick={() => { audio.playButtonClick(); addLog('Журнал обновлён. Дежурный в норме.'); }} style={{ minWidth: 148 }}>
                ✎ Журнал
              </button>
            </div>

            {/* Gauge column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 110 }}>
              <div className="section-label">Приближение</div>
              <div className="gauge-bar">
                <div className="gauge-fill approach" style={{ width: `${trainApproach}%` }} />
              </div>
              <div style={{ fontFamily: 'Oswald', fontSize: '0.58rem', color: 'rgba(160,130,65,0.55)', letterSpacing: '0.1em' }}>
                {phase === 'waiting' ? 'ОЖИДАНИЕ' : phase === 'approaching' ? `${Math.round(trainApproach)}%` : phase === 'anomaly_window' ? 'ПРИБЫЛ' : 'ОТБЫЛ'}
              </div>
              <div style={{ marginTop: 6 }}>
                <div className="section-label">Статус</div>
                <div style={{
                  fontFamily: 'Oswald', fontSize: '0.62rem', letterSpacing: '0.09em', marginTop: 3,
                  color: isAnomaly ? '#ff4422' : '#44bb22',
                  textShadow: isAnomaly ? '0 0 8px rgba(255,60,20,0.5)' : '0 0 5px rgba(50,200,80,0.4)',
                }}>
                  {isAnomaly ? `⚠ ${ANOMALY_NAMES[anomalyType]}` : '✓ НОРМА'}
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <div className="section-label">Уровень {gameState.level}</div>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.55rem', color: 'rgba(130,100,50,0.5)' }}>
                  {LEVELS.find(l => l.id === gameState.level)?.name}
                </div>
              </div>
            </div>

            {/* Log */}
            <div className="status-display" style={{ flex: 1 }}>
              {logs.slice(0, 8).map((log, i) => (
                <div key={i} className="status-line">
                  <div className={`status-dot ${log.includes('⚠') ? 'amber' : log.includes('✖') || log.includes('пропущ') || log.includes('Угроза') || log.includes('Опасность') ? 'red' : 'green'}`} />
                  <span style={{ fontSize: '0.62rem', lineHeight: 1.3 }}>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}