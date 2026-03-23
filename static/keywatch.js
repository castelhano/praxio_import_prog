/*
* Gerencia atalhos de teclado e implementa tabulacao ao pressionar Enter em formularios
**
* @version  6.5
* @since    05/08/2024
* @release  28/02/2026 [add changeContext()]
* @release  23/01/2026 [removido suporte para i18n.js]
* @release  31/10/2025 [removido suporte para teclas de acento ex ~ ´]
* @ver < 6  [add keyup, multiple shortcuts at same trigger, priority as useCapture]
* @author   Rafael Gustavo Alves {@email castelhano.rafael@gmail.com}
* @example  appKeyMap = new Keywatch();
* @example  appKeyMap.bind('ctrl+e', ()=>{...do something})
* @example  appKeyMap.bind('g+i;alt+i', ()=>{...do something}, {desc: 'Responde tanto no g+i quanto no alt+i', context: 'userModal'})
* @example  appKeyMap.bind('g+i', (ev, shortcut)=>{...do something}, {keyup: true, keydown: false, useCapture: true})
--
* Versao 6.3 adiciona tratamento para conflito em acionamento de teclas de atalho acidental quado foco esta no input impondo a seguinte restriçao:
* atalhos que usam teclas basicas como modificador, se o foco estiver num input nao sera acionado de maneira imediata, nestes casos espera que tecla de 
* confirmacao (this.composedTrigger default:';') apareca logo na sequencia, ou seja o atalho 'c+o' sera acionado imediato quando foco nao estiver em input,
* se foco estiver no input, aguarda prossima tecla, se for composedTrigger (default ;) aciona atalho
* Versao 6.3 para desativar todos os atalhos em determinado elemento atribua data-keywatch="escape", ex: <textarea data-keywatch="escape"></textarea>,
* neste caso desativa qualquer analise de atalhos 
*/
class Keywatch{
    constructor(options={}){
        this.handlers = {};                        // armazena shortcuts vinculados ao document
        
        this.pressed = [];                         // lista com reclas precionadas
        this.contexts = {                          // contextos disponiveis
            all: 'Atalhos Globais',
            default: 'Atalhos Base',
        };
        this.contextPool = [];                     // pilha de contextos, ao usar setContext('foo') adiciona contexto na pilha e setContex() carrega ultimo contexto
        this.composedMatch = [];                   // ['c,o', ['keydown','keyup']]
        this.locked = false;                       // se true desativa atalhos gerados fora da classe, usado para travar atalhos quando usando o shortcutModal
        this.context = 'default';                  // contexto ativo
        this.handlerOptions = {                    // configuracoes padrao para shortcut
            context: 'default',
            desc: '',
            icon: null,
            element: document,
            origin: undefined,
            keydown: true,
            keyup: false,
            group: null,
            display: true,
            preventDefault: true,
            useCapture: false,
            composed: false                         // composed sera true caso usado modificadores nao convencionais, definido automaticamente na lib
        }
        this.defaultOptions = { // configuracoes padrao para classe
            splitKey: '+',
            separator: ';',
            tabOnEnter: true,
            shortcutMaplist: "alt+k", // atalho para exibir mapa com atalhos disposiveis para pagina, altere para null para desabilitar
            shortcutMaplistDesc: "Exibe lista de atalhos disponíveis na página",
            shortcutMaplistIcon: "bi bi-alt",
            shortcutMaplistOnlyContextActive: true, // se true so mostra atalhados do contexto ativo (alem do all)
            composedTrigger: ';', // caractere que confirma atalhos 'composed' (atalhos com modificadores nao convencionais)
            composedListener: ()=>{}, // funcao eh acionada sempre que um atalho composed eh iniciado ou finalizado
            reserve: {},    // lista de atalhos reservados, sera usada apenas para notificacao pelo metodo avail
            //Definicoes de estilizacao
            shortcutModalClasslist: 'w-100 h-100 border-2 border-secondary bg-dark-subtle mt-3',
            searchInputClasslist: 'form-control form-control-sm',
            searchInputPlaceholder: 'Critério pesquisa',
            contextLabelClasslist: 'fs-8 text-body-tertiary position-absolute',
            contextLabelStyle: 'top: 22px; right: 25px;',
            modalTableClasslist: 'table table-sm table-bordered table-striped mt-2 fs-7',
            modalTableLabelClasslist: 'border rounded py-1 px-2 bg-dark-subtle text-body-secondary font-monospace',
            shortcutModalTableDetailClasslist: 'fit text-center px-3',
            shortcutModalTableDetailText: '<i class="bi bi-question-lg"></i>',
            shortcutModalTableDetailItemText: '<i class="bi bi-list d-block text-center pointer"></i>',
        }
        
        for(let k in this.defaultOptions){ // carrega configuracoes para classe
            if(options.hasOwnProperty(k)){this[k] = options[k]}
            else{this[k] = this.defaultOptions[k]}
        }
        
        this.modifier = {                  // itens para conversao de codigo
            'ctrl': 'control',
            '[space]': ' ',
            'esc': 'escape',
            '↑': 'arrowup',
            '↓': 'arrowdown',
            '→': 'arrowright',
            '←': 'arrowleft',
        }
        
        // adiciona listeners basico para document
        this._addEvent(document, 'keydown', (ev)=>{ this._eventHandler(ev, this) }, false);
        this._addEvent(document, 'keyup', (ev)=>{this._eventHandler(ev, this)}, false);
        this._addEvent(document, 'change', (ev)=>{this.pressed = []}, false);
        this._addEvent(window, 'focus', (ev)=>{this.pressed = []}, false); // previne teclas travadas ao receber foco, evita conflito ao mudar de tela
        //--
        if(this.shortcutMaplist){this.bind(this.shortcutMaplist, ()=>{this.showKeymap()}, {origin: 'Keywatch JS', context: 'all', icon: this.shortcutMaplistIcon, desc: this.shortcutMaplistDesc})}
        this._createModal();
    }
    
