import puppeteer from 'puppeteer-core'
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({executablePath:EDGE,headless:false,slowMo:8,args:['--no-sandbox','--window-size=1200,1000']})
const p=await b.newPage(); await p.setViewport({width:480,height:900})
await p.goto('http://localhost:5173/?t='+Date.now(),{waitUntil:'networkidle2'}); await sleep(1200)
await p.evaluate(()=>{localStorage.clear();sessionStorage.clear()})
await p.evaluateOnNewDocument(()=>{
  window.__toastCalls=[];
  const wait=()=>{ if(window.uni&&window.uni.showToast&&!window.uni.__hooked){ const o=window.uni.showToast; window.uni.showToast=function(o2){ window.__toastCalls.push(o2&&o2.title); return o.apply(this,arguments) }; window.uni.__hooked=1; return true } return false };
  const iv=setInterval(()=>{ if(wait()) clearInterval(iv) },50)
})
await p.goto('http://localhost:5173/?t2='+Date.now()+'#/pages/index/index',{waitUntil:'networkidle2'}); await sleep(2500)
await p.evaluate(()=>{ const el=[...document.querySelectorAll('button,uni-button')].find(e=>/立即预约表演/.test(e.textContent)&&e.getClientRects().length); if(el) el.click() })
await sleep(2000)
console.log(JSON.stringify(await p.evaluate(()=>({calls:window.__toastCalls, hash:location.hash}))))
await b.close()
