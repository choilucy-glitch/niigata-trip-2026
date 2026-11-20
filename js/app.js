// 니가타 설국 여행 — 일행 전용 여행 가이드
// 일정·안내는 js/itinerary.js, 예약번호·이름·바우처·가계부·사진·체크리스트는 로그인 후 Firestore에서 읽고 써요.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, addDoc, updateDoc, setDoc, deleteDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { DAYS, CK_GROUPS, SKI_HTML, DRIVE_HTML } from './itinerary.js';
import { renderHome } from './home.js';

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
let db;
try { db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = initializeFirestore(fb, {}); }

/* ---------- 공통 도우미 ---------- */
const $ = id => document.getElementById(id);
const h = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
const yen = n => '¥' + Math.round(n).toLocaleString('ja-JP');
const IC = {
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  car:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4z"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/></svg>',
  chev:'<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
  pen:'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>'
};
const q = s => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s);
const TAGNAME = {move:'이동', see:'관광', food:'식사', stay:'숙소', ski:'스키', opt:'선택'};
const segs = (t, sep) => { const p = t.split(sep), k = sep.trim();
  return p.map((x,i)=> k==='→' ? `<span class="seg">${i?k+' ':''}${x}</span>` : `<span class="seg">${x}${i<p.length-1?' '+k:''}</span>`).join(' '); };
const DAYLABEL = {'pre':'출발 전','12-10':'12/10','12-11':'12/11','12-12':'12/12','12-13':'12/13'};
const CATCOLOR = {'식비':'var(--t-food)','교통·주유':'var(--t-move)','숙소':'var(--t-stay)','스키':'var(--t-ski)','관광':'var(--t-see)','쇼핑':'var(--yuzu)','항공':'var(--ai)','기타':'var(--line)'};
let MEMBERS = ['일행 1','일행 2','일행 3','일행 4'];

function armDelete(btn, run){
  if (btn.classList.contains('armed')) { btn.disabled = true; run().catch(()=>{ btn.disabled=false; btn.textContent='실패'; }); return; }
  btn.classList.add('armed'); const old = btn.textContent; btn.textContent = '한 번 더 누르면 삭제';
  setTimeout(()=>{ if (btn.isConnected){ btn.classList.remove('armed'); btn.textContent = old; } }, 3000);
}
function openViewer(src, cap){ $('viewerImg').src = src; $('viewerImg').alt = cap || ''; $('viewerCap').textContent = cap || ''; if ($('viewer').showModal) $('viewer').showModal(); }
$('viewerClose').addEventListener('click', ()=>$('viewer').close());
$('viewer').addEventListener('click', e=>{ if (e.target === $('viewer')) $('viewer').close(); });

/* 사진을 문서 안에 넣을 수 있는 JPEG(data URL)로 줄이기 */
async function toDataUrl(file, maxChars=500000, maxDim=2000){
  try{
    const bmp = await createImageBitmap(file); let dim = maxDim, qual = 0.85;
    for (let i=0; i<12; i++){
      const sc = Math.min(1, dim/Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width*sc); c.height = Math.round(bmp.height*sc);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(bmp,0,0,c.width,c.height);
      const u = c.toDataURL('image/jpeg', qual);
      if (u.length <= maxChars) return u;
      if (qual > 0.62) qual -= 0.1; else dim = Math.round(dim*0.82);
    }
  }catch(e){}
  return null;
}
function watch(ref, statusEl, onData){
  let done = false;
  const t = setTimeout(()=>{ if(!done && statusEl){ statusEl.textContent = '아직 연결되지 않았어요. 네트워크를 확인해 주세요.'; statusEl.classList.add('err'); } }, 10000);
  return onSnapshot(ref, { includeMetadataChanges: false }, snap=>{
    done = true; clearTimeout(t); if (statusEl) statusEl.classList.remove('err');
    onData(snap);
  }, err=>{ done = true; clearTimeout(t); if (statusEl){ statusEl.textContent = err.code === 'permission-denied' ? '볼 수 있는 권한이 없어요.' : '불러오지 못했어요 (' + err.code + ').'; statusEl.classList.add('err'); } });
}
const fail = (el, err) => { if (el) el.textContent = '저장하지 못했어요 (' + ((err && err.code) || 'error') + ').'; };

