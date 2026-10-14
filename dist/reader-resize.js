(()=>{
const main=document.querySelector('main'),left=main.querySelector('.left');
const store='geb-reader-layout-v1',panels={ppt:main.querySelector('.slide'),translation:main.querySelector('.translation'),explanation:main.querySelector('.notes')};
let saved={};try{saved=JSON.parse(localStorage.getItem(store)||'{}')||{};}catch{}
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
main.classList.add('reader-resizable');
const translationScroll=document.createElement('div');translationScroll.className='reader-translation-scroll';translationScroll.append(document.getElementById('translation'));panels.translation.append(translationScroll);
const divider=document.createElement('button');divider.className='reader-divider';divider.type='button';divider.setAttribute('aria-label','调整左右栏目宽度');divider.title='拖动调整左右栏目；方向键也可调整';main.append(divider);
const horizontal=document.createElement('button');horizontal.type='button';horizontal.className='reader-horizontal-divider';horizontal.setAttribute('aria-label','调整PPT与翻译高度分界');horizontal.title='上下拖动调整PPT和翻译的高度；方向键也可调整';left.insertBefore(horizontal,panels.translation);
function persist(){try{localStorage.setItem(store,JSON.stringify(saved));}catch{}}
function apply(){
  const style=getComputedStyle(main),gap=parseFloat(style.columnGap)||20;
  const usable=main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-gap;
  if(innerWidth>620){const minimum=Math.min(220,usable*.35);const ratio=clamp(finite(saved.columns,.65),minimum/usable,1-minimum/usable);main.style.gridTemplateColumns=(usable*ratio)+'px minmax(0,1fr)';}else main.style.removeProperty('grid-template-columns');
  const top=document.querySelector('header').getBoundingClientRect().height+12;main.style.setProperty('--reader-top',top+'px');
  const leftRect=left.getBoundingClientRect(),mainRect=main.getBoundingClientRect();divider.style.left=(leftRect.right-mainRect.left)+'px';
  for(const [id,panel] of Object.entries(panels)){
    const size=saved[id];if(size&&typeof size==='object'){
      panel.style.width='100%';
      panel.style.height=clamp(finite(size.height,400),id==='translation'?85:id==='ppt'?180:160,4000)+'px';
    }else{panel.style.removeProperty('width');panel.style.removeProperty('height');}
  }
}
function reset(id){if(id)delete saved[id];else saved={};persist();apply();}
for(const [id,panel] of Object.entries(panels)){
  if(id!=='explanation')continue;
  const name={ppt:'原PPT',translation:'翻译',explanation:'解释'}[id];
  const grip=document.createElement('button');grip.type='button';grip.className='reader-grip';grip.textContent='◢';grip.setAttribute('aria-label','调整'+name+'板块尺寸');grip.title='拖动调整长宽；方向键调整；Home恢复本板块';panel.append(grip);
  function resize(width,height){const style=getComputedStyle(main),contentWidth=main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);const available=id==='explanation'?(innerWidth>620?contentWidth-left.clientWidth-(parseFloat(style.columnGap)||20):contentWidth):left.clientWidth;saved[id]={width:clamp(width/available,.3,1),height:clamp(height,id==='translation'?85:id==='ppt'?180:160,4000)};apply();}
  grip.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();const rect=panel.getBoundingClientRect();let moved=false;const x=event.clientX,y=event.clientY;grip.setPointerCapture(event.pointerId);document.body.classList.add('reader-dragging');
    const move=next=>{if(next.pointerId!==event.pointerId)return;moved=true;resize(rect.width+next.clientX-x,rect.height+next.clientY-y);};
    const end=next=>{if(next.pointerId!==event.pointerId)return;grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);grip.removeEventListener('lostpointercapture',end);document.body.classList.remove('reader-dragging');if(moved)persist();};
    grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);grip.addEventListener('lostpointercapture',end);
  });
  grip.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();reset(id);return;}const delta={ArrowRight:[20,0],ArrowLeft:[-20,0],ArrowDown:[0,20],ArrowUp:[0,-20]}[event.key];if(!delta)return;event.preventDefault();const rect=panel.getBoundingClientRect();resize(rect.width+delta[0],rect.height+delta[1]);persist();});
}
divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();divider.setPointerCapture(event.pointerId);const leftRect=left.getBoundingClientRect(),rightRect=panels.explanation.parentElement.getBoundingClientRect();const start=event.clientX,width=leftRect.width;const gap=parseFloat(getComputedStyle(main).columnGap)||20;const usable=rightRect.width-parseFloat(getComputedStyle(main).paddingLeft)-parseFloat(getComputedStyle(main).paddingRight)-gap;
  const move=next=>{if(next.pointerId!==event.pointerId)return;saved.columns=clamp((width+next.clientX-start)/usable,.2,.8);apply();};
  const end=next=>{if(next.pointerId!==event.pointerId)return;divider.removeEventListener('pointermove',move);divider.removeEventListener('pointerup',end);divider.removeEventListener('pointercancel',end);divider.removeEventListener('lostpointercapture',end);persist();};
  divider.addEventListener('pointermove',move);divider.addEventListener('pointerup',end);divider.addEventListener('pointercancel',end);divider.addEventListener('lostpointercapture',end);
});
divider.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();delete saved.columns;persist();apply();return;}if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();saved.columns=clamp(finite(saved.columns,.65)+(event.key==='ArrowRight'?.025:-.025),.2,.8);persist();apply();});
const resetButton=document.createElement('button');resetButton.type='button';resetButton.className='reader-layout-reset';resetButton.textContent='恢复默认阅读布局';resetButton.onclick=()=>reset();document.querySelector('.settings-box').append(resetButton);
function adjustVertical(pptHeight,total){const height=clamp(pptHeight,180,Math.max(180,total-85));saved.ppt={width:1,height};saved.translation={width:1,height:Math.max(85,total-height)};apply();}
horizontal.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();horizontal.setPointerCapture(event.pointerId);const start=event.clientY,pptHeight=panels.ppt.getBoundingClientRect().height,total=pptHeight+panels.translation.getBoundingClientRect().height;document.body.classList.add('reader-dragging');
  const move=next=>{if(next.pointerId===event.pointerId)adjustVertical(pptHeight+next.clientY-start,total);};
  const end=next=>{if(next.pointerId!==event.pointerId)return;horizontal.removeEventListener('pointermove',move);horizontal.removeEventListener('pointerup',end);horizontal.removeEventListener('pointercancel',end);horizontal.removeEventListener('lostpointercapture',end);document.body.classList.remove('reader-dragging');persist();};
  horizontal.addEventListener('pointermove',move);horizontal.addEventListener('pointerup',end);horizontal.addEventListener('pointercancel',end);horizontal.addEventListener('lostpointercapture',end);
});
horizontal.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();delete saved.ppt;delete saved.translation;persist();apply();return;}if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const height=panels.ppt.getBoundingClientRect().height,total=height+panels.translation.getBoundingClientRect().height;adjustVertical(height+(event.key==='ArrowDown'?20:-20),total);persist();});
window.addEventListener('resize',apply);new ResizeObserver(()=>apply()).observe(document.querySelector('header'));apply();
})();
