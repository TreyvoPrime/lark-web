(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE = 'lark-web-workspace-v1';
  const initial = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Lark!");\n    }\n}\n';
  const validName = name => typeof name === 'string' && name.length > 0 && name.length <= 100 && !/[\\/:*?"<>|\x00-\x1f]/.test(name) && !/^\.{1,2}$/.test(name) && !/[. ]$/.test(name);
  let files = [{name:'Main.java',content:initial}], active = 'Main.java', switching = false, timer, damaged = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (saved && Array.isArray(saved.files) && saved.files.length && saved.files.length <= 100 && saved.files.every(f => f && validName(f.name) && typeof f.content === 'string') && new Set(saved.files.map(f=>f.name.toLowerCase())).size === saved.files.length) {
      files = saved.files.map(({name,content})=>({name,content}));
      active = files.some(f=>f.name===saved.active) ? saved.active : files[0].name;
    } else if (saved) damaged = true;
  } catch (_) { damaged = true; }
  const editor = CodeMirror.fromTextArea($('editor'), {mode:'text/x-java',theme:'lark',lineNumbers:true,indentUnit:4,tabSize:4,indentWithTabs:false,lineWrapping:false});
  editor.setOption('extraKeys', {'Ctrl-S': download, 'Cmd-S': download});
  const current = () => files.find(file => file.name === active);
  function notice(message) { $('save-status').textContent = message; }
  function save() {
    clearTimeout(timer);
    if (damaged) { notice('Saved workspace could not be opened. Download your files; browser saving is paused.'); return; }
    try { localStorage.setItem(STORAGE, JSON.stringify({files,active})); notice('Saved in this browser'); }
    catch (_) { notice('Could not save in this browser. Download your files.'); }
  }
  function renderFiles() {
    const list = $('files'); list.replaceChildren();
    for (const file of files) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'file-row';
      button.setAttribute('role', 'listitem'); button.setAttribute('aria-current', String(file.name === active));
      const icon = document.createElement('span'); icon.className='file-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent=file.name.endsWith('.java')?'☕':'▤';
      const name = document.createElement('span'); name.className='filename'; name.textContent=file.name;
      button.append(icon,name); button.addEventListener('click',()=>openFile(file.name)); list.appendChild(button);
    }
  }
  function openFile(name) {
    if (!files.some(file=>file.name===name)) return;
    save(); active=name; switching=true; editor.setValue(current().content); editor.clearHistory(); switching=false;
    $('active-file').textContent=active; renderFiles(); save(); editor.refresh();
    if (window.matchMedia('(max-width: 650px)').matches) { $('sidebar').hidden=true; $('toggle-files').setAttribute('aria-expanded','false'); editor.refresh(); }
  }
  editor.on('change', () => { if (switching) return; current().content=editor.getValue(); notice('Saving…'); clearTimeout(timer); timer=setTimeout(save,250); });
  editor.on('cursorActivity', () => { const p=editor.getCursor(); $('cursor-status').textContent=`Ln ${p.line+1}, Col ${p.ch+1}`; });
  function download() {
    save(); const file=current(); const url=URL.createObjectURL(new Blob([file.content],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url; link.download=file.name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('download').addEventListener('click',download);
  function showNew() { $('filename').value=''; $('file-error').textContent=''; $('new-dialog').showModal(); $('filename').focus(); }
  $('new-file').addEventListener('click',showNew); $('add-file').addEventListener('click',showNew);
  $('cancel-new').addEventListener('click',()=>$('new-dialog').close());
  $('new-form').addEventListener('submit',event=>{
    event.preventDefault(); let name=$('filename').value.trim(); if (!name.includes('.')) name += '.java';
    if (!validName(name)) { $('file-error').textContent='Enter a valid file name without folders.'; return; }
    if (files.length>=100) { $('file-error').textContent='This workspace has reached its file limit.'; return; }
    if (files.some(file=>file.name.toLowerCase()===name.toLowerCase())) { $('file-error').textContent='A file with that name already exists.'; return; }
    files.push({name,content:''}); $('new-dialog').close(); openFile(name); editor.focus();
  });
  $('delete-file').addEventListener('click',()=>{
    if (files.length===1) { notice('Keep at least one file in the workspace.'); return; }
    if (!confirm(`Delete ${active} from this browser?`)) return;
    files=files.filter(file=>file.name!==active); active=files[0].name; openFile(active);
  });
  $('import-file').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',async event=>{
    const selected=[...event.target.files]; event.target.value=''; let imported=0;
    for (const file of selected) {
      if (!validName(file.name) || file.size>1_048_576 || files.length>=100 || files.some(existing=>existing.name.toLowerCase()===file.name.toLowerCase())) continue;
      try { files.push({name:file.name,content:await file.text()}); imported++; } catch (_) { /* Leave unreadable files untouched. */ }
    }
    if (imported) openFile(files.at(-1).name);
    else notice('No files opened. Check file names, size, and duplicates.');
  });
  $('toggle-files').addEventListener('click',()=>{ const panel=$('sidebar'); panel.hidden=!panel.hidden; $('toggle-files').setAttribute('aria-expanded',String(!panel.hidden)); editor.refresh(); });
  const narrow = window.matchMedia('(max-width: 650px)');
  function closeNarrowPanel(event) { if (event.matches) { $('sidebar').hidden=true; $('toggle-files').setAttribute('aria-expanded','false'); editor.refresh(); } }
  closeNarrowPanel(narrow); narrow.addEventListener('change', closeNarrowPanel);
  function setTheme(value) { document.documentElement.dataset.theme=value; $('theme').textContent=value==='light'?'Dark theme':'Light theme'; try { localStorage.setItem('lark-web-theme',value); } catch (_) {} }
  $('theme').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
  try { setTheme(localStorage.getItem('lark-web-theme')==='light'?'light':'dark'); } catch (_) { setTheme('dark'); }
  window.addEventListener('beforeunload',()=>{ if (!damaged) save(); });
  switching=true; editor.setValue(current().content); editor.clearHistory(); switching=false;
  $('active-file').textContent=active; renderFiles(); editor.refresh();
  notice(damaged ? 'Saved workspace could not be opened. Download your files; browser saving is paused.' : 'Ready');
})();
