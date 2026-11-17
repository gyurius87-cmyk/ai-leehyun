"""로또 추천 번호 뽑기 (제로 → 노션 → 피클).

로또 추첨은 무작위라서 어떤 방법으로도 당첨 확률은 높아지지 않아요(1등 약 1/8,145,060).
이 스크립트는 '남들과 덜 겹치는 조합'을 뽑아요. 확률은 같지만, 당첨되면 나눠 가질 사람이 줄어요.
피하는 것: 생일 번호(1~31)만으로 된 조합, 3개 이상 연속, 같은 간격(등차), 끝자리 몰림,
           한 줄(10단위)에 몰림, 지난 회차 당첨번호 3개 이상 재사용, 다섯 줄끼리 3개 이상 겹침.
쓰는 법: python3 pick.py [--last 1,2,3,4,5,6] [--lines 5] [--json]
"""
import argparse, json, secrets
from collections import Counter

def ok(c, last):
    s = sorted(c)
    if sum(n > 31 for n in s) < 2: return False            # 생일 번호만 피하기
    run = 1
    for a, b in zip(s, s[1:]):
        run = run + 1 if b == a + 1 else 1
        if run >= 3: return False                           # 3연속 피하기
    d = {b - a for a, b in zip(s, s[1:])}
    if len(d) == 1: return False                            # 등차 피하기
    if max(Counter(n % 10 for n in s).values()) >= 3: return False   # 끝자리 몰림
    if max(Counter(n // 10 for n in s).values()) >= 4: return False  # 10단위 몰림
    odd = sum(n % 2 for n in s)
    if odd in (0, 1, 5, 6): return False                    # 홀짝 한쪽 몰림
    if not 100 <= sum(s) <= 180: return False
    if last and len(set(s) & set(last)) >= 3: return False
    if all(n % 7 == 0 for n in s) or all(n % 5 == 0 for n in s): return False
    return True

def pattern(hist, lines, last, taken):
    """재미용 '패턴' 줄: 최근 많이 나온 번호 2개 + 오래 안 나온 번호 2개 + 나머지 2개. 확률은 그대로예요."""
    rnd = secrets.SystemRandom()
    recent = hist[-10:]
    cnt = Counter(n for d in recent for n in d["nums"])
    hot = [n for n, _ in cnt.most_common(12)] or list(range(1, 46))
    seen_at = {}
    for i, d in enumerate(hist):
        for n in d["nums"]: seen_at[n] = i
    cold = sorted(range(1, 46), key=lambda n: seen_at.get(n, -1))[:15]
    out = []
    for _ in range(20000):
        if len(out) == lines: break
        c = set(rnd.sample(hot, min(2, len(hot)))) | set(rnd.sample(cold, 2))
        while len(c) < 6: c.add(rnd.randint(1, 45))
        c = sorted(c)
        if len(c) == 6 and ok(c, last) and all(len(set(c) & set(o)) <= 2 for o in out + taken):
            out.append(c)
    return out

def pick(lines=5, last=None):
    out = []
    while len(out) < lines:
        c = sorted(secrets.SystemRandom().sample(range(1, 46), 6))
        if ok(c, last) and all(len(set(c) & set(o)) <= 2 for o in out):
            out.append(c)
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--last", default="")
    ap.add_argument("--lines", type=int, default=5)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--pattern", type=int, default=0, help="그중 패턴 줄 수")
    ap.add_argument("--hist", default="public/programs/lotto/history.json")
    a = ap.parse_args()
    last = [int(x) for x in a.last.split(",") if x.strip()]
    hist = json.load(open(a.hist))["draws"] if a.hist else []
    if not last and hist: last = hist[-1]["nums"]
    res = pick(a.lines - a.pattern, last)
    if a.pattern: res += pattern(hist, a.pattern, last, res)
    if a.json: print(json.dumps(res))
    else:
        for i, c in enumerate(res): print("ABCDE"[i], " ".join(f"{n:02d}" for n in c))
