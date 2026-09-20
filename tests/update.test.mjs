import test from 'node:test';
import assert from 'node:assert/strict';
import {updateUrl,readBuild} from '../src/update.js';
test('update URL preserves app path, unrelated query and hash',()=>{
 assert.equal(updateUrl('https://example.test/Oc/?a=1#review','abcdef012345'),'https://example.test/Oc/?a=1&oc-build=abcdef012345#review');
 assert.equal(updateUrl('https://example.test/Oc/?oc-build=000000000000','abcdef012345'),'https://example.test/Oc/?oc-build=abcdef012345');
});
test('update rejects invalid build targets',()=>{
 for(const value of ['','../StrForge','https://elsewhere','ABCDEF012345','<script>'])assert.throws(()=>updateUrl('https://example.test/Oc/',value));
});
const doc=(meta,script)=>({querySelector(selector){return selector.startsWith('meta')?{content:meta}:{getAttribute:()=>script};}});
test('entry must have matching content identity and module reference',()=>{
 assert.equal(readBuild(doc('abcdef012345','src/app.js?build=abcdef012345')),'abcdef012345');
 assert.throws(()=>readBuild(doc('abcdef012345','src/app.js?build=000000000000')),/正在更新/);
 assert.throws(()=>readBuild(doc(undefined,'src/app.js')),/正在更新/);
});
