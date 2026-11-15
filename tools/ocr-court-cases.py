#!/usr/bin/env python3
"""OCR image-only court PDFs without presenting recognition as verified text.

Requires Poppler (pdfinfo, pdftoppm), Tesseract 5, Pillow, NumPy, SciPy and Japanese models. Point
--tessdata-dir at a directory containing official jpn, jpn_vert and eng models.
Only cache records with status=image-pdf are changed; reruns are resumable.
Unreadable pages remain explicit; partial OCR is tagged separately from complete OCR.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

JAPANESE = re.compile(r'[\u3040-\u30ff\u3400-\u9fff]')
MODEL_NAMES = ('jpn', 'jpn_vert', 'eng')
PIPELINE_VERSION = 4


def court_url(url):
    parsed=urlparse(url or '')
    return parsed.scheme=='https' and parsed.hostname in ('www.courts.go.jp','courts.go.jp') and not parsed.username and not parsed.password and parsed.port in (None,443)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def atomic_json(path, value):
    path=Path(path)
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,prefix=path.name+'.',suffix='.tmp',delete=False) as stream:
        temporary=Path(stream.name)
        json.dump(value,stream,ensure_ascii=False,separators=(',',':'))
    temporary.replace(path)


def parse_tsv(raw, redactions=None, vertical=False):
    """Preserve recognized line order; confidence is character-weighted."""
    lines={};weighted=0.0;weight=0;coordinates={}
    for row in csv.DictReader(io.StringIO(raw),delimiter='\t',quoting=csv.QUOTE_NONE):
        if row.get('level')!='5':continue
        text=(row.get('text') or '').strip()
        if not text:continue
        try:confidence=float(row.get('conf','-1'))
        except ValueError:continue
        key=tuple(row.get(k,'') for k in ('page_num','block_num','par_num','line_num'))
        left=int(row.get('left',0));top=int(row.get('top',0));height=int(row.get('height',0));width=int(row.get('width',0))
        lines.setdefault(key,[]).append((top if vertical else left,text))
        coordinates.setdefault(key,[]).append(left+width/2 if vertical else top+height/2)
        if confidence>=0:
            length=len(text);weighted+=confidence*length;weight+=length
    for box in redactions or []:
        center=box['left']+box['width']/2 if vertical else box['top']+box['height']/2
        nearest=min(coordinates,key=lambda key:abs(sum(coordinates[key])/len(coordinates[key])-center),default=None)
        position=box['top'] if vertical else box['left']
        if nearest is not None and abs(sum(coordinates[nearest])/len(coordinates[nearest])-center)<max(30,box['width'] if vertical else box['height']):
            lines[nearest].append((position,'[非公開部分]'))
        else:lines[('redaction',str(len(lines)))]=[(position,'[非公開部分]')]
    text='\n'.join(' '.join(word for _,word in sorted(words,key=lambda word:word[0])) for words in lines.values())
    text=re.sub(r'(?<=[\u3040-\u30ff\u3400-\u9fff]) +(?=[\u3040-\u30ff\u3400-\u9fff])','',text)
    text=re.sub(r'(?<=\d)[ \u3000]+(?=\d)','',text)
    text=re.sub(r' +([。、，．）)」』】])',r'\1',text)
    text=re.sub(r'([（(「『【]) +',r'\1',text)
    return {'text':text.strip(),'confidence':round(weighted/weight,2) if weight else 0.0,'characters':len(text.strip()),'japaneseCharacters':len(JAPANESE.findall(text))}


def acceptable_page(page):
    # Sparse headers or page numbers are permitted only with strong recognition.
    return page['characters']>=5 and page['confidence']>=55 and page['japaneseCharacters']>=2


def acceptable_document(pages):
    content=[page for page in pages if not page.get('blank')]
    if not content or any(not acceptable_page(page) for page in content):return False
    total=sum(page['characters'] for page in content)
    weighted=sum(page['confidence']*page['characters'] for page in content)/max(1,total)
    return total>=20 and weighted>=55 and sum(page['japaneseCharacters'] for page in content)>=5


def assemble_document(pages):
    parts=[];failed=[];accepted=[]
    for page in pages:
        if page.get('blank'):
            parts.append(f'【原文PDF {page["page"]}ページ：空白ページ】')
        elif acceptable_page(page):
            accepted.append(page)
            parts.append(f'【原文PDF {page["page"]}ページ・OCR】\n'+page['text'])
        else:
            failed.append(page['page'])
            parts.append(f'【原文PDF {page["page"]}ページ：文字を十分に認識できないため、このページの本文は未収録です。公式PDFで確認してください。】')
    if not acceptable_document(accepted):
        return {'text':'','status':'ocr-failed','failedPages':[p['page'] for p in pages if not p.get('blank')],'partial':False}
    return {'text':'\n\n'.join(parts),'status':'ocr-partial' if failed else 'ocr','failedPages':failed,'partial':bool(failed)}


def blank_image(path):
    try:
        from PIL import Image
        with Image.open(path) as image:
            histogram=image.convert('L').histogram()
        return sum(histogram[:220])/max(1,sum(histogram))<0.0002
    except ImportError:
        # Without an image check, a textless page cannot be assumed blank.
        return False


def mask_redactions(path):
    """Exclude solid black redaction rectangles from recognition, never infer them."""
    try:
        import numpy as np
        from scipy import ndimage
        from PIL import Image, ImageDraw
    except ImportError as error:
        raise RuntimeError('Redaction masking requires Pillow, NumPy and SciPy') from error
    with Image.open(path) as original:
        picture=original.convert('RGB')
    dark=np.asarray(picture.convert('L'))<180
    labels,count=ndimage.label(dark)
    boxes=[]
    for number,region in enumerate(ndimage.find_objects(labels),1):
        if region is None:continue
        y,x=region;w=x.stop-x.start;h=y.stop-y.start
        if w<40 or h<10 or h>130 or w<1.8*h:continue
        if np.count_nonzero(labels[region]==number)/(w*h)<.94:continue
        boxes.append({'left':x.start,'top':y.start,'width':w,'height':h})
    draw=ImageDraw.Draw(picture)
    for box in boxes:
        x,y,w,h=(box[k] for k in ('left','top','width','height'))
        draw.rectangle((x-1,y-1,x+w,y+h),fill='white')
    if boxes:picture.save(path)
    return boxes


def run_ocr(image, tessdata, vertical=False, redactions=None):
    language='jpn_vert' if vertical else 'jpn'
    env={**os.environ,'OMP_THREAD_LIMIT':'1'}
    command=['tesseract',str(image),'stdout','--tessdata-dir',str(tessdata),'-l',language,'--psm','5' if vertical else '3','-c','tessedit_create_tsv=1']
    result=subprocess.run(command,capture_output=True,timeout=120,env=env)
    if result.returncode:raise RuntimeError('Tesseract failed: '+result.stderr.decode('utf-8',errors='replace')[-300:])
    data=parse_tsv(result.stdout.decode('utf-8',errors='replace'),redactions,vertical=vertical)
    return {**data,'layout':'vertical' if vertical else 'automatic','language':language}


def needs_upgrade(record):
    metadata=record.get('ocr',{})
    return record.get('status') in ('ocr','ocr-partial') and metadata.get('pipelineVersion')!=PIPELINE_VERSION and any(page.get('layout')=='vertical' for page in metadata.get('pages',[]))


def reusable_pages(state,digest,model_hashes,dpi):
    compatible=state.get('pdfSha256')==digest and state.get('models')==model_hashes and state.get('pipelineVersion') in (3,PIPELINE_VERSION) and state.get('dpi')==dpi
    if not compatible:return {}
    # Version 4 changes vertical word/redaction ordering only. Preserve all valid
    # horizontal recognition and rerun the affected vertical pages, not the PDF.
    return {page['page']:page for page in state.get('pages',[]) if state.get('pipelineVersion')==PIPELINE_VERSION or page.get('layout')!='vertical'}


def extract_record(path, args, model_hashes):
    record=read_json(path)
    upgrade=args.upgrade and needs_upgrade(record)
    if not upgrade and record.get('status') not in (('image-pdf','ocr-failed') if args.retry_failed else ('image-pdf',)):
        return {'id':record.get('id'),'status':'skipped'}
    ident=str(record.get('id',''))
    if not re.fullmatch(r'\d+',ident):raise ValueError('Invalid numeric court ID')
    url=record.get('pdfUrl','')
    result={**record,'text':'','status':'ocr-failed'}
    metadata={'pipelineVersion':PIPELINE_VERSION,'engine':args.engine_version,'models':model_hashes,'processedAt':datetime.now(timezone.utc).isoformat(),'dpi':args.dpi,'verified':False,'pages':[]}
    try:
        if not court_url(url):raise ValueError('PDF URL is not an HTTPS courts.go.jp URL')
        headers={'User-Agent':'Shubiki-Bunko-Court-Archive-OCR/1.0 (+https://github.com/uni-tadayasu/gyouseisyoshi)'}
        with urlopen(Request(url,headers=headers),timeout=60) as response:
            if not court_url(response.url):raise ValueError('PDF redirected outside courts.go.jp')
            pdf=response.read(40*1024*1024+1)
        if len(pdf)>40*1024*1024:raise ValueError('PDF exceeds 40 MiB limit')
        if not pdf.startswith(b'%PDF'):raise ValueError('Response is not a PDF')
        digest=hashlib.sha256(pdf).hexdigest()
        if record.get('pdfSha256') and record['pdfSha256']!=digest:
            raise ValueError('Official PDF changed since extraction; refresh source before OCR')
        result['pdfSha256']=digest
        with tempfile.TemporaryDirectory(prefix='court-ocr-',dir=args.work_dir) as temp:
            temp=Path(temp);source=temp/'source.pdf';source.write_bytes(pdf)
            info=subprocess.run(['pdfinfo',str(source)],capture_output=True,text=True,timeout=30)
            match=re.search(r'^Pages:\s+(\d+)',info.stdout,re.M)
            if info.returncode or not match:raise ValueError('Unable to determine PDF page count')
            count=int(match.group(1));metadata['pageCount']=count
            if count<1 or count>args.max_pages:raise ValueError(f'PDF has {count} pages, exceeding configured OCR limit {args.max_pages}')
            progress_dir=args.work_dir/'page-checkpoints';progress_dir.mkdir(parents=True,exist_ok=True)
            checkpoint=progress_dir/(ident+'.json')
            state=read_json(checkpoint) if checkpoint.exists() else {}
            saved=reusable_pages(state,digest,model_hashes,args.dpi)
            pages=[]
            def save_page(page):
                pages.append(page)
                atomic_json(checkpoint,{'pipelineVersion':PIPELINE_VERSION,'pdfSha256':digest,'models':model_hashes,'dpi':args.dpi,'pages':pages})
            for number in range(1,count+1):
                if number in saved:
                    pages.append(saved[number]);continue
                prefix=temp/'page'
                rendered=subprocess.run(['pdftoppm','-f',str(number),'-l',str(number),'-singlefile','-r',str(args.dpi),'-scale-to','3000','-png',str(source),str(prefix)],capture_output=True,timeout=90)
                image=prefix.with_suffix('.png')
                if rendered.returncode or not image.exists():raise RuntimeError(f'Unable to render page {number}')
                if blank_image(image):
                    save_page({'page':number,'blank':True,'characters':0,'confidence':0,'japaneseCharacters':0,'text':''});continue
                redactions=mask_redactions(image)
                page=run_ocr(image,args.tessdata_dir,redactions=redactions)
                if not acceptable_page(page) or page['confidence']<65:
                    alternate=run_ocr(image,args.tessdata_dir,vertical=True,redactions=redactions)
                    if alternate['confidence']*min(alternate['characters'],100)>page['confidence']*min(page['characters'],100):page=alternate
                save_page({'page':number,'redactions':len(redactions),**page})
                image.unlink(missing_ok=True)
                print(f'OCR {ident}: page {number}/{count}, {page["characters"]} characters, confidence {page["confidence"]}',flush=True)
            atomic_json(checkpoint,{'pipelineVersion':PIPELINE_VERSION,'pdfSha256':digest,'models':model_hashes,'dpi':args.dpi,'pages':pages})
            assembled=assemble_document(pages)
            metadata.update(partial=assembled['partial'],failedPages=assembled['failedPages'],pages=[{k:v for k,v in page.items() if k!='text'} for page in pages])
            result.update(text=assembled['text'],status=assembled['status'])
            result.pop('error',None)
            if assembled['status']=='ocr-failed':result['error']='No sufficiently reliable OCR body; inspect the original PDF'
    except Exception as error:
        result.update(text='',status='ocr-failed',error=str(error)[:400])
    result['ocr']=metadata
    # Avoid replacing an independently refreshed cache record.
    latest=read_json(path)
    if latest.get('status')!=record.get('status') or latest.get('pdfSha256')!=record.get('pdfSha256'):
        return {'id':ident,'status':'skipped-cache-changed'}
    atomic_json(path,result)
    print(f'OCR {ident}: {result["status"]}'+(' — '+result['error'] if result.get('error') else ''),flush=True)
    return {'id':ident,'status':result['status']}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--tessdata-dir',type=Path,required=True)
    parser.add_argument('--work-dir',type=Path,default=Path(tempfile.gettempdir()))
    parser.add_argument('--workers',type=int,choices=(1,2,3,4),default=1)
    parser.add_argument('--dpi',type=int,default=250)
    parser.add_argument('--max-pages',type=int,default=400)
    parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--watch',action='store_true')
    parser.add_argument('--watch-seconds',type=int,default=600)
    parser.add_argument('--retry-failed',action='store_true')
    parser.add_argument('--upgrade',action='store_true',help='Reprocess OCR from older pipeline versions')
    args=parser.parse_args()
    # Fail before altering cache entries if required preprocessing is unavailable.
    import PIL, numpy, scipy  # noqa: F401
    args.engine_version=subprocess.check_output(['tesseract','--version'],text=True).splitlines()[0]
    models={name:hashlib.sha256((args.tessdata_dir/(name+'.traineddata')).read_bytes()).hexdigest() for name in MODEL_NAMES}
    args.work_dir.mkdir(parents=True,exist_ok=True)
    attempted=set();summary={};end=time.monotonic()+args.watch_seconds
    while True:
        allowed=('image-pdf','ocr-failed') if args.retry_failed else ('image-pdf',)
        pending=[]
        for path in sorted(args.cache.glob('*.json')):
            if path.stem in attempted:continue
            record=read_json(path)
            upgrade=args.upgrade and needs_upgrade(record)
            if record.get('status') in allowed or upgrade:pending.append(path)
        if args.limit:pending=pending[:max(0,args.limit-len(attempted))]
        if pending:
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures={pool.submit(extract_record,path,args,models):path for path in pending}
                for future in as_completed(futures):
                    row=future.result();attempted.add(futures[future].stem);summary[row['status']]=summary.get(row['status'],0)+1
            print('OCR pass: '+json.dumps(summary,ensure_ascii=False),flush=True)
        if not args.watch or time.monotonic()>=end or (args.limit and len(attempted)>=args.limit):break
        time.sleep(10)
    print('OCR complete: '+json.dumps(summary,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
