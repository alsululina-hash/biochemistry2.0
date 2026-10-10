/* ==========================================================================
   Биохимия · интерактивный курс — общий движок
   ========================================================================== */
(function(){
'use strict';

/* ---------------- хранилище ---------------- */
const KEY = 'biochem.v1';
const DEF = {done:{}, cards:{}, errors:{}, stats:{}, prefs:{theme:'light', fsc:1}, exams:[]};
let DB = JSON.parse(JSON.stringify(DEF));
try{ const raw = localStorage.getItem(KEY); if(raw) DB = Object.assign(JSON.parse(JSON.stringify(DEF)), JSON.parse(raw)); }catch(e){}
let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ try{ localStorage.setItem(KEY, JSON.stringify(DB)); }catch(e){} }, 200);
}
window.BIODB = DB;

/* ---------------- утилиты ---------------- */
const $ = (s,r)=> (r||document).querySelector(s);
const $$ = (s,r)=> [...(r||document).querySelectorAll(s)];
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const shuffle = a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const DAY = 864e5;
const plural = (n,a,b,c)=>{const n10=n%10,n100=n%100;return n10===1&&n100!==11?a:(n10>=2&&n10<=4&&(n100<10||n100>=20)?b:c);};
window.BIOUTIL = {$,$$,esc,shuffle,plural};

/* ---------------- оформление ---------------- */
function applyPrefs(){
  document.documentElement.setAttribute('data-theme', DB.prefs.theme||'light');
  document.documentElement.style.setProperty('--fsc', DB.prefs.fsc||1);
}
applyPrefs();
window.BIOPREFS = {
  set(k,v){ DB.prefs[k]=v; applyPrefs(); save(); },
  get(){ return DB.prefs; }
};
function settingsPopover(host, onReset){
  const p = document.createElement('div');
  p.className = 'pop';
  const th = DB.prefs.theme||'light', fs = DB.prefs.fsc||1;
  p.innerHTML = `
    <h4>Оформление</h4>
    <div class="row" data-g="theme">
      <button data-v="light" class="${th==='light'?'on':''}">Светлая</button>
      <button data-v="dark" class="${th==='dark'?'on':''}">Тёмная</button>
    </div>
    <h4>Размер текста</h4>
    <div class="row" data-g="fsc">
      <button data-v="0.9" class="${fs==0.9?'on':''}">A−</button>
      <button data-v="1" class="${fs==1?'on':''}">A</button>
      <button data-v="1.15" class="${fs==1.15?'on':''}">A+</button>
      <button data-v="1.3" class="${fs==1.3?'on':''}">A++</button>
    </div>
    <h4>Данные</h4>
    <button class="danger" data-reset>Сбросить весь прогресс</button>`;
  p.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-reset')){
      if(confirm('Удалить прогресс, расписание повторений и статистику ошибок?')){
        DB = JSON.parse(JSON.stringify(DEF)); window.BIODB = DB;
        try{ localStorage.removeItem(KEY); }catch(e){}
        applyPrefs(); if(onReset) onReset(); p.remove();
      }
      return;
    }
    const g = b.parentElement.dataset.g;
    const v = g==='fsc' ? parseFloat(b.dataset.v) : b.dataset.v;
    DB.prefs[g]=v; applyPrefs(); save();
    $$('button',b.parentElement).forEach(x=>x.classList.toggle('on',x===b));
  });
  host.appendChild(p);
  const close = e=>{ if(!p.contains(e.target) && !e.target.closest('[data-settings]')){ p.remove(); document.removeEventListener('click',close); } };
  setTimeout(()=>document.addEventListener('click',close),0);
}
window.BIOSETTINGS = settingsPopover;

/* ---------------- интервальное повторение ---------------- */
const SRS = {
  id(ch,tag,i){ return ch+':'+tag+':'+i; },
  state(id){ return DB.cards[id] || null; },
  due(id){ const s = DB.cards[id]; return !s || s.d <= Date.now(); },
  isNew(id){ return !DB.cards[id]; },
  grade(id, g){
    const s = DB.cards[id] || {i:0, n:0};
    if(g==='again'){ s.i = 0; s.d = Date.now() + 6e5; }
    else if(g==='hard'){ s.i = s.i ? Math.max(1, Math.round(s.i*1.25)) : 1; s.d = Date.now() + s.i*DAY; }
    else { s.i = s.i ? Math.round(s.i*2.4) : 1; s.d = Date.now() + s.i*DAY; }
    s.n = (s.n||0)+1; s.g = g;
    DB.cards[id] = s; save();
    return s;
  },
  nextLabel(id, g){
    const s = DB.cards[id] || {i:0};
    if(g==='again') return '10 мин';
    const i = g==='hard' ? (s.i ? Math.max(1,Math.round(s.i*1.25)) : 1) : (s.i ? Math.round(s.i*2.4) : 1);
    return i + ' ' + plural(i,'день','дня','дней');
  },
  dueCount(ch, cards){
    let n = 0;
    for(const tag in cards) cards[tag].forEach((c,i)=>{ if(SRS.due(SRS.id(ch,tag,i))) n++; });
    return n;
  },
  collectDue(ch, cards){
    const out = [];
    for(const tag in cards) cards[tag].forEach((c,i)=>{
      const id = SRS.id(ch,tag,i);
      if(SRS.due(id)) out.push({id, ch, tag, i, card:c, isNew:SRS.isNew(id)});
    });
    return out;
  }
};
window.BIOSRS = SRS;

/* ---------------- прогресс и ошибки ---------------- */
const PROG = {
  markDone(ch,id){ (DB.done[ch] = DB.done[ch]||{})[id] = Date.now(); save(); },
  isDone(ch,id){ return !!(DB.done[ch] && DB.done[ch][id]); },
  doneCount(ch){ return DB.done[ch] ? Object.keys(DB.done[ch]).length : 0; },
  logAnswer(ch, qid, ok, q){
    const st = DB.stats[ch] = DB.stats[ch] || {a:0, r:0};
    st.a++; if(ok) st.r++;
    if(ok){ if(DB.errors[qid]) delete DB.errors[qid]; }
    else DB.errors[qid] = {ch, qid, t:Date.now(), q:q.q, o:q.o, c:q.c, e:q.e};
    save();
  },
  errorList(){ return Object.values(DB.errors); },
  stats(ch){ return DB.stats[ch] || {a:0,r:0}; }
};
window.BIOPROG = PROG;

