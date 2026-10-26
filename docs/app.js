/* SiC Studio — browser-only Sentaurus SDE command generator. */
const DEFAULTS = Object.freeze({
  Lp: 0.943, Lnc: 0.789, Lsp: 1.096, Lov: 0.592, Lch: 0.439, Ljfet: 1.658,
  Tepi: 12, Tsub: 1, Tox: 0.04, Tpoly: 0.4,
  poly: 1e20, epi: 8e15, buffer: 3e19, jfet: 1.5e16,
  pPeak: 3e19, pPeakPos: 0.59, pDepth: 1.1, pAtDepth: 1.2e17,
  nPlus: 3e19, pPlus: 3e19,
  globalMax: 0.4, globalMin: 0.1, topMax: 0.2, topMin: 0.02,
  bottomMax: 0.2, bottomMin: 0.05, interfaceLen: 0.01, growth: 1.2, transDiff: 1
});
const PRESETS = {
  baseline: {},
  shallow: { pDepth: 0.8 },
  oxide: { Tox: 0.08 }
};
const GROUPS = {
  geometry: [
    { title: '横向尺寸 · X', fields: [
      ['Lp','P⁺ 区宽度','Lp+',0.35,1.8,0.001,'μm'],
      ['Lnc','N⁺ 接触段','Lnc',0.3,1.8,0.001,'μm'],
      ['Lsp','源侧间距','Lsp',0.4,2,0.001,'μm'],
      ['Lov','栅重叠段','Lov',0.2,1.5,0.001,'μm'],
      ['Lch','沟道段','Lch',0.3,1.2,0.001,'μm'],
      ['Ljfet','JFET 段','Ljfet',0.6,3,0.001,'μm']
    ]},
    { title: '纵向厚度 · Y', fields: [
      ['Tepi','外延层厚度','Tepi',4,25,0.1,'μm'],
      ['Tsub','衬底层厚度','Tsub',0.2,4,0.1,'μm'],
      ['Tox','栅氧厚度','Tox',0.01,0.2,0.005,'μm'],
      ['Tpoly','多晶硅厚度','Tpoly',0.1,1,0.01,'μm']
    ]}
  ],
  doping: [
    { title: 'N 型 · Nitrogen / Phosphorus', fields: [
      ['epi','外延背景掺杂','Nepi',1e14,1e18,0.02,'cm⁻³','log'],
      ['buffer','底部缓冲层','Nbuffer',1e17,1e21,0.02,'cm⁻³','log'],
      ['jfet','JFET 区','Njfet',1e14,1e19,0.02,'cm⁻³','log'],
      ['nPlus','N⁺ 源区','Nplus',1e18,1e21,0.02,'cm⁻³','log'],
      ['poly','多晶硅栅','Poly',1e18,1e21,0.02,'cm⁻³','log']
    ]},
    { title: 'P 型 · Aluminum', fields: [
      ['pPeak','P-base 峰值浓度','PeakVal',1e17,1e21,0.02,'cm⁻³','log'],
      ['pPeakPos','P-base 峰值深度','PeakPos',0.05,1.5,0.01,'μm'],
      ['pDepth','P-base 指定深度','Depth',0.15,3,0.01,'μm'],
      ['pAtDepth','该深度处浓度','ValueAtDepth',1e15,1e19,0.02,'cm⁻³','log'],
      ['pPlus','P⁺ 接触区','Pplus',1e18,1e21,0.02,'cm⁻³','log']
    ]}
  ],
  mesh: [
    { title: '全局网格', fields: [
      ['globalMax','最大步长','Global max',0.1,1.2,0.01,'μm'],
      ['globalMin','最小步长','Global min',0.005,0.3,0.005,'μm']
    ]},
    { title: '顶部活性区 · Y ≤ 2.5 μm', fields: [
      ['topMax','最大步长','Top max',0.05,0.5,0.005,'μm'],
      ['topMin','最小步长','Top min',0.002,0.1,0.001,'μm'],
      ['interfaceLen','SiC / Oxide 界面','MaxLenInt',0.002,0.05,0.001,'μm'],
      ['growth','界面增长因子','Factor',1.05,2,0.01,'×']
    ]},
    { title: '底部界面 · Y ≈ Tepi', fields: [
      ['bottomMax','最大步长','Bottom max',0.05,0.5,0.005,'μm'],
      ['bottomMin','最小步长','Bottom min',0.002,0.2,0.001,'μm'],
      ['transDiff','掺杂变化阈值','MaxTransDiff',0.2,3,0.05,'']
    ]}
  ]
};
const FIELD_META = Object.fromEntries(Object.values(GROUPS).flatMap(groups => groups.flatMap(g => g.fields)).map(f => [f[0],f]));
const STORAGE_KEY = 'sic-studio-config-v1';
let state = { ...DEFAULTS };
let activeTab = 'geometry';
let activeView = 'doping';
let toastTimer;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const f = value => Number(value.toFixed(5)).toString();
const sci = value => Number(value).toExponential(3).replace(/\.000e/,'e').replace(/(\.\d*?)0+e/,'$1e');
const close = (a,b) => Math.abs(a-b) <= Math.max(1e-10,Math.abs(b)*1e-9);
const width = p => p.Lp+p.Lnc+p.Lsp+p.Lov+p.Lch+p.Ljfet;

