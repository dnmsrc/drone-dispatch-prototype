import puppeteer from 'puppeteer-core'
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({executablePath:EDGE,headless:false,slowMo:8,args:['--no-sandbox','--window-size=1200,1000']})
const p=await b.newPage(); await p.setViewport({width:480,height:900})
await p.goto('http://localhost:5173/?t='+Date.now()+'#/pages/login/login',{waitUntil:'networkidle2'}); await sleep(2600)
const ghost = await p.evaluate(()=>{
  const out=[]
  const walk=(root)=>{ [...root.querySelectorAll('*')].forEach(e=>{ if(!e.getClientRects().length) return; const r=e.getBoundingClientRect(); if(r.height<40||r.height>60) return; if(r.width<100||r.width>200) return; const cls=String(e.className||''); if(/toast|uni-toast/.test(cls)) out.push({cls, tag:e.tagName, w:+r.width.toFixed(0), h:+r.height.toFixed(0), text:(e.textContent||'').trim().slice(0,30)}) }) }
  walk(document)
  return {ghost:out, toasts:[...document.querySelectorAll('[class*="toast"]')].map(e=>({cls:e.className,txt:(e.textContent||'').slice(0,20),h:e.getClientRects().length?+e.getBoundingClientRect().height.toFixed(0):0}))}
})
console.log('直接进登录页:', JSON.stringify(ghost))
await sleep(1500)
await p.evaluate(()=>{ localStorage.clear(); sessionStorage.clear() })
await p.goto('http://localhost:5173/?t2='+Date.now()+'#/pages/index/index',{waitUntil:'networkidle2'}); await sleep(2500)
await p.evaluate(()=>{ const el=[...document.querySelectorAll('button,uni-button')].find(e=>/立即预约表演/.test(e.textContent)&&e.getClientRects().length); if(el) el.click() })
await sleep(1200)
const g2 = await p.evaluate(()=>{
  const out=[]
  const walk=(root)=>{ [...root.querySelectorAll('*')].forEach(e=>{ if(!e.getClientRects().length) return; const r=e.getBoundingClientRect(); if(r.height<40||r.height>60) return; if(r.width<100||r.width>200) return; const cls=String(e.className||''); out.push({cls:cls.slice(0,40), tag:e.tagName, w:+r.width.toFixed(0), h:+r.height.toFixed(0), text:(e.textContent||'').trim().slice(0,30)}) }) }
  walk(document)
  return {hash:location.hash, boxes:out, toasts:[...document.querySelectorAll('[class*="toast"]')].map(e=>({cls:e.className,txt:(e.textContent||'').slice(0,20),h:e.getClientRects().length?+e.getBoundingClientRect().height.toFixed(0):0}))}
})
console.log('经登录门跳转后:', JSON.stringify(g2))
await sleep(3000)
const g3=await p.evaluate(()=>({hash:location.hash,toasts:[...document.querySelectorAll('[class*="toast"]')].map(e=>({cls:e.className,txt:(e.textContent||'').slice(0,20),vis:e.getClientRects().length}))}))
console.log('3 秒后:', JSON.stringify(g3))
await p.screenshot({path:'../../shots/v5-4-login-after.png'})
await b.close()
