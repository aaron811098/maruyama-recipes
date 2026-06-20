import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';

const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state={categories:[],drinks:[],variants:[],page:'add',dirty:false,addMode:'recipe',editMode:'recipe',sortMode:'categories'};
let confirmResolve=null;

function setDirty(value=true){state.dirty=value}
function showMessage(id,text){const element=$(id);if(!element)return;element.textContent=text;element.hidden=!text}
function setOption(group,value){group.querySelectorAll('[data-value]').forEach(button=>button.classList.toggle('active',button.dataset.value===value))}
function getOption(group){return group.querySelector('[data-value].active')?.dataset.value||''}
function categoryOptions(blank=true){return `${blank?'<option value="">請選擇分類</option>':''}${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}`}
function variantsForDrink(id){return state.variants.filter(v=>v.drink_id===id).sort((a,b)=>a.sort_order-b.sort_order)}
function drinkForVariant(v){return state.drinks.find(d=>d.id===v.drink_id)}

function ask({title,message,accept='確定',cancel='取消',danger=true}){
  $('confirmTitle').textContent=title;$('confirmMessage').textContent=message;$('confirmAccept').textContent=accept;$('confirmAccept').className=danger?'danger-button':'primary-button';
  document.querySelector('[data-confirm-cancel]:not(.dialog-backdrop)').textContent=cancel;$('confirmDialog').hidden=false;
  return new Promise(resolve=>confirmResolve=resolve);
}
function closeConfirm(result){$('confirmDialog').hidden=true;confirmResolve?.(result);confirmResolve=null}
document.querySelectorAll('[data-confirm-cancel]').forEach(button=>button.onclick=()=>closeConfirm(false));
$('confirmAccept').onclick=()=>closeConfirm(true);

async function guardLeave(action){
  if(!state.dirty){action();return}
  const leave=await ask({title:'尚未儲存',message:'目前輸入或修改的內容尚未儲存，確定要離開嗎？',accept:'放棄內容',cancel:'繼續編輯'});
  if(leave){setDirty(false);action()}
}
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue=''}});

async function refreshData(){
  const [categories,drinks,variants]=await Promise.all([
    sb.from('categories').select('*').order('sort_order'),sb.from('drinks').select('*').order('sort_order'),sb.from('recipe_variants').select('*').order('sort_order')
  ]);
  const error=categories.error||drinks.error||variants.error;if(error)throw error;
  state.categories=categories.data;state.drinks=drinks.data;state.variants=variants.data;
}

function formOptions(prefix,size='中杯',temperature='冰'){
  return `<label>杯型／尺寸<div id="${prefix}Size" class="option-row"><button type="button" data-value="中杯">中杯</button><button type="button" data-value="大杯">大杯</button><button type="button" data-value="特大杯">特大杯</button></div></label><label>冷熱<div id="${prefix}Temp" class="option-row two"><button type="button" data-value="冰">冰</button><button type="button" data-value="熱">熱</button></div></label>`;
}
function bindOptions(prefix,size='中杯',temperature='冰'){
  const sizeGroup=$(`${prefix}Size`),tempGroup=$(`${prefix}Temp`);setOption(sizeGroup,size);setOption(tempGroup,temperature);
  [...sizeGroup.querySelectorAll('button'),...tempGroup.querySelectorAll('button')].forEach(button=>button.onclick=()=>{setOption(button.parentElement,button.dataset.value);setDirty()});
}
function bindDirty(form){form.querySelectorAll('input,select,textarea').forEach(element=>element.addEventListener('input',()=>setDirty()))}