    // adiciona listener no objeto
    _addEvent(element, event, method, useCapture=false){element.addEventListener(event, method, useCapture)}
    
    // roda os methods atrelados aos shortcuts e retorna quantidade de matchs
    _eventsMatch(scope, ev){
        let prev = false; // prevent default
        let count = 0;
        let list = [];
        // composedMatch carregado na interacao anterior, seguido do trigger
        // this.composedMatch armazena scope e evento encontrado, ex ['c,o', ['keydown']], lista deve buscar no evento encontrado (ou em ambos)
        if(scope == this.composedTrigger && this.composedMatch.length > 0){ scope = this.composedMatch[0] }
        list = [
            ...this.handlers?.[ev.type]?.[this.context]?.[scope] || [],
            ...this.handlers?.[ev.type]?.['all']?.[scope] || []
        ];
        list.forEach((el)=>{
            if(el.element == document || el.element == ev.target){
                let composed = this.composedMatch.length == 0 || !this.composedMatch[1].includes(ev.type);
                if(
                    el.composed && 
                    composed && 
                    ['input', 'textarea','select'].includes(ev.target.nodeName.toLowerCase())
                ){ 
                    // em caso de teclas composed (que usa modificadores nao convencionais) apenas
                    // salva scope em this.composedMatch e aguarda acionamento do trigger na proxima
                    // tecla precionada. Precisa validar se nao existe entrada para outro evento (keyup ou keydown)
                    this.composedMatch = (this.composedMatch.length === 0) 
                    ? [scope, [ev.type]] 
                    : (this.composedMatch[1].includes(ev.type) 
                    ? this.composedMatch 
                    : (this.composedMatch[1].push(ev.type), this.composedMatch));
                    this.composedListener(true, scope);
                    count += 1;
                    return;
                }
                el.method(ev, el);
                count += 1;
                prev = prev || el.preventDefault;
                this.composedMatch = (this.composedMatch.length > 0 && this.composedMatch[1].includes(ev.type)) 
                ? (this.composedMatch[1].length === 1 ? [] : [this.composedMatch[0], this.composedMatch[1].filter(type => type !== ev.type)]) 
                : this.composedMatch;
                if(this.composedMatch.length == 0){this.composedListener(false, scope);}
            }
        })        
        if(prev){ev.preventDefault()}
        return count;
    }
    
