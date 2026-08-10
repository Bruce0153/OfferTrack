const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const listeners = {};
const on = name => ({ addListener(fn) { (listeners[name] ||= []).push(fn); } });
const store = { settings: { followUpEnabled: true, followUpIntervalHours: 6, customSites: {}, companyAliases: {}, trustedAutoSyncHosts: [] } };
const alarms = new Map();
const chrome = {
  runtime: { onInstalled: on('installed'), onStartup: on('startup'), onMessage: on('message'), openOptionsPage: async()=>{} },
  storage: { local: {
    get: async keys => Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, store[k]])) : ({ [keys]: store[keys] }),
    set: async obj => Object.assign(store, obj), setAccessLevel: async()=>{}
  }, onChanged: on('storageChanged') },
  alarms: { onAlarm: on('alarm'), create: async (name, info) => alarms.set(name,{name,periodInMinutes:info.periodInMinutes,scheduledTime:Date.now()+info.delayInMinutes*60000}), get:async name=>alarms.get(name), clear:async name=>alarms.delete(name) },
  tabs: { query:async()=>[], create:async()=>({id:1,status:'complete',url:'https://example.com'}), get:async()=>({id:1,status:'complete',url:'https://example.com'}), remove:async()=>{}, sendMessage:async()=>({ok:false}) },
  notifications:{ create:async()=>'' }
};
const context={console,chrome,fetch:async()=>{throw Error('fetch should not run')},URL,URLSearchParams,setTimeout,clearTimeout,globalThis:null};context.globalThis=context;context.importScripts=()=>{};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8'),context,{filename:'background.js'});
context.OfferTrackFollowUpCore=require(path.join(__dirname,'..','followup-core.js'));
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','followup-background.js'),'utf8'),context,{filename:'followup-background.js'});

(async()=>{
  for(const fn of listeners.installed||[]) await fn({reason:'update'});
  const alarm=alarms.get('offertrack-follow-up');
  assert(alarm,'启用后应创建 alarm');
  assert.strictEqual(alarm.periodInMinutes,360);
  const disabled=await context.OfferTrackFollowUp.configure({followUpEnabled:false,followUpIntervalHours:6});
  assert.strictEqual(disabled.enabled,false);
  assert(!alarms.has('offertrack-follow-up'));
  console.log('OfferTrack background scheduler smoke test: PASS');
})();
