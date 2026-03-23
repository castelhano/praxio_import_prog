function appAlert(tipo, mensagem, options={}){
  try {document.querySelector('[data-type="appAlert"]').remove()}
  catch(e){}
  if(!options.hasOwnProperty('autodismiss')){options.autodismiss = true}
  let e = document.createElement('div');
  e.setAttribute('data-type','appAlert');
  e.style.zIndex = 100;
  let b = document.createElement('button');
  b.classList.add('btn-close');
  b.setAttribute('data-bs-dismiss','alert');
  e.classList.add('alert','slideIn','appAlert',`alert-${tipo}`,'alert-dismissible','fade','show','mb-0');
  e.innerHTML = mensagem; 
  e.appendChild(b);
  document.body.appendChild(e);
  if(options.autodismiss){setTimeout(function() {e.remove()}, 5000)}
}