# -*- coding: utf-8 -*-
"""受講者用サイトを組み立てる。

使い方:  python build.py
  - ../../本番用ぷろえん.presentpack のノートから、チャットに送っていた文章を取り出す
  - content.py の定義に沿って ../site/ に HTML を書き出す
  - 演習の解答は answer_keys.json の鍵で暗号化して埋め込む（鍵は公開しない）
"""
import base64, gzip, html, json, os, re, secrets, struct, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', 'site')
PACK = os.path.join(HERE, '..', '..', '本番用ぷろえん.presentpack')
KEYS = os.path.join(HERE, 'answer_keys.json')
CONFIG = os.path.join(HERE, 'config.json')
ITER = 150000

sys.path.insert(0, HERE)
import content as C  # noqa: E402

cfg = json.load(open(CONFIG, encoding='utf-8'))
esc = html.escape


# ---- presentpack のノートを読む -------------------------------------------
def load_notes():
    raw = gzip.open(PACK).read()
    assert raw[:8] == b'PDFPRES2', 'presentpack の形式が想定と違います'
    n = struct.unpack('<I', raw[8:12])[0]
    meta = json.loads(raw[12:12 + n].decode('utf-8'))
    return meta['notes']['md']


def parse_items(md):
    items, chapter, section, pending, infence, buf = [], '', '', None, False, []
    for line in md.split('\n'):
        if line.startswith('```'):
            if not infence:
                infence, buf = True, []
            else:
                infence = False
                body = '\n'.join(buf).strip('\n')
                if pending is not None and body.strip() and not chapter.startswith('付録'):
                    items.append(dict(chapter=chapter, section=section, label=pending, body=body))
                pending = None
            continue
        if infence:
            buf.append(line); continue
        if line.startswith('# '):
            chapter = line[2:].split('（')[0].strip()
        elif line.startswith('### '):
            section = re.sub(r'\s*⏱.*', '', line[4:]).strip(); pending = None
        elif line.startswith('［チャット'):
            pending = re.sub(r'^［[^］]*］', '', line).strip()
    return items


ITEMS = parse_items(load_notes())


def find(sec, lab=''):
    for it in ITEMS:
        if sec in it['section'] and lab in it['label']:
            return it['body']
    raise KeyError(f'ノートが見つかりません: {sec} / {lab}')


def strip_header(body):
    """【P75 …】のような講師向けの前置き行を外す。"""
    first, _, rest = body.partition('\n')
    if first.startswith('【') and rest and re.match(r'【(P\d+|あとで|演習)', first):
        return rest
    return body


def resolve(ref):
    if isinstance(ref, tuple):
        return strip_header(find(*ref))
    return ref


# ---- 暗号化 ----------------------------------------------------------------
def load_keys():
    keys = json.load(open(KEYS, encoding='utf-8')) if os.path.exists(KEYS) else {}
    changed = False
    for ex in C.EXERCISES:
        if ex['id'] not in keys:
            keys[ex['id']] = secrets.token_urlsafe(18); changed = True
    if changed:
        json.dump(keys, open(KEYS, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return keys


def encrypt(text, passphrase):
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER)
    key = kdf.derive(passphrase.encode('utf-8'))
    ct = AESGCM(key).encrypt(iv, text.encode('utf-8'), None)
    b = lambda x: base64.b64encode(x).decode()
    return b(salt), b(iv), b(ct)


# ---- 部品 ------------------------------------------------------------------
KIND = {'prompt': ('プロンプト', 't-prompt'), 'task': ('課題', 't-task'), 'note': ('ポイント', 't-note')}


def box(text):
    return f'<div class="box"><pre>{esc(text)}</pre><button class="copy" type="button">コピー</button></div>'


def block(label, text, kind):
    name, cls = KIND[kind]
    return (f'<div class="card"><div class="meta"><span class="ttl">{esc(label)}</span>'
            f'<span class="tag {cls}">{name}</span></div>{box(text)}</div>')


NAV = [('index.html', 'ホーム'), ('prompts.html', 'プロンプト集'), ('exercises.html', '演習'),
       ('summary.html', '要点まとめ'), ('references.html', '参考サイト')]


def page(filename, title, body, desc=''):
    nav = ''.join(f'<a href="{h}"{" aria-current=page" if h == filename else ""}>{t}</a>' for h, t in NAV)
    api = f"https://api.github.com/repos/{cfg['owner']}/{cfg['repo']}/contents/release.json"
    doc = f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc or C.COURSE + ' 受講者用ページ')}">
