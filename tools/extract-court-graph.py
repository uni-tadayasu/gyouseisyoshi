#!/usr/bin/env python3
"""Extract published court metadata from the CC BY 4.0 KGraphNavi release.

Only metadata copied from courts.go.jp is used. Inferred topics, automatically
inferred holdings, and third-party Wikipedia/DBpedia content are excluded.
"""
import argparse,gzip,json,re
from pathlib import Path

SOURCE='https://github.com/JurisInformaticsCenter/KGraphNavi/releases/tag/caselaw-data-2026.10'
SUBJECT=re.compile(rb'^caselaw:([DJT])(\d{6})\s*$')
PROPERTY=re.compile(r'<http://ds\.rois\.ac\.jp/caselaw/property/([^>]+)>\s+(.*)')
LITERAL=re.compile(r'"((?:\\.|[^"\\])*)"')
FIELDS={'judgmentdate':'date','caseno':'caseNumber','casename':'title','court':'court','判示事項':'summary','裁判要旨':'holding','参照法条':'lawReferences','裁判種別':'judgmentType','disposition_meta':'result','原審裁判所名':'originalCourt'}

def parse(path):
    records={};active=None;count=0
    with gzip.open(path,'rb') as stream:
        for raw in stream:
            if raw.startswith(b'caselaw:'):
                match=SUBJECT.match(raw)
                active=str(int(match.group(2))) if match else None
                continue
            if not active or not raw[:1].isspace():continue
            if b'/property/' not in raw and b'foaf:primaryTopic ' not in raw:continue
            line=raw.decode('utf-8')
            if 'foaf:primaryTopic ' in line:
                match=re.search(r'<(https://www\.courts\.go\.jp/[^>]+)>',line)
                if match:
                    row=records.setdefault(active,{'id':active});row['pdfUrl']=match.group(1)
                continue
            match=PROPERTY.search(line)
            if not match:continue
            prop,value=match.groups()
            if prop not in FIELDS and prop!='caselawcategory':continue
            literal=LITERAL.search(value)
            if literal:
                decoded=json.loads('"'+literal.group(1)+'"')
            else:
                decoded=value.split(';')[0].strip().removeprefix('caselawo:')
            row=records.setdefault(active,{'id':active})
            if prop=='caselawcategory':
                row.setdefault('classifications',[])
                if decoded not in row['classifications']:row['classifications'].append(decoded)
                row['category']=row['classifications'][0]
            else:row[FIELDS[prop]]=decoded
    results=[]
    for row in records.values():
        if not row.get('pdfUrl'):continue
        row['sourceUrl']='https://www.courts.go.jp/hanrei/'+row['id']+'/detail2/index.html'
        row['metadataSource']='KGraphNavi-2026.10'
        results.append(row)
    results.sort(key=lambda r:(r.get('date',''),int(r['id'])),reverse=True)
    return results

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('input');ap.add_argument('output');args=ap.parse_args()
    rows=parse(args.input)
    Path(args.output).write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
    print('Graph metadata',len(rows),'range',min(x.get('date','') for x in rows),max(x.get('date','') for x in rows),flush=True)
    if len(rows)!=67825:raise SystemExit('Unexpected graph count; do not claim complete coverage')
