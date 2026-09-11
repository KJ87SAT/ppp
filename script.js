/* =========================================================
   Lexicon Notebook ― script.js
   ========================================================= */

/* ---------- book (単語帳) selection ---------- */
const BOOKS = {
  '1900': {
    title: 'TARGET 1900 学習ノート',
    sub: '全 1900 語 ・ フラッシュカード / 4択クイズ / スペルテスト / リスニング',
    label: 'TARGET 1900',
    folder: 'words-1900',
    filePrefix: 'target1900',
    sectionCount: 19,
    keyPrefix: 'target1900',
    hasExamples: true
  },
  '1000': {
    title: 'TARGET 1000 学習ノート',
    sub: '全 1000 語 ・ フラッシュカード / 4択クイズ / スペルテスト / リスニング',
    label: 'TARGET 1000',
    folder: 'words-1000',
    filePrefix: 'target1000',
    sectionCount: 10,
    keyPrefix: 'target1000',
    hasExamples: false
  }
};
const LS_BOOK = 'lexicon_book';
const BOOK = (localStorage.getItem(LS_BOOK) === '1000') ? '1000' : '1900';
const bookCfg = BOOKS[BOOK];

document.getElementById('page-title').textContent = bookCfg.title;
document.getElementById('brand-title').textContent = bookCfg.title;
document.getElementById('brand-sub').textContent = bookCfg.sub;

let WORDS = [];
const WORD_SECTION_COUNT = bookCfg.sectionCount;
const WORD_FOLDER = bookCfg.folder;
const WORD_FILE_PREFIX = bookCfg.filePrefix;
try {
  const files = Array.from({length: WORD_SECTION_COUNT}, (_, i) => `${WORD_FOLDER}/${WORD_FILE_PREFIX}-section-${String(i+1).padStart(2,'0')}.json`);
  const chunks = await Promise.all(files.map(url => fetch(url).then(r => {
    if(!r.ok) throw new Error(`${url} の読み込みに失敗しました (${r.status})`);
    return r.json();
  })));
  WORDS = chunks.flat();
} catch (e) {
  console.error('単語データの読み込みに失敗しました:', e);
  document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif;line-height:1.8;">単語データ（<code>${WORD_FOLDER}/</code>フォルダ内のJSONファイル）の読み込みに失敗しました。<br>index.html と同じ場所に <code>${WORD_FOLDER}</code> フォルダを置き、ローカルサーバー経由（例: <code>python3 -m http.server</code>）で開いてください。<br>file:// で直接開くと読み込めない場合があります。</div>`;
  throw e;
}

/* ---------- storage keys ---------- */
const LS_PROGRESS = `${bookCfg.keyPrefix}_progress_v3`;
const LS_HISTORY = `${bookCfg.keyPrefix}_history_v2`;
const LS_THEME = 'target1900_theme';
const LS_SETTINGS = 'target1900_settings_v1';
const LS_META = `${bookCfg.keyPrefix}_meta_v1`;
const LS_PHONETIC = 'target1900_phonetic_v1';

function freshSRS(){
  return { reps:0, interval:0, ease:2.5, due: Date.now(), lastReview: null };
}

const progress = {};
WORDS.forEach(w => progress[w.no] = {status:'new', correct:0, wrong:0, srs:freshSRS()});

let history = {}; // 'YYYY-MM-DD' -> {studied, correct}
let meta = { maxQuizStreak:0, earlyBird:false, nightOwl:false, srsDoneToday:{date:'',count:0}, badges:[] };
let phoneticCache = {};

function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function loadState(){
  try{
    const p = localStorage.getItem(LS_PROGRESS);
    if(p){
      const saved = JSON.parse(p);
      Object.keys(saved).forEach(no=>{
        if(progress[no]){ progress[no] = saved[no]; if(!progress[no].srs) progress[no].srs = freshSRS(); }
      });
    }
  }catch(e){}
  try{ const h = localStorage.getItem(LS_HISTORY); if(h) history = JSON.parse(h); }catch(e){}
  try{
    const s = localStorage.getItem(LS_SETTINGS);
    if(s){
      const saved = JSON.parse(s);
      if(typeof saved.autoSpeak === 'boolean') state.autoSpeak = saved.autoSpeak;
      if(typeof saved.listenRate === 'number') state.listenRate = saved.listenRate;
    }
  }catch(e){}
  try{ const m = localStorage.getItem(LS_META); if(m) meta = Object.assign(meta, JSON.parse(m)); }catch(e){}
  try{ const ph = localStorage.getItem(LS_PHONETIC); if(ph) phoneticCache = JSON.parse(ph); }catch(e){}
}
function saveMeta(){ try{ localStorage.setItem(LS_META, JSON.stringify(meta)); }catch(e){} }
function savePhoneticCache(){ try{ localStorage.setItem(LS_PHONETIC, JSON.stringify(phoneticCache)); }catch(e){} }
function saveSettings(){ try{ localStorage.setItem(LS_SETTINGS, JSON.stringify({ autoSpeak: state.autoSpeak, listenRate: state.listenRate })); }catch(e){} }

let saveTimer = null;
function saveState(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{
      localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
      localStorage.setItem(LS_HISTORY, JSON.stringify(history));
    }catch(e){}
  }, 250);
}
function recordAnswer(correct){
  const t = todayStr();
  if(!history[t]) history[t] = {studied:0, correct:0};
  history[t].studied++;
  if(correct) history[t].correct++;
  saveState();
}

/* ---------- SRS (simplified SM-2) ---------- */
function srsUpdate(no, ok){
  const p = progress[no];
  if(!p.srs) p.srs = freshSRS();
  const s = p.srs;
  const quality = ok ? 5 : 2;
  if(quality < 3){ s.reps = 0; s.interval = 1; }
  else {
    if(s.reps === 0) s.interval = 1;
    else if(s.reps === 1) s.interval = 6;
    else s.interval = Math.max(1, Math.round(s.interval * s.ease));
    s.reps++;
  }
  s.ease = Math.max(1.3, s.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  s.lastReview = Date.now();
  s.due = Date.now() + s.interval * 24 * 60 * 60 * 1000;
}
function srsDueCount(){
  const now = Date.now();
  return WORDS.filter(w => progress[w.no].srs && progress[w.no].srs.due <= now && progress[w.no].srs.lastReview !== null).length;
}
function computeForgettingCurve(){
  const studied = WORDS.filter(w => progress[w.no].srs && progress[w.no].srs.lastReview);
  if(studied.length===0) return null;
  const stabilities = studied.map(w => Math.max(1, progress[w.no].srs.interval || 1));
  const avgStability = stabilities.reduce((a,b)=>a+b,0)/stabilities.length;
  const curve = [];
  for(let t=0;t<=14;t++){ curve.push(Math.round(Math.exp(-t/avgStability)*100)); }
  const now = Date.now();
  const currentRetentions = studied.map(w=>{
    const s = progress[w.no].srs;
    const daysSince = Math.max(0, (now - s.lastReview)/(24*60*60*1000));
    const stab = Math.max(1, s.interval || 1);
    return Math.exp(-daysSince/stab)*100;
  });
  const avgCurrent = Math.round(currentRetentions.reduce((a,b)=>a+b,0)/currentRetentions.length);
  return { curve, avgStability, avgCurrent };
}
function computeUpcomingReviews(){
  const days = [];
  const now = new Date(); now.setHours(0,0,0,0);
  for(let i=0;i<14;i++){
    const d = new Date(now); d.setDate(now.getDate()+i);
    const dEnd = new Date(d); dEnd.setDate(d.getDate()+1);
    const count = WORDS.filter(w=>{
      const s = progress[w.no].srs;
      return s && s.lastReview && s.due>=d.getTime() && s.due<dEnd.getTime();
    }).length;
    days.push({ label:(d.getMonth()+1)+'/'+d.getDate(), count });
  }
  return days;
}
function refreshDueBadge(){
  const btn = document.getElementById('due-badge-btn');
  const n = srsDueCount();
  if(!btn) return;
  btn.querySelector('.due-count').textContent = n;
  btn.classList.toggle('has-due', n>0);
}

/* ---------- centralized answer handling ---------- */
function applyAnswer(no, ok){
  const p = progress[no];
  if(ok){ p.correct++; p.status='mastered'; }
  else{ p.wrong++; p.status='review'; }
  srsUpdate(no, ok);
  recordAnswer(ok);

  const hour = new Date().getHours();
  if(hour>=0 && hour<4) meta.nightOwl = true;
  if(hour>=5 && hour<7) meta.earlyBird = true;
  if(ok) state.streak = (state.streak||0)+1; else state.streak = 0;
  if(state.streak > meta.maxQuizStreak) meta.maxQuizStreak = state.streak;

  const t = todayStr();
  if(state.filter==='due'){
    if(meta.srsDoneToday.date !== t){ meta.srsDoneToday = {date:t, count:0}; }
    meta.srsDoneToday.count++;
  }
  saveMeta();
  checkBadges();
  refreshDueBadge();
}

/* ---------- theme ---------- */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const label = document.getElementById('theme-toggle-label');
  if(label) label.textContent = theme==='dark' ? 'ダーク' : 'ライト';
  document.querySelectorAll('#theme-seg button').forEach(b=>b.classList.toggle('active', b.dataset.theme===theme));
  try{ localStorage.setItem(LS_THEME, theme); }catch(e){}
}
(function initTheme(){
  let theme = 'light';
  try{
    const saved = localStorage.getItem(LS_THEME);
    if(saved) theme = saved;
    else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme='dark';
  }catch(e){}
  applyTheme(theme);
})();