/* ---------------- рендер карточек (колода + режим повторения) ---------------- */
function renderDeck(root, items, title, opts){
  opts = opts || {};
  if(!items.length){
    root.innerHTML = `<div class="empty-state"><div class="big">✓</div><div>${esc(opts.emptyText||'Карточек нет.')}</div></div>`;
    return;
  }
  let order = items.map((_,i)=>i), i = 0, flipped = false;
  const known = new Set();
  const srs = !!opts.srs;
  root.innerHTML = `
    <div class="deck-top">
      <div class="deck-meta" id="dmeta"></div>
      <div style="display:flex;gap:8px">
        ${srs?'':'<button class="btn ghost sm" id="dshuf">Перемешать</button><button class="btn ghost sm" id="drest">Заново</button>'}
      </div>
    </div>
    <div class="bar" style="max-width:660px;margin:0 auto 14px"><i id="dbar"></i></div>
    <div class="flip" id="flip"><div class="flip-in">
      <div class="face front"><span class="side">Вопрос</span><div class="q" id="dq"></div></div>
      <div class="face back"><span class="side">Ответ</span><div class="a" id="da"></div></div>
    </div></div>
    <div id="dctrl"></div>
    <div class="deck-hint">Пробел — перевернуть${srs?'':', ← и → — листать'}. Колода: ${esc(title)}</div>`;
  const flipEl = $('#flip',root);
  const setFace = ()=>{
    const it = items[order[i]];
    const c = srs ? it.card : it;
    $('#dq',root).innerHTML = c[0];
    $('#da',root).innerHTML = c[1];
    flipped = false; flipEl.classList.remove('on');
    drawCtrl();
    const total = items.length;
    $('#dmeta',root).textContent = srs
      ? `Осталось: ${total - i} из ${total}${it.isNew?' · новая':''}`
      : `Карточка ${i+1} из ${total} · отмечено «знаю»: ${known.size}`;
    $('#dbar',root).style.width = ((srs ? i/total : known.size/total)*100)+'%';
  };
  const flip = ()=>{ flipped=!flipped; flipEl.classList.toggle('on',flipped); drawCtrl(); };
  const step = d=>{ i=(i+d+items.length)%items.length; setFace(); };
  function finishSrs(){
    root.innerHTML = `<div class="empty-state"><div class="big">✓</div><div>Повторение завершено: ${items.length} ${plural(items.length,'карточка','карточки','карточек')}.</div>
      <div style="margin-top:16px"><button class="btn" id="again">Пройти ещё раз просроченные</button></div></div>`;
    const b = $('#again',root); if(b) b.onclick = ()=> opts.onFinish && opts.onFinish();
  }
  function drawCtrl(){
    const host = $('#dctrl',root);
    if(srs){
      if(!flipped){
        host.innerHTML = `<div class="deck-ctrl"><button class="btn" id="dflip">Показать ответ</button></div>`;
        $('#dflip',host).onclick = flip;
      } else {
        const id = items[order[i]].id;
        host.innerHTML = `<div class="srs-bar">
          <button class="again" data-g="again">Не помню<span class="nx">${SRS.nextLabel(id,'again')}</span></button>
          <button class="hard" data-g="hard">Трудно<span class="nx">${SRS.nextLabel(id,'hard')}</span></button>
          <button class="good" data-g="good">Знаю<span class="nx">${SRS.nextLabel(id,'good')}</span></button>
        </div>`;
        host.onclick = e=>{
          const b = e.target.closest('button[data-g]'); if(!b) return;
          SRS.grade(id, b.dataset.g);
          i++;
          if(i >= items.length) finishSrs(); else setFace();
        };
      }
    } else {
      host.innerHTML = `<div class="deck-ctrl">
        <button class="btn ghost" id="dprev">← Назад</button>
        <button class="btn" id="dflip">${flipped?'Скрыть ответ':'Показать ответ'}</button>
        <button class="btn ghost" id="dknow">Знаю ✓</button>
        <button class="btn ghost" id="dnext">Ещё раз →</button></div>`;
      $('#dflip',host).onclick = flip;
      $('#dprev',host).onclick = ()=>step(-1);
      $('#dnext',host).onclick = ()=>step(1);
      $('#dknow',host).onclick = ()=>{ known.add(order[i]); if(known.size<items.length) step(1); else setFace(); };
    }
  }
  flipEl.onclick = flip;
  const sh = $('#dshuf',root), rs = $('#drest',root);
  if(sh) sh.onclick = ()=>{ order = shuffle(order); i=0; setFace(); };
  if(rs) rs.onclick = ()=>{ order = items.map((_,k)=>k); i=0; known.clear(); setFace(); };
  document.onkeydown = e=>{
    if(!document.body.contains(flipEl)) return;
    if(e.code==='Space'){ e.preventDefault(); flip(); }
    if(!srs && e.code==='ArrowRight'){ e.preventDefault(); step(1); }
    if(!srs && e.code==='ArrowLeft'){ e.preventDefault(); step(-1); }
  };
  setFace();
}
window.BIODECK = renderDeck;

/* ---------------- тесты ---------------- */
function renderQuiz(root, qs, opts){
  opts = opts || {};
  let answered = 0, right = 0;
  root.innerHTML = `<div id="qwrap"></div><div style="margin-top:16px"><span class="score" id="qscore">Отвечено 0 из ${qs.length}</span></div>`;
  const wrap = $('#qwrap',root);
  qs.forEach((q,idx)=>{
    const el = document.createElement('div');
    el.className='q-card';
    el.innerHTML = `<div class="q-num">Вопрос ${idx+1}</div><div class="q-text">${q.q}</div>
      <div class="opts">${q.o.map((o,i)=>`<button class="opt" data-i="${i}">${o}</button>`).join('')}</div>`;
    el.addEventListener('click', e=>{
      const btn = e.target.closest('.opt'); if(!btn || el.dataset.locked) return;
      el.dataset.locked='1';
      const pick = +btn.dataset.i, ok = pick===q.c;
      $$('.opt',el).forEach((b,i)=>{ b.disabled=true; if(i===q.c) b.classList.add('ok'); if(i===pick&&!ok) b.classList.add('no'); });
      const ex = document.createElement('div'); ex.className='expl';
      ex.innerHTML = (ok?'<b>Верно.</b> ':'<b>Не совсем.</b> ')+q.e;
      el.appendChild(ex);
      answered++; if(ok) right++;
      if(opts.qid) PROG.logAnswer(opts.ch, opts.qid(idx), ok, q);
      $('#qscore',root).textContent = `Отвечено ${answered} из ${qs.length} · правильно ${right}`;
      if(answered===qs.length && opts.onDone) opts.onDone(right, qs.length);
    });
    wrap.appendChild(el);
  });
}
window.BIOQUIZ = renderQuiz;