function loadSaved(){
  try { const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(saved && typeof saved==='object'){
    for(const key of Object.keys(DEFAULTS)) if(Number.isFinite(saved[key])) state[key]=saved[key];
  }} catch (_) { /* local storage is optional */ }
}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}}
function presetName(){return Object.keys(PRESETS).find(name => Object.keys(DEFAULTS).every(key => close(state[key],PRESETS[name][key]??DEFAULTS[key])));}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2900);}

function renderControls(){
  const container=$('#controls-body');
  container.innerHTML=GROUPS[activeTab].map(group=>`<div class="control-group"><h3 class="group-title">${escapeHtml(group.title)}</h3>${group.fields.map(meta=>{
    const [key,label,symbol,min,max,step,unit,kind]=meta;
    const value=state[key];
    const rangeValue=kind==='log'?Math.log10(value):value;
    const minRange=kind==='log'?Math.log10(min):min;
    const maxRange=kind==='log'?Math.log10(max):max;
    const inputValue=kind==='log'?sci(value):f(value);
    return `<div class="control"><div class="control-top"><label class="control-label" for="input-${key}">${escapeHtml(label)} <span class="control-symbol">${escapeHtml(symbol)}</span></label><div class="control-input-wrap"><input id="input-${key}" class="control-input" type="text" inputmode="decimal" data-key="${key}" value="${inputValue}" aria-label="${escapeHtml(label)}"><span class="unit">${escapeHtml(unit)}</span></div></div><input class="control-range" type="range" data-key="${key}" min="${minRange}" max="${maxRange}" step="${step}" value="${rangeValue}" aria-label="调整${escapeHtml(label)}"></div>`;
  }).join('')}</div>`).join('');
}
function validate(p){
  const issues=[];
  for(const [key,meta] of Object.entries(FIELD_META)){
    const v=p[key];if(!Number.isFinite(v)||v<meta[3]||v>meta[4]) issues.push(`${meta[1]}超出允许范围`);
  }
  if(p.pDepth<=p.pPeakPos) issues.push('P-base 指定深度必须大于峰值深度');
  if(p.pAtDepth>=p.pPeak) issues.push('P-base 指定深度处浓度应低于峰值浓度');
  for(const [small,large,label] of [['globalMin','globalMax','全局'],['topMin','topMax','顶部'],['bottomMin','bottomMax','底部']])
    if(p[small]>p[large]) issues.push(`${label}网格最小步长不能大于最大步长`);
  if(p.pDepth>=p.Tepi) issues.push('P-base 深度必须小于外延层厚度');
  return issues;
}
function setField(key,value){
  if(!(key in DEFAULTS)||!Number.isFinite(value)) return;
  state[key]=value;save();renderOutput();
  const matched=presetName();$$('[data-preset]').forEach(el=>el.classList.toggle('is-active',el.dataset.preset===matched));
}
function onControlInput(event){
  const key=event.target.dataset.key;if(!key)return;
  const meta=FIELD_META[key];const isRange=event.target.type==='range';
  if(!String(event.target.value).trim())return;
  const raw=Number(event.target.value);if(!Number.isFinite(raw))return;
  const value=isRange && meta[7]==='log'?10**raw:raw;
  if(value<meta[3]||value>meta[4])return;
  setField(key,value);
  const pair=isRange?$('#input-'+key):$(`.control-range[data-key="${key}"]`);
  if(pair){if(isRange)pair.value=meta[7]==='log'?sci(value):f(value);else pair.value=meta[7]==='log'?Math.log10(value):value;}
}