/* ---------- app state ---------- */
function normalize(s){ return s.trim().toLowerCase().replace(/\s+/g,' '); }

let state = {
  mode:'flash',
  sectionStart:1,
  sectionEnd:100,
  filter:'all', // all | review | mastered | due
  order:[],
  customOrder:null,
  pos:0,
  flipped:false,
  showEx:false,
  quizDir:'en2ja',
  streak:0,
  quizLocked:false,
  listenRate:1.0,
  listenLocked:false,
  autoSpeak:true,
  rangeStart:1,
  rangeEnd:100,
  sessionCorrect:0,
  sessionWrong:0,
  sessionMissed:[],
};

const SEC_SIZE = 100;
const totalSections = Math.ceil(WORDS.length / SEC_SIZE);

function currentPool(){
  let start = state.sectionStart, end = state.sectionEnd;
  let pool = WORDS.filter(w => w.no >= start && w.no <= end);
  if(state.filter === 'review'){
    pool = pool.filter(w => progress[w.no].status === 'review');
  } else if(state.filter === 'mastered'){
    pool = pool.filter(w => progress[w.no].status === 'mastered');
  } else if(state.filter === 'due'){
    const now = Date.now();
    pool = pool.filter(w => progress[w.no].srs && progress[w.no].srs.due <= now && progress[w.no].srs.lastReview !== null);
    pool = pool.sort((a,b)=>progress[a.no].srs.due - progress[b.no].srs.due);
  }
  return pool;
}
function rebuildOrder(keepPos){
  if(state.customOrder){
    state.order = state.customOrder;
    state.customOrder = null;
    state.pos = 0; state.flipped=false;
    return;
  }
  const pool = currentPool();
  state.order = pool.map(w => w.no);
  if(!keepPos){ state.pos = 0; }
  if(state.pos >= state.order.length) state.pos = 0;
  state.flipped = false;
}
function shuffleOrder(){
  for(let i=state.order.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [state.order[i],state.order[j]] = [state.order[j],state.order[i]];
  }
  state.pos = 0; state.flipped=false;
}
function wordByNo(no){ return WORDS[no-1]; }

function updateStats(){
  let n=0,r=0,m=0;
  WORDS.forEach(w=>{
    const s = progress[w.no].status;
    if(s==='new') n++; else if(s==='review') r++; else if(s==='mastered') m++;
  });
  document.getElementById('stat-new').textContent = n;
  document.getElementById('stat-review').textContent = r;
  document.getElementById('stat-mastered').textContent = m;
}

/* ---------- tabs ---------- */
const TAB_MODES = ['flash','quiz','spell','listen','list','dash'];
function syncTabs(){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.mode===state.mode));
}
function goToMode(mode){
  state.mode = mode;
  state.pos = 0; state.streak = 0; state.showEx = false;
  if(mode!=='list' && (state.filter==='due')) { /* keep due filter across study modes */ }
  syncTabs();
  render();
}
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=> goToMode(btn.dataset.mode));
});

document.getElementById('due-badge-btn').addEventListener('click', ()=>{
  state.filter = 'due';
  state.sectionStart = 1; state.sectionEnd = WORDS.length;
  state.customOrder = null;
  goToMode('flash');
});

/* ---------- render root ---------- */
const main = document.getElementById('main');
const toolbar = document.getElementById('toolbar');

function render(){
  updateStats();
  refreshDueBadge();
  toolbar.innerHTML = '';
  if(state.mode==='flash') renderFlash();
  else if(state.mode==='quiz') renderQuizSetup();
  else if(state.mode==='spell') renderSpellSetup();
  else if(state.mode==='listen') renderListenSetup();
  else if(state.mode==='list') renderList();
  else if(state.mode==='dash') renderDashboard();
  else if(state.mode==='badges') renderBadgesPage();
}

/* ---------- toolbar: range button + filter chips ---------- */
const FILTERS = [
  {id:'all', label:'全て'},
  {id:'review', label:'🔴 復習中'},
  {id:'mastered', label:'🏅 習得済み'},
  {id:'due', label:'🧠 SRS期限', brass:true},
];
function rangeLabel(){
  if(state.sectionStart===1 && state.sectionEnd===WORDS.length) return '出題範囲: 全範囲';
  return `出題範囲: ${state.sectionStart}–${state.sectionEnd}`;
}
function renderToolbar({ showFilters=true } = {}){
  const dueN = srsDueCount();
  toolbar.innerHTML = `
    <button class="range-btn" id="open-range">🔍 <span>${rangeLabel()}</span></button>
    ${showFilters ? `<div class="filter-chips">${FILTERS.map(f=>{
      const label = f.id==='due' ? `${f.label} (${dueN})` : f.label;
      return `<button class="chip ${f.brass?'brass':''} ${state.filter===f.id?'active':''}" data-filter="${f.id}">${label}</button>`;
    }).join('')}</div>` : ''}
  `;
  document.getElementById('open-range').addEventListener('click', openRangePopover);
  if(showFilters){
    toolbar.querySelectorAll('.chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        state.filter = state.filter===chip.dataset.filter ? 'all' : chip.dataset.filter;
        state.customOrder = null;
        state.pos = 0; state.streak = 0;
        afterRangeChange(false);
      });
    });
  }
}

