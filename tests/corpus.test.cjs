/* Run after tools/import-court-cases.py build; checks the actual shipped corpus. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const root=process.env.COURT_CORPUS_DIR?path.resolve(process.env.COURT_CORPUS_DIR):path.join(__dirname,'..','cases');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const indexBytes=fs.readFileSync(path.join(root,manifest.index));
const rows=JSON.parse(zlib.gunzipSync(indexBytes));

test('metadata matches independently observed official total and contains unique stable IDs',()=>{
 assert.equal(manifest.coverageComplete,true);
 assert.equal(rows.length,manifest.total);
 assert.equal(manifest.total,manifest.officialTotal);
 assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
 assert.equal(digest(indexBytes),manifest.indexStats.sha256);
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  assert.match(row.id,/^\d+$/);
  assert.ok(row.title&&row.court,`missing identity ${row.id}`);
  assert.equal(typeof row.caseNumber,'string');
  assert.match(row.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new URL(row.sourceUrl).hostname,'www.courts.go.jp');
  if(row.pdfUrl)assert.equal(new URL(row.pdfUrl).hostname,'www.courts.go.jp');
  if(i)assert.ok(rows[i-1].date>=row.date,'newest first');
  assert.equal(row.hasText,Boolean(row.bodyShard));
 }
});

test('every advertised body exists, belongs to its shard, and matches manifest integrity/counts',()=>{
 const byId=new Map(rows.map(row=>[row.id,row]));
 const found=new Set();let corpusBytes=indexBytes.length;
 for(const shard of manifest.bodyShards){
  assert.match(shard.path,/^text\/\d{4}\.json\.gz$/);
  const bytes=fs.readFileSync(path.join(root,shard.path));
  assert.equal(bytes.length,shard.bytes);assert.equal(digest(bytes),shard.sha256);
  assert.ok(bytes.length<100*1024*1024,'GitHub file limit');
  corpusBytes+=bytes.length;
  const texts=JSON.parse(zlib.gunzipSync(bytes));
  assert.equal(Object.keys(texts).length,shard.count);
  for(const [id,text] of Object.entries(texts)){
   assert.equal(byId.get(id)?.bodyShard,shard.path,`wrong shard ${id}`);
   assert.ok(typeof text==='string'&&text.trim().length>=20,`empty text ${id}`);
   assert.ok(!found.has(id),`duplicate body ${id}`);found.add(id);
  }
 }
 assert.equal(found.size,manifest.bodyCount);
 assert.equal(rows.filter(row=>row.hasText).length,manifest.bodyCount);
 assert.equal(manifest.total-manifest.bodyCount,manifest.missingBodyCount);
 assert.ok(corpusBytes<900*1024*1024,'leave space below GitHub Pages 1GB limit');
});

test('sources and licenses survive transformation and extraction failures remain visible',()=>{
 assert.ok(manifest.attribution.some(source=>source.license==='CC BY 4.0'&&source.changes));
 assert.ok(manifest.attribution.some(source=>source.license==='CC0-1.0'));
 const missing=JSON.parse(fs.readFileSync(path.join(root,'missing-text.json')));
 assert.equal(missing.length,manifest.missingBodyCount);
 assert.deepEqual(new Set(missing.map(row=>row.id)),new Set(rows.filter(row=>!row.hasText).map(row=>row.id)));
});

test('coverage evidence reconciles every year, newly published IDs, and removed records',()=>{
 const proof=manifest.officialIndex;
 assert.equal(proof.complete,true);
 assert.equal(proof.total,manifest.officialTotal);
 if(proof.snapshotCount){
  assert.equal(proof.snapshotCount+proof.newIds.length-proof.removed.length,manifest.total);
  assert.equal(proof.snapshotSource.publisherChecksumVerified,true);
  assert.match(proof.snapshotSource.archiveSha256,/^[a-f0-9]{64}$/);
  const ids=new Set(rows.map(row=>row.id));
  for(const removed of proof.removed){assert.equal(removed.status,404);assert.ok(!ids.has(removed.id));}
  const counts=new Map();
  for(const row of rows){const year=Number(row.date.slice(0,4));counts.set(year,(counts.get(year)||0)+1);}
  assert.equal(proof.annualVerification.length,counts.size);
  for(const year of proof.annualVerification){
   assert.equal(year.inventoryCount,counts.get(year.year));
   assert.equal(year.total+year.blankDisplayDatesRecovered,year.inventoryCount);
  }
 }
});
