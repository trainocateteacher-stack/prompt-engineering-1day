(function () {
  'use strict';
  const root = document.getElementById('benchmarks');
  if (!root) return;
  const data = JSON.parse(root.querySelector('#benchmark-data').textContent);
  const chart = root.querySelector('#bench-chart');
  const scope = root.querySelector('#bench-scope');
  const metric = root.querySelector('#bench-metric');
  const legend = root.querySelector('#bench-legend');
  const detail = root.querySelector('#bench-detail');
  const caption = root.querySelector('#bench-caption');
  let selected = 'B';
  const ns = 'http://www.w3.org/2000/svg';
  const colors = {sol:'var(--accent)', gemini:'#b75b08', claude:'#9456b7'};
  function make(tag, attrs, text) {
    const el = document.createElementNS(ns,tag);
    for (const [k,v] of Object.entries(attrs || {})) el.setAttribute(k,String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function choose(id) { selected=id; draw(); }
  function draw() {
    const visible = data.filter(d => scope.value==='all' || d.family==='sol');
    if (!visible.some(d=>d.id===selected)) selected=visible[0].id;
    const w = Math.max(280,chart.getBoundingClientRect().width-2);
    const h = w < 520 ? 330 : 380;
    const m = {l:55,r:28,t:36,b:70};
    const field = metric.value;
    const step = field==='wait' ? 50 : 20;
    const maxX = Math.ceil(Math.max(...visible.map(d=>d[field]))*1.1/step)*step;
    const maxY = Math.ceil(Math.max(...visible.map(d=>d.index))*1.05/20)*20;
    const x = v => m.l+(w-m.l-m.r)*v/maxX;
    const y = v => h-m.b-(h-m.b-m.t)*v/maxY;
    const svg=make('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-labelledby':'bench-svg-title bench-svg-desc'});
    svg.append(make('title',{id:'bench-svg-title'},field==='wait'?'回答開始までの待ち時間と総合指数':'出力速度と総合指数'));
    svg.append(make('desc',{id:'bench-svg-desc'},visible.map(d=>`${d.model} ${d.setting}：指数${d.index}、回答開始${d.wait}秒、出力${d.speed}token/s`).join('。')));
    for(let i=0;i<=3;i++) {
      const value=maxY*i/3, py=y(value);
      svg.append(make('line',{x1:m.l,y1:py,x2:w-m.r,y2:py,class:'bench-grid'}));
      svg.append(make('text',{x:m.l-10,y:py+4,'text-anchor':'end',class:'bench-tick'},Math.round(value)));
    }
    for(let i=0;i<=3;i++) {
      const value=maxX*i/3, px=x(value);
      svg.append(make('line',{x1:px,y1:m.t,x2:px,y2:h-m.b,class:'bench-grid'}));
      svg.append(make('text',{x:px,y:h-m.b+22,'text-anchor':i===3?'end':'middle',class:'bench-tick'},Math.round(value)));
    }
    svg.append(make('text',{x:m.l,y:19,class:'bench-axis-title'},'総合指数 v5.0（高いほどよい）'));
    svg.append(make('text',{x:(m.l+w-m.r)/2,y:h-14,'text-anchor':'middle',class:'bench-axis-title'},field==='wait'?'回答開始まで（秒） → 長いほど遅い':'出力速度（token/s） → 大きいほど速い'));
    // 実測点だけを描く。異なる設定・モデルを結ぶ仮の曲線は描かない。
    visible.forEach(d=>{
      const isSelected=d.id===selected;
      const point=make('circle',{cx:x(d[field]),cy:y(d.index),r:isSelected?8:6,fill:colors[d.family],class:'bench-point',tabindex:0,role:'button','aria-pressed':isSelected,'aria-label':`${d.id} ${d.model} ${d.setting}、指数${d.index}`,'data-id':d.id,'data-selected':isSelected});
      point.append(make('title',{},`${d.model} (${d.setting})：指数${d.index}／${d.wait.toFixed(2)}秒／${d.speed}token/s`));
      point.addEventListener('click',()=>choose(d.id));
      point.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(d.id);}});
      svg.append(point);
      // 近接するHigh/Xhighのラベルは上下へ分ける。
      const dx = d.id==='B' ? -12 : 12;
      const dy = d.id==='B' ? 22 : -13;
      const name = scope.value==='sol' ? d.setting : d.id;
      let lx=x(d[field])+dx;
      const anchor = dx<0 ? 'end' : (lx>w-m.r-30?'end':'start');
      if (anchor==='end' && dx>0) lx=x(d[field])-12;
      svg.append(make('text',{x:lx,y:y(d.index)+dy,'text-anchor':anchor,class:'bench-point-label'},name));
    });
    chart.replaceChildren(svg);
    legend.replaceChildren();
    visible.forEach(d=>{
      const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-pressed',String(d.id===selected));
      const swatch=document.createElement('span');swatch.className='bench-swatch';swatch.style.background=colors[d.family];swatch.setAttribute('aria-hidden','true');
      btn.append(swatch,document.createTextNode(scope.value==='sol'?d.setting:`${d.id} ${d.model} (${d.setting})`));
      btn.addEventListener('click',()=>choose(d.id));legend.append(btn);
    });
    const d=data.find(d=>d.id===selected);
    detail.textContent=`${d.id}　${d.model} (${d.setting})：総合指数 ${d.index} ／ HLE-Diamond ${d.hle}% ／ 回答開始 ${d.wait.toFixed(2)}秒 ／ 出力 ${d.speed} token/s`;
    caption.textContent = field==='wait'
      ? '左ほど回答開始が速く、上ほど総合指数が高い位置です。総合指数は推論専用の得点ではありません。'
      : '右ほど文章の出力が速い位置です。回答が始まる前の待ち時間は含まないため、総所要時間の速さとは一致しません。';
    root.querySelector('#bench-chart-title').textContent=scope.value==='sol'?'同じモデルで、推論量を変えたとき':'モデル・推論設定ごとの得点と速度';
  }
  scope.addEventListener('change',draw);metric.addEventListener('change',draw);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(draw).observe(chart);
  draw();
})();
