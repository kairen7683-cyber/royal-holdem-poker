(() => {
  'use strict';

  // =========================================================
  // 1. PWA Registration & Install Prompt
  // =========================================================
  let deferredInstallPrompt = null;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.classList.add('hidden');
    showToast('📲 로열 홀덤 앱이 설치되었습니다!');
  });

  // =========================================================
  // 2. Persistent Preferences, Stats, Achievements & Savegame
  // =========================================================
  const STORAGE_KEYS = {
    PREFS: 'royal_holdem_prefs_v1',
    STATS: 'royal_holdem_stats_v1',
    SAVE: 'royal_holdem_save_v1'
  };

  const DEFAULT_PREFS = {
    nickname: '대표님',
    avatar: '😎',
    mode: 'tournament', // tournament | cash
    seats: 4,           // 2 | 4 | 6
    difficulty: 'normal', // easy | normal | pro
    startChips: 1000,
    sound: true,
    vibrate: true,
    showEquity: true,
    turnTimer: true,
    speed: 1
  };

  const DEFAULT_STATS = {
    handsPlayed: 0,
    handsWon: 0,
    tournamentsWon: 0,
    biggestPot: 0,
    bestHandCategory: -1,
    bestHandName: '-',
    currentStreak: 0,
    maxStreak: 0,
    allInWins: 0,
    achievements: {}
  };

  const ACHIEVEMENTS = [
    { id: 'first_win', icon: '🎉', title: '첫 승리', desc: '첫 핸드에서 승리하기' },
    { id: 'streak_3', icon: '🔥', title: '3연승 달성', desc: '연속 3핸드 승리하기' },
    { id: 'allin_hero', icon: '⚡', title: '강심장 올인', desc: '올인 승부에서 승리하기' },
    { id: 'big_pot', icon: '💰', title: '하이롤러', desc: '500칩 이상 팟 획득' },
    { id: 'flush_up', icon: '♦️', title: '플러시 마스터', desc: '플러시 이상 족보로 승리' },
    { id: 'fullhouse_up', icon: '👑', title: '풀하우스 클럽', desc: '풀하우스 이상 족보로 승리' },
    { id: 'tourney_champ', icon: '🏆', title: '테이블 챔피언', desc: '토너먼트 최종 우승 달성' },
    { id: 'veteran_30', icon: '♠️', title: '베테랑 플레이어', desc: '누적 30핸드 플레이' }
  ];

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      return { ...structuredClone(fallback), ...JSON.parse(raw) };
    } catch {
      return structuredClone(fallback);
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }

  const prefs = loadJSON(STORAGE_KEYS.PREFS, DEFAULT_PREFS);
  let stats = loadJSON(STORAGE_KEYS.STATS, DEFAULT_STATS);

  function showToast(msg) {
    const box = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  function unlockAchievement(id) {
    if (stats.achievements[id]) return;
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return;
    stats.achievements[id] = Date.now();
    saveJSON(STORAGE_KEYS.STATS, stats);
    showToast(`${def.icon} 업적 달성: ${def.title}`);
  }

  // =========================================================
  // 3. Sound & Haptics Engine (Web Audio API)
  // =========================================================
  const Sound = (() => {
    let ctx = null;
    function getCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type = 'sine', vol = 0.06, delay = 0) {
      if (!prefs.sound) return;
      const c = getCtx();
      if (!c) return;
      const t = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t);
      osc.stop(t + dur);
    }
    function vib(ms) {
      if (prefs.vibrate && navigator.vibrate) {
        try { navigator.vibrate(ms); } catch {}
      }
    }
    return {
      deal() { tone(540, 0.055, 'triangle', 0.05); },
      check() { tone(300, 0.06, 'sine', 0.06); tone(260, 0.05, 'sine', 0.04, 0.05); vib(12); },
      chip() { tone(1040, 0.045, 'sine', 0.055); tone(1380, 0.045, 'sine', 0.045, 0.03); vib(16); },
      fold() { tone(220, 0.09, 'sine', 0.045); vib(10); },
      allIn() {
        tone(330, 0.12, 'sawtooth', 0.05, 0);
        tone(440, 0.14, 'sawtooth', 0.055, 0.08);
        tone(660, 0.22, 'triangle', 0.07, 0.16);
        vib([25, 30, 40]);
      },
      win() {
        tone(523.25, 0.14, 'triangle', 0.075, 0);
        tone(659.25, 0.14, 'triangle', 0.075, 0.09);
        tone(783.99, 0.18, 'triangle', 0.08, 0.18);
        tone(1046.5, 0.26, 'triangle', 0.08, 0.28);
        vib([20, 25, 35]);
      }
    };
  })();

  // =========================================================
  // 4. Cards, Exact 7-Card Hand Evaluator & Monte Carlo Equity
  // =========================================================
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const RANK_LABELS = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };
  const HAND_NAMES = [
    '하이카드', '원페어', '투페어', '트리플', '스트레이트',
    '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 스트레이트 플러시'
  ];

  function createShuffledDeck(excludeIds = null) {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const id = `${rank}${suit}`;
        if (excludeIds && excludeIds.has(id)) continue;
        deck.push({ rank, suit, id });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function compareScores(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
  }

  function formatHandName(cat, tb) {
    const base = HAND_NAMES[cat];
    if (cat === 9) return base;
    if (cat === 8 || cat === 4 || cat === 5) return `${base} (${RANK_LABELS[tb[0]]} 하이)`;
    if (cat === 7 || cat === 3 || cat === 1 || cat === 0) return `${base} (${RANK_LABELS[tb[0]]})`;
    if (cat === 6) return `${base} (${RANK_LABELS[tb[0]]} 풀 ${RANK_LABELS[tb[1]]})`;
    if (cat === 2) return `${base} (${RANK_LABELS[tb[0]]}, ${RANK_LABELS[tb[1]]})`;
    return base;
  }

  function evaluate5(cards) {
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    const r0 = sorted[0].rank, r1 = sorted[1].rank, r2 = sorted[2].rank, r3 = sorted[3].rank, r4 = sorted[4].rank;
    const isFlush = sorted[0].suit === sorted[1].suit &&
      sorted[0].suit === sorted[2].suit &&
      sorted[0].suit === sorted[3].suit &&
      sorted[0].suit === sorted[4].suit;

    let isStraight = false;
    let straightHigh = r0;
    if (r0 !== r1 && r1 !== r2 && r2 !== r3 && r3 !== r4) {
      if (r0 - r4 === 4) {
        isStraight = true;
      } else if (r0 === 14 && r1 === 5 && r2 === 4 && r3 === 3 && r4 === 2) {
        isStraight = true;
        straightHigh = 5;
      }
    }

    // Frequency counts
    const counts = new Map();
    counts.set(r0, (counts.get(r0) || 0) + 1);
    counts.set(r1, (counts.get(r1) || 0) + 1);
    counts.set(r2, (counts.get(r2) || 0) + 1);
    counts.set(r3, (counts.get(r3) || 0) + 1);
    counts.set(r4, (counts.get(r4) || 0) + 1);

    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

    let cat = 0;
    let tb;
    if (isStraight && isFlush) {
      cat = straightHigh === 14 ? 9 : 8;
      tb = [straightHigh];
    } else if (groups[0][1] === 4) {
      cat = 7;
      tb = [groups[0][0], groups[1][0]];
    } else if (groups[0][1] === 3 && groups[1][1] === 2) {
      cat = 6;
      tb = [groups[0][0], groups[1][0]];
    } else if (isFlush) {
      cat = 5;
      tb = [r0, r1, r2, r3, r4];
    } else if (isStraight) {
      cat = 4;
      tb = [straightHigh];
    } else if (groups[0][1] === 3) {
      cat = 3;
      tb = [groups[0][0], groups[1][0], groups[2][0]];
    } else if (groups[0][1] === 2 && groups[1][1] === 2) {
      cat = 2;
      tb = [groups[0][0], groups[1][0], groups[2][0]];
    } else if (groups[0][1] === 2) {
      cat = 1;
      tb = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
    } else {
      cat = 0;
      tb = [r0, r1, r2, r3, r4];
    }

    return { category: cat, score: [cat, ...tb], tb, bestCards: sorted };
  }

  function evaluateBestHand(cards) {
    if (!cards || cards.length < 2) return null;
    if (cards.length < 5) {
      const s = [...cards].sort((a, b) => b.rank - a.rank);
      if (s[0].rank === s[1].rank) {
        return { category: 1, score: [1, s[0].rank], name: `포켓 페어 (${RANK_LABELS[s[0].rank]})`, bestCards: s };
      }
      const suited = s[0].suit === s[1].suit ? ' 수티드' : '';
      return { category: 0, score: [0, s[0].rank, s[1].rank], name: `${RANK_LABELS[s[0].rank]}-${RANK_LABELS[s[1].rank]}${suited}`, bestCards: s };
    }
    let best = null;
    const n = cards.length;
    for (let a = 0; a < n - 4; a++) {
      for (let b = a + 1; b < n - 3; b++) {
        for (let c = b + 1; c < n - 2; c++) {
          for (let d = c + 1; d < n - 1; d++) {
            for (let e = d + 1; e < n; e++) {
              const res = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!best || compareScores(res.score, best.score) > 0) best = res;
            }
          }
        }
      }
    }
    best.name = formatHandName(best.category, best.tb);
    return best;
  }

  // Fast numeric rank encoding for Monte Carlo speed
  function quickScore5(cards) {
    const res = evaluate5(cards);
    const s = res.score;
    return (s[0] || 0) * 1e10 + (s[1] || 0) * 1e8 + (s[2] || 0) * 1e6 + (s[3] || 0) * 1e4 + (s[4] || 0) * 1e2 + (s[5] || 0);
  }

  function quickBest7(cards) {
    let best = -1;
    const n = cards.length;
    for (let a = 0; a < n - 4; a++)
      for (let b = a + 1; b < n - 3; b++)
        for (let c = b + 1; c < n - 2; c++)
          for (let d = c + 1; d < n - 1; d++)
            for (let e = d + 1; e < n; e++) {
              const sc = quickScore5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (sc > best) best = sc;
            }
    return best;
  }

  function estimateHumanEquity(humanHand, community, oppCount, samples = 180) {
    if (!humanHand || humanHand.length < 2 || oppCount <= 0) return 100;
    const known = new Set([...humanHand, ...community].map(c => c.id));
    const pool = createShuffledDeck(known);
    const needBoard = 5 - community.length;
    let equitySum = 0;

    for (let s = 0; s < samples; s++) {
      // Partial Fisher-Yates for only the cards we need
      const drawCount = needBoard + oppCount * 2;
      for (let i = 0; i < drawCount; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const board = [...community];
      for (let i = 0; i < needBoard; i++) board.push(pool[i]);

      const myScore = quickBest7([...humanHand, ...board]);
      let beaten = false;
      let ties = 0;
      for (let o = 0; o < oppCount; o++) {
        const idx = needBoard + o * 2;
        const oppScore = quickBest7([pool[idx], pool[idx + 1], ...board]);
        if (oppScore > myScore) { beaten = true; break; }
        if (oppScore === myScore) ties++;
      }
      if (!beaten) equitySum += 1 / (ties + 1);
    }
    return Math.round((equitySum / samples) * 100);
  }

  function estimateAllInEquities(activePlayers, community, samples = 180) {
    const known = new Set(community.map(c => c.id));
    for (const p of activePlayers) p.hand.forEach(c => known.add(c.id));
    const pool = createShuffledDeck(known);
    const needBoard = 5 - community.length;
    const wins = new Map(activePlayers.map(p => [p.id, 0]));

    if (needBoard === 0) {
      let best = -1;
      const scores = activePlayers.map(p => {
        const sc = quickBest7([...p.hand, ...community]);
        if (sc > best) best = sc;
        return { id: p.id, sc };
      });
      const winners = scores.filter(x => x.sc === best);
      for (const w of winners) wins.set(w.id, Math.round(100 / winners.length));
      return wins;
    }

    for (let s = 0; s < samples; s++) {
      for (let i = 0; i < needBoard; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const board = [...community, ...pool.slice(0, needBoard)];
      let best = -1;
      let winners = [];
      for (const p of activePlayers) {
        const sc = quickBest7([...p.hand, ...board]);
        if (sc > best) { best = sc; winners = [p.id]; }
        else if (sc === best) winners.push(p.id);
      }
      const share = 1 / winners.length;
      for (const id of winners) wins.set(id, wins.get(id) + share);
    }
    for (const [id, v] of wins.entries()) {
      wins.set(id, Math.round((v / samples) * 100));
    }
    return wins;
  }

  // =========================================================
  // 5. AI Profiles & Game State
  // =========================================================
  const AI_ROSTER = [
    { name: '민수', avatar: '🦊', style: 'aggressive', styleLabel: '공격형 AI' },
    { name: '지은', avatar: '🦉', style: 'tight', styleLabel: '신중형 AI' },
    { name: '현우', avatar: '🦁', style: 'balanced', styleLabel: '밸런스 AI' },
    { name: '서연', avatar: '🐱', style: 'tricky', styleLabel: '트릭스터 AI' },
    { name: '태호', avatar: '🦈', style: 'shark', styleLabel: '샤크 AI' }
  ];

  const AI_QUOTES = {
    raise: ['가보자고!', '압박 좀 넣어볼까?', '自信 있음 😎', '레이즈!'],
    allin: ['올인이다!! 🔥', '승부 보자!', '전부 건다!'],
    fold: ['패스...', '이번엔 양보', '노림수가 안 맞네'],
    win: ['나이스 팟! 💰', '예상대로야', '감사합니다~']
  };

  const state = {
    inGame: false,
    mode: 'tournament',
    difficulty: 'normal',
    startChips: 1000,
    players: [],
    deck: [],
    community: [],
    pot: 0,
    stage: 'PREFLOP',
    dealerIndex: 0,
    sbIndex: 1,
    bbIndex: 2,
    currentPlayerIndex: -1,
    currentBet: 0,
    minRaise: 20,
    handNumber: 0,
    sb: 10,
    bb: 20,
    handOver: false,
    gameOver: false,
    allInRunout: false,
    allInEquities: new Map(),
    winningCardIds: new Set(),
    winnerIds: new Set(),
    humanEquity: null,
    logs: [],
    aiTimer: null,
    turnInterval: null,
    turnRemaining: 25
  };

  function addLog(msg, tone = 'normal') {
    state.logs.unshift({ msg, tone, hand: state.handNumber });
    if (state.logs.length > 60) state.logs.pop();
  }

  function setBanner(msg) {
    const el = document.getElementById('banner-bar');
    if (el) el.textContent = msg;
  }

  function showAiBubble(player, key) {
    if (player.isHuman || Math.random() > 0.48) return;
    const pool = AI_QUOTES[key];
    if (!pool) return;
    player.bubble = pool[Math.floor(Math.random() * pool.length)];
    setTimeout(() => {
      player.bubble = '';
      renderSeats();
    }, 1800);
  }

  // =========================================================
  // 6. Save / Resume Game
  // =========================================================
  function saveTableSnapshot() {
    if (!state.inGame || state.gameOver) {
      localStorage.removeItem(STORAGE_KEYS.SAVE);
      return;
    }
    const snap = {
      mode: state.mode,
      difficulty: state.difficulty,
      startChips: state.startChips,
      handNumber: state.handNumber,
      dealerIndex: state.dealerIndex,
      sb: state.sb,
      bb: state.bb,
      players: state.players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, style: p.style,
        styleLabel: p.styleLabel, isHuman: p.isHuman, chips: p.chips,
        eliminated: p.eliminated
      }))
    };
    saveJSON(STORAGE_KEYS.SAVE, snap);
  }

  function hasSavedGame() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SAVE);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      return snap && Array.isArray(snap.players) && snap.players.length >= 2;
    } catch { return false; }
  }

  // =========================================================
  // 7. Game Lifecycle
  // =========================================================
  function startFreshGame() {
    clearTimers();
    state.inGame = true;
    state.mode = prefs.mode;
    state.difficulty = prefs.difficulty;
    state.startChips = prefs.startChips;
    state.handNumber = 0;
    state.gameOver = false;
    state.logs = [];

    const seatCount = prefs.seats;
    const players = [
      {
        id: 0,
        name: (prefs.nickname || '플레이어').trim(),
        avatar: prefs.avatar || '😎',
        style: 'human',
        styleLabel: '나',
        isHuman: true,
        chips: state.startChips,
        hand: [], roundBet: 0, totalBet: 0,
        folded: false, allIn: false, acted: false, eliminated: false,
        lastAction: '', bubble: ''
      }
    ];

    for (let i = 0; i < seatCount - 1; i++) {
      const ai = AI_ROSTER[i];
      players.push({
        id: i + 1,
        name: ai.name,
        avatar: ai.avatar,
        style: ai.style,
        styleLabel: ai.styleLabel,
        isHuman: false,
        chips: state.startChips,
        hand: [], roundBet: 0, totalBet: 0,
        folded: false, allIn: false, acted: false, eliminated: false,
        lastAction: '', bubble: ''
      });
    }

    state.players = players;
    state.dealerIndex = Math.floor(Math.random() * players.length);

    showGameScreen();
    addLog(`새 게임 시작 (${state.mode === 'tournament' ? '토너먼트' : '캐시 게임'} · ${seatCount}인 · ${state.difficulty.toUpperCase()})`, 'accent');
    startNextHand();
  }

  function resumeSavedGame() {
    clearTimers();
    const snap = loadJSON(STORAGE_KEYS.SAVE, null);
    if (!snap || !snap.players) return startFreshGame();
    state.inGame = true;
    state.mode = snap.mode;
    state.difficulty = snap.difficulty;
    state.startChips = snap.startChips;
    state.handNumber = snap.handNumber;
    state.dealerIndex = snap.dealerIndex;
    state.sb = snap.sb;
    state.bb = snap.bb;
    state.gameOver = false;
    state.logs = [];
    state.players = snap.players.map(p => ({
      ...p, hand: [], roundBet: 0, totalBet: 0,
      folded: p.eliminated, allIn: false, acted: false, lastAction: '', bubble: ''
    }));
    showGameScreen();
    addLog('저장된 게임을 이어서 진행합니다.', 'accent');
    startNextHand();
  }

  function clearTimers() {
    clearTimeout(state.aiTimer);
    clearInterval(state.turnInterval);
    state.turnInterval = null;
  }

  function getAlivePlayers() {
    return state.players.filter(p => !p.eliminated);
  }

  function getNextAliveIndex(fromIdx) {
    const n = state.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (!state.players[idx].eliminated) return idx;
    }
    return -1;
  }

  function getNextActionableIndex(fromIdx) {
    const n = state.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      const p = state.players[idx];
      if (!p.eliminated && !p.folded && !p.allIn) return idx;
    }
    return -1;
  }

  function startNextHand() {
    clearTimers();

    // Cash mode auto-rebuy for busted AI
    if (state.mode === 'cash') {
      for (const p of state.players) {
        if (!p.isHuman && p.chips <= 0) {
          p.chips = state.startChips;
          p.eliminated = false;
          addLog(`${p.name} 리바이 (+${state.startChips} 칩)`, 'accent');
        }
      }
    }

    for (const p of state.players) {
      if (p.chips <= 0) p.eliminated = true;
      else p.eliminated = false;
    }

    const human = state.players[0];
    const alive = getAlivePlayers();

    if (human.eliminated) {
      state.handOver = true;
      if (state.mode === 'cash') {
        setBanner('칩이 부족합니다. 리바이하여 계속 플레이하세요!');
        renderAll('칩을 모두 소진했습니다. 리바이 버튼을 눌러 칩을 충전하세요.');
      } else {
        state.gameOver = true;
        localStorage.removeItem(STORAGE_KEYS.SAVE);
        setBanner('토너먼트에서 탈락했습니다. 로비에서 다시 도전해보세요!');
        renderAll('토너먼트 탈락! 새 게임을 시작해보세요.');
      }
      return;
    }

    if (alive.length === 1 && !human.eliminated) {
      state.gameOver = true;
      state.handOver = true;
      localStorage.removeItem(STORAGE_KEYS.SAVE);
      stats.tournamentsWon++;
      saveJSON(STORAGE_KEYS.STATS, stats);
      unlockAchievement('tourney_champ');
      Sound.win();
      setBanner('🏆 축하합니다! 토너먼트 최종 우승!');
      renderAll('🏆 모든 상대를 꺾고 테이블 챔피언이 되었습니다!');
      return;
    }

    state.handNumber++;
    const baseSB = Math.max(10, Math.round(state.startChips / 100));
    const baseBB = baseSB * 2;
    if (state.mode === 'tournament') {
      const lvl = Math.min(5, Math.floor((state.handNumber - 1) / 6));
      state.sb = baseSB * Math.pow(2, lvl);
      state.bb = baseBB * Math.pow(2, lvl);
    } else {
      state.sb = baseSB;
      state.bb = baseBB;
    }

    state.deck = createShuffledDeck();
    state.community = [];
    state.pot = 0;
    state.stage = 'PREFLOP';
    state.handOver = false;
    state.allInRunout = false;
    state.allInEquities = new Map();
    state.winningCardIds = new Set();
    state.winnerIds = new Set();

    for (const p of state.players) {
      p.hand = [];
      p.roundBet = 0;
      p.totalBet = 0;
      p.folded = p.eliminated;
      p.allIn = false;
      p.acted = false;
      p.lastAction = '';
      p.bubble = '';
    }

    state.dealerIndex = getNextAliveIndex(state.dealerIndex);
    if (alive.length === 2) {
      state.sbIndex = state.dealerIndex;
      state.bbIndex = getNextAliveIndex(state.dealerIndex);
    } else {
      state.sbIndex = getNextAliveIndex(state.dealerIndex);
      state.bbIndex = getNextAliveIndex(state.sbIndex);
    }

    for (let c = 0; c < 2; c++) {
      for (const p of state.players) {
        if (!p.eliminated) p.hand.push(state.deck.pop());
      }
    }
    Sound.deal();

    postBlind(state.sbIndex, state.sb, 'SB');
    postBlind(state.bbIndex, state.bb, 'BB');

    state.currentBet = Math.max(
      state.players[state.sbIndex].roundBet,
      state.players[state.bbIndex].roundBet
    );
    state.minRaise = state.bb;

    addLog(`--- 핸드 #${state.handNumber} (블라인드 ${state.sb}/${state.bb}) ---`, 'accent');

    state.currentPlayerIndex = getNextActionableIndex(state.bbIndex);
    updateHumanEquity();
    setBanner(`핸드 #${state.handNumber} 프리플랍`);
    renderAll();
    proceedTurn();
  }

  function postBlind(idx, amount, label) {
    const p = state.players[idx];
    const paid = Math.min(p.chips, amount);
    p.chips -= paid;
    p.roundBet += paid;
    p.totalBet += paid;
    state.pot += paid;
    if (p.chips === 0) p.allIn = true;
    p.lastAction = `${label} ${paid}`;
  }

  function getRemainingInHand() {
    return state.players.filter(p => !p.eliminated && !p.folded);
  }

  function getActionablePlayers() {
    return state.players.filter(p => !p.eliminated && !p.folded && !p.allIn);
  }

  function isRoundComplete() {
    const rem = getRemainingInHand();
    if (rem.length <= 1) return true;
    const act = getActionablePlayers();
    if (act.length === 0) return true;
    if (act.length === 1 && act[0].roundBet >= state.currentBet) return true;
    return act.every(p => p.acted && p.roundBet === state.currentBet);
  }

  function updateHumanEquity() {
    const human = state.players[0];
    if (!prefs.showEquity || !human || human.folded || human.eliminated || human.hand.length < 2) {
      state.humanEquity = null;
      return;
    }
    const opps = getRemainingInHand().filter(p => !p.isHuman).length;
    if (opps <= 0) {
      state.humanEquity = 100;
      return;
    }
    state.humanEquity = estimateHumanEquity(human.hand, state.community, opps, 160);
  }

  function startTurnTimer() {
    clearInterval(state.turnInterval);
    if (!prefs.turnTimer) return;
    state.turnRemaining = 25;
    state.turnInterval = setInterval(() => {
      if (state.handOver || state.currentPlayerIndex !== 0) {
        clearInterval(state.turnInterval);
        return;
      }
      state.turnRemaining -= 0.25;
      const fill = document.getElementById('human-timer-fill');
      if (fill) fill.style.width = `${Math.max(0, (state.turnRemaining / 25) * 100)}%`;
      if (state.turnRemaining <= 0) {
        clearInterval(state.turnInterval);
        const human = state.players[0];
        const toCall = Math.max(0, state.currentBet - human.roundBet);
        showToast('⏱️ 시간 초과 — 자동 액션 처리');
        applyAction(human, toCall === 0 ? 'check' : 'fold');
      }
    }, 250);
  }

  function proceedTurn() {
    if (state.handOver) return;

    const rem = getRemainingInHand();
    if (rem.length === 1) {
      resolveSingleWinner(rem[0]);
      return;
    }

    if (isRoundComplete()) {
      advanceStage();
      return;
    }

    const cur = state.players[state.currentPlayerIndex];
    if (!cur || cur.eliminated || cur.folded || cur.allIn) {
      state.currentPlayerIndex = getNextActionableIndex(state.currentPlayerIndex);
      proceedTurn();
      return;
    }

    renderAll();
    if (cur.isHuman) {
      setBanner('당신의 차례입니다!');
      startTurnTimer();
    } else {
      clearInterval(state.turnInterval);
      setBanner(`${cur.name} 생각 중...`);
      const delay = Math.round((520 + Math.random() * 480) / prefs.speed);
      state.aiTimer = setTimeout(() => runAiDecision(cur), delay);
    }
  }

  function applyAction(player, type, raiseTo = 0) {
    clearInterval(state.turnInterval);
    const toCall = Math.max(0, state.currentBet - player.roundBet);

    if (type === 'fold') {
      player.folded = true;
      player.acted = true;
      player.lastAction = '폴드';
      Sound.fold();
      showAiBubble(player, 'fold');
      addLog(`${player.name}: 폴드`);
    } else if (type === 'check') {
      player.acted = true;
      player.lastAction = '체크';
      Sound.check();
      addLog(`${player.name}: 체크`);
    } else if (type === 'call') {
      const paid = Math.min(player.chips, toCall);
      player.chips -= paid;
      player.roundBet += paid;
      player.totalBet += paid;
      state.pot += paid;
      player.acted = true;
      if (player.chips === 0) {
        player.allIn = true;
        player.lastAction = `올인 (${player.roundBet})`;
        Sound.allIn();
        showAiBubble(player, 'allin');
        addLog(`${player.name}: 올인 콜 (${paid})`, 'warn');
      } else {
        player.lastAction = `콜 ${paid}`;
        Sound.chip();
        addLog(`${player.name}: 콜 (${paid})`);
      }
    } else if (type === 'raise') {
      const maxBet = player.roundBet + player.chips;
      const target = Math.min(maxBet, Math.max(raiseTo, state.currentBet + state.minRaise));
      const paid = target - player.roundBet;
      const delta = target - state.currentBet;

      player.chips -= paid;
      player.roundBet += paid;
      player.totalBet += paid;
      state.pot += paid;
      player.acted = true;

      const prevBet = state.currentBet;
      if (target > state.currentBet) {
        if (delta >= state.minRaise) state.minRaise = delta;
        state.currentBet = target;
        for (const other of state.players) {
          if (other.id !== player.id && !other.folded && !other.allIn && !other.eliminated) {
            other.acted = false;
          }
        }
      }

      if (player.chips === 0) {
        player.allIn = true;
        player.lastAction = `올인 (${target})`;
        Sound.allIn();
        showAiBubble(player, 'allin');
        addLog(`${player.name}: 올인! (총 ${target})`, 'warn');
      } else {
        const verb = prevBet === 0 ? '베팅' : '레이즈';
        player.lastAction = `${verb} ${target}`;
        Sound.chip();
        showAiBubble(player, 'raise');
        addLog(`${player.name}: ${verb} → ${target}`);
      }
    }

    state.currentPlayerIndex = getNextActionableIndex(player.id);
    if (type === 'fold') updateHumanEquity();
    renderAll();
    proceedTurn();
  }

  function advanceStage() {
    clearInterval(state.turnInterval);
    for (const p of state.players) {
      p.roundBet = 0;
      p.acted = false;
      if (!p.folded && !p.allIn && !p.eliminated) p.lastAction = '';
    }
    state.currentBet = 0;
    state.minRaise = state.bb;

    if (state.stage === 'PREFLOP') {
      state.stage = 'FLOP';
      state.deck.pop();
      state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
      Sound.deal();
      addLog(`플랍: ${state.community.map(c => RANK_LABELS[c.rank] + c.suit).join(' ')}`, 'accent');
    } else if (state.stage === 'FLOP') {
      state.stage = 'TURN';
      state.deck.pop();
      const c = state.deck.pop();
      state.community.push(c);
      Sound.deal();
      addLog(`턴: ${RANK_LABELS[c.rank]}${c.suit}`, 'accent');
    } else if (state.stage === 'TURN') {
      state.stage = 'RIVER';
      state.deck.pop();
      const c = state.deck.pop();
      state.community.push(c);
      Sound.deal();
      addLog(`리버: ${RANK_LABELS[c.rank]}${c.suit}`, 'accent');
    } else if (state.stage === 'RIVER') {
      resolveShowdown();
      return;
    }

    updateHumanEquity();

    const actionable = getActionablePlayers();
    if (actionable.length <= 1) {
      // Dramatic All-In Runout with live equities!
      state.allInRunout = true;
      state.currentPlayerIndex = -1;
      const rem = getRemainingInHand();
      state.allInEquities = estimateAllInEquities(rem, state.community, 180);
      setBanner('🔥 올인 쇼다운 런아웃 진행 중...');
      renderAll();
      state.aiTimer = setTimeout(() => advanceStage(), Math.round(1050 / prefs.speed));
      return;
    }

    state.currentPlayerIndex = getNextActionableIndex(state.dealerIndex);
    renderAll();
    proceedTurn();
  }

  function recordHandStats(humanWon, potWon, bestEval, humanWasAllIn) {
    stats.handsPlayed++;
    if (humanWon) {
      stats.handsWon++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
      if (potWon > stats.biggestPot) stats.biggestPot = potWon;
      if (humanWasAllIn) stats.allInWins++;
      if (bestEval && bestEval.category > stats.bestHandCategory) {
        stats.bestHandCategory = bestEval.category;
        stats.bestHandName = bestEval.name;
      }
      unlockAchievement('first_win');
      if (stats.currentStreak >= 3) unlockAchievement('streak_3');
      if (humanWasAllIn) unlockAchievement('allin_hero');
      if (potWon >= 500) unlockAchievement('big_pot');
      if (bestEval && bestEval.category >= 5) unlockAchievement('flush_up');
      if (bestEval && bestEval.category >= 6) unlockAchievement('fullhouse_up');
    } else {
      stats.currentStreak = 0;
    }
    if (stats.handsPlayed >= 30) unlockAchievement('veteran_30');
    saveJSON(STORAGE_KEYS.STATS, stats);
  }

  function resolveSingleWinner(winner) {
    clearTimers();
    state.handOver = true;
    state.currentPlayerIndex = -1;
    const won = state.pot;
    winner.chips += won;
    state.pot = 0;
    state.winnerIds = new Set([winner.id]);

    const human = state.players[0];
    recordHandStats(winner.isHuman, winner.isHuman ? won : 0, null, human.allIn);
    if (winner.isHuman) Sound.win();
    else showAiBubble(winner, 'win');

    const msg = `${winner.name} 승리! (상대 전원 폴드, +${won.toLocaleString()} 칩)`;
    setBanner(`🏆 ${msg}`);
    addLog(msg, 'win');
    saveTableSnapshot();
    renderAll(msg);
  }

  function computeSidePots() {
    const contributors = state.players.filter(p => p.totalBet > 0);
    const levels = [...new Set(contributors.map(p => p.totalBet))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const p of contributors) {
        amount += Math.max(0, Math.min(p.totalBet, lvl) - prev);
      }
      prev = lvl;
      if (amount > 0) {
        const eligibleIds = state.players
          .filter(p => !p.eliminated && !p.folded && p.totalBet >= lvl)
          .map(p => p.id);
        pots.push({ amount, eligibleIds });
      }
    }
    return pots;
  }

  function resolveShowdown() {
    clearTimers();
    state.stage = 'SHOWDOWN';
    state.handOver = true;
    state.currentPlayerIndex = -1;

    const rem = getRemainingInHand();
    const evals = new Map();
    for (const p of rem) {
      evals.set(p.id, evaluateBestHand([...p.hand, ...state.community]));
    }

    const pots = computeSidePots();
    const payouts = new Map();
    const winCardIds = new Set();
    const winnerSet = new Set();

    for (const pot of pots) {
      const eligible = rem.filter(p => pot.eligibleIds.includes(p.id));
      if (eligible.length === 0) continue;

      let bestPlayers = [eligible[0]];
      let bestEval = evals.get(eligible[0].id);

      for (let i = 1; i < eligible.length; i++) {
        const cand = eligible[i];
        const cEval = evals.get(cand.id);
        const cmp = compareScores(cEval.score, bestEval.score);
        if (cmp > 0) { bestPlayers = [cand]; bestEval = cEval; }
        else if (cmp === 0) bestPlayers.push(cand);
      }

      const share = Math.floor(pot.amount / bestPlayers.length);
      let remChips = pot.amount - share * bestPlayers.length;
      const n = state.players.length;
      bestPlayers.sort((a, b) => ((a.id - state.dealerIndex + n) % n) - ((b.id - state.dealerIndex + n) % n));

      for (const w of bestPlayers) {
        const extra = remChips > 0 ? 1 : 0;
        if (remChips > 0) remChips--;
        payouts.set(w.id, (payouts.get(w.id) || 0) + share + extra);
        winnerSet.add(w.id);
        evals.get(w.id).bestCards.forEach(c => winCardIds.add(c.id));
      }
    }

    const parts = [];
    for (const [id, amt] of payouts.entries()) {
      const p = state.players[id];
      p.chips += amt;
      if (!p.isHuman) showAiBubble(p, 'win');
      parts.push(`${p.name} (+${amt.toLocaleString()}, ${evals.get(id).name})`);
    }

    const human = state.players[0];
    const humanWonAmt = payouts.get(0) || 0;
    recordHandStats(humanWonAmt > 0, humanWonAmt, evals.get(0) || null, human.allIn);

    state.pot = 0;
    state.winningCardIds = winCardIds;
    state.winnerIds = winnerSet;

    if (humanWonAmt > 0) Sound.win();
    const msg = parts.join(' · ');
    setBanner(`🏆 ${msg}`);
    addLog(`쇼다운: ${msg}`, 'win');
    saveTableSnapshot();
    renderAll(msg);
  }

  // =========================================================
  // 8. 3-Tier AI Decision Engine
  // =========================================================
  function preflopStrength(hand) {
    const [a, b] = [...hand].sort((x, y) => y.rank - x.rank);
    if (a.rank === b.rank) return 0.56 + (a.rank / 14) * 0.42;
    let s = ((a.rank + b.rank) / 28) * 0.56;
    if (a.suit === b.suit) s += 0.08;
    const gap = a.rank - b.rank;
    if (gap === 1) s += 0.06;
    else if (gap === 2) s += 0.03;
    if (a.rank === 14) s += 0.10;
    if (a.rank === 13 && b.rank >= 10) s += 0.06;
    return Math.min(0.98, Math.max(0.12, s));
  }

  function postflopStrength(ai) {
    const res = evaluateBestHand([...ai.hand, ...state.community]);
    const base = [0.20, 0.48, 0.69, 0.79, 0.85, 0.89, 0.94, 0.97, 0.99, 1.0][res.category];
    let str = base;
    if (res.category <= 1) str += (res.score[1] / 14) * 0.14;

    // Draw equity detection (flush draw / open-ended straight draw)
    if (state.community.length < 5) {
      const all = [...ai.hand, ...state.community];
      const sc = {};
      all.forEach(c => sc[c.suit] = (sc[c.suit] || 0) + 1);
      if (Object.values(sc).some(v => v === 4)) str = Math.max(str, 0.58);
    }
    return Math.min(0.99, str);
  }

  function runAiDecision(ai) {
    if (state.handOver || state.currentPlayerIndex !== ai.id) return;

    const toCall = Math.max(0, state.currentBet - ai.roundBet);
    const raw = state.stage === 'PREFLOP' ? preflopStrength(ai.hand) : postflopStrength(ai);

    // Style & difficulty tuning
    let aggr = 0, tight = 0, bluff = 0.07;
    if (ai.style === 'aggressive') { aggr = 0.12; tight = -0.06; bluff = 0.16; }
    else if (ai.style === 'tight') { aggr = -0.05; tight = 0.10; bluff = 0.03; }
    else if (ai.style === 'tricky') { aggr = 0.06; tight = 0.0; bluff = 0.20; }
    else if (ai.style === 'shark') { aggr = 0.08; tight = 0.05; bluff = 0.12; }

    let noiseAmp = 0.12;
    if (state.difficulty === 'easy') { noiseAmp = 0.26; bluff = 0.04; tight -= 0.10; }
    else if (state.difficulty === 'pro') { noiseAmp = 0.07; bluff += 0.04; }

    const eff = raw + aggr - tight + (Math.random() - 0.5) * noiseAmp;
    const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;
    const isBluff = Math.random() < bluff;
    const canRaise = ai.chips > toCall;

    // Pro AI occasional slowplay with monster hand on flop
    if (state.difficulty === 'pro' && state.stage === 'FLOP' && raw > 0.88 && toCall === 0 && Math.random() < 0.35) {
      applyAction(ai, 'check');
      return;
    }

    if (toCall === 0) {
      if (canRaise && (eff > 0.65 || (isBluff && state.stage !== 'PREFLOP'))) {
        const mult = 0.4 + Math.random() * 0.45;
        const size = Math.max(state.bb, Math.round((state.pot * mult) / 10) * 10);
        const target = Math.min(ai.roundBet + ai.chips, state.currentBet + Math.max(state.minRaise, size));
        applyAction(ai, 'raise', target);
      } else {
        applyAction(ai, 'check');
      }
      return;
    }

    if (eff < potOdds + 0.11 && !isBluff) {
      if (state.stage === 'PREFLOP' && toCall <= state.bb && eff > 0.32) {
        applyAction(ai, 'call');
      } else {
        applyAction(ai, 'fold');
      }
      return;
    }

    if (canRaise && (eff > 0.77 || (isBluff && toCall < state.pot * 0.45))) {
      const extra = Math.max(state.minRaise, Math.round((state.pot * (0.5 + Math.random() * 0.35)) / 10) * 10);
      const target = Math.min(ai.roundBet + ai.chips, state.currentBet + extra);
      applyAction(ai, 'raise', target);
    } else {
      applyAction(ai, 'call');
    }
  }

  // =========================================================
  // 9. Rendering
  // =========================================================
  function cardHTML(card, { hidden = false, small = false, win = false, anim = false } = {}) {
    const cls = ['card'];
    if (small) cls.push('sm');
    if (anim) cls.push('deal-in');
    if (hidden) {
      cls.push('back');
      return `<div class="${cls.join(' ')}"></div>`;
    }
    if (card.suit === '♥' || card.suit === '♦') cls.push('red');
    if (win) cls.push('win');
    const lbl = RANK_LABELS[card.rank];
    return `<div class="${cls.join(' ')}">
      <div class="card-corner"><span>${lbl}</span><span>${card.suit}</span></div>
      <div class="card-center">${card.suit}</div>
    </div>`;
  }

  function seatHTML(p) {
    const isTurn = state.currentPlayerIndex === p.id && !state.handOver;
    const isWinner = state.winnerIds.has(p.id);
    const showCards = p.isHuman || ((state.stage === 'SHOWDOWN' || state.allInRunout) && !p.folded && !p.eliminated);

    const cls = ['seat-box'];
    if (p.isHuman) cls.push('human-seat');
    if (isTurn) cls.push('is-turn');
    if (isWinner) cls.push('is-winner');
    if (p.folded) cls.push('is-folded');
    if (p.eliminated) cls.push('is-eliminated');

    const badges = [];
    if (state.dealerIndex === p.id && !p.eliminated) badges.push('<span class="badge-pos badge-d">D</span>');
    if (state.sbIndex === p.id && !p.eliminated) badges.push('<span class="badge-pos badge-sb">SB</span>');
    if (state.bbIndex === p.id && !p.eliminated) badges.push('<span class="badge-pos badge-bb">BB</span>');

    const actionCls = p.folded ? 'fold' : (p.allIn ? 'allin' : '');
    const equityTag = state.allInRunout && state.allInEquities.has(p.id)
      ? `<span class="seat-equity">${state.allInEquities.get(p.id)}%</span>` : '';

    const cards = p.eliminated
      ? '<div style="font-size:11px; color:var(--text-muted); padding:10px 0;">탈락</div>'
      : `<div class="seat-cards">${p.hand.map(c => cardHTML(c, {
          hidden: !showCards,
          small: !p.isHuman,
          win: state.winningCardIds.has(c.id) && showCards
        })).join('')}</div>`;

    const timerBar = (p.isHuman && isTurn && prefs.turnTimer)
      ? `<div class="timer-track"><div id="human-timer-fill" class="timer-fill" style="width:${Math.max(0, (state.turnRemaining / 25) * 100)}%"></div></div>`
      : '';

    const bubble = p.bubble ? `<div class="ai-bubble">${p.bubble}</div>` : '';

    return `<div class="${cls.join(' ')}">
      ${bubble}
      <div class="seat-head">
        <div class="seat-id">
          <span class="seat-avatar">${p.avatar}</span>
          <div style="min-width:0;">
            <div class="seat-name">${p.name}</div>
            <div class="seat-style">${p.styleLabel}</div>
          </div>
        </div>
        <div class="seat-badges">${badges.join('')}${equityTag}</div>
      </div>
      ${cards}
      <div class="seat-foot">
        <span class="seat-chips">🪙 ${p.chips.toLocaleString()}</span>
        ${p.lastAction ? `<span class="seat-action-tag ${actionCls}">${p.lastAction}</span>` : ''}
      </div>
      ${timerBar}
    </div>`;
  }

  function renderSeats() {
    const oppGrid = document.getElementById('opponents-grid');
    const humanWrap = document.getElementById('human-seat-wrap');
    if (!oppGrid || !humanWrap) return;

    const opps = state.players.slice(1);
    oppGrid.innerHTML = opps.map(seatHTML).join('');
    humanWrap.innerHTML = seatHTML(state.players[0]);
  }

  function renderCommunity() {
    const row = document.getElementById('community-row');
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (i < state.community.length) {
        const c = state.community[i];
        html += cardHTML(c, { win: state.winningCardIds.has(c.id), anim: true });
      } else {
        html += '<div class="card-slot"></div>';
      }
    }
    row.innerHTML = html;
  }

  function renderControls(summary = '') {
    const turnBox = document.getElementById('turn-controls');
    const overBox = document.getElementById('handover-controls');
    const human = state.players[0];

    // Live hand & equity pills
    const handPill = document.getElementById('live-hand-pill');
    const eqPill = document.getElementById('live-equity-pill');
    if (human && !human.eliminated && human.hand.length === 2) {
      const ev = evaluateBestHand([...human.hand, ...state.community]);
      handPill.textContent = `족보: ${ev ? ev.name : '-'}`;
    } else {
      handPill.textContent = '족보: -';
    }
    if (prefs.showEquity && state.humanEquity !== null) {
      eqPill.classList.remove('hidden');
      eqPill.textContent = `승률: ${state.humanEquity}%`;
    } else {
      eqPill.classList.add('hidden');
    }

    if (state.handOver) {
      turnBox.classList.add('hidden');
      overBox.classList.remove('hidden');
      document.getElementById('handover-summary').textContent = summary || '핸드가 종료되었습니다.';
      const btnNext = document.getElementById('btn-next-hand');
      const btnRebuy = document.getElementById('btn-rebuy');
      if (state.mode === 'cash' && human.chips <= 0) {
        btnRebuy.classList.remove('hidden');
        btnNext.classList.add('hidden');
      } else {
        btnRebuy.classList.add('hidden');
        btnNext.classList.remove('hidden');
        btnNext.textContent = state.gameOver ? '로비로 돌아가기' : '다음 핸드 →';
      }
      return;
    }

    overBox.classList.add('hidden');
    turnBox.classList.remove('hidden');

    const myTurn = state.currentPlayerIndex === 0 && !human.folded && !human.allIn;
    const toCall = Math.max(0, state.currentBet - human.roundBet);
    const maxBet = human.roundBet + human.chips;
    const minRaiseTo = Math.min(maxBet, Math.max(state.bb, state.currentBet + state.minRaise));
    const canRaise = myTurn && human.chips > toCall;

    const btnFold = document.getElementById('btn-fold');
    const btnCall = document.getElementById('btn-call');
    const btnRaise = document.getElementById('btn-raise');
    const slider = document.getElementById('raise-slider');
    const readout = document.getElementById('raise-readout');
    const hint = document.getElementById('call-hint-text');

    btnFold.disabled = !myTurn;
    btnCall.disabled = !myTurn;
    btnRaise.disabled = !canRaise;
    slider.disabled = !canRaise;
    document.querySelectorAll('.preset-btn').forEach(b => b.disabled = !canRaise);

    if (toCall === 0) {
      btnCall.textContent = '체크';
      hint.textContent = '체크 가능';
    } else if (toCall >= human.chips) {
      btnCall.textContent = `올인 (${human.chips.toLocaleString()})`;
      hint.textContent = `콜 ${toCall.toLocaleString()} (올인)`;
    } else {
      btnCall.textContent = `콜 (${toCall.toLocaleString()})`;
      hint.textContent = `콜 필요: ${toCall.toLocaleString()}`;
    }

    slider.min = minRaiseTo;
    slider.max = maxBet;
    slider.step = Math.max(1, Math.min(10, state.sb));
    const curVal = parseInt(slider.value, 10);
    if (isNaN(curVal) || curVal < minRaiseTo || curVal > maxBet) slider.value = minRaiseTo;
    const chosen = parseInt(slider.value, 10) || minRaiseTo;
    readout.textContent = chosen.toLocaleString();
    const verb = state.currentBet === 0 ? '베팅' : '레이즈';
    btnRaise.textContent = chosen >= maxBet ? `올인 (${maxBet.toLocaleString()})` : `${verb} (${chosen.toLocaleString()})`;
  }

  function renderAll(summary = '') {
    document.getElementById('hdr-hand').textContent = `#${state.handNumber}`;
    document.getElementById('hdr-blinds').textContent = `${state.sb} / ${state.bb}`;
    document.getElementById('stage-pill').textContent = state.stage;
    document.getElementById('pot-pill').textContent = `POT ${state.pot.toLocaleString()}`;

    // Side pot display
    const spEl = document.getElementById('sidepot-pill');
    const pots = computeSidePots();
    if (pots.length > 1 && state.pot > 0) {
      spEl.classList.remove('hidden');
      spEl.textContent = `사이드팟 ${pots.length - 1}개 활성`;
    } else {
      spEl.classList.add('hidden');
    }

    renderSeats();
    renderCommunity();
    renderControls(summary);
  }

  // =========================================================
  // 10. Screens & Modals
  // =========================================================
  function showLobbyScreen() {
    clearTimers();
    state.inGame = false;
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('header-game-pills').classList.add('hidden');
    document.getElementById('btn-open-history').classList.add('hidden');
    document.getElementById('btn-back-lobby').classList.add('hidden');

    // Update lobby stats preview
    document.getElementById('lobby-stat-hands').textContent = stats.handsPlayed.toLocaleString();
    const wr = stats.handsPlayed > 0 ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : 0;
    document.getElementById('lobby-stat-winrate').textContent = `${wr}%`;
    document.getElementById('lobby-stat-trophies').textContent = stats.tournamentsWon.toLocaleString();

    const resumeBtn = document.getElementById('btn-resume-game');
    if (hasSavedGame()) resumeBtn.classList.remove('hidden');
    else resumeBtn.classList.add('hidden');
  }

  function showGameScreen() {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('header-game-pills').classList.remove('hidden');
    document.getElementById('btn-open-history').classList.remove('hidden');
    document.getElementById('btn-back-lobby').classList.remove('hidden');
  }

  function renderStatsModal() {
    const wr = stats.handsPlayed > 0 ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : 0;
    const box = document.getElementById('stats-content');
    box.innerHTML = `
      <div class="lobby-stats-strip" style="margin-bottom:10px;">
        <div><div class="stat-mini-val">${stats.handsPlayed}</div><div class="stat-mini-lbl">총 핸드</div></div>
        <div><div class="stat-mini-val">${wr}%</div><div class="stat-mini-lbl">핸드 승률</div></div>
        <div><div class="stat-mini-val">${stats.tournamentsWon}</div><div class="stat-mini-lbl">토너먼트 우승</div></div>
      </div>
      <div class="rank-item"><span>최고 획득 팟</span><b>🪙 ${stats.biggestPot.toLocaleString()}</b></div>
      <div class="rank-item"><span>최고 승리 족보</span><b>${stats.bestHandName}</b></div>
      <div class="rank-item"><span>최대 연승 / 올인 승리</span><b>${stats.maxStreak}연승 · ${stats.allInWins}회</b></div>
      <div style="font-size:12px; font-weight:800; margin-top:12px; color:#cbd5e1;">🏅 업적 (${Object.keys(stats.achievements).length} / ${ACHIEVEMENTS.length})</div>
      <div class="ach-grid">
        ${ACHIEVEMENTS.map(a => {
          const ok = !!stats.achievements[a.id];
          return `<div class="ach-card ${ok ? 'unlocked' : ''}">
            <div style="font-weight:800;">${a.icon} ${a.title}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${a.desc}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  function renderHistoryModal() {
    const el = document.getElementById('history-log-list');
    if (state.logs.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:16px;">아직 기록이 없습니다.</div>';
      return;
    }
    el.innerHTML = state.logs.map(l =>
      `<div class="log-entry ${l.tone}"><span style="color:var(--text-muted); margin-right:6px;">#${l.hand}</span>${l.msg}</div>`
    ).join('');
  }

  function openModal(id) {
    if (id === 'modal-stats') renderStatsModal();
    if (id === 'modal-history') renderHistoryModal();
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  // =========================================================
  // 11. Event Binding & Boot
  // =========================================================
  function syncLobbyUI() {
    document.getElementById('input-nickname').value = prefs.nickname;
    document.querySelectorAll('.avatar-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.avatar === prefs.avatar);
    });
    const setActive = (group, val) => {
      document.querySelectorAll(`[data-group="${group}"] .seg-btn`).forEach(b => {
        b.classList.toggle('active', String(b.dataset.val) === String(val));
      });
    };
    setActive('mode', prefs.mode);
    setActive('seats', prefs.seats);
    setActive('difficulty', prefs.difficulty);
    setActive('chips', prefs.startChips);

    document.getElementById('opt-sound').checked = prefs.sound;
    document.getElementById('opt-vibrate').checked = prefs.vibrate;
    document.getElementById('opt-equity').checked = prefs.showEquity;
    document.getElementById('opt-timer').checked = prefs.turnTimer;
    document.getElementById('opt-speed').value = String(prefs.speed);
  }

  // Lobby controls
  document.getElementById('input-nickname').addEventListener('input', (e) => {
    prefs.nickname = e.target.value || '플레이어';
    saveJSON(STORAGE_KEYS.PREFS, prefs);
  });

  document.querySelectorAll('.avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      prefs.avatar = btn.dataset.avatar;
      saveJSON(STORAGE_KEYS.PREFS, prefs);
      syncLobbyUI();
    });
  });

  document.querySelectorAll('.seg-grid').forEach(grid => {
    const group = grid.dataset.group;
    grid.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        if (group === 'mode') prefs.mode = v;
        else if (group === 'seats') prefs.seats = parseInt(v, 10);
        else if (group === 'difficulty') prefs.difficulty = v;
        else if (group === 'chips') prefs.startChips = parseInt(v, 10);
        saveJSON(STORAGE_KEYS.PREFS, prefs);
        syncLobbyUI();
      });
    });
  });

  document.getElementById('btn-start-game').addEventListener('click', startFreshGame);
  document.getElementById('btn-resume-game').addEventListener('click', resumeSavedGame);
  document.getElementById('btn-back-lobby').addEventListener('click', () => {
    saveTableSnapshot();
    showLobbyScreen();
  });

  // In-game action buttons
  document.getElementById('btn-fold').addEventListener('click', () => {
    if (state.currentPlayerIndex === 0) applyAction(state.players[0], 'fold');
  });

  document.getElementById('btn-call').addEventListener('click', () => {
    if (state.currentPlayerIndex !== 0) return;
    const h = state.players[0];
    const toCall = Math.max(0, state.currentBet - h.roundBet);
    applyAction(h, toCall === 0 ? 'check' : 'call');
  });

  document.getElementById('btn-raise').addEventListener('click', () => {
    if (state.currentPlayerIndex !== 0) return;
    const val = parseInt(document.getElementById('raise-slider').value, 10);
    applyAction(state.players[0], 'raise', val);
  });

  document.getElementById('raise-slider').addEventListener('input', (e) => {
    const h = state.players[0];
    const val = parseInt(e.target.value, 10);
    const maxBet = h.roundBet + h.chips;
    document.getElementById('raise-readout').textContent = val.toLocaleString();
    const verb = state.currentBet === 0 ? '베팅' : '레이즈';
    document.getElementById('btn-raise').textContent = val >= maxBet ? `올인 (${maxBet.toLocaleString()})` : `${verb} (${val.toLocaleString()})`;
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.currentPlayerIndex !== 0) return;
      const slider = document.getElementById('raise-slider');
      const minV = parseInt(slider.min, 10);
      const maxV = parseInt(slider.max, 10);
      const p = btn.dataset.preset;
      let t = minV;
      if (p === 'third') t = Math.round((state.currentBet + state.pot * 0.33) / 10) * 10;
      else if (p === 'half') t = Math.round((state.currentBet + state.pot * 0.5) / 10) * 10;
      else if (p === 'pot') t = Math.round((state.currentBet + state.pot) / 10) * 10;
      else if (p === 'allin') t = maxV;
      slider.value = Math.max(minV, Math.min(maxV, t));
      slider.dispatchEvent(new Event('input'));
    });
  });

  document.getElementById('btn-next-hand').addEventListener('click', () => {
    if (state.gameOver) showLobbyScreen();
    else startNextHand();
  });

  document.getElementById('btn-rebuy').addEventListener('click', () => {
    const h = state.players[0];
    h.chips = state.startChips;
    h.eliminated = false;
    Sound.chip();
    showToast(`💵 ${state.startChips.toLocaleString()} 칩이 충전되었습니다!`);
    startNextHand();
  });

  // Header & Modal controls
  document.getElementById('btn-open-rankings').addEventListener('click', () => openModal('modal-rankings'));
  document.getElementById('btn-open-stats').addEventListener('click', () => openModal('modal-stats'));
  document.getElementById('btn-open-history').addEventListener('click', () => openModal('modal-history'));
  document.getElementById('btn-open-settings').addEventListener('click', () => openModal('modal-settings'));
  document.getElementById('btn-show-pwa-guide').addEventListener('click', () => {
    closeModal('modal-settings');
    openModal('modal-pwa-guide');
  });

  document.getElementById('btn-install-pwa').addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      openModal('modal-pwa-guide');
    }
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // Settings toggles
  document.getElementById('opt-sound').addEventListener('change', (e) => { prefs.sound = e.target.checked; saveJSON(STORAGE_KEYS.PREFS, prefs); });
  document.getElementById('opt-vibrate').addEventListener('change', (e) => { prefs.vibrate = e.target.checked; saveJSON(STORAGE_KEYS.PREFS, prefs); });
  document.getElementById('opt-equity').addEventListener('change', (e) => {
    prefs.showEquity = e.target.checked;
    saveJSON(STORAGE_KEYS.PREFS, prefs);
    if (state.inGame) { updateHumanEquity(); renderControls(); }
  });
  document.getElementById('opt-timer').addEventListener('change', (e) => { prefs.turnTimer = e.target.checked; saveJSON(STORAGE_KEYS.PREFS, prefs); });
  document.getElementById('opt-speed').addEventListener('change', (e) => { prefs.speed = parseFloat(e.target.value) || 1; saveJSON(STORAGE_KEYS.PREFS, prefs); });

  document.getElementById('btn-reset-stats').addEventListener('click', () => {
    stats = structuredClone(DEFAULT_STATS);
    saveJSON(STORAGE_KEYS.STATS, stats);
    renderStatsModal();
    showToast('전적이 초기화되었습니다.');
  });

  // Init
  syncLobbyUI();
  showLobbyScreen();
})();
