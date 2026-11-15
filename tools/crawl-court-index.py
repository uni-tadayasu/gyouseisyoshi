#!/usr/bin/env python3
"""Checkpointed low-concurrency inventory of the courts.go.jp integrated search."""
import argparse, concurrent.futures, datetime, gzip, html, json, pathlib, re, time, urllib.parse, urllib.request
ROOT=pathlib.Path("work/court-index")
BASE='https://www.courts.go.jp/hanrei/search1/index.html'
PARAMS={'filter[judgeDateMode]':'2','filter[judgeGengoFrom]':'昭和','filter[judgeYearFrom]':'1','filter[judgeMonthFrom]':'12','filter[judgeDayFrom]':'25'}
CACHE=ROOT/'official-pages'
def clean(s):
 return html.unescape(re.sub('<[^>]+>','',re.sub(r'<br\s*/?>','\n',s,flags=re.I))).strip()
def lines(s):
 return [re.sub(r'\s+',' ',x).strip() for x in clean(s).splitlines() if x.strip()]
def date_iso(s):
 m=re.search(r'(昭和|平成|令和)(元|\d+)年(\d+)月(\d+)日',s)
 if not m:return ''
 era,y,mn,d=m.groups(); y=1 if y=='元' else int(y)
 return f'{dict(昭和=1925,平成=1988,令和=2018)[era]+y:04d}-{int(mn):02d}-{int(d):02d}'
def parse(s,offset):
 n=re.search(r'(\d+)件中\s*(\d+)～(\d+)件を表示',s)
 if not n:raise ValueError('No count/range in search result')
 total,start,end=map(int,n.groups())
 if start != offset+1: raise ValueError(f'Wrong pagination: {offset=} {start=}')
 table=re.search(r'<table class="[^"]*search-result-table[^"]*">(.*?)</table>',s,re.S)
 if not table: raise ValueError('No result table')
 records=[]
 for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table.group(1),re.S):
  links=re.findall(r'<a[^>]+href="([^"]+/([0-9]+)/detail[0-9]+/index.html)"[^>]*>(.*?)</a>',row,re.S)
  if not links:raise ValueError('Row without case link')
  id=links[0][1]
  cells=re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)
  ps=re.findall(r'<p[^>]*>(.*?)</p>',cells[0],re.S)
  p1=lines(ps[0]);p2=lines(ps[1])
  dates=[x for x in p2 if date_iso(x)]
  pdfs=[urllib.parse.urljoin(BASE,html.unescape(u)) for u in re.findall(r'href="([^"]+\.pdf)"',row)]
  kindIndex=next((i for i,x in enumerate(p2) if x in ('判決','決定','命令')),None)
  courtStart=next((i+1 for i,x in enumerate(p2) if date_iso(x)),0)
  court=' '.join(p2[courtStart:kindIndex]) if kindIndex is not None else (p2[courtStart] if len(p2)>courtStart else '')
  record={'id':id,'title':' '.join(p1[1:]) or p1[0], 'caseNumber':p1[0], 'date':date_iso(dates[0]) if dates else '', 'court':court, 'category':clean(links[0][2]), 'classifications':list(dict.fromkeys(clean(x[2]) for x in links)), 'sourceUrl':urllib.parse.urljoin(BASE,links[0][0]), 'pdfUrl':pdfs[0] if pdfs else '', 'pdfUrls':pdfs, 'summary':' '.join(' '.join(lines(p)) for p in ps[2:]).strip(), 'judgmentType':p2[kindIndex] if kindIndex is not None else '', 'result':p2[kindIndex+1] if kindIndex is not None and len(p2)>kindIndex+1 else '', 'originalCourt':' '.join(p2[kindIndex+2:]) if kindIndex is not None else '', 'courtDetails':p2}
  records.append(record)
 if len(records)!=end-start+1:raise ValueError(f'Wrong row count {len(records)} vs {end-start+1}')
 return {'offset':offset,'total':total,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'records':records}
def fetch(offset):
 path=CACHE/f'{offset:06d}.json'
 if path.exists():return json.loads(path.read_text())
 url=BASE+'?'+urllib.parse.urlencode({**PARAMS,'offset':offset})
 for attempt in range(5):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'PublicCaseLawStudyLibrary/1.0 (low-concurrency public index verification)','Accept-Encoding':'gzip'})
   with urllib.request.urlopen(req,timeout=35) as r:
    body=r.read();body=gzip.decompress(body) if r.headers.get('Content-Encoding')=='gzip' else body;s=body.decode('utf-8')
   data=parse(s,offset)
   temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False));temp.replace(path)
   return data
  except Exception as exc:
   if attempt==4:raise
   print(f'retry {offset} {attempt+1} {type(exc).__name__}: {exc}',flush=True);time.sleep(1+attempt*2)
def main():
 global ROOT,CACHE
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--output',type=pathlib.Path,default=ROOT,help='Checkpoint/output directory (default: work/court-index)')
 parser.add_argument('--workers',type=int,default=3,choices=range(1,7),help='Concurrent requests, maximum 6')
 args=parser.parse_args();ROOT=args.output.resolve();CACHE=ROOT/'official-pages';CACHE.mkdir(parents=True,exist_ok=True)
 first=fetch(0);total=first['total'];records=[];failed=[];done=0;start=time.monotonic()
 offsets=list(range(0,total,30))
 print(f'Start {total} records, {len(offsets)} pages; {args.workers} workers',flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
  futures={ex.submit(fetch,o):o for o in offsets}
  for fut in concurrent.futures.as_completed(futures):
   off=futures[fut]
   try: records.extend(fut.result()['records'])
   except Exception as exc:failed.append({'offset':off,'error':str(exc)});print(f'FAILED {off} {exc}',flush=True)
   done+=1
   if done%25==0 or done==len(offsets):print(f'{done}/{len(offsets)} pages; {len(records)} rows; {time.monotonic()-start:.1f}s; errors={len(failed)}',flush=True)
 byid={r['id']:r for r in records};out=sorted(byid.values(),key=lambda r:(r['date'],r['id']),reverse=True)
 manifest={'sourceUrl':BASE+'?'+urllib.parse.urlencode(PARAMS),'total':total,'expectedTotal':total,'rows':len(records),'uniqueIds':len(byid),'pages':len(offsets),'failed':failed,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'complete':not failed and len(byid)==total,'licenseNote':'Court judgments are public judicial materials; inventory describes the public court search, not every judgment ever rendered.'}
 (ROOT/'official-index.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
 (ROOT/'official-index-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 print(json.dumps(manifest,ensure_ascii=False),flush=True)
 if not manifest['complete']:raise SystemExit(2)
if __name__=='__main__':main()
