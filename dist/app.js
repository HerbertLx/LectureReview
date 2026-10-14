const $ = id => document.getElementById(id);
let content = {}, deck = {count:64,titles:{}}, outline = null;
let chatHistory={}, chatPendingPage=null, chatError='', chatDrafts={};
function renderChatHistory(){
  const turns=chatHistory[String(page)]||[];
  $('answer').hidden=!turns.length&&chatPendingPage!==page&&!chatError;
  $('answer').innerHTML=turns.map(turn=>'<section class="chat-turn"><p class="chat-question">'+escapeHTML(turn.question)+'</p><div class="md">'+markdown(turn.answer)+'</div></section>').join('')+(chatPendingPage===page?'<p class="status">正在回答…</p>':'')+(chatError?'<p class="status">'+escapeHTML(chatError)+'</p>':'');
}
let busy = false, apiReady = false, pending = null, catalog = null, partJob = null, partTimer = null;
const lectureId=location.port==='8771'?'l4':location.port==='8770'?'l3':location.port==='8769'?'l2':'l1';
let pageKey='geb-'+lectureId+'-page', jobKey=lectureId==='l1'?'geb-part-job':'geb-'+lectureId+'-part-job';
let page = Math.max(1, Number(localStorage.getItem(pageKey)) || 1);
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function markdown(text) {
  if(window.LectureMarkdown)return window.LectureMarkdown.render(text);
  const blocks = [];
  const safe = escapeHTML(String(text).replace(/^\s*[•▪○]\s*\n\s*/gm,'- ')).replace(/```[^\n]*\n([\s\S]*?)```/g, (_,code) => { blocks.push('<pre><code>'+code+'</code></pre>'); return '\nBLOCKTOKEN'+(blocks.length-1)+'\n'; });
  const inline = s => s.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  let list = false, html = '';
  for (const line of safe.split('\n')) {
    const item = line.match(/^\s*(?:[-*•▪○]|\d+\.)\s+(.*)/);
    if (item) { if (!list) { html+='<ul>'; list=true; } html+='<li>'+inline(item[1])+'</li>'; continue; }
    if (list) { html+='</ul>'; list=false; }
    const token = line.match(/^BLOCKTOKEN(\d+)$/), heading = line.match(/^(#{1,3})\s+(.*)/);
    if (token) html += blocks[Number(token[1])];
    else if (heading) html += '<h'+heading[1].length+'>'+inline(heading[2])+'</h'+heading[1].length+'>';
    else if (line.startsWith('&gt; ')) html += '<blockquote>'+inline(line.slice(5))+'</blockquote>';
    else if (line.trim()) html += '<p>'+inline(line)+'</p>';
  }
  if (list) html+='</ul>';
  return html;
}

function renderTranslation(note) {
  const layout=note?.translation_layout;
  if(!layout)return note?.translation?markdown(note.translation):'<p class="placeholder">暂无翻译</p>';
  const header=layout.header?'<div class="translation-header md">'+markdown(layout.header)+'</div>':'';
  const columns=layout.mode==='columns'?'<div class="translation-columns"><div class="translation-column md">'+markdown(layout.left)+'</div><div class="translation-column md">'+markdown(layout.right)+'</div></div>':'';
  const full=layout.full?'<div class="translation-full md">'+markdown(layout.full)+'</div>':'';
  return '<div class="translation-layout">'+header+columns+full+'</div>';
}

const sectionFor = n => outline?.sections?.find(section => n>=section.start_page && n<=section.end_page);
const sectionRange = section => section.start_page===section.end_page?String(section.start_page):section.start_page+'–'+section.end_page;
const titleFor = n => content[String(n)]?.title || deck.titles[String(n)] || '课件';
const has = (n,kind) => Boolean(content[String(n)]?.[kind]);
function setStateButton(button,n,kind) {
  button.dataset.kind=kind;
  button.classList.toggle('saved',has(n,kind));
  const label = kind==='translation'?'翻译':'解释';
  if(!button.classList.contains('header-icon'))button.textContent=label+(has(n,kind)?' ✓':'');
  button.title=has(n,kind)?label+'已保存，点击确认重新生成':'生成'+label;
  button.setAttribute('aria-label','第'+n+'页'+label+(has(n,kind)?'，已保存':'，未生成'));
  button.disabled=busy||!apiReady;
}
function statusText() {
  const translated=has(page,'translation'), explained=has(page,'explanation');
  return translated&&explained?'翻译与解释已保存':translated?'翻译已保存 · 解释未生成':explained?'解释已保存 · 翻译未生成':'本页尚未生成';
}
function render() {
  if(!deck.count){document.querySelector('main').hidden=true;$('selectedPage').textContent='请点击＋上传PDF课件';for(const id of ['prev','next','headerTranslate','headerExplain','outlineToggle','pageMenuToggle','ask','chatToggle'])$(id).disabled=true;return;}
  const note=content[String(page)], section=sectionFor(page);
  $('selectedPage').textContent=page+' · '+titleFor(page);
  $('title').textContent=titleFor(page);
  $('chapterLabel').textContent=section?'大纲 · '+section.title:deck.title||'LECTURE '+(deck.lecture||1);
  $('chatPage').textContent='当前第 '+page+' 页 · '+titleFor(page);
  renderChatHistory();
  $('translation').innerHTML=renderTranslation(note);
  $('explanation').innerHTML=note?.explanation?markdown(note.explanation):'<p class="placeholder">暂无解释</p>';
  $('pageLabel').textContent='PAGE '+page+' / '+deck.count;
  $('slide').src='pages/page-'+page+'.png';
  $('slide').alt=(deck.title||'Lecture '+(deck.lecture||1))+' 第 '+page+' 页';
  $('prev').disabled=page===1; $('next').disabled=page===deck.count;
  setStateButton($('headerTranslate'),page,'translation');setStateButton($('headerExplain'),page,'explanation');
  $('ask').disabled=busy||!apiReady;
  $('savedStatus').textContent=busy&&!partJob?'生成中…':'';
  localStorage.setItem(pageKey,page);
  renderMenu(); renderOutline();
}
function navigate(n,close=true) {
  chatDrafts[String(page)]=$('question').value;
  page=n;
  $('question').value=chatDrafts[String(page)]||'';chatError='';
  if (close) closeMenu(); render();
}
function closeMenu() {$('pageMenu').hidden=true;$('pageMenuToggle').setAttribute('aria-expanded','false');}
function batchButton(section,kind,full=false){
  const pages=section.end_page-section.start_page+1;let saved=0;
  for(let n=section.start_page;n<=section.end_page;n++)if(has(n,kind))saved++;
  const action=document.createElement('button');action.className='state-button';action.dataset.kind=kind;action.classList.toggle('saved',saved===pages);action.disabled=busy||!apiReady;
  const label=kind==='translation'?'翻译':'解释';action.textContent=(full?'全文':'')+label+' '+saved+'/'+pages;
  action.setAttribute('aria-label',section.title+'：整段'+label);action.onclick=()=>requestPart(section,kind);return action;
}
function renderMenu() {
  const rows=$('pageRows'), query=$('pageSearch').value.trim().toLowerCase();
  const all={id:'__all__',title:'全文',start_page:1,end_page:deck.count};$('fullActions').replaceChildren(batchButton(all,'translation',true),batchButton(all,'explanation',true));
  rows.replaceChildren(); let lastSection=null;
  for (let n=1;n<=deck.count;n++) {
    const section=sectionFor(n), title=titleFor(n);
    if (query && !(n+' '+title+' '+(section?.title||'')).toLowerCase().includes(query)) continue;
    if (section && section.id!==lastSection) {
      const heading=document.createElement('div');heading.className='section-heading';
      const caption=document.createElement('span');caption.textContent=section.title+' · '+sectionRange(section)+'页';
      const actions=document.createElement('div');actions.className='section-actions';actions.append(batchButton(section,'translation'),batchButton(section,'explanation'));
      heading.append(caption,actions);rows.append(heading);lastSection=section.id;
    }
    const row=document.createElement('div');row.className='page-row'+(n===page?' current':'');
    const link=document.createElement('button');link.className='page-link';
    link.innerHTML='<span class="page-number">'+n+'</span><span class="page-title">'+escapeHTML(title)+'</span>';
    link.setAttribute('aria-label','打开第'+n+'页 '+title);link.onclick=()=>navigate(n);
    row.append(link);
    for (const kind of ['translation','explanation']) {
      const button=document.createElement('button');button.className='state-button';setStateButton(button,n,kind);
      button.onclick=()=>requestGeneration(n,kind);row.append(button);
    }
    rows.append(row);
  }
  if (!rows.children.length) {const empty=document.createElement('p');empty.className='placeholder';empty.textContent='没有匹配的页面';rows.append(empty);}
}
function renderOutline() {
  const button=$('outlineGenerate');button.classList.toggle('saved',Boolean(outline));button.classList.add('outline-state');
  button.textContent=outline?'重新生成整讲大纲':'生成整讲大纲';button.disabled=busy||!apiReady;
  $('outlineStatus').textContent=busy&&!partJob?'生成中…':'';
  const body=$('outlineBody');body.replaceChildren();
  if (!outline) {const p=document.createElement('p');p.className='placeholder';p.textContent='暂无大纲';body.append(p);return;}
  $('outlineHeading').textContent=outline.title||'整讲大纲';
  const intro=document.createElement('p');intro.className='outline-overview';intro.textContent=outline.overview;body.append(intro);
  outline.sections.forEach(section=>{
    const element=document.createElement('section');element.className='outline-section'+(sectionFor(page)?.id===section.id?' current':'');
    const heading=document.createElement('h3');const title=document.createElement('span');title.textContent=section.title;
    const jump=document.createElement('button');jump.textContent=sectionRange(section)+'页 ↗';jump.onclick=()=>{navigate(section.start_page);$('outlinePanel').hidden=true;};
    heading.append(title,jump);const summary=document.createElement('p');summary.textContent=section.summary;
    const points=document.createElement('ul');section.points.forEach(point=>{const li=document.createElement('li');li.textContent=point;points.append(li);});
    element.append(heading,summary,points);body.append(element);
  });
  for (const [field,label] of [['key_formulas','课件中的关键公式'],['review_order','建议复习顺序']]) {
    if (!Array.isArray(outline[field])||!outline[field].length) continue;
    const extra=document.createElement('section');extra.className='outline-extra';const heading=document.createElement('h3');heading.textContent=label;
    const list=document.createElement('ul');outline[field].forEach(text=>{const li=document.createElement('li');li.textContent=text;list.append(li);});extra.append(heading,list);body.append(extra);
  }
}
function showConfirm(target,kind) {
  pending={target,kind};$('confirmTitle').textContent=kind==='outline'?'重新生成整讲大纲？':'重新生成第'+target+'页'+(kind==='translation'?'翻译':'解释')+'？';
  $('confirmText').textContent=kind==='outline'?'已保存的大纲会被新版本替换。':'只替换该页的'+(kind==='translation'?'翻译':'解释')+'，另一项已保存内容不会改变。';
  $('confirmHint').textContent='重新生成会产生费用。成功后替换所选内容，失败保留旧内容。';$('confirmGenerate').textContent='确定重新生成';
  $('confirmOverlay').hidden=false;$('cancelConfirm').focus();
}
function requestPart(section,kind){
  if(busy||!apiReady)return;
  let missing=0;for(let n=section.start_page;n<=section.end_page;n++)if(!has(n,kind))missing++;
  if(!missing){$('taskNotice').textContent='这一部分已全部保存，无需重复生成。';return;}
  pending={type:'part',section,kind};const label=kind==='translation'?'翻译':'解释';
  $('confirmTitle').textContent='生成'+(section.id==='__all__'?'全文':'这一部分')+'的'+label+'？';
  $('confirmText').textContent=section.title+'（第'+sectionRange(section)+'页）：需要生成 '+missing+' 页，已有内容会跳过。';
  $('confirmHint').textContent='使用 Flash 逐页生成并自动保存，不覆盖已有内容。生成会产生费用，可停止剩余队列。';
  $('confirmGenerate').textContent='确定生成';$('confirmOverlay').hidden=false;$('cancelConfirm').focus();
}
function renderPartProgress(){
  const panel=$('partProgress');if(!partJob){panel.hidden=true;return;}
  panel.hidden=false;const kind=partJob.kind==='translation'?'翻译':'解释';
  const status={running:partJob.current?'正在生成第 '+partJob.current+' 页':'等待生成',complete:'完成',stopped:'已停止',failed:'生成失败，可重新点击补齐剩余页面'}[partJob.status];
  $('partProgressText').textContent=partJob.title+' · '+kind+' '+partJob.done+'/'+partJob.total+' · 跳过 '+partJob.skipped+' 页 · '+status;
  $('partStop').hidden=partJob.status!=='running';$('partDismiss').hidden=partJob.status==='running';$('partStop').disabled=partJob.stop_requested;
}
async function startPart(section,kind){
  if(busy)return;busy=true;pending=null;$('confirmOverlay').hidden=true;render();
  try{
    const response=await fetch('/api/part',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section_id:section.id,kind})});const job=await response.json();if(!response.ok)throw Error(job.error||'无法启动任务');
    partJob=job;localStorage.setItem(jobKey,job.id);renderPartProgress();await pollPart();
  }catch(error){busy=false;$('taskNotice').textContent=error.message;render();}
}
async function pollPart(){
  if(!partJob)return;
  try{
    const response=await fetch('/api/part/jobs/'+encodeURIComponent(partJob.id));
    if(!response.ok){partJob=null;busy=false;localStorage.removeItem(jobKey);render();renderPartProgress();return;}
    partJob=await response.json();content=await(await fetch('/api/content')).json();busy=partJob.status==='running';render();renderPartProgress();
    if(busy)partTimer=setTimeout(pollPart,1500);else localStorage.removeItem(jobKey);
  }catch{partTimer=setTimeout(pollPart,3000);}
}
function requestGeneration(target,kind) {
  if (busy||!apiReady) return;
  if (kind==='outline'?Boolean(outline):has(target,kind)) showConfirm(target,kind);
  else generate(target,kind,false);
}
async function generate(target,kind,regenerate) {
  if (busy) return;
  busy=true;pending=null;$('confirmOverlay').hidden=true;render();
  try {
    const response=await fetch(kind==='outline'?'/api/outline':'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:target,kind,regenerate})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'生成失败');
    if(kind==='outline')outline=result.outline;else content[String(target)]=result.content;
    $('taskNotice').textContent='已保存';
    setTimeout(()=>{$('taskNotice').textContent='';},3000);
  } catch(error) {$('taskNotice').textContent=error.message+'；原有保存内容不变。';}
  finally {busy=false;render();}
}
async function init() {
  const [notes,metadata,outlineData,status,library,historyData]=await Promise.all([
    fetch('/api/content').then(r=>r.json()),fetch('deck.json').then(r=>r.json()),
    fetch('/api/outline').then(r=>r.json()),fetch('/api/status').then(r=>r.json()),fetch('catalog.json').then(r=>r.json()),fetch('/api/chat/history').then(r=>r.json())]);
  chatHistory=historyData.history||{};
  content=notes;deck=metadata;outline=outlineData.outline;apiReady=status.ready;
  if(deck.id){pageKey='reader-'+deck.id+'-page';jobKey='reader-'+deck.id+'-part-job';page=Math.max(1,Number(localStorage.getItem(pageKey))||1);}
  page=Math.min(deck.count,page);
  document.title=deck.title?(deck.course+' · '+deck.title):'GEB3302 · Lecture '+(deck.lecture||1)+' 精讲';
  const originalLink=document.querySelector('a[href="Lecture1.pdf"]');originalLink.href=deck.pdf||'Lecture1.pdf';originalLink.hidden=!deck.count;
  catalog=library;$('deckSelect').replaceChildren();
  const groups=new Map();
  library.decks.forEach(item=>{if(!groups.has(item.course)){const group=document.createElement('optgroup');group.label=item.course;groups.set(item.course,group);$('deckSelect').append(group);}const option=document.createElement('option');option.value=item.id;option.textContent=item.course+' · '+item.title;groups.get(item.course).append(option);});
  $('deckSelect').value=library.current;
  if(!library.decks.length){const option=document.createElement('option');option.textContent='LectureReview · 上传PDF开始';$('deckSelect').append(option);}
  $('apiStatus').textContent=status.ready?'':'问答暂不可用';render();
  const oldJob=localStorage.getItem(jobKey);if(oldJob){partJob={id:oldJob};await pollPart();}
}
$('prev').onclick=()=>navigate(page-1);$('next').onclick=()=>navigate(page+1);
$('headerTranslate').onclick=()=>requestGeneration(page,'translation');$('headerExplain').onclick=()=>requestGeneration(page,'explanation');
$('pageMenuToggle').onclick=()=>{const open=$('pageMenu').hidden;$('pageMenu').hidden=!open;$('pageMenuToggle').setAttribute('aria-expanded',String(open));if(open){renderMenu();$('pageSearch').focus();}};
$('closeMenu').onclick=closeMenu;$('pageSearch').oninput=renderMenu;
$('deckSelect').onchange=()=>{const selected=catalog?.decks.find(item=>item.id===$('deckSelect').value);if(selected&&selected.id!==catalog.current){const url=new URL(selected.url,location.href);if(['http:','https:'].includes(url.protocol))location.assign(url.href);}};
$('outlineToggle').onclick=()=>{closeMenu();renderOutline();$('outlinePanel').hidden=false;};
$('closeOutline').onclick=()=>{$('outlinePanel').hidden=true;};
$('outlineGenerate').onclick=()=>requestGeneration(null,'outline');
$('cancelConfirm').onclick=()=>{pending=null;$('confirmOverlay').hidden=true;};
$('confirmGenerate').onclick=()=>{if(pending){if(pending.type==='part'){startPart(pending.section,pending.kind);}else{const {target,kind}=pending;generate(target,kind,true);}}};
$('partStop').onclick=async()=>{if(!partJob)return;const response=await fetch('/api/part/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:partJob.id})});if(response.ok){partJob=await response.json();renderPartProgress();}};
$('partDismiss').onclick=()=>{partJob=null;renderPartProgress();};
$('zoom').oninput=()=>{$('slide').style.width=$('zoom').value+'%';};
function toggleChat(open){$('chatPanel').hidden=!open;$('chatToggle').setAttribute('aria-expanded',String(open));$('chatToggle').setAttribute('aria-label',open?'收起悬浮问答':'展开悬浮问答');if(open){$('question').focus();fetch('/api/chat/history').then(r=>r.json()).then(data=>{chatHistory=data.history||{};renderChatHistory();}).catch(()=>{});}}
$('chatToggle').onclick=()=>toggleChat($('chatPanel').hidden);$('closeChat').onclick=()=>toggleChat(false);
document.addEventListener('click',event=>{if(!$('pageMenu').contains(event.target)&&!$('pageMenuToggle').contains(event.target))closeMenu();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){pending=null;$('confirmOverlay').hidden=true;$('outlinePanel').hidden=true;closeMenu();toggleChat(false);return;}
  if(['TEXTAREA','INPUT','BUTTON'].includes(event.target.tagName)||!$('outlinePanel').hidden||!$('confirmOverlay').hidden)return;
  if(event.key==='ArrowRight'&&page<deck.count)navigate(page+1);if(event.key==='ArrowLeft'&&page>1)navigate(page-1);
});
$('ask').onclick=async()=>{
  const question=$('question').value.trim();if(!question||busy)return;const target=page;
  busy=true;chatPendingPage=target;chatError='';render();
  try{const response=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:target,question})});const result=await response.json();if(!response.ok)throw Error(result.error||'请求失败');chatHistory[String(target)]=result.history;chatDrafts[String(target)]='';if(page===target)$('question').value='';$('apiStatus').textContent='';}
  catch(error){chatError=error.message;}finally{busy=false;chatPendingPage=null;render();const area=$('answer').parentElement;area.scrollTop=area.scrollHeight;}
};
init().catch(error=>{$('selectedPage').textContent='加载失败';$('savedStatus').textContent=error.message;});