/* ---------- D-day · 눈 ---------- */
(function(){
  const now = new Date(), el = $('dday');
  const diff = Math.ceil((new Date(2026,11,10) - new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
  el.innerHTML = diff > 0 ? '<b>D-'+diff+'</b>' : now <= new Date(2026,11,13,23,59) ? '<b>여행 중</b>' : '<b>다녀왔어요</b>';
})();
(function(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('snow'), x = c.getContext('2d'); let W,H,F=[];
  const size = ()=>{ const r = c.getBoundingClientRect(); W = c.width = r.width*devicePixelRatio; H = c.height = r.height*devicePixelRatio; };
  size(); addEventListener('resize', size);
  for (let i=0;i<70;i++) F.push({x:Math.random(),y:Math.random(),r:Math.random()*2+0.6,s:Math.random()*0.0012+0.0005,d:Math.random()*Math.PI*2});
  (function loop(){ x.clearRect(0,0,W,H); x.fillStyle='rgba(255,255,255,.75)';
    for (const f of F){ f.y+=f.s; f.d+=0.01; f.x+=Math.sin(f.d)*0.0004; if(f.y>1){f.y=-0.02;f.x=Math.random();} x.beginPath(); x.arc(f.x*W,f.y*H,f.r*devicePixelRatio,0,7); x.fill(); }
    requestAnimationFrame(loop); })();
})();

/* ---------- 일정 ---------- */
let selectDay = ()=>{};
function renderDays(){
  const list = $('dayList');
  list.innerHTML = `<div class="daytabs" role="tablist" aria-label="날짜">${DAYS.map((D,i)=>`<button type="button" role="tab" class="dtab" id="dt${i}" data-day="${i}" data-iso="${D.iso}" aria-selected="false" aria-controls="day${i+1}"><span>DAY ${i+1}</span><b>${D.d.slice(3)}</b><small>${D.d.slice(0,2)}월 · ${D.w}</small><em class="now">오늘</em></button>`).join('')}</div>` +
  DAYS.map((D,i)=>`
   <article class="day" id="day${i+1}" role="tabpanel" aria-labelledby="dt${i}" hidden>
    <header class="day-head"><div><div class="eb">DAY ${i+1} · ${D.d} (${D.w})</div><h3>${segs(D.title,' → ')}</h3><p class="sub">${D.sub}</p></div>
     <a class="btn primary" target="_blank" rel="noopener" href="${D.route}">${IC.car}경로</a></header>
    <ol class="tl">${D.stops.map(S=>`
     <li class="c-${S.tag}"><details class="stop">
      <summary><span class="time">${S.t}</span><span class="dot"></span><span class="cardline"><span class="ttl"><span class="tag ${S.tag}">${TAGNAME[S.tag]}</span><b>${segs(S.ttl,' · ')}</b><small>${S.s}</small></span>${IC.chev}</span></summary>
      <div class="body">${S.body}
       ${(S.map||S.link)?`<div class="btns">
        ${S.map?`<a class="btn primary" target="_blank" rel="noopener" href="${q(S.map)}">${IC.pin}구글맵</a><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(S.map)}">${IC.car}길찾기</a>`:''}
        ${(S.maps||[]).map(m=>`<a class="btn" target="_blank" rel="noopener" href="${q(m[1])}">${IC.pin}${m[0]}</a>`).join('')}
        ${S.link?`<a class="btn" target="_blank" rel="noopener" href="${S.link[1]}">${S.link[0]}</a>`:''}
       </div>${S.map?`<p class="jp" style="margin:10px 0 0">검색어 <span lang="ja">${esc(S.map)}</span></p>`:''}`:''}
      </div>
     </details></li>`).join('')}
    </ol>
   </article>`).join('');
  const show = selectDay = (i, save)=>{ document.querySelectorAll('.dtab').forEach((b,j)=>b.setAttribute('aria-selected', j===i?'true':'false')); document.querySelectorAll('.day').forEach((d,j)=>{ d.hidden = j!==i; }); if (save) store.set('niigata-day', String(i)); };
  list.addEventListener('click', e=>{ const b = e.target.closest('.dtab'); if (b) show(Number(b.dataset.day), true); });
  list.addEventListener('keydown', e=>{ const b = e.target.closest('.dtab'); if (!b || !['ArrowLeft','ArrowRight'].includes(e.key)) return; const n = (Number(b.dataset.day) + (e.key==='ArrowRight'?1:3)) % 4; show(n, true); $('dt'+n).focus(); });
  const now = new Date(), today = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  let pick = Number(store.get('niigata-day')) || 0;
  document.querySelectorAll('.dtab').forEach((b,i)=>{ if (b.dataset.iso === today){ b.classList.add('is-today'); pick = i; } });
  show(pick, false);
}
renderDays();
$('skiHost').innerHTML = SKI_HTML;
$('driveHost').innerHTML = DRIVE_HTML;
// 안쪽 섹션은 바깥 칸이 보이고 숨기는 걸 따르게
const unhideInner = host => host.querySelectorAll('[hidden]').forEach(e=>{ if (e.matches('[data-view]')) e.hidden = false; });
unhideInner($('skiHost')); unhideInner($('driveHost'));

/* ---------- 화면 전환 ---------- */
const VIEWS = ['home','plan','book','money','photos','info'];
function route(){
  const hsh = decodeURIComponent(location.hash.slice(1));
  let v = VIEWS.includes(hsh) ? hsh : null, target = null;
  if (!v && hsh){ const el = document.getElementById(hsh); const host = el && el.closest('[data-view]'); if (host){ v = host.closest('main > [data-view]') ? host.closest('main > [data-view]').dataset.view : host.dataset.view; target = el; } }
  v = v || 'home';
  document.querySelectorAll('main > [data-view], #appFooter').forEach(x=>{ x.hidden = x.dataset.view !== v; });
  document.querySelectorAll('.tabbar a').forEach(a=>{ if (a.dataset.tab===v) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  if (target){ if (target.tagName==='DETAILS') target.open = true; target.scrollIntoView({block:'start'}); }
}
addEventListener('hashchange', ()=>{ route(); if (VIEWS.includes(location.hash.slice(1))) scrollTo({top:0}); });
route();

/* 제목을 누르면 일정 탭 맨 위로 */
const heroTitle = document.querySelector('.hero h1');
heroTitle.setAttribute('role','link'); heroTitle.tabIndex = 0; heroTitle.style.cursor = 'pointer';
const goPlanTop = ()=>{ if (location.hash === '#plan') route(); else location.hash = 'plan'; scrollTo({top:0}); };
heroTitle.addEventListener('click', goPlanTop);
heroTitle.addEventListener('keydown', e=>{ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); goPlanTop(); } });
/* 홈 카드에서 특정 날짜로 가는 링크 */
document.addEventListener('click', e=>{ const a = e.target.closest('a[data-day]'); if (a) selectDay(Number(a.dataset.day), true); });

/* 복사 버튼 */
document.addEventListener('click', e=>{
  const c = e.target.closest('.copy'); if (!c) return;
  const old = c.textContent, done = ok=>{ c.textContent = ok?'복사됨':'길게 눌러 복사'; setTimeout(()=>c.textContent=old,1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c.dataset.copy).then(()=>done(true),()=>done(false)); else done(false);
});

/* ---------- 이름 목록이 바뀌면 다시 그리기 ---------- */
function fillPeople(){
  for (const id of ['mPayer','pBy']) { const sel = $(id), cur = sel.value; sel.innerHTML = MEMBERS.map(m=>`<option>${h(m)}</option>`).join(''); if (MEMBERS.includes(cur)) sel.value = cur; }
  $('mSplit').innerHTML = MEMBERS.map((m,i)=>`<label for="sp${i}"><input type="checkbox" id="sp${i}" value="${h(m)}" checked>${h(m)}</label>`).join('');
}
fillPeople();
(function(){ const n = new Date(); const k = String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); if (n.getFullYear()===2026 && DAYLABEL[k] && k!=='pre'){ $('mDay').value=k; $('pDay').value=k; } })();

/* ---------- 바우처 ---------- */
let VOUCHERS = [];
function renderVouchers(){
  const docs = VOUCHERS.slice().sort((a,b)=>(a.order??999)-(b.order??999) || (a.createdAt||0)-(b.createdAt||0));
  $('vStatus').textContent = docs.length ? `${docs.length}개 보관 중 · 눌러서 크게 보기` : '아직 보관된 바우처가 없어요. 아래에서 첫 사진을 올려보세요.';
  $('vList').innerHTML = docs.map(v=>`<article class="vcard"><button type="button" class="vthumb" data-view="${h(v.img)}" data-cap="${h(v.title)}"><img src="${h(v.img)}" alt="${h(v.title)}" loading="lazy"></button><div class="vmeta"><span class="tag ${v.kind==='숙소'?'stay':v.kind==='스키'?'ski':v.kind==='식당'?'food':'move'}" style="justify-self:start">${h(v.kind||'기타')}</span><b>${h(v.title)}</b>${v.note?`<span class="hint">${h(v.note)}</span>`:''}<div class="vfoot"><span></span><button type="button" class="del" data-del-v="${h(v.id)}">삭제</button></div></div></article>`).join('');
}
$('vList').addEventListener('click', e=>{
  const v = e.target.closest('[data-view]'); if (v) return openViewer(v.dataset.view, v.dataset.cap);
  const d = e.target.closest('[data-del-v]'); if (d) armDelete(d, ()=>deleteDoc(doc(db,'vouchers',d.dataset.delV)));
});
$('vFile').setAttribute('accept','image/*');
$('vForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = $('vFile').files[0]; if (!f) return;
  const btn = $('vSubmit'); btn.disabled = true; $('vMsg').textContent = '올리는 중…';
  try{
    const img = await toDataUrl(f, 600000, 2200);
    if (!img) throw { code:'image' };
    await addDoc(collection(db,'vouchers'), { title:$('vTitle').value.trim(), kind:$('vKind').value, note:$('vNote').value.trim(), img, createdAt:Date.now() });
    e.target.reset(); $('vMsg').textContent = '저장했어요.';
  }catch(err){ $('vMsg').textContent = err.code==='image' ? '사진을 읽지 못했어요. PDF는 화면 캡처해서 사진으로 올려주세요.' : '저장하지 못했어요 (' + (err.code||'error') + ').'; }
  btn.disabled = false;
});

/* ---------- 가계부 ---------- */
let FX = 8.33, EXP = [], mEditing = null, MONEY = null;
const toKrw = x => x.currency === 'JPY' ? x.amount * FX : x.amount;
const jp = krw => yen(krw / FX);
function renderMoney(){
  $('fxView').textContent = '100엔 = ' + (FX*100).toLocaleString('ko-KR',{maximumFractionDigits:2}) + '원';
  if (document.activeElement !== $('fxInput')) $('fxInput').value = (FX*100).toFixed(2);
  const rows = EXP.slice().sort((a,b)=> (a.day||'').localeCompare(b.day||'') || (a.createdAt||0)-(b.createdAt||0));
  $('mStatus').textContent = rows.length ? `지출 ${rows.length}건` : '아직 지출이 없어요.';
  const total = rows.reduce((s,x)=>s+toKrw(x),0);
  const paid = Object.fromEntries(MEMBERS.map(m=>[m,0])), owe = Object.fromEntries(MEMBERS.map(m=>[m,0])), byCat = {};
  rows.forEach(x=>{
    const k = toKrw(x), who = (x.split && x.split.length) ? x.split : MEMBERS;
    paid[x.payer] = (paid[x.payer]||0) + k;
    who.forEach(m=>{ owe[m] = (owe[m]||0) + k/who.length; });
    byCat[x.cat||'기타'] = (byCat[x.cat||'기타']||0) + k;
  });
  const catBar = total ? `<div class="catbar" aria-hidden="true">${Object.entries(byCat).map(([c,v])=>`<span style="width:${v/total*100}%;background:${CATCOLOR[c]||'var(--line)'}"></span>`).join('')}</div><small>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`${h(c)} ${won(v)} (${jp(v)})`).join(' · ')}</small>` : '';
  $('mSummary').innerHTML =
    `<div class="stat" style="grid-column:1/-1"><span class="label">총 지출</span><b>${won(total)}</b><span class="yen">${jp(total)}</span><small>1인 평균 ${won(total/MEMBERS.length)} · ${jp(total/MEMBERS.length)}</small>${catBar}</div>` +
    MEMBERS.map(m=>{ const net = (paid[m]||0)-(owe[m]||0); return `<div class="stat"><span class="label">${h(m)}</span><b class="${net>=0?'pos':'neg'}">${net>=0?'+':'−'}${won(Math.abs(net)).slice(1)}</b><span class="yen">${net>=0?'+':'−'}${jp(Math.abs(net))}</span><small>낸 돈 ${won(paid[m]||0)} · ${jp(paid[m]||0)}</small><small>내 몫 ${won(owe[m]||0)} · ${jp(owe[m]||0)}</small></div>`; }).join('');
  const bal = MEMBERS.map(m=>({m, v:(paid[m]||0)-(owe[m]||0)}));
  const cr = bal.filter(b=>b.v>1).sort((a,b)=>b.v-a.v), dr = bal.filter(b=>b.v<-1).sort((a,b)=>a.v-b.v);
  const out = []; let i=0, j=0;
  while (i<dr.length && j<cr.length){ const amt = Math.min(-dr[i].v, cr[j].v); out.push([dr[i].m, cr[j].m, amt]); dr[i].v += amt; cr[j].v -= amt; if (dr[i].v>-1) i++; if (cr[j].v<1) j++; }
  $('mSettle').innerHTML = out.length ? out.map(([a,b,v])=>`<li><b>${h(a)}</b> → <b>${h(b)}</b><span class="amt">${won(Math.round(v/10)*10)}<small>${jp(v)}</small></span></li>`).join('') : `<li class="hint">${rows.length?'모두 정산 완료 상태예요.':'지출을 입력하면 계산돼요.'}</li>`;
  MONEY = { total, out, count: rows.length }; refreshHome();
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.exp-edit')) return;
  const opt = (list, cur) => list.map(([v,l])=>`<option value="${h(v)}" ${v===cur?'selected':''}>${h(l)}</option>`).join('');
  const CATS = ['식비','교통·주유','숙소','스키','관광','쇼핑','항공','기타'], order = ['pre','12-10','12-11','12-12','12-13'];
  $('mList').innerHTML = rows.length ? order.map(day=>{
    const xs = rows.filter(x=>(x.day||'pre')===day); if (!xs.length) return '';
    const sub = xs.reduce((t,x)=>t+toKrw(x),0);
    return `<div class="exp-day"><h4><span>${DAYLABEL[day]}</span><span class="mono">${won(sub)} · ${jp(sub)}</span></h4>${xs.map(x=>{
      const split = (x.split && x.split.length) ? x.split : MEMBERS;
      const who = split.length < MEMBERS.length ? split.join('·') : `${MEMBERS.length}명`;
      const edit = mEditing === x.id ? `<form class="exp-edit" data-mform="${h(x.id)}">
        <input name="title" value="${h(x.title)}" required aria-label="항목">
        <div class="frow2"><input name="amount" type="number" min="0" step="1" inputmode="numeric" value="${h(x.amount)}" required aria-label="금액" class="mono"><select name="currency" aria-label="통화">${opt([['JPY','엔 (¥)'],['KRW','원 (₩)']], x.currency)}</select></div>
        <div class="frow2"><select name="payer" aria-label="결제한 사람">${opt(MEMBERS.map(m=>[m,m+' 결제']), x.payer)}</select><select name="day" aria-label="날짜">${opt(order.map(d=>[d,DAYLABEL[d]]), x.day||'pre')}</select></div>
        <select name="cat" aria-label="분류">${opt(CATS.map(c=>[c,c]), x.cat||'기타')}</select>
        <div class="chips">${MEMBERS.map((m,k)=>`<label for="es-${h(x.id)}-${k}"><input type="checkbox" id="es-${h(x.id)}-${k}" name="split" value="${h(m)}" ${split.includes(m)?'checked':''}>${h(m)}</label>`).join('')}</div>
        <div class="btns" style="margin-top:0"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-mcancel="1">취소</button><button class="del" type="button" data-del-m="${h(x.id)}" style="margin-left:auto">삭제</button></div>
      </form>` : '';
      return `<div class="exp"><div class="exp-main"><b>${h(x.title)}</b><small>${h(x.cat||'기타')} · ${h(x.payer)} 결제 · ${h(who)} 나눔</small></div>
        <div class="exp-amt"><b>${x.currency==='JPY'?yen(x.amount):won(x.amount)}</b><small>${x.currency==='JPY'?won(toKrw(x)):jp(x.amount)}</small></div>
        <button type="button" class="icon-btn" data-edit-m="${h(x.id)}" aria-label="${h(x.title)} 고치기">${IC.pen}</button>${edit}</div>`;
    }).join('')}</div>`;
  }).join('') : '<p class="hint">아직 지출이 없어요. 위에서 첫 지출을 추가해 보세요.</p>';
}
const blurActive = ()=>{ if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); };
$('mList').addEventListener('click', e=>{
  const ed = e.target.closest('[data-edit-m]');
  if (ed){ mEditing = mEditing === ed.dataset.editM ? null : ed.dataset.editM; renderMoney(); const f = document.querySelector('.exp-edit input[name=title]'); if (f) f.focus(); return; }
  if (e.target.closest('[data-mcancel]')){ mEditing = null; blurActive(); renderMoney(); return; }
  const d = e.target.closest('[data-del-m]'); if (d) armDelete(d, async ()=>{ await deleteDoc(doc(db,'expenses',d.dataset.delM)); mEditing = null; blurActive(); renderMoney(); });
});
$('mList').addEventListener('submit', async e=>{
  e.preventDefault(); const f = e.target, id = f.dataset.mform; if (!id) return;
  const split = [...f.querySelectorAll('input[name=split]:checked')].map(x=>x.value), amount = Number(f.amount.value);
  if (!split.length || !(amount>0) || !f.title.value.trim()) return;
  try{ await updateDoc(doc(db,'expenses',id), { title:f.title.value.trim(), amount, currency:f.currency.value, payer:f.payer.value, day:f.day.value, cat:f.cat.value, split }); mEditing = null; blurActive(); renderMoney(); }
  catch(err){ const b = f.querySelector('.btn.primary'); if (b) b.textContent = '저장 실패 (' + (err.code||'error') + ')'; }
});
$('mForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const split = [...$('mSplit').querySelectorAll('input:checked')].map(x=>x.value);
  if (!split.length){ $('mMsg').textContent = '나눌 사람을 한 명 이상 골라주세요.'; return; }
  const amount = Number($('mAmount').value);
  if (!(amount > 0)){ $('mMsg').textContent = '금액을 입력해 주세요.'; return; }
  try{
    await addDoc(collection(db,'expenses'), { title:$('mTitle').value.trim(), cat:$('mCat').value, amount, currency:$('mCur').value, payer:$('mPayer').value, day:$('mDay').value, split, createdAt:Date.now() });
    $('mTitle').value=''; $('mAmount').value=''; $('mMsg').textContent = '추가했어요.';
  }catch(err){ fail($('mMsg'), err); }
});
$('fxForm').addEventListener('submit', async e=>{
  e.preventDefault(); const v = Number($('fxInput').value)/100; if (!(v>0)) return;
  try{ await setDoc(doc(db,'settings','fx'), { krwPerJpy:v, updatedAt:Date.now() }); }catch(err){ $('fxWhen').textContent = '저장 실패 (' + (err.code||'error') + ')'; }
});

/* ---------- 사진 ---------- */
let PHOTOS = [];
function renderPhotos(){
  const docs = PHOTOS.slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  refreshHome();
  $('pStatus').textContent = docs.length ? `사진 ${docs.length}장` : '아직 사진이 없어요. 여행하면서 하나씩 올려보세요.';
  $('pList').innerHTML = ['12-10','12-11','12-12','12-13'].map((k,i)=>{
    const ps = docs.filter(p=>p.day===k); if (!ps.length) return '';
    return `<div class="pday"><h3>DAY ${i+1} · ${DAYLABEL[k]} · ${h(DAYS[i].title)}</h3><div class="pgrid">${ps.map(p=>`
      <figure class="pitem" style="margin:0"><button type="button" class="pimg" data-view="${h(p.img)}" data-cap="${h(p.caption||'')}"><img src="${h(p.img)}" alt="${h(p.caption||'여행 사진')}" loading="lazy"></button>
      <figcaption class="pcap">${p.caption?`<span>${h(p.caption)}</span>`:''}<div class="vfoot"><span class="hint">${h(p.by||'')}</span><button type="button" class="del" data-del-p="${h(p.id)}">삭제</button></div></figcaption></figure>`).join('')}</div></div>`;
  }).join('');
}
$('pList').addEventListener('click', e=>{
  const v = e.target.closest('[data-view]'); if (v) return openViewer(v.dataset.view, v.dataset.cap);
  const d = e.target.closest('[data-del-p]'); if (d) armDelete(d, ()=>deleteDoc(doc(db,'photos',d.dataset.delP)));
});
$('pForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const files = [...$('pFile').files]; if (!files.length) return;
  const btn = $('pSubmit'); btn.disabled = true; let ok = 0;
  for (const [i,f] of files.entries()){
    $('pMsg').textContent = `올리는 중… ${i+1}/${files.length}`;
    try{
      const img = await toDataUrl(f, 420000, 1800); if (!img) throw { code:'image' };
      await addDoc(collection(db,'photos'), { img, day:$('pDay').value, by:$('pBy').value, caption:$('pCap').value.trim(), createdAt:Date.now()+i });
      ok++;
    }catch(err){ $('pMsg').textContent = err.code==='image' ? '이 사진은 읽지 못했어요.' : '저장하지 못했어요 (' + (err.code||'error') + ').'; }
  }
  if (ok){ $('pMsg').textContent = `${ok}장 올렸어요.`; $('pFile').value=''; $('pCap').value=''; }
  btn.disabled = false;
});

/* ---------- 체크리스트 ---------- */
let CK = [], ckEditing = null;
const ckUnits = x => x.scope === 'each' ? MEMBERS.length : 1;
const ckDone = x => x.scope === 'each' ? MEMBERS.filter(m=>x.doneBy && x.doneBy[m]).length : (x.done ? 1 : 0);
function renderChecklist(){
  const total = CK.reduce((s,x)=>s+ckUnits(x),0), done = CK.reduce((s,x)=>s+ckDone(x),0);
  $('packProgress').textContent = total ? `${done} / ${total} 완료` : '항목 없음';
  refreshHome();
  $('ckList').innerHTML = CK_GROUPS.map(([g,label])=>{
    const items = CK.filter(x=>(x.when||'w1')===g).sort((a,b)=>(a.order||0)-(b.order||0)); if (!items.length) return '';
    return `<div class="ck-group"><h4>${label}</h4>${items.map(x=>{
      const full = ckDone(x) === ckUnits(x);
      const link = x.link ? `<a class="ck-link" href="${h(x.link)}" target="_blank" rel="noopener">열기 ↗</a>` : '';
      const main = x.scope === 'each'
        ? `<div class="ck-main"><span class="ck-dot" aria-hidden="true"></span><span class="ck-text">${h(x.text)} <em class="ck-scope">각자</em> ${link}</span></div>`
        : `<label class="ck-main" for="ck-${h(x.id)}"><input type="checkbox" id="ck-${h(x.id)}" data-ck="${h(x.id)}" ${x.done?'checked':''}><span class="ck-text">${h(x.text)} ${link}</span></label>`;
      const who = x.scope === 'each' ? `<div class="ck-who">${MEMBERS.map(m=>`<button type="button" class="who" data-who="${h(x.id)}" data-m="${h(m)}" aria-pressed="${x.doneBy && x.doneBy[m] ? 'true':'false'}">${h(m)}</button>`).join('')}</div>` : '';
      const edit = ckEditing === x.id ? `<form class="ck-edit" data-form="${h(x.id)}">
        <input name="text" value="${h(x.text)}" required aria-label="항목 내용">
        <div class="frow2"><select name="when" aria-label="시기">${CK_GROUPS.map(([k,l])=>`<option value="${k}" ${k===x.when?'selected':''}>${l}</option>`).join('')}</select>
        <select name="scope" aria-label="체크 방식"><option value="all" ${x.scope!=='each'?'selected':''}>한 명이 하면 끝</option><option value="each" ${x.scope==='each'?'selected':''}>모두 각자</option></select></div>
        <input name="link" value="${h(x.link||'')}" placeholder="링크 (선택)" aria-label="링크">
        <div class="btns" style="margin-top:0"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-cancel="1">취소</button><button class="del" type="button" data-del-ck="${h(x.id)}" style="margin-left:auto">삭제</button></div>
      </form>` : '';
      return `<div class="ck-item ${full?'ck-done':''}">${main}<div class="ck-tools"><button type="button" class="icon-btn" data-edit="${h(x.id)}" aria-label="수정">${IC.pen}</button></div>${who}${edit}</div>`;
    }).join('')}</div>`;
  }).join('');
}
$('ckList').addEventListener('change', async e=>{
  const id = e.target.dataset && e.target.dataset.ck; if (!id) return;
  try{ await updateDoc(doc(db,'checklist',id), { done:e.target.checked }); }catch(err){ e.target.checked = !e.target.checked; }
});
$('ckList').addEventListener('click', async e=>{
  const w = e.target.closest('[data-who]');
  if (w){ const x = CK.find(i=>i.id===w.dataset.who); if (!x) return; const map = Object.assign({}, x.doneBy||{}); map[w.dataset.m] = !map[w.dataset.m]; w.setAttribute('aria-pressed', map[w.dataset.m]?'true':'false'); try{ await updateDoc(doc(db,'checklist',x.id), { doneBy:map }); }catch(err){} return; }
  const ed = e.target.closest('[data-edit]'); if (ed){ ckEditing = ckEditing === ed.dataset.edit ? null : ed.dataset.edit; renderChecklist(); const f = document.querySelector('.ck-edit input'); if (f) f.focus(); return; }
  if (e.target.closest('[data-cancel]')){ ckEditing = null; renderChecklist(); return; }
  const d = e.target.closest('[data-del-ck]'); if (d) armDelete(d, async ()=>{ await deleteDoc(doc(db,'checklist',d.dataset.delCk)); ckEditing = null; });
});
$('ckList').addEventListener('submit', async e=>{
  e.preventDefault(); const f = e.target, id = f.dataset.form; if (!id) return;
  const data = { text:f.text.value.trim(), when:f.when.value, scope:f.scope.value, link:f.link.value.trim() }; if (!data.text) return;
  try{ await updateDoc(doc(db,'checklist',id), data); ckEditing = null; renderChecklist(); }catch(err){}
});
$('ckForm').addEventListener('submit', async e=>{
  e.preventDefault(); const text = $('ckText').value.trim(); if (!text) return;
  try{ await addDoc(collection(db,'checklist'), { text, when:$('ckWhen').value, scope:$('ckScope').value, link:'', done:false, doneBy:{}, order:Date.now() }); $('ckText').value=''; }
  catch(err){ $('ckStatus').textContent = '추가하지 못했어요 (' + (err.code||'error') + ').'; }
});
document.querySelectorAll('#ckScope option[value=each]').forEach(o=>o.textContent='모두 각자');

/* ---------- Visit Japan Web QR ---------- */
let VJW = {}, vjwTarget = null;
const vkey = i => 'm' + (i+1);
function renderVjw(){
  const n = MEMBERS.filter((m,i)=>VJW[vkey(i)] && VJW[vkey(i)].img).length;
  $('vjwProgress').textContent = `${MEMBERS.length}명 중 ${n}명 QR 업로드`;
  $('vjwGrid').innerHTML = MEMBERS.map((m,i)=>{
    const v = VJW[vkey(i)], src = v && v.img;
    return `<div class="vjw-card"><b>${h(m)}</b>${src
      ? `<button type="button" class="thumb" data-view="${h(src)}" data-cap="${h(m)} · Visit Japan Web QR"><img src="${h(src)}" alt="${h(m)} 입국 QR"></button><div class="vfoot"><button type="button" class="del" data-vjw-up="${i}" style="color:var(--ai)">바꾸기</button><button type="button" class="del" data-vjw-del="${i}">삭제</button></div>`
      : `<button type="button" class="thumb empty" data-vjw-up="${i}">＋ QR 캡처 올리기</button>`}</div>`;
  }).join('');
}
$('vjwGrid').addEventListener('click', e=>{
  const v = e.target.closest('[data-view]'); if (v) return openViewer(v.dataset.view, v.dataset.cap);
  const u = e.target.closest('[data-vjw-up]'); if (u){ vjwTarget = Number(u.dataset.vjwUp); $('vjwFile').value=''; $('vjwFile').click(); return; }
  const d = e.target.closest('[data-vjw-del]'); if (d) armDelete(d, ()=>deleteDoc(doc(db,'vjw',vkey(Number(d.dataset.vjwDel)))));
});
$('vjwFile').addEventListener('change', async ()=>{
  const f = $('vjwFile').files[0]; if (!f || vjwTarget===null) return;
  $('vjwMsg').textContent = `${MEMBERS[vjwTarget]} QR 올리는 중…`;
  try{ const img = await toDataUrl(f, 600000, 2200); if (!img) throw { code:'image' }; await setDoc(doc(db,'vjw',vkey(vjwTarget)), { img, updatedAt:Date.now() }); $('vjwMsg').textContent = '저장했어요.'; }
  catch(err){ $('vjwMsg').textContent = err.code==='image' ? '사진을 읽지 못했어요.' : '저장하지 못했어요 (' + (err.code||'error') + ').'; }
  vjwTarget = null;
});

/* ---------- 처음 한 번: 데이터 가져오기 ---------- */
$('importFile').addEventListener('change', async ()=>{
  const f = $('importFile').files[0]; if (!f) return;
  const msg = $('importMsg'); msg.textContent = '읽는 중…';
  try{
    const data = JSON.parse(await f.text());
    const writes = [];
    if (data.info) for (const [id, v] of Object.entries(data.info)) writes.push(['info', id, v]);
    if (data.settings) for (const [id, v] of Object.entries(data.settings)) writes.push(['settings', id, v]);
    for (const c of ['vouchers','checklist','expenses','photos','vjw']) for (const v of (data[c]||[])) { const { id, ...rest } = v; writes.push([c, id, rest]); }
    let n = 0;
    for (let i=0; i<writes.length; i+=20){
      const b = writeBatch(db);
      for (const [c,id,v] of writes.slice(i,i+20)) b.set(doc(db,c,id), v);
      await b.commit(); n += Math.min(20, writes.length-i); msg.textContent = `저장 중… ${n}/${writes.length}`;
    }
    msg.textContent = `완료! ${writes.length}개 항목을 넣었어요.`;
  }catch(err){ msg.textContent = '가져오지 못했어요 (' + (err.code || err.message || 'error') + ').'; }
});

/* ---------- 로그인 ---------- */
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt:'select_account' });
$('loginBtn').disabled = false;
$('loginBtn').addEventListener('click', async ()=>{
  $('gateMsg').textContent = '';
  try{ await signInWithPopup(auth, provider); }
  catch(err){ $('gateMsg').textContent = err.code==='auth/popup-blocked' ? '팝업이 막혔어요. 팝업을 허용하고 다시 눌러주세요.' : err.code==='auth/popup-closed-by-user' ? '' : '로그인하지 못했어요 (' + err.code + ').'; }
});
$('logoutBtn').addEventListener('click', ()=>signOut(auth));

let unsubs = [];
function stopAll(){ unsubs.forEach(u=>u()); unsubs = []; }
function showApp(on){
  $('gate').hidden = on; $('app').hidden = !on; $('appFooter').hidden = !on; $('tabbar').hidden = !on; $('logoutBtn').hidden = !on;
  if (on) route();
}
onAuthStateChanged(auth, user=>{
  stopAll();
  if (!user){ showApp(false); $('gateText').textContent = '초대된 구글 계정으로 로그인하면 일정, 예약, 가계부를 함께 볼 수 있어요.'; return; }
  $('logoutBtn').textContent = '로그아웃';
  // 허용된 계정인지는 데이터베이스 규칙이 판단해요: 첫 읽기가 거절되면 안내
  unsubs.push(onSnapshot(doc(db,'info','members'), s=>{
    showApp(true);
    if (s.exists() && Array.isArray(s.data().names) && s.data().names.length){ MEMBERS = s.data().names; fillPeople(); renderMoney(); renderChecklist(); renderVjw(); }
    $('importBox').hidden = false;
    $('importTitle').textContent = s.exists() ? '업데이트 파일 가져오기' : '처음 한 번: 데이터 가져오기';
    $('importSub').textContent = s.exists() ? 'Claude가 준 업데이트(.json) 파일 넣기' : '예약 정보 · 바우처 · 체크리스트 옮기기';
    $('importBox').classList.toggle('is-update', s.exists());
  }, err=>{
    showApp(false);
    $('gateText').textContent = `${user.email} 계정은 아직 초대되지 않았어요. 초대받은 구글 계정으로 다시 로그인해 주세요.`;
    $('gateMsg').textContent = err.code === 'permission-denied' ? '' : '연결하지 못했어요 (' + err.code + ').';
    signOut(auth);
  }));
  unsubs.push(onSnapshot(doc(db,'info','bookings'), s=>{
    $('bookingsHost').innerHTML = s.exists() ? s.data().html : '<section><p class="status">예약 정보가 아직 없어요. 준비 탭에서 데이터를 가져와 주세요.</p></section>';
    unhideInner($('bookingsHost'));
  }, ()=>{}));
  unsubs.push(watch(collection(db,'vouchers'), $('vStatus'), snap=>{ VOUCHERS = snap.docs.map(d=>({id:d.id, ...d.data()})); renderVouchers(); }));
  unsubs.push(watch(collection(db,'expenses'), $('mStatus'), snap=>{ EXP = snap.docs.map(d=>({id:d.id, ...d.data()})); renderMoney(); }));
  unsubs.push(watch(collection(db,'photos'), $('pStatus'), snap=>{ PHOTOS = snap.docs.map(d=>({id:d.id, ...d.data()})); renderPhotos(); }));
  unsubs.push(watch(collection(db,'checklist'), $('ckStatus'), snap=>{ CK = snap.docs.map(d=>({id:d.id, ...d.data()})); $('ckStatus').textContent = CK.length ? '' : '아직 항목이 없어요. 아래에서 추가해 보세요.'; if (!document.querySelector('.ck-edit input:focus')) renderChecklist(); }));
  unsubs.push(watch(collection(db,'vjw'), $('vjwMsg'), snap=>{ VJW = {}; snap.docs.forEach(d=>{ VJW[d.id] = d.data(); }); renderVjw(); }));
  unsubs.push(onSnapshot(doc(db,'settings','fx'), s=>{ if (s.exists()){ const d = s.data(); if (d.krwPerJpy>0) FX = d.krwPerJpy; if (d.updatedAt) $('fxWhen').textContent = '· ' + new Date(d.updatedAt).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}) + ' 기준'; } renderMoney(); }, ()=>{}));
});
function refreshHome(){ try{ renderHome({ DAYS, CK, CK_GROUPS, MONEY, PHOTOS, MEMBERS, h, won, jp, q, IC, segs }); }catch(e){ console.error(e); } }
renderMoney(); renderVjw(); refreshHome();
setInterval(refreshHome, 60000);

/* ---------- 오프라인용 서비스워커 ---------- */
if ('serviceWorker' in navigator) addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
