#!/usr/bin/env python3
"""
Chuyển 1 file "ĐÁP ÁN" (docx) của đề thi thử ĐGNL thành dữ liệu câu hỏi cho web.

Ý tưởng:
- Duyệt tuần tự các đoạn (paragraph, kể cả trong bảng; bảng xuất ra HTML table).
- "Khối lựa chọn" = các đoạn bắt đầu bằng A./B./C./D. (có thể nhiều phương án trên
  1 dòng, cách nhau tab). Mỗi khối lựa chọn = 1 câu hỏi.
- Đáp án đúng: ưu tiên dòng chữ "Câu N chọn X" / "Đáp án: X" / "Chọn X" ngay sau;
  nếu không có thì lấy phương án DUY NHẤT được tô màu nền (highlight) / tô màu chữ /
  in đậm khác các phương án còn lại.
- Lời giải: các đoạn ngay sau khối lựa chọn KHÔNG có trong file đề học sinh (HS).
- Ngữ cảnh dùng chung: đoạn mở đầu dạng "... từ câu X đến Y", "Câu X-Y:", "Read the
  passage ..." → gom các câu tiếp theo thành 1 cụm.
- Ảnh (png/jpeg/svg/wmf) được tách ra file; công thức OMML lấy từ pandoc theo thứ tự.
"""
import sys, re, os, json, hashlib, zipfile, subprocess, difflib, html as H
import docx
from docx.text.paragraph import Paragraph

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
M = '{http://schemas.openxmlformats.org/officeDocument/2006/math}'
A_ = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
R_ = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
V_ = '{urn:schemas-microsoft-com:vml}'

LETTER_RE = re.compile(r'(?:(?<=^)|(?<=[\s\t]))([A-D])\s*[.)]\s*')


def norm(s):
    s = re.sub(r'\s+', ' ', s or '').strip().lower()
    return re.sub(r'^(câu\s*\d+\s*[.:]?\s*|\d+\s*[.:]\s*)', '', s)


def h_px_ok(w):
    return 2 < w < 2000


def drawing_size(node):
    e = node.find('.//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent')
    if e is not None:
        try: return int(e.get('cx')) / 9525, int(e.get('cy')) / 9525
        except Exception: pass
    sh = node.find('.//' + V_ + 'shape')
    if sh is not None and sh.get('style'):
        st = dict(x.split(':', 1) for x in sh.get('style').split(';') if ':' in x)
        def px(v):
            v = v.strip()
            for u, f in (('pt', 4 / 3), ('in', 96), ('px', 1), ('cm', 37.8), ('mm', 3.78)):
                if v.endswith(u): return float(v[:-len(u)]) * f
            return None
        try: return px(st.get('width', '')), px(st.get('height', ''))
        except Exception: pass
    return None, None


class Ctx:
    def __init__(self, path, media_dir, media_url):
        self.doc = docx.Document(path)
        self.path = path
        self.media_dir, self.media_url = media_dir, media_url
        os.makedirs(media_dir, exist_ok=True)
        self.math = self._pandoc_math(path)
        self.math_i = 0
        self.num_fmt = self._numbering()
        self.counters = {}
        self.media_cache = {}
        self.wmf_jobs = []

    # ---- công thức: lấy TeX từ pandoc theo đúng thứ tự xuất hiện ----
    def _pandoc_math(self, path):
        try:
            js = subprocess.run(['pandoc', path, '-t', 'json'], capture_output=True, check=True).stdout
        except Exception:
            return []
        out = []
        def walk(n):
            if isinstance(n, dict):
                if n.get('t') == 'Math':
                    out.append((n['c'][0]['t'], n['c'][1]))
                    return
                for v in n.values(): walk(v)
            elif isinstance(n, list):
                for v in n: walk(v)
        walk(json.loads(js)['blocks'])
        return out

    def next_math(self, is_para):
        if self.math_i < len(self.math):
            t, tex = self.math[self.math_i]; self.math_i += 1
            return ('\\[' + tex + '\\]') if (t == 'DisplayMath' and is_para) else ('\\(' + tex + '\\)')
        return '[công thức]'

    # ---- đánh số tự động (Word numbering) ----
    def _numbering(self):
        fm = {}
        try:
            numbering = self.doc.part.numbering_part.element
        except Exception:
            return fm
        absn = {}
        for a in numbering.findall(W + 'abstractNum'):
            aid = a.get(W + 'abstractNumId')
            lv = {}
            for l in a.findall(W + 'lvl'):
                f = l.find(W + 'numFmt'); t = l.find(W + 'lvlText'); s = l.find(W + 'start')
                lv[l.get(W + 'ilvl')] = (f.get(W + 'val') if f is not None else '', t.get(W + 'val') if t is not None else '', int(s.get(W + 'val')) if s is not None else 1)
            absn[aid] = lv
        for n in numbering.findall(W + 'num'):
            a = n.find(W + 'abstractNumId')
            if a is not None: fm[n.get(W + 'numId')] = absn.get(a.get(W + 'val'), {})
        return fm

    def num_prefix(self, p):
        """Trả về chữ đánh số tự động của đoạn (VD 'A.', 'Câu 5.', '12.') hoặc ''."""
        pPr = p.find(W + 'pPr')
        numPr = pPr.find(W + 'numPr') if pPr is not None else None
        if numPr is None:
            return ''
        nid = numPr.find(W + 'numId'); il = numPr.find(W + 'ilvl')
        nid = nid.get(W + 'val') if nid is not None else None
        il = il.get(W + 'val') if il is not None else '0'
        if not nid or nid == '0':
            return ''
        fmt, txt, start = self.num_fmt.get(nid, {}).get(il, ('', '', 1))
        key = (nid, il)
        self.counters[key] = self.counters.get(key, start - 1) + 1
        for k in list(self.counters):  # cấp con reset khi cấp cha tăng
            if k[0] == nid and int(k[1]) > int(il): del self.counters[k]
        v = self.counters[key]
        if fmt in ('upperLetter',): s = chr(64 + ((v - 1) % 26) + 1)
        elif fmt in ('lowerLetter',): s = chr(96 + ((v - 1) % 26) + 1)
        elif fmt in ('decimal', 'decimalZero'): s = str(v)
        elif fmt == 'bullet' or fmt == 'none' or not fmt: return '' if fmt != 'bullet' else '•'
        else: s = str(v)
        return re.sub(r'%\d', s, txt or (s + '.'))

    # ---- ảnh ----
    def mathtype_tex(self, rid):
        """Mã TeX gốc lưu trong công thức MathType (nếu có), không có thì None."""
        try:
            import olefile, io
            blob = self.doc.part.related_parts[rid].blob
            o = olefile.OleFileIO(io.BytesIO(blob))
            if not o.exists('Equation Native'): return None
            d = o.openstream('Equation Native').read()
            m = re.search(rb'TeX Input Language\x00([^\x00]+)\x00', d)
            if not m: return None
            try: return m.group(1).decode('utf-8').strip()
            except UnicodeDecodeError: return m.group(1).decode('cp1252').strip()
        except Exception:
            return None

    def image(self, rid, w=None, hh=None):
        if not rid: return ''
        try:
            part = self.doc.part.related_parts[rid]
        except KeyError:
            return ''
        blob = part.blob
        ext = os.path.splitext(part.partname)[1].lower().lstrip('.') or 'png'
        h = hashlib.sha1(blob).hexdigest()[:16]
        if w and (h, round(w)) in self.media_cache: return self.media_cache[(h, round(w))]
        if not w and h in self.media_cache: return self.media_cache[h]
        if ext in ('wmf', 'emf'):
            src = os.path.join(self.media_dir, h + '.' + ext)
            open(src, 'wb').write(blob)
            self.wmf_jobs.append(src)
            name = h + '.png'
        else:
            if ext == 'jpeg': ext = 'jpg'
            name = h + '.' + ext
            open(os.path.join(self.media_dir, name), 'wb').write(blob)
        tag = f'<img class="anh-de" src="{self.media_url}/{name}" alt=""'
        key = h
        if w and h_px_ok(w):
            st = f'width:{w:.0f}px'
            if hh: st += f';height:{hh:.0f}px'
            if w < 260 and (hh or 0) < 60: st += ';vertical-align:middle'
            tag += f' style="{st}"'
            key = (h, round(w))
        tag += '>'
        self.media_cache[key] = tag
        return tag


