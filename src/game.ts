export type Score = { exact: number; misplaced: number; absent: number };

export function scoreGuess(answerRaw: string, guessRaw: string): Score {
  const answer = [...answerRaw.toLocaleUpperCase('tr-TR')];
  const guess = [...guessRaw.toLocaleUpperCase('tr-TR')];
  const usedAnswer = Array(answer.length).fill(false);
  const usedGuess = Array(guess.length).fill(false);
  let exact = 0;
  let misplaced = 0;

  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) {
      exact++;
      usedAnswer[i] = true;
      usedGuess[i] = true;
    }
  }

  for (let gi = 0; gi < guess.length; gi++) {
    if (usedGuess[gi]) continue;
    for (let ai = 0; ai < answer.length; ai++) {
      if (!usedAnswer[ai] && guess[gi] === answer[ai]) {
        misplaced++;
        usedAnswer[ai] = true;
        usedGuess[gi] = true;
        break;
      }
    }
  }

  return { exact, misplaced, absent: answer.length - exact - misplaced };
}

export function scoreEquals(a: Score, b: Score): boolean {
  return a.exact === b.exact && a.misplaced === b.misplaced && a.absent === b.absent;
}


export function gameDateKey(date = new Date(), timeZone = 'Europe/Istanbul'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value ?? String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value ?? String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = parts.find(part => part.type === 'day')?.value ?? String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashSalt(value: string) {
  let h = 2166136261;
  for (const ch of value) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gcd(a: number, b: number) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    [left, right] = [right, left % right];
  }
  return left;
}

/**
 * Deterministic daily position with no consecutive/repeated index until the pool cycles.
 * Each difficulty gets a different offset/stride while everybody on the same local date
 * receives the same word without requiring a backend.
 */
export function dailyIndex(length: number, date = new Date(), salt = ''): number {
  if (length <= 1) return 0;

  const [year, month, day] = gameDateKey(date).split('-').map(Number);
  const gameCalendarDay = Date.UTC(year, month - 1, day);
  const epochCalendarDay = Date.UTC(2026, 0, 1);
  const dayNumber = Math.floor((gameCalendarDay - epochCalendarDay) / 86_400_000);
  const saltHash = hashSalt(salt);

  let stride = 7919 % length;
  if (stride === 0) stride = 1;
  while (gcd(stride, length) !== 1) stride = (stride + 1) % length || 1;

  const offset = saltHash % length;
  const index = ((dayNumber * stride + offset) % length + length) % length;
  return index;
}
