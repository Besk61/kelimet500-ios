import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdSlot, webAdsConfigured } from './AdSlot';
import { allowedWordList, isAllowedWord, normalizeTurkish, solutionWords } from './words';
import { dailyIndex, gameDateKey, scoreEquals, scoreGuess, type Score } from './game';
import { startNativeBannerAds, stopNativeBannerAds } from './nativeAds';
import { challengeTokenFromUrl, challengeTokenFromWindow, challengeUrlForToken, clearChallengeBrowserUrl } from './deepLinks';
import { BrandIcon } from './BrandIcon';

type BaseMode = 'daily' | 'practice';
type Mode = BaseMode | 'challenge';
type Difficulty = 'standard' | 'standardPlus' | 'advanced';
type Mark = 'none' | 'red' | 'yellow' | 'green';
type Entry = { word: string; score: Score; marks: Mark[] };
type Stats = { played: number; won: number; streak: number; best: number };
type PersistedRound = {
  version: 2;
  mode: Mode;
  difficulty: Difficulty;
  dateKey?: string;
  challengeId?: string;
  answer: string;
  input: string;
  draftMarks: Mark[];
  entries: Entry[];
  finished: boolean;
  hintUses: number;
};

type ChallengePayload = { token: string; answer: string; id: string };

const ROWS = 8;
const EMPTY_MARKS: Mark[] = ['none', 'none', 'none', 'none', 'none'];
const MARK_ORDER: Mark[] = ['none', 'red', 'yellow', 'green'];
const TURKISH_ALPHABET = new Set([...'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ']);
const ROUND_STORAGE_PREFIX = 'kelimet500.round.v1';
const CHALLENGE_STORAGE_PREFIX = 'kelimet500.challenge.v1';
const SELECTION_STORAGE_KEY = 'kelimet500.selection.v1';
const CHALLENGE_XOR_KEY = new TextEncoder().encode('Kelimet500:BESK:2026');
const MAX_HINTS = 2;
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://kelimet500.boraeskicioglu.com/').replace(/\/?$/, '/');

const keyboardRows = [
  ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç'],
];

function readStats(): Stats {
  try {
    const parsed = JSON.parse(localStorage.getItem('kelimet500.stats.v2') || 'null') as Stats | null;
    return parsed ?? { played: 0, won: 0, streak: 0, best: 0 };
  } catch {
    return { played: 0, won: 0, streak: 0, best: 0 };
  }
}

function hasRepeatingLetters(word: string) {
  const letters = [...word];
  return new Set(letters).size !== letters.length;
}

function poolForDifficulty(difficulty: Difficulty) {
  if (difficulty === 'advanced') return solutionWords;
  if (difficulty === 'standardPlus') return solutionWords.filter(word => !hasRepeatingLetters(word));
  return solutionWords.filter(word => !hasRepeatingLetters(word) && !word.includes('J'));
}

function randomWord(pool: string[], exclude?: string) {
  const filtered = pool.filter(word => word !== exclude);
  const source = filtered.length ? filtered : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function localDateKey(date = new Date()) {
  return gameDateKey(date);
}

function roundStorageKey(mode: Mode, difficulty: Difficulty, challengeId?: string) {
  if (mode === 'challenge') return `${CHALLENGE_STORAGE_PREFIX}.${challengeId || 'unknown'}`;
  return `${ROUND_STORAGE_PREFIX}.${mode}.${difficulty}`;
}

function readSelection(): { mode: BaseMode; difficulty: Difficulty } {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTION_STORAGE_KEY) || 'null') as { mode?: BaseMode; difficulty?: Difficulty } | null;
    const validMode = parsed?.mode === 'daily' || parsed?.mode === 'practice';
    const validDifficulty = parsed?.difficulty === 'standard' || parsed?.difficulty === 'standardPlus' || parsed?.difficulty === 'advanced';
    if (validMode && validDifficulty) return { mode: parsed.mode as BaseMode, difficulty: parsed.difficulty as Difficulty };
  } catch {
    // Ignore unavailable/corrupt storage and fall back to defaults.
  }
  return { mode: 'daily', difficulty: 'standard' };
}

function isValidMarks(value: unknown): value is Mark[] {
  return Array.isArray(value)
    && value.length === 5
    && value.every(mark => MARK_ORDER.includes(mark as Mark));
}

function sanitizeEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, ROWS).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const candidate = raw as Partial<Entry>;
    if (typeof candidate.word !== 'string' || [...candidate.word].length !== 5) return [];
    if (!candidate.score || typeof candidate.score !== 'object') return [];
    const score = candidate.score as Partial<Score>;
    if (![score.exact, score.misplaced, score.absent].every(Number.isInteger)) return [];
    if (!isValidMarks(candidate.marks)) return [];
    return [{
      word: candidate.word,
      score: { exact: score.exact as number, misplaced: score.misplaced as number, absent: score.absent as number },
      marks: [...candidate.marks],
    }];
  });
}

