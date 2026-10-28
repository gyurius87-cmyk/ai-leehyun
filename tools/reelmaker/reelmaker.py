#!/usr/bin/env python3
"""SNS 글 → 세로 릴스 자동 제작.

script.json(대본) 하나를 받아서
  1) 일레븐랩스 TTS로 줄마다 내 목소리 나레이션
  2) 일레븐랩스 Music으로 배경음악
  3) KLIPY에서 줄마다 스티커
  4) ffmpeg로 배경·자막·스티커·소리를 합쳐 1080x1920 mp4
를 만든다. 키가 없으면 그 단계는 건너뛰고(무음·스티커 없음) 미리보기 영상을 만든다.

사용: python3 reelmaker.py script.json -o out.mp4
환경 변수: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, KLIPY_API_KEY
"""
import argparse, json, os, subprocess, sys, textwrap, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H, FPS = 1080, 1920, 30
HERE = Path(__file__).resolve().parent
FONT_DIR = HERE / 'fonts'
EL_BASE = 'https://api.elevenlabs.io'
EL_TTS_MODEL = 'eleven_multilingual_v2'
KLIPY_SEARCH = 'https://api.klipy.com/api/v1/{key}/stickers/search?q={q}&per_page=1&customer_id=reelmaker&locale=ko'


def log(*a):
    print('[reelmaker]', *a, file=sys.stderr, flush=True)


def run(cmd):
    subprocess.run(cmd, check=True)


def probe_dur(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


def http(url, data=None, headers=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def font(weight, size):
    p = FONT_DIR / f'Pretendard-{weight}.otf'
    if not p.exists():
        log('폰트가 없어요. setup.sh를 먼저 실행하세요.')
        sys.exit(1)
    return ImageFont.truetype(str(p), size)


# ---------- 1) 나레이션 ----------
def narrate(lines, work):
    key, voice = os.environ.get('ELEVENLABS_API_KEY'), os.environ.get('ELEVENLABS_VOICE_ID')
    outs = []
    for n, ln in enumerate(lines):
        p = work / f'tts_{n:02d}.mp3'
        if not p.exists() and key and voice:
            try:
                audio = http(f'{EL_BASE}/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
                             {'text': ln['text'], 'model_id': EL_TTS_MODEL,
                              'voice_settings': {'stability': 0.5, 'similarity_boost': 0.8}},
                             {'xi-api-key': key})
                p.write_bytes(audio)
            except Exception as e:
                log(f'TTS 실패({n}):', e)
        if p.exists():
            outs.append((p, probe_dur(p)))
        else:  # 키 없음: 글자 수로 길이만 잡은 무음
            d = max(1.8, len(ln['text']) * 0.14)
            run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-t', f'{d:.2f}', '-i', 'anullsrc=r=44100:cl=mono', str(p.with_suffix('.wav'))])
            outs.append((p.with_suffix('.wav'), d))
    if not (key and voice):
        log('일레븐랩스 키/목소리 ID가 없어 무음 나레이션으로 만들었어요.')
    return outs


# ---------- 2) 배경음악 ----------
def music(prompt, seconds, work):
    p = work / 'bgm.mp3'
    key = os.environ.get('ELEVENLABS_API_KEY')
    if p.exists():
        return p
    if not (key and prompt):
        log('배경음악 없이 진행해요.')
        return None
    try:
        audio = http(f'{EL_BASE}/v1/music', {'prompt': prompt, 'music_length_ms': int(seconds * 1000) + 2000},
                     {'xi-api-key': key}, timeout=300)
        p.write_bytes(audio)
        return p
    except Exception as e:
        log('배경음악 실패:', e)
        return None


# ---------- 3) 스티커 ----------
def _find_url(obj):
    """KLIPY 응답 구조가 바뀌어도 첫 번째 gif/webp/png 주소를 찾는다."""
    if isinstance(obj, str):
        return obj if obj.startswith('http') and obj.split('?')[0].endswith(('.gif', '.webp', '.png')) else None
    items = obj.items() if isinstance(obj, dict) else enumerate(obj) if isinstance(obj, list) else []
    for _, v in items:
        u = _find_url(v)
        if u:
            return u
    return None


def sticker(query, n, work):
    key = os.environ.get('KLIPY_API_KEY')
    if not (key and query):
        return None
    for ext in ('.gif', '.webp', '.png'):
        if (work / f'st_{n:02d}{ext}').exists():
            return work / f'st_{n:02d}{ext}'
    try:
        res = json.loads(http(KLIPY_SEARCH.format(key=key, q=urllib.parse.quote(query))))
        url = _find_url(res)
        if not url:
            log(f'스티커 없음: {query}')
            return None
        p = work / f'st_{n:02d}{Path(url.split("?")[0]).suffix}'
        p.write_bytes(urllib.request.urlopen(url, timeout=60).read())
        return p
    except Exception as e:
        log(f'스티커 실패({query}):', e)
        return None


# ---------- 4) 화면 ----------
def background_frame(src, n, work):
    """사진이면 1.4배 크기로 꽉 채운 이미지, 없으면 단색 그라데이션."""
    p = work / f'bg_{n:02d}.jpg'
    if src and Path(src).suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp'):
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        ImageOps.fit(im, (int(W * 1.4), int(H * 1.4)), Image.LANCZOS).save(p, quality=92)
    else:
        top, bot = (36, 39, 43), (70, 60, 30)
        g = Image.new('RGB', (1, 256))
        for y in range(256):
            t = y / 255
            g.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(top, bot)))
        g.resize((int(W * 1.4), int(H * 1.4))).save(p, quality=92)
    return p