    // trata os eventos e busca correspondente em this.handlers
    _eventHandler(ev){
    // se instancia estiver travada (this.locked) ou se elemento foco tiver "data-keywatch="escape" termina codigo sem realizar nenhuma analise de atalho
        if(this.locked || ev.target.dataset?.keywatch?.toLowerCase() == 'escape'){return false}
        if(ev.type == 'keydown'){ // no keydown verifica se tecla esta listada em pressed, se nao faz push da tecla
            let key = this._normalize(ev.key);
            if(ev.key && !this.pressed.includes(key)){this.pressed.push(key)}
            let scope = this.pressed.length == 1 ? this.pressed[0] : [this.pressed.slice(0, -1).sort(), this.pressed[this.pressed.length - 1]].join();
            let find = this._eventsMatch(scope, ev); // Busca (e executa) match de composicao
            if(!find && ev.key != this.composedTrigger && this.composedMatch.length > 0){ this.composedMatch = []; this.composedListener(false, scope);}
            if(!find && this.tabOnEnter && ev.key == 'Enter' && ev.target.form && (ev.target.nodeName === 'INPUT' || ev.target.nodeName === 'SELECT')){
                // caso nao localizado atalho, verifica se ev.key eh Enter e se originou de input / select
                // neste caso, implementa tabulacao pela tecla enter, ao instanciar opbeto (ou em qualquer momento) defina tabOnEnter = false para desativar tabulacao
                // para desativar tabulacao em um input especifico atribua data-keywatch='none' para nao tabular (nao submete form) ou data-keywatch='default' para submit
                try{
                    // Adicione attr data-keywatch='default' no input para assumir evento padrao (submit do form)
                    if(ev.target.dataset?.keywatch == 'default'){return false}
                    ev.preventDefault();
                    if(ev.target.dataset?.keywatch == 'none'){return false} // Adicione attr data-keywatch='none' no input que queira evitar tabulacao no enter mais nao submeter
                    let form = ev.target.form;
                    let index = Array.prototype.indexOf.call(form, ev.target);
                    let nextIndex = index + 1;
                    if(nextIndex < form.elements.length && this._isFieldFocusable(form.elements[nextIndex])){
                        form.elements[nextIndex].focus();
                    }
                    else{
                        // busca proximo elemento focavel apos o index
                        for(let i = nextIndex; i < form.elements.length; i++){
                            if(this._isFieldFocusable(form.elements[i])){
                                form.elements[i].focus();
                                break;
                            }
                        }
                    }
                }catch(e){}
            }
        }
        else if(ev.type == 'keyup'){ // no keyup remove a tecla de this.pressed
            let scope = this.pressed.length == 1 ? this.pressed[0] : [this.pressed.slice(0, -1).sort(), this.pressed[this.pressed.length - 1]].join();            
            this._eventsMatch(scope, ev); // Busca match de composicao
            this._removeKeyFromPressed(ev);
            if(ev.key.toLowerCase() == 'escape'){ this.pressed = [] }
        }
    }
    _normalize(str){ return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/çÇ/g, "c").toLowerCase() }
    
    // valida se campo pode receber foco
    _isFieldFocusable(element){
        return !element?.disabled && !element?.readOnly && element?.offsetParent != null && element?.tabIndex >= 0;
    }
    
    // remove tecla de this.pressed no keyup, funciona com qualquer modificador (alt, ctrl, shift, meta)
    _removeKeyFromPressed(ev){
        let keyToRemove = this._normalize(ev.key);
        let index = this.pressed.indexOf(keyToRemove);
        
        // se nao encontrou pela chave normalizada, tenta pelos codigos conhecidos
        // necessario para modificadores que retornam caracteres especiais em keyup (ex: alt+1+2 retorna simbolo em ev.key)
        if(index === -1){
            const modifierCodes = {
                'AltLeft': 'alt',
                'AltRight': 'alt',
                'ControlLeft': 'control',
                'ControlRight': 'control',
                'ShiftLeft': 'shift',
                'ShiftRight': 'shift',
                'MetaLeft': 'meta',
                'MetaRight': 'meta'
            };
            if(modifierCodes[ev.code]){
                keyToRemove = modifierCodes[ev.code];
                index = this.pressed.indexOf(keyToRemove);
            }
        }
        if(index > -1){ this.pressed.splice(index, 1) }
    }
    
    // cria entrada em this.handlers
    _spread(event){
        const sortComparator = (a, b) => a.useCapture === b.useCapture ? 0 : a.useCapture ? -1 : 1;
        
        if(event.keydown){
            if(!this.handlers.hasOwnProperty('keydown')){this.handlers.keydown = {}}
            if(!this.handlers.keydown.hasOwnProperty(event.context)){this.handlers.keydown[event.context] = {}}
            if(!this.handlers.keydown[event.context].hasOwnProperty(event.scope)){this.handlers.keydown[event.context][event.scope] = []}
            this.handlers.keydown[event.context][event.scope].push(event);
            this.handlers.keydown[event.context][event.scope].sort(sortComparator);
        }
        if(event.keyup){
            if(!this.handlers.hasOwnProperty('keyup')){this.handlers.keyup = {}}
            if(!this.handlers.keyup.hasOwnProperty(event.context)){this.handlers.keyup[event.context] = {}}
            if(!this.handlers.keyup[event.context].hasOwnProperty(event.scope)){this.handlers.keyup[event.context][event.scope] = []}
            this.handlers.keyup[event.context][event.scope].push(event);
            this.handlers.keyup[event.context][event.scope].sort(sortComparator);
        }
    }
    // retorna (caso exista) shortcut com a combinacao informada, se omitido context busca no default
    getShortcut(scope, options={}){
        options = Object.assign({keydown: true, keyup: false, context: 'default'}, options)
        let ajustedScope = this._getScope(scope).flat().join(',');
        let type = options.keydown ? 'keydown' : options.keyup ? 'keyup' : false;
        if([undefined, 0].includes(this.handlers?.[type]?.[options.context]?.[ajustedScope])) return false;
        return this.handlers[type][options.context][ajustedScope][0];
    }
    // move atalho de contexto
    changeContext(scope, newContext, options = {}) {
        const t = this.getShortcut(scope, options);
        if (!t) return;        
        const adjScope = this._getScope(scope).flat().join(), oldCtx = t.context;        
        for (const type of ['keydown', 'keyup']) {
            if (!t[type]) continue;            
            // 1. Remove item antigo
            const oldL = this.handlers[type]?.[oldCtx]?.[adjScope];
            if (oldL) {
                const i = oldL.indexOf(t);
                if (i !== -1) oldL.splice(i, 1);                
                // Limpeza da arvore do atalho
                if (!oldL.length) {
                    delete this.handlers[type][oldCtx][adjScope];
                    let empty = true;
                    for (const _ in this.handlers[type][oldCtx]) { empty = false; break; }
                    if (empty) delete this.handlers[type][oldCtx];
                }
            }            
            // 2. Insercao e ordenacao
            const list = ((this.handlers[type][newContext] ||= {})[adjScope] ||= []);
            t.context = newContext;
            list.push(t);
            list.sort((a, b) => b.useCapture - a.useCapture);
        }
        t.context = newContext;
    }
    // retorna lista com modificadores e key ex. getScope('g+u+i') = [['g','u'], 'i'], mods retornados classificados
    _getScope(scope) {
        let keys = scope.split(this.splitKey);
        let index = keys.lastIndexOf('');        
        while (index >= 0) { // trata existencia de + no scope ex: "ctrl++" ou "+"
            keys[index - 1] += this.splitKey;
            keys.splice(index, 1);
            index = keys.lastIndexOf('');
        }        
        // mapeia modificadores e separa a tecla final
        const mapped = keys.map(el => this.modifier[el] || el);
        const mainKey = mapped.pop(); // extrai tecla de acionamento        
        return [mapped.sort(), mainKey];
    }

    
    // retorna array com shortcuts ex: ('g+i;g+u') => ['g+i','g+u']
    _getMultipleKeys(scope){
        let keys = scope.split(this.separator); // cria array com blocos
        let index = keys.lastIndexOf('');
        for(; index >= 0;){ // Trata existencia de ; no scope ex: "ctrl+;"
            keys[index - 1] += ';';
            keys.splice(index, 1);
            index = keys.lastIndexOf('');
        }
        return keys;
    }
    
    // cria novo shortcut
    bind(scope, method, options={}){
        let keysList = this._getMultipleKeys(scope); // separa entradas multiplas ex: bind('g+i;g+u') => ['g+i','g+u']
        
        keysList.forEach((el, index)=>{ // percorre todas as entradas do escopo e prepara extrutura do shortcut
            let event = {...this.handlerOptions};
            for(let k in event){if(options.hasOwnProperty(k)){event[k] = options[k]}}
            [event.mods, event.key] = this._getScope(el);
            event.scope = [...event.mods, event.key].flat().join();
            event.schema = scope;
            event.method = method;
            if(index > 0){event.display = false} // evita de exibir duplicatas no modal de atalhos para atalhos multiplos
            let defaultMods = ['control','shift','alt','meta'];
            event.composed = event.mods.some(m => !defaultMods.includes((m || '').toLowerCase()));
            this._spread(event);
        })
    }
    unbind(scope, options={}){ // remove atalho especificado
        if(!options.hasOwnProperty('type')){ // se options.type omitido, chama recursivamente metodo tanto para keydown quando keyup
            ['keydown','keyup'].forEach((el)=>{
                options.type = el;
                this.unbind(scope, options)
            })
            return;
        }
        if(!options.context){ // se nao informado context, remove atalho de todos os contextos
            for(let k in this.contexts){ // chama recursivamente metodo para todos os escopos
                options.context = k;
                this.unbind(scope, options)
            }
            return;
        }
        if(!this.contexts.hasOwnProperty(options.context)){return} // se contexto informado nao existe termina codigo
        
        let entries = this._getScope(scope).flat().join();
        let matchs = this.handlers?.[options.type]?.[options.context]?.[entries] || [];
        if(matchs.length == 0){return false} // se nenhum match, termina bloco
        let residual = []; // armazena atalhos que nao seram afetados
        let count = 0;
        matchs.forEach((el, index)=>{
            if(options.element && options.element != el.element){residual.push(el)}
            else{count += 1;}
        })
        if(count == 0){return}
        if(residual.length > 0){this.handlers[options.type][options.context][entries] = residual}
        else{ // limpa entradas vazias apos remocao
            delete this.handlers[options.type][options.context][entries];
            if(Object.keys(this.handlers[options.type][options.context]).length === 0){delete this.handlers[options.type][options.context]}
            if(Object.keys(this.handlers[options.type]).length === 0){delete this.handlers[options.type]}
        }
        return true;
    }
    unbindContext(context){if(this.contexts.hasOwnProperty(context)){ // apaga TODAS as entradas para o contexto informado
        for(let type in this.handlers){
            if(this.handlers[type].hasOwnProperty(context)){delete this.handlers[type][context]}
            if(Object.keys(this.handlers[type]).length === 0){delete this.handlers[type]}
        }
    }}
    unbindGroup(group){ // remove todas as entradas do grupo especificado
        if(!group){return}
        for(let type in this.handlers){
            for(let context in this.handlers[type]){
                for(let scope in this.handlers[type][context]){
                    const original = this.handlers[type][context][scope];
                    const residual = original.filter(el => el.group !== group);
                    
                    if(residual.length > 0){
                        this.handlers[type][context][scope] = residual;
                    } else {
                        delete this.handlers[type][context][scope];
                    }
                }
                // limpa contextos vazios
                if(Object.keys(this.handlers[type][context]).length === 0){
                    delete this.handlers[type][context];
                }
            }
            // limpa tipos vazios
            if(Object.keys(this.handlers[type]).length === 0){
                delete this.handlers[type];
            }
        }
    }
    unbindAll(){this.handlers = {}} // limpa todos os atalhos
    overwrite(scope, method, options){ // sobregrava atalho informado (se existir), caso nao exista apenas cria novo atalho
        Object.assign(options, this.handlerOptions);
        this.unbind(scope, options);
        this.bind(scope, method, options);
    }
    getContext(){return this.context}
    addContext(context, desc=''){if(context && !this.contexts.hasOwnProperty(context)){this.contexts[context] = desc}}
    setContext(context, desc=''){
        // se nao informado contexto, assume ultimo contexto da pilha ou se vazio ajusta para default
        if(!context){ 
            this.context = this.contextPool.pop() || 'default';
            this.contextLabel.innerHTML = this.context;
            return;
        }
        if(!this.contexts.hasOwnProperty(context)){this.addContext(context, desc)} // Se novo contexto, chama metodo addContext
        else if(desc){this.contexts[context] = desc} // Desc pode ser alterado pelo metodo setContext
        this.contextPool.push(this.context);
        this.context = context;
        this.contextLabel.innerHTML = context;
    }
    updateContext(context, desc=''){if(this.contexts.hasOwnProperty(context)){this.contexts[context] = desc}}
    avail(scope, options={}){
        // retorna (bool) se shortcut esta disponivel, se nao informado contexto retorna true somente se shortcut disponivel em TODOS os contextos
        // se nao informado event.type assume 'keydown' como padrao
        // ## So deve ser usado para shortcut unico (sem entrada multipla)
        if(!options.hasOwnProperty('type')){options.type = 'keydown'}
        if(this.reserve.hasOwnProperty(scope)){console.log(this.reserve[scope])}
        scope = scope.replace(this.splitKey, ',');
        if(options.context){ // se informado contexto verifica se atalho existe no contexto
            if(!this.contexts.hasOwnProperty(options.context) || !this.handlers?.[options.type]?.[options.context]){return true}
            return !this.handlers[options.type][options.context].hasOwnProperty(scope);
        }
        else { // Se nao fornecido contexto, analisa todos os contextos para ver se entrada existe em algum
            for(let c in this.contexts){
                if(this.handlers?.[options.type]?.[c] && this.handlers[options.type][c].hasOwnProperty(scope)){return false}
            }
            return true;
        }
    }
    getReserve(){return this.reserve}
    duplicated(context='default'){ // retorna lista com detalhes dos schemas duplicados (leva em consideracao evento, contexto e elemento)
        let duplicatedList = [];
        for(let ev in this.handlers){
            for(let cx in this.handlers[ev]){
                for(let schema in this.handlers[ev][cx]){
                    if(this.handlers[ev][cx][schema].length > 1){
                        let unic = []
                        for(let sk in this.handlers[ev][cx][schema]){
                            let stringfy = JSON.stringify({event: ev, context: cx, schema: schema, element: this.handlers[ev][cx][schema][sk].element == window.document ? 'document' : this.handlers[ev][cx][schema][sk].element.id})
                            if(unic.includes(stringfy)){duplicatedList.push(JSON.parse(stringfy))}
                            else{unic.push(stringfy)}
                        }
                    }
                }
            }
        }
        return duplicatedList;
    }
    run(scope, options={}){ // executa atalho simulando que evento foi acionado ex appKeyMap.run('ctrl+c')
        let defaultOptions = {
            type: 'keydown',
            context: 'default',
            element: document
        }
        for(let k in defaultOptions){if(!options.hasOwnProperty(k)){options[k] = defaultOptions[k]}}
        if(this.handlers?.[options.type]?.[options.context]?.[scope.replace(this.splitKey, ',')]){
            this.handlers[options.type][options.context][scope.replace(this.splitKey, ',')].forEach((el)=>{
                if(el.element == options.element){el.method()}
            })
        }
    }
    showKeymap(){
        this._refreshMapTable();
        this.shortcutModal.showModal();
        this.locked = true;
        this.pressed = [];
    }
    _createModal(){
        this.shortcutModal = document.createElement('dialog'); this.shortcutModal.classList = this.shortcutModalClasslist;
        this.shortcutModal.onclose = ()=>{this.shortcutSearchInput.value = '';this.locked = false;} // Limpa input ao fechar modal e retorna contexto para default
        this.shortcutSearchInput = document.createElement('input');this.shortcutSearchInput.type = 'search';this.shortcutSearchInput.classList = this.searchInputClasslist;this.shortcutSearchInput.placeholder = this.searchInputPlaceholder;this.shortcutSearchInput.id = 'keywatch_shortcutSearchInput';
        this.shortcutSearchInput.oninput = (ev)=>{this._filterMapTable(ev)}
        this.contextLabel = document.createElement('span');this.contextLabel.classList = this.contextLabelClasslist;this.contextLabel.style = this.contextLabelStyle; this.contextLabel.innerHTML = this.context;
        this.shortcutModalTable = document.createElement('table');
        this.shortcutModalTable.classList = this.modalTableClasslist;
        this.shortcutModalTableThead = document.createElement('thead');
        this.shortcutModalTableTbody = document.createElement('tbody');
        this.shortcutModalTableThead.innerHTML = `<tr><th${!this.maplistShowCommands ? ' style="display: none;"' : ''}>Comando</th><th>Shortcut</th><th>Description</th><th class="${this.shortcutModalTableDetailClasslist}">${this.shortcutModalTableDetailText}</th></tr>`;
        this.shortcutModalTable.appendChild(this.shortcutModalTableThead);
        this.shortcutModalTable.appendChild(this.shortcutModalTableTbody);
        this.shortcutModal.appendChild(this.shortcutSearchInput);
        this.shortcutModal.appendChild(this.contextLabel);
        this.shortcutModal.appendChild(this.shortcutModalTable);
        document.body.appendChild(this.shortcutModal);
    }
    _refreshMapTable(source=this.handlers){ // atualiza tabela com shortcuts
        const fragment = document.createDocumentFragment();
        for(let type in source){ // percorre todos os types
            for(let context in source[type]){ // percorre todos os contextos
                // Se shortcutMaplistOnlyContextActive = true so mostra shortcuts do contexto ativo e do all 
                if(this.shortcutMaplistOnlyContextActive && (context != this.context && context != 'all')){continue}
                for(let entries in source[type][context]){ // percorre todos os atalhos no contexto
                    source[type][context][entries].forEach((el)=>{
                        if(!el.display){return}
                        let shortcut = el.schema;
                        // Ajusta alias para versao abreviada ex (control = ctrl)
                        for(let key in this.modifier){shortcut = shortcut.replaceAll(this.modifier[key].toLowerCase(), key.toLowerCase())} 
                        shortcut = this._humanize(shortcut);
                        let title = '';
                        for(let attr in el){
                            if(!['origin','context','keydown','keyup','preventDefault','useCapture'].includes(attr)){continue}
                            title += `${attr}: ${el[attr]}\n`
                        }
                        let desc = el?.icon ? `<i class="${el.icon} me-2"></i>` : '';
                        desc += el?.desc || '';

                        const tr = document.createElement('tr');

                        const tdShortcut = document.createElement('td');
                        tdShortcut.innerHTML = shortcut;
                        tr.appendChild(tdShortcut);

                        const tdDesc = document.createElement('td');
                        tdDesc.innerHTML = desc;
                        tr.appendChild(tdDesc);

                        const tdDetail = document.createElement('td');
                        tdDetail.title = title;
                        tdDetail.innerHTML = this.shortcutModalTableDetailItemText;
                        tr.appendChild(tdDetail);

                        fragment.appendChild(tr);
                    })
                }
            }
        }
        this.shortcutModalTableTbody.innerHTML = ''; // Limpa lista atual de atalhos
        this.shortcutModalTableTbody.appendChild(fragment);
    }
    _filterMapTable(ev){
        requestAnimationFrame(()=>{
            const term = this.shortcutSearchInput.value.toLowerCase().replace(/\s+/g, '');
            const htmlTagRegex = /<[^>]*>/g;
            const noBreakRegex = /&nbsp;/g;
            const trs = this.shortcutModalTableTbody.querySelectorAll('tr');
            
            trs.forEach((tr) => {
                const tds = tr.querySelectorAll('td');
                // usa textContent ao invés de innerHTML para melhor performance
                let rowValue = '';
                for(let i = 0; i < tds.length; i++){
                    rowValue += tds[i].textContent.toLowerCase().replace(/\s+/g, '');
                }
                tr.style.display = rowValue.includes(term) ? 'table-row' : 'none';
            });
        })
    }
    
    _humanize(entry){ // recebe um schema de atalho e formata para exibicao na tabela de atalhos
        let entries = this._getMultipleKeys(entry);
        let formated = '';
        for(let i = 0; i < entries.length; i++){
            let schema = this._splitEntry(entries[i]);
            for(let j = 0; j < schema.length; j++){
                formated += `<small class="${this.modalTableLabelClasslist}">${schema[j].toUpperCase()}</small>`;
                if(j < schema.length - 1){formated += '+';}
            }
            if(i < entries.length - 1){formated += '&nbsp;&nbsp;ou&nbsp;&nbsp;';}
        }
        return formated;
    }
    _splitEntry(entry){ // retorna lista de caracteres de um shortcut. ex: 'g+i' = ['g', 'i']
        let keys = entry.split(this.splitKey); // cria array com blocos
        let index = keys.lastIndexOf('');
        for(; index >= 0;){ // trata conflito ao usar simbolo do splitKey no shortcut, ex splitKey = '+' e shortcut (alt++)
            keys[index - 1] += this.splitKey;
            keys.splice(index, 1);
            index = keys.lastIndexOf('');
        }
        return keys;
    }
    
}