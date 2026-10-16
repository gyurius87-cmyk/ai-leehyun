import timeline from '../../data/timeline.json';
import notesData from '../../data/notes.json';
import programsData from '../../data/programs.json';
import planData from '../../data/plan.json';

export const INSTAGRAM = 'https://www.instagram.com/ai_leehyun/';
export const YOUTUBE = 'https://www.youtube.com/@AI%EC%9D%B4%ED%98%84';
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
  .map((d) => ({ ...d, items: [...d.items].sort((a, b) => (a.time < b.time ? 1 : -1)), day: dayNumber(d.date), weekday: weekday(d.date) }));

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

// 공부할 것: 분야 → 세부 분야 → 항목. status 는 done(끝냄) / doing(하는 중) / todo(우선, priority 순) / wait(대기)
export const areas = planData.areas || [];
export const plan = areas.flatMap((a) =>
  a.groups.flatMap((g) =>
    g.items.map((item) => ({
      ...item,
      area: a.area,
      group: g.name,
      days: item.start && item.end ? dayNumber(item.end) - dayNumber(item.start) + 1 : null,
    })),
  ),
);
export const planDoing = plan.filter((i) => i.status === 'doing');
export const planTodo = plan.filter((i) => i.status === 'todo').sort((a, b) => (a.priority || 99) - (b.priority || 99));
export const planDone = plan.filter((i) => i.status === 'done');
export const planWait = plan.filter((i) => i.status === 'wait');
/** 지금 하는 공부가 있으면 그것, 없으면 우선순위 1번 */
export const nextStudy = planDoing[0] || planTodo[0] || null;

/** 유튜브 검색 주소: 조회수순 + 최근 4개월(after:날짜). 날짜는 화면에서 오늘 기준으로 다시 계산합니다. */
export const YT_MONTHS = 4;
export const ytSearch = (q) => {
  const d = new Date();
  d.setMonth(d.getMonth() - YT_MONTHS);
  const after = d.toISOString().slice(0, 10);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} after:${after}`)}&sp=CAMSAhAB`;
};

export const stats = {
  recordDays: days.length,
  totalMinutes: days.reduce((sum, d) => sum + (d.minutes || 0), 0),
  streak,
  notes: notes.length,
  programs: programs.length,
  programsUsing: programs.filter((p) => p.status === 'using').length,
  programsMaking: programs.filter((p) => p.status === 'making').length,
  planTotal: plan.length,
  planDone: planDone.length,
  planTodo: planTodo.length + planDoing.length,
  planWait: planWait.length,
};
