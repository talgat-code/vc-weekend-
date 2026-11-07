import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,demoCases,paymentFields} from './analysis.js';
test('25 полей и чистый кейс',()=>{assert.equal(paymentFields.length,25);const r=analyze(demoCases[0]);assert.equal(r.status,'draft-review');assert.equal(r.metrics.blockingCount,0);assert.equal(r.fields.amount,25500);});
test('без IBAN черновик требует исправления',()=>{const r=analyze(demoCases[1]);assert.equal(r.status,'needs-correction');assert.equal(r.fields.beneficiaryIban,null);assert.ok(r.issues.some(x=>x.code==='MISSING_IBAN'));});
test('конфликт сумм виден после правки',()=>{const r=analyze({...demoCases[2],edits:{amount:51000}});assert.equal(r.status,'needs-correction');assert.ok(r.issues.some(x=>x.code==='AMOUNT_EXCEEDS_CONTRACT'));assert.equal(r.metrics.correctedFieldCount,1);});