function renderAdd(){
  $('adminMain').innerHTML=`<h1 class="page-title">新增資料</h1><div class="segmented"><button data-add-mode="category">新增分類</button><button data-add-mode="recipe">新增手順</button></div><div id="addBody"></div>`;
  document.querySelectorAll('[data-add-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.addMode===state.addMode);button.onclick=()=>guardLeave(()=>{state.addMode=button.dataset.addMode;renderAdd()})});
  if(state.addMode==='category')renderAddCategory();else renderAddRecipe();
}
function renderAddCategory(){
  $('addBody').innerHTML=`<form id="categoryForm" class="form-card"><label>分類名稱<input id="categoryName" placeholder="例：CITY CAFE" required></label><button class="primary-button full">儲存分類</button><div id="addMessage" class="message" hidden></div></form>`;
  const form=$('categoryForm');bindDirty(form);form.onsubmit=async event=>{event.preventDefault();const name=$('categoryName').value.trim(),code=`CAT_${Date.now().toString(36).toUpperCase()}`;const {error}=await sb.from('categories').insert({name,code,sort_order:(state.categories.length+1)*10});if(error)return showMessage('addMessage',error.message);setDirty(false);await refreshData();renderAdd();showMessage('addMessage','分類已新增')};
}
function renderAddRecipe(){
  $('addBody').innerHTML=`<form id="recipeForm" class="form-card"><label>分類<select id="addCategory" required>${categoryOptions()}</select></label><label>飲品名稱<input id="addName" required></label>${formOptions('add')}<label>製作手順<textarea id="addSteps" placeholder="每行一個步驟" required></textarea><span class="hint">每一行會成為一個編號步驟。</span></label><label>注意事項<textarea id="addNote" placeholder="沒有則留空"></textarea></label><button class="primary-button full">儲存手順</button><div id="addMessage" class="message" hidden></div></form>`;
  const form=$('recipeForm');bindOptions('add');bindDirty(form);form.onsubmit=saveNewRecipe;
}
async function saveNewRecipe(event){
  event.preventDefault();const categoryId=$('addCategory').value,name=$('addName').value.trim();if(!categoryId||!name)return;
  let drink=state.drinks.find(d=>d.category_id===categoryId&&d.name===name);
  if(!drink){const result=await sb.from('drinks').insert({category_id:categoryId,name,sort_order:(state.drinks.filter(d=>d.category_id===categoryId).length+1)*10}).select().single();if(result.error)return showMessage('addMessage',result.error.message);drink=result.data}
  const payload={drink_id:drink.id,size:getOption($('addSize')),temperature:getOption($('addTemp')),steps:$('addSteps').value.split('\n').map(x=>x.trim()).filter(Boolean),note:$('addNote').value.trim()||null,sort_order:(variantsForDrink(drink.id).length+1)*10};
  const {error}=await sb.from('recipe_variants').insert(payload);if(error)return showMessage('addMessage',error.message);setDirty(false);await refreshData();renderAdd();showMessage('addMessage','手順已新增');
}

function renderEdit(){
  $('adminMain').innerHTML=`<h1 class="page-title">修改資料</h1><div class="segmented"><button data-edit-mode="category">分類修改</button><button data-edit-mode="recipe">手順修改</button></div><div id="modifyBody"></div>`;
  document.querySelectorAll('[data-edit-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.editMode===state.editMode);button.onclick=()=>guardLeave(()=>{state.editMode=button.dataset.editMode;renderEdit()})});
  if(state.editMode==='category')renderEditCategory();else renderEditRecipe();
}
function renderEditCategory(){
  $('modifyBody').innerHTML=`<label>選擇分類<select id="categoryEditSelect">${categoryOptions()}</select></label><div id="categoryEditBody"><div class="empty-state">請先選擇要修改的分類</div></div>`;
  const select=$('categoryEditSelect');let selectedId='';
  const showCategory=id=>{
    selectedId=id;select.value=id;const category=state.categories.find(c=>c.id===id);
    if(!category){$('categoryEditBody').innerHTML='<div class="empty-state">請先選擇要修改的分類</div>';return}
    $('categoryEditBody').innerHTML=`<form id="categoryEditForm" class="form-card"><label>分類名稱<input id="categoryEditName" value="${esc(category.name)}" required></label><button class="primary-button full">儲存修改</button><div id="categoryEditMessage" class="message" hidden></div></form>`;
    const form=$('categoryEditForm');bindDirty(form);form.onsubmit=async event=>{event.preventDefault();const name=$('categoryEditName').value.trim();const {error}=await sb.from('categories').update({name}).eq('id',category.id);if(error)return showMessage('categoryEditMessage',error.message);setDirty(false);await refreshData();renderEdit();$('categoryEditSelect').value=category.id;$('categoryEditSelect').dispatchEvent(new Event('change'));showMessage('categoryEditMessage','分類修改已儲存')};
  };
  select.onchange=()=>{const nextId=select.value;select.value=selectedId;guardLeave(()=>showCategory(nextId))};
}
function renderEditRecipe(){
  $('modifyBody').innerHTML=`<div class="search-box"><input id="editSearch" placeholder="搜尋飲品名稱"><button id="editSearchButton">⌕</button></div><label>分類<select id="editCategory">${categoryOptions()}</select></label><div id="editResults" class="result-list"></div><div id="editBody"></div>`;
  $('editSearch').oninput=showSearchResults;$('editSearchButton').onclick=showSearchResults;$('editCategory').onchange=()=>showCategoryResults($('editCategory').value);
  $('editResults').innerHTML='<div class="empty-state">請搜尋或選擇分類後顯示手順項目</div>';
}
function resultButton(variant){
  const drink=drinkForVariant(variant),category=state.categories.find(c=>c.id===drink?.category_id);return `<button class="result-item" data-edit-id="${variant.id}"><span><strong>${esc(drink?.name)}</strong><small>${esc(category?.name)}｜${esc(variant.size)}・${esc(variant.temperature)}</small></span><span>›</span></button>`;
}
function displayResults(list){$('editBody').innerHTML='';$('editResults').innerHTML=list.length?list.map(resultButton).join(''):'<div class="empty-state">找不到手順項目</div>';$('editResults').querySelectorAll('[data-edit-id]').forEach(button=>button.onclick=()=>openEditor(button.dataset.editId))}
function showSearchResults(){const keyword=$('editSearch').value.trim().toLowerCase();if(!keyword){$('editResults').innerHTML='<div class="empty-state">請輸入搜尋關鍵字</div>';return}const drinkIds=state.drinks.filter(d=>d.name.toLowerCase().includes(keyword)).map(d=>d.id);displayResults(state.variants.filter(v=>drinkIds.includes(v.drink_id)))}
function showCategoryResults(categoryId){if(!categoryId){$('editResults').innerHTML='<div class="empty-state">選擇分類後顯示手順項目</div>';return}const ids=state.drinks.filter(d=>d.category_id===categoryId).map(d=>d.id);displayResults(state.variants.filter(v=>ids.includes(v.drink_id)))}
function openEditor(id){
  const variant=state.variants.find(v=>v.id===id),drink=drinkForVariant(variant);if(!variant||!drink)return;
  $('editResults').innerHTML='';$('editBody').innerHTML=`<form id="editForm" class="form-card"><input id="editVariantId" type="hidden" value="${variant.id}"><input id="editDrinkId" type="hidden" value="${drink.id}"><label>分類<select id="editFormCategory">${categoryOptions(false)}</select></label><label>飲品名稱<input id="editName" value="${esc(drink.name)}" required></label>${formOptions('modify')}<label>製作手順<textarea id="editSteps" required>${esc(variant.steps.join('\n'))}</textarea><span class="hint">每行一個步驟</span></label><label>注意事項<textarea id="editNote">${esc(variant.note||'')}</textarea></label><div class="form-actions"><button class="primary-button">儲存修改</button><button id="deleteButton" type="button" class="outline-button" style="color:var(--red);border-color:var(--red)">刪除手順</button></div><div id="editMessage" class="message" hidden></div></form>`;
  $('editFormCategory').value=drink.category_id;bindOptions('modify',variant.size,variant.temperature);const form=$('editForm');bindDirty(form);form.onsubmit=saveEdit;$('deleteButton').onclick=deleteCurrent;
}
async function saveEdit(event){
  event.preventDefault();const variantId=$('editVariantId').value,drinkId=$('editDrinkId').value;
  const drinkResult=await sb.from('drinks').update({category_id:$('editFormCategory').value,name:$('editName').value.trim()}).eq('id',drinkId);if(drinkResult.error)return showMessage('editMessage',drinkResult.error.message);
  const variantResult=await sb.from('recipe_variants').update({size:getOption($('modifySize')),temperature:getOption($('modifyTemp')),steps:$('editSteps').value.split('\n').map(x=>x.trim()).filter(Boolean),note:$('editNote').value.trim()||null}).eq('id',variantId);if(variantResult.error)return showMessage('editMessage',variantResult.error.message);
  setDirty(false);await refreshData();renderEdit();showMessage('editMessage','修改已儲存');
}
async function deleteCurrent(){
  const id=$('editVariantId').value,drinkId=$('editDrinkId').value,name=$('editName').value.trim();
  const confirmed=await ask({title:'確定刪除手順？',message:`刪除後無法復原，確定要刪除「${name}」嗎？`,accept:'確定刪除',cancel:'取消'});if(!confirmed)return;
  const {error}=await sb.from('recipe_variants').delete().eq('id',id);if(error)return showMessage('editMessage',error.message);
  const remaining=await sb.from('recipe_variants').select('*',{count:'exact',head:true}).eq('drink_id',drinkId);if(!remaining.error&&remaining.count===0)await sb.from('drinks').delete().eq('id',drinkId);
  setDirty(false);await refreshData();renderEdit();
}

function renderSort(){
  $('adminMain').innerHTML=`<h1 class="page-title">排序管理</h1><div class="segmented"><button data-sort-mode="categories">分類排序</button><button data-sort-mode="recipes">手順排序</button></div><div id="sortBody"></div>`;
  document.querySelectorAll('[data-sort-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.sortMode===state.sortMode);button.onclick=()=>guardLeave(()=>{state.sortMode=button.dataset.sortMode;renderSort()})});
  if(state.sortMode==='categories')renderCategorySort();else renderRecipeSort();
}
function sortRows(items,label){return `<div class="sort-list">${items.map((item,index)=>`<div class="sort-item" data-sort-id="${item.id}"><span class="handle">⠿</span><span class="order-badge">${index+1}</span><span class="sort-name">${esc(label(item))}</span><span class="sort-controls"><button data-move="up" aria-label="上移">↑</button><button data-move="down" aria-label="下移">↓</button></span></div>`).join('')}</div>`}
function bindSortMoves(){document.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{const row=button.closest('.sort-item'),sibling=button.dataset.move==='up'?row.previousElementSibling:row.nextElementSibling;if(!sibling)return;if(button.dataset.move==='up')row.parentElement.insertBefore(row,sibling);else row.parentElement.insertBefore(sibling,row);renumber();setDirty()})}
function renumber(){document.querySelectorAll('.sort-item .order-badge').forEach((badge,index)=>badge.textContent=index+1)}
function renderCategorySort(){$('sortBody').innerHTML=`<p class="hint">按住拖曳或使用箭頭可調整分類顯示順序</p>${sortRows(state.categories,c=>c.name)}<button id="saveSort" class="primary-button full" style="margin-top:18px">儲存分類排序</button>`;bindSortMoves();$('saveSort').onclick=()=>saveOrder('categories')}
function renderRecipeSort(){$('sortBody').innerHTML=`<label>分類<select id="sortCategory">${categoryOptions()}</select></label><p class="hint">選擇分類後調整飲品顯示順序</p><div id="recipeSortList"><div class="empty-state">請先選擇分類</div></div>`;$('sortCategory').onchange=()=>{const list=state.drinks.filter(d=>d.category_id===$('sortCategory').value).sort((a,b)=>a.sort_order-b.sort_order);$('recipeSortList').innerHTML=list.length?`${sortRows(list,d=>d.name)}<button id="saveSort" class="primary-button full" style="margin-top:18px">儲存手順排序</button>`:'<div class="empty-state">此分類尚無手順</div>';bindSortMoves();if($('saveSort'))$('saveSort').onclick=()=>saveOrder('drinks')}}
async function saveOrder(table){const ids=[...document.querySelectorAll('.sort-item')].map(row=>row.dataset.sortId);const results=await Promise.all(ids.map((id,index)=>sb.from(table).update({sort_order:(index+1)*10}).eq('id',id)));const error=results.find(r=>r.error)?.error;if(error)return alert(error.message);setDirty(false);await refreshData();renderSort()}

function showPage(page){state.page=page;document.querySelectorAll('[data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===page));if(page==='add')renderAdd();if(page==='edit')renderEdit();if(page==='sort')renderSort()}
document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>guardLeave(()=>showPage(button.dataset.page)));
$('employeeLink').onclick=event=>{event.preventDefault();guardLeave(()=>location.href='index.html')};
$('logoutButton').onclick=()=>guardLeave(async()=>{await sb.auth.signOut();location.reload()});

$('loginForm').onsubmit=async event=>{
  event.preventDefault();showMessage('loginMessage','');const email=`${$('username').value.trim().toLowerCase()}@maruyama.local`;
  const login=await sb.auth.signInWithPassword({email,password:$('password').value});if(login.error)return showMessage('loginMessage','帳號或密碼錯誤');
  const profile=await sb.from('profiles').select('role').eq('user_id',login.data.user.id).single();if(profile.data?.role!=='admin'){await sb.auth.signOut();return showMessage('loginMessage','此帳號沒有管理權限')}
  await start(login.data.user);
};
async function start(user){$('loginView').hidden=true;$('adminApp').hidden=false;$('currentUser').textContent=user.email.split('@')[0];await refreshData();showPage('add')}
const session=await sb.auth.getSession();if(session.data.session){const profile=await sb.from('profiles').select('role').eq('user_id',session.data.session.user.id).single();if(profile.data?.role==='admin')await start(session.data.session.user)}