def run_fmt(r):
    rp = r.find(W + 'rPr')
    def on(tag):
        if rp is None: return False
        e = rp.find(W + tag)
        if e is None: return False
        v = e.get(W + 'val')
        return v not in ('0', 'false', 'none')
    hl = False; color = None; shd = None
    if rp is not None:
        e = rp.find(W + 'highlight')
        hl = e is not None and e.get(W + 'val') not in (None, 'none')
        c = rp.find(W + 'color')
        if c is not None and c.get(W + 'val') not in (None, 'auto', '000000'): color = c.get(W + 'val').upper()
        s = rp.find(W + 'shd')
        if s is not None and s.get(W + 'fill') not in (None, 'auto', 'FFFFFF', 'ffffff'): shd = s.get(W + 'fill')
    va = rp.find(W + 'vertAlign').get(W + 'val') if rp is not None and rp.find(W + 'vertAlign') is not None else None
    return dict(b=on('b'), i=on('i'), u=on('u'), hl=hl or bool(shd), color=color, va=va)

# ---------- Công thức: TeX -> HTML chữ thường (để cùng phông với đề) ----------
_GREEK = {'alpha':'α','beta':'β','gamma':'γ','delta':'δ','epsilon':'ε','varepsilon':'ε','theta':'θ','lambda':'λ','mu':'μ','nu':'ν',
          'pi':'π','rho':'ρ','sigma':'σ','tau':'τ','phi':'φ','varphi':'φ','omega':'ω','eta':'η','xi':'ξ','zeta':'ζ','kappa':'κ','chi':'χ','psi':'ψ',
          'Delta':'Δ','Omega':'Ω','Sigma':'Σ','Phi':'Φ','Lambda':'Λ','Gamma':'Γ','Pi':'Π','Theta':'Θ'}
_SYM = {'cdot':'·','times':'×','approx':'≈','le':'≤','leq':'≤','ge':'≥','geq':'≥','ne':'≠','neq':'≠','pm':'±','to':'→','rightarrow':'→',
        'Rightarrow':'⇒','leftarrow':'←','leftrightarrow':'↔','rightleftharpoons':'⇌','longrightarrow':'⟶','circ':'°','degree':'°','infty':'∞',
        'downarrow':'↓','uparrow':'↑','div':'÷','prime':'′','ldots':'…','dots':'…','%':'%',',':'\u2009',';':' ',':':' ','!':'',' ':' ',
        'quad':' ','qquad':'  ','{':'{','}':'}','$':'$','#':'#','&':'&','_':'_','sim':'~','propto':'∝','in':'∈','perp':'⊥','parallel':'∥',
        'angle':'∠','triangle':'△','Delta':'Δ','cdots':'⋯','lt':'<','gt':'>','bullet':'•','star':'*','ell':'ℓ','hbar':'ℏ'}
_KHOI_PHUC_TAP = re.compile(r'\\(frac|dfrac|tfrac|sqrt|sum|int|lim|prod|overline|overrightarrow|vec|hat|bar|begin|matrix|array|binom|underbrace|overset|underset|stackrel|xrightarrow|log|ln|sin|cos|tan)\b')