/* ---------- range popover ---------- */
function sectionGridHTML(){
  let secs = '';
  for(let s=1;s<=totalSections;s++){
    const start = (s-1)*SEC_SIZE+1;
    const end = Math.min(s*SEC_SIZE, WORDS.length);
    const active = (state.sectionStart===start && state.sectionEnd===end) ? 'active':'';
    const secWords = WORDS.slice(start-1,end);
    const doneCount = secWords.filter(w=>progress[w.no].status==='mastered').length;
    const pct = Math.round((doneCount/secWords.length)*100);
    secs += `<button class="sec-btn ${active}" data-start="${start}" data-end="${end}">${start}–${end}<small>Section ${s}</small><div class="sec-progress"><i style="width:${pct}%"></i></div></button>`;
  }
  const allActive = (state.sectionStart===1 && state.sectionEnd===WORDS.length) ? 'active':'';
  return `<button class="sec-btn ${allActive}" data-start="1" data-end="${WORDS.length}" style="grid-column:1/-1;">全範囲 (1–${WORDS.length})</button>${secs}`;
}
function openRangePopover(){
  const pop = document.getElementById('range-popover');
  const scrim = document.getElementById('range-scrim');
  pop.innerHTML = `
    <div class="popover-head"><h2>出題範囲を選ぶ</h2><button class="popover-close" id="range-close" aria-label="閉じる">✕</button></div>
    <div class="manual-range">
      <label>開始番号 <input type="number" id="range-start-input" min="1" max="${WORDS.length}" value="${state.rangeStart}"></label>
      <span class="sep">〜</span>
      <label>終了番号 <input type="number" id="range-end-input" min="1" max="${WORDS.length}" value="${state.rangeEnd}"></label>
      <button class="btn primary" id="range-apply">この範囲を適用</button>
    </div>
    <div class="range-err" id="range-err" style="font-size:12px;color:var(--danger);min-height:16px;"></div>
    <hr class="tear">
    <div class="section-grid">${sectionGridHTML()}</div>
  `;
  pop.classList.add('open');
  scrim.classList.add('open');
  document.getElementById('range-close').addEventListener('click', closeRangePopover);
  document.getElementById('range-apply').addEventListener('click', ()=>{
    const s = parseInt(document.getElementById('range-start-input').value);
    const e = parseInt(document.getElementById('range-end-input').value);
    const err = document.getElementById('range-err');
    if(isNaN(s) || isNaN(e) || s<1 || e>WORDS.length || s>e){
      err.textContent = `正しい範囲を入力してください（1〜${WORDS.length}、開始 ≤ 終了）`;
      return;
    }
    state.rangeStart = s; state.rangeEnd = e;
    state.sectionStart = s; state.sectionEnd = e;
    closeRangePopover();
    afterRangeChange(true);
  });
  pop.querySelectorAll('.sec-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      state.sectionStart = parseInt(b.dataset.start);
      state.sectionEnd = parseInt(b.dataset.end);
      closeRangePopover();
      afterRangeChange(true);
    });
  });
}
function closeRangePopover(){
  document.getElementById('range-popover').classList.remove('open');
  document.getElementById('range-scrim').classList.remove('open');
}
document.getElementById('range-scrim').addEventListener('click', closeRangePopover);

function afterRangeChange(resetPos){
  rebuildOrder(!resetPos);
  render();
}

