export const MONITOR_HTML = /* html */ `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="台灣數位憑證皮夾生態系的每日監測：官方信任清單、撤銷清單、鏈上登錄、原始碼與 API 健康度">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="請收下卡片">
  <meta property="og:title" content="數位憑證皮夾生態系監測">
  <meta property="og:description" content="每日掃描官方信任清單、撤銷清單、Arbitrum 登錄、原始碼與 API 健康度，並記錄變更。">
  <meta property="og:url" content="https://issuer.mashbean.net/monitor">
  <title>數位憑證皮夾生態系監測｜請收下卡片</title>
  <link rel="stylesheet" href="/app.css">
  <link rel="stylesheet" href="/monitor.css">
  <link rel="alternate" type="application/atom+xml" title="數位憑證皮夾生態系監測" href="/monitor/feed.xml">
  <link rel="alternate" type="application/feed+json" title="數位憑證皮夾生態系監測" href="/monitor/feed.json">
  <script src="/monitor.js" defer></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/" aria-label="請收下卡片首頁">
      <span class="brand-mark" aria-hidden="true">＋</span>
      <span>請收下卡片</span>
    </a>
    <nav class="site-nav" aria-label="主要導覽">
      <a href="/#collect">領卡</a>
      <a href="/#present">出示測試</a>
      <a href="/monitor" aria-current="page">監測儀表板</a>
      <a href="/#developers">免費部署</a>
      <a href="https://github.com/mashbean/twdiw-vc-issuer-lite">GitHub</a>
    </nav>
  </header>

  <main>
    <section class="monitor-hero">
      <p class="eyebrow">ECOSYSTEM MONITOR</p>
      <h1>數位憑證皮夾生態系監測</h1>
      <p class="lede">每天掃描一次，記錄變化</p>
      <p class="hero-supporting">官方信任清單、撤銷清單、Arbitrum 鏈上登錄、相關原始碼與各端 API 健康度。這裡的價值不在當下狀態，而在跟昨天比起來有什麼不同。</p>
      <div class="scan-bar">
        <div><strong id="last-scan">尚未掃描</strong><small id="schedule"></small></div>
        <button id="refresh" class="text-button" type="button">立即重新掃描</button>
      </div>
      <p id="refresh-note" class="refresh-note"></p>
    </section>

    <section class="status-strip" aria-label="各面向狀態">
      <div class="status-cell" id="cell-api"><span class="dot" aria-hidden="true"></span><strong>API 健康度</strong><small>載入中…</small></div>
      <div class="status-cell" id="cell-e2e"><span class="dot" aria-hidden="true"></span><strong>發卡自檢</strong><small>載入中…</small></div>
      <div class="status-cell" id="cell-trust"><span class="dot" aria-hidden="true"></span><strong>信任清單</strong><small>載入中…</small></div>
      <div class="status-cell" id="cell-status"><span class="dot" aria-hidden="true"></span><strong>撤銷清單</strong><small>載入中…</small></div>
      <div class="status-cell" id="cell-chain"><span class="dot" aria-hidden="true"></span><strong>區塊鏈</strong><small>載入中…</small></div>
      <div class="status-cell" id="cell-repo"><span class="dot" aria-hidden="true"></span><strong>原始碼</strong><small>載入中…</small></div>
    </section>

    <p id="load-error" class="error" role="alert"></p>

    <details class="panel" id="panel-api" open>
      <summary>API 健康度</summary>
      <p class="panel-note">合成探測：可達性、延遲，以及回應「形狀」是否仍符合皮夾所依賴的欄位。200 但欄位改名，對皮夾而言等同壞掉，所以形狀也是判準。</p>
      <div class="table-wrap"><table class="monitor-table" id="table-api">
        <thead><tr><th>服務</th><th>營運者</th><th>狀態</th><th>延遲</th><th>近況</th><th>說明</th></tr></thead>
        <tbody><tr><td colspan="6" class="loading">載入中…</td></tr></tbody>
      </table></div>
    </details>

    <details class="panel" id="panel-e2e" open>
      <summary>發卡端到端自檢</summary>
      <p class="panel-note">每天由 Worker 自己扮演一次皮夾：建立 offer、取回 offer 物件、讀 metadata、換 token、以 <code>openid4vci-proof+jwt</code> 領卡，再依查驗端的規則驗證這張卡。單點 ping 看不出發卡是否還能成功，這條可以。</p>
      <div id="e2e-body" class="e2e-body"><p class="loading">載入中…</p></div>
    </details>

    <details class="panel" id="panel-trust">
      <summary>官方信任清單</summary>
      <p class="panel-note">數位發展部登記的發行者與驗證者，完整清單就在這裡。表格即時讀取官方 API；本站的自評列在最上方，誠實標示它不在清單上、又被誰接受。</p>
      <div id="trust-body"><p class="loading">載入中…</p></div>
      <div id="trust-self"></div>
      <div id="trust-accepted" class="accepted-by"></div>
      <div class="table-wrap"><table class="trust-table" id="trust-table">
        <thead><tr><th>機構</th><th>角色</th><th>登記端點</th><th>DID</th><th>鏈上紀錄</th></tr></thead>
        <tbody><tr><td colspan="5" class="loading">載入中…</td></tr></tbody>
      </table></div>
      <p id="trust-meta" class="trust-meta"></p>
    </details>

    <details class="panel" id="panel-status">
      <summary>撤銷清單</summary>
      <p class="panel-note">撤銷清單的網址只存在於已簽發的卡片裡，所以這裡只能監測「知道網址的清單」，不是整個生態系的撤銷全貌。另外持續追蹤一件事：清單的簽章金鑰是否就在發行者自己的 <code>did:key</code> 內——對離線皮夾而言，那是撤銷資訊唯一可自證的信任錨。</p>
      <div class="table-wrap"><table class="monitor-table" id="table-status">
        <thead><tr><th>清單</th><th>營運者</th><th>格式</th><th>位元總數</th><th>已撤銷</th><th>簽章金鑰在 DID 內</th><th>說明</th></tr></thead>
        <tbody><tr><td colspan="7" class="loading">載入中…</td></tr></tbody>
      </table></div>
    </details>

    <details class="panel" id="panel-chain">
      <summary>區塊鏈登錄比對</summary>
      <p class="panel-note">官方 API 會宣稱某個 DID 已上鏈。這裡不相信那個宣稱：直接抓它指名的 Arbitrum 交易，確認那筆交易確實寫入了同一份 DID 文件與機構資料，再向合約查該 DID 的<strong>現況</strong>紀錄，避免被已被取代或撤銷的舊登錄回放。</p>
      <div id="chain-body"><p class="loading">載入中…</p></div>
    </details>

    <details class="panel" id="panel-repo">
      <summary>原始碼 Repo</summary>
      <p class="panel-note">這是活躍度，不是健康度：它說的是程式碼最後一次動是什麼時候，不是它能不能用。</p>
      <div class="table-wrap"><table class="monitor-table" id="table-repo">
        <thead><tr><th>專案</th><th>最後更新</th><th>開放 issue</th><th>星數</th><th>授權</th><th>狀態</th></tr></thead>
        <tbody><tr><td colspan="6" class="loading">載入中…</td></tr></tbody>
      </table></div>
    </details>

    <section class="timeline-section" aria-labelledby="timeline-title">
      <div class="intro-heading">
        <p class="eyebrow">CHANGE LOG</p>
        <h2 id="timeline-title">變更時間軸</h2>
        <p>只記錄變化：誰加入或離開信任清單、哪份撤銷清單的數字動了、哪個 DID 的鏈上比對結果改變、哪個端點壞了或修好了。</p>
      </div>
      <div id="timeline" class="timeline"><p class="loading">載入中…</p></div>
      <p class="feed-links">訂閱變更：<a href="/monitor/feed.json">JSON Feed</a>　<a href="/monitor/feed.xml">Atom</a></p>
    </section>

    <section class="boundaries" aria-labelledby="boundaries-title">
      <h2 id="boundaries-title">這個儀表板不宣稱什麼</h2>
      <ul>
        <li>它是從 Cloudflare 邊緣單點觀測。一個端點在這裡連不上，可能是它掛了，也可能是它擋了這個來源，頁面只寫「從邊緣無法取得」。</li>
        <li>撤銷清單只涵蓋已知網址的清單，不是全生態系的撤銷狀況。</li>
        <li>Worker 看不到 TLS 憑證細節，所以沒有憑證到期監測。</li>
        <li>每天掃一次，資料最舊可能是 24 小時前的。每格都標了那次掃描的時間。</li>
        <li>本站是沙盒發行者，不在官方信任清單上，也不代表數位發展部或任何機關。</li>
      </ul>
    </section>
  </main>

  <footer>
    <span>TWDIW VC Issuer Lite · GPL-3.0-only</span>
    <span>Maintained by <a href="https://github.com/mashbean">mashbean</a></span>
  </footer>
</body>
</html>`;

