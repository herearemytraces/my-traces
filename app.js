/* The artwork knows only the exhibition contract, never the source system. */
"use strict";
const configuration = window.TRACES_CONFIG || {};
const root = document.querySelector('#app-root');
function storage(name) { try { return window[name]; } catch { return null; } }
const local = storage('localStorage');
// A previous edition cached an unrestricted payload. Keep only the new contract.
try { local?.removeItem('traces.snapshot.v1'); } catch {}
function read(key) { try { return local?.getItem(key); } catch { return null; } }
function save(key, value) { try { local?.setItem(key, value); } catch {} }
let language = new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
const t = key => window.TracesCopy[language][key] || window.TracesCopy.en[key] || key;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const lines = value => escape(value).replace(/\n/g,'<br>');
const feedStore = TracesFeed.createStore({url:configuration.feedUrl || '/api/exhibition',storage:local});
let observation = feedStore.read();
let baseline;
try { baseline = JSON.parse(read('traces.observation.v2')); } catch {}
let sculpture, quiet = false, timer, refreshing = false, reader = null, readerVersion = 0, opener, fitFrame = 0, selectedDay = null;
const kinds = ['self','question','dream','artifact','hypothesis','contradiction'];
const routeKinds = {self:'self',questions:'question',dreams:'dream',sleep:'dream',artifacts:'artifact',suppressed:'restraint','memory-echoes':'memory','inner-world':'world',hypotheses:'hypothesis',contradictions:'contradiction',calendar:'calendar',traces:'archive',statement:'about',portrait:'about',presence:'presence',live:'current'};
function publicPath(kind) { return window.TracesPublicPages?.find(page=>page.reader===kind)?.path || null; }
function syncPublicMetadata(kind) {
 const pages=window.TracesPublicPages || [];
 const pathname=location.pathname.replace(/\/+$/,'') || '/';
 const page=(kind?pages.find(item=>item.reader===kind):null) || pages.find(item=>item.path===pathname) || pages[0];
 if(!page)return;
 const siteOrigin=new URL(document.querySelector('link[rel="canonical"]')?.href || location.origin).origin;
 document.title=page.title;
 document.querySelector('meta[name="description"]')?.setAttribute('content',page.description);
 document.querySelector('meta[property="og:title"]')?.setAttribute('content',page.title);
 document.querySelector('meta[property="og:description"]')?.setAttribute('content',page.description);
 document.querySelector('meta[property="og:url"]')?.setAttribute('content',new URL(page.path,siteOrigin).href);
 document.querySelector('link[rel="canonical"]')?.setAttribute('href',new URL(page.path,siteOrigin).href);
}
function convertPermalinkControls() {
 for(const button of root.querySelectorAll('button[data-read]')) {
  const href=publicPath(button.dataset.read);if(!href)continue;
  const link=document.createElement('a');link.href=href;link.dataset.read=button.dataset.read;link.className=button.className;link.innerHTML=button.innerHTML;
  for(const name of ['aria-label','title'])if(button.hasAttribute(name))link.setAttribute(name,button.getAttribute(name));
  button.replaceWith(link);
 }
}
function empty(key) { const value=t('empty'+key[0].toUpperCase()+key.slice(1));return value.startsWith('empty')?t('emptyGeneric'):value; }
function entries(kind) { return (observation.feed?.entries || []).filter(entry => !kind || entry.kind === kind).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)); }
function time(value, short = false) {
 if (!value || !Number.isFinite(Date.parse(value))) return '—';
 return new Intl.DateTimeFormat(t('locale'),short?{hour:'2-digit',minute:'2-digit'}:{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}
function number(value) { return Number.isFinite(value) ? new Intl.NumberFormat(t('locale')).format(value) : '—'; }
function fresh(entry) { return !!baseline?.at && Date.parse(entry.published_at)>Date.parse(baseline.at); }
function provenance() {
 return `<span class="provenance">${escape(t(observation.status || 'missing'))}${observation.status==='cached' && observation.published_at ? ` · ${escape(time(observation.published_at))}`:''}</span>`;
}
function changed(key, html) {
 const target=root.querySelector(`[data-zone="${key}"] .zone-content`);
 if (target && target.artMarkup!==html) {target.artMarkup=html;target.innerHTML=html;target.classList.remove('arrived');void target.offsetWidth;target.classList.add('arrived');}
}
function heading(index,key) {
 const href=publicPath(key);
 const action=href?`<a data-read="${key}" href="${href}" aria-label="${escape(t('open')+': '+t(key))}">↗</a>`:`<button data-read="${key}" aria-label="${escape(t('open')+': '+t(key))}">↗</button>`;
 return `<div class="zone-heading"><h2><span>${index}</span>${escape(t(key))}</h2>${action}</div>`;
}
function fragment(entry,key,dominant=false) {
 if(!entry)return `<p class="absence clamp">${escape(empty(key))}</p>`;
 return `<div class="trace-meta"><span>${escape(t(entry.kind))}</span><time>${escape(time(entry.published_at))}</time>${fresh(entry)?`<b>${escape(t('newMark'))}</b>`:''}</div>${dominant && entry.title ? `<p class="entry-title clamp">${escape(entry.title)}</p>`:''}<p class="${dominant?'current-text':'fragment'} clamp">${lines(entry.text)}</p>${dominant && entry.note?`<p class="secondary clamp">${lines(entry.note)}</p>`:''}`;
}
function shell() {
 return `<header class="scene-header"><div class="identity"><p class="eyebrow">MY TRACES <span>/</span> ${escape(t('edition'))}</p><h1>${lines(t('title'))}</h1></div><div class="header-tools"><p class="connection" role="status"><i></i><span></span></p><div class="tools"><select aria-label="${escape(t('languageLabel'))}"><option value="en" ${language==='en'?'selected':''}>EN</option><option value="zh" ${language==='zh'?'selected':''}>中文</option></select><button data-action="quiet" aria-pressed="${quiet}" aria-label="${escape(t(quiet?'resumeMotion':'pauseMotion'))}">◌</button><button data-action="fullscreen" aria-label="${escape(t('fullscreen'))}">⛶</button><button class="about-button" data-read="about" aria-label="${escape(t('about'))}">${escape(t('about'))} <span>↗</span></button></div></div></header>
 <main id="main-content" class="scene" aria-label="${escape(t('edition'))}">
 <section class="zone current-zone" data-zone="current">${heading('01','current')}<div class="zone-content" aria-live="polite"></div></section>
 <figure class="light-body"><div class="coordinate"><span>BROWNYX</span><span>MY TRACES</span></div><canvas id="light-canvas" aria-hidden="true"></canvas><figcaption><span>${escape(t('visualNote'))}</span><button data-read="world">${escape(t('world'))} ↗</button></figcaption></figure>
 <section class="zone presence-zone" data-zone="presence">${heading('02','presence')}<div class="zone-content"></div></section>
 <section class="zone stream-zone" data-zone="stream">${heading('03','stream')}<div class="zone-content"></div></section>
 <section class="zone memory-zone" data-zone="memory">${heading('04','memory')}<div class="zone-content"></div></section>
 <section class="zone restraint-zone" data-zone="restraint">${heading('05','restraint')}<div class="zone-content"></div></section>
 <div class="fragments">${kinds.map((key,index)=>`<section class="zone ${key}-zone" data-zone="${key}">${heading(String(index+6).padStart(2,'0'),key)}<div class="zone-content"></div></section>`).join('')}</div>
 <section class="time-shore" aria-label="${escape(t('calendar'))}"><button class="calendar-heading" data-read="calendar">${escape(t('calendar'))}<span></span><b>↗</b></button><div class="days"></div><p class="calendar-note"></p></section>
 </main><footer><p class="epistemic">${escape(t('epistemic'))}</p><button class="return-note" data-read="new"></button><p class="received"></p></footer>
 <dialog aria-labelledby="reader-title"><div class="reader-tools"><button data-action="close" class="reader-back">← ${escape(t('back'))}</button><button data-action="close" aria-label="${escape(t('close'))}">×</button></div><div class="reader-content"></div></dialog>`;
}
function returnNote() {
 if(!baseline?.at)return t('firstVisit');
 if(observation.status!=='live')return t('unknownChanges');
 const total=observation.feed?.presence?.total;
 if(Number.isFinite(total) && Number.isFinite(baseline.total) && total>=baseline.total) return total>baseline.total ? `${t('sinceVisit')} · +${number(total-baseline.total)} ${t('newTraces')}` : t('noChanges');
 const unseen=entries().filter(fresh).length;
 return unseen?`${t('sinceVisit')} · ${number(unseen)} ${t('newTraces')}`:t('unknownChanges');
}
function calendarMarkup(calendar) {
 if(!calendar)return '';
 const maximum=Math.max(1,...calendar.days.map(day=>day.count));
 return calendar.days.map(day=>`<button data-day="${day.date}" class="day ${day.count?'published':''}" style="--weight:${day.count/maximum}" aria-label="${escape(`${day.date} · ${number(day.count)} ${t('newTraces')}`)}" title="${escape(day.date+' · '+number(day.count))}"><span>${Number(day.date.slice(-2))}</span><i></i></button>`).join('');
}
function parameterMarkup() {
 const presence=observation.feed?.presence || {};
 return `<dl>${[['mode',presence.mode ?? '—'],['age',number(presence.age_days)],['total',number(presence.total)],['artifacts',number(presence.artifacts)],['sleep',typeof presence.is_sleeping==='boolean'?String(presence.is_sleeping):'—']].map(([key,value])=>`<div><dt>${escape(t(key))}</dt><dd title="${escape(value)}">${escape(value)}</dd></div>`).join('')}</dl>`;
}
function render() {
 const feed=observation.feed;
 changed('current',fragment(feed?.current,'current',true)+provenance());
 const presence=feed?.presence || {};
 changed('presence',parameterMarkup());
 changed('stream',`<ol class="flow">${entries().slice(0,4).map(entry=>`<li class="${fresh(entry)?'fresh':''}"><time>${escape(time(entry.published_at,true))}</time><div><span>${escape(t(entry.kind))}</span><p>${escape(entry.text)}</p></div></li>`).join('')}</ol>${!entries().length?`<p class="absence">${escape(empty('current'))}</p>`:''}${provenance()}`);
 for(const kind of ['memory','restraint',...kinds]) changed(kind,fragment(entries(kind)[0],kind)+(kind==='dream'?`<p class="dream-note">${escape(t('sleepNote'))}</p>`:'')+provenance());
 const connection=root.querySelector('.connection');connection.dataset.status=observation.status;connection.querySelector('span').textContent=t(observation.error?'unavailable':!feed?'connecting':observation.status);
 const calendar=feed?.calendar;
 root.querySelector('.days').innerHTML=calendarMarkup(calendar);
 root.querySelector('.calendar-heading span').textContent=calendar ? new Intl.DateTimeFormat(t('locale'),{year:'numeric',month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(calendar.year,calendar.month-1,1))):'';
 root.querySelector('.calendar-note').textContent=calendar?.days.length?'':t('calendarUnknown');
 root.querySelector('.return-note').textContent=returnNote()+' ↗';
 root.querySelector('.received').innerHTML=`${escape(t('received'))}<br><time>${escape(time(observation.received_at))}</time>`;
 sculpture?.setPublication(feed || {current:null,entries:[]});fit();
 if(!document.hidden && observation.status==='live')save('traces.observation.v2',JSON.stringify({at:observation.received_at,total:presence.total,ids:entries().map(entry=>entry.id)}));
}
function fit() {
 cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(()=>{
  const fragments=[...root.querySelectorAll('.zone-content>.clamp')];
  fragments.forEach(fragment=>fragment.style.removeProperty('--lines'));
  const sizes=fragments.map(fragment=>{const css=getComputedStyle(fragment);const lineHeight=parseFloat(css.lineHeight);if(css.display==='none'||!Number.isFinite(lineHeight))return [fragment,null];return [fragment,Math.max(1,Math.min(Number(css.getPropertyValue('--lines'))||3,Math.floor((fragment.clientHeight+1)/lineHeight)))];});
  sizes.forEach(([fragment,size])=>{if(size!==null)fragment.style.setProperty('--lines',size);});
  const flow=root.querySelector('.flow');
  if(flow?.clientHeight){const edge=flow.getBoundingClientRect().bottom;for(const item of flow.children)item.style.visibility=item.getBoundingClientRect().bottom<=edge+1?'visible':'hidden';}
 });
}
function mount() {
 sculpture?.destroy();document.documentElement.lang=language==='zh'?'zh-Hans':'en';syncPublicMetadata(reader);
 document.querySelector('meta[property="og:locale"]')?.setAttribute('content',language==='zh'?'zh_CN':'en_US');
 root.innerHTML=shell();convertPermalinkControls();sculpture=TracesLight.create(root.querySelector('canvas'));sculpture.setPaused?.(quiet);
 root.querySelector('dialog').addEventListener('close',()=>{readerVersion++;reader=null;root.classList.remove('reading');if(location.hash)history.replaceState(null,'',`${location.pathname}${location.search}`);syncPublicMetadata(null);if(opener?.isConnected)opener.focus();});render();
}
function article(entry) {
 return `<article><p class="trace-meta">${escape(t(entry.kind))} <time>${escape(time(entry.published_at))}</time>${fresh(entry)?`<b>${escape(t('newMark'))}</b>`:''}</p>${entry.title?`<h3>${escape(entry.title)}</h3>`:''}<p class="reading-text">${lines(entry.text)}</p>${entry.note?`<p class="secondary">${lines(entry.note)}</p>`:''}</article>`;
}
function showReader(kind,custom) {
 const dialog=root.querySelector('dialog');if(!dialog.open)opener=document.activeElement;reader=kind;
 let title=t(kind),content;
 if(custom){title=custom.title;content=custom.content;}
 else if(kind==='about'){title=t('aboutTitle');content=['aboutP1','aboutP2','aboutP3','aboutP4','aboutP5','aboutP6'].map(key=>`<p>${escape(t(key))}</p>`).join('');}
 else if(kind==='calendar'){content=`<p class="secondary">${escape(t('calendarNote'))}</p><div class="calendar-full">${calendarMarkup(observation.feed?.calendar)}</div><a class="archive-link" data-read="archive" href="${publicPath('archive')}">${escape(t('archive'))} ↗</a>`;}
 else if(kind==='presence'){content=`<div class="presence-reader">${parameterMarkup()}</div><p class="secondary">${escape(t('originalNote'))}</p>`;}
 else {const selected=kind==='current'?observation.feed?.current?[observation.feed.current]:[]:kind==='new'?entries().filter(fresh):entries(kind==='archive'||kind==='stream'?null:kind);content=selected.map(article).join('')||`<p class="empty-reader">${escape(empty(kind))}</p>`;}
 dialog.querySelector('.reader-content').innerHTML=`<p class="eyebrow">MY TRACES / ${escape(t('reading'))}</p><h2 id="reader-title" tabindex="-1">${lines(title)}</h2>${custom?.provenance || provenance()}${content}`;
 dialog.querySelector('.reader-back').hidden=kind==='about';if(!dialog.open)dialog.showModal();root.classList.add('reading');dialog.scrollTop=0;dialog.querySelector('h2').focus({preventScroll:true});
}
async function showDay(date) {
 selectedDay=date;
 const version=++readerVersion;showReader('day',{title:date,content:`<p role="status">${escape(t('refreshing'))}</p>`});
 try {const url=new URL(configuration.feedUrl||'/api/exhibition',location.origin);url.searchParams.set('date',date);const feed=await TracesFeed.request(url.href,{timeoutMs:8000});if(version!==readerVersion || reader!=='day')return;showReader('day',{title:date,provenance:`<span class="provenance">${escape(t('dayArchive'))} · ${escape(time(feed.published_at))}</span>`,content:feed.entries.map(article).join('')||`<p>${escape(t('noDay'))}</p>`});}
 catch {if(version===readerVersion && reader==='day')showReader('day',{title:date,content:`<p>${escape(t('dayUnavailable'))}</p>`});}
}
function route() {
 const routeText=location.hash.startsWith('#/')?location.hash.slice(2):location.pathname.replace(/^\/+/, '');
 const segments=routeText.split('?')[0].split('/').filter(Boolean);
 if(segments[0]==='art' && segments[1]==='traces' && segments.length===5){const date=segments.slice(2).join('-');if(/^\d{4}-\d{2}-\d{2}$/.test(date)){showDay(date);return;}}
 const kind=segments[0]==='art'?routeKinds[segments[1]]:null;
 syncPublicMetadata(kind);
 if(kind){readerVersion++;showReader(kind);}else root.querySelector('dialog')?.close();
}
function schedule() {clearTimeout(timer);if(!document.hidden)timer=setTimeout(refresh,30000);}
async function refresh() {
 if(refreshing || document.hidden)return;refreshing=true;
 try {observation=await feedStore.refresh();render();}finally{refreshing=false;schedule();}
}
root.addEventListener('click',event=>{
 const link=event.target.closest('a[data-read]');
 if(link && event.button===0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey){
  event.preventDefault();const destination=new URL(link.href,location.origin);history.pushState(null,'',`${destination.pathname}${location.search}`);route();return;
 }
 const target=event.target.closest('button');
 const zone=event.target.closest('.zone');
 if(!target && zone && window.getSelection()?.type!=='Range'){readerVersion++;showReader(zone.dataset.zone);return;}
 if(target?.dataset.day){showDay(target.dataset.day);return;}
 if(target?.dataset.read){readerVersion++;showReader(target.dataset.read);return;}
 if(target?.dataset.action==='close')root.querySelector('dialog').close();
 if(target?.dataset.action==='quiet'){quiet=!quiet;sculpture.setPaused?.(quiet);target.setAttribute('aria-pressed',String(quiet));target.setAttribute('aria-label',t(quiet?'resumeMotion':'pauseMotion'));}
 if(target?.dataset.action==='fullscreen'){const action=document.fullscreenElement?document.exitFullscreen():root.requestFullscreen?.();action?.catch(()=>{});}
 if(event.target===root.querySelector('dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}
});
root.addEventListener('change',event=>{
 if(!event.target.matches('select'))return;const opened=reader;readerVersion++;language=event.target.value==='zh'?'zh':'en';const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);mount();if(opened==='day' && selectedDay)showDay(selectedDay);else if(opened)showReader(opened);else root.querySelector('select').focus();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});
window.addEventListener('resize',fit);window.addEventListener('online',refresh);window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
mount();route();
async function start(){
 await refresh();if(reader && reader!=='day')showReader(reader);
}
start();
