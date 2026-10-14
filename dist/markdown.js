/* Parse Markdown locally and sanitize raw model HTML before display. */
function mathToken(src, display){
  const patterns=display?[/^\$\$([\s\S]+?)\$\$/, /^\\\[([\s\S]+?)\\\]/]:[/^\$(?!\$)([^\n$]+?)\$(?!\$)/, /^\\\(([\s\S]+?)\\\)/];
  for(const pattern of patterns){const match=src.match(pattern);if(match)return {type:display?'lectureMathBlock':'lectureMathInline',raw:match[0],text:match[1].trim(),display};}
}
function mathPlaceholder(token){return '<span class="lecture-math-source" data-display="'+(token.display?'true':'false')+'">'+String(token.text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</span>';}
marked.use({extensions:[
  {name:'lectureMathBlock',level:'block',start:src=>src.search(/\$\$|\\\[/),tokenizer(src){return mathToken(src,true);},renderer:mathPlaceholder},
  {name:'lectureMathInline',level:'inline',start:src=>src.search(/\$|\\[([]/),tokenizer(src){return mathToken(src,true)||mathToken(src,false);},renderer:mathPlaceholder}
]});
window.LectureMarkdown={render(text){
  const source=String(text??'').replace(/^\s*[•▪○]\s*\n\s*/gm,'- ').replace(/^\s*[•▪○]\s+/gm,'- ');
  const html=marked.parse(source,{gfm:true,breaks:true});
  const safe=DOMPurify.sanitize(html,{FORBID_TAGS:['style','iframe','object','embed','img'],FORBID_ATTR:['style']});
  const container=document.createElement('div');container.innerHTML=safe;
  container.querySelectorAll('.lecture-math-source').forEach(element=>{
    if(window.katex)katex.render(element.textContent,element,{displayMode:element.dataset.display==='true',throwOnError:false,trust:false,strict:'warn',maxExpand:1000,maxSize:20});
  });
  container.querySelectorAll('a').forEach(link=>{link.target='_blank';link.rel='noopener noreferrer';});
  container.querySelectorAll('table').forEach(table=>{const wrapper=document.createElement('div');wrapper.className='md-table-wrap';table.replaceWith(wrapper);wrapper.append(table);});
  return container.innerHTML;
}};