<meta name="release-source" content="{api} release.json">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<header class="site-head"><div class="wrap">
<a class="brand" href="index.html">{esc(C.COURSE)}</a>
<nav class="nav">{nav}</nav>
</div></header>
<main><div class="wrap">
{body}
</div></main>
<footer class="foot">講師の画面と結果が違っても問題ありません。AIの答えは毎回少しずつ変わります。</footer>
<script src="assets/app.js"></script>
</body>
</html>
'''
    open(os.path.join(SITE, filename), 'w', encoding='utf-8', newline='\n').write(doc)


# ---- 各ページ --------------------------------------------------------------
def build_index():
    tiles = [
        ('prompts.html', 'プロンプト集', '講義中に使うプロンプト。「No.○○」を見つけて［コピー］'),
        ('exercises.html', '演習', '演習の課題とプロンプト。解答は講師の合図のあとで開きます'),
        ('summary.html', '要点まとめ', '章ごとの要点を1つのテキストに。一括コピー・保存できます'),
        ('references.html', '参考サイト', '復習や、もっと知りたいときのリンク集'),
    ]
    body = f'<h1>{esc(C.COURSE)}　受講者用ページ</h1>'
    body += '<p class="lead">講義で使うプロンプトや演習を、このページからコピーして使えます。</p>'
    body += '<div class="grid">' + ''.join(
        f'<a class="tile" href="{h}"><b>{t}</b><span>{d}</span></a>' for h, t, d in tiles) + '</div>'
    body += '''<h2>使い方</h2>