function createFreshRound(mode: BaseMode, difficulty: Difficulty, excludeAnswer?: string): PersistedRound {
  const pool = poolForDifficulty(difficulty);
  const today = localDateKey();
  const dailyAnswer = pool[dailyIndex(pool.length, new Date(), difficulty)];
  return {
    version: 2,
    mode,
    difficulty,
    dateKey: mode === 'daily' ? today : undefined,
    answer: mode === 'daily' ? dailyAnswer : randomWord(pool, excludeAnswer),
    input: '',
    draftMarks: [...EMPTY_MARKS],
    entries: [],
    finished: false,
    hintUses: 0,
  };
}

function loadRound(mode: BaseMode, difficulty: Difficulty, excludeAnswer?: string): PersistedRound {
  const fresh = createFreshRound(mode, difficulty, excludeAnswer);
  try {
    const raw = localStorage.getItem(roundStorageKey(mode, difficulty));
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Omit<Partial<PersistedRound>, 'version'> & { version?: number };
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2) || parsed.mode !== mode || parsed.difficulty !== difficulty) return fresh;

    if (mode === 'daily') {
      const pool = poolForDifficulty(difficulty);
      if (parsed.dateKey !== localDateKey()) return fresh;
      if (typeof parsed.answer !== 'string' || !pool.includes(parsed.answer)) return fresh;
    } else {
      const pool = poolForDifficulty(difficulty);
      if (typeof parsed.answer !== 'string' || !pool.includes(parsed.answer)) return fresh;
    }

    const input = typeof parsed.input === 'string' && [...parsed.input].length <= 5 ? parsed.input : '';
    const entries = sanitizeEntries(parsed.entries);
    const draftMarks = isValidMarks(parsed.draftMarks) ? [...parsed.draftMarks] : [...EMPTY_MARKS];

    return {
      ...fresh,
      answer: parsed.answer as string,
      input,
      draftMarks,
      entries,
      finished: Boolean(parsed.finished),
      hintUses: Number.isInteger(parsed.hintUses) ? Math.max(0, Math.min(MAX_HINTS, parsed.hintUses as number)) : 0,
    };
  } catch {
    return fresh;
  }
}