export const MONITOR_CSS = /* css */ `
.monitor-hero{max-width:920px;padding:34px 0 40px}
.monitor-hero h1{margin:0;font-size:clamp(2.4rem,5.5vw,4rem);line-height:1.05;letter-spacing:-.05em}
.monitor-hero .lede{margin:22px 0 0;color:var(--ink);font-size:clamp(1.2rem,2.4vw,1.7rem);font-weight:760}
.scan-bar{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-top:26px;padding:16px 20px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
.scan-bar strong{display:block}
.scan-bar small{display:block;color:var(--muted);font-size:.86rem}
.refresh-note{margin:8px 0 0;color:var(--muted);font-size:.86rem;min-height:1.2em}
.status-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;margin:0 0 40px;background:var(--line);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.status-cell{display:flex;flex-direction:column;gap:4px;padding:18px;background:var(--card)}
.status-cell strong{font-size:.95rem}
.status-cell small{color:var(--muted);font-size:.84rem}
.status-cell .dot{width:10px;height:10px;border-radius:50%;background:var(--muted)}
.status-cell.ok .dot{background:var(--green)}
.status-cell.warn .dot{background:var(--amber)}
.status-cell.bad .dot{background:var(--red)}
/* This project's own services are shown for completeness, not as the subject.
   Recessing them keeps the official ecosystem the thing the eye lands on. */
.monitor-table tr.own,.trust-table tr.own{background:#eef1ee}
.monitor-table tr.own td,.trust-table tr.own td{color:var(--muted)}
.monitor-table tr.own td strong{font-weight:600}
.own-tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:#e2e6e2;color:var(--muted);font-size:.72rem;font-weight:700;vertical-align:middle}
.panel{margin:0 0 16px;padding:clamp(20px,4vw,32px);background:var(--card);border:1px solid var(--line);border-radius:22px}
.panel>summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;font-size:1.25rem;font-weight:800}
.panel>summary::-webkit-details-marker{display:none}
.panel>summary::after{content:"展開 ▾";color:var(--muted);font-size:.85rem;font-weight:600;white-space:nowrap}
.panel[open]>summary::after{content:"收合 ▴"}
.panel[open]>summary{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.panel-note{margin:0 0 16px;color:var(--muted);font-size:.92rem;line-height:1.7}
.panel-note code{background:#f0f4f1;padding:1px 5px;border-radius:5px}
.table-wrap{overflow-x:auto}
.monitor-table{width:100%;border-collapse:collapse;font-size:.92rem}
.monitor-table th,.monitor-table td{text-align:left;padding:11px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
.monitor-table th{color:var(--muted);font-weight:600;white-space:nowrap}
.monitor-table td small{display:block;color:var(--muted)}
.loading{color:var(--muted);text-align:center;padding:24px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:800;white-space:nowrap}
.pill.ok{background:var(--green-2);color:var(--green)}
.pill.bad{background:#fae2e2;color:var(--red)}
.pill.warn{background:#fff0d6;color:#8b5700}
.pill.mute{background:#eef1ee;color:var(--muted)}
.spark{display:block;width:120px;height:26px}
.spark rect{fill:var(--green)}
.spark rect.bad{fill:var(--red)}
.e2e-body{display:grid;gap:14px}
.e2e-steps{display:flex;flex-wrap:wrap;gap:8px}
.e2e-step{padding:6px 12px;border:1px solid var(--line);border-radius:12px;font-size:.86rem}
.e2e-step b{font-weight:800}
.count-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px}
.count-grid div{padding:14px 16px;border:1px solid var(--line);border-radius:14px}
.count-grid strong{display:block;font-size:1.6rem;line-height:1.2}
.count-grid small{color:var(--muted)}
.problem-list{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.problem-list li{padding:12px 14px;border:1px solid #d7b66e;border-radius:12px;background:#fff8e9}
.problem-list code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;display:block;margin-top:4px;color:var(--muted)}
.timeline-section{margin-top:80px}
.timeline{display:grid;gap:2px;background:var(--line);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.timeline .row{display:grid;grid-template-columns:170px 1fr;gap:16px;padding:14px 18px;background:var(--card)}
.timeline time{color:var(--muted);font-size:.86rem;white-space:nowrap}
.timeline strong{font-weight:700}
.timeline small{display:block;color:var(--muted);margin-top:3px;overflow-wrap:anywhere}
.timeline .empty{padding:28px;text-align:center;color:var(--muted);background:var(--card)}
.feed-links{margin:16px 0 0;color:var(--muted);font-size:.9rem}
.boundaries{margin-top:70px;padding:clamp(22px,4vw,34px);border:1px solid #d7b66e;border-radius:20px;background:#fff8e9}
.boundaries h2{margin:0 0 12px;font-size:1.3rem}
.boundaries ul{margin:0;padding-left:20px;color:#654f24;line-height:1.8}
@media(max-width:900px){.status-strip{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.status-strip{grid-template-columns:repeat(2,1fr)}.timeline .row{grid-template-columns:1fr;gap:4px}}
@media(prefers-color-scheme:dark){
  .panel-note code{background:#1b2b23}
  .problem-list li,.boundaries{background:#2b2418;border-color:#6b5a33}
  .boundaries ul{color:#e7c98f}
  .pill.bad{background:#3a1f1f}
  .pill.warn{background:#2b2418;color:#e7c98f}
  .pill.mute{background:#1b2b23}
  .monitor-table tr.own,.trust-table tr.own{background:#161d19}
  .own-tag{background:#243029}
}
`;