<ol class="steps">
<li>講師が「プロンプト集の No.○○」と言ったら、その番号の［コピー］を押します</li>
<li>お使いのAIチャット（ChatGPT／Copilot／Gemini／Claude、社内ツールなど）に貼り付けて実行します</li>
<li>演習の解答例は、講師の合図のあとで開けるようになります（ページを開いたままでOK）</li>
</ol>
<h2>研修中のルール</h2>
<ul class="steps">
<li>個人情報・機密情報は、AIに入力しない（本日は一律で）</li>
<li>AIの出力を、そのまま外部へ大々的に発信しない</li>
<li>実務では、会社が契約しているサービスと社内ルールの範囲で判断する</li>
</ul>'''
    page('index.html', C.COURSE + '　受講者用ページ', body)


def build_prompts():
    groups, no = {}, 0
    for it in ITEMS:
        sec = it['section']
        if any(s in sec for s in C.EXERCISE_SECTIONS) or it['chapter'] not in C.CHAPTER_SHORT:
            continue
        if any(s in it['body'] for s in C.SKIP_TEXT):
            continue
        first = it['body'].split('\n', 1)[0]
        force = any(s in sec for s in C.FORCE_PROMPT_SECTIONS)
        is_prompt = force or not first.startswith('【') or ('プロンプト' in it['label'] and '\n' in it['body'])
        if not is_prompt or 'http' in it['body']:
            continue
        no += 1
        m = re.match(r'(P\d+(?:〜P\d+)?)\s*', sec)
        pg = m.group(1) if m else ''
        title = re.sub(r'^\d+-\d+-\d+\.\s*', '', sec[m.end():] if m else sec)
        label = re.sub(r'（[^）]*）', '', it['label']).strip()
        label = re.sub(r'^[①-⑨]', '', label).strip()
        if pg and label.startswith(pg + 'の'):
            label = ''
        text = strip_header(it['body'])
        ch = C.CHAPTER_SHORT[it['chapter']]
        search = f'{no} {pg} {title} {label} {text}'.lower()
        card = (f'<section class="card" id="n{no}" data-filter-item data-no="{no}" data-ch="{esc(ch)}" '
                f'data-search="{esc(search)}"><div class="meta"><span class="no">No.{no:02d}</span>'
                + (f'<span class="pg">{pg}</span>' if pg else '') +
                f'<span class="ttl">{esc(title)}</span></div>'
                + (f'<div class="sub">{esc(label)}</div>' if label else '') + box(text) + '</section>')
        groups.setdefault(it['chapter'], []).append(card)
    chips = '<button class="chip" type="button" aria-pressed="true" data-ch="">すべて</button>' + ''.join(
        f'<button class="chip" type="button" aria-pressed="false" data-ch="{C.CHAPTER_SHORT[c]}">{C.CHAPTER_SHORT[c]}</button>'
        for c in groups)
    body = '<h1>プロンプト集</h1><p class="lead">講師が「No.○○」と言ったら、その番号の［コピー］を押して、お使いのAIに貼り付けてください。演習で使うものは<a href="exercises.html">演習ページ</a>にあります。</p>'
    body += ('<div class="toolbar"><input type="search" id="q" placeholder="番号やキーワードで検索（例: 12、メール）" aria-label="検索">'
             '<button class="btn" type="button" data-download=".card:not(.hidden) pre" data-filename="プロンプト集.txt">表示中をまとめて保存</button></div>'
             f'<div class="chips">{chips}</div>')
    for chap, cards in groups.items():
        body += f'<section data-filter-group><h2>{esc(chap)}</h2>{"".join(cards)}</section>'
    body += '<p id="empty" class="hidden">該当するものがありません。</p>'
    page('prompts.html', 'プロンプト集｜' + C.COURSE, body)
    return no


def build_exercises(keys):
    body = '<h1>演習</h1><p class="lead">課題を読んで、プロンプトをコピーして使ってください。🔒の解答・解説は、講師の合図のあとで開けるようになります（自動で開きます。ページを開いたままでOK）。</p>'
    def short(t):
        a, _, b = t.partition('　')
        return re.sub(r'（.*', '', b) if a == 'ワーク' else a
    toc = ''.join(f'<li><a href="#{ex["id"]}">{esc(short(ex["title"]))}</a></li>' for ex in C.EXERCISES)
    body += f'<ul class="toc">{toc}</ul>'
    chap = None
    for ex in C.EXERCISES:
        if ex['chapter'] != chap:
            chap = ex['chapter']; body += f'<h2>{chap}</h2>'
        h = f'<section class="card" id="{ex["id"]}"><div class="meta"><span class="ttl" style="font-size:17px">{esc(ex["title"])}</span>'
        h += (f'<span class="pg">{ex["page"]}</span>' if ex['page'] else '') + '</div>'
        h += f'<div class="goal">この演習で確かめること：{esc(ex["goal"])}'
        if ex['biz']:
            h += f'<small>業務でいうと：{esc(ex["biz"])}</small>'
        h += '</div><ol class="steps">' + ''.join(f'<li>{esc(s)}</li>' for s in ex['steps']) + '</ol>'
        h += ''.join(block(lbl, resolve(ref), kind) for lbl, ref, kind in ex['blocks'])
        lock = ex['lock']
        inner = ''.join(block(lbl, resolve(ref), kind) for lbl, ref, kind in lock['blocks'])
        salt, iv, ct = encrypt(inner, keys[ex['id']])
        h += (f'<details class="lock" data-id="{ex["id"]}" data-salt="{salt}" data-iv="{iv}" data-ct="{ct}" data-iter="{ITER}">'
              f'<summary><span class="lk-title">{esc(lock["title"])}</span>'
              f'<span class="lk-state">講師の合図のあとで開きます</span></summary><div class="lk-body"></div></details>')
        body += h + '</section>'
    page('exercises.html', '演習｜' + C.COURSE, body)


def build_summary():
    body = '<h1>要点まとめ</h1><p class="lead">章ごとの要点を、1つのテキストにまとめました。［コピー］で章ごと、下のボタンで全章まとめてコピー・保存できます。</p>'
    body += ('<div class="toolbar"><button class="btn primary" type="button" data-copy-all=".sum pre">全章をまとめてコピー</button>'
             '<button class="btn" type="button" data-download=".sum pre" data-filename="要点まとめ.txt">全章を.txtで保存</button></div>')
    body += '<ul class="toc">' + ''.join(f'<li><a href="#s{i}">{esc(t.split("　")[0])}</a></li>' for i, (t, _) in enumerate(C.SUMMARIES)) + '<li><a href="#extra">補足資料</a></li></ul>'
    for i, (t, text) in enumerate(C.SUMMARIES):
        body += f'<section class="card sum" id="s{i}"><div class="meta"><span class="ttl" style="font-size:17px">{esc(t)}</span></div>{box(text.strip())}</section>'
    body += '<h2 id="extra">補足資料</h2>'
    for t, text in C.EXTRAS:
        body += f'<section class="card"><div class="meta"><span class="ttl">{esc(t)}</span></div>{box(text.strip())}</section>'
    page('summary.html', '要点まとめ｜' + C.COURSE, body)


def build_references():
    body = '<h1>参考文献・参考サイト</h1><p class="lead">復習や、もっと知りたいときにどうぞ。リンク先の内容は各サイトの更新で変わることがあります。</p>'
    for group, links in C.REFERENCES:
        body += f'<h2>{esc(group)}</h2><ul class="ref">'
        body += ''.join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener">{esc(t)}</a><small>{esc(d)}</small></li>' for t, u, d in links)
        body += '</ul>'
    page('references.html', '参考サイト｜' + C.COURSE, body)


def main():
    os.makedirs(SITE, exist_ok=True)
    keys = load_keys()
    build_index()
    n = build_prompts()
    build_exercises(keys)
    build_summary()
    build_references()
    rel = os.path.join(SITE, 'release.json')
    if not os.path.exists(rel):
        json.dump({'open': {}}, open(rel, 'w', encoding='utf-8'))
    open(os.path.join(SITE, '.nojekyll'), 'w').close()
    json.dump({'owner': cfg['owner'], 'repo': cfg['repo'],
               'exercises': [{'id': ex['id'], 'title': ex['title']} for ex in C.EXERCISES]},
              open(os.path.join(HERE, 'panel_data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'OK: プロンプト集 {n}件 / 演習 {len(C.EXERCISES)}件 / 要点まとめ {len(C.SUMMARIES)}章')


if __name__ == '__main__':
    main()