function hashText(value: string) {
  let hash = 2166136261;
  for (const ch of value) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function challengeChecksum(word: string) {
  return hashText(`kelimet500:${word}:arkadas`).slice(0, 6);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function encodeChallenge(wordRaw: string) {
  const word = normalizeTurkish(wordRaw);
  const plain = new TextEncoder().encode(`${word}|${challengeChecksum(word)}`);
  const encrypted = plain.map((byte, index) => byte ^ CHALLENGE_XOR_KEY[index % CHALLENGE_XOR_KEY.length]);
  return bytesToBase64Url(encrypted);
}

function decodeChallenge(token: string): string | null {
  try {
    const encrypted = base64UrlToBytes(token);
    const plain = encrypted.map((byte, index) => byte ^ CHALLENGE_XOR_KEY[index % CHALLENGE_XOR_KEY.length]);
    const decoded = new TextDecoder().decode(plain);
    const [word, checksum] = decoded.split('|');
    const normalized = normalizeTurkish(word || '');
    // Arkadaş meydan okumaları normal sözlükle sınırlı değildir. Link oluşturucuda
    // kabul ettiğimiz kuralla aynı şekilde yalnızca tam 5 Türkçe harf olmasını
    // doğrularız. Böylece sözlük dışı özel cevaplar link açıldığında da
    // challenge olarak yüklenir; sözlük kontrolü yalnızca yanlış tahminlere uygulanır.
    if ([...normalized].length !== 5 || !/^[ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]{5}$/u.test(normalized)) return null;
    if (checksum !== challengeChecksum(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

function challengePayloadFromToken(token: string | null): ChallengePayload | null {
  if (!token) return null;
  const answer = decodeChallenge(token);
  if (!answer) return null;
  return { token, answer, id: hashText(token) };
}

function readChallengeFromUrl(): ChallengePayload | null {
  return challengePayloadFromToken(challengeTokenFromWindow());
}

function createFreshChallenge(challenge: ChallengePayload): PersistedRound {
  return {
    version: 2,
    mode: 'challenge',
    difficulty: 'advanced',
    challengeId: challenge.id,
    answer: challenge.answer,
    input: '',
    draftMarks: [...EMPTY_MARKS],
    entries: [],
    finished: false,
    hintUses: 0,
  };
}

function loadChallengeRound(challenge: ChallengePayload): PersistedRound {
  const fresh = createFreshChallenge(challenge);
  try {
    const parsed = JSON.parse(localStorage.getItem(roundStorageKey('challenge', 'advanced', challenge.id)) || 'null') as Partial<PersistedRound> | null;
    if (!parsed || parsed.answer !== challenge.answer || parsed.challengeId !== challenge.id) return fresh;
    return {
      ...fresh,
      input: typeof parsed.input === 'string' && [...parsed.input].length <= 5 ? parsed.input : '',
      draftMarks: isValidMarks(parsed.draftMarks) ? [...parsed.draftMarks] : [...EMPTY_MARKS],
      entries: sanitizeEntries(parsed.entries),
      finished: Boolean(parsed.finished),
      hintUses: Number.isInteger(parsed.hintUses) ? Math.max(0, Math.min(MAX_HINTS, parsed.hintUses as number)) : 0,
    };
  } catch {
    return fresh;
  }
}

function completionMessage(round: Pick<PersistedRound, 'answer' | 'entries' | 'finished'>) {
  if (!round.finished) return '';
  return round.entries.some(entry => entry.score.exact === 5)
    ? `Bildin! ${round.answer} 🎉`
    : `Kelime: ${round.answer}`;
}

function nextMark(mark: Mark): Mark {
  return MARK_ORDER[(MARK_ORDER.indexOf(mark) + 1) % MARK_ORDER.length];
}

function percent(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}

const MARK_PRIORITY: Record<Mark, number> = {
  none: 0,
  red: 1,
  yellow: 2,
  green: 3,
};

function deriveKeyboardMarks(entries: Entry[], input: string, draftMarks: Mark[]) {
  const result = new Map<string, Mark>();

  const apply = (letter: string, mark: Mark) => {
    if (!letter || letter === '_' || mark === 'none') return;
    const current = result.get(letter) ?? 'none';
    if (MARK_PRIORITY[mark] >= MARK_PRIORITY[current]) result.set(letter, mark);
  };

  for (const entry of entries) {
    [...entry.word].forEach((letter, index) => apply(letter, entry.marks[index] ?? 'none'));
  }

  [...input].forEach((letter, index) => apply(letter, draftMarks[index] ?? 'none'));
  return result;
}

function automaticMarksForScore(score: Score, fallback: Mark[]): Mark[] {
  if (score.exact === 5) return ['green', 'green', 'green', 'green', 'green'];
  if (score.misplaced === 5) return ['yellow', 'yellow', 'yellow', 'yellow', 'yellow'];
  if (score.absent === 5) return ['red', 'red', 'red', 'red', 'red'];
  return [...fallback];
}

function informativeLetters(candidates: string[], keyboardMarks: Map<string, Mark>) {
  if (!candidates.length) return [];
  const frequencies = new Map<string, number>();
  for (const candidate of candidates) {
    for (const letter of new Set([...candidate])) {
      if ((keyboardMarks.get(letter) ?? 'none') !== 'none') continue;
      frequencies.set(letter, (frequencies.get(letter) ?? 0) + 1);
    }
  }
  const half = candidates.length / 2;
  return [...frequencies.entries()]
    .sort((a, b) => {
      const splitA = Math.abs(a[1] - half);
      const splitB = Math.abs(b[1] - half);
      return splitA - splitB || b[1] - a[1] || a[0].localeCompare(b[0], 'tr-TR');
    })
    .slice(0, 3)
    .map(([letter]) => letter);
}

export default function App() {
  const [initialRound] = useState(() => {
    const challenge = readChallengeFromUrl();
    if (challenge) return loadChallengeRound(challenge);
    const selection = readSelection();
    return loadRound(selection.mode, selection.difficulty);
  });

  const [mode, setMode] = useState<Mode>(initialRound.mode);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialRound.difficulty);
  const [challengeId, setChallengeId] = useState<string | undefined>(initialRound.challengeId);
  const answerPool = useMemo(() => mode === 'challenge' ? allowedWordList : poolForDifficulty(difficulty), [difficulty, mode]);

  const [answer, setAnswer] = useState(initialRound.answer);
  const [input, setInput] = useState(initialRound.input);
  const [draftMarks, setDraftMarks] = useState<Mark[]>(initialRound.draftMarks);
  const [entries, setEntries] = useState<Entry[]>(initialRound.entries);
  const [message, setMessage] = useState(() => completionMessage(initialRound));
  const [finished, setFinished] = useState(initialRound.finished);
  const [hintUses, setHintUses] = useState(initialRound.hintUses);
  const [stats, setStats] = useState<Stats>(readStats);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [challengeWord, setChallengeWord] = useState('');
  const [challengeError, setChallengeError] = useState('');
  const [challengeUrl, setChallengeUrl] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [invalidShake, setInvalidShake] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;
    void startNativeBannerAds();
    return () => { void stopNativeBannerAds(); };
  }, [isNative]);


  const enterChallengeToken = useCallback((token: string | null) => {
    const challenge = challengePayloadFromToken(token);
    if (!challenge) {
      if (token) setMessage('Meydan okuma bağlantısı geçersiz veya bozuk.');
      return;
    }
    const target = loadChallengeRound(challenge);
    setMode('challenge');
    setDifficulty('advanced');
    setChallengeId(challenge.id);
    setAnswer(target.answer);
    setEntries(target.entries);
    setInput(target.input);
    setDraftMarks(target.draftMarks);
    setFinished(target.finished);
    setHintUses(target.hintUses);
    setCelebrating(false);
    setInvalidShake(0);
    setMessage(completionMessage(target));
    setShowChallenge(false);
    setShowHelp(false);
    setShowStats(false);
  }, []);

  useEffect(() => {
    if (!isNative) return;
    let active = true;
    let listener: { remove: () => Promise<void> } | undefined;

    const handleUrl = (url?: string) => {
      if (!active || !url) return;
      enterChallengeToken(challengeTokenFromUrl(url));
    };

    void CapacitorApp.getLaunchUrl().then(result => handleUrl(result?.url));
    void CapacitorApp.addListener('appUrlOpen', event => handleUrl(event.url)).then(handle => {
      if (active) listener = handle;
      else void handle.remove();
    });

    return () => {
      active = false;
      if (listener) void listener.remove();
    };
  }, [enterChallengeToken, isNative]);
  const showAdPlaceholders = import.meta.env.VITE_SHOW_AD_PLACEHOLDERS === 'true';
  const showDesktopAds = !isNative && viewportWidth > 1050;
  const showMobileAd = !isNative && viewportWidth <= 767;
  const hasMobileWebAd = showMobileAd && Boolean(
    showAdPlaceholders || (webAdsConfigured && import.meta.env.VITE_ADSENSE_MOBILE_SLOT),
  );

  const keyboardMarks = useMemo(
    () => deriveKeyboardMarks(entries, input, draftMarks),
    [entries, input, draftMarks],
  );

  const isLetterEliminated = useCallback(
    (letter: string) => keyboardMarks.get(letter) === 'red',
    [keyboardMarks],
  );

  const saveStats = useCallback((won: boolean) => {
    setStats(current => {
      const next = {
        played: current.played + 1,
        won: current.won + (won ? 1 : 0),
        streak: won ? current.streak + 1 : 0,
        best: won ? Math.max(current.best, current.streak + 1) : current.best,
      };
      localStorage.setItem('kelimet500.stats.v2', JSON.stringify(next));
      return next;
    });
  }, []);

  const switchRound = useCallback((nextMode: BaseMode, nextDifficulty: Difficulty) => {
    if (nextMode === mode && nextDifficulty === difficulty) return;
    const target = loadRound(nextMode, nextDifficulty, answer);
    setMode(nextMode);
    setDifficulty(nextDifficulty);
    setChallengeId(undefined);
    setAnswer(target.answer);
    setEntries(target.entries);
    setInput(target.input);
    setDraftMarks(target.draftMarks);
    setFinished(target.finished);
    setHintUses(target.hintUses);
    setCelebrating(false);
    setInvalidShake(0);
    setMessage(completionMessage(target));

    clearChallengeBrowserUrl();
  }, [answer, difficulty, mode]);

  const triggerInvalid = useCallback((text: string) => {
    setMessage(text);
    setInvalidShake(current => current + 1);
  }, []);

  const pushToken = useCallback((token: string) => {
    if (finished) return;
    setInput(current => {
      if ([...current].length >= 5) return current;
      const index = [...current].length;
      setDraftMarks(marks => {
        const next = [...marks];
        next[index] = 'none';
        return next;
      });
      return current + token;
    });
  }, [finished]);

  const pushLetter = useCallback((raw: string) => {
    const letter = normalizeTurkish(raw);
    if ([...letter].length !== 1 || !TURKISH_ALPHABET.has(letter)) return;
    if (isLetterEliminated(letter)) {
      setMessage(`${letter} harfini kırmızı işaretledin; klavyeden elendi.`);
      return;
    }
    pushToken(letter);
  }, [isLetterEliminated, pushToken]);

  const erase = useCallback(() => {
    if (finished) return;
    setInput(current => {
      const chars = [...current];
      if (!chars.length) return current;
      const index = chars.length - 1;
      chars.pop();
      setDraftMarks(marks => {
        const next = [...marks];
        next[index] = 'none';
        return next;
      });
      return chars.join('');
    });
  }, [finished]);

  const submit = useCallback(() => {
    if (finished) return;
    const word = normalizeTurkish(input);
    if ([...word].length !== 5) {
      triggerInvalid('5 harfli bir kelime yaz.');
      return;
    }
    if (word.includes('_')) {
      triggerInvalid('Boşlukları doldurmadan tahmin gönderemezsin.');
      return;
    }
    // Normal oyunlarda tahminler sözlükten gelmeli. Arkadaş meydan okumasında
    // özel cevap sözlükte olmasa bile (örn. AŞKIM, CANIM) doğru cevap olarak
    // gönderilebilmeli; diğer tahminler yine normal sözlük kontrolünden geçer.
    if (!isAllowedWord(word) && !(mode === 'challenge' && word === answer)) {
      triggerInvalid('Bu kelime sözlükte bulunamadı.');
      return;
    }

    setInvalidShake(0);
    const score = scoreGuess(answer, word);
    const marks = automaticMarksForScore(score, draftMarks);
    const nextEntries = [...entries, { word, score, marks }];
    setEntries(nextEntries);
    setInput('');
    setDraftMarks([...EMPTY_MARKS]);
    setMessage('');

    if (score.exact === 5) {
      setFinished(true);
      setCelebrating(true);
      if (mode !== 'challenge') saveStats(true);
      setMessage(`Bildin! ${answer} 🎉`);
    } else if (nextEntries.length >= ROWS) {
      setFinished(true);
      if (mode !== 'challenge') saveStats(false);
      setMessage(`Kelime: ${answer}`);
    }
  }, [answer, draftMarks, entries, finished, input, mode, saveStats, triggerInvalid]);

  useEffect(() => {
    if (mode !== 'challenge') {
      localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ mode, difficulty }));
    }
  }, [difficulty, mode]);

  useEffect(() => {
    const round: PersistedRound = {
      version: 2,
      mode,
      difficulty,
      dateKey: mode === 'daily' ? localDateKey() : undefined,
      challengeId,
      answer,
      input,
      draftMarks,
      entries,
      finished,
      hintUses,
    };
    localStorage.setItem(roundStorageKey(mode, difficulty, challengeId), JSON.stringify(round));
  }, [answer, challengeId, difficulty, draftMarks, entries, finished, hintUses, input, mode]);


  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2400);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showChallenge || showHelp || showStats) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        erase();
        return;
      }
      if (event.key === ' ' || event.key === '-') {
        event.preventDefault();
        pushToken('_');
        return;
      }
      if (event.key.length === 1) pushLetter(event.key);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [erase, pushLetter, pushToken, showChallenge, showHelp, showStats, submit]);

  const cycleEntryMark = (rowIndex: number, letterIndex: number) => {
    setEntries(current => current.map((entry, index) => {
      if (index !== rowIndex) return entry;
      const marks = [...entry.marks];
      marks[letterIndex] = nextMark(marks[letterIndex]);
      return { ...entry, marks };
    }));
  };

  const cycleDraftMark = (letterIndex: number) => {
    if (![...input][letterIndex]) return;
    setDraftMarks(current => {
      const next = [...current];
      next[letterIndex] = nextMark(next[letterIndex]);
      return next;
    });
  };

  const clearMarks = () => {
    setEntries(current => current.map(entry => ({ ...entry, marks: [...EMPTY_MARKS] })));
    setDraftMarks([...EMPTY_MARKS]);
    setMessage('Renk notları temizlendi.');
  };

  const useHint = () => {
    if (entries.length < 2) {
      setMessage('İpucu 2 tahminden sonra açılır.');
      return;
    }
    if (hintUses >= MAX_HINTS) {
      setMessage('Bu oyun için ipucu hakkın bitti.');
      return;
    }

    const candidates = answerPool.filter(candidate =>
      entries.every(entry => scoreEquals(scoreGuess(candidate, entry.word), entry.score)),
    );
    if (!candidates.length) {
      setMessage('Önceki sonuçlara uyan aday bulunamadı.');
      return;
    }

    if (hintUses === 0) {
      const description = candidates.length === 1
        ? 'Sonuçlarına uyan tek bir aday kaldı.'
        : `${candidates.length.toLocaleString('tr-TR')} olası cevap kaldı.`;
      setMessage(`${description} Kelimeyi sen bulmalısın 🙂`);
    } else if (candidates.length <= 5) {
      setMessage(`${candidates.length} veya daha az aday kaldı. Harf önerisi bu noktada fazla güçlü olacağı için ikinci ipucu yeni bilgi vermiyor 🙂`);
    } else {
      const letters = informativeLetters(candidates, keyboardMarks);
      if (letters.length) {
        setMessage(`Analiz önerisi: ${letters.join(', ')} harflerini denemek adayları iyi bölebilir. Bu harflerin cevapta olduğu garanti değil.`);
      } else {
        setMessage(`${candidates.length.toLocaleString('tr-TR')} aday kaldı; mevcut renk notların zaten çoğu harfi sınıflandırmış.`);
      }
    }
    setHintUses(current => current + 1);
  };

  const nextPractice = () => {
    setAnswer(randomWord(answerPool, answer));
    setEntries([]);
    setInput('');
    setDraftMarks([...EMPTY_MARKS]);
    setFinished(false);
    setHintUses(0);
    setCelebrating(false);
    setInvalidShake(0);
    setMessage('');
  };

  const share = async () => {
    const title = mode === 'challenge' ? 'Arkadaş Meydan Okuması' : mode === 'daily' ? 'Günlük' : 'Alıştırma';
    const text = `Kelimet500 ${title}\n${entries
      .map(entry => `🟩${entry.score.exact} 🟨${entry.score.misplaced} 🟥${entry.score.absent}`)
      .join('\n')}\n${PUBLIC_APP_URL}`;

    try {
      if (isNative) await Share.share({ title: 'Kelimet500', text, url: PUBLIC_APP_URL, dialogTitle: 'Kelimet500 sonucunu paylaş' });
      else if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setMessage('Sonuç panoya kopyalandı.');
      }
    } catch {
      setMessage('Paylaşım iptal edildi.');
    }
  };

  const openChallengeCreator = () => {
    setChallengeWord('');
    setChallengeError('');
    setChallengeUrl('');
    setShowChallenge(true);
  };

  const buildChallengeLink = () => {
    const word = normalizeTurkish(challengeWord);
    if ([...word].length !== 5) {
      setChallengeError('5 harfli bir kelime yazmalısın.');
      return;
    }
    if (!/^[ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]{5}$/u.test(word)) {
      setChallengeError('Yalnızca 5 Türkçe harf kullanabilirsin.');
      return;
    }
    const token = encodeChallenge(word);
    setChallengeUrl(challengeUrlForToken(token));
    setChallengeError('');
  };

  const shareChallenge = async () => {
    if (!challengeUrl) return;
    const text = `Sana Kelimet500'de bir kelime bıraktım 😁 Bakalım kaç tahminde bulacaksın!`;
    try {
      if (isNative) await Share.share({ title: 'Kelimet500', text, url: challengeUrl, dialogTitle: 'Arkadaşına gönder' });
      else if (navigator.share) await navigator.share({ title: 'Kelimet500', text, url: challengeUrl });
      else {
        await navigator.clipboard.writeText(challengeUrl);
        setChallengeError('Link panoya kopyalandı ✓');
      }
    } catch {
      setChallengeError('Paylaşım iptal edildi.');
    }
  };

  const difficultyDescription = difficulty === 'standard'
    ? 'Tekrarlı harf yok · J yok'
    : difficulty === 'standardPlus'
      ? 'Tekrarlı harf yok'
      : 'Her şey serbest';

  const hintsLeft = Math.max(0, MAX_HINTS - hintUses);


  return (
    <>
      {showDesktopAds && (
        <>
          <AdSlot slot={import.meta.env.VITE_ADSENSE_LEFT_SLOT} className="desktop-ad desktop-ad-left" format="vertical" label="Sol reklam" />
          <AdSlot slot={import.meta.env.VITE_ADSENSE_RIGHT_SLOT} className="desktop-ad desktop-ad-right" format="vertical" label="Sağ reklam" />
        </>
      )}

      <main className={`app-shell ${isNative ? 'is-native' : ''} ${celebrating ? 'is-celebrating' : ''} ${hasMobileWebAd ? 'has-web-ads' : ''}`}>
        {celebrating && (
          <div className="win-celebration" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, index) => (
              <i
                key={index}
                className={`confetti confetti-${index % 3}`}
                style={{
                  left: `${(index * 37) % 100}%`,
                  animationDelay: `${(index % 8) * 0.06}s`,
                  animationDuration: `${1.45 + (index % 5) * 0.16}s`,
                }}
              />
            ))}
            <div className="win-burst">BİLDİN!</div>
          </div>
        )}

        <header className="topbar">
          <div className="brand-lockup" aria-label="Kelimet500">
            <BrandIcon />
            <strong>KELİMET500</strong>
          </div>
          <div className="header-actions">
            <button className="icon-button" onClick={openChallengeCreator} aria-label="Arkadaşına kelime gönder">↗</button>
            <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="Nasıl oynanır">?</button>
            <button className="icon-button" onClick={() => setShowStats(true)} aria-label="İstatistikler">▥</button>
          </div>
        </header>

        <section className="game-controls" aria-label="Oyun seçenekleri">
          {mode === 'challenge' ? (
            <div className="challenge-active">
              <strong>ARKADAŞ MEYDAN OKUMASI</strong>
              <span>Gönderilen 5 harfli kelimeyi 8 tahminde bul.</span>
              <button onClick={() => switchRound('daily', readSelection().difficulty)}>NORMAL OYUNA DÖN</button>
            </div>
          ) : (
            <>
              <div className="segmented">
                <button className={difficulty === 'standard' ? 'active' : ''} onClick={() => switchRound(mode, 'standard')}>Standart</button>
                <button className={difficulty === 'standardPlus' ? 'active' : ''} onClick={() => switchRound(mode, 'standardPlus')}>Standart+</button>
                <button className={difficulty === 'advanced' ? 'active' : ''} onClick={() => switchRound(mode, 'advanced')}>İleri</button>
              </div>
              <p className="difficulty-note">{difficultyDescription}</p>
              <div className="mode-switch">
                <button className={mode === 'daily' ? 'active' : ''} onClick={() => switchRound('daily', difficulty)}>Günlük</button>
                <button className={mode === 'practice' ? 'active' : ''} onClick={() => switchRound('practice', difficulty)}>Alıştırma</button>
              </div>
              <button className="challenge-open-button" onClick={openChallengeCreator}>↗ ARKADAŞINA KELİME GÖNDER</button>
            </>
          )}
        </section>

        <section className="board" aria-label="Tahmin tahtası">
          {Array.from({ length: ROWS }).map((_, rowIndex) => {
            const entry = entries[rowIndex];
            const isDraft = rowIndex === entries.length && !finished;
            const letters = entry ? [...entry.word] : isDraft ? [...input] : [];
            const marks = entry ? entry.marks : isDraft ? draftMarks : EMPTY_MARKS;
            const isWinningRow = Boolean(entry && entry.score.exact === 5);
            return (
              <div
                className={`board-row ${entry ? 'scored-row' : ''} ${isWinningRow ? 'winning-row' : ''} ${isDraft && invalidShake > 0 ? 'invalid-row' : ''}`}
                key={isDraft ? `draft-${rowIndex}-${invalidShake}` : rowIndex}
              >
                <div className="letter-group">
                  {Array.from({ length: 5 }).map((__, letterIndex) => {
                    const letter = letters[letterIndex] || '';
                    const mark = marks[letterIndex] || 'none';
                    return (
                      <button
                        key={letterIndex}
                        className={`letter-tile ${letter ? 'filled' : ''} mark-${mark}`}
                        onClick={() => entry ? cycleEntryMark(rowIndex, letterIndex) : isDraft ? cycleDraftMark(letterIndex) : undefined}
                        disabled={!letter}
                        aria-label={letter ? `${letter} harfini işaretle` : 'Boş harf'}
                      >
                        {letter === '_' ? '_' : letter}
                      </button>
                    );
                  })}
                </div>
                <div className="score-group" aria-label={entry ? `${entry.score.exact} doğru yer, ${entry.score.misplaced} yanlış yer, ${entry.score.absent} yok` : 'Sonuç'}>
                  <span className={`score-tile score-green ${entry ? 'score-reveal' : ''}`}>{entry ? entry.score.exact : ''}</span>
                  <span className={`score-tile score-yellow ${entry ? 'score-reveal' : ''}`}>{entry ? entry.score.misplaced : ''}</span>
                  <span className={`score-tile score-red ${entry ? 'score-reveal' : ''}`}>{entry ? entry.score.absent : ''}</span>
                </div>
              </div>
            );
          })}
        </section>

        <div className={`message ${message ? 'visible' : ''}`}>{message || ' '}</div>

        {finished ? (
          <section className="finish-panel">
            <button onClick={share}>SONUCU PAYLAŞ</button>
            {mode === 'practice' && <button className="accent" onClick={nextPractice}>YENİ KELİME</button>}
            {mode === 'challenge' && <button className="accent" onClick={openChallengeCreator}>BEN DE GÖNDEREYİM</button>}
          </section>
        ) : (
          <section className="keyboard" aria-label="Türkçe klavye">
            {keyboardRows.map((row, rowIndex) => (
              <div className={`key-row key-row-${rowIndex + 1}`} key={rowIndex}>
                {row.map(key => {
                  const mark = keyboardMarks.get(key) ?? 'none';
                  const eliminated = mark === 'red';
                  return (
                    <button
                      className={`key key-mark-${mark} ${eliminated ? 'key-eliminated' : ''}`}
                      key={key}
                      onClick={() => pushLetter(key)}
                      disabled={eliminated}
                      aria-label={eliminated ? `${key} elendi` : `${key} harfi`}
                      title={eliminated ? 'Kırmızı işaretlendi — elendi' : undefined}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="special-row">
              <button className="special-key square" onClick={clearMarks} title="Renkleri temizle">⌫R</button>
              <button className={`special-key square hint-key ${hintsLeft === 0 ? 'hint-empty' : ''}`} onClick={useHint} title={`İpucu · ${hintsLeft}/${MAX_HINTS} hak`}>💡<small>{hintsLeft}</small></button>
              <button className="special-key space-key" onClick={() => pushToken('_')}>SPACE</button>
              <button className="special-key square" onClick={erase} title="Sil">⌫</button>
              <button className="special-key submit-key" onClick={submit} title="Tahmini gönder">✓</button>
            </div>
            <div className="keyboard-tip">PC: harfler · Enter gönder · Backspace sil · Space / - boşluk · İpucu kelimeyi otomatik doldurmaz</div>
          </section>
        )}

        <footer className="footer-note">
          <span>{allowedWordList.length.toLocaleString('tr-TR')}+ tahmin kelimesi</span>
          <span>•</span>
          <span>{mode === 'daily' ? `Bugünün kelimesi · ${localDateKey()}` : mode === 'challenge' ? 'Arkadaş kelimesi bu cihazda otomatik kaydedilir' : 'Oyunlar otomatik kaydedilir'}</span>
        </footer>

        {showHelp && (
          <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}>
            <section className="modal" onMouseDown={event => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowHelp(false)}>×</button>
              <h2>Kelimet500 nasıl oynanır?</h2>
              <p>Gizli 5 harfli kelimeyi en fazla 8 tahminde bul. Sonuç sana hangi harflerin tuttuğunu söylemez; yalnızca sayıları verir.</p>
              <div className="help-score"><span className="score-green">1</span><span className="score-yellow">2</span><span className="score-red">2</span></div>
              <p><b>Yeşil:</b> doğru harf + doğru yer. <b>Sarı:</b> kelimede var ama yeri yanlış. <b>Kırmızı:</b> kelimede yok.</p>
              <p>Tahminindeki harf kutularına dokunarak kendi notlarını tutabilirsin: kırmızı → sarı → yeşil → boş.</p>
              <p><b>İpucu</b> artık cevap adayını otomatik yazmaz. 2 tahminden sonra açılır ve oyun başına en fazla 2 kez analiz yardımı verir.</p>
              <p><b>Arkadaşına kelime gönder</b> ile kendi 5 harfli kelimeni seçip özel bir bağlantı oluşturabilirsin. Alıcı bağlantıyı açtığında aynı kurallarla kelimeni çözmeye çalışır.</p>
              <p><b>Space</b> veya <b>-</b> ile <b>_</b> yer tutucu ekleyebilirsin. Fiziksel klavyeden doğrudan yazabilir, Enter ile gönderebilirsin.</p>
              <p>Her mod ve zorluk ayrı ayrı otomatik kaydedilir. Başka sekmeye geçsen veya sayfayı kapatsan bile kaldığın yer korunur.</p>
            </section>
          </div>
        )}

        {showStats && (
          <div className="modal-backdrop" onMouseDown={() => setShowStats(false)}>
            <section className="modal stats-modal" onMouseDown={event => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowStats(false)}>×</button>
              <h2>İstatistikler</h2>
              <div className="stats-grid">
                <div><strong>{stats.played}</strong><span>Oynanan</span></div>
                <div><strong>%{percent(stats.won, stats.played)}</strong><span>Kazanma</span></div>
                <div><strong>{stats.streak}</strong><span>Seri</span></div>
                <div><strong>{stats.best}</strong><span>En iyi</span></div>
              </div>
              <p className="stats-note">Arkadaş meydan okumaları ana istatistiklerini etkilemez.</p>
            </section>
          </div>
        )}

        {showChallenge && (
          <div className="modal-backdrop" onMouseDown={() => setShowChallenge(false)}>
            <section className="modal challenge-modal" onMouseDown={event => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowChallenge(false)}>×</button>
              <h2>Arkadaşına kelime gönder</h2>
              <p>5 harfli bir kelime seç. Arkadaş modunda sözlük zorunlu değildir; yalnızca 5 Türkçe harf kullanılır. Kelimen bağlantıda düz metin olarak görünmez.</p>
              <div className="challenge-word-input">
                <input
                  value={challengeWord}
                  maxLength={5}
                  autoFocus
                  placeholder="TARAK"
                  onChange={event => {
                    const normalized = normalizeTurkish(event.target.value).replace(/[^ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]/gu, '');
                    setChallengeWord([...normalized].slice(0, 5).join(''));
                    setChallengeUrl('');
                    setChallengeError('');
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') buildChallengeLink();
                  }}
                />
                <button onClick={buildChallengeLink}>LİNK OLUŞTUR</button>
              </div>
              {challengeUrl && (
                <div className="challenge-generated">
                  <span>Hazır ✓</span>
                  <code>{challengeUrl}</code>
                  <button onClick={shareChallenge}>↗ PAYLAŞ / KOPYALA</button>
                </div>
              )}
              {challengeError && <p className={`challenge-feedback ${challengeError.includes('✓') ? 'success' : ''}`}>{challengeError}</p>}
            </section>
          </div>
        )}
      </main>

      {showMobileAd && (
        <AdSlot slot={import.meta.env.VITE_ADSENSE_MOBILE_SLOT} className="mobile-ad mobile-ad-bottom" format="horizontal" label="Mobil alt banner" />
      )}
    </>
  );
}
