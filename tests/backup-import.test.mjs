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
function exercise(contents,{allow=true,failWrite=false,readError=false,silentWrite=false}={}){
  const messages=[],writes=[];
  let confirms=0,renders=0,stored=null;
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
      if(!silentWrite){writes.push({key,value});stored=value;}
    },getItem(){return stored;}},
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
test("silently rejected storage write preserves active workspace",()=>{
  const result=exercise(JSON.stringify(sample),{silentWrite:true});
  assert.strictEqual(result.state,result.previous);
  assert.equal(result.renders,0);
  assert.equal(result.writes.length,0);
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


test("modal keyboard focus stays inside, Escape closes and original trigger regains focus",()=>{
  const begin=html.indexOf("let modalRestoreFocus=null;");
  const end=html.indexOf("/* ============================== FAB",begin);
  assert.ok(begin>0&&end>begin,"Execute the real SudsFlow modal implementation");
  const document={activeElement:null};
  const trigger={isConnected:true,focus(){document.activeElement=this;}};
  const close={hidden:false,getClientRects(){return [1];},focus(){document.activeElement=this;}};
  const cancel={hidden:false,getClientRects(){return [1];},focus(){document.activeElement=this;}};
  const root={innerHTML:""};
  const backdrop={id:"mBack"};
  const dialog={
    onKey:null,
    addEventListener(name,handler){if(name==="keydown")this.onKey=handler;},
    querySelectorAll(){return [close,cancel];},
    contains(node){return node===this||node===close||node===cancel;},
    focus(){document.activeElement=this;}
  };
  const nodes={"#modalRoot":root,"#mBack":backdrop,"#mClose":close,"#mBack .modal":dialog};
  const context={document,$:selector=>nodes[selector]};
  trigger.focus();
  runInNewContext(html.slice(begin,end),context);
  context.openModal("<button>Cancel</button>");
  assert.strictEqual(document.activeElement,close,"opening the dialog moves focus inside");
  assert.match(root.innerHTML,/aria-modal="true"/);
  assert.match(root.innerHTML,/tabindex="-1"/);
  function keyboard(key,shiftKey=false){
    let prevented=false;
    dialog.onKey({key,shiftKey,preventDefault(){prevented=true;}});
    return prevented;
  }
  cancel.focus();
  assert.equal(keyboard("Tab"),true);
  assert.strictEqual(document.activeElement,close,"Tab cycles from last to first");
  assert.equal(keyboard("Tab",true),true);
  assert.strictEqual(document.activeElement,cancel,"Shift+Tab cycles first to last");
  assert.equal(keyboard("Escape"),true);
  assert.equal(root.innerHTML,"");
  assert.strictEqual(document.activeElement,trigger,"Escape restores launch focus");
  context.openModal("<p>Review</p>");
  assert.strictEqual(document.activeElement,close);
  backdrop.onclick({target:{id:"mBack"}});
  assert.strictEqual(document.activeElement,trigger,"backdrop dismissal restores focus");
});

test("closing a modal avoids focusing a removed launch control",()=>{
  const begin=html.indexOf("let modalRestoreFocus=null;");
  const end=html.indexOf("/* ============================== FAB",begin);
  const document={activeElement:null};
  let focusCalls=0;
  const removed={isConnected:true,focus(){focusCalls++;document.activeElement=this;}};
  const close={focus(){document.activeElement=this;}};
  const root={innerHTML:""};
  const dialog={addEventListener(){},querySelectorAll(){return[];}};
  const nodes={"#modalRoot":root,"#mBack":{},"#mClose":close,"#mBack .modal":dialog};
  const context={document,$:selector=>nodes[selector]};
  removed.focus();
  runInNewContext(html.slice(begin,end),context);
  context.openModal("<p>Review</p>");
  removed.isConnected=false;
  context.closeModal();
  assert.equal(focusCalls,1,"do not refocus a removed trigger after a rerender");
  assert.equal(root.innerHTML,"");
});


test("startup preserves saved bytes and refuses malformed or inaccessible storage",()=>{
  const begin=html.indexOf("function boot(){"), end=html.indexOf("const custById",begin);
  const start=html.indexOf("function isValidLaundryBackup(data){"), finish=html.indexOf("function importJSON",start);
  assert.ok(begin>0&&end>begin&&start>0&&finish>start);
  const bootCode=html.slice(start,finish)+html.slice(begin,end)+"\nstate";
  function bootFrom(raw,{deny=false,silent=false}={}){
    let stored=raw,writes=0;
    const value=runInNewContext(bootCode,{LS:"sudsflow.v1",normalize:d=>d,seed:()=>sample,
      localStorage:{getItem(){if(deny)throw Error("denied");return stored;},
        setItem(key,value){writes++;if(!silent)stored=value;}}});
    return {value,stored,writes};
  }
  const valid=JSON.stringify(sample,null,2);
  const existing=bootFrom(valid);
  assert.equal(existing.writes,0);
  assert.equal(existing.stored,valid);
  assert.equal(existing.value.orders[0].id,"order-1");
  for(const raw of ["{broken","{}","null",""]){
    const blocked=bootFrom(raw);
    assert.equal(blocked.value,null);
    assert.equal(blocked.stored,raw);
    assert.equal(blocked.writes,0);
  }
  const denied=bootFrom(valid,{deny:true});
  assert.equal(denied.value,null);
  assert.equal(denied.writes,0);
  const fresh=bootFrom(null);
  assert.equal(fresh.writes,1);
  assert.equal(fresh.value.orders[0].id,"order-1");
  assert.equal(bootFrom(null,{silent:true}).value,null);
});
