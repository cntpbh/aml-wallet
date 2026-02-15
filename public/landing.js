var nav=document.getElementById('nav');
window.addEventListener('scroll',function(){nav.classList.toggle('scrolled',window.scrollY>40)});
var obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}})},{threshold:.12});
document.querySelectorAll('.ind-card,.p-card,.legal-card,.step,.price-card').forEach(function(el){el.classList.add('animate');obs.observe(el)});
document.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var t=document.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})})});

var verifyMode='code';
function setVerifyMode(mode){
verifyMode=mode;
document.querySelectorAll('.verify-tab').forEach(function(t){t.classList.toggle('active',t.dataset.mode===mode)});
var input=document.getElementById('verifyInput');
input.value='';
input.placeholder=mode==='code'?'DOC-XXXXXXXX-XXXX':'Hash SHA-256 do relatorio';
document.getElementById('verifyResult').className='verify-result';
}

function verifyDocument(){
var input=document.getElementById('verifyInput').value.trim();
var resultEl=document.getElementById('verifyResult');
var btn=document.getElementById('verifyBtn');
if(!input){resultEl.className='verify-result show fail';resultEl.innerHTML='<p style="color:var(--red)">Informe o codigo ou hash para verificacao.</p>';return}
btn.disabled=true;btn.textContent='Verificando...';
resultEl.className='verify-result';resultEl.innerHTML='';

if(verifyMode==='code'){
fetch('/api/blockchain/verify?code='+encodeURIComponent(input)).then(function(r){return r.json()}).then(function(data){
if(data.valid&&data.certificate){var c=data.certificate;
resultEl.className='verify-result show ok';
resultEl.innerHTML='<p style="color:var(--green);font-weight:700;margin-bottom:12px">&#10003; Documento Verificado &mdash; Autentico</p>'+
'<div class="vr-row"><span class="l">Certificado</span><span class="v">'+esc(c.code)+'</span></div>'+
'<div class="vr-row"><span class="l">Titulo</span><span class="v">'+esc(c.title||'')+'</span></div>'+
(c.hash?'<div class="vr-row"><span class="l">Hash SHA-256</span><span class="v">'+esc(c.hash)+'</span></div>':'')+
(c.blockchain_tx?'<div class="vr-row"><span class="l">Blockchain TX</span><span class="v"><a href="https://polygonscan.com/tx/'+esc(c.blockchain_tx)+'" target="_blank">'+esc(c.blockchain_tx).substring(0,20)+'...</a></span></div>':'')+
(c.ipfs_url?'<div class="vr-row"><span class="l">IPFS</span><span class="v"><a href="'+esc(c.ipfs_url)+'" target="_blank">Abrir</a></span></div>':'')+
(c.certified_pdf?'<div class="vr-row"><span class="l">Certificado PDF</span><span class="v"><a href="'+esc(c.certified_pdf)+'" target="_blank">Download</a></span></div>':'')+
'<div class="vr-row"><span class="l">Registrado em</span><span class="v">'+(c.created_at?new Date(c.created_at).toLocaleString('pt-BR'):'')+'</span></div>';
}else{resultEl.className='verify-result show fail';resultEl.innerHTML='<p style="color:var(--red)">Certificado nao encontrado na blockchain.</p><p style="color:var(--text-3);font-size:.8rem;margin-top:8px">Verifique se o codigo esta correto (formato: DOC-XXXXXXXX-XXXX).</p>';}
btn.disabled=false;btn.textContent='Verificar';
}).catch(function(err){resultEl.className='verify-result show fail';resultEl.innerHTML='<p style="color:var(--red)">Erro: '+esc(err.message)+'</p>';btn.disabled=false;btn.textContent='Verificar';});
}else{
fetch('/api/blockchain/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash:input})}).then(function(r){return r.json()}).then(function(data){
if(data.valid&&data.document){var d=data.document;
resultEl.className='verify-result show ok';
resultEl.innerHTML='<p style="color:var(--green);font-weight:700;margin-bottom:12px">&#10003; Hash Verificado &mdash; Documento Autentico</p>'+
'<div class="vr-row"><span class="l">Status</span><span class="v">'+esc(d.status||'REGISTRADO')+'</span></div>'+
'<div class="vr-row"><span class="l">Titulo</span><span class="v">'+esc(d.title||'')+'</span></div>'+
'<div class="vr-row"><span class="l">Hash</span><span class="v">'+esc(d.hash||input)+'</span></div>'+
(d.blockchain_tx?'<div class="vr-row"><span class="l">TX</span><span class="v"><a href="https://polygonscan.com/tx/'+esc(d.blockchain_tx)+'" target="_blank">'+esc(d.blockchain_tx).substring(0,20)+'...</a></span></div>':'')+
'<div class="vr-row"><span class="l">Registrado em</span><span class="v">'+(d.created_at?new Date(d.created_at).toLocaleString('pt-BR'):'')+'</span></div>';
}else{resultEl.className='verify-result show fail';resultEl.innerHTML='<p style="color:var(--red)">Hash nao encontrado na blockchain.</p>';}
btn.disabled=false;btn.textContent='Verificar';
}).catch(function(err){resultEl.className='verify-result show fail';resultEl.innerHTML='<p style="color:var(--red)">Erro: '+esc(err.message)+'</p>';btn.disabled=false;btn.textContent='Verificar';});
}
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// Event bindings (CSP-safe)
document.getElementById('verifyBtn').addEventListener('click',verifyDocument);
document.addEventListener('click',function(e){
var vm=e.target.closest('[data-vmode]');
if(vm){setVerifyMode(vm.dataset.vmode);return;}
var wa=e.target.closest('[data-action="copyWallet"]');
if(wa&&wa.dataset.wallet&&navigator.clipboard){
navigator.clipboard.writeText(wa.dataset.wallet).then(function(){
var cp=document.querySelector('.wallet-copy');if(cp)cp.textContent='Copiado!';
});}
});