def caption_png(text, title, n, work, has_sticker):
    o = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(o)
    if title:
        f = font('ExtraBold', 64)
        for k, l in enumerate(textwrap.wrap(title, 14)[:2]):
            d.text((W / 2, 260 + k * 84), l, font=f, fill='white', anchor='mm', stroke_width=6, stroke_fill='black')
    f = font('Bold', 72)
    lines = textwrap.wrap(text, 13)[:3]
    y0 = 1240 - (len(lines) - 1) * 46
    for k, l in enumerate(lines):
        d.text((W / 2, y0 + k * 92), l, font=f, fill='white', anchor='mm', stroke_width=7, stroke_fill='black')
    p = work / f'cap_{n:02d}.png'
    o.save(p)
    # 스티커는 자막 오른쪽 위에 놓는다
    widest = max(d.textlength(l, font=f) for l in lines) if lines else 0
    sx = int(min(W - 300, W / 2 + widest / 2 - 40)) if has_sticker else 0
    sy = int(y0 - 46 - 260)
    return p, (sx, sy)


def clip(n, ln, dur, bg_src, st, title, work):
    out = work / f'clip_{n:02d}.mp4'
    cap, (sx, sy) = caption_png(ln['text'], title, n, work, bool(st))
    frames = int(dur * FPS)
    inputs, fl = [], []
    if bg_src and Path(bg_src).suffix.lower() in ('.mp4', '.mov', '.m4v', '.webm'):
        inputs += ['-stream_loop', '-1', '-i', str(bg_src)]
        fl.append('[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[b]')
    else:
        bg = background_frame(bg_src, n, work)
        inputs += ['-i', str(bg)]
        z = f'1+0.08*on/{frames}' if n % 2 == 0 else f'1.08-0.08*on/{frames}'
        fl.append(f"[0:v]zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1080x1920:fps=30[b]")
    inputs += ['-i', str(cap)]
    fl.append('[b][1:v]overlay=0:0[c]')
    last = 'c'
    if st:
        inputs += (['-ignore_loop', '0'] if st.suffix == '.gif' else ['-loop', '1']) + ['-i', str(st)]
        fl.append('[2:v]scale=260:260:force_original_aspect_ratio=decrease[s];'
                  f'[c][s]overlay={sx}:{sy}:shortest=0:eof_action=repeat[d]')
        last = 'd'
    run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(fl), '-map', f'[{last}]',
         '-t', f'{dur:.3f}', '-r', str(FPS), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
         '-pix_fmt', 'yuv420p', str(out)])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('script')
    ap.add_argument('-o', '--out', default='reel.mp4')
    a = ap.parse_args()
    spec = json.loads(Path(a.script).read_text(encoding='utf-8'))
    base = Path(a.script).resolve().parent
    work = Path(a.out).resolve().with_suffix('.work')
    work.mkdir(exist_ok=True)
    lines = spec['lines']
    bgs = [str(base / b) for b in spec.get('backgrounds', [])]

    voices = narrate(lines, work)
    pad = 0.25
    durs = [d + pad for _, d in voices]
    total = sum(durs)
    bgm = music(spec.get('bgm_prompt'), total, work)

    clips = []
    for n, ln in enumerate(lines):
        st = sticker(ln.get('sticker'), n, work)
        bg = bgs[n % len(bgs)] if bgs else None
        clips.append(clip(n, ln, durs[n], bg, st, spec.get('title') if n == 0 else None, work))
        log(f'{n + 1}/{len(lines)} 줄 완료')

    lst = work / 'clips.txt'
    lst.write_text(''.join(f"file '{c}'\n" for c in clips))
    video = work / 'video.mp4'
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(video)])

    # 나레이션을 줄 길이에 맞춰 이어 붙이고, 배경음악은 목소리 나올 때 자동으로 줄인다
    vin, vf = [], []
    for n, (p, d) in enumerate(voices):
        vin += ['-i', str(p)]
        vf.append(f'[{n}:a]aresample=44100,aformat=channel_layouts=stereo,apad=pad_dur={durs[n] - d:.3f}[v{n}]')
    vf.append(''.join(f'[v{n}]' for n in range(len(voices))) + f'concat=n={len(voices)}:v=0:a=1,loudnorm=I=-15:TP=-1.5[nar]')
    narr = work / 'narration.wav'
    run(['ffmpeg', '-y', '-v', 'error', *vin, '-filter_complex', ';'.join(vf), '-map', '[nar]', str(narr)])

    if bgm:
        mix = (f"[1:a]aresample=44100,aformat=channel_layouts=stereo,asplit[n1][n2];"
               f"[2:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.35,afade=t=out:st={total - 1.5:.2f}:d=1.5[m];"
               f"[m][n1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[md];"
               f"[n2][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]")
        ain = ['-i', str(narr), '-stream_loop', '-1', '-i', str(bgm)]
    else:
        mix = '[1:a]anull[a]'
        ain = ['-i', str(narr)]
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), *ain, '-filter_complex', mix, '-map', '0:v', '-map', '[a]',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', f'{total:.3f}', '-movflags', '+faststart', str(a.out)])
    log(f'완성: {a.out} ({total:.1f}초)')


if __name__ == '__main__':
    main()