function generateCode(p){
  const n=x=>f(x), c=x=>sci(x);
  return `; Generated by SiC Studio — Sentaurus Structure Editor / Workbench
; Geometry: um. Active dopant concentrations: cm^-3.
; This deck generates structure and mesh. Electrical curves require SDevice.
(sde:clear)
(sdegeo:set-default-boolean "BAB")

; --------------------------- Parameters ---------------------------------
(define Lp+   ${n(p.Lp)})
(define Lnc   ${n(p.Lnc)})
(define Lsp   ${n(p.Lsp)})
(define Lov   ${n(p.Lov)})
(define Lch   ${n(p.Lch)})
(define Ljfet ${n(p.Ljfet)})
(define x1 Lp+)
(define x2 (+ x1 Lnc))
(define x3 (+ x2 Lsp))
(define x4 (+ x3 Lov))
(define x5 (+ x4 Lch))
(define xx (+ x5 Ljfet))

(define Tepi ${n(p.Tepi)})
(define Tsub ${n(p.Tsub)})
(define Tox ${n(p.Tox)})
(define Tpoly ${n(p.Tpoly)})
(define y1 Tepi)
(define yy (+ y1 Tsub))
(define y2 (- 0 Tox))
(define y3 (- y2 Tpoly))

(define Npoly ${c(p.poly)})
(define Nepi ${c(p.epi)})
(define Nbuffer ${c(p.buffer)})
(define Njfet ${c(p.jfet)})
(define Nplus ${c(p.nPlus)})
(define Pplus ${c(p.pPlus)})
(define PbasePeak ${c(p.pPeak)})
(define PbasePeakPos ${n(p.pPeakPos)})
(define PbaseAtDepth ${c(p.pAtDepth)})
(define PbaseDepth ${n(p.pDepth)})

; --------------------------- Geometry -----------------------------------
; Old Replaces New (BAB) preserves the small first-created channel region.
(sdegeo:create-rectangle (position (- x4 0.12) 0.0 0.0) (position (+ x5 0.041) 0.05 0.0) "SiliconCarbide" "ChannelRegion")
(sdegeo:create-rectangle (position 0.0 0.0 0.0) (position xx yy 0.0) "SiliconCarbide" "SiC")
(sdegeo:create-rectangle (position x2 0.0 0.0) (position xx y2 0.0) "Oxide" "SiO2")
(sdegeo:create-rectangle (position x3 y2 0.0) (position xx y3 0.0) "PolySi" "Poly")

; --------------------------- Contacts -----------------------------------
(sdegeo:define-contact-set "Source" 4 (color:rgb 1 0 0) "##")
(sdegeo:define-contact-set "Drain" 4 (color:rgb 1 0 0) "##")
(sdegeo:define-contact-set "Gate" 4 (color:rgb 1 0 0) "##")
(sdegeo:define-2d-contact (find-edge-id (position x1 0.0 0.0)) "Source")
(sdegeo:define-2d-contact (find-edge-id (position x1 yy 0.0)) "Drain")
(sdegeo:define-2d-contact (find-edge-id (position x4 y3 0.0)) "Gate")

; --------------------------- Doping -------------------------------------
(sdedr:define-constant-profile "Const.Poly" "PhosphorusActiveConcentration" Npoly)
(sdedr:define-constant-profile-material "Place.Const.Poly" "Const.Poly" "PolySi")
(sdedr:define-constant-profile "Const.Nepi" "NitrogenActiveConcentration" Nepi)
(sdedr:define-constant-profile-material "Place.Const.Nepi" "Const.Nepi" "SiliconCarbide")

(sdedr:define-refeval-window "Win.Const.Nbuffer" "Rectangle" (position -1.0 y1 0.0) (position (+ xx 1) (+ yy 1) 0.0))
(sdedr:define-constant-profile "Const.Nbuffer" "NitrogenActiveConcentration" Nbuffer)
(sdedr:define-constant-profile-placement "Place.Const.Nbuffer" "Const.Nbuffer" "Win.Const.Nbuffer" 0.1)

(sdedr:define-refeval-window "Win.Const.Njfet" "Rectangle" (position (- x5 0.1) 0.0 0.0) (position xx 1.3 0.0))
(sdedr:define-constant-profile "Const.Njfet" "NitrogenActiveConcentration" Njfet)
(sdedr:define-constant-profile-placement "Place.Const.Njfet" "Const.Njfet" "Win.Const.Njfet" 0.1)

(sdedr:define-refinement-window "BaseLine.Pbase" "line" (position -1.0 0.0 0.0) (position (+ x4 0.25) 0.0 0.0))
(sdedr:define-gaussian-profile "Dop.Pbase" "AluminumActiveConcentration" "PeakPos" PbasePeakPos "PeakVal" PbasePeak "ValueAtDepth" PbaseAtDepth "Depth" PbaseDepth "Erf" "Length" 0.2)
(sdedr:define-analytical-profile-placement "Place.Pbase" "Dop.Pbase" "BaseLine.Pbase" "Positive" "NoReplace" "Eval")

(sdedr:define-refeval-window "Win.Const.Nplus" "Rectangle" (position x1 -1 0.0) (position (- x4 0.15) 0.3 0.0))
(sdedr:define-constant-profile "Const.Nplus" "NitrogenActiveConcentration" Nplus)
(sdedr:define-constant-profile-placement "Place.Const.Nplus" "Const.Nplus" "Win.Const.Nplus" 0.02)

(sdedr:define-refeval-window "Win.Const.Pplus" "Rectangle" (position -1 -1 0.0) (position x1 0.3 0.0))
(sdedr:define-constant-profile "Const.Pplus" "AluminumActiveConcentration" Pplus)
(sdedr:define-constant-profile-placement "Place.Const.Pplus" "Const.Pplus" "Win.Const.Pplus" 0.1)

; --------------------------- Meshing ------------------------------------
(sdedr:define-refeval-window "global" "Rectangle" (position -1e5 -1e5 0) (position 1e5 1e5 0))
(sdedr:define-refinement-size "global" ${n(p.globalMax)} ${n(p.globalMax)} 0.0 ${n(p.globalMin)} ${n(p.globalMin)} 0.0)
(sdedr:define-refinement-placement "global" "global" (list "window" "global"))

(sdedr:define-refeval-window "Top.Mesh.Win" "Rectangle" (position -1e5 -1e5 0.0) (position 1e5 2.5 0.0))
(sdedr:define-refinement-size "Top.Mesh.Defn" ${n(p.topMax)} ${n(p.topMax)} 0.0 ${n(p.topMin)} ${n(p.topMin)} 0.0)
(sdedr:define-refinement-placement "Top.Mesh.Place" "Top.Mesh.Defn" "Top.Mesh.Win")
(sdedr:define-refinement-function "Top.Mesh.Defn" "MaxLenInt" "Oxide" "SiliconCarbide" ${n(p.interfaceLen)} ${n(p.growth)})
(sdedr:define-refinement-function "Top.Mesh.Defn" "DopingConcentration" "MaxTransDiff" ${n(p.transDiff)})

(sdedr:define-refeval-window "Bot.Mesh.Win" "Rectangle" (position -1e5 (- y1 0.5) 0.0) (position 1e5 (+ y1 0.5) 0.0))
(sdedr:define-refinement-size "Bot.Mesh.Defn" ${n(p.bottomMax)} ${n(p.bottomMax)} 0.0 ${n(p.bottomMin)} ${n(p.bottomMin)} 0.0)
(sdedr:define-refinement-placement "Bot.Mesh.Place" "Bot.Mesh.Defn" "Bot.Mesh.Win")
(sdedr:define-refinement-function "Bot.Mesh.Defn" "DopingConcentration" "MaxTransDiff" ${n(p.transDiff)})

; Workbench replaces @node@ with the current node number.
(sde:build-mesh "snmesh" "" "n@node@_msh")
`;
}

