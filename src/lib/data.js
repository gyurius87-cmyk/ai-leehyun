import timeline from '../../data/timeline.json';
import notesData from '../../data/notes.json';
import programsData from '../../data/programs.json';

export const INSTAGRAM = 'https://www.instagram.com/ai_leehyun/';
export const START_DATE = timeline.startDate;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** startDate(한국 시간)를 1일째로 셉니다. */
export const dayNumber = (ymd) => Math.round((toUtc(ymd) - toUtc(START_DATE)) / DAY_MS) + 1;

export const weekday = (ymd) => WEEKDAYS[new Date(toUtc(ymd)).getUTCDay()];

export const formatDate = (ymd) => ymd.replaceAll('-', '.');

/** 지금 한국 날짜 기준 몇 일째인지 (빌드 시점 값, 화면에서는 스크립트가 다시 계산) */
export const todayDayNumber = () => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Math.max(1, dayNumber(kst));
};

export const days = [...timeline.days]
  .filter((d) => d.items && d.items.length)
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .map((d) => ({ ...d, day: dayNumber(d.date), weekday: weekday(d.date) }));

// 실제로 원고 파일이 있는 공부노트만 셉니다.
const mdFiles = import.meta.glob('../../content/notes/*.md', { eager: true });
const fileFor = (note) => mdFiles['../../' + note.file];

export const notes = [...notesData.notes]
  .filter((n) => fileFor(n))
  .sort((a, b) => (a.no < b.no ? 1 : -1))
  .map((n) => ({ ...n, day: dayNumber(n.date), module: fileFor(n) }));
export const programs = programsData.programs || [];

/** 가장 최근 기록일부터 하루씩 거꾸로 이어진 날 수 */
const streak = (() => {
  if (!days.length) return 0;
  let count = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1].day - days[i].day === 1) count++;
    else break;
  }
  return count;
})();

const hoursSaved = programs.reduce((sum, p) => sum + (Number(p.hoursPerWeek) || 0), 0);

export const stats = {
  recordDays: days.length,
  streak,
  notes: notes.length,
  programs: programs.length,
  programsInUse: programs.filter((p) => p.inUse !== false).length,
  hoursSaved,
};
