(()=>{
const get=id=>document.getElementById(id);let defaults={};
const fill=prompts=>{for(const kind of ['translation','outline','explanation'])get(kind+'Prompt').value=prompts[kind];};
get('settingsToggle').onclick=async()=>{get('settingsPanel').hidden=false;get('settingsNotice').textContent='';try{const response=await fetch('/api/settings');if(!response.ok)throw Error('设置加载失败');const data=await response.json();defaults=data.defaults;fill(data.prompts);get('settingsToken').disabled=!data.can_edit_token;get('settingsTokenSave').disabled=!data.can_edit_token;get('settingsTokenState').textContent=(data.token_configured?'已配置 Token。':'尚未配置 Token。')+(data.can_edit_token?'原值不会显示；留空不修改。':'请在电脑localhost页面替换 Token。');}catch(error){get('settingsNotice').textContent=error.message;}};
const close=()=>{get('settingsPanel').hidden=true;get('settingsToken').value='';get('settingsToggle').focus();};
get('settingsClose').onclick=close;document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!get('settingsPanel').hidden)close();});
get('settingsDefaults').onclick=()=>{fill(defaults);get('settingsNotice').textContent='已填入默认值，点击保存后生效。';};
async function save(url,data,button){button.disabled=true;try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'保存失败');get('settingsNotice').textContent='已保存';return true;}catch(error){get('settingsNotice').textContent=error.message;return false;}finally{button.disabled=false;}}
get('settingsSave').onclick=()=>save('/api/settings',{prompts:Object.fromEntries(['translation','outline','explanation'].map(kind=>[kind,get(kind+'Prompt').value]))},get('settingsSave'));
get('settingsTokenSave').onclick=async()=>{const token=get('settingsToken').value.trim();if(!token){get('settingsNotice').textContent='请填写新 Token';return;}if(!confirm('确认替换电脑上两讲共用的 API Token？'))return;const ok=await save('/api/settings/token',{token},get('settingsTokenSave'));get('settingsToken').value='';if(ok)get('settingsTokenState').textContent='已配置 Token；原值不会显示。';};
})();
