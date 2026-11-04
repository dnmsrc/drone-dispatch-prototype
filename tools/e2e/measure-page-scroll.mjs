import puppeteer from 'puppeteer-core'
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE='http://localhost:8080', API='http://localhost:8090'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const login=await(await fetch(`${API}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})})).json()
const token=login.data.token, admin=login.data.admin
const browser=await puppeteer.launch({executablePath:EDGE,headless:false,slowMo:30,args:['--no-sandbox']})
const page=await browser.newPage()
const probe=()=>page.evaluate(()=>{
  const sc=document.querySelector('.el-scrollbar__wrap')||document.scrollingElement
  const wrap=[...document.querySelectorAll('.el-scrollbar__wrap')].map(w=>({cls:w.className,h:w.clientHeight,sh:w.scrollHeight,bar:w.scrollHeight>w.clientHeight+1}))
  return {
    vh:innerHeight,
    docSc:document.documentElement.scrollHeight-document.documentElement.clientHeight,
    bodySc:document.body.scrollHeight-document.body.clientHeight,
    wraps:wrap.filter(w=>w.bar),
    gridH: document.querySelector('.grid')?Math.round(document.querySelector('.grid').getBoundingClientRect().height):null,
    multiBarH: document.querySelector('.multi-bar')?Math.round(document.querySelector('.multi-bar').getBoundingClientRect().height):null,
    barBtn: document.querySelector('.multi-bar .mb-actions')?Math.round(document.querySelector('.multi-bar .mb-actions').getBoundingClientRect().height):null,
    tipH: document.querySelector('.multi-bar .mb-tip')?Math.round(document.querySelector('.multi-bar .mb-tip').getBoundingClientRect().height):null
  }
})
const out={}
for(const [w,h] of [[1680,900],[1366,768],[1280,720]]){
  await page.setViewport({width:w,height:h})
  await page.goto(`${BASE}/login`,{waitUntil:'networkidle2'})
  await page.evaluate(({t,a})=>{localStorage.setItem('admin_token',t);localStorage.setItem('admin_info',JSON.stringify(a))},{t:token,a:admin})
  await page.goto(`${BASE}/schedule`,{waitUntil:'networkidle2'})
  await sleep(1500)
  out[`${w}x${h} single`]=await probe()
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='多选'||x.innerText.trim()==='退出多选');b&&b.click()})
  await sleep(800)
  out[`${w}x${h} multi`]=await probe()
  await page.screenshot({path:`../../shots/v7-14-page-multi-${w}x${h}.png`})
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='退出多选');b&&b.click()})
  await sleep(400)
}
console.log(JSON.stringify(out,null,2))
await browser.close()
