import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';

const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const state={categories:[],drinks:[],variants:[],categoryId:null,drinkId:null,variantId:null};
const esc=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function showStatus(text){$('status').textContent=text;$('status').hidden=!text}
function activeVariants(){return state.variants.filter(v=>v.drink_id===state.drinkId).sort((a,b)=>a.sort_order-b.sort_order)}
function currentVariant(){return state.variants.find(v=>v.id===state.variantId)}

function renderCategories(){
  $('categoryNav').replaceChildren(...state.categories.map(category=>{
    const button=document.createElement('button');button.className='chip'+(category.id===state.categoryId?' active':'');button.textContent=category.name;
    button.onclick=()=>{state.categoryId=category.id;state.drinkId=null;state.variantId=null;renderCategories();renderDrinks();$('recipePanel').hidden=true};return button;
  }));
}

function renderDrinks(){
  if(!state.categoryId){$('drinkNav').replaceChildren();return}
  const drinks=state.drinks.filter(d=>d.category_id===state.categoryId).sort((a,b)=>a.sort_order-b.sort_order);
  $('drinkNav').replaceChildren(...drinks.map(drink=>{
    const button=document.createElement('button');button.className='chip'+(drink.id===state.drinkId?' active':'');button.textContent=drink.name;button.onclick=()=>selectDrink(drink.id);return button;
  }));
}

function selectDrink(id){
  const drink=state.drinks.find(d=>d.id===id);if(!drink)return;
  state.categoryId=drink.category_id;state.drinkId=id;
  const variants=activeVariants();state.variantId=variants[0]?.id||null;
  renderCategories();renderDrinks();renderRecipe(true);
}

function renderRecipe(openNote=false){
  const drink=state.drinks.find(d=>d.id===state.drinkId),category=state.categories.find(c=>c.id===state.categoryId),variant=currentVariant();
  if(!drink||!variant){$('recipePanel').hidden=true;return}
  const variants=activeVariants();
  $('recipePanel').innerHTML=`<h2>${esc(drink.name)}</h2><div class="meta"><span class="tag">${esc(category?.name)}</span><span class="tag">${esc(variant.size)}</span><span class="tag">${esc(variant.temperature)}</span></div>${variants.length>1?`<div class="variant-tabs">${variants.map(v=>`<button data-variant="${v.id}" class="${v.id===variant.id?'active':''}">${esc(v.size)}・${esc(v.temperature)}</button>`).join('')}</div>`:''}<h3>製作手順</h3><ol class="steps">${variant.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>${variant.note?`<aside class="note-box"><h3>※ 注意事項</h3>${variant.note.split('\n').filter(Boolean).map(line=>`<p>${esc(line)}</p>`).join('')}</aside>`:''}`;
  $('recipePanel').hidden=false;
  $('recipePanel').querySelectorAll('[data-variant]').forEach(button=>button.onclick=()=>{state.variantId=button.dataset.variant;renderRecipe(true)});
  if(openNote&&variant.note)showNote(variant.note);
}

function showNote(note){
  $('noteDialogText').replaceChildren(...note.split('\n').filter(Boolean).map(line=>{const p=document.createElement('p');p.textContent=line;return p}));
  $('noteDialog').hidden=false;
}

function closeSearch(){$('searchDialog').hidden=true}
function runSearch(){
  const keyword=$('searchInput').value.trim().toLowerCase();if(!keyword)return;
  const matches=state.drinks.filter(d=>d.name.toLowerCase().includes(keyword));
  if(matches.length===1){closeSearch();selectDrink(matches[0].id);return}
  if(!matches.length){showStatus('找不到符合的手順，請換個關鍵字。');return}
  showStatus('');
  $('searchResults').replaceChildren(...matches.map(drink=>{
    const category=state.categories.find(c=>c.id===drink.category_id),button=document.createElement('button');
    const text=document.createElement('span');const strong=document.createElement('strong');const small=document.createElement('small');strong.textContent=drink.name;small.textContent=category?.name||'';text.append(strong,small);button.append(text,'›');button.onclick=()=>{closeSearch();selectDrink(drink.id)};return button;
  }));
  $('searchDialog').hidden=false;
}

$('searchToggle').onclick=()=>{const form=$('searchForm'),opening=form.hidden;form.hidden=!opening;$('searchInput').value='';closeSearch();showStatus('');if(opening)$('searchInput').focus()};
$('searchForm').onsubmit=e=>{e.preventDefault();runSearch()};
$('searchInput').oninput=()=>{if(!$('searchInput').value.trim())closeSearch()};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=closeSearch);
document.querySelectorAll('[data-note-close]').forEach(button=>button.onclick=()=>{$('noteDialog').hidden=true});

async function load(){
  showStatus('正在讀取最新手順…');
  const [categories,drinks,variants]=await Promise.all([
    sb.from('categories').select('id,code,name,sort_order').eq('is_active',true).order('sort_order'),
    sb.from('drinks').select('id,category_id,name,sort_order').eq('is_active',true).order('sort_order'),
    sb.from('recipe_variants').select('id,drink_id,size,temperature,steps,note,sort_order').eq('is_active',true).order('sort_order')
  ]);
  const error=categories.error||drinks.error||variants.error;
  if(error){showStatus('目前無法讀取最新手順，請通知門市管理員。');console.error(error);return}
  state.categories=categories.data;state.drinks=drinks.data;state.variants=variants.data;showStatus('');renderCategories();
}

load();