/* ---------- settings panel ---------- */
function renderSettingsPanel(){
  const panel = document.getElementById('settings-panel');
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  panel.innerHTML = `
    <div class="settings-section">
      <h3>単語帳</h3>
      <div class="segmented" id="book-seg">
        <button data-book="1900" class="${BOOK==='1900'?'active':''}">TARGET 1900</button>
        <button data-book="1000" class="${BOOK==='1000'?'active':''}">TARGET 1000</button>
      </div>
    </div>
    <div class="settings-section">
      <h3>表示テーマ</h3>
      <div class="segmented" id="theme-seg">
        <button data-theme="light" class="${theme==='light'?'active':''}">ライト</button>
        <button data-theme="dark" class="${theme==='dark'?'active':''}">ダーク</button>
      </div>
    </div>
    <div class="settings-section">
      <h3>実績</h3>
      <div class="settings-link-row"><button class="btn ghost" id="settings-badges">🏆 実績を見る (${meta.badges.length}/${BADGES.length})</button></div>
    </div>
    <div class="settings-section">
      <h3>進捗のバックアップ</h3>
      <div class="settings-row"><button class="btn ghost" id="settings-export">💾 書き出す</button><button class="btn ghost" id="settings-import">📂 読み込む</button></div>
      <input type="file" id="file-import" accept="application/json" class="hidden">
      <div class="settings-note">進捗はこの端末のブラウザに自動保存されます。他の端末へ移す場合はバックアップをご利用ください。</div>
    </div>
  `;
  panel.querySelectorAll('#book-seg button').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.book===BOOK) return;
      localStorage.setItem(LS_BOOK, b.dataset.book);
      location.reload();
    });
  });
  panel.querySelectorAll('#theme-seg button').forEach(b=>{
    b.addEventListener('click', ()=> applyTheme(b.dataset.theme));
  });
  document.getElementById('settings-badges').addEventListener('click', ()=>{
    closeSettingsPanel();
    state.mode = 'badges';
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    render();
  });
  document.getElementById('settings-export').addEventListener('click', ()=>{
    const data = { savedAt: new Date().toISOString(), progress, history };
    const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${bookCfg.keyPrefix}_progress.json`;
    a.click();
  });
  document.getElementById('settings-import').addEventListener('click', ()=> document.getElementById('file-import').click());
  document.getElementById('file-import').addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev=>{
      try{
        const data = JSON.parse(ev.target.result);
        if(data.progress){
          Object.keys(data.progress).forEach(no=>{ if(progress[no]) progress[no] = data.progress[no]; });
        }
        if(data.history) history = data.history;
        saveState(); updateStats(); render();
        alert('進捗を読み込みました。');
      }catch(err){ alert('ファイルの読み込みに失敗しました。'); }
    };
    reader.readAsText(file);
  });
}
function openSettingsPanel(){ renderSettingsPanel(); document.getElementById('settings-panel').classList.add('open'); }
function closeSettingsPanel(){ document.getElementById('settings-panel').classList.remove('open'); }
document.getElementById('settings-btn').addEventListener('click', ()=>{
  const panel = document.getElementById('settings-panel');
  if(panel.classList.contains('open')) closeSettingsPanel(); else openSettingsPanel();
});
document.addEventListener('click', e=>{
  const panel = document.getElementById('settings-panel');
  if(panel.classList.contains('open') && !panel.contains(e.target) && e.target.id!=='settings-btn' && !e.target.closest('#settings-btn')){
    closeSettingsPanel();
  }
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeRangePopover(); closeSettingsPanel(); } });

/* ---------- shared example box ---------- */
function hasExample(w){ return !!(w && (w.ex_en || w.ex_ja)); }
function exampleBoxHTML(w){
  if(!hasExample(w)) return '<div class="example-box" id="example-box"></div>';
  return `<div class="example-box" id="example-box"><div class="en">${w.ex_en}</div><div class="ja">${w.ex_ja}</div></div>`;
}

/* ---------- FLASHCARD MODE ---------- */
function renderFlash(){
  rebuildOrder(true);
  renderToolbar();
  main.innerHTML = `<div id="flash-body"></div>`;
  renderFlashBody();
}
function renderFlashBody(){
  const body = document.getElementById('flash-body');
  const pool = state.order;
  if(pool.length===0){
    body.innerHTML = `<div class="empty">この範囲には単語がありません。絞り込み条件を見直してみましょう 🎉</div>`;
    return;
  }
  if(state.pos>=pool.length) state.pos=0;
  const no = pool[state.pos];
  const w = wordByNo(no);
  const pct = Math.round(((state.pos+1)/pool.length)*100);

  body.innerHTML = `
    <div class="card-stage">
      <div class="progress-line">
        <span>${state.pos+1} / ${pool.length}</span>
        <div class="progress-bar"><i style="width:${pct}%"></i></div>
        <span>${pct}%</span>
      </div>
      <div class="flashcard" id="flashcard">
        <div class="no">No. ${String(w.no).padStart(4,'0')}</div>
        <div class="face" id="face">${w.word}</div>
        <div class="phonetic" id="phonetic"></div>
        <div class="hint">${state.flipped ? 'クリックで単語に戻る' : 'クリック / スペースキーで意味を表示'}</div>
        <div class="stamp ok" id="stamp-ok">済</div>
        <div class="stamp ng" id="stamp-ng">✕</div>
      </div>
      ${exampleBoxHTML(w)}
      ${TTS_SUPPORTED ? `
      <div class="flash-audio-row">
        <button class="btn ghost" id="btn-speak">🔊 発音 <span class="kbd">S</span></button>
        <button class="btn ghost ${state.autoSpeak ? 'toggle-on' : ''}" id="btn-autospeak">${state.autoSpeak ? '🔔 自動読み上げ:ON' : '🔕 自動読み上げ:OFF'}</button>
        <div class="listen-rate">
          ${[0.7,1.0,1.3].map(r=>`<button class="rate-btn ${state.listenRate===r?'active':''}" data-rate="${r}">${r}×</button>`).join('')}
        </div>
      </div>` : ''}
      <div class="card-controls">
        <button class="btn ng" id="btn-ng">✕ もう一度 <span class="kbd">2</span></button>
        ${hasExample(w) ? `<button class="btn ghost" id="btn-ex">📖 例文 <span class="kbd">E</span></button>` : ''}
        <button class="btn ghost" id="btn-shuffle">🔀 シャッフル</button>
        <button class="btn ok" id="btn-ok">◯ わかる <span class="kbd">1</span></button>
      </div>
      <div class="navrow">
        <button id="nav-prev">←</button>
        <span>矢印キーで前後に移動 ・ <span class="kbd">Space</span> でめくる${hasExample(w) ? ` ・ <span class="kbd">E</span> で例文` : ''}</span>
        <button id="nav-next">→</button>
      </div>
    </div>`;

  const card = document.getElementById('flashcard');
  const face = document.getElementById('face');
  const phon = document.getElementById('phonetic');
  function paintFace(){
    if(state.flipped){ face.textContent = w.mean; face.classList.add('ja'); if(phon) phon.classList.add('hidden'); }
    else{ face.textContent = w.word; face.classList.remove('ja'); if(phon) phon.classList.remove('hidden'); }
  }
  paintFace();
  renderPhonetic(w.word, 'phonetic');
  if(state.showEx) document.getElementById('example-box').classList.add('show');
  card.addEventListener('click', ()=>{
    state.flipped = !state.flipped;
    paintFace();
    document.querySelector('.hint').textContent = state.flipped ? 'クリックで単語に戻る' : 'クリック / スペースキーで意味を表示';
  });
  document.getElementById('btn-ex')?.addEventListener('click', ()=>{
    state.showEx = !state.showEx;
    document.getElementById('example-box').classList.toggle('show', state.showEx);
  });
  document.getElementById('btn-shuffle').addEventListener('click', ()=>{ shuffleOrder(); renderFlashBody(); });
  document.getElementById('nav-prev').addEventListener('click', ()=>stepCard(-1));
  document.getElementById('nav-next').addEventListener('click', ()=>stepCard(1));
  document.getElementById('btn-ok').addEventListener('click', ()=>markCard(true));
  document.getElementById('btn-ng').addEventListener('click', ()=>markCard(false));

  if(TTS_SUPPORTED){
    document.getElementById('btn-speak').addEventListener('click', ()=>speakWord(w.word));
    document.getElementById('btn-autospeak').addEventListener('click', ()=>{
      state.autoSpeak = !state.autoSpeak; saveSettings(); renderFlashBody();
    });
    document.querySelectorAll('.flash-audio-row .rate-btn').forEach(b=>{
      b.addEventListener('click', ()=>{ state.listenRate = parseFloat(b.dataset.rate); saveSettings(); renderFlashBody(); });
    });
    if(state.autoSpeak) speakWord(w.word);
  }
}
function stepCard(delta){
  const len = state.order.length;
  if(len===0) return;
  state.pos = (state.pos + delta + len) % len;
  state.flipped = false; state.showEx = false;
  renderFlashBody();
}
function markCard(ok){
  const no = state.order[state.pos];
  showStamp(ok?'ok':'ng');
  applyAnswer(no, ok);
  updateStats();
  setTimeout(()=>{ state.showEx=false; stepCard(1); }, 320);
}
function showStamp(kind){
  const el = document.getElementById(kind==='ok'?'stamp-ok':'stamp-ng');
  if(!el) return;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

/* ---------- QUIZ MODE ---------- */
function renderQuizSetup(){
  rebuildOrder(false);
  shuffleOrder();
  state.sessionCorrect = 0; state.sessionWrong = 0; state.sessionMissed = [];
  renderToolbar();
  main.innerHTML =
    `<div class="chiprow" style="display:flex;gap:8px;margin-bottom:16px;">
       <button class="chip ${state.quizDir==='en2ja'?'active':''}" id="dir-en2ja">英語 → 意味</button>
       <button class="chip ${state.quizDir==='ja2en'?'active':''}" id="dir-ja2en">意味 → 英語</button>
     </div>
     <div id="quiz-body"></div>`;
  document.getElementById('dir-en2ja').addEventListener('click',()=>{state.quizDir='en2ja'; renderQuizSetup();});
  document.getElementById('dir-ja2en').addEventListener('click',()=>{state.quizDir='ja2en'; renderQuizSetup();});
  renderQuizQuestion();
}
function renderQuizQuestion(){
  const body = document.getElementById('quiz-body');
  const pool = state.order;
  if(pool.length < 4){
    body.innerHTML = `<div class="empty">4択クイズを出題するには、この範囲に最低4語必要です。範囲を広げてください。</div>`;
    return;
  }
  if(state.pos>=pool.length){ state.pos=0; }
  const no = pool[state.pos];
  const w = wordByNo(no);
  state.quizLocked = false;

  const wrongPool = WORDS.filter(x=>x.no!==no);
  const wrongs = [];
  while(wrongs.length<3){
    const cand = wrongPool[Math.floor(Math.random()*wrongPool.length)];
    if(!wrongs.includes(cand)) wrongs.push(cand);
  }
  const choices = [w, ...wrongs].map(c => state.quizDir==='en2ja' ? c.mean : c.word);
  for(let i=choices.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [choices[i],choices[j]]=[choices[j],choices[i]]; }
  const answer = state.quizDir==='en2ja' ? w.mean : w.word;
  const promptText = state.quizDir==='en2ja' ? w.word : w.mean;
  const promptCls = state.quizDir==='en2ja' ? 'en' : '';

  body.innerHTML = `
    <div class="quiz-wrap">
      <div class="progress-line" style="margin-bottom:14px;">
        <span>${state.pos+1} / ${pool.length}</span>
        <div class="progress-bar"><i style="width:${Math.round(((state.pos+1)/pool.length)*100)}%"></i></div>
      </div>
      <div class="quiz-q">
        <div class="no">No. ${String(w.no).padStart(4,'0')}</div>
        <div class="prompt ${promptCls}">${promptText}</div>
        <div class="choices">${choices.map(c=>`<button class="choice" data-choice="${encodeURIComponent(c)}">${c}</button>`).join('')}</div>
      </div>
      <div id="quiz-ex"></div>
      <div class="streak">連続正解 <b id="streak-n">${state.streak}</b></div>
      <div class="quiz-footer"><button class="btn primary hidden" id="quiz-next">次の問題へ →</button></div>
    </div>`;

  document.querySelectorAll('.choice').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(state.quizLocked) return;
      state.quizLocked = true;
      const chosen = decodeURIComponent(btn.dataset.choice);
      document.querySelectorAll('.choice').forEach(b=>{
        const val = decodeURIComponent(b.dataset.choice);
        if(val===answer) b.classList.add('correct');
        else if(b===btn) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      const ok = chosen===answer;
      applyAnswer(no, ok);
      if(ok) state.sessionCorrect++; else { state.sessionWrong++; state.sessionMissed.push(no); }
      document.getElementById('streak-n').textContent = state.streak;
      document.getElementById('quiz-ex').innerHTML = exampleBoxHTML(w).replace('example-box','example-box show');
      updateStats();
      const isLast = state.pos+1 >= pool.length;
      const nextBtn = document.getElementById('quiz-next');
      nextBtn.textContent = isLast ? '結果を見る →' : '次の問題へ →';
      nextBtn.classList.remove('hidden');
      nextBtn.addEventListener('click', ()=>{
        if(isLast){ renderQuizFinish(); }
        else { state.pos++; renderQuizQuestion(); }
      }, {once:true});
    });
  });
}

/* ---------- SPELL MODE ---------- */
function renderSpellSetup(){
  rebuildOrder(false);
  shuffleOrder();
  state.sessionCorrect = 0; state.sessionWrong = 0; state.sessionMissed = [];
  renderToolbar();
  main.innerHTML = `<div id="spell-body"></div>`;
  renderSpellQuestion();
}
function renderSpellQuestion(){
  const body = document.getElementById('spell-body');
  const pool = state.order;
  if(pool.length===0){
    body.innerHTML = `<div class="empty">この範囲には単語がありません。</div>`;
    return;
  }
  if(state.pos>=pool.length) state.pos=0;
  const no = pool[state.pos];
  const w = wordByNo(no);

  body.innerHTML = `
    <div class="quiz-wrap">
      <div class="progress-line" style="margin-bottom:14px;">
        <span>${state.pos+1} / ${pool.length}</span>
        <div class="progress-bar"><i style="width:${Math.round(((state.pos+1)/pool.length)*100)}%"></i></div>
      </div>
      <div class="quiz-q">
        <div class="no">No. ${String(w.no).padStart(4,'0')}</div>
        <div class="prompt">${w.mean}</div>
        <input type="text" class="spell-input" id="spell-input" placeholder="英単語を入力" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="spell-fb" id="spell-fb"></div>
      </div>
      <div id="spell-ex"></div>
      <div class="quiz-footer">
        <button class="btn ghost" id="spell-skip">わからない（答えを見る）</button>
        <button class="btn primary" id="spell-check">✓ 答え合わせ <span class="kbd">Enter</span></button>
      </div>
    </div>`;

  const input = document.getElementById('spell-input');
  input.focus();
  const fb = document.getElementById('spell-fb');
  let locked = false;
  const isLast = state.pos+1 >= pool.length;
  function finish(){
    document.getElementById('spell-ex').innerHTML = exampleBoxHTML(w).replace('example-box','example-box show');
    updateStats();
    document.getElementById('spell-check').textContent = isLast ? '結果を見る →' : '次へ →';
    input.disabled = true;
  }
  function goNext(){
    if(isLast){ renderSpellFinish(); }
    else { state.pos++; renderSpellQuestion(); }
  }
  function check(){
    if(locked) return;
    locked = true;
    if(normalize(input.value)===normalize(w.word)){
      applyAnswer(no, true);
      state.sessionCorrect++;
      fb.textContent = '◯ 正解！'; fb.className='spell-fb ok';
    } else {
      applyAnswer(no, false);
      state.sessionWrong++; state.sessionMissed.push(no);
      fb.textContent = `✕ 正解: ${w.word}`; fb.className='spell-fb ng';
    }
    finish();
  }
  function reveal(){
    if(locked) return;
    locked = true;
    applyAnswer(no, false);
    state.sessionWrong++; state.sessionMissed.push(no);
    fb.textContent = `答え: ${w.word}`; fb.className='spell-fb ng';
    finish();
  }
  document.getElementById('spell-check').addEventListener('click', ()=>{
    if(!locked) check(); else goNext();
  });
  document.getElementById('spell-skip').addEventListener('click', reveal);
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ if(!locked) check(); else goNext(); }
  });
}

/* ---------- LISTENING MODE ---------- */
const TTS_SUPPORTED = ('speechSynthesis' in window);
function speakWord(word){
  if(!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US'; u.rate = state.listenRate;
  window.speechSynthesis.speak(u);
}
function renderListenSetup(){
  rebuildOrder(false);
  shuffleOrder();
  state.sessionCorrect = 0; state.sessionWrong = 0; state.sessionMissed = [];
  renderToolbar();
  main.innerHTML = `<div id="listen-body"></div>`;
  if(!('speechSynthesis' in window)){
    document.getElementById('listen-body').innerHTML = `<div class="empty">お使いのブラウザは音声読み上げに対応していません。</div>`;
    return;
  }
  renderListenQuestion();
}
function renderListenQuestion(){
  const body = document.getElementById('listen-body');
  const pool = state.order;
  if(pool.length < 4){
    body.innerHTML = `<div class="empty">リスニングモードには、この範囲に最低4語必要です。範囲を広げてください。</div>`;
    return;
  }
  if(state.pos>=pool.length){ state.pos=0; }
  const no = pool[state.pos];
  const w = wordByNo(no);
  state.listenLocked = false;

  const wrongPool = WORDS.filter(x=>x.no!==no);
  const wrongs = [];
  while(wrongs.length<3){
    const cand = wrongPool[Math.floor(Math.random()*wrongPool.length)];
    if(!wrongs.includes(cand)) wrongs.push(cand);
  }
  const choices = [w, ...wrongs].map(c => c.mean);
  for(let i=choices.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [choices[i],choices[j]]=[choices[j],choices[i]]; }
  const answer = w.mean;
  const rates = [0.7,1.0,1.3];

  body.innerHTML = `
    <div class="quiz-wrap">
      <div class="progress-line" style="margin-bottom:14px;">
        <span>${state.pos+1} / ${pool.length}</span>
        <div class="progress-bar"><i style="width:${Math.round(((state.pos+1)/pool.length)*100)}%"></i></div>
      </div>
      <div class="quiz-q">
        <div class="no">No. ${String(w.no).padStart(4,'0')}</div>
        <button class="listen-play" id="listen-play">🔊</button>
        <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">タップして発音を聞く</div>
        <div class="listen-rate">${rates.map(r=>`<button class="rate-btn ${state.listenRate===r?'active':''}" data-rate="${r}">${r}×</button>`).join('')}</div>
        <div class="choices" style="margin-top:22px;">${choices.map(c=>`<button class="choice" data-choice="${encodeURIComponent(c)}">${c}</button>`).join('')}</div>
      </div>
      <div id="listen-ex"></div>
      <div class="streak">連続正解 <b id="streak-n">${state.streak}</b></div>
      <div class="quiz-footer"><button class="btn primary hidden" id="listen-next">次の問題へ →</button></div>
    </div>`;

  document.getElementById('listen-play').addEventListener('click', ()=>speakWord(w.word));
  document.querySelectorAll('.rate-btn').forEach(b=>{
    b.addEventListener('click', ()=>{ state.listenRate = parseFloat(b.dataset.rate); renderListenQuestion(); });
  });
  speakWord(w.word);

  document.querySelectorAll('.choice').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(state.listenLocked) return;
      state.listenLocked = true;
      const chosen = decodeURIComponent(btn.dataset.choice);
      document.querySelectorAll('.choice').forEach(b=>{
        const val = decodeURIComponent(b.dataset.choice);
        if(val===answer) b.classList.add('correct');
        else if(b===btn) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      const ok = chosen===answer;
      applyAnswer(no, ok);
      if(ok) state.sessionCorrect++; else { state.sessionWrong++; state.sessionMissed.push(no); }
      document.getElementById('streak-n').textContent = state.streak;
      document.getElementById('listen-ex').innerHTML =
        `<div class="example-box show"><div style="font-family:'Spectral',serif; font-weight:700; font-size:18px;">${w.word}</div>${hasExample(w) ? `<div class="en">${w.ex_en}</div><div class="ja">${w.ex_ja}</div>` : ''}</div>`;
      updateStats();
      const isLast = state.pos+1 >= pool.length;
      const nextBtn = document.getElementById('listen-next');
      nextBtn.textContent = isLast ? '結果を見る →' : '次の問題へ →';
      nextBtn.classList.remove('hidden');
      nextBtn.addEventListener('click', ()=>{
        if(isLast){ renderListenFinish(); }
        else { state.pos++; renderListenQuestion(); }
      }, {once:true});
    });
  });
}

/* ---------- SESSION RESULTS (quiz / spell / listen) ---------- */
function sessionSummaryHTML(pool){
  const total = pool.length;
  const correct = state.sessionCorrect;
  const wrong = state.sessionWrong;
  const pct = total>0 ? Math.round((correct/total)*100) : 0;
  const missedWords = state.sessionMissed.map(no=>wordByNo(no));
  return `
    <div class="quiz-wrap">
      <div class="dash-card" style="max-width:560px;margin:0 auto;">
        <h3>🎉 セッション終了</h3>
        <div class="dash-stats">
          <div class="dash-stat"><b>${pct}%</b><span>正答率</span></div>
          <div class="dash-stat"><b style="color:var(--accent)">${correct}</b><span>正解</span></div>
          <div class="dash-stat"><b style="color:var(--danger)">${wrong}</b><span>不正解</span></div>
          <div class="dash-stat"><b>${total}</b><span>出題数</span></div>
        </div>
        ${missedWords.length ? `
          <div style="margin-top:16px;text-align:left;">
            <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:6px;">間違えた単語</div>
            <ul class="weak-list">${missedWords.map(w=>`<li><span class="w">${w.word}</span><span>${w.mean}</span></li>`).join('')}</ul>
          </div>` : ''}
        <div class="quiz-footer" style="margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="btn primary" id="session-retry">🔄 もう一度</button>
          <button class="btn ghost" id="session-dash">📊 ダッシュボードへ</button>
        </div>
      </div>
    </div>`;
}
function renderQuizFinish(){
  const pool = state.order;
  document.getElementById('quiz-body').innerHTML = sessionSummaryHTML(pool);
  document.getElementById('session-retry').addEventListener('click', renderQuizSetup);
  document.getElementById('session-dash').addEventListener('click', ()=>goToMode('dash'));
}
function renderSpellFinish(){
  const pool = state.order;
  document.getElementById('spell-body').innerHTML = sessionSummaryHTML(pool);
  document.getElementById('session-retry').addEventListener('click', renderSpellSetup);
  document.getElementById('session-dash').addEventListener('click', ()=>goToMode('dash'));
}
function renderListenFinish(){
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  const pool = state.order;
  document.getElementById('listen-body').innerHTML = sessionSummaryHTML(pool);
  document.getElementById('session-retry').addEventListener('click', renderListenSetup);
  document.getElementById('session-dash').addEventListener('click', ()=>goToMode('dash'));
}

/* ---------- LIST MODE ---------- */
function renderList(){
  renderToolbar();
  main.innerHTML = `
    <div class="list-controls"><input type="text" class="search" id="wt-search" placeholder="英単語・意味で検索…"></div>
    <div id="wt-wrap"></div>`;
  const wrap = document.getElementById('wt-wrap');
  function draw(filterText){
    let pool = currentPool();
    if(filterText){
      const q = filterText.toLowerCase();
      pool = pool.filter(w=>w.word.toLowerCase().includes(q) || w.mean.includes(filterText));
    }
    if(pool.length===0){ wrap.innerHTML = `<div class="empty">該当する単語がありません。</div>`; return; }
    wrap.innerHTML = `<table class="wordtable"><thead><tr><th class="wt-no">No.</th><th class="wt-word">単語</th><th>意味</th><th>状態</th><th></th></tr></thead>
      <tbody>${pool.map(w=>{
        const st = progress[w.no].status;
        const label = st==='mastered'?'習得済み':st==='review'?'復習中':'未着手';
        return `<tr class="wt-row" data-no="${w.no}"><td class="wt-no">${w.no}</td><td class="wt-word" data-no="${w.no}">${w.word}<span class="wt-phon" id="wt-phon-${w.no}"></span></td><td>${w.mean}</td>
          <td><span class="badge ${st}">${label}</span></td>
          <td><button class="jumpbtn" data-no="${w.no}">カードで見る</button></td></tr>
          ${hasExample(w) ? `<tr class="ex-row hidden" data-for="${w.no}"><td></td><td colspan="4"><div class="en">${w.ex_en}</div><div>${w.ex_ja}</div></td></tr>` : ''}`;
      }).join('')}</tbody></table>`;
    wrap.querySelectorAll('.jumpbtn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const no = parseInt(b.dataset.no);
        rebuildOrder(false);
        const idx = state.order.indexOf(no);
        state.pos = idx>=0 ? idx : 0;
        goToMode('flash');
      });
    });
    wrap.querySelectorAll('.wt-word').forEach(el=>{
      el.addEventListener('click', ()=>{
        const row = wrap.querySelector(`.ex-row[data-for="${el.dataset.no}"]`);
        if(row) row.classList.toggle('hidden');
        const w = wordByNo(parseInt(el.dataset.no));
        renderPhonetic(w.word, `wt-phon-${el.dataset.no}`);
      });
    });
  }
  draw('');
  document.getElementById('wt-search').addEventListener('input', e=>draw(e.target.value));
}

/* ---------- PHONETIC (IPA) LOOKUP ---------- */
function renderPhonetic(word, targetId){
  const el = document.getElementById(targetId);
  if(!el) return;
  if(phoneticCache[word]){ el.textContent = phoneticCache[word] || ''; return; }
  el.textContent = '…';
  el.classList.add('loading');
  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      let ipa = '';
      for(const entry of data){
        if(entry.phonetic){ ipa = entry.phonetic; break; }
        if(entry.phonetics){ const found = entry.phonetics.find(p=>p.text); if(found){ ipa = found.text; break; } }
      }
      phoneticCache[word] = ipa; savePhoneticCache();
      const stillThere = document.getElementById(targetId);
      if(stillThere){ stillThere.textContent = ipa; stillThere.classList.remove('loading'); }
    })
    .catch(()=>{
      phoneticCache[word] = ''; savePhoneticCache();
      const stillThere = document.getElementById(targetId);
      if(stillThere){ stillThere.textContent = ''; stillThere.classList.remove('loading'); }
    });
}

/* ---------- BADGES / ACHIEVEMENTS ---------- */
const BADGES = [
  { id:'first_step', icon:'🌱', name:'最初の一歩', desc:'単語を1つ習得する', test:()=>masteredCount()>=1 },
  { id:'bronze_50', icon:'🥉', name:'ブロンズ', desc:'50語習得する', test:()=>masteredCount()>=50 },
  { id:'silver_200', icon:'🥈', name:'シルバー', desc:'200語習得する', test:()=>masteredCount()>=200 },
  { id:'gold_500', icon:'🥇', name:'ゴールド', desc:'500語習得する', test:()=>masteredCount()>=500 },
  { id:'platinum_1000', icon:'💎', name:'プラチナ', desc:'1000語習得する', test:()=>masteredCount()>=1000 },
  { id:'complete_all', icon:'👑', name:'コンプリート', desc:`全${WORDS.length}語を習得する`, test:()=>masteredCount()>=WORDS.length },
  { id:'streak_3', icon:'🔥', name:'3日連続', desc:'3日連続で学習する', test:()=>studyStreakDays()>=3 },
  { id:'streak_7', icon:'🔥🔥', name:'1週間連続', desc:'7日連続で学習する', test:()=>studyStreakDays()>=7 },
  { id:'streak_30', icon:'🔥🔥🔥', name:'1ヶ月連続', desc:'30日連続で学習する', test:()=>studyStreakDays()>=30 },
  { id:'quiz_ace', icon:'⚡', name:'クイズエース', desc:'10問連続正解する', test:()=>meta.maxQuizStreak>=10 },
  { id:'quiz_legend', icon:'🌟', name:'クイズレジェンド', desc:'25問連続正解する', test:()=>meta.maxQuizStreak>=25 },
  { id:'srs_champion', icon:'🧠', name:'SRSチャンピオン', desc:'SRS復習を1日で20問こなす', test:()=>meta.srsDoneToday.count>=20 },
  { id:'night_owl', icon:'🦉', name:'夜型', desc:'深夜0時〜4時に学習する', test:()=>meta.nightOwl===true },
  { id:'early_bird', icon:'🐦', name:'早起き', desc:'朝5時〜7時に学習する', test:()=>meta.earlyBird===true },
];
function masteredCount(){ return WORDS.filter(w=>progress[w.no].status==='mastered').length; }
function studyStreakDays(){
  let n=0; const d = new Date();
  for(;;){
    const key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    if(history[key] && history[key].studied>0){ n++; d.setDate(d.getDate()-1); } else break;
  }
  return n;
}
function checkBadges(){
  BADGES.forEach(b=>{
    if(!meta.badges.includes(b.id) && b.test()){ meta.badges.push(b.id); showBadgeToast(b); }
  });
  saveMeta();
}
let toastTimer = null;
function showBadgeToast(badge){
  const el = document.getElementById('badge-toast');
  if(!el) return;
  el.innerHTML = `<span class="ic">${badge.icon}</span><span><span class="tt">実績を解除しました！</span><br>${badge.name}</span>`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 3400);
}
function renderBadgesPage(){
  const earnedCount = meta.badges.length;
  main.innerHTML = `
    <div class="picker-row" style="margin-bottom:8px;"><div style="font-weight:700;font-size:14.5px;">🏆 実績・バッジ（${earnedCount} / ${BADGES.length}）</div></div>
    <hr class="tear">
    <div class="badge-grid">
      ${BADGES.map(b=>{
        const earned = meta.badges.includes(b.id);
        return `<div class="badge-card ${earned?'earned':''}"><div class="ic">${b.icon}</div><div class="nm">${b.name}</div><div class="dsc">${b.desc}</div></div>`;
      }).join('')}
    </div>`;
}

/* ---------- DASHBOARD ---------- */
let chartDaily=null, chartDonut=null, chartForgetting=null, chartUpcoming=null;
function renderDashboard(){
  let n=0,r=0,m=0;
  WORDS.forEach(w=>{ const s = progress[w.no].status; if(s==='new') n++; else if(s==='review') r++; else if(s==='mastered') m++; });
  const total = WORDS.length;
  const pct = Math.round((m/total)*100);

  const days = [];
  const now = new Date();
  for(let i=13;i>=0;i--){
    const d = new Date(now); d.setDate(now.getDate()-i);
    const key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    days.push({key, label:(d.getMonth()+1)+'/'+d.getDate(), studied: history[key]?history[key].studied:0, correct: history[key]?history[key].correct:0});
  }
  const weak = WORDS.filter(w=>progress[w.no].wrong>0).sort((a,b)=>progress[b.no].wrong - progress[a.no].wrong).slice(0,20);
  const dueToday = srsDueCount();
  const doneTodaySrs = meta.srsDoneToday.date===todayStr() ? meta.srsDoneToday.count : 0;
  const forgetting = computeForgettingCurve();
  const upcoming = computeUpcomingReviews();
  const earnedBadges = meta.badges.length;

  main.innerHTML = `
    <div class="dash-grid">
      <div class="dash-card">
        <h3>全体の習得状況</h3>
        <div class="dash-stats">
          <div class="dash-stat"><b>${pct}%</b><span>習得率</span></div>
          <div class="dash-stat"><b style="color:var(--ink-faint)">${n}</b><span>未着手</span></div>
          <div class="dash-stat"><b style="color:var(--danger)">${r}</b><span>復習中</span></div>
          <div class="dash-stat"><b style="color:var(--accent)">${m}</b><span>習得済み</span></div>
        </div>
        <div class="chart-wrap small"><canvas id="chart-donut"></canvas></div>
      </div>
      <div class="dash-card">
        <h3>直近14日間の学習量</h3>
        <div class="chart-wrap small"><canvas id="chart-daily"></canvas></div>
      </div>
      <div class="dash-card">
        <h3>🧠 SRS復習ステータス</h3>
        <div class="dash-stats">
          <div class="dash-stat"><b style="color:var(--brass)">${dueToday}</b><span>本日復習すべき語</span></div>
          <div class="dash-stat"><b style="color:var(--accent)">${doneTodaySrs}</b><span>本日完了した復習</span></div>
        </div>
        <div style="margin-top:10px;"><button class="btn ok" id="btn-go-srs">🧠 SRS復習をはじめる</button></div>
        <div class="chart-wrap small" style="margin-top:12px;"><canvas id="chart-upcoming"></canvas></div>
      </div>
      <div class="dash-card">
        <h3>🏆 実績</h3>
        <div class="dash-stats"><div class="dash-stat"><b style="color:var(--brass)">${earnedBadges} / ${BADGES.length}</b><span>解除したバッジ</span></div></div>
        <div class="badge-grid" style="margin-top:10px;">
          ${BADGES.filter(b=>meta.badges.includes(b.id)).slice(0,6).map(b=>`<div class="badge-card earned" style="padding:8px 6px;"><div class="ic" style="font-size:20px;">${b.icon}</div><div class="nm" style="font-size:10.5px;">${b.name}</div></div>`).join('') || '<div class="empty" style="padding:10px;">まだバッジがありません</div>'}
        </div>
        <div style="margin-top:10px;"><button class="btn ghost" id="btn-go-badges">🏆 すべての実績を見る</button></div>
      </div>
      <div class="dash-card wide">
        <h3>📉 忘却曲線（推定）</h3>
        ${forgetting ? `
          <div class="chart-wrap small"><canvas id="chart-forgetting"></canvas></div>
          <div class="curve-legend">
            <span><i style="background:var(--danger)"></i>推定平均定着率（今）: ${forgetting.avgCurrent}%</span>
            <span><i style="background:var(--accent)"></i>復習しない場合の減衰曲線（平均安定度 ${forgetting.avgStability.toFixed(1)}日）</span>
          </div>
          <div class="srs-info" style="text-align:left;">エビングハウスの忘却曲線をもとに、あなたのSRSデータ（各単語の復習間隔）から推定した記憶保持率の減衰カーブです。定期的に復習することでカーブが右にシフトし、忘れにくくなります。</div>
        ` : `<div class="empty" style="padding:24px;">まだSRSデータがありません。フラッシュカードやSRS復習で単語を学習すると表示されます。</div>`}
      </div>
      <div class="dash-card wide">
        <h3>セクション別 習得率</h3>
        <div class="sec-bars" id="sec-bars"></div>
      </div>
      <div class="dash-card wide">
        <h3>苦手な単語 TOP 20（間違えた回数順）</h3>
        ${weak.length===0 ? '<div class="empty" style="padding:24px;">まだ間違えた単語がありません。クイズやスペルテストに挑戦してみましょう。</div>' :
          `<ul class="weak-list" id="weak-list">${weak.map(w=>`<li data-no="${w.no}"><span class="w">${w.word}</span><span>${w.mean}</span><span class="c">✕${progress[w.no].wrong}</span></li>`).join('')}</ul>
           <div style="margin-top:10px;"><button class="btn ok" id="btn-weak-drill">🔥 苦手な単語だけ復習する</button></div>`}
      </div>
    </div>`;

  document.getElementById('btn-go-srs')?.addEventListener('click', ()=>{
    state.filter = 'due'; state.sectionStart = 1; state.sectionEnd = WORDS.length; state.customOrder = null;
    goToMode('flash');
  });
  document.getElementById('btn-go-badges')?.addEventListener('click', ()=>{
    state.mode='badges';
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    render();
  });

  const secBars = document.getElementById('sec-bars');
  let secHtml = '';
  for(let s=1;s<=totalSections;s++){
    const start = (s-1)*SEC_SIZE+1;
    const end = Math.min(s*SEC_SIZE, WORDS.length);
    const secWords = WORDS.slice(start-1,end);
    const doneCount = secWords.filter(w=>progress[w.no].status==='mastered').length;
    const p = Math.round((doneCount/secWords.length)*100);
    secHtml += `<div class="sec-bar-row"><span>${start}–${end}</span><div class="sec-bar-track"><i style="width:${p}%"></i></div><span>${p}%</span></div>`;
  }
  secBars.innerHTML = secHtml;

  if(typeof Chart !== 'undefined'){
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim();
    const inkSoft = styles.getPropertyValue('--ink-soft').trim();
    const accent = styles.getPropertyValue('--accent').trim();
    const brass = styles.getPropertyValue('--brass').trim();
    const danger = styles.getPropertyValue('--danger').trim();
    const faint = styles.getPropertyValue('--ink-faint').trim();
    const border = styles.getPropertyValue('--border').trim();

    if(chartDonut) chartDonut.destroy();
    chartDonut = new Chart(document.getElementById('chart-donut'), {
      type:'doughnut',
      data:{ labels:['習得済み','復習中','未着手'], datasets:[{ data:[m,r,n], backgroundColor:[accent,danger,faint], borderWidth:0 }]},
      options:{ plugins:{ legend:{ position:'bottom', labels:{ color: ink, boxWidth:12, font:{size:11} } } }, maintainAspectRatio:false }
    });
    if(chartDaily) chartDaily.destroy();
    chartDaily = new Chart(document.getElementById('chart-daily'), {
      type:'bar',
      data:{ labels: days.map(d=>d.label), datasets:[{ label:'学習数', data: days.map(d=>d.studied), backgroundColor: accent+'55', borderColor: accent, borderWidth:1, borderRadius:4 }]},
      options:{ maintainAspectRatio:false,
        scales:{ x:{ ticks:{ color: inkSoft, font:{size:10} }, grid:{ color: border } }, y:{ beginAtZero:true, ticks:{ color: inkSoft, precision:0 }, grid:{ color: border } } },
        plugins:{ legend:{ display:false } } }
    });
    if(chartUpcoming) chartUpcoming.destroy();
    chartUpcoming = new Chart(document.getElementById('chart-upcoming'), {
      type:'bar',
      data:{ labels: upcoming.map(d=>d.label), datasets:[{ label:'復習予定数', data: upcoming.map(d=>d.count), backgroundColor: brass+'66', borderColor: brass, borderWidth:1, borderRadius:4 }]},
      options:{ maintainAspectRatio:false,
        scales:{ x:{ ticks:{ color: inkSoft, font:{size:9} }, grid:{ display:false } }, y:{ beginAtZero:true, ticks:{ color: inkSoft, precision:0 }, grid:{ color: border } } },
        plugins:{ legend:{ display:false }, title:{ display:true, text:'今後14日間の復習予定', color: inkSoft, font:{size:11} } } }
    });
    if(forgetting){
      const fgCanvas = document.getElementById('chart-forgetting');
      if(chartForgetting) chartForgetting.destroy();
      if(fgCanvas){
        chartForgetting = new Chart(fgCanvas, {
          type:'line',
          data:{ labels: forgetting.curve.map((_,i)=>i+'日後'), datasets:[{ label:'推定記憶保持率(%)', data: forgetting.curve, borderColor: accent, backgroundColor: accent+'22', fill:true, tension:.3, pointRadius:2 }]},
          options:{ maintainAspectRatio:false,
            scales:{ x:{ ticks:{ color: inkSoft, font:{size:9} }, grid:{ color: border } }, y:{ min:0, max:100, ticks:{ color: inkSoft, callback:v=>v+'%' }, grid:{ color: border } } },
            plugins:{ legend:{ display:false } } }
        });
      }
    }
  }

  const weakListEl = document.getElementById('weak-list');
  if(weakListEl){
    weakListEl.querySelectorAll('li').forEach(li=>{
      li.addEventListener('click', ()=>{
        state.customOrder = [parseInt(li.dataset.no)];
        goToMode('flash');
      });
    });
  }
  document.getElementById('btn-weak-drill')?.addEventListener('click', ()=>{
    state.customOrder = weak.map(w=>w.no);
    goToMode('flash');
  });
}

/* ---------- keyboard shortcuts (flashcard) ---------- */
document.addEventListener('keydown', e=>{
  if(document.activeElement && document.activeElement.tagName==='INPUT') return;
  if(state.mode==='flash'){
    if(e.code==='Space'){ e.preventDefault(); document.getElementById('flashcard')?.click(); }
    else if(e.key==='ArrowRight'){ stepCard(1); }
    else if(e.key==='ArrowLeft'){ stepCard(-1); }
    else if(e.key==='1'){ markCard(true); }
    else if(e.key==='2'){ markCard(false); }
    else if(e.key==='e' || e.key==='E'){ document.getElementById('btn-ex')?.click(); }
    else if(e.key==='s' || e.key==='S'){ document.getElementById('btn-speak')?.click(); }
  }
  else if(state.mode==='quiz'){
    if(e.key==='Enter'){
      const btn = document.getElementById('quiz-next');
      if(btn && !btn.classList.contains('hidden')) btn.click();
    }
  }
  else if(state.mode==='listen'){
    if(e.key==='Enter'){
      const btn = document.getElementById('listen-next');
      if(btn && !btn.classList.contains('hidden')) btn.click();
    }
  }
});

/* ---------- init ---------- */
loadState();
state.sectionEnd = Math.min(SEC_SIZE, WORDS.length);
state.rangeEnd = state.sectionEnd;
rebuildOrder(false);
checkBadges();
syncTabs();
render();