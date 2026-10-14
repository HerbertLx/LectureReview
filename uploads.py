"""Local PDF-only library. No keys and no model calls."""
import contextlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import threading
import time
import uuid

ROOT=Path(__file__).resolve().parent
LIBRARY=ROOT/'uploaded-decks'
MAX_BYTES=60*1024*1024

def write_json(path,value):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(path)

def directory(deck_id):
    if not re.fullmatch(r'pdf-[a-f0-9]{32}',deck_id):raise ValueError('Invalid deck id')
    return LIBRARY/deck_id

def status(deck_id):
    path=directory(deck_id)/'status.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None

def manifests():
    if not LIBRARY.exists():return []
    results=[]
    for path in LIBRARY.glob('pdf-*/manifest.json'):
        try:
            progress=json.loads((path.parent/'status.json').read_text(encoding='utf-8'))
            if progress.get('state')=='ready':results.append(json.loads(path.read_text(encoding='utf-8')))
        except (ValueError,OSError):continue
    return sorted(results,key=lambda value:value['created_at'])

@contextlib.contextmanager
def library_lock():
    LIBRARY.mkdir(parents=True,exist_ok=True)
    with (LIBRARY/'library.lock').open('a+b') as stream:
        if stream.tell()==0:stream.write(b'0');stream.flush()
        if os.name=='nt':
            import msvcrt
            deadline=time.monotonic()+15
            while True:
                try:stream.seek(0);msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1);break
                except OSError:
                    if time.monotonic()>deadline:raise
                    time.sleep(.1)
        else:
            import fcntl
            fcntl.flock(stream,fcntl.LOCK_EX)
        try:yield
        finally:
            if os.name=='nt':stream.seek(0);msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
            else:fcntl.flock(stream,fcntl.LOCK_UN)

def launch(manifest):
    port=manifest['port']
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1',port))==0:return
    log=directory(manifest['id'])/'service.log'
    with log.open('ab') as output:
        subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--deck',manifest['id'],'--port',str(port)],
            cwd=ROOT,stdin=subprocess.DEVNULL,stdout=output,stderr=output,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)

def restore_services():
    with library_lock():
        for manifest in manifests():launch(manifest)

def import_pdf(deck_id):
    from extract_layout import pymupdf,regions
    folder=directory(deck_id)
    request=json.loads((folder/'request.json').read_text(encoding='utf-8'))
    try:
        doc=pymupdf.open(folder/'original.pdf')
        if not doc.is_pdf or doc.needs_pass:raise ValueError('请上传未加密的有效PDF')
        if not 1<=len(doc)<=300:raise ValueError('PDF须为1至300页')
        dist=folder/'dist';(dist/'pages').mkdir(parents=True,exist_ok=True)
        texts={};titles={};layout={}
        for i,page in enumerate(doc):
            number=str(i+1);texts[number]=page.get_text();layout[number]=regions(page)
            lines=[line.strip() for line in texts[number].splitlines() if len(line.strip())>3]
            titles[number]=(lines[0] if lines else '图像页面')[:100]
            scale=min(1.8,2000/max(page.rect.width,page.rect.height))
            page.get_pixmap(matrix=pymupdf.Matrix(scale,scale)).save(str(dist/'pages'/f'page-{i+1}.png'))
            write_json(folder/'status.json',{'id':deck_id,'state':'importing','done':i+1,'total':len(doc)})
        write_json(folder/'context.json',{'pages':texts,'full_text':'\n\n'.join(f'PAGE {n}\n{text}' for n,text in texts.items())})
        write_json(folder/'layout.json',layout)
        write_json(dist/'deck.json',{'id':deck_id,'count':len(doc),'titles':titles,'title':request['title'],'course':request['course'],'pdf':'original.pdf'})
        with library_lock():
            reserved={entry['port'] for entry in manifests()};port=None
            for candidate in range(8780,8900):
                if candidate in reserved:continue
                with socket.socket() as probe:
                    try:probe.bind(('0.0.0.0',candidate));port=candidate;break
                    except OSError:continue
            if port is None:raise ValueError('没有可用课件端口')
            manifest={**request,'id':deck_id,'port':port,'count':len(doc),'created_at':time.time()}
            write_json(folder/'manifest.json',manifest)
            launch(manifest)
        write_json(folder/'status.json',{'id':deck_id,'state':'ready','done':len(doc),'total':len(doc),'port':port})
    except Exception as error:
        write_json(folder/'status.json',{'id':deck_id,'state':'failed','error':str(error) if isinstance(error,ValueError) else 'PDF处理失败，请确认文件完整并重试'})

def begin_upload(filename,title,course,payload):
    if sum(1 for path in LIBRARY.glob('pdf-*/status.json') if json.loads(path.read_text(encoding='utf-8')).get('state')=='importing')>=3:raise ValueError('已有3份课件正在导入，请稍后再试')
    filename=filename.replace('\\','/').rsplit('/',1)[-1]
    if Path(filename).suffix.lower()!='.pdf':raise ValueError('仅支持.pdf文件，不接受PPT或PPTX')
    if not 0<len(payload)<=MAX_BYTES:raise ValueError('PDF大小须在60MB以内')
    if not payload.startswith(b'%PDF-'):raise ValueError('文件内容不是有效PDF')
    title=(title.strip() or Path(filename).stem)[:120]
    course=(course.strip() or '我的课件')[:60]
    deck_id='pdf-'+uuid.uuid4().hex;folder=directory(deck_id);folder.mkdir(parents=True)
    (folder/'original.pdf').write_bytes(payload)
    write_json(folder/'request.json',{'title':title,'course':course,'filename':filename})
    write_json(folder/'status.json',{'id':deck_id,'state':'importing','done':0,'total':None})
    with (folder/'import.log').open('ab') as output:
        subprocess.Popen([sys.executable,str(ROOT/'uploads.py'),'--import',deck_id],cwd=ROOT,
            stdin=subprocess.DEVNULL,stdout=output,stderr=output,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    return status(deck_id)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--import',dest='deck_id',required=True)
    import_pdf(parser.parse_args().deck_id)
