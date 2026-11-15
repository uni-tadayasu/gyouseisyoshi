import importlib.util,json,tempfile,unittest,gzip,types,contextlib,io
from unittest.mock import patch
from pathlib import Path
SPEC=importlib.util.spec_from_file_location('court_import',Path(__file__).resolve().parents[1]/'tools/import-court-cases.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

class CourtImportTests(unittest.TestCase):
 def test_source_urls_are_restricted(self):
  self.assertTrue(M.court_url('https://www.courts.go.jp/assets/hanrei/hanrei-pdf-1.pdf'))
  for url in ['http://www.courts.go.jp/a.pdf','https://www.courts.go.jp.evil.test/a.pdf','https://www.courts.go.jp@evil.test/a.pdf','file:///etc/passwd']:
   self.assertFalse(M.court_url(url))
 def test_japanese_date_and_text_normalization(self):
  self.assertEqual(M.date_iso({'era':'Showa','year':22,'month':9,'day':15}),'1947-09-15')
  self.assertEqual(M.date_iso({'era':'Reiwa','year':8,'month':11,'day':11}),'2026-11-11')
  self.assertEqual(M.clean_text(' 判決\x00\r\n本文 '),'判決\n本文')
 def test_duplicate_categories_preserve_available_full_text(self):
  with tempfile.TemporaryDirectory() as tmp:
   directory=Path(tmp)/'precedent/2020';directory.mkdir(parents=True)
   for name,row in [('a',{'lawsuit_id':'1','contents':'a'*25}),('b',{'lawsuit_id':'1'}),('c',{'lawsuit_id':'1','contents':'b'*50})]:
    (directory/(name+'.json')).write_text(json.dumps(row))
   (directory/'list.json').write_text('[]')
   result=M.seed_records(tmp)
   self.assertEqual(len(result),1);self.assertEqual(result['1']['contents'],'b'*50)
 def test_compressed_output_is_reproducible_and_has_integrity_metadata(self):
  with tempfile.TemporaryDirectory() as tmp:
   first=M.write_gzip(Path(tmp)/'a.gz',{'1':'本文'})
   second=M.write_gzip(Path(tmp)/'b.gz',{'1':'本文'})
   self.assertEqual(first,second)
   self.assertGreater(first['bytes'],0)

 def test_partial_ocr_is_explicit_and_does_not_count_as_full_body(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);seed=root/'seed/precedent/2020';seed.mkdir(parents=True)
   (seed/'record.json').write_text(json.dumps({'lawsuit_id':'1'}))
   official=root/'index.json';official.write_text(json.dumps([{'id':'1','title':'判決','court':'最高裁判所','caseNumber':'令和1(オ)1','date':'2020-01-01','sourceUrl':'https://www.courts.go.jp/hanrei/1/detail2/index.html'}]))
   manifest=root/'source.json';manifest.write_text('{"total":1}')
   cache=root/'cache';cache.mkdir()
   (cache/'1.json').write_text(json.dumps({'id':'1','status':'ocr-partial','text':'読み取れた判決文。'*5+'[2ページは文字認識できません]','ocr':{'failedPages':[2],'pageCount':2}}))
   args=types.SimpleNamespace(seed=root/'seed',official=official,official_manifest=manifest,cache=cache,output=root/'out',shard_size=128,allow_incomplete=False)
   with patch.object(M.subprocess,'check_output',return_value='a'*40),contextlib.redirect_stdout(io.StringIO()):M.build(args)
   result=json.loads((root/'out/manifest.json').read_text())
   row=json.loads(gzip.decompress((root/'out/index.json.gz').read_bytes()))[0]
   self.assertEqual(result['bodyCount'],1);self.assertEqual(result['fullBodyCount'],0);self.assertEqual(result['partialBodyCount'],1)
   self.assertTrue(row['hasText']);self.assertEqual(row['textStatus'],'ocr-partial');self.assertEqual(row['ocrFailedPages'],[2]);self.assertEqual(row['ocrPageCount'],2)

if __name__=='__main__':unittest.main()
