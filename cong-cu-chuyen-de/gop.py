import json, os, re, shutil, glob
OUT='/tmp/claude-0/web/data'
manifest=[]
tong={'tv':0,'anh':0,'kh':0}; bo=[]
BANG=json.load(open('/tmp/claude-0/out/bang_dap_an.json')) if os.path.exists('/tmp/claude-0/out/bang_dap_an.json') else {}
SUA=json.load(open('/tmp/claude-0/tool/sua_tay.json')) if os.path.exists('/tmp/claude-0/tool/sua_tay.json') else []
lech_bang=[]; da_sua=[]
txt=lambda h: re.sub(r'\s+',' ',re.sub('<[^>]+>','',h or '')).strip()
for n in [2,4]+list(range(6,18)):
    p=f'/tmp/claude-0/out/l{n}.json'
    if not os.path.exists(p): continue
    d=json.load(open(p)); data=d['data']
    # bổ sung đáp án Anh từ file đáp án Anh riêng (nếu có)
    ao=f'/tmp/claude-0/out/anh_only_{n}.json'
    if os.path.exists(ao):
        a=[q for sec in json.load(open(ao))['data'].values() for g in sec for q in g['cauHoi']]
        b=[q for g in data['anh'] for q in g['cauHoi']]
        if len(a)==len(b):
            for qa,qb in zip(a,b):
                if qb['correctIndex']<0 and qa['correctIndex']>=0 and len(qa['choices'])==len(qb['choices'])==4:
                    qb['correctIndex']=qa['correctIndex']; qb['_loi']=False
    # bảng đáp án trong file Văn riêng: bù câu Tiếng Việt chưa có đáp án (đối chiếu theo số câu)
    bang=BANG.get(str(n),{}).get('tv')
    tvq=[q for g in data['tv'] for q in g['cauHoi']]
    if bang and len(tvq)==30:
        for i,q in enumerate(tvq):
            k=bang.get(str(i+1))
            if not k or len(q['choices'])!=4: continue
            if q['correctIndex']<0:
                q['correctIndex']='ABCD'.index(k); q['_loi']=False; da_sua.append(f'Đề {n} – Tiếng Việt câu {i+1}: lấy đáp án {k} từ bảng đáp án trong file Văn')
            elif 'ABCD'[q['correctIndex']]!=k:
                lech_bang.append(f'Đề {n} – Tiếng Việt câu {i+1}: bảng đáp án file Văn ghi **{k}**, file ĐÁP ÁN tổng tô **{"ABCD"[q["correctIndex"]]}** → web đang dùng **{"ABCD"[q["correctIndex"]]}**')
    for sx in SUA:
        if sx['de']!=n: continue
        for g in data[sx['mon']]:
            for q in g['cauHoi']:
                if txt(q['question']).startswith(sx['bat_dau']):
                    for k in ('correctIndex','question','choices'):
                        if k in sx: q[k]=sx[k]
                    q['_loi']=False; da_sua.append(f'Đề {n} – {sx["mon"]}: {sx["bat_dau"][:50]}… → {sx.get("ly_do","")}')
    de={'id':f'l{n}','ten':f'Đề thi thử số {n}'}
    so={}
    for sec in ('tv','anh','kh'):
        groups=[]
        for g in data[sec]:
            cq=[]
            for q in g['cauHoi']:
                if q.get('_loi') or q['correctIndex']<0 or len(q['choices'])!=4:
                    bo.append(f'Đề {n} – {sec}: '+re.sub('<[^>]+>','',q['question'])[:80]); continue
                cq.append({k:q[k] for k in ('question','choices','correctIndex','explain')})
            if cq: groups.append({'noiDungChung':g['noiDungChung'],'cauHoi':cq,'khongXaoTron':True})
        c=sum(len(g['cauHoi']) for g in groups)
        if c < (12 if sec=='kh' else 24):
            bo.append(f'Đề {n} – {sec}: bỏ cả phần (chỉ đọc được {c} câu)'); groups=[]; c=0
        de[sec]=groups; so[sec]=c; tong[sec]+=c
    js='window.DGNL_DE_MON = window.DGNL_DE_MON || {};\nwindow.DGNL_DE_MON["l%d"] = %s;\n'%(n,json.dumps(de,ensure_ascii=False))
    open(f'{OUT}/de-mon/l{n}.js','w').write(js)
    # ảnh: chỉ copy ảnh thực sự được dùng
    used=set(re.findall(r'data/anh/l%d/([0-9a-f]+\.\w+)'%n, js))
    os.makedirs(f'{OUT}/anh/l{n}',exist_ok=True)
    for f in used:
        src=f'/tmp/claude-0/out/anh/l{n}/{f}'
        if os.path.exists(src): shutil.copy(src,f'{OUT}/anh/l{n}/{f}')
        else: print('  thiếu ảnh',n,f)
    manifest.append({'id':f'l{n}','lan':n,'ten':de['ten'],'so':so,'file':f'data/de-mon/l{n}.js'})
    print(n,so,f'{len(js)//1024}KB',len(used),'ảnh')
open(f'{OUT}/de-mon/manifest.js','w').write('window.DGNL_DE_MON_MANIFEST = %s;\n'%json.dumps(manifest,ensure_ascii=False,indent=1))
print('TỔNG',tong,'bỏ',len(bo))
open('/tmp/claude-0/web/cau-bi-bo.txt','w').write('\n'.join(bo))
json.dump(dict(lech_bang=lech_bang,da_sua=da_sua),open('/tmp/claude-0/web/sua-them.json','w'),ensure_ascii=False,indent=1)
print('\n'.join(da_sua)); print('lệch bảng:',len(lech_bang))
