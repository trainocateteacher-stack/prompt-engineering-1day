(function () {
  'use strict';
  const root=document.getElementById('benchmarks');
  if(!root)return;
  const data=JSON.parse(root.querySelector('#benchmark-data').textContent);
  const chart=root.querySelector('#bench-chart'),scope=root.querySelector('#bench-scope'),metric=root.querySelector('#bench-metric'),score=root.querySelector('#bench-score');
  const legend=root.querySelector('#bench-legend'),detail=root.querySelector('#bench-detail'),caption=root.querySelector('#bench-caption'),missing=root.querySelector('#bench-unscored');
  let selected='B';
  const ns='http://www.w3.org/2000/svg',colors={sol:'var(--accent)',openai:'var(--accent)',gemini:'#b75b08',claude:'#9456b7'};
  const number=(v,suffix='')=>Number.isFinite(v)?v.toLocaleString('ja-JP',{maximumFractionDigits:2})+suffix:'未公表';
  const name=d=>d.plot_name||(d.family==='sol'?`GPT-6.1 Sol (${d.setting})`:d.model.replace('Claude ',''));
  function make(tag,attrs,text){const el=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs||{}))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;}
  function choose(id){selected=id;draw();}
  function draw(){
    const visible=data.filter(d=>scope.value==='all'||d.family==='sol');
    if(!visible.some(d=>d.id===selected))selected=visible[0].id;
    const field=metric.value,yf=score.value;
    const plotted=visible.filter(d=>Number.isFinite(d[yf])&&Number.isFinite(d[field]));
    const unscored=visible.filter(d=>!Number.isFinite(d[yf])||!Number.isFinite(d[field]));
    const w=Math.max(scope.value==='all'?1000:280,chart.getBoundingClientRect().width-2),h=scope.value==='all'?510:(w<520?330:380);
    const m={l:56,r:34,t:50,b:70},step=field==='wait'?100:50;
    const maxX=Math.max(step,Math.ceil(Math.max(...visible.map(d=>d[field]||0))*1.05/step)*step);
    const maxY=Math.max(20,Math.ceil(Math.max(...plotted.map(d=>d[yf]))/20)*20);
    const x=v=>m.l+(w-m.l-m.r)*v/maxX,y=v=>h-m.b-(h-m.b-m.t)*v/maxY;
    const yTitle=yf==='index'?'総合指数 v5.0（高いほどよい）':'HLE-Diamond 正答率（%）';
    const svg=make('svg',{width:w,height:h,viewBox:`0 0 ${w} ${h}`,role:'img','aria-labelledby':'bench-svg-title bench-svg-desc'});
    svg.append(make('title',{id:'bench-svg-title'},`${yTitle}と${field==='wait'?'回答開始まで':'出力速度'}`));
    svg.append(make('desc',{id:'bench-svg-desc'},plotted.map(d=>`${d.model} ${d.setting}：${number(d[yf])}、回答開始${number(d.wait,'秒')}、出力${number(d.speed,'token/s')}`).join('。')));
    for(let v=0;v<=maxY;v+=20){svg.append(make('line',{x1:m.l,y1:y(v),x2:w-m.r,y2:y(v),class:'bench-grid'}));svg.append(make('text',{x:m.l-10,y:y(v)+4,'text-anchor':'end',class:'bench-tick'},v));}
    const divisions=w<520?3:5;
    for(let i=0;i<=divisions;i++){const v=maxX*i/divisions;svg.append(make('line',{x1:x(v),y1:m.t,x2:x(v),y2:h-m.b,class:'bench-grid'}));svg.append(make('text',{x:x(v),y:h-m.b+22,'text-anchor':i===divisions?'end':'middle',class:'bench-tick'},Math.round(v)));}
    svg.append(make('text',{x:m.l,y:22,class:'bench-axis-title'},yTitle));
    svg.append(make('text',{x:(m.l+w-m.r)/2,y:h-16,'text-anchor':'middle',class:'bench-axis-title'},field==='wait'?'回答開始まで（秒） → 長いほど遅い':'出力速度（token/s） → 大きいほど速い'));
    const points=plotted.map(d=>({d,px:x(d[field]),py:y(d[yf])}));
    points.forEach(({d,px,py})=>{
      const point=make('circle',{cx:px,cy:py,r:d.id===selected?8:6,fill:colors[d.family],class:'bench-point',tabindex:0,role:'button','aria-label':`${d.model} ${d.setting} ${yTitle} ${d[yf]}`,'data-id':d.id,'data-selected':d.id===selected});
      point.append(make('title',{},`${d.model} (${d.setting})：${number(d.index)}／HLE ${number(d.hle,'%')}／${number(d.wait,'秒')}／${number(d.speed,'token/s')}`));
      point.addEventListener('click',()=>choose(d.id));point.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(d.id);}});svg.append(point);
    });
    chart.replaceChildren(svg);
    // ラベルの実寸で空き位置を選び、近接した点にもモデル名を表示する。
    const occupied=[],overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    const ordered=[...points].sort((a,b)=>(b.d.id===selected)-(a.d.id===selected)||a.py-b.py||a.px-b.px);
    ordered.forEach(({d,px,py})=>{
      const text=make('text',{class:'bench-point-label',visibility:'hidden'},scope.value==='sol'?d.setting:name(d));svg.append(text);
      const box=text.getBBox(),width=box.width,height=box.height;let best=null;
      for(const dy of[-13,25,-36,48,-59,71,-82,94,-105,117])for(const dx of[12,-12,48,-48]){
        let left=dx<0?px+dx-width:px+dx;left=Math.max(8,Math.min(left,w-width-8));
        const baseline=Math.max(44,Math.min(py+dy,h-m.b-6)),rect={x:left-4,y:baseline-height-1,w:width+8,h:height+5};
        const collisions=occupied.reduce((s,r)=>s+overlap(rect,r),0);
        const dotPenalty=points.reduce((s,p)=>s+(p.d.id!==d.id&&p.px>rect.x-6&&p.px<rect.x+rect.w+6&&p.py>rect.y-6&&p.py<rect.y+rect.h+6?4000:0),0);
        const cost=collisions*100+dotPenalty+Math.abs(left-px)+Math.abs(baseline-py);
        if(!best||cost<best.cost)best={left,baseline,rect,cost};
      }
      text.setAttribute('x',best.left);text.setAttribute('y',best.baseline);text.removeAttribute('visibility');occupied.push(best.rect);
      const tx=Math.max(best.left,Math.min(px,best.left+width)),ty=best.baseline-height/2;
      if(Math.hypot(tx-px,ty-py)>24)svg.insertBefore(make('line',{x1:px,y1:py,x2:tx,y2:ty,class:'bench-leader'}),text);
    });
    missing.replaceChildren();
    if(unscored.length){
      const heading=document.createElement('h4');heading.textContent=`${yf==='index'?'総合指数 v5.0':'HLE-Diamond'}未公表：速度のみ表示（${unscored.length}条件）`;missing.append(heading);
      const note=document.createElement('p');note.className='sub';note.textContent='得点を0にせず、この欄でモデル名と確認できた速度を示しています。';missing.append(note);
      unscored.forEach(d=>{
        const row=document.createElement('button');row.type='button';row.className='bench-speed-row';row.dataset.id=d.id;row.setAttribute('aria-pressed',String(d.id===selected));
        const label=document.createElement('span');label.textContent=`${name(d)} (${d.setting})`;
        const track=document.createElement('span');track.className='bench-speed-track';const bar=document.createElement('span');bar.className='bench-speed-bar';bar.style.width=`${Math.max(0,d[field]||0)/maxX*100}%`;bar.style.background=colors[d.family];track.append(bar);
        const value=document.createElement('span');value.textContent=number(d[field],field==='wait'?'秒':' token/s');row.append(label,track,value);row.addEventListener('click',()=>choose(d.id));missing.append(row);
      });
    }
    legend.replaceChildren();visible.forEach(d=>{
      const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-pressed',String(d.id===selected));
      const swatch=document.createElement('span');swatch.className='bench-swatch';swatch.style.background=colors[d.family];swatch.setAttribute('aria-hidden','true');btn.append(swatch,document.createTextNode(scope.value==='sol'?d.setting:`${d.model} (${d.setting})${d[yf]===null?'：得点未公表':''}`));btn.addEventListener('click',()=>choose(d.id));legend.append(btn);
    });
    const d=data.find(d=>d.id===selected);detail.textContent=`${d.model} (${d.setting})：総合指数 ${number(d.index)} ／ HLE-Diamond ${number(d.hle,'%')} ／ 回答開始 ${number(d.wait,'秒')} ／ 出力 ${number(d.speed,' token/s')}`;
    caption.textContent=`${plotted.length}点を表示${unscored.length?`、得点未公表${unscored.length}条件は速度のみ表示`:''}。`+(field==='wait'?'左ほど回答開始が速い位置です。':'右ほど文章の出力が速い位置です。回答開始前の待ち時間は含みません。');
    root.querySelector('#bench-chart-title').textContent=scope.value==='sol'?'同じモデルで、推論量を変えたとき':'一覧表のモデル・シリーズを比較';
  }
  scope.addEventListener('change',draw);metric.addEventListener('change',draw);score.addEventListener('change',draw);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(draw).observe(chart);draw();
})();
