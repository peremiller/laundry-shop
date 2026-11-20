import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Execute the exact inline functions used by the published HTML. There is no
// duplicate validator implementation that could pass while the UI is broken.
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=html.indexOf("function isValidLaundryBackup(data){");
const end=html.indexOf("/* ============================== modal",start);
assert.ok(start>0&&end>start,"SudsFlow import implementation must exist");
const code=html.slice(start,end);
const sample={
  services:[{id:"service-1",name:"Wash",unit:"kg",rate:35,min:0}],
  addons:[{id:"addon-1",name:"Softener",price:12}],
  customers:[{id:"customer-1",name:"Sample Customer"}],
  orders:[{id:"order-1",items:[{serviceId:"service-1",qty:2,rate:35,amount:70}],addons:[]}],
  settings:{shopName:"Demo"},counter:1002
};
function exercise(contents,{allow=true,failWrite=false,readError=false}={}){
  const messages=[],writes=[];
  let confirms=0,renders=0;
  const previous={orders:[{id:"existing-order"}],customers:[{id:"existing-customer"}]};
  class FakeReader{
    readAsText(file){
      if(readError){this.onerror();return;}
      this.result=file.contents;
      this.onload();
    }
  }
  const env={
    FileReader:FakeReader,LS:"sudsflow-data",state:previous,
    normalize:d=>d,
    localStorage:{setItem(key,value){
      if(failWrite)throw Error("Storage denied");
      writes.push({key,value});
    }},
    confirm(){confirms++;return allow;},
    render(){renders++;},
    toast(message){messages.push(message);}
  };
  runInNewContext(code+"\nimportJSON({contents: "+JSON.stringify(contents)+"});",env);
  return {state:env.state,previous,messages,writes,confirms,renders};
}

test("valid exported backup restores once only after confirmation",()=>{
  const result=exercise(JSON.stringify(sample));
  assert.equal(result.confirms,1);
  assert.equal(result.writes.length,1);
  assert.equal(result.writes[0].key,"sudsflow-data");
  assert.deepEqual(JSON.parse(result.writes[0].value),sample);
  assert.equal(result.renders,1);
  assert.equal(result.messages.at(-1),"Imported");
});
test("unrelated JSON cannot wipe existing orders",()=>{
  const result=exercise(JSON.stringify({unrelated:true}));
  assert.strictEqual(result.state,result.previous);
  assert.equal(result.confirms,0);
  assert.equal(result.writes.length,0);
  assert.match(result.messages.at(-1),/not changed/i);
});
test("malformed orders and missing collection groups are rejected",()=>{
  for(const payload of [
    {...sample,orders:[null]},
    {...sample,orders:[{id:"x",items:"oops"}]},
    {...sample,services:null},
    {...sample,customers:[{id:"c",name:2}]},
    {...sample,settings:"invalid"},
  ]){
    const result=exercise(JSON.stringify(payload));
    assert.strictEqual(result.state,result.previous);
    assert.equal(result.writes.length,0);
    assert.equal(result.confirms,0);
  }
});
test("malformed JSON and failed file reading preserve saved workspace",()=>{
  for(const result of [exercise("{oops"),exercise("ignored",{readError:true})]){
    assert.strictEqual(result.state,result.previous);
    assert.equal(result.writes.length,0);
    assert.equal(result.confirms,0);
  }
});
test("canceling import makes no changes",()=>{
  const result=exercise(JSON.stringify(sample),{allow:false});
  assert.strictEqual(result.state,result.previous);
  assert.equal(result.writes.length,0);
  assert.equal(result.renders,0);
});
test("denied browser storage prevents replacing active workspace",()=>{
  const result=exercise(JSON.stringify(sample),{failWrite:true});
  assert.strictEqual(result.state,result.previous);
  assert.equal(result.writes.length,0);
  assert.equal(result.renders,0);
  assert.match(result.messages.at(-1),/not changed/i);
});
test("intentional empty but structurally complete backup is supported",()=>{
  const result=exercise(JSON.stringify({...sample,services:[],addons:[],customers:[],orders:[]}));
  assert.equal(result.writes.length,1);
  assert.equal(result.renders,1);
});


test("order status chips announce active filtering and retain the selected order list",()=>{
  const begin=html.indexOf("function renderOrders(){");
  const finish=html.indexOf("/* ============================== order detail",begin);
  assert.ok(begin>0&&finish>begin,"Use exact production order list renderer");
  const context={
    state:{orders:[
      {id:"ready-1",status:"ready",created:2},
      {id:"claimed-1",status:"claimed",created:1},
    ]},
    STATUSES:[["ready","Ready"],["claimed","Claimed"]],
    orderFilter:"ready",
    orderQuery:"",
    esc:value=>value,
    orderCard:order=>'<article data-order="'+order.id+'"></article>',
  };
  const markup=runInNewContext(html.slice(begin,finish)+"\nrenderOrders()",context);
  assert.match(markup,/data-filter="ready" aria-pressed="true"/);
  assert.match(markup,/data-filter="all" aria-pressed="false"/);
  assert.match(markup,/data-order="ready-1"/);
  assert.doesNotMatch(markup,/data-order="claimed-1"/);
  assert.match(html,/replacement\?\.focus\(\{preventScroll:true\}\)/);
  assert.match(html,/button:focus-visible,a:focus-visible/);
  assert.doesNotMatch(html,/outline:3px solid rgba\(20,184,166,\.3\)/);
});
