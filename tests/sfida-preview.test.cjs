'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createService,verify,PRODUCT} = require('../api/_lib/sfida-preview');
const secret = 'a'.repeat(64), instant = Date.UTC(2026,8,29,10);
const env = {SFIDA_PREVIEW_SECRET:secret};
const input = {name:'Prova', email:'prova@example.com', terms:true, requestId:'e29846f9-b5b8-4827-942f-97c609929866'};
const make = (vars = {}, options = {}) => createService({...env,...vars},{now:()=>instant,...options});
const fails = (operation,status) => assert.rejects(operation,error=>error.status === status);
test('production and missing signing secret disable the endpoint',async()=>{
 await fails(make({VERCEL_ENV:'production'}).run('config'),503);
 await fails(createService({}).run('create',input),503);
});
test('catalog is authoritative even when client submits a different price/product',async()=>{
 const svc = make(); const created = await svc.run('create',{...input,amount:1,product:'sfida-7-giorni'});
 const order = verify(created.ticket,secret,'checkout',instant);
 assert.equal(order.amount,3700);assert.equal(order.product,PRODUCT);assert.equal(created.mode,'simulation');
});
test('invalid email, missing terms and arbitrary id are rejected',async()=>{
 for (const bad of [{email:'x'},{terms:false},{requestId:'../anything'}]) await fails(make().run('create',{...input,...bad}),400);
});
test('first observation is server dated, stable on return, not provided by browser',async()=>{
 const first = await make().run('visit',{consent:true,firstSeen:instant-100000000,attribution:{utm_campaign:'prima'}});
 const second = await make({}, {now:()=>instant+5*86400000}).run('visit',{consent:true,visit:first.visit,attribution:{utm_campaign:'seconda'}});
 assert.equal(first.firstSeen,instant);assert.equal(second.firstSeen,instant);assert.equal(second.eligibleAfter,instant+10*86400000);
 const created=await make().run('create',{...input,consent:true,visit:second.visit,attribution:{utm_campaign:'seconda'}});
 const order=verify(created.ticket,secret,'checkout',instant);assert.equal(order.first.utm_campaign,'prima');assert.equal(order.last.utm_campaign,'seconda');
});
test('no marketing consent means no attribution or Purchase advertising payload',async()=>{
 const svc=make();const created=await svc.run('create',{...input,attribution:{utm_campaign:'should-not-save'}});
 const paid=await svc.run('complete',{ticket:created.ticket,outcome:'success'});
 const receipt=await svc.run('receipt',{receipt:paid.receipt});
 assert.equal(receipt.tracking,null);assert.equal(receipt.attribution,null);assert.equal(receipt.firstSeen,null);assert.equal(receipt.accessActivated,false);
});
test('decline and a pending ticket cannot register a purchase',async()=>{
 const svc=make();const created=await svc.run('create',input);
 await fails(svc.run('complete',{ticket:created.ticket,outcome:'declined'}),402);
 await fails(svc.run('receipt',{receipt:created.ticket}),400);
 await fails(svc.run('receipt',{}),400);
});
test('tampered and expired tickets fail',async()=>{
 const svc=make();const created=await svc.run('create',input);
 const pieces=created.ticket.split('.');const data=JSON.parse(Buffer.from(pieces[0],'base64url'));data.amount=1;
 const tampered=Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+pieces[1];
 await fails(svc.run('complete',{ticket:tampered,outcome:'success'}),400);
 await fails(make({}, {now:()=>instant+2*86400000}).run('complete',{ticket:created.ticket,outcome:'success'}),400);
});
test('browser/server use same Purchase ID; receipt reload preserves identity',async()=>{
 const svc=make();const created=await svc.run('create',{...input,consent:true});
 const paid=await svc.run('complete',{ticket:created.ticket,outcome:'success'});
 const r=await svc.run('receipt',{receipt:paid.receipt});const again=await svc.run('receipt',{receipt:paid.receipt});
 assert.equal(r.tracking.browser.eventID,r.tracking.server.event_id);assert.deepEqual(r,again);
 assert.equal(r.tracking.server.custom_data.value,37);assert.equal(r.tracking.sent,false);
});
test('campaign metadata discards emails and arbitrary parameters',async()=>{
 const svc=make();const created=await svc.run('create',{...input,consent:true,attribution:{utm_campaign:'a@example.com',utm_content:'https://private.example',email:'x@example.com',ad_id:'12345'}});
 const order=verify(created.ticket,secret,'checkout',instant);assert.deepEqual(order.last,{ad_id:'12345'});
});
function stripeFixture(overrides={}) {
 let params,options;
 const session={id:'cs_test_123',url:'https://checkout.stripe.com/c/pay/cs_test_123',livemode:false,payment_status:'paid',status:'complete',amount_total:3700,currency:'eur',metadata:{product:PRODUCT},client_reference_id:input.requestId,created:instant/1000,...overrides};
 const stripe={checkout:{sessions:{create:async(p,o)=>{params=p;options=o;return session;},retrieve:async()=>session}}};
 return {stripe,getParams:()=>params,getOptions:()=>options};
}
const stripeEnv={SFIDA_PREVIEW_MODE:'stripe-test',SFIDA_STRIPE_TEST_SECRET_KEY:'sk_test_fake',SFIDA_PREVIEW_BASE_URL:'https://preview.example'};
test('Stripe refuses live or absent dedicated test key, never reuses production env',async()=>{
 await fails(make({...stripeEnv,SFIDA_STRIPE_TEST_SECRET_KEY:'sk_live_fake'}).run('create',input),503);
 await fails(make({...stripeEnv,SFIDA_STRIPE_TEST_SECRET_KEY:'',STRIPE_SECRET_KEY:'sk_test_other'}).run('create',input),503);
});
test('Stripe creates a one-time test offer with idempotency and verified receipt',async()=>{
 const fixture=stripeFixture();const svc=make(stripeEnv,{stripe:fixture.stripe});
 const created=await svc.run('create',input);const receipt=await svc.run('receipt',{ticket:created.ticket});
 assert.equal(fixture.getParams().line_items[0].price_data.unit_amount,3700);assert.equal(fixture.getParams().metadata.product,PRODUCT);
 assert.equal(fixture.getOptions().idempotencyKey,'sfida37-preview-'+input.requestId);assert.equal(receipt.status,'paid');
 await fails(svc.run('complete',{ticket:created.ticket,outcome:'success'}),400);
});
test('Stripe pending/wrong amount/another product or order cannot be confirmed',async()=>{
 for (const override of [{payment_status:'unpaid'},{amount_total:2700},{metadata:{product:'sfida-7-giorni'}},{client_reference_id:'other'}]) {
  const fixture=stripeFixture(override);const svc=make(stripeEnv,{stripe:fixture.stripe});const created=await svc.run('create',input);
  await fails(svc.run('receipt',{ticket:created.ticket}),409);
 }
});
