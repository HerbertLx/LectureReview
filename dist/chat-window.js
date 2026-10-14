/* Pointer Events support mouse and iPad touch. */
(()=>{
  const panel=document.getElementById('chatPanel'),head=panel.querySelector('.chat-head');
  const resize=document.createElement('button');resize.id='chatResize';resize.className='chat-resize';resize.setAttribute('aria-label','调整问答窗口大小');resize.title='拖动调整大小';resize.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 17 17 6M11 17l6-6M16 17l1-1"/></svg>';panel.append(resize);
  const reset=document.createElement('button');reset.className='chat-reset';reset.setAttribute('aria-label','重置问答窗口位置和大小');reset.title='重置位置和大小';reset.textContent='↺';head.insertBefore(reset,document.getElementById('closeChat'));
  const key='geb-chat-window-v1';let active=null;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  function bounds(box){
    const availableW=Math.max(100,innerWidth-16),availableH=Math.max(120,innerHeight-16);
    const width=clamp(box.width,Math.min(280,availableW),availableW),height=clamp(box.height,Math.min(190,availableH),availableH);
    return {width,height,x:clamp(box.x,8,Math.max(8,innerWidth-width-8)),y:clamp(box.y,8,Math.max(8,innerHeight-height-8))};
  }
  function apply(box){const value=bounds(box);Object.assign(panel.style,{left:value.x+'px',top:value.y+'px',right:'auto',bottom:'auto',width:value.width+'px',height:value.height+'px',maxWidth:'none',maxHeight:'none'});return value;}
  function currentBox(){const rect=panel.getBoundingClientRect();return panel.hidden&&panel.style.left?{x:parseFloat(panel.style.left),y:parseFloat(panel.style.top),width:parseFloat(panel.style.width),height:parseFloat(panel.style.height)}:{x:rect.x,y:rect.y,width:rect.width,height:rect.height};}
  function save(){try{localStorage.setItem(key,JSON.stringify(currentBox()));}catch{}}
  try{const stored=JSON.parse(localStorage.getItem(key));if(stored&&['x','y','width','height'].every(k=>Number.isFinite(stored[k])))apply(stored);}catch{}
  function start(event,mode){
    if(event.button!==0||mode==='drag'&&event.target.closest('button'))return;
    const rect=panel.getBoundingClientRect();active={id:event.pointerId,mode,startX:event.clientX,startY:event.clientY,x:rect.x,y:rect.y,width:rect.width,height:rect.height};
    event.currentTarget.setPointerCapture(event.pointerId);panel.classList.add('moving');event.preventDefault();
  }
  function move(event){if(!active||event.pointerId!==active.id)return;const dx=event.clientX-active.startX,dy=event.clientY-active.startY;
    apply(active.mode==='drag'?{...active,x:active.x+dx,y:active.y+dy}:{...active,width:active.width+dx,height:active.height+dy});event.preventDefault();}
  function end(event){if(!active||event.pointerId!==active.id)return;save();panel.classList.remove('moving');active=null;}
  head.addEventListener('pointerdown',event=>start(event,'drag'));resize.addEventListener('pointerdown',event=>start(event,'resize'));
  for(const target of [head,resize]){target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);}
  resize.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const rect=panel.getBoundingClientRect(),step=event.shiftKey?40:10;apply({x:rect.x,y:rect.y,width:rect.width+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),height:rect.height+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});save();event.preventDefault();});
  reset.onclick=()=>{panel.removeAttribute('style');try{localStorage.removeItem(key);}catch{}};
  window.addEventListener('resize',()=>{if(panel.style.left){apply(currentBox());save();}});
})();