export const MONITOR_JS = /* js */ `
const $=(id)=>document.getElementById(id);
function text(tag,value,className){const n=document.createElement(tag);if(className)n.className=className;n.textContent=value;return n}
function clear(node){while(node.firstChild)node.firstChild.remove()}
function when(ms){if(!ms)return'—';return new Date(ms).toLocaleString('zh-Hant-TW',{dateStyle:'short',timeStyle:'short'})}
function ago(ms){if(!ms)return'';const d=Math.floor((Date.now()-ms)/86400000);return d<=0?'今天':d+' 天前'}
function pill(label,kind){return text('span',label,'pill '+kind)}
function markTier(row,data){if(data&&data.tier==='own')row.className='own';return row}
function ownTag(data){return data&&data.tier==='own'?text('span','本專案','own-tag'):null}

function sparkline(history){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','spark');svg.setAttribute('viewBox','0 0 120 26');
  svg.setAttribute('role','img');
  const points=history.slice(-30);
  if(!points.length){svg.setAttribute('aria-label','沒有歷史資料');return svg}
  const max=Math.max(...points.map(p=>p.latencyMs||0),1);
  const w=120/points.length;
  points.forEach((p,i)=>{
    const h=p.ok?Math.max(2,Math.round((p.latencyMs||0)/max*22)):22;
    const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
    r.setAttribute('x',(i*w+0.5).toFixed(1));r.setAttribute('y',(24-h).toFixed(1));
    r.setAttribute('width',Math.max(1,w-1).toFixed(1));r.setAttribute('height',h.toFixed(1));
    if(!p.ok)r.setAttribute('class','bad');
    svg.append(r);
  });
  const fails=points.filter(p=>!p.ok).length;
  svg.setAttribute('aria-label','最近 '+points.length+' 次掃描，'+fails+' 次異常');
  return svg;
}

function setCell(id,state,line){
  const cell=$(id);cell.className='status-cell '+state;
  const small=cell.querySelector('small');small.textContent=line;
}

function renderApi(checks){
  const rows=checks.filter(c=>c.category==='api');
  const body=$('table-api').tBodies[0];clear(body);
  if(!rows.length){const tr=document.createElement('tr');const td=text('td','尚無資料','loading');td.colSpan=6;tr.append(td);body.append(tr);return}
  rows.forEach(c=>{
    const tr=document.createElement('tr');
    const name=document.createElement('td');name.append(text('strong',c.label));
    const tag=ownTag(c.data);if(tag)name.append(tag);
    if(c.data&&c.data.url)name.append(text('small',c.data.url));
    markTier(tr,c.data);
    const op=text('td',(c.data&&c.data.operator)||'—');
    const st=document.createElement('td');st.append(pill(c.ok?'正常':'異常',c.ok?'ok':'bad'));
    const lat=text('td',c.latencyMs===undefined?'—':c.latencyMs+' ms');
    const sp=document.createElement('td');sp.append(sparkline(c.history||[]));
    const detail=text('td',c.detail||'');
    tr.append(name,op,st,lat,sp,detail);body.append(tr);
  });
  const bad=rows.filter(c=>!c.ok).length;
  setCell('cell-api',bad?(bad>=rows.length/2?'bad':'warn'):'ok',bad?bad+' / '+rows.length+' 個端點異常':rows.length+' 個端點正常');
}

function renderE2E(checks){
  const c=checks.find(x=>x.category==='e2e');const host=$('e2e-body');clear(host);
  if(!c){host.append(text('p','尚無資料','loading'));setCell('cell-e2e','','尚未執行');return}
  const line=document.createElement('div');
  line.append(pill(c.ok?'通過':'未通過',c.ok?'ok':'bad'),text('span',' '+(c.detail||'')));
  host.append(line);
  const steps=(c.data&&c.data.steps)||[];
  if(steps.length){
    const wrap=document.createElement('div');wrap.className='e2e-steps';
    const names={offer:'建立 offer','offer-object':'取回 offer',metadata:'讀 metadata',token:'換 token',proof:'產生 proof',credential:'領卡',verify:'驗證'};
    steps.forEach(s=>{const d=text('div','','e2e-step');d.append(text('b',names[s.name]||s.name),text('span',' '+s.ms+' ms'));wrap.append(d)});
    host.append(wrap);
  }
  const sp=document.createElement('div');sp.append(sparkline(c.history||[]));host.append(sp);
  host.append(text('p','總耗時 '+(c.latencyMs||0)+' ms，掃描時間 '+when(c.at),'panel-note'));
  setCell('cell-e2e',c.ok?'ok':'bad',c.ok?'發卡流程通過':'發卡流程失敗');
}

function renderTrust(trust){
  const host=$('trust-body');clear(host);
  if(!trust){host.append(text('p','尚無資料','loading'));setCell('cell-trust','','尚未掃描');return}
  const grid=document.createElement('div');grid.className='count-grid';
  const cells=[['登記 DID 總數',trust.total],['發行者',trust.issuers],['驗證者',trust.verifiers],['兼具兩種角色',trust.both],['宣稱已上鏈',trust.withAnchorClaim]];
  cells.forEach(([label,value])=>{const d=document.createElement('div');d.append(text('strong',String(value)),text('small',label));grid.append(d)});
  host.append(grid);
  if(trust.self){
    const p=document.createElement('p');p.className='panel-note';
    p.append(text('span','本站自身：'),pill(trust.self.onOfficialList?'在官方清單':'不在官方清單',trust.self.onOfficialList?'ok':'mute'),
      text('span',' '+(trust.self.onOfficialList?'':'（沙盒發行者，這是預期結果）')));
    host.append(p);
  }
  if(trust.registryError)host.append(text('p','讀取時發生問題：'+trust.registryError,'panel-note'));
  host.append(text('p','掃描時間 '+when(trust.at),'panel-note'));
  setCell('cell-trust',trust.registryError?'warn':'ok',trust.total+' 個登記 DID');
}

function shortDid(did){return did.length>44?did.slice(0,22)+'…'+did.slice(-10):did}
function renderTrustList(data){
  const self=$('trust-self');clear(self);
  if(data.self){
    const box=document.createElement('div');box.className='self-entry'+(data.self.onOfficialList?' on-list':'');
    box.append(text('span',data.self.onOfficialList?'在官方清單':'不在官方清單','badge'));
    const block=document.createElement('div');
    block.append(text('h3','本站 · '+data.self.host));
    block.append(text('p',data.self.onOfficialList?'官方 DID API 回傳了這筆啟用中的紀錄。':'官方 DID API 對本站 did:key 的回答：'+((data.self.officialVerdict&&data.self.officialVerdict.reason)||'不在清單')+'。這是預期結果：本站是沙盒發行者。'));
    block.append(text('code',data.self.didKey));box.append(block);self.append(box);
  }
  const accepted=$('trust-accepted');clear(accepted);
  ((data.self&&data.self.acceptedBy)||[]).forEach(item=>{
    const node=document.createElement('div');
    node.append(text('span',item.accepts?'✓':'×','mark '+(item.accepts?'yes':'no')));
    const info=document.createElement('div');info.append(text('strong',item.party),text('small',item.why));
    node.append(info);accepted.append(node);
  });
  const body=$('trust-table').tBodies[0];clear(body);
  (data.entries||[]).forEach(entry=>{
    const tr=document.createElement('tr');
    const name=document.createElement('td');name.append(text('strong',entry.name));
    if(entry.nameEnglish)name.append(text('small',entry.nameEnglish));
    if(entry.taxId)name.append(text('small','統編／代號 '+entry.taxId));
    const roles=document.createElement('td');
    (entry.orgTypes||[]).forEach(t=>roles.append(text('span',t===1?'發行':'查驗','role'+(t===2?' verifier':''))));
    const hosts=document.createElement('td');(entry.hosts||[]).forEach(h=>hosts.append(text('small',h)));
    const did=document.createElement('td');did.className='did';did.title=entry.did;did.textContent=shortDid(entry.did);
    const chain=text('td',entry.onChain?'有':'無');if(entry.network)chain.append(text('small',entry.network));
    tr.append(name,roles,hosts,did,chain);body.append(tr);
  });
  $('trust-meta').textContent='官方清單共 '+((data.entries||[]).length)+' 個 DID（去重後），來源 '+data.registry+'，讀取 '+data.pagesFetched+' 頁，時間 '+when(Date.parse(data.fetchedAt))+(data.error?'；讀取中斷：'+data.error:'')+'。DID 只顯示頭尾，滑鼠移上可見全文。';
}
async function loadTrustList(){
  try{
    const response=await fetch('/api/trust-list',{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    renderTrustList(await response.json());
  }catch(error){
    $('trust-meta').textContent='無法讀取官方信任清單：'+(error&&error.message?error.message:'未知錯誤');
  }
}

function renderStatus(checks){
  const rows=checks.filter(c=>c.category==='status-list');
  const body=$('table-status').tBodies[0];clear(body);
  if(!rows.length){const tr=document.createElement('tr');const td=text('td','尚無資料','loading');td.colSpan=7;tr.append(td);body.append(tr);return}
  rows.forEach(c=>{
    const d=c.data||{};const tr=document.createElement('tr');markTier(tr,d);
    const name=document.createElement('td');name.append(text('strong',c.label));
    const tag=ownTag(d);if(tag)name.append(tag);
    if(d.url)name.append(text('small',d.url));
    const fmt=d.format==='statuslist2021'?'StatusList2021':d.format==='token-status-list'?'Token Status List':'—';
    const key=document.createElement('td');
    if(d.keyInIssuerDid===true)key.append(pill('是','ok'));
    else if(d.keyInIssuerDid===false)key.append(pill('否','warn'));
    else key.append(pill('不適用','mute'));
    tr.append(name,text('td',d.operator||'—'),text('td',fmt),
      text('td',d.totalBits===undefined?'—':d.totalBits.toLocaleString()),
      text('td',d.revokedBits===undefined?'—':String(d.revokedBits)),key,text('td',c.detail||''));
    body.append(tr);
  });
  const bad=rows.filter(c=>!c.ok).length;
  setCell('cell-status',bad?'bad':'ok',bad?bad+' / '+rows.length+' 份無法讀取':rows.length+' 份可讀取');
}

function renderChain(chain){
  const host=$('chain-body');clear(host);
  if(!chain){host.append(text('p','尚無資料','loading'));setCell('cell-chain','','尚未掃描');return}
  const grid=document.createElement('div');grid.className='count-grid';
  [['鏈上一致',chain.verified],['與鏈上不符',chain.mismatch],['未上鏈',chain.notAnchored],['無法查詢',chain.unavailable]]
    .forEach(([label,value])=>{const d=document.createElement('div');d.append(text('strong',String(value)),text('small',label));grid.append(d)});
  host.append(grid);
  host.append(text('p','Arbitrum RPC '+(chain.rpcOk?'正常':'無法連線')+(chain.blockNumber?'，最新區塊 '+parseInt(chain.blockNumber,16).toLocaleString():'')+'，掃描時間 '+when(chain.at),'panel-note'));
  if(chain.unavailable){host.append(text('p','有 '+chain.unavailable+' 筆這次查不到。免費公用 Arbitrum 節點會限制 Cloudflare 共用出口位址的流量，所以每天能核對到的筆數會浮動；部署者設定 ARBITRUM_RPC_URL（帶金鑰的節點）即可穩定完成。查不到就標示查不到，不會當成通過。','panel-note'))}
  if(chain.problems&&chain.problems.length){
    host.append(text('h3','API 宣稱與鏈上事實不符'));
    const ul=document.createElement('ul');ul.className='problem-list';
    chain.problems.forEach(p=>{const li=document.createElement('li');
      li.append(text('strong',p.name||p.did),text('div',p.reason||''));
      li.append(text('code',p.did));ul.append(li)});
    host.append(ul);
  }
  setCell('cell-chain',chain.mismatch?'bad':(chain.rpcOk?'ok':'warn'),
    chain.mismatch?chain.mismatch+' 筆與鏈上不符':(chain.rpcOk?chain.verified+' 筆鏈上一致':'RPC 無法連線'));
}

function renderRepos(checks){
  const rows=checks.filter(c=>c.category==='repo');
  const body=$('table-repo').tBodies[0];clear(body);
  if(!rows.length){const tr=document.createElement('tr');const td=text('td','尚無資料','loading');td.colSpan=6;tr.append(td);body.append(tr);return}
  rows.forEach(c=>{
    const d=c.data||{};const tr=document.createElement('tr');markTier(tr,d);
    const name=document.createElement('td');
    if(d.url){const a=document.createElement('a');a.href=d.url;a.textContent=c.label;name.append(a)}else name.append(text('strong',c.label));
    const tag=ownTag(d);if(tag)name.append(tag);
    if(d.owner)name.append(text('small',d.owner+'/'+d.repo));
    const st=document.createElement('td');st.append(pill(c.ok?'已讀取':'讀取失敗',c.ok?'ok':'bad'));
    tr.append(name,text('td',d.pushedAt?ago(d.pushedAt)+'（'+when(d.pushedAt)+'）':'—'),
      text('td',d.openIssues===undefined?'—':String(d.openIssues)),
      text('td',d.stars===undefined?'—':String(d.stars)),
      text('td',d.license||'—'),st);
    body.append(tr);
  });
  const bad=rows.filter(c=>!c.ok).length;
  setCell('cell-repo',bad?'warn':'ok',bad?bad+' 個無法讀取':rows.length+' 個專案追蹤中');
}

function renderTimeline(events){
  const host=$('timeline');clear(host);
  if(!events||!events.length){host.append(text('p','目前沒有記錄到變更。第一次掃描只會建立基準，之後有變化才會出現在這裡。','empty'));return}
  events.forEach(e=>{
    const row=document.createElement('div');row.className='row';
    const t=document.createElement('time');t.dateTime=new Date(e.at).toISOString();t.textContent=when(e.at);
    const body=document.createElement('div');body.append(text('strong',e.summary));
    if(e.detail)body.append(text('small',e.detail));
    row.append(t,body);host.append(row);
  });
}

function render(data){
  $('last-scan').textContent=data.lastRunAt?('最後掃描：'+when(data.lastRunAt)):'尚未掃描';
  $('schedule').textContent=data.schedule||'';
  renderApi(data.checks||[]);
  renderE2E(data.checks||[]);
  renderTrust(data.trust);
  renderStatus(data.checks||[]);
  renderChain(data.chain);
  renderRepos(data.checks||[]);
  renderTimeline(data.events);
}

async function load(){
  try{
    const response=await fetch('/api/monitor',{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const data=await response.json();
    render(data);
    if(!data.lastRunAt){
      $('refresh-note').textContent='這個部署還沒有掃描過，正在背景執行第一次掃描，稍候重新整理即可看到結果。';
    }
  }catch(error){
    $('load-error').textContent='無法載入監測資料：'+(error&&error.message?error.message:'未知錯誤');
  }
}

$('refresh').onclick=async()=>{
  const button=$('refresh');button.disabled=true;$('refresh-note').textContent='掃描中，請稍候…';
  try{
    const response=await fetch('/api/monitor/refresh',{method:'POST'});
    const data=await response.json();
    $('refresh-note').textContent=data.message||'';
    if(data.started){setTimeout(load,30000)}else{await load()}
  }catch(error){
    $('refresh-note').textContent='無法觸發掃描：'+(error&&error.message?error.message:'未知錯誤');
  }finally{button.disabled=false}
};

load();
loadTrustList();
`;
