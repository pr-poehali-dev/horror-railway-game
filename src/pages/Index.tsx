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

      {/* 3D VIEWPORT */}
      <div className="game-viewport">
        <div className="sky-bg" />
        <div className="stars">
          {STARS.map(s => (
            <div key={s.id} className="star" style={{
              left: `${s.x}%`, top: `${s.y}%`,
              width: s.size, height: s.size,
              animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s`,
            }} />
          ))}
        </div>
        <div className="moon" />

        {/* Darkness overlay when lights off */}
        {!lightsOn && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 10, pointerEvents: 'none' }} />
        )}

        {/* Ground + SVG tracks */}
        <div className="ground-plane">
          <svg viewBox="0 0 800 400" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="none">
            {/* Left rail */}
            <path d="M 390 0 L 120 400" stroke="#5a4838" strokeWidth="5" fill="none" />
            {/* Right rail */}
            <path d="M 410 0 L 680 400" stroke="#5a4838" strokeWidth="5" fill="none" />
            {/* Sleepers */}
            {Array.from({ length: 18 }, (_, i) => {
              const t = i / 17;
              const y = t * 400;
              const xl = 390 - (390 - 120) * t;
              const xr = 410 + (680 - 410) * t;
              return (
                <line key={i} x1={xl - 5} y1={y} x2={xr + 5} y2={y}
                  stroke="#2a1a0e" strokeWidth={2 + t * 9} opacity={0.35 + t * 0.55} />
              );
            })}
            {/* Ground fog at horizon */}
            <rect x="0" y="0" width="800" height="40" fill="url(#fogGrad)" opacity="0.5" />
            <defs>
              <linearGradient id="fogGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8aabb0" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#8aabb0" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          {/* TRAIN */}
          {trainVisible && (
            <div style={{
              position: 'absolute',
              left: '50%',
              bottom: `${trainBottom}%`,
              transform: `translateX(-50%) scale(${trainScale}) ${anomalyType === 'reversed' ? 'scaleX(-1)' : ''}`,
              transformOrigin: 'bottom center',
              transition: 'scale 0.2s linear, bottom 0.2s linear',
              zIndex: 20,
            }}
              className={anomalyType === 'flying' ? 'train-flying' : anomalyType === 'ghost' ? 'train-ghost' : ''}
            >
              <div className="train-body">
                <div className="train-window" style={{ left: 12 }} />
                <div className="train-window" style={{ left: 60 }} />
                <div className="train-window" style={{ left: 108 }} />
                <div className="train-headlight" />
                {/* Smokestack */}
                <div style={{ position: 'absolute', top: -28, left: 18 }}>
                  {[0, 0.7, 1.4].map((d, i) => (
                    <div key={i} className="smoke-puff"
                      style={{ width: 18 + i * 4, height: 18 + i * 4, left: i * 8, animationDelay: `${d}s` }} />
                  ))}
                </div>
                {/* Anomaly glow border */}
                {isAnomaly && (
                  <div style={{
                    position: 'absolute', inset: -5,
                    border: `2px solid ${anomalyType === 'ghost' ? '#00ffee' : anomalyType === 'flying' ? '#dd00ff' : '#ff2200'}`,
                    borderRadius: 5,
                    boxShadow: `0 0 25px ${anomalyType === 'ghost' ? '#00ffee' : anomalyType === 'flying' ? '#dd00ff' : '#ff2200'}`,
                    pointerEvents: 'none',
                    animation: 'red-pulse-vignette 0.5s ease-in-out infinite',
                  }} />
                )}
              </div>

              {/* Double for MULTIPLE anomaly */}
              {anomalyType === 'multiple' && (
                <div className="train-body train-ghost" style={{ position: 'absolute', top: -25, left: 35, opacity: 0.45 }}>
                  <div className="train-window" style={{ left: 12 }} />
                  <div className="train-window" style={{ left: 60 }} />
                </div>
              )}
            </div>
          )}

          {/* Disappeared anomaly text */}
          {anomalyType === 'disappeared' && phase === 'anomaly_window' && (
            <div style={{
              position: 'absolute', left: '50%', bottom: '50%',
              transform: 'translateX(-50%)', fontFamily: 'Oswald',
              fontSize: '0.85rem', letterSpacing: '0.3em', color: 'rgba(200,50,20,0.9)',
              textTransform: 'uppercase', zIndex: 30, whiteSpace: 'nowrap',
              animation: 'warning-blink 0.8s steps(1) infinite',
              textShadow: '0 0 10px rgba(200,50,20,0.6)',
            }}>??? ПОЕЗД ИСЧЕЗ ???</div>
          )}
        </div>

        {/* Anomaly vignette */}
        {isAnomaly && phase === 'anomaly_window' && !alarmSuccess && (
          <div className="anomaly-effect red-vignette" />
        )}

        {/* === BOOTH FRAME === */}
        <div className="booth-overlay">
          {/* Window frame edges */}
          <div className="booth-window" />
          <div className="booth-left" />
          <div className="booth-right" />

          {/* Stool visible at bottom of window */}
          <div style={{ position: 'absolute', bottom: '40%', left: '50%', transform: 'translateX(-50%)', zIndex: 5, pointerEvents: 'none' }}>
            <div className="stool-seat" />
            <div className="stool-leg" />
          </div>

          <div className="booth-bottom" />

          {/* === CONTROL PANEL === */}
          <div className="control-panel">
            <div className="panel-top-bar">
              <span className="panel-title">Пульт управления · Будка №3 · Перегон Тьма–Светлый</span>
              <span className="panel-clock">{clock}</span>
            </div>

            <div className="panel-controls">
              {/* Indicator column */}
              <div className="indicator-panel">
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

              {/* Action buttons */}
              <div className="btn-section">
                <div className="section-label">Управление</div>
                <button
                  className={`ctrl-btn btn-alarm ${isAnomaly && phase === 'anomaly_window' && !alarmSuccess ? 'pulsing' : ''}`}
                  onClick={handleAlarm}
                >
                  ⚠ Сигнализация
                </button>
                <button className="ctrl-btn btn-normal" onClick={handleNormal}>
                  ✓ Норма
                </button>
                <button className="ctrl-btn btn-light" onClick={handleToggleLights}>
                  {lightsOn ? '○ Свет выкл' : '● Свет вкл'}
                </button>
                <button className="ctrl-btn btn-log" onClick={() => {
                  audio.playButtonClick();
                  addLog('Журнал обновлён. Дежурный в норме.');
                }}>
                  ✎ Журнал
                </button>
              </div>

              {/* Gauge + status */}
              <div className="gauge-section">
                <div className="section-label">Приближение поезда</div>
                <div className="gauge-bar">
                  <div className="gauge-fill approach" style={{ width: `${trainApproach}%` }} />
                </div>
                <div style={{ fontFamily: 'Oswald', fontSize: '0.6rem', color: 'rgba(160,130,70,0.55)', letterSpacing: '0.1em' }}>
                  {phase === 'waiting' ? 'ОЖИДАНИЕ' : phase === 'approaching' ? `${Math.round(trainApproach)}%` : phase === 'anomaly_window' ? 'ПРИБЫЛ' : 'ОТБЫЛ'}
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="section-label">Аномалия</div>
                  <div style={{
                    fontFamily: 'Oswald', fontSize: '0.65rem', letterSpacing: '0.1em',
                    color: isAnomaly ? '#ff4422' : '#44bb22',
                    textShadow: isAnomaly ? '0 0 8px rgba(255,60,20,0.5)' : '0 0 6px rgba(50,200,80,0.4)',
                    marginTop: 3,
                  }}>
                    {isAnomaly ? `⚠ ${ANOMALY_NAMES[anomalyType]}` : '✓ НЕТ'}
                  </div>
                </div>

                <div style={{ marginTop: 6 }}>
                  <div className="section-label">Уровень {gameState.level}</div>
                  <div style={{ fontFamily: 'Oswald', fontSize: '0.58rem', color: 'rgba(140,110,55,0.5)' }}>
                    {LEVELS.find(l => l.id === gameState.level)?.name} · Ночь
                  </div>
                </div>
              </div>

              {/* Log */}
              <div className="status-display">
                {logs.slice(0, 8).map((log, i) => (
                  <div key={i} className="status-line">
                    <div className={`status-dot ${log.includes('⚠') || log.includes('warn') ? 'amber' : log.includes('✖') || log.includes('пропущ') ? 'red' : 'green'}`} />
                    <span style={{ fontSize: '0.63rem', lineHeight: 1.3 }}>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}