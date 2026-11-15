#!/usr/bin/env python3
"""Build the static court-case library from a CC0 seed and an official index.

The official index must be produced by crawl-court-index.py. This script never
calls an unverified arbitrary URL: PDF downloads are restricted to courts.go.jp.
Published files contain data only, not third-party JavaScript or HTML.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
import threading
try:
    import httpx
except ImportError:
    httpx=None
HTTP_ERRORS=(httpx.HTTPError,) if httpx else ()
HTTP_LOCAL=threading.local()
RATE_STOP=threading.Event()
RATE_LOCK=threading.Lock()
RATE_RESUME=0.0
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATEGORY = {'SupremeCourt':'最高裁判例','HighCourt':'高裁判例','LowerCourt':'下級裁裁判例','AdministrativeCase':'行政事件裁判例','LaborCase':'労働事件裁判例','IPCase':'知的財産裁判例'}
ERA = {'Showa':1925,'Heisei':1988,'Reiwa':2018}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    tmp.replace(path)


def write_gzip(path, data):
    payload=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    Path(path).write_bytes(gzip.compress(payload,compresslevel=6,mtime=0))
    return {'bytes':Path(path).stat().st_size,'uncompressedBytes':len(payload),'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest()}


def court_url(url):
    parsed=urlparse(url or '')
    return parsed.scheme=='https' and parsed.hostname in ('www.courts.go.jp','courts.go.jp') and not parsed.username and not parsed.password


def date_iso(value):
    if not isinstance(value,dict):return str(value or '')
    try:return f"{ERA[value['era']]+int(value['year']):04d}-{int(value['month']):02d}-{int(value['day']):02d}"
    except (KeyError,ValueError,TypeError):return ''


def clean_text(value):
    if not isinstance(value,str):return ''
    return value.replace('\x00','').replace('\r\n','\n').strip()


def seed_records(directory):
    """Only per-case JSON is trusted as a record; decade list.json is an index."""
    paths=sorted(Path(directory).glob('precedent/*/*.json'))
    if not paths:raise ValueError('Seed directory has no precedent/*/*.json files')
    records={}
    for path in paths:
        if path.name=='list.json':continue
        row=read_json(path)
        ident=str(row.get('lawsuit_id',''))
        if not re.fullmatch(r'\d+',ident):continue
        previous=records.get(ident)
        if previous is None or len(clean_text(row.get('contents')))>len(clean_text(previous.get('contents'))):
            records[ident]=row
    return records


def fetch_pdf_text(record,cache):
    global RATE_RESUME
    ident=str(record['id']);target=Path(cache)/(ident+'.json')
    url=record.get('pdfUrl','')
    if '/app/files/hanrei_jp/' in url:
        url=f'https://www.courts.go.jp/assets/hanrei/hanrei-pdf-{ident}.pdf'
    if target.exists():
        cached=read_json(target)
        if cached.get('status') not in ('fetch-failed','rate-limited','deferred') and cached.get('pdfUrl')==url:return cached
    output={'id':ident,'pdfUrl':url,'text':'','status':'pdf-unavailable'}
    if not court_url(url):
        write_json(target,output);return output
    for attempt in range(3):
        if RATE_STOP.is_set():return {**output,'status':'deferred'}
        while time.monotonic()<RATE_RESUME:
            time.sleep(max(0,min(5,RATE_RESUME-time.monotonic())))
        if RATE_STOP.is_set():return {**output,'status':'deferred'}
        try:
            headers={'User-Agent':'Shubiki-Bunko-Court-Archive/1.0 (+https://github.com/uni-tadayasu/gyouseisyoshi)'}
            if httpx:
                if not getattr(HTTP_LOCAL,'client',None):
                    HTTP_LOCAL.client=httpx.Client(timeout=60,follow_redirects=True,headers=headers)
                with HTTP_LOCAL.client.stream('GET',url) as response:
                    response.raise_for_status()
                    if not court_url(str(response.url)):raise ValueError('PDF redirected outside courts.go.jp')
                    chunks=[];size=0
                    for chunk in response.iter_bytes():
                        chunks.append(chunk);size+=len(chunk)
                        if size>40*1024*1024:raise ValueError('PDF exceeds 40 MiB extraction limit')
                    pdf=b''.join(chunks)
            else:
                request=Request(url,headers=headers)
                with urlopen(request,timeout=60) as response:
                    if not court_url(response.url):raise ValueError('PDF redirected outside courts.go.jp')
                    pdf=response.read(40*1024*1024+1)
            if len(pdf)>40*1024*1024:raise ValueError('PDF exceeds 40 MiB extraction limit')
            if not pdf.startswith(b'%PDF'):raise ValueError('Response is not a PDF')
            with tempfile.TemporaryDirectory(prefix='court-pdf-') as temp:
                source=Path(temp)/'source.pdf';source.write_bytes(pdf)
                result=subprocess.run(['pdftotext','-enc','UTF-8','-nopgbrk',str(source),'-'],capture_output=True,timeout=90)
                if result.returncode:raise ValueError('pdftotext extraction failed')
                text=clean_text(result.stdout.decode('utf-8',errors='replace'))
            output.update(text=text,status='text' if len(text)>=20 else 'image-pdf',pdfSha256=hashlib.sha256(pdf).hexdigest())
            break
        except (HTTPError,URLError,TimeoutError,ValueError,subprocess.TimeoutExpired)+HTTP_ERRORS as error:
            output.update(status='fetch-failed',error=str(error)[:200])
            status=getattr(error,'code',None) or getattr(getattr(error,'response',None),'status_code',None)
            if status==404:break
            if status in (429,503):
                with RATE_LOCK:RATE_RESUME=max(RATE_RESUME,time.monotonic()+30)
                if attempt>=1:
                    RATE_STOP.set();output['status']='rate-limited';break
            if attempt<2:time.sleep(1+attempt)
    write_json(target,output)
    return output


def fetch_missing(args):
    seed_ids=set()
    if args.seed_index:
        seed_ids={str(row['lawsuit_id']) for row in read_json(args.seed_index)}
    else:
        seed_ids={ident for ident,row in seed_records(args.seed).items() if len(clean_text(row.get('contents')))>=20}
    attempted=set();total=0
    while True:
        records=[]
        if args.official and Path(args.official).exists():records=read_json(args.official)
        elif args.pages:
            for path in sorted(Path(args.pages).glob('*.json')):
                page=read_json(path)
                records.extend(page if isinstance(page,list) else page.get('cases',page.get('records',[])))
        pending={str(row['id']):row for row in records if str(row['id']) not in seed_ids and str(row['id']) not in attempted}
        pending={ident:row for ident,row in pending.items() if not (Path(args.cache)/(ident+'.json')).exists() or read_json(Path(args.cache)/(ident+'.json')).get('status') in ('fetch-failed','rate-limited','deferred')}
        if pending:
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures={pool.submit(fetch_pdf_text,row,args.cache):ident for ident,row in pending.items()}
                for future in as_completed(futures):
                    data=future.result()
                    if data['status']=='rate-limited':raise RuntimeError('Court server returned repeated 429/503; batch stopped. Retry from checkpoints later.')
                    if data['status']=='deferred':continue
                    attempted.add(data['id']);total+=1
                    if total%50==0:print(f'Extracted {total} new PDFs; latest status={data["status"]}',flush=True)
        if not args.watch or (args.official and Path(args.official).exists()):break
        time.sleep(10)
    print(f'PDF extraction pass completed: {total} new cache entries',flush=True)


def build(args):
    seed=seed_records(args.seed)
    official=read_json(args.official)
    official_manifest=read_json(args.official_manifest)
    expected=int(official_manifest.get('total',official_manifest.get('officialTotal',0)))
    if not expected:raise ValueError('Official manifest is missing its independently observed total')
    rows={str(row['id']):row for row in official}
    if len(rows)!=expected and not args.allow_incomplete:raise ValueError(f'Official index is incomplete: {len(rows)} unique IDs / {expected}')
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    index=[];texts={};body_count=0;statuses={};missing=[]
    for ident,current in rows.items():
        original=seed.get(ident,{})
        cached_path=Path(args.cache)/(ident+'.json')
        cached=read_json(cached_path) if cached_path.exists() else {}
        text=clean_text(cached.get('text') or original.get('contents'))
        status=(cached.get('status') if cached.get('status') in ('ocr','ocr-partial') else 'text') if len(text)>=20 else cached.get('status','text-unavailable')
        if status in ('text','ocr','ocr-partial'):texts[ident]=text;body_count+=1
        else:missing.append({'id':ident,'status':status,'pdfUrl':current.get('pdfUrl',''),'reason':cached.get('sourceUnavailableReason','')})
        statuses[status]=statuses.get(status,0)+1
        primary=current.get('category') or CATEGORY.get(original.get('trial_type'),'裁判例')
        record={
          'id':ident,'title':current.get('title') or original.get('case_name') or current.get('caseNumber') or '裁判例 '+ident,
          'date':current.get('date') or date_iso(original.get('date')),'court':current.get('court') or original.get('court_name',''),
          'caseNumber':current.get('caseNumber') or original.get('case_number',''),'category':primary,
          'classifications':current.get('classifications') or [primary],
          'summary':clean_text(current.get('summary') or original.get('gist')),
          'holding':clean_text(current.get('holding') or original.get('case_gist')),
          'lawReferences':clean_text(current.get('lawReferences') or original.get('ref_law')),
          'sourceUrl':current['sourceUrl'],'pdfUrl':current.get('pdfUrl',''),
          'textStatus':status,'hasText':status in ('text','ocr','ocr-partial'),
          'judgmentType':current.get('judgmentType') or original.get('result_type',''),
          'result':current.get('result') or original.get('result',''),
        }
        if status in ('text','ocr','ocr-partial'):record['textSource']='official-pdf-ocr' if status in ('ocr','ocr-partial') else 'official-pdf' if cached.get('text') else 'cc0-court-pdf-transcription'
        elif cached.get('sourceUnavailableReason'):record['textUnavailableReason']=str(cached['sourceUnavailableReason'])
        if status in ('ocr','ocr-partial'):
            ocr=cached.get('ocr') or {}
            record['ocrFailedPages']=ocr.get('failedPages',[])
            record['ocrPageCount']=ocr.get('pageCount',ocr.get('pages',0))
        index.append(record)
    index.sort(key=lambda row:(row['date'],int(row['id'])),reverse=True)
    # Stable ID buckets avoid rewriting the entire archive when new cases arrive.
    buckets={}
    for row in index:
        bucket=int(row['id'])//args.shard_size
        buckets.setdefault(bucket,[]).append(row)
    def package_shard(item):
        bucket,chunk=item;relative=f'text/{bucket:04d}.json.gz'
        payload={row['id']:texts[row['id']] for row in sorted(chunk,key=lambda r:int(r['id'])) if row['id'] in texts}
        if not payload:return None
        for row in chunk:
            if row['id'] in payload:row['bodyShard']=relative
        stat=write_gzip(out/relative,payload)
        return {'path':relative,'count':len(payload),**stat}
    with ThreadPoolExecutor(max_workers=3) as pool:
        shards=[result for result in pool.map(package_shard,sorted(buckets.items())) if result]
    live={shard['path'] for shard in shards}
    for stale in (out/'text').glob('*.json.gz'):
        if stale.relative_to(out).as_posix() not in live:stale.unlink()
    index_stat=write_gzip(out/'index.json.gz',index)
    seed_commit=subprocess.check_output(['git','-C',str(args.seed),'rev-parse','HEAD'],text=True).strip()
    manifest={
      'version':1,'source':'裁判所 裁判例検索','sourceUrl':'https://www.courts.go.jp/hanrei/search1/index.html',
      'updatedAt':datetime.now(timezone.utc).isoformat(),'total':len(index),'officialTotal':expected,
      'coverageComplete':len(index)==expected,'bodyCount':body_count,'missingBodyCount':len(index)-body_count,
      'fullBodyCount':body_count-statuses.get('ocr-partial',0),'partialBodyCount':statuses.get('ocr-partial',0),'ocrCount':statuses.get('ocr',0)+statuses.get('ocr-partial',0),
      'index':'index.json.gz','indexStats':index_stat,'bodyShards':shards,'textStatuses':statuses,
      'scope':'裁判所の統合裁判例検索に公開された裁判例。国内の全判決を意味しません。',
      'textNote':'本文は裁判所PDFからの機械抽出です。改行・文字認識の誤りがあり得ます。出典PDFで確認できます。',
      'attribution':[{'name':'裁判所 裁判例検索','url':'https://www.courts.go.jp/hanrei/search1/index.html','license':'裁判所公開資料'},{'name':'japanese-law-analysis/data_set','url':'https://github.com/japanese-law-analysis/data_set','license':'CC0-1.0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/'},{'name':'JurisInformaticsCenter / KGraphNavi 判例の知識グラフ（2026年10月版）','url':'https://github.com/JurisInformaticsCenter/KGraphNavi/releases/tag/caselaw-data-2026.10','license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','changes':'裁判所由来のメタデータを抽出・JSON化し、現在の裁判所検索結果で更新。推定された争点・結論、Wikipedia/DBpediaの文章は利用していません。'}],
      'seed':{'repository':'https://github.com/japanese-law-analysis/data_set','commit':seed_commit,'license':'CC0-1.0','usedRecords':sum(row['id'] in seed for row in index)},
      'officialIndex':official_manifest,
    }
    write_json(out/'missing-text.json',missing)
    write_json(out/'manifest.json',manifest)
    print(json.dumps({key:manifest[key] for key in ('total','officialTotal','coverageComplete','bodyCount','missingBodyCount','textStatuses')},ensure_ascii=False),flush=True)
    print('Compressed corpus bytes:',sum(path.stat().st_size for path in out.rglob('*.gz')),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    fetch=sub.add_parser('fetch');fetch.add_argument('--seed');fetch.add_argument('--seed-index');fetch.add_argument('--official');fetch.add_argument('--pages');fetch.add_argument('--watch',action='store_true');fetch.add_argument('--cache',required=True);fetch.add_argument('--workers',type=int,default=3)
    package=sub.add_parser('build');package.add_argument('--seed',required=True);package.add_argument('--official',required=True);package.add_argument('--official-manifest',required=True);package.add_argument('--cache',required=True);package.add_argument('--output',default=str(ROOT/'cases'));package.add_argument('--shard-size',type=int,default=128);package.add_argument('--allow-incomplete',action='store_true',help='Internal QA only: expose exact incomplete coverage in manifest')
    args=parser.parse_args()
    if args.command=='fetch':fetch_missing(args)
    else:build(args)

if __name__=='__main__':main()
