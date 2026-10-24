"""Đọc bảng đáp án (hàng "Câu 1 2 3…" + hàng "ĐA A B C…") trong các file Word riêng
của môn Văn từng lần thi thử → /tmp/claude-0/out/bang_dap_an.json  {lan: {"tv": {"1": "C", ...}}}"""
import glob, os, re, json, docx
ROOT = '/tmp/claude-0/src/THI THỬ ĐGNL 2026'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
out = {}
for d in glob.glob(ROOT + '/LẦN *'):
    n = int(re.search(r'LẦN (\d+)', d).group(1))
    for f in sorted(glob.glob(d + '/*.docx'), key=lambda x: 'UPDATE' in x.upper()):
        name = os.path.basename(f).upper()
        if not re.search(r'VĂN|KÌ|KỲ', name) or 'ANH' in name: continue
        try: doc = docx.Document(f)
        except Exception: continue
        key = {}
        for t in doc.tables:
            rows = [[c.text.strip() for c in r.cells] for r in t.rows]
            for i in range(len(rows) - 1):
                a, b = rows[i], rows[i + 1]
                if a and re.match(r'^câu$', a[0], re.I) and b and re.match(r'^(ĐA|Đáp án)$', b[0], re.I):
                    for x, y in zip(a[1:], b[1:]):
                        if x.isdigit() and re.fullmatch(r'[A-D]', y.strip().upper() or '-'):
                            key[x] = y.strip().upper()
        if len(key) >= 20:
            out.setdefault(str(n), {})['tv'] = key
            print(n, len(key), os.path.basename(f))
json.dump(out, open('/tmp/claude-0/out/bang_dap_an.json', 'w'), ensure_ascii=False, indent=1)