function highlight(code){
  const rx=/"[^"\n]*"|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|(?:sdegeo|sdedr|sde):[A-Za-z0-9-]+/gi;
  return code.split('\n').map(line=>{
    if(line.trimStart().startsWith(';')) return `<span class="syntax-comment">${escapeHtml(line)}</span>`;
    let result='',last=0;for(const m of line.matchAll(rx)){
      result+=escapeHtml(line.slice(last,m.index));
      const klass=m[0].startsWith('"')?'syntax-string':/^(sdegeo|sdedr|sde):/.test(m[0])?'syntax-symbol':'syntax-number';
      result+=`<span class="${klass}">${escapeHtml(m[0])}</span>`;last=m.index+m[0].length;
    }return result+escapeHtml(line.slice(last));
  }).join('\n');
}

function renderSvg(p){
  const total=width(p),sx=x=>104+x/total*196;
  const top=95,bottom=360;
  const sy=y=>y<=2.5?top+y*60:top+150+(y-2.5)*(bottom-top-150)/(p.Tepi+p.Tsub-2.5);
  const S=x=>f(sx(x)),Y=y=>f(sy(y));
  const x1=p.Lp,x2=x1+p.Lnc,x3=x2+p.Lsp,x4=x3+p.Lov,x5=x4+p.Lch;
  const oxidePx=Math.max(5,p.Tox/.04*7),polyPx=Math.max(13,p.Tpoly/.4*19),oxideTop=top-oxidePx,polyTop=oxideTop-polyPx;
  const pEnd=Math.min(total,x4+.25),pBaseY=sy(Math.min(p.pDepth,p.Tepi)),nPlusEnd=Math.max(x1,x4-.15),jfetStart=Math.max(0,x5-.1);
  const mesh=activeView==='mesh';const doping=activeView==='doping';
  const gridLines=[];
  if(mesh){for(let x=0.25;x<total;x+=0.32) gridLines.push(`<path d="M${S(x)} ${top}V${bottom}" stroke="#385d67" stroke-width=".55" opacity=".75"/>`);
    for(let y=.15;y<2.5;y+=.18) gridLines.push(`<path d="M104 ${Y(y)}H300" stroke="#385d67" stroke-width=".55" opacity=".8"/>`);
    for(let y=3.2;y<p.Tepi+p.Tsub;y+=.85) gridLines.push(`<path d="M104 ${Y(y)}H300" stroke="#385d67" stroke-width=".55" opacity=".6"/>`);
  }
  const pbodyPath=`M104 ${top}H${S(pEnd)}Q${S(pEnd+.08)} ${Y(p.pDepth*.65)} ${S(pEnd-.08)} ${Y(p.pDepth)}H104Z`;
  $('#device-svg').innerHTML=`
    <defs><linearGradient id="body-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#245a9c"/><stop offset=".65" stop-color="#3d84bb"/><stop offset="1" stop-color="#8bc6ce"/></linearGradient><pattern id="grid-pattern" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M9 0H0V9" fill="none" stroke="#639aa7" stroke-width=".6"/></pattern><clipPath id="sic-clip"><rect x="104" y="${top}" width="196" height="${bottom-top}"/></clipPath></defs>
    <g opacity=".3" stroke="#668b96" stroke-width=".6"><path d="M75 42V373M75 373H324"/><path d="M67 ${top}h8M67 ${Y(p.Tepi)}h8M67 ${bottom}h8"/></g>
    <text x="70" y="${top-8}" fill="#88aab5" text-anchor="end" font-size="10">0</text><text x="67" y="${Y(p.Tepi)+4}" fill="#88aab5" text-anchor="end" font-size="10">${f(p.Tepi)}</text><text x="67" y="${bottom+4}" fill="#88aab5" text-anchor="end" font-size="10">${f(p.Tepi+p.Tsub)}</text>
    <text x="82" y="43" fill="#88aab5" text-anchor="middle" font-size="10">Y / μm</text><text x="204" y="392" fill="#88aab5" text-anchor="middle" font-size="10">X / μm · ${f(total)}</text>
    <rect x="104" y="${top}" width="196" height="${bottom-top}" fill="${doping?'#cabe64':mesh?'#bfd1cd':'#b5cebf'}" stroke="#8fa7ad" stroke-width="1.5"><title>SiliconCarbide · 主体</title></rect>
    ${doping?`<g clip-path="url(#sic-clip)"><path d="${pbodyPath}" fill="url(#body-grad)" opacity=".96"><title>P-base · Al 掺杂</title></path><rect x="104" y="${top}" width="${f(sx(x1)-104)}" height="${f(sy(.3)-top)}" fill="#24518a"><title>P⁺ 接触区</title></rect><rect x="${S(x1)}" y="${top}" width="${f(sx(nPlusEnd)-sx(x1))}" height="${f(sy(.3)-top)}" fill="#eda34f"><title>N⁺ 源区</title></rect><rect x="${S(jfetStart)}" y="${top}" width="${f(300-sx(jfetStart))}" height="${f(sy(1.3)-top)}" fill="#d6c466" opacity=".88"><title>JFET 区</title></rect><rect x="104" y="${Y(p.Tepi)}" width="196" height="${f(bottom-sy(p.Tepi))}" fill="#d87b48"><title>Nbuffer · 底部高掺区</title></rect></g>`:''}
    ${mesh?`<g clip-path="url(#sic-clip)">${gridLines.join('')}</g>`:''}
    <rect x="${S(x2)}" y="${f(oxideTop)}" width="${f(300-sx(x2))}" height="${f(oxidePx)}" fill="#a6d2dc" stroke="#d1edf0" stroke-width=".7"><title>SiO₂ 栅氧层 · ${f(p.Tox*1000)} nm</title></rect>
    <rect x="${S(x3)}" y="${f(polyTop)}" width="${f(300-sx(x3))}" height="${f(polyPx)}" fill="#8776c7" stroke="#b8a9ee" stroke-width=".7"><title>PolySi 多晶硅栅</title></rect>
    <path d="M104 ${top-2}H${S(x2)}M${S(x3)} ${f(polyTop-2)}H300M104 ${bottom+2}H300" stroke="#ff7968" stroke-width="4" stroke-linecap="round"/><circle cx="${S(x1)}" cy="${top-2}" r="3" fill="#ff7968"/><circle cx="${S(x4)}" cy="${f(polyTop-2)}" r="3" fill="#ff7968"/>
    <path d="M${S(x1)} ${top-2}H377M${S(x4)} ${f(polyTop-2)}H377M300 ${bottom+2}H377" fill="none" stroke="#668a99" stroke-width=".8" stroke-dasharray="3 4"/>
    <g fill="#d9eceb" font-size="11" font-weight="600"><text x="390" y="${top+2}">SOURCE <tspan fill="#90aeb9" font-weight="400">/ 顶部接触</tspan></text><text x="390" y="${f(polyTop+4)}">GATE <tspan fill="#90aeb9" font-weight="400">/ 多晶硅</tspan></text><text x="390" y="${bottom+6}">DRAIN <tspan fill="#90aeb9" font-weight="400">/ 底部接触</tspan></text></g>
    <g fill="#a7c2ca" font-size="10"><text x="390" y="154">SiC: ${f(p.Tepi)} μm 外延 + ${f(p.Tsub)} μm 衬底</text><text x="390" y="174">SiO₂: ${f(p.Tox*1000)} nm</text><text x="390" y="194">PolySi: ${f(p.Tpoly)} μm</text><text x="390" y="220">P-base 指定深度: ${f(p.pDepth)} μm</text><text x="390" y="240">外延背景氮掺杂: ${sci(p.epi)} cm⁻³</text></g>
    <rect x="382" y="265" width="278" height="51" rx="9" fill="#214054" opacity=".9"/><text x="396" y="287" fill="#76ded0" font-size="10" font-weight="700">${mesh?'网格密度示意':doping?'掺杂分区示意':'材料结构示意'}</text><text x="396" y="304" fill="#b1c9ce" font-size="10">以实际生成的 .tdr / Visual 图为准</text>
  `;
}

