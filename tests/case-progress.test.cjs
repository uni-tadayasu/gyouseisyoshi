const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{addEventListener(){}},document:{addEventListener(){}},console,URL,URLSearchParams};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../case-law.js'),'utf8'),context);
const {cleanProgress}=context.window.GYOSHI_CASES;

test('case progress beyond the first 5000 records survives backup normalization',()=>{
 const source=Object.fromEntries(Array.from({length:6000},(_,i)=>[String(i+1),{bookmarked:true,status:'mastered',note:'メモ'+i,marks:[]}]));
 const restored=cleanProgress(JSON.parse(JSON.stringify(source)));
 assert.equal(Object.keys(restored).length,6000);
 assert.equal(restored['6000'].note,'メモ5999');
 assert.equal(restored['6000'].status,'mastered');
});

test('malformed imported markers and prototype keys cannot alter progress',()=>{
 const source=JSON.parse('{"__proto__":{"bookmarked":true},"constructor":{},"1":{"bookmarked":true,"status":"invalid","note":"学習メモ","marks":[{"start":0,"end":2,"quote":"条文","color":"yellow"},{"start":-1,"end":2,"quote":"条文","color":"blue"},{"start":0,"end":9,"quote":"短い","color":"pink"}]}}');
 const restored=cleanProgress(source);
 assert.equal(Object.getPrototypeOf(restored),null);
 assert.deepEqual(Object.keys(restored),['1']);
 assert.equal(restored['1'].status,'unread');
 assert.equal(restored['1'].marks.length,1);
 assert.equal(restored['1'].marks[0].quote,'条文');
});