/* ---------------- тренажёры: сортировка и сопоставление ---------------- */
function renderInter(root, cfg){
  if(!cfg){ root.innerHTML = '<div class="note">Для этого блока тренажёр не предусмотрен — переходите к карточкам и проверке.</div>'; return; }
  if(cfg.type==='sort') return renderSort(root,cfg);
  if(cfg.type==='match') return renderMatch(root,cfg);
}
function renderSort(root,cfg){
  const all = [];
  cfg.buckets.forEach((b,bi)=>b.items.forEach(it=>all.push({t:it,b:bi})));
  const pool = shuffle(all); const placed = {}; let sel = null;
  root.innerHTML = `<h2 class="sec" style="margin-top:0">${esc(cfg.title)}</h2>
    <p>Выберите карточку, затем нажмите на группу, куда её отнести.</p>
    <div class="chips" id="pool"></div>
    <div class="buckets" id="bk">${cfg.buckets.map((b,i)=>`<div class="bucket" data-b="${i}"><h4>${esc(b.name)}</h4><div class="drop" id="d${i}"></div></div>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="chk">Проверить</button><button class="btn ghost" id="rst">Сбросить</button></div>
    <div id="sres" style="margin-top:14px"></div>`;
  const paint = ()=>{
    $('#pool',root).innerHTML = pool.filter(x=>placed[x.t]===undefined).map(x=>`<button class="chip" data-t="${esc(x.t)}">${esc(x.t)}</button>`).join('')
      || '<span style="color:var(--ink3);font-size:14px">Все карточки распределены</span>';
    cfg.buckets.forEach((b,i)=>{
      $('#d'+i,root).innerHTML = Object.keys(placed).filter(t=>placed[t]===i).map(t=>`<button class="chip" data-back="${esc(t)}">${esc(t)}</button>`).join('');
    });
    sel = null;
  };
  root.addEventListener('click', e=>{
    const c = e.target.closest('.chip');
    if(c && c.dataset.t){ $$('#pool .chip',root).forEach(x=>x.classList.remove('sel')); c.classList.add('sel'); sel=c.dataset.t; return; }
    if(c && c.dataset.back){ delete placed[c.dataset.back]; paint(); return; }
    const bk = e.target.closest('.bucket');
    if(bk && sel){ placed[sel]=+bk.dataset.b; paint(); }
  });
  $('#chk',root).onclick = ()=>{
    let ok=0;
    all.forEach(x=>{
      const el = $$('.chip',root).find(c=>c.dataset.back===x.t);
      if(!el) return;
      if(placed[x.t]===x.b){ el.classList.add('ok'); ok++; } else el.classList.add('no');
    });
    $('#sres',root).innerHTML = `<span class="score">Правильно ${ok} из ${all.length}. Красные карточки нажмите, чтобы вернуть в список.</span>`;
  };
  $('#rst',root).onclick = ()=>{ Object.keys(placed).forEach(k=>delete placed[k]); $('#sres',root).innerHTML=''; paint(); };
  paint();
}
function renderMatch(root,cfg){
  const L = cfg.left.map((p,i)=>({t:p[0],i})), R = shuffle(cfg.left.map((p,i)=>({t:p[1],i})));
  let sel=null, solved=0;
  root.innerHTML = `<h2 class="sec" style="margin-top:0">${esc(cfg.title)}</h2>
    <p>Нажмите пункт слева, затем соответствующий пункт справа.</p>
    <div class="match">
      <div class="col"><h4>Понятие</h4>${L.map(x=>`<button class="mitem" data-side="l" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div>
      <div class="col"><h4>Соответствие</h4>${R.map(x=>`<button class="mitem" data-side="r" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div>
    </div>
    <div id="mres"><span class="score">Найдено пар: 0 из ${L.length}</span></div>`;
  root.addEventListener('click', e=>{
    const b = e.target.closest('.mitem'); if(!b || b.classList.contains('ok')) return;
    if(b.dataset.side==='l'){ $$('[data-side=l]',root).forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); sel=b; return; }
    if(!sel) return;
    if(b.dataset.i===sel.dataset.i){
      b.classList.add('ok'); sel.classList.remove('sel'); sel.classList.add('ok'); sel=null; solved++;
      $('#mres',root).innerHTML = `<span class="score">Найдено пар: ${solved} из ${L.length}${solved===L.length?' — все пары верны.':''}</span>`;
    } else { b.classList.add('no'); const bad=b; setTimeout(()=>bad.classList.remove('no'),600); }
  });
}
window.BIOINTER = renderInter;

/* ---------------- интерактивные схемы ---------------- */
const WIDGETS = {};

/* 1. Кинетика Михаэлиса — Ментен */
WIDGETS.michaelis = function(host){
  host.innerHTML = `
    <h4>Тренажёр: кинетика ферментативной реакции</h4>
    <div class="wsub">Двигайте ползунки и смотрите, как меняются кривая и скорость. Добавьте ингибитор и сравните Kм и V max.</div>
    <div class="seg" id="mInh">
      <button data-v="none" class="on">Без ингибитора</button>
      <button data-v="comp">Конкурентный</button>
      <button data-v="nonc">Неконкурентный</button>
    </div>
    <div class="ctrl-row">
      <div class="ctrl"><label>Концентрация субстрата [S] <b id="lS"></b></label><input type="range" id="rS" min="0" max="20" step="0.2" value="4"></div>
      <div class="ctrl"><label>Kм фермента <b id="lK"></b></label><input type="range" id="rK" min="0.5" max="10" step="0.5" value="3"></div>
      <div class="ctrl"><label>V max <b id="lV"></b></label><input type="range" id="rV" min="20" max="100" step="5" value="80"></div>
    </div>
    <svg viewBox="0 0 660 260" style="width:100%;height:auto">
      <line x1="60" y1="220" x2="630" y2="220" stroke="var(--ink2)" stroke-width="2"/>
      <line x1="60" y1="220" x2="60" y2="20" stroke="var(--ink2)" stroke-width="2"/>
      <text class="sv-s" x="636" y="234">[S]</text><text class="sv-s" x="46" y="18">V</text>
      <path id="mBase" fill="none" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="5 4"/>
      <path id="mCurve" fill="none" stroke="var(--teal)" stroke-width="3"/>
      <line id="mVmax" x1="60" x2="630" stroke="var(--red)" stroke-dasharray="6 4"/>
      <line id="mKm" stroke="var(--plum)" stroke-dasharray="4 3"/>
      <circle id="mDot" r="6" fill="var(--teal)"/>
      <text class="sv-s" id="mVlbl" x="590" y="0" fill="var(--red)">V max</text>
      <text class="sv-s" id="mKlbl" y="238" fill="var(--plum)">Kм</text>
    </svg>
    <div class="readout" id="mOut"></div>`;
  const q = s=>$(s,host);
  const X0=60,X1=630,Y0=220,Y1=30, SMAX=20;
  const px = s => X0 + (s/SMAX)*(X1-X0);
  const py = v => Y0 - (v/110)*(Y0-Y1);
  let inh='none';
  function calc(){
    const S=+q('#rS').value, K=+q('#rK').value, V=+q('#rV').value;
    let Ke=K, Ve=V;
    if(inh==='comp') Ke = K*2.5;
    if(inh==='nonc') Ve = V*0.45;
    return {S,K,V,Ke,Ve};
  }
  function path(K,V){
    let d='';
    for(let i=0;i<=100;i++){ const s=SMAX*i/100, v=V*s/(K+s); d += (i?'L':'M')+px(s).toFixed(1)+' '+py(v).toFixed(1); }
    return d;
  }
  function draw(){
    const {S,K,V,Ke,Ve} = calc();
    q('#lS').textContent = S.toFixed(1)+' ммоль/л';
    q('#lK').textContent = K.toFixed(1)+' ммоль/л';
    q('#lV').textContent = V.toFixed(0)+' усл. ед.';
    q('#mBase').setAttribute('d', inh==='none' ? '' : path(K,V));
    q('#mCurve').setAttribute('d', path(Ke,Ve));
    q('#mVmax').setAttribute('y1', py(Ve)); q('#mVmax').setAttribute('y2', py(Ve));
    q('#mVlbl').setAttribute('y', py(Ve)-6);
    q('#mKm').setAttribute('x1', px(Ke)); q('#mKm').setAttribute('x2', px(Ke));
    q('#mKm').setAttribute('y1', py(Ve/2)); q('#mKm').setAttribute('y2', Y0);
    q('#mKlbl').setAttribute('x', px(Ke)-8);
    const v = Ve*S/(Ke+S);
    q('#mDot').setAttribute('cx', px(S)); q('#mDot').setAttribute('cy', py(v));
    const pct = (v/Ve*100).toFixed(0);
    q('#mOut').innerHTML =
      `<span class="r">V = ${v.toFixed(1)}</span>
       <span class="r">${pct} % от V max</span>
       <span class="r ${inh==='comp'?'bad':''}">Kм = ${Ke.toFixed(1)}${inh==='comp'?' ↑':''}</span>
       <span class="r ${inh==='nonc'?'bad':''}">V max = ${Ve.toFixed(0)}${inh==='nonc'?' ↓':''}</span>
       <span class="r">${inh==='comp'?'Сродство упало, но избыток субстрата снимает торможение':inh==='nonc'?'Сродство прежнее, потолок скорости снижен':'Норма'}</span>`;
  }
  ['#rS','#rK','#rV'].forEach(s=>q(s).addEventListener('input',draw));
  q('#mInh').addEventListener('click', e=>{
    const b=e.target.closest('button'); if(!b) return;
    inh=b.dataset.v; $$('button',q('#mInh')).forEach(x=>x.classList.toggle('on',x===b)); draw();
  });
  draw();
};

/* 2. Сборка цикла Кребса */
WIDGETS.krebs = function(host){
  const SEQ = ['Цитрат','Изоцитрат','α-Кетоглутарат','Сукцинил-КоА','Сукцинат','Фумарат','Малат','Оксалоацетат'];
  const ENZ = ['цитратсинтаза','аконитаза','изоцитратдегидрогеназа','α-кетоглутаратдегидрогеназный комплекс','сукцинаттиокиназа','сукцинатдегидрогеназа','фумараза','малатдегидрогеназа'];
  let placed = [];
  host.innerHTML = `
    <h4>Тренажёр: соберите цикл Кребса</h4>
    <div class="wsub">Нажимайте метаболиты в порядке их образования, начиная с продукта цитратсинтазной реакции.</div>
    <div class="chips" id="kPool"></div>
    <svg viewBox="0 0 660 320" style="width:100%;height:auto">
      <circle cx="330" cy="160" r="118" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="6 6"/>
      <g id="kSlots"></g>
      <text class="sv-key" x="330" y="156" text-anchor="middle">Цикл Кребса</text>
      <text class="sv-s" x="330" y="176" text-anchor="middle" id="kHint">0 из 8</text>
    </svg>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" id="kUndo">Убрать последний</button><button class="btn ghost sm" id="kReset">Сбросить</button></div>
    <div class="readout" id="kOut"></div>`;
  const slots = $('#kSlots',host);
  function pos(i){ const a = -Math.PI/2 + i*Math.PI/4; return {x:330+150*Math.cos(a), y:160+128*Math.sin(a)}; }
  function draw(){
    slots.innerHTML = SEQ.map((_,i)=>{
      const p = pos(i), t = placed[i];
      const fill = t ? (t===SEQ[i] ? 'var(--green-tint)' : 'var(--red-tint)') : 'var(--card)';
      const stroke = t ? (t===SEQ[i] ? 'var(--green)' : 'var(--red)') : 'var(--line)';
      return `<g><rect x="${p.x-64}" y="${p.y-15}" width="128" height="30" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <text class="sv-s" x="${p.x}" y="${p.y+4}" text-anchor="middle">${t?esc(t):(i+1)+'…'}</text></g>`;
    }).join('');
    $('#kPool',host).innerHTML = shuffle(SEQ.filter(s=>placed.indexOf(s)<0)).map(s=>`<button class="chip" data-t="${esc(s)}">${esc(s)}</button>`).join('')
      || '<span style="color:var(--ink3);font-size:14px">Все метаболиты расставлены</span>';
    $('#kHint',host).textContent = placed.length+' из 8';
    const okAll = placed.length===8 && placed.every((t,i)=>t===SEQ[i]);
    $('#kOut',host).innerHTML = placed.length===8
      ? (okAll ? `<span class="r good">Цикл собран верно. Ферменты по порядку: ${ENZ.join(' → ')}.</span>`
               : `<span class="r bad">Есть ошибки — красные позиции стоят не на своих местах.</span>`)
      : (placed.length ? `<span class="r">Следующий шаг: реакция ${placed.length+1} — ${ENZ[placed.length]}</span>` : `<span class="r">Первая реакция: цитратсинтаза</span>`);
  }
  host.addEventListener('click', e=>{
    const c = e.target.closest('.chip');
    if(c){ placed.push(c.dataset.t); draw(); return; }
    if(e.target.id==='kUndo'){ placed.pop(); draw(); }
    if(e.target.id==='kReset'){ placed = []; draw(); }
  });
  draw();
};

/* 3. Дыхательная цепь: яды и разобщители */
WIDGETS.chain = function(host){
  const AGENTS = {
    none:{t:'Норма', block:null, unc:false, note:'Электроны идут от НАДН и сукцината к кислороду, протоны выкачиваются через I, III и IV комплексы.'},
    rot:{t:'Ротенон', block:1, unc:false, note:'Ротенон и барбитураты блокируют I комплекс: электроны от НАДН не проходят. Сукцинат при этом ещё может работать через II комплекс.'},
    mal:{t:'Малонат', block:2, unc:false, note:'Малонат — конкурентный ингибитор сукцинатдегидрогеназы (II комплекс). Путь от НАДН сохраняется.'},
    ant:{t:'Антимицин A', block:3, unc:false, note:'Антимицин A блокирует III комплекс — перекрыты оба пути входа электронов.'},
    cn:{t:'Цианид, CO', block:4, unc:false, note:'Цианиды и угарный газ блокируют цитохромоксидазу (IV комплекс): кислород не может принять электроны, дыхание останавливается.'},
    dnp:{t:'2,4-динитрофенол', block:null, unc:true, note:'Разобщитель-протонофор: протоны возвращаются в матрикс мимо АТФ-синтазы. Дыхание ускоряется, АТФ не синтезируется, энергия уходит в тепло.'},
    olig:{t:'Олигомицин', block:null, unc:false, atp:true, note:'Олигомицин блокирует протонный канал F₀ АТФ-синтазы: протоны не возвращаются, синтез АТФ прекращается, а дыхание тормозится накопившимся градиентом.'}
  };
  let agent='none', sub='nadh';
  host.innerHTML = `
    <h4>Тренажёр: дыхательная цепь под действием ядов</h4>
    <div class="wsub">Выберите субстрат и вещество — посмотрите, где остановятся электроны и чему будет равен P/O.</div>
    <div class="seg" id="cSub"><button data-v="nadh" class="on">Субстрат: НАДН</button><button data-v="succ">Субстрат: сукцинат</button></div>
    <div class="seg" id="cAg">${Object.keys(AGENTS).map((k,i)=>`<button data-v="${k}" class="${i?'':'on'}">${AGENTS[k].t}</button>`).join('')}</div>
    <svg viewBox="0 0 680 220" style="width:100%;height:auto">
      <rect x="20" y="80" width="640" height="62" fill="var(--line2)" stroke="var(--line)"/>
      <text class="sv-s" x="340" y="26" text-anchor="middle">Межмембранное пространство</text>
      <text class="sv-s" x="340" y="212" text-anchor="middle">Матрикс</text>
      <g id="cCx"></g>
      <g id="cFlow"></g>
    </svg>
    <div class="readout" id="cOut"></div>
    <div style="font-size:13.4px;color:var(--ink2);margin-top:10px" id="cNote"></div>`;
  const CX = [{x:40,w:96,t:'I'},{x:170,w:96,t:'II'},{x:330,w:96,t:'III'},{x:470,w:110,t:'IV'}];
  function draw(){
    const a = AGENTS[agent];
    const entry = sub==='nadh' ? 1 : 2;
    let stop = null;
    if(a.block){
      if(a.block===1) stop = (entry===1) ? 1 : null;
      else if(a.block===2) stop = (entry===2) ? 2 : null;
      else stop = a.block;
    }
    $('#cCx',host).innerHTML = CX.map(c=>{
      const n = +c.t.replace(/[^IV]/g,'').length===0?0:['I','II','III','IV'].indexOf(c.t)+1;
      const used = (n===1&&entry===1)||(n===2&&entry===2)||n>2;
      const blocked = stop===n;
      const fill = blocked ? 'var(--red-tint)' : used ? 'var(--tint)' : 'var(--line2)';
      const stroke = blocked ? 'var(--red)' : used ? 'var(--teal)' : 'var(--line)';
      return `<rect x="${c.x}" y="70" width="${c.w}" height="82" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <text class="sv-key" x="${c.x+c.w/2}" y="118" text-anchor="middle">${c.t}</text>`;
    }).join('');
    const flows = [];
    const pumped = [];
    if(!stop || stop>1){ if(entry===1) pumped.push(88); }
    if(!stop || stop>3) pumped.push(378);
    if(!stop || stop>4) pumped.push(525);
    if(!a.unc && !a.atp) pumped.forEach(x=>flows.push(`<text class="sv-s" x="${x}" y="58" text-anchor="middle" fill="var(--red)">H⁺ ↑</text>`));
    if(a.unc) flows.push(`<text class="sv-s" x="620" y="58" text-anchor="middle" fill="var(--red)">H⁺ ↓ мимо АТФ-синтазы</text>`);
    if(stop) flows.push(`<text class="sv-s" x="${CX[stop-1].x+CX[stop-1].w/2}" y="176" text-anchor="middle" fill="var(--red)">✕ блок</text>`);
    flows.push(`<text class="sv-s" x="${entry===1?88:218}" y="176" text-anchor="middle">${entry===1?'НАДН':'сукцинат'}</text>`);
    if(!stop) flows.push(`<text class="sv-s" x="590" y="176" text-anchor="middle">O₂ → H₂O</text>`);
    $('#cFlow',host).innerHTML = flows.join('');
    let po, o2, atp;
    if(stop){ po='0'; o2='нет'; atp='нет'; }
    else if(a.unc){ po='0'; o2='повышено'; atp='нет, энергия в тепло'; }
    else if(a.atp){ po='0'; o2='снижено'; atp='нет'; }
    else { po = entry===1?'3':'2'; o2='норма'; atp = entry===1?'3 АТФ':'2 АТФ'; }
    $('#cOut',host).innerHTML =
      `<span class="r ${po==='0'?'bad':'good'}">P/O = ${po}</span>
       <span class="r">Потребление O₂: ${o2}</span>
       <span class="r">Синтез АТФ: ${atp}</span>`;
    $('#cNote',host).textContent = a.note;
  }
  $('#cSub',host).addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b)return; sub=b.dataset.v; $$('button',$('#cSub',host)).forEach(x=>x.classList.toggle('on',x===b)); draw(); });
  $('#cAg',host).addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b)return; agent=b.dataset.v; $$('button',$('#cAg',host)).forEach(x=>x.classList.toggle('on',x===b)); draw(); });
  draw();
};

function mountWidgets(root){
  $$('[data-widget]',root).forEach(el=>{
    const w = WIDGETS[el.dataset.widget];
    if(w){ el.classList.add('widget'); w(el); }
  });
}
window.BIOWIDGETS = WIDGETS;

/* ---------------- тренажёр pH (в теории 1.3) ---------------- */
function initPh(root){
  const r = $('#phr',root); if(!r) return;
  const out = $('#phout',root);
  const draw = ()=>{
    const v = +r.value; let form, charge, name;
    if(v<=4){ form='H₃N⁺–CH(R)–COOH'; charge='+1'; name='катионная форма (кислая среда)'; }
    else if(v<=9){ form='H₃N⁺–CH(R)–COO⁻'; charge='0'; name='биполярный ион (нейтральная среда)'; }
    else { form='H₂N–CH(R)–COO⁻'; charge='−1'; name='анионная форма (щелочная среда)'; }
    out.innerHTML = `<span class="ph-badge">pH = ${v}</span><span class="ph-badge">${form}</span>
      <span class="ph-badge">суммарный заряд: ${charge}</span><span style="color:var(--ink2);font-size:14px">${name}</span>`;
  };
  r.addEventListener('input', draw); draw();
}
window.BIOMOUNT = function(root){ mountWidgets(root); initPh(root); };

/* ---------------- страница главы ---------------- */
function initChapter(CH){
  const n = CH.n;
  const PAGES = CH.blocks.map(b=>({id:b.id, label:b.id+'. '+b.title, node:b.id.replace(/^\d\./,''), kind:'block'}))
    .concat([
      {id:'tasks', label:'Задачи и схемы решения', node:'З', kind:'tasks'},
      {id:'final', label:'Итоговый тест главы', node:'Т', kind:'final'},
      {id:'review', label:'Повторение по расписанию', node:'П', kind:'review'},
      {id:'cards', label:'Все карточки главы', node:'К', kind:'cards'}
    ]);
  const blockById = id => CH.blocks.find(b=>b.id===id);
  const pageById = id => PAGES.find(p=>p.id===id);
  const cardsFor = tags => tags.flatMap(t => (CH.cards[t]||[]));
  const state = {page:PAGES[0].id, filter:'', open:true};
  const dueNow = ()=> SRS.collectDue(n, CH.cards);

  function matches(p){
    if(!state.filter) return true;
    const f = state.filter.toLowerCase(), b = blockById(p.id);
    return (p.label+' '+(b?b.lead:'')).toLowerCase().includes(f);
  }
  function renderNav(){
    const vis = PAGES.filter(matches);
    const due = dueNow().length;
    $('#nav').innerHTML = vis.length ? `<div class="chapter">
      <ul class="chain">${PAGES.map(p=>`<li><button class="nav-btn${state.page===p.id?' active':''}${PROG.isDone(n,p.id)?' done':''}${matches(p)?'':' hidden'}" data-go="${p.id}">
        <span class="node"><span>${esc(p.node)}</span></span><span>${esc(p.label)}${p.kind==='review'&&due?` <b style="color:#7aa5ff">· ${due}</b>`:''}</span></button></li>`).join('')}</ul>
      </div>` : '<div class="nores">Ничего не найдено.</div>';
    const done = PAGES.filter(p=>PROG.isDone(n,p.id)).length;
    $('#pbar').style.width = (done/PAGES.length*100)+'%';
    $('#ptext').textContent = done+' из '+PAGES.length;
  }
  function markDone(id){ PROG.markDone(n,id); renderNav(); }
  function closeDrawer(){ $('#rail').classList.remove('open'); $('#scrim').classList.remove('on'); }

  function videoSlot(){
    const list = (CH.videos||[]);
    const cards = list.length ? list.map(v=>`
      <div class="vcard"><div class="vframe"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}" title="${esc(v.t)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
      <div class="vcap"><span>${esc(v.t)}</span><a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">Открыть на YouTube ↗</a></div></div>`).join('')
     : `<div class="vempty"><span class="plus">+</span><span>Здесь может быть видео ко всей главе ${n}</span>
        <span>Чтобы добавить: в файле <code>data-ch${n}.js</code> найдите <code>videos</code> и впишите код ролика</span></div>`;
    return `<div class="vslot"><span class="k">Видео к главе ${n}</span><div class="vgrid">${cards}</div></div>`;
  }

  function go(id, noHash){
    if(!pageById(id)) id = PAGES[0].id;
    state.page = id; renderNav(); closeDrawer(); window.scrollTo(0,0);
    if(!noHash) history.replaceState(null,'','#'+id);
    const p = pageById(id);
    $('#tbTitle').textContent = p.label;
    if(p.kind==='block') renderBlock(blockById(id));
    else if(p.kind==='tasks') renderTasks(p);
    else if(p.kind==='final') renderFinal(p);
    else if(p.kind==='review') renderReview(p);
    else renderAllCards(p);
    $('#main').insertAdjacentHTML('beforeend', pager(id));
    const pg = $('#pager');
    if(pg) pg.addEventListener('click', e=>{ const b=e.target.closest('[data-go]'); if(b) go(b.dataset.go); });
  }
  function pager(id){
    const i = PAGES.findIndex(p=>p.id===id);
    const prev = PAGES[i-1], next = PAGES[i+1];
    const prevHtml = prev ? `<button data-go="${prev.id}"><span class="dir">← Предыдущий раздел</span>${esc(prev.label)}</button>`
      : `<button onclick="location.href='index.html'"><span class="dir">← Назад</span>На главную</button>`;
    const nextHtml = next ? `<button class="next" data-go="${next.id}"><span class="dir">Следующий раздел →</span>${esc(next.label)}</button>`
      : `<button class="next" onclick="location.href='index.html'"><span class="dir">Дальше →</span>К другим главам</button>`;
    return `<div class="pager" id="pager">${prevHtml}${nextHtml}</div>`;
  }

  function renderBlock(b){
    const deck = cardsFor(b.tags);
    $('#main').innerHTML = `
      <div class="crumb">Глава ${n} · ${esc(CH.title)} · блок ${esc(b.id)}</div>
      <h1 class="page">${esc(b.title)}</h1>
      <p class="lead">${esc(b.lead)}</p>
      <div class="tabs" id="tabs">
        <button class="tab on" data-tab="th">Теория и схемы</button>
        <button class="tab" data-tab="in">Тренажёр</button>
        <button class="tab" data-tab="cd">Карточки<span class="cnt">${deck.length}</span></button>
        <button class="tab" data-tab="qz">Проверка<span class="cnt">${b.quiz.length}</span></button>
      </div>
      <div id="pane"></div>`;
    $('#tabs').addEventListener('click', e=>{
      const t = e.target.closest('.tab'); if(!t) return;
      $$('#tabs .tab').forEach(x=>x.classList.toggle('on', x===t));
      paint(t.dataset.tab);
    });
    function paint(which){
      const pane = $('#pane');
      if(which==='th'){
        pane.innerHTML = (CH.blocks[0].id===b.id ? videoSlot() : '') + b.theory;
        window.BIOMOUNT(pane);
      }
      else if(which==='in'){ pane.innerHTML=''; renderInter(pane, b.inter); }
      else if(which==='cd'){ pane.innerHTML=''; renderDeck(pane, deck, b.id+'. '+b.title); }
      else { pane.innerHTML=''; renderQuiz(pane, b.quiz, {ch:n, qid:i=>n+':'+b.id+':'+i, onDone:()=>markDone(b.id)}); }
    }
    paint('th');
  }

  function renderTasks(p){
    $('#main').innerHTML = `
      <div class="crumb">Глава ${n} · практикум</div>
      <h1 class="page">Задачи и схемы решения</h1>
      <p class="lead">Сначала простые алгоритмы с примерами, затем задачи из учебника с полным разбором и задачи для самопроверки.</p>
      <div style="margin-bottom:18px"><button class="btn ghost sm" onclick="window.print()">Распечатать разбор</button></div>
      <h2 class="sec">Схемы решения</h2>
      ${CH.cheat||''}
      ${CH.algos.map(a=>`<div class="algo"><span class="k">${esc(a.name)}</span><ol>${a.steps.map(s=>`<li>${s}</li>`).join('')}</ol></div>`).join('')}
      <h2 class="sec">Задачи</h2>
      ${CH.tasks.map(t=>`
        <div class="task">
          <div class="task-h"><span class="task-n">${esc(t.n)}</span><span class="pill">${esc(t.algo)}</span></div>
          <div class="task-q">${t.q}</div>
          <div class="algo"><span class="k">Что делать</span><ol>${t.steps.map(s=>`<li>${s}</li>`).join('')}</ol></div>
          <details class="sol"><summary>Показать разбор</summary><div class="body">${t.sol}</div></details>
        </div>`).join('')}
      <div style="margin-top:22px"><button class="btn" id="tdone">Я разобрал все задачи</button></div>`;
    $('#tdone').onclick = e=>{ markDone(p.id); e.target.textContent='Отмечено ✓'; e.target.disabled=true; };
  }

  function renderFinal(p){
    $('#main').innerHTML = `
      <div class="crumb">Глава ${n} · контроль</div>
      <h1 class="page">Итоговый тест главы ${n}</h1>
      <p class="lead">Десять тестовых вопросов из учебника с пояснением к каждому ответу. Ошибки автоматически попадут в раздел «Работа над ошибками» на главной.</p>
      <div id="fin"></div>`;
    renderQuiz($('#fin'), CH.final, {ch:n, qid:i=>n+':final:'+i, onDone:()=>markDone(p.id)});
  }

  function renderReview(p){
    const items = dueNow();
    $('#main').innerHTML = `
      <div class="crumb">Глава ${n} · интервальное повторение</div>
      <h1 class="page">Повторение по расписанию</h1>
      <p class="lead">${items.length ? `К повторению готово ${items.length} ${plural(items.length,'карточка','карточки','карточек')}. Оцените каждую честно — от оценки зависит, когда карточка вернётся.` : 'На сегодня всё повторено. Возвращайтесь завтра — карточки появятся по расписанию.'}</p>
      <div id="rev"></div>`;
    renderDeck($('#rev'), shuffle(items), 'глава '+n, {srs:true, emptyText:'На сегодня повторять нечего.', onFinish:()=>{ markDone(p.id); go('review'); }});
    if(items.length) markDone(p.id);
  }

  function renderAllCards(p){
    const groups = CH.blocks.map(b=>({id:b.id, title:b.title, cards:cardsFor(b.tags)}));
    const tests = CH.cards[CH.testTag] || [];
    const total = groups.reduce((s,g)=>s+g.cards.length,0) + tests.length;
    $('#main').innerHTML = `
      <div class="crumb">Глава ${n} · повторение</div>
      <h1 class="page">Все карточки главы ${n}</h1>
      <p class="lead">${total} ${plural(total,'карточка','карточки','карточек')}. Здесь можно листать свободно; чтобы учить по расписанию, откройте раздел «Повторение».</p>
      <div class="tabs" id="ctabs">
        <button class="tab on" data-d="all">Вся глава<span class="cnt">${total}</span></button>
        ${groups.map(g=>`<button class="tab" data-d="${g.id}">${g.id}<span class="cnt">${g.cards.length}</span></button>`).join('')}
        ${tests.length?`<button class="tab" data-d="tests">Тесты<span class="cnt">${tests.length}</span></button>`:''}
      </div>
      <div id="cpane"></div>`;
    const pick = d=>{
      if(d==='all') return {t:'вся глава '+n, c: groups.flatMap(g=>g.cards).concat(tests)};
      if(d==='tests') return {t:'тестовые вопросы', c: tests};
      const g = groups.find(x=>x.id===d); return {t:g.id+'. '+g.title, c:g.cards};
    };
    $('#ctabs').addEventListener('click', e=>{
      const t = e.target.closest('.tab'); if(!t) return;
      $$('#ctabs .tab').forEach(x=>x.classList.toggle('on',x===t));
      const s = pick(t.dataset.d); renderDeck($('#cpane'), s.c, s.t); markDone(p.id);
    });
    const s = pick('all'); renderDeck($('#cpane'), s.c, s.t);
  }

  /* ---- запуск страницы главы ---- */
  $('#nav').addEventListener('click', e=>{
    const b = e.target.closest('[data-go]'); if(b) go(b.dataset.go);
  });
  $('#q').addEventListener('input', e=>{ state.filter = e.target.value.trim(); renderNav(); });
  $('#burger').addEventListener('click', ()=>{ $('#rail').classList.toggle('open'); $('#scrim').classList.toggle('on'); });
  $('#scrim').addEventListener('click', closeDrawer);
  const sh = $('#settingsHost');
  if(sh) $('[data-settings]',sh).addEventListener('click', e=>{ e.stopPropagation(); settingsPopover(sh, ()=>location.reload()); });
  document.addEventListener('click', e=>{
    const x = e.target.closest('a.xref[data-go]');
    if(x){ e.preventDefault(); go(x.dataset.go); }
  });
  renderNav();
  go((location.hash||'').replace('#','') || PAGES[0].id, true);
}
window.BIOCHAPTER = initChapter;

/* ---------------- главная страница ---------------- */
function initHub(META){
  const host = $('#hub');
  const loaded = {};
  function loadData(nums){
    return Promise.all(nums.map(n=> loaded[n] ? Promise.resolve() : new Promise((res,rej)=>{
      const s = document.createElement('script');
      s.src = 'data-ch'+n+'.js';
      s.onload = ()=>{ loaded[n]=true; res(); };
      s.onerror = rej;
      document.head.appendChild(s);
    })));
  }
  function allChapters(){ return (window.CHAPTERS_DATA||[]).filter(Boolean); }

  function dueTotal(){
    let n = 0;
    allChapters().forEach(c=> n += SRS.dueCount(c.n, c.cards));
    return n;
  }
  function paint(){
    const errs = PROG.errorList().length;
    const due = loaded[1] ? dueTotal() : null;
    host.innerHTML = `
      <div class="hub-head">
        <div>
          <h1 class="hub-title">Биохимия<br>интерактивный курс</h1>
          <p class="hub-sub">По учебнику Л. М. Обуховой и Е. И. Ерлыкиной «Биохимия. Метаболические аспекты биохимии детского возраста». Теория со схемами и реакциями, тренажёры, задачи с разбором, тесты и ${META.cards} карточек с интервальным повторением.</p>
        </div>
        <div class="settings-host" id="settingsHost"><button class="icon-btn" data-settings title="Настройки">⚙</button></div>
      </div>
      <div class="hub-actions">
        <button class="act" id="aRev"><span class="ico">↻</span><span><span class="t">Повторение</span><span class="s">карточки по расписанию</span></span><span class="badge ${due?'':'zero'}" id="revBadge">${due===null?'…':due}</span></button>
        <button class="act" id="aErr"><span class="ico">✕</span><span><span class="t">Работа над ошибками</span><span class="s">вопросы, где вы ошиблись</span></span><span class="badge ${errs?'':'zero'}">${errs}</span></button>
        <button class="act" id="aExam"><span class="ico">⏱</span><span><span class="t">Экзамен</span><span class="s">20 вопросов, 20 минут</span></span></button>
      </div>
      <div class="ch-grid">
        ${META.chapters.map(c=>{
          const doneN = PROG.doneCount(c.n), st = PROG.stats(c.n);
          const pct = Math.round(doneN/c.pages*100);
          return `<a class="ch-card" href="glava${c.n}.html">
            <div class="num">Глава ${c.n} · ${esc(c.pages_label)}</div>
            <h3>${esc(c.title)}</h3>
            <div class="meta">${esc(c.sub)}</div>
            <div class="bar" style="background:var(--line2)"><i style="width:${pct}%"></i></div>
            <div class="st"><span>Пройдено: <b>${doneN} из ${c.pages}</b></span><span>Карточек: <b>${c.cards}</b></span>${st.a?`<span>Верных ответов: <b>${Math.round(st.r/st.a*100)}%</b></span>`:''}</div>
          </a>`;
        }).join('')}
      </div>
      <div class="hub-foot">Прогресс, расписание повторений и статистика ошибок хранятся в вашем браузере на этом устройстве. Курс работает без интернета после первого открытия.</div>`;
    const sh = $('#settingsHost');
    $('[data-settings]',sh).addEventListener('click', e=>{ e.stopPropagation(); settingsPopover(sh, ()=>location.reload()); });
    $('#aRev').onclick = ()=> loadData(META.chapters.map(c=>c.n)).then(startReview);
    $('#aErr').onclick = startErrors;
    $('#aExam').onclick = ()=> loadData(META.chapters.map(c=>c.n)).then(startExam);
    if(due===null) loadData(META.chapters.map(c=>c.n)).then(()=>{ const d=dueTotal(); const b=$('#revBadge'); if(b){ b.textContent=d; b.classList.toggle('zero',!d);} });
  }

  function backBtn(){
    return `<div style="margin-bottom:18px"><button class="btn ghost sm" onclick="location.reload()">← На главную</button></div>`;
  }
  function startReview(){
    let items = [];
    allChapters().forEach(c=>{ items = items.concat(SRS.collectDue(c.n, c.cards)); });
    items = shuffle(items);
    host.innerHTML = `${backBtn()}<h1 class="hub-title" style="font-size:28px">Повторение</h1>
      <p class="hub-sub">${items.length? `Сегодня к повторению ${items.length} ${plural(items.length,'карточка','карточки','карточек')} из всех глав.` : 'На сегодня всё повторено.'}</p><div id="rev"></div>`;
    renderDeck($('#rev'), items, 'все главы', {srs:true, emptyText:'На сегодня повторять нечего — возвращайтесь завтра.', onFinish:startReview});
  }
  function startErrors(){
    const errs = PROG.errorList();
    host.innerHTML = `${backBtn()}<h1 class="hub-title" style="font-size:28px">Работа над ошибками</h1>
      <p class="hub-sub">${errs.length? `Здесь ${errs.length} ${plural(errs.length,'вопрос','вопроса','вопросов')}, где вы ошиблись. Ответите верно — вопрос уйдёт из списка.` : 'Ошибок нет. Пройдите тесты в главах — всё, что не получится, соберётся здесь.'}</p><div id="errq"></div>`;
    if(!errs.length) return;
    renderQuiz($('#errq'), errs.map(e=>({q:e.q,o:e.o,c:e.c,e:e.e})), {
      ch:'err',
      qid:i=>errs[i].qid,
      onDone:()=>{}
    });
  }
  function startExam(){
    let pool = [];
    allChapters().forEach(c=>{
      c.blocks.forEach(b=> b.quiz.forEach((q,i)=> pool.push({q, id:c.n+':'+b.id+':'+i, ch:c.n})));
      c.final.forEach((q,i)=> pool.push({q, id:c.n+':final:'+i, ch:c.n}));
    });
    const qs = shuffle(pool).slice(0,20);
    let idx = 0, right = 0; const wrong = [];
    const T = 20*60; let left = T, timer = null;
    host.innerHTML = `${backBtn()}
      <div class="exam-top"><span class="timer" id="tmr">20:00</span><span class="exam-prog"><i id="eprog"></i></span><span id="ecnt" class="score">1 из 20</span></div>
      <div id="exq"></div>
      <div style="margin-top:18px;display:flex;gap:10px"><button class="btn" id="enext">Ответить и дальше</button><button class="btn ghost" id="estop">Завершить</button></div>`;
    const tmr = $('#tmr');
    timer = setInterval(()=>{
      left--; const m = String(Math.floor(left/60)).padStart(2,'0'), s = String(left%60).padStart(2,'0');
      tmr.textContent = m+':'+s; tmr.classList.toggle('warn', left<120);
      if(left<=0) finish();
    },1000);
    let picked = null;
    function paintQ(){
      const it = qs[idx];
      $('#ecnt').textContent = (idx+1)+' из '+qs.length;
      $('#eprog').style.width = (idx/qs.length*100)+'%';
      $('#exq').innerHTML = `<div class="q-card"><div class="q-num">Вопрос ${idx+1} · глава ${it.ch}</div>
        <div class="q-text">${it.q.q}</div>
        <div class="opts">${it.q.o.map((o,i)=>`<button class="opt" data-i="${i}">${o}</button>`).join('')}</div></div>`;
      picked = null;
      $('#exq').onclick = e=>{
        const b = e.target.closest('.opt'); if(!b) return;
        picked = +b.dataset.i;
        $$('#exq .opt').forEach(x=>x.classList.toggle('sel', x===b));
        $$('#exq .opt').forEach(x=>{ x.style.borderColor = x===b ? 'var(--teal)' : ''; x.style.background = x===b ? 'var(--tint)' : ''; });
      };
    }
    function next(){
      const it = qs[idx];
      const ok = picked === it.q.c;
      if(picked!==null){
        if(ok) right++; else wrong.push(it);
        PROG.logAnswer(it.ch, it.id, ok, it.q);
      } else wrong.push(it);
      idx++;
      if(idx>=qs.length) finish(); else paintQ();
    }
    function finish(){
      clearInterval(timer);
      const pct = Math.round(right/qs.length*100);
      const verdict = pct>=90?'Отлично':pct>=75?'Хорошо':pct>=60?'Удовлетворительно':'Нужно повторить материал';
      DB.exams.push({t:Date.now(), r:right, n:qs.length}); save();
      host.innerHTML = `${backBtn()}
        <div class="result"><div class="score-big">${right} / ${qs.length}</div><div class="verdict">${pct}% · ${verdict}</div>
        <div style="margin-top:16px"><button class="btn" id="again">Пройти ещё раз</button></div></div>
        ${wrong.length?`<h2 class="sec">Разбор ошибок</h2><div id="wr"></div>`:'<div class="empty-state"><div class="big">✓</div>Ни одной ошибки.</div>'}`;
      $('#again').onclick = startExam;
      if(wrong.length) renderQuiz($('#wr'), wrong.map(w=>w.q), {});
    }
    $('#enext').onclick = next;
    $('#estop').onclick = finish;
    paintQ();
  }
  paint();
}
window.BIOHUB = initHub;

})();