def _doc_nhom(t, i):
    """Đọc 1 nhóm sau _ hoặc ^ : {...} hoặc 1 ký tự / 1 lệnh. Trả về (chuỗi, vị trí mới)."""
    if i < len(t) and t[i] == '{':
        sau, j = 1, i + 1
        while j < len(t) and sau:
            if t[j] == '{' and t[j-1] != '\\': sau += 1
            elif t[j] == '}' and t[j-1] != '\\': sau -= 1
            j += 1
        return t[i+1:j-1], j
    if i < len(t) and t[i] == '\\':
        m = re.match(r'\\([A-Za-z]+|.)', t[i:])
        return m.group(0), i + len(m.group(0))
    return (t[i] if i < len(t) else ''), i + 1

def tex_sang_html(tex, long=False):
    """Đổi TeX đơn giản (chỉ số, số mũ, đơn vị, chữ Hy Lạp, ký hiệu) sang HTML thường.
    Trả về None nếu công thức phức tạp (phân số, căn...) — khi đó dùng MathJax."""
    t = (tex or '').strip()
    if not t or _KHOI_PHUC_TAP.search(t): return None
    t = re.sub(r'\s,\s', r'\\,', t)        # "2650 , kg" (gõ nhầm dấu phẩy làm khoảng cách)
    out = []; i = 0
    while i < len(t):
        c = t[i]
        if c == '\\':
            m = re.match(r'\\([A-Za-z]+|.)', t[i:]); cmd = m.group(1); i += len(m.group(0))
            if cmd in ('text', 'mathrm', 'textrm', 'mathbf', 'textbf', 'mathit', 'textit', 'operatorname', 'mbox', 'rm', 'mathsf'):
                if cmd == 'rm': continue
                while i < len(t) and t[i] == ' ': i += 1
                g, i = _doc_nhom(t, i)
                h = tex_sang_html(g) if cmd not in ('text', 'mbox', 'textrm') else H.escape(g)
                if h is None: return None
                out.append(f'<b>{h}</b>' if cmd in ('mathbf', 'textbf') else h)
            elif cmd in ('left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'limits', 'nolimits'):
                if i < len(t) and t[i] == '.': i += 1
                continue
            elif cmd in _GREEK: out.append(_GREEK[cmd])
            elif cmd in _SYM: out.append(_SYM[cmd])
            else: return None
        elif c in '_^':
            g, i = _doc_nhom(t, i + 1)
            if c == '^' and g.strip() in ('\\circ', 'o', '\\degree'): out.append('°'); continue
            h = tex_sang_html(g, long=True)
            if h is None: return None
            out.append(f'<sub>{h}</sub>' if c == '_' else f'<sup>{h}</sup>')
        elif c in '{}': i += 1
        elif c == '-': out.append('−' if long or not out or out[-1].strip() in ('', '(', '=') else ' − '); i += 1
        elif c == '~': out.append(' '); i += 1
        elif c in ' \t\n': i += 1          # TeX bỏ qua khoảng trắng trong công thức
        elif c in '=<>': out.append(' ' + H.escape(c) + ' '); i += 1
        elif c == '+' and not long: out.append(' + '); i += 1
        else: out.append(H.escape(c)); i += 1
    s = ''.join(out)
    s = re.sub(r'\s*([≈≤≥→⇒±×⇌])\s*', r' \1 ', s)
    if not long: s = re.sub(r'(?<=[0-9])\((?=[A-Za-zμΩ°%])', ' (', s)   # "81,7 (kJ)" 
    return re.sub(r'\s+', ' ', s).strip()

def cong_thuc_html(tex, block=False):
    h = None if block else tex_sang_html(tex)
    if h is not None: return f'<span class="ct">{h}</span>'
    return H.escape(('\\[' + tex + '\\]') if block else ('\\(' + tex + '\\)'))

_O_ = '{urn:schemas-microsoft-com:office:office}'

def _ct_tu_bocngoac(tex):
    # next_math trả về '\(..\)' hoặc '\[..\]'
    if tex.startswith('\\(') and tex.endswith('\\)'): return cong_thuc_html(tex[2:-2])
    if tex.startswith('\\[') and tex.endswith('\\]'): return cong_thuc_html(tex[2:-2], block=True)
    return H.escape(tex)


def para_segments(ctx, p):
    """Danh sách (html, text, fmt) cho từng run/hình/công thức trong đoạn."""
    segs = []
    is_math_para = p.find(M + 'oMathPara') is not None
    def walk(node):
        for ch in node:
            tag = ch.tag
            if tag == W + 'r':
                f = run_fmt(ch)
                for sub in ch:
                    if sub.tag == W + 't':
                        t = re.sub('[\ufeff\u200b\u200c\u200d\u2060]', '', sub.text or '')
                        segs.append((H.escape(t), t, f))
                    elif sub.tag == W + 'tab':
                        segs.append(('\t', '\t', f))
                    elif sub.tag in (W + 'br', W + 'cr'):
                        segs.append(('<br>', '\n', f))
                    elif sub.tag == W + 'drawing':
                        b = sub.find('.//' + A_ + 'blip')
                        img = ctx.image(b.get(R_ + 'embed') if b is not None else None, *drawing_size(sub))
                        if img: segs.append((img, ' ', dict(f, img=True)))
                    elif sub.tag in (W + 'object', W + 'pict'):
                        ole = sub.find('.//' + _O_ + 'OLEObject')
                        if ole is not None and (ole.get('ProgID') or '').startswith('Equation.DSMT'):
                            tex = ctx.mathtype_tex(ole.get(R_ + 'id'))
                            if tex:
                                segs.append((cong_thuc_html(tex), tex, dict(f, b=False, i=False, u=False)))
                                continue
                        im = sub.find('.//' + V_ + 'imagedata')
                        img = ctx.image(im.get(R_ + 'id') if im is not None else None, *drawing_size(sub))
                        if img: segs.append((img, ' ', dict(f, img=True)))
                    elif sub.tag == W + 'sym':
                        segs.append(('', '', f))
            elif tag in (M + 'oMath',):
                tex = ctx.next_math(False)
                segs.append((_ct_tu_bocngoac(tex), tex, dict(b=False, i=False, u=False, hl=False, color=None, va=None)))
            elif tag == M + 'oMathPara':
                for om in ch.iter(M + 'oMath'):
                    tex = ctx.next_math(True)
                    segs.append((_ct_tu_bocngoac(tex), tex, dict(b=False, i=False, u=False, hl=False, color=None, va=None)))
            elif tag in (W + 'hyperlink', W + 'smartTag', W + 'ins', W + 'fldSimple', W + 'sdt', W + 'sdtContent') or tag.endswith('}customXml'):
                walk(ch)
    walk(p)
    return segs


def segs_html(segs, keep_fmt=True):
    out = []
    for h, t, f in segs:
        if not h: continue
        if h.startswith('<img') or h == '<br>' or h == '\t':
            out.append(' ' if h == '\t' else h); continue
        if f.get('va') == 'superscript': h = f'<sup>{h}</sup>'
        elif f.get('va') == 'subscript': h = f'<sub>{h}</sub>'
        if keep_fmt:
            if f.get('u'): h = f'<u>{h}</u>'
            if f.get('i'): h = f'<i>{h}</i>'
            if f.get('b'): h = f'<b>{h}</b>'
        out.append(h)
    s = re.sub('[\uf000-\uf0ff]', '•', ''.join(out))
    for t in ('b', 'i', 'u', 'sup', 'sub'):
        s = s.replace(f'</{t}><{t}>', '')
    return re.sub(r'\s+', ' ', s).strip()


class Item:
    """1 phần tử trong dòng chảy văn bản: đoạn văn thường hoặc bảng."""
    def __init__(self, kind, text, html, segs=None, prefix=''):
        self.kind, self.text, self.html, self.segs, self.prefix = kind, text, html, segs or [], prefix


def iter_items(ctx):
    body = ctx.doc.element.body
    for el in body.iterchildren():
        if el.tag == W + 'p':
            pre = ctx.num_prefix(el)
            segs = para_segments(ctx, el)
            if pre and pre != '•':
                segs = [(H.escape(pre + ' '), pre + ' ', dict(b=False, i=False, u=False, hl=False, color=None, va=None, pre=True))] + segs
            # Đoạn có xuống dòng mềm mà dòng sau là phương án ("…đúng?<br>A. …") → tách thành nhiều đoạn
            parts, cur = [], []
            for k, sg in enumerate(segs):
                if sg[0] == '<br>':
                    rest = ''.join(t for _, t, _ in segs[k + 1:]).lstrip()
                    if re.match(r'^[A-D]\s*[.)]', rest) and ''.join(t for _, t, _ in cur).strip():
                        parts.append(cur); cur = []; continue
                cur.append(sg)
            parts.append(cur)
            for k, sg in enumerate(parts):
                text = ''.join(t for _, t, _ in sg)
                yield Item('p', text, segs_html(sg), sg, pre if k == 0 else '')
        elif el.tag == W + 'tbl':
            rows = []
            txt = []
            for tr in el.iter(W + 'tr'):
                cells = []
                for tc in tr.findall(W + 'tc'):
                    ps = []
                    for p in tc.iter(W + 'p'):
                        sg = para_segments(ctx, p)
                        ps.append(segs_html(sg)); txt.append(''.join(t for _, t, _ in sg))
                    span = tc.find(W + 'tcPr/' + W + 'gridSpan')
                    cs = f' colspan="{span.get(W + "val")}"' if span is not None else ''
                    cells.append(f'<td{cs}>' + '<br>'.join(x for x in ps if x) + '</td>')
                rows.append('<tr>' + ''.join(cells) + '</tr>')
            yield Item('tbl', ' '.join(txt), '<table class="bang-de">' + ''.join(rows) + '</table>')


# ---------- phân tích khối lựa chọn ----------
def split_choices(item):
    """Nếu đoạn là dòng phương án → list[(letter, segs)] ; ngược lại None."""
    if item.kind != 'p': return None
    text = item.text
    if not re.match(r'^\s*[A-D]\s*[.)]', text): return None
    # vị trí ký tự → segment
    chars = []
    for si, (h, t, f) in enumerate(item.segs):
        for c in t: chars.append((c, si))
    full = ''.join(c for c, _ in chars)
    marks = [m for m in re.finditer(r'(?:^|(?<=[\s\t]))([A-D])\s*[.)](?=\s|\S)', full)]
    if re.match(r'^\s*A\s*[.)]', full):
        # nhãn thiếu dấu chấm nhưng đứng sau tab ("A. …⇥⇥B (2), (3)")
        marks += [m for m in re.finditer(r'(?<=\t)([A-D])(?=\s+\S)', full)]
        marks.sort(key=lambda m: m.start())
    # chỉ nhận các nhãn tăng dần liên tiếp A,B,C,D
    good = []
    for m in marks:
        if not good:
            if full[:m.start()].strip() == '': good.append(m)
        elif m.group(1) == chr(ord(good[-1].group(1)) + 1):
            good.append(m)
        elif m.group(1) not in [g.group(1) for g in good] and m.group(1) > good[-1].group(1) \
                and re.search(r'\t\s*$', full[:m.start()]):
            # nhảy cóc (A ... C) chỉ chấp nhận khi ngăn cách bằng tab — bố cục 2 cột
            good.append(m)
    if not good: return None
    out = []
    for k, m in enumerate(good):
        a = m.end(); b = good[k + 1].start() if k + 1 < len(good) else len(full)
        lab_span = (m.start(), m.end())
        # gom segs con theo ký tự
        seg_parts = []
        cur = None
        da_them = set()
        for idx in range(a, b):
            c, si = chars[idx]
            h, t, f = item.segs[si]
            # ảnh / công thức: giữ nguyên cả khối HTML, chỉ thêm 1 lần
            if h.startswith('<img') or h.startswith('<span class="ct">') or h.startswith('\\(') or h.startswith('\\['):
                if si not in da_them:
                    seg_parts.append((h, t, f)); da_them.add(si)
                cur = None
                continue
            if cur is not None and cur[2] is f:
                cur[1] += c
            else:
                cur = [None, c, f]; seg_parts.append(cur)
        segs = [(H.escape(x[1]) if x[0] is None else x[0], x[1], x[2]) if isinstance(x, list) else x for x in seg_parts]
        lab_fmt = [item.segs[chars[i][1]][2] for i in range(*lab_span) if chars[i][0].strip()]
        out.append((m.group(1), segs, lab_fmt))
    return out


def option_features(segs, lab_fmt):
    def ratio(key):
        tot = sum(len(t.strip()) for _, t, f in segs) or 0
        on = sum(len(t.strip()) for _, t, f in segs if f.get(key))
        lab = any(f.get(key) for f in lab_fmt)
        return (on / tot if tot else 0), lab
    hl = ratio('hl'); b = ratio('b'); u = ratio('u')
    colors = set(f.get('color') for _, t, f in segs if t.strip() and f.get('color')) | set(f.get('color') for f in lab_fmt if f.get('color'))
    return dict(hl=hl[0] > 0.5 or hl[1], b=b[0] > 0.6, u=u[0] > 0.6, col=frozenset(colors))


def pick_marked(opts):
    feats = [option_features(s, l) for _, s, l in opts]
    for key in ('hl',):
        on = [i for i, f in enumerate(feats) if f[key]]
        if len(on) == 1: return on[0], key
    # màu chữ khác biệt
    cols = [f['col'] for f in feats]
    for i, c in enumerate(cols):
        if c and all(c != cols[j] for j in range(len(cols)) if j != i) and sum(1 for x in cols if x == c) == 1 and len(set(cols)) == 2:
            return i, 'color'
    for key in ('b', 'u'):
        on = [i for i, f in enumerate(feats) if f[key]]
        if len(on) == 1: return on[0], key
    return None, None


KEY_RE = [
    re.compile(r'^\s*(?:câu\s*\d+\s*[.:]?\s*)?(?:chọn|ch[ọo]n đáp án|đáp án(?: đúng)?(?: là)?|đa)\s*[:.]?\s*([A-D])\b', re.I),
    re.compile(r'^\s*câu\s*\d+\s*[:.]?\s*(?:chọn|đáp án)\s*(?:đáp án)?\s*[:.]?\s*([A-D])\b', re.I),
    re.compile(r'\b(?:chọn|đáp án)\s*(?:đáp án)?\s*[:.]?\s*([A-D])\s*[.:]?\s*$', re.I),
    re.compile(r'^\s*(?:HD|Hướng dẫn)\s*[:.]?\s*chọn\s*([A-D])\b', re.I),
    # "Hướng dẫn: Câu 53. Chọn D." / "Hướng dẫn. Đáp án câu 109: Chọn D." / "Hướng dẫn. Đáp án: B. Bắc…"
    re.compile(r'^.{0,40}?(?<!\w)(?:chọn|đáp án)(?:\s*câu\s*\d+)?\s*[:.]?\s*(?:chọn\s*)?(?:đáp án\s*)?([A-D])(?=\s*[.:),(]|\s*$|\s+(?:là|đúng)\b|\s+(?-i:[A-ZĐ(])|\n)', re.I),
    re.compile(r'^.{0,25}?câu\s*\d+\s*[:.]\s*([A-D])(?=\s*[.:),(]|\s*$|\s+(?-i:[A-ZĐ(]))', re.I),
]


def explicit_key_any(items):
    for it in items:
        k = explicit_key(it.text)
        if k: return k
    return '?'


def explicit_key(text):
    text = re.sub(r'^\s*(?:\\\(.*?\\\)|[→⇒=>\-]+)\s*', '', text or '')
    for r in KEY_RE:
        m = r.search(text.strip())
        if m: return m.group(1).upper()
    return None


GROUP_RE = [
    re.compile(r'(?:từ|các)\s*câu\s*(?:hỏi\s*)?(?:từ\s*)?(?:câu\s*)?(\d+)\s*(?:đến|tới|-|–|—)\s*(?:câu\s*)?(\d+)', re.I),
    re.compile(r'câu\s*(?:hỏi\s*)?(\d+)\s*(?:-|–|—|đến|tới)\s*(?:câu\s*)?(\d+)', re.I),
    re.compile(r'questions?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)', re.I),
    re.compile(r'câu\s*hỏi\s*(?:từ\s*)?(?:câu\s*)?(\d+)\s*(?:đến|tới|-|–|—)\s*(?:câu\s*)?(\d+)', re.I),
    re.compile(r'^\s*\(?(\d+)\s*(?:-|–|—)\s*(\d+)\)?\s*[:.]', re.I),
]


def group_range(text):
    for r in GROUP_RE:
        m = r.search(text)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if 0 < b - a < 12: return a, b
    return None


SECTION_RE = [
    ('tv', re.compile(r'^\s*(?:1\.1\.?\s*)?TIẾNG VIỆT\s*$|^\s*1\.1\.?\s*TIẾNG VIỆT', re.I)),
    ('anh', re.compile(r'^\s*(?:1\.2\.?\s*)?TIẾNG ANH\s*$|^\s*1\.2\.?\s*TIẾNG ANH', re.I)),
    ('toan', re.compile(r'^\s*PHẦN\s*2\s*[:.]?\s*TOÁN', re.I)),
    ('logic', re.compile(r'^\s*3\.1\.?\s*LOGIC', re.I)),
    ('kh', re.compile(r'^\s*(?:3\.2\.?\s*)?SUY LUẬN KHOA HỌC', re.I)),
]


def is_heading_junk(text):
    t = text.strip()
    return (not t) or bool(re.match(r'^(PHẦN\s*\d|\d\.\d\.?\s*[A-ZÀ-Ỹ ]+$|TIẾNG VIỆT$|TIẾNG ANH$|SUY LUẬN KHOA HỌC$|ĐỀ THI THỬ ĐGNL\s*\d*$|MÔN\s+[A-ZÀ-Ỹ]+\s*$)', t, re.I))


def parse(da_path, hs_paths, media_dir, media_url):
    ctx = Ctx(da_path, media_dir, media_url)
    items = list(iter_items(ctx))
    hs_set = set(); hs_list = []
    for hp in hs_paths:
        try:
            hc = Ctx(hp, '/tmp/_hsmedia', 'x')
            for it in iter_items(hc):
                n = norm(it.text)
                if len(n) > 3: hs_set.add(n); hs_list.append(n)
        except Exception as e:
            print('  ! không đọc được HS', hp, e, file=sys.stderr)
    hs_prefix = {}
    for n in hs_list: hs_prefix.setdefault(n[:25], []).append(n)

    def in_hs(text):
        n = norm(text)
        if len(n) <= 3: return True
        if n in hs_set: return True
        for c in hs_prefix.get(n[:25], []):
            if difflib.SequenceMatcher(None, n, c).quick_ratio() > 0.85 and difflib.SequenceMatcher(None, n, c).ratio() > 0.85: return True
        return False

    # Chia item thành: section headings, choice blocks, các đoạn khác
    questions = []           # mỗi câu: dict(section, pre=[items trước], opts, after=[items sau])
    section = None
    pending = []             # items tích luỹ trước câu kế tiếp
    i = 0
    last_q = None
    in_explain = False
    while i < len(items):
        it = items[i]
        txt = it.text.strip()
        sec_hit = None
        for name, rx in SECTION_RE:
            if it.kind == 'p' and rx.search(txt): sec_hit = name; break
        if sec_hit:
            section = sec_hit; in_explain = False; pending = []
            i += 1; continue
        ch = split_choices(it)
        if ch is not None and in_explain and last_q is not None and hs_set and not in_hs(it.text):
            last_q['after'].append(it); i += 1; continue
        if ch is not None:
            opts = [list(o) for o in ch]
            j = i + 1
            cont = 0
            BR = ('<br>', '\n', dict(b=False, i=False, u=False, hl=False, color=None, va=None))
            while len(opts) < 4 and j < len(items):
                nxt = split_choices(items[j])
                have = [o[0] for o in opts]
                if nxt is not None and (nxt[0][0] == chr(ord(opts[-1][0]) + 1) or
                        (nxt[0][0] not in have and all(o[0] not in have for o in nxt) and len(have) + len(nxt) <= 4
                         and sorted(have + [o[0] for o in nxt]) == list('ABCD'[:len(have) + len(nxt)]))):
                    opts += [list(o) for o in nxt]; j += 1; continue
                it2 = items[j]
                # phương án nhiều dòng (VD đoạn thơ): dòng tiếp theo thuộc phương án hiện tại
                if nxt is None and it2.kind == 'p' and it2.text.strip() and not explicit_key(it2.text) \
                        and not any(rx.search(it2.text.strip()) for _, rx in SECTION_RE) and cont < 12 \
                        and not group_range(it2.text) and not re.match(r'^\s*(MÔN\s|Hướng dẫn|HD\b|Giải thích|Lời giải)', it2.text, re.I):
                    opts[-1][1] = opts[-1][1] + [BR] + list(it2.segs); cont += 1; j += 1; continue
                if nxt is None and it2.kind == 'p' and not it2.text.strip(): j += 1; continue
                break
            if len(opts) == 4 and cont:
                # phương án D cũng có thể nhiều dòng: lấy thêm các dòng có trong đề HS
                per = max(1, round(cont / 3))
                k2 = 0
                while j < len(items) and k2 < per + 2:
                    it2 = items[j]
                    t2 = it2.text.strip()
                    if it2.kind != 'p' or not t2 or explicit_key(t2) or not in_hs(t2) \
                            or re.match(r'^(câu\s*\d+|\d{1,3}\s*[.:)])', t2, re.I) or it2.prefix: break
                    opts[-1][1] = opts[-1][1] + [BR] + list(it2.segs); j += 1; k2 += 1
            opts = [tuple(o) for o in sorted(opts, key=lambda o: o[0])]
            q = dict(section=section, pre=pending, opts=opts, after=[], idx=i)
            questions.append(q); last_q = q; pending = []; in_explain = True
            i = j; continue
        # đoạn thường
        if it.kind == 'p' and not it.text.strip() and '<img' not in it.html:
            i += 1; continue
        if in_explain and last_q is not None:
            key = explicit_key(txt) if it.kind == 'p' else None
            if key or not in_hs(it.text) or re.match(r'^\s*(giải thích|lời giải|hướng dẫn|HD\b|phân tích|dịch\b)', txt, re.I):
                last_q['after'].append(it); i += 1; continue
            in_explain = False
        pending.append(it)
        i += 1
    ctx.trailing = pending
    return ctx, questions


TAG = r'(?:\s|&nbsp;|<[^>]+>)*'
SO_CAU_RE = re.compile(r'^' + TAG + r'(?:Câu' + TAG + r'\d{1,3}' + TAG + r'[.:]?|\d{1,3}' + TAG + r'[.:)]|[.:](?=\s|<))' + TAG, re.I)
HUONG_DAN_RE = re.compile(r'^' + TAG + r'(?:(?:Câu|Questions?)' + TAG + r'\d{1,3}' + TAG + r'[-–—]' + TAG + r'\d{1,3}' + TAG + r'[:.]?' + TAG + r')?'
                          r'(?=(?:<[^>]+>|\s)*(?:Mark the letter|Read the|Choose|Each of the following|Which of the following best))', re.I)


def bo_so_cau(stem):
    """Bỏ tiền tố số câu ("Câu 53:", "<b>Câu</b> <b>53</b>:", "12.") ở đầu đề câu — chịu được thẻ
    xen giữa. KHÔNG đụng tới "Câu nào sau đây...", "Câu thơ..." (sau chữ Câu không phải số)."""
    m = SO_CAU_RE.match(stem)
    if not m: return stem
    rest = stem[m.end():]
    # "Câu 31.1. With…" — số thứ tự danh sách Word dính liền sau số câu
    m2 = re.match(r'^\d{1,2}\.\s+', rest) if re.search(r'\d\.$', re.sub('<[^>]+>', '', stem[:m.end()]).strip()) else None
    if m2 and re.search(r'\d\.\d', re.sub('<[^>]+>', '', stem[:m.end() + 4])): rest = rest[m2.end():]
    # giữ lại các thẻ mở đã bị cắt (VD "<b>Câu 1.</b> <b>Đọc ...") — chỉ cắt phần chữ
    opened = re.findall(r'<(b|i|u)>', stem[:m.end()]); closed = re.findall(r'</(b|i|u)>', stem[:m.end()])
    for t in opened:
        if t in closed: closed.remove(t)
        else: rest = f'<{t}>' + rest
    return rest


def build(questions, ctx):
    """Chuyển các câu thô thành nhóm theo môn."""
    out = {'tv': [], 'anh': [], 'kh': [], 'khac': []}
    issues = []
    cur_group = None; group_left = 0
    # Đề không có tiêu đề "TIẾNG ANH": 30 câu đầu là Tiếng Việt, 30 câu sau là Tiếng Anh
    dem_tv = 0
    for q in questions:
        if q['section'] == 'tv':
            dem_tv += 1
            if dem_tv > 30: q['section'] = 'anh'
    # Đáp án ghi gộp sau cả cụm: "118.B đúng", "Câu 119: chọn C" → gán theo số câu
    key_by_num = {}
    for q in questions + [dict(after=getattr(ctx, 'trailing', []), pre=[])]:
        for it in q['after'] + q['pre']:
            for line in re.split(r'\n', it.text):
                m = re.match(r'^\s*(?:[Cc]âu\s*)?(\d{1,3})\s*[.:)]\s*(?:[Cc]họn\s*(?:câu|đáp án)?\s*)?([A-D])(?=\s*(?:$|đúng|[.:)\-–]|là\b))', line)
                if m: key_by_num.setdefault(int(m.group(1)), m.group(2).upper())
    # Lời giải bị coi nhầm là đề câu sau (vì câu chữ trong lời giải trùng với đề HS):
    # phần nằm TRƯỚC dòng "Câu N." / câu dẫn cụm của câu sau mà trông như lời giải → trả về câu trước
    def la_dau_cau(it):
        t = it.text.strip()
        return it.kind == 'p' and (re.match(r'^câu\s*\d{1,3}\s*[.:]', t, re.I) or (it.prefix and re.search(r'\d', it.prefix))
                                    or group_range(t) or re.match(r'^MÔN\s', t))
    for k in range(1, len(questions)):
        q, prev = questions[k], questions[k - 1]
        idx = next((j for j, it in enumerate(q['pre']) if la_dau_cau(it)), None)
        if not idx: continue
        truoc = q['pre'][:idx]
        if any(it.kind == 'p' and any(rx.search(it.text.strip()) for _, rx in SECTION_RE) for it in truoc): continue
        co_lg = bool(prev['after']) or any(re.search(r'đáp án|giải thích|hướng dẫn|phương pháp|cách giải|=>|⇒|\\Rightarrow', it.text, re.I) for it in truoc)
        if co_lg:
            prev['after'] += truoc; q['pre'] = q['pre'][idx:]
    def qnum(q):
        for it in reversed(q['pre']):
            m = re.match(r'^\s*câu\s*(\d{1,3})\b', it.text, re.I)
            if m: return int(m.group(1))
        return None
    for qi, q in enumerate(questions):
        sec = q['section'] if q['section'] in ('tv', 'anh', 'kh') else 'khac'
        pre = [x for x in q['pre'] if not (x.kind == 'p' and is_heading_junk(x.text))]
        # câu hỏi = đoạn cuối cùng của pre (thường là đoạn đánh số/ "Câu N."), phần trước = ngữ cảnh
        stem_items = []; ctx_items = []
        if pre:
            # tìm đoạn mở đầu câu hỏi: đoạn đánh số tự động hoặc bắt đầu "Câu N"/"N."
            k = None
            for j in range(len(pre) - 1, -1, -1):
                t = pre[j].text.strip()
                if pre[j].kind == 'p' and (re.match(r'^(câu\s*\d+\s*[.:]|\d{1,3}\s*[.:)])', t, re.I) or (pre[j].prefix and re.search(r'\d', pre[j].prefix))):
                    k = j; break
            if k is None: k = len(pre) - 1
            # Có câu dẫn "trả lời các câu từ X đến Y" → cụm: ngữ cảnh = từ câu dẫn đến
            # trước đoạn hỏi cuối cùng; đề câu = đoạn hỏi.
            h = next((j for j, x in enumerate(pre) if x.kind == 'p' and group_range(x.text)), None)
            if h is not None:
                kk = k if k > h else len(pre) - 1
                ctx_items, stem_items = pre[h:kk], pre[kk:]
                if not ctx_items: ctx_items = [pre[h]]
            else:
                # "Câu N." kèm đoạn trích ngay sau: phần từ k đến hết là đề câu
                ctx_items, stem_items = pre[:k], pre[k:]
        hdr_text = ' '.join(x.text for x in ctx_items)
        rng = group_range(hdr_text) if ctx_items else None
        ctx_keep = [x for x in ctx_items if not (x.kind == 'p' and group_range(x.text) and len(x.text) < 220
                                                   and re.match(r'^\s*(\S+\s*-\s*)?(dựa vào|đọc|sử dụng)', x.text, re.I))]
        if ctx_items and not ctx_keep: ctx_keep = ctx_items
        ctx_html = '<br>'.join(x.html for x in ctx_keep if x.html) if ctx_items else ''
        new_group = False
        if ctx_items and rng:
            new_group = True; group_left = rng[1] - rng[0] + 1
        elif ctx_items:
            # ngữ cảnh riêng của 1 câu → gộp vào đề câu
            stem_items = ctx_items + stem_items; ctx_html = ''
            new_group = True; group_left = 1
        elif group_left <= 0 or cur_group is None or cur_group['sec'] != sec:
            new_group = True; group_left = 1
        if new_group:
            cur_group = dict(sec=sec, noiDungChung=ctx_html or None, cauHoi=[])
            out[sec].append(cur_group)
        group_left -= 1

        stem = '<br>'.join(x.html for x in stem_items if x.html)
        # dòng hướng dẫn chung kiểu "Câu 31-55: Mark the letter …" nằm trong đề câu → giữ chữ hướng dẫn
        # (in nghiêng, bỏ dải số), rồi bỏ số câu ở dòng câu hỏi thật
        dong = stem.split('<br>')
        hd = []
        while len(dong) > 1 and HUONG_DAN_RE.match(dong[0]) and re.search(r'Mark the letter|Read the|Choose|Each of the following|best restates', re.sub('<[^>]+>', '', dong[0]), re.I):
            h = dong.pop(0)
            h = re.sub(r'</?(?:b|i|u)>', '', h[HUONG_DAN_RE.match(h).end():]).strip()
            hd.append(f'<i class="huong-dan-cau">{h}</i>')
        stem = '<br>'.join(hd + [bo_so_cau(dong[0])] + dong[1:])
        choices = [segs_html(s, keep_fmt=False) for _, s, _ in q['opts']]
        letters = [l for l, _, _ in q['opts']]
        ans = None; how = None
        for it in q['after']:
            k = explicit_key(it.text)
            if k: ans, how = k, 'text'; break
        if ans is None and q['after']:
            # lời giải mở đầu bằng "B đúng." / "C. those → that" (đề Anh đề 2)
            m = re.match(r'^\s*(?:[→=>-]+\s*)?([A-D])\s*(?:đúng\b|là đúng|là đáp án đúng|[.:]\s)', q['after'][0].text)
            if m: ans, how = m.group(1), 'text0'
        mi, mhow = pick_marked(q['opts'])
        if ans is None and mi is None:
            n_ = qnum(q)
            if n_ in key_by_num: ans, how = key_by_num[n_], 'theo-so'
        if ans is None and mi is not None: ans, how = letters[mi], mhow
        elif ans and mi is not None and letters[mi] != ans:
            issues.append(f'XUNG ĐỘT câu #{qi+1} ({sec}): lời giải ghi "{ans}" nhưng phương án tô màu là {letters[mi]} — tạm dùng {letters[mi]}')
            ans, how = letters[mi], mhow + '/xungdot'
            q['after'].insert(0, Item('p', '', '<i class="canh-bao-lg">(Lưu ý: lời giải gốc ghi đáp án ' + explicit_key_any(q['after']) + ', còn đáp án tô trong đề là ' + letters[mi] + ' — web đang dùng ' + letters[mi] + '.)</i>'))
        explain = '<br>'.join(x.html for x in q['after'] if x.html)
        prob = []
        if len(choices) != 4: prob.append(f'{len(choices)} phương án')
        if ans is None: prob.append('không xác định được đáp án')
        if not stem and not cur_group['noiDungChung']: prob.append('thiếu đề câu')
        if prob: issues.append(f'câu #{qi+1} ({sec}): ' + ', '.join(prob) + ' | ' + re.sub('<[^>]+>', '', stem)[:70])
        cur_group['cauHoi'].append(dict(question=stem, choices=choices, correctIndex=letters.index(ans) if ans in letters else -1, explain=explain, _how=how, _loi=bool(prob)))
    return out, issues


def convert_wmf(jobs):
    if not jobs: return
    d = os.path.dirname(jobs[0])
    for k in range(0, len(jobs), 80):
        subprocess.run(['soffice', '--headless', '--convert-to', 'png', '--outdir', d] + jobs[k:k + 80], capture_output=True)
    for j in jobs:
        png = os.path.splitext(j)[0] + '.png'
        if os.path.exists(png):
            subprocess.run(['convert', png, '-trim', '+repage', png], capture_output=True)
            os.remove(j)


if __name__ == '__main__':
    da, out_json, media_dir, media_url = sys.argv[1:5]
    hs = sys.argv[5:]
    ctx, qs = parse(da, hs, media_dir, media_url)
    data, issues = build(qs, ctx)
    convert_wmf(ctx.wmf_jobs)
    json.dump(dict(data=data, issues=issues), open(out_json, 'w'), ensure_ascii=False, indent=1)
    cnt = {k: sum(len(g['cauHoi']) for g in v) for k, v in data.items()}
    print(json.dumps(cnt, ensure_ascii=False), f'{len(issues)} vấn đề')
    for x in issues[:40]: print('  -', x)
