import puppeteer from 'puppeteer-core'
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({executablePath:EDGE,headless:false,slowMo:8,args:['--no-sandbox','--window-size=1200,1000']})
const p=await b.newPage(); await p.setViewport({width:480,height:900})
const go=async(h)=>{ await p.goto('http://localhost:8090/?t='+Date.now()+'#'+h,{waitUntil:'networkidle2'}); await sleep(2400) }
await p.goto('http://localhost:8090/?t='+Date.now(),{waitUntil:'networkidle2'}); await sleep(1500)
await p.evaluate(()=>{ localStorage.clear(); sessionStorage.clear() })
// 先在登录页登录（8090 上 uni 不暴露，用界面按钮）
await go('/pages/login/login')
await p.evaluate(()=>{ const e=[...document.querySelectorAll('.wx-btn')].find(x=>x.getClientRects().length); if(e) e.click() }); await sleep(1200)
await p.evaluate(()=>{ const e=[...document.querySelectorAll('.btn.allow')].find(x=>x.getClientRects().length); if(e) e.click() }); await sleep(2400)
// 第 2 步点返回 → 应回第 1 步
await go('/pages/apply/need')
await p.evaluate(()=>{ const l=[...document.querySelectorAll('.navbar .left')].find(e=>e.getClientRects().length); if(l) l.click() }); await sleep(1500)
await p.screenshot({path:'../../shots/v5-5-back-need-to-venue.png'})
console.log('after back from need:', await p.evaluate(()=>location.hash))
// 第 1 步点返回 → 首页
await go('/pages/apply/venue')
await p.evaluate(()=>{ const l=[...document.querySelectorAll('.navbar .left')].find(e=>e.getClientRects().length); if(l) l.click() }); await sleep(1800)
await p.screenshot({path:'../../shots/v5-6-back-venue-to-home.png'})
console.log('after back from venue:', await p.evaluate(()=>({hash:location.hash, bodyHasHero:!!document.querySelector('.hero'), title:document.querySelector('.brand-name')?.textContent})))
await b.close()
