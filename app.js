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
  const editor = CodeMirror.fromTextArea($('editor'), {mode:'text/x-java',theme:'lark',lineNumbers:true,indentUnit:4,tabSize:4,indentWithTabs:false,lineWrapping:false,matchBrackets:true,autoCloseBrackets:true});
  const documents = new Map(files.map(file=>[file.name, CodeMirror.Doc(file.content, file.name.endsWith('.java')?'text/x-java':null)]));
  editor.swapDoc(documents.get(active));
  editor.setOption('extraKeys', {'Ctrl-S': download, 'Cmd-S': download, 'Ctrl-Space': autocomplete});
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
      button.setAttribute('aria-current', String(file.name === active));
      const icon = document.createElement('span'); icon.className='file-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent=file.name.endsWith('.java')?'☕':'▤';
      const name = document.createElement('span'); name.className='filename'; name.textContent=file.name;
      button.append(icon,name); button.addEventListener('click',()=>openFile(file.name)); list.appendChild(button);
    }
  }
  let hintMarks=[];
  function renderOutline() {
    const box=$('outline'), hints=$('hint-list'); box.replaceChildren(); hints.replaceChildren();
    hintMarks.forEach(mark=>mark.clear()); hintMarks=[];
    if (!active.endsWith('.java')) { $('show-hints').textContent='Hints'; return; }
    const parsed=LarkJava.parseJava(editor.getValue()), symbols=parsed.symbols;
    $('show-hints').textContent=parsed.warnings.length ? `Hints (${parsed.warnings.length})` : 'Hints';
    for (const warning of parsed.warnings) {
      const line=Math.max(0,Math.min(editor.lineCount()-1,warning.line-1)), text=editor.getLine(line), range=LarkJava.diagnosticRange(text,warning.column);
      if (range && warning.code!=='unbalanced-brace') hintMarks.push(editor.markText({line,ch:range.start},{line,ch:range.end},{className:'warning-underline',title:warning.message}));
      const button=document.createElement('button'); button.type='button'; button.className='hint-row';
      button.textContent=`Line ${warning.line}: ${warning.message}`;
      button.addEventListener('click',()=>{editor.setCursor({line,ch:range?.start||0});editor.focus();}); hints.append(button);
    }
    if (!parsed.warnings.length) { const empty=document.createElement('p'); empty.textContent='No basic hints found.'; hints.append(empty); }
    if (!symbols.length) { const empty=document.createElement('span'); empty.className='outline-empty'; empty.textContent='No symbols yet'; box.append(empty); return; }
    for (const symbol of symbols) {
      const button=document.createElement('button'); button.type='button'; button.className='outline-row';
      button.textContent=symbol.name + (symbol.kind==='method'||symbol.kind==='ctor' ? (symbol.detail||'()') : '');
      button.title=symbol.kind; button.style.paddingLeft=(10+Math.min(symbol.indent,4)*10)+'px';
      button.addEventListener('click',()=>{editor.setCursor({line:Math.max(0,symbol.line-1),ch:0});editor.focus();}); box.append(button);
    }
  }
  function openFile(name) {
    if (!files.some(file=>file.name===name)) return;
    save(); active=name; switching=true; editor.swapDoc(documents.get(name)); switching=false;
    $('active-file').textContent=active; renderFiles(); renderOutline(); save(); editor.refresh(); updateCursor();
    if (window.matchMedia('(max-width: 650px)').matches) { $('sidebar').hidden=true; $('toggle-files').setAttribute('aria-expanded','false'); editor.refresh(); }
  }
  let outlineTimer;
  editor.on('change', () => { if (switching) return; current().content=editor.getValue(); notice('Saving…'); clearTimeout(timer); timer=setTimeout(save,250); clearTimeout(outlineTimer); outlineTimer=setTimeout(renderOutline,350); });
  function updateCursor() { const p=editor.getCursor(); $('cursor-status').textContent=`Ln ${p.line+1}, Col ${p.ch+1}`; }
  editor.on('cursorActivity', updateCursor);
  function download() {
    save(); const file=current(); const url=URL.createObjectURL(new Blob([file.content],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url; link.download=file.name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('download').addEventListener('click',download);
  function autocomplete(cm) {
    if (!active.endsWith('.java')) return;
    const cursor=cm.getCursor(), line=cm.getLine(cursor.line); let start=cursor.ch;
    while (start>0 && /[\w$]/.test(line[start-1])) start--;
    const prefix=line.slice(start,cursor.ch);
    const symbols=LarkJava.parseJava(cm.getValue()).symbols.map(item=>item.name);
    const list=[...new Set([...LarkJava.keywords,...LarkJava.typeWords,...symbols])].filter(word=>word.startsWith(prefix) && word!==prefix).sort().slice(0,100);
    if (list.length) CodeMirror.showHint(cm,()=>({list,from:CodeMirror.Pos(cursor.line,start),to:cursor}),{completeSingle:false});
  }
  $('undo').addEventListener('click',()=>editor.undo()); $('redo').addEventListener('click',()=>editor.redo());
  $('find').addEventListener('click',()=>CodeMirror.commands.find(editor));
  function setHints(open) { $('hints').hidden=!open; $('show-hints').setAttribute('aria-expanded',String(open)); editor.refresh(); }
  $('show-hints').addEventListener('click',()=>setHints($('hints').hidden)); $('close-hints').addEventListener('click',()=>setHints(false));
  $('format').addEventListener('click',()=>{
    if (!active.endsWith('.java')) { notice('Open a Java file to format it.'); return; }
    const before=editor.getValue(), after=LarkJava.beautifyJava(before,{indentSize:4});
    if (before!==after) editor.replaceRange(after,{line:0,ch:0},editor.posFromIndex(before.length),'+format');
    editor.focus();
  });
  for (const snippet of LarkJava.snippets) {
    if (!snippet.text) continue;
    const option=document.createElement('option'); option.value=snippet.id; option.textContent=snippet.label; $('snippets').append(option);
  }
  $('snippets').addEventListener('change',()=>{
    const snippet=LarkJava.snippets.find(item=>item.id===$('snippets').value); $('snippets').value='';
    if (snippet?.text) { editor.replaceSelection(snippet.text,'end','+assist'); editor.focus(); }
  });
  $('export-project').addEventListener('click',()=>{
    save(); const url=URL.createObjectURL(new Blob([JSON.stringify({format:'lark-web-project',version:1,files,active},null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download='lark-project.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('import-project').addEventListener('click',()=>$('project-input').click());
  $('project-input').addEventListener('change',async event=>{
    const file=event.target.files[0]; event.target.value=''; if (!file) return;
    try {
      if (file.size>8_388_608) throw new Error('Project file is too large.');
      const data=JSON.parse(await file.text());
      if (data?.format!=='lark-web-project'||data.version!==1||!Array.isArray(data.files)||!data.files.length||data.files.length>100||!data.files.every(f=>f&&validName(f.name)&&typeof f.content==='string')||new Set(data.files.map(f=>f.name.toLowerCase())).size!==data.files.length) throw new Error('This is not a valid Lark Web project.');
      if (!confirm('Replace this browser workspace with the imported project? Download a backup first if needed.')) return;
      files=data.files.map(({name,content})=>({name,content})); documents.clear();
      for (const item of files) documents.set(item.name,CodeMirror.Doc(item.content,item.name.endsWith('.java')?'text/x-java':null));
      active=files.some(item=>item.name===data.active)?data.active:files[0].name; damaged=false; openFile(active);
    } catch (error) { notice(error instanceof SyntaxError?'This is not a valid Lark Web project.':error.message); }
  });
  function showNew() { $('filename').value=''; $('file-error').textContent=''; $('new-dialog').showModal(); $('filename').focus(); }
  $('new-file').addEventListener('click',showNew); $('add-file').addEventListener('click',showNew);
  $('cancel-new').addEventListener('click',()=>$('new-dialog').close());
  $('new-form').addEventListener('submit',event=>{
    event.preventDefault(); let name=$('filename').value.trim(); if (!name.includes('.')) name += '.java';
    if (!validName(name)) { $('file-error').textContent='Enter a valid file name without folders.'; return; }
    if (files.length>=100) { $('file-error').textContent='This workspace has reached its file limit.'; return; }
    if (files.some(file=>file.name.toLowerCase()===name.toLowerCase())) { $('file-error').textContent='A file with that name already exists.'; return; }
    files.push({name,content:''}); documents.set(name,CodeMirror.Doc('',name.endsWith('.java')?'text/x-java':null)); $('new-dialog').close(); openFile(name); editor.focus();
  });
  $('delete-file').addEventListener('click',()=>{
    if (files.length===1) { notice('Keep at least one file in the workspace.'); return; }
    if (!confirm(`Delete ${active} from this browser?`)) return;
    documents.delete(active); files=files.filter(file=>file.name!==active); active=files[0].name; openFile(active);
  });
  $('import-file').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',async event=>{
    const selected=[...event.target.files]; event.target.value=''; let imported=0;
    for (const file of selected) {
      if (!validName(file.name) || file.size>1_048_576 || files.length>=100 || files.some(existing=>existing.name.toLowerCase()===file.name.toLowerCase())) continue;
      try { const content=await file.text(); files.push({name:file.name,content}); documents.set(file.name,CodeMirror.Doc(content,file.name.endsWith('.java')?'text/x-java':null)); imported++; } catch (_) { /* Leave unreadable files untouched. */ }
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
  $('active-file').textContent=active; renderFiles(); renderOutline(); editor.refresh();
  notice(damaged ? 'Saved workspace could not be opened. Download your files; browser saving is paused.' : 'Ready');
})();
