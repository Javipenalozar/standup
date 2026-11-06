'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { EVENT } = require('../event-config');
for (const statuses of [['paid','paid'], ['paid','pending'], ['paid','cancelled']]) {
 test('ticket verification requires every grouped seat paid: '+statuses.join('/'), async()=>{
  const saved = { ...process.env };
  const original = https.get;
  Object.assign(process.env,{ENABLE_REAL_PAYMENTS:'true',EVENT_RELEASE_ID:EVENT.id,SUPABASE_URL:'https://db.test',SUPABASE_KEY:'test'});
  let requested;
  https.get = (options,callback)=>{
   requested = options.path;
   const req = new EventEmitter();
   process.nextTick(()=>{
    const res = new EventEmitter(); callback(res);
    res.emit('data',JSON.stringify(statuses.map((status,i)=>({payment_status:status,seat_id:'C-'+(12+i),customer_name:'Prueba',customer_email:'test@example.invalid',amount:0,invitation_code:'ADMIN-CORTESIA-TEST'}))));
    res.emit('end');
   }); return req;
  };
  try {
   const response = await require('../netlify/functions/verify-bold-payment').handler({queryStringParameters:{ref:'ST-18FEB27-TEST'}});
   const body = JSON.parse(response.body);
   assert.equal(response.statusCode,200);
   assert.equal(body.status,statuses.every(s=>s==='paid')?'paid':'pending');
   assert.equal(body.courtesy,true);
   assert.deepEqual(body.seats,['C-12','C-13']);
   assert.match(requested,new RegExp(encodeURIComponent(EVENT.id)));
   assert.equal(response.headers['Cache-Control'],'no-store');
   assert.notEqual(body.email,'test@example.invalid');
  } finally {
   https.get=original;
   for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
   Object.assign(process.env,saved);
  }
 });
}