function renderInsight(p){
  const changed=Object.keys(DEFAULTS).filter(key=>!close(p[key],DEFAULTS[key]));
  if(!changed.length){$('#insight-text').textContent='当前使用原始参数。选择预设或修改左侧数值，查看变化。';return;}
  const names=changed.slice(0,3).map(key=>{
    const meta=FIELD_META[key],old=DEFAULTS[key],now=p[key];
    const format=meta[7]==='log'?sci:f;
    return `${meta[1]} ${format(old)} → ${format(now)} ${meta[6]}`;
  });
  $('#insight-text').textContent=names.join('；')+(changed.length>3?`；另有 ${changed.length-3} 项变化。`:'。')+' 预览用于理解结构，实际掺杂与电学差异以仿真结果为准。';
}
function renderOutput(){
  const issues=validate(state),code=generateCode(state);
  $('#metric-width').textContent=f(width(state));$('#metric-height').textContent=f(state.Tepi+state.Tsub);$('#metric-oxide').textContent=f(state.Tox*1000);
  $('#validation').textContent=issues.length?issues.join('；'):'';$('#validation').classList.toggle('is-visible',issues.length>0);
  for(const id of ['download-code','download-code-top']) $("#"+id).disabled=issues.length>0;
  $('#copy-code').disabled=issues.length>0;
  $('#code-output').innerHTML=highlight(code);
  $('#line-count').textContent=`${code.trimEnd().split('\n').length} 行`;
  renderSvg(state);renderInsight(state);
}
function downloadText(name,text,type){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function usePreset(name){state={...DEFAULTS,...PRESETS[name]};save();renderControls();renderOutput();$$('[data-preset]').forEach(el=>el.classList.toggle('is-active',el.dataset.preset===name));showToast(`已载入「${name==='baseline'?'原始参数':name==='shallow'?'浅 P-base':'厚栅氧'}」`);}

function init(){
  loadSaved();renderControls();renderOutput();
  const current=presetName();$$('[data-preset]').forEach(el=>el.classList.toggle('is-active',el.dataset.preset===current));
  $('#controls-body').addEventListener('input',onControlInput);
  $('#controls-body').addEventListener('change',event=>{const key=event.target.dataset.key;if(!key||event.target.type==='range')return;const v=Number(event.target.value),meta=FIELD_META[key];if(!String(event.target.value).trim()||!Number.isFinite(v)||v<meta[3]||v>meta[4]){event.target.value=meta[7]==='log'?sci(state[key]):f(state[key]);showToast(`${meta[1]}请输入 ${meta[3]}–${meta[4]} 范围内的数值`);}else onControlInput(event);});
  $$('[data-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.tab;$$('[data-tab]').forEach(el=>{el.classList.toggle('is-active',el===button);el.setAttribute('aria-selected',String(el===button));});renderControls();}));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>{activeView=button.dataset.view;$$('[data-view]').forEach(el=>{el.classList.toggle('is-active',el===button);el.setAttribute('aria-pressed',String(el===button));});renderSvg(state);}));
  $$('[data-preset]').forEach(button=>button.addEventListener('click',()=>usePreset(button.dataset.preset)));
  $('#reset-button').addEventListener('click',()=>usePreset('baseline'));
  for(const id of ['download-code','download-code-top']) $('#'+id).addEventListener('click',()=>{if(validate(state).length)return;downloadText('SiC_MOSFET_sde.cmd',generateCode(state),'text/plain;charset=utf-8');showToast('SDE 命令文件已下载');});
  $('#copy-code').addEventListener('click',async()=>{if(validate(state).length)return;try{await navigator.clipboard.writeText(generateCode(state));showToast('代码已复制到剪贴板');}catch(_){showToast('复制失败，请选中代码手动复制');}});
  $('#export-config').addEventListener('click',()=>{downloadText('SiC_Studio_config.json',JSON.stringify({format:'sic-studio-v1',parameters:state},null,2)+'\n','application/json;charset=utf-8');showToast('配置已导出');});
  $('#import-button').addEventListener('click',()=>$('#config-file').click());
  $('#config-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{
    if(file.size>65536)throw Error('文件过大');const json=JSON.parse(await file.text());const raw=json.parameters??json;const next={...DEFAULTS};
    for(const key of Object.keys(DEFAULTS))if(Object.hasOwn(raw,key)){const v=Number(raw[key]);if(!Number.isFinite(v))throw Error(`${key} 不是数值`);next[key]=v;}
    const issues=validate(next);if(issues.length)throw Error(issues.join('；'));state=next;save();renderControls();renderOutput();$$('[data-preset]').forEach(el=>el.classList.toggle('is-active',el.dataset.preset===presetName()));showToast('配置已导入');
  }catch(error){showToast(`导入失败：${error.message}`);}event.target.value='';});
  $('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());
  $('#close-help').addEventListener('click',()=>$('#help-dialog').close());
  $('#help-dialog').addEventListener('click',event=>{if(event.target.id==='help-dialog')event.target.close();});
}
if(typeof document!=='undefined') init();
