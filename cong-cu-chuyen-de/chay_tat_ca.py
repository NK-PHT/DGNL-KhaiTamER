import glob, os, re, subprocess, sys
ROOT='/tmp/claude-0/src/THI THỬ ĐGNL 2026'
for d in sorted(glob.glob(ROOT+'/LẦN *'), key=lambda x:int(re.search(r'LẦN (\d+)',x).group(1))):
    n=int(re.search(r'LẦN (\d+)',d).group(1))
    fs=[os.path.basename(f) for f in glob.glob(d+'/*.docx')]
    da=[f for f in fs if 'ĐÁP ÁN' in f.upper() and ('THI THỬ' in f.upper() or 'TỰ LUYỆN' in f.upper())]
    hs=[f for f in fs if f not in da and ('THI THỬ' in f.upper() or 'TỰ LUYỆN' in f.upper()) and 'ĐÁP ÁN' not in f.upper()]
    if not da: print(f'LẦN {n}: không có file ĐÁP ÁN tổng', fs); continue
    full=[f for f in da if 'ĐỀ SỐ' in f.upper() or 'TỰ LUYỆN' in f.upper() or 'SỐ' in f.upper()]
    da=sorted(full or da,key=lambda f:('ANH' in f.upper(), 'COPY' in f.upper(), len(f)))[0]
    print(f'LẦN {n}: {da}  | HS: {hs}')
    r=subprocess.run(['python3','/tmp/claude-0/tool/chuyen_docx.py',d+'/'+da,f'/tmp/claude-0/out/l{n}.json',f'/tmp/claude-0/out/anh/l{n}',f'data/anh/l{n}']+[d+'/'+h for h in hs],capture_output=True,text=True)
    print('   ',r.stdout.strip().replace('\n','\n    ')[:1500], r.stderr.strip()[-300:])
