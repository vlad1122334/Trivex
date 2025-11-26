import React, { useEffect, useMemo, useState } from 'react'
import logo from './assets/logo.png'

/** ================= Persistence & Utils ================= */
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
  clear: () => { try { localStorage.clear() } catch {} }
}
const fmt = (n, d=2)=> Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const ts = ()=> new Date().toLocaleTimeString();

/** ================= Data ================= */
const ASSETS=[
  { symbol:'TVX/UAH', seed:11, start:150 },
  { symbol:'CITY/UAH', seed:23, start:80 },
  { symbol:'SHOP/UAH', seed:37, start:220 },
  { symbol:'FOOD/UAH', seed:41, start:50 },
];

function mulberry32(a){ return function(){ var t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
function now10(){ return Math.floor(Date.now()/10000)*10000 }

function genCandles(seed,start,n=180){
  const rnd=mulberry32(seed); const out=[]; let last=start; let t=Date.now()-n*10000;
  for(let i=0;i<n;i++){
    const base=(rnd()-0.5)*0.5; const o=last, c=o+base;
    const h=Math.max(o,c)+Math.abs(base)*0.5; const l=Math.min(o,c)-Math.abs(base)*0.5;
    out.push({ t:Math.floor(t/10000)*10000, o, h, l, c }); last=c; t+=10000;
  }
  return out;
}

function makeInitialCharts(){ const m={}; for(const a of ASSETS) m[a.symbol]=genCandles(a.seed,a.start,180); return m; }

/** ================= Theme & Lang ================= */
function useTheme(){ const [theme,setTheme]=useState(store.get('theme','dark')); useEffect(()=>{ const r=document.documentElement; if(theme==='dark') r.classList.add('dark'); else r.classList.remove('dark'); store.set('theme',theme); },[theme]); return [theme,setTheme] }
function useLang(){ const [lang,setLang] = useState(store.get('lang','UKR')); useEffect(()=>store.set('lang',lang),[lang]); return [lang,setLang] }

const I18N = {
  UKR: {
    balance: 'Баланс', reset: 'Скинути', markets:'Ринки', portfolio:'Портфель', orders:'Ордери', activity:'Активність', leaders:'Лідери', news:'Новини', settings:'Налаштування',
    price:'Ціна', qty:'Кількість', buy:'Купити', sell:'Продати', youHold:'У вас', cost:'Вартість', proceeds:'Надходження',
    last:'Остання', candles:'Свічки', seconds10:'10с', miniDepth:'Стакан (мінімальний)',
    theme:'Тема', darkOn:'Темна • Вкл', lightOn:'Світла • Вкл', language:'Мова', ukr:'Українська', eng:'Англійська',
    notes:'Примітки', orderPanel:'Панель ордерів', depth:'Стакан', asset:'Актив', demo:'Демо',
    orderPlaced:'Ордер виконано', buyShort:'Купівля', sellShort:'Продаж', amount:'Сума', side:'Сторона',
    notesBullets: [
      '10-секундні свічки з живим оновленням.',
      'Вплив угод на ринок: ±1% на кожні 100 UAX.',
      'Темна/світла тема, компактний стакан.',
      'Поточна ціна відображається плаваючою лінією.'
    ]
  },
  ENG: {
    balance:'Balance', reset:'Reset', markets:'Markets', portfolio:'Portfolio', orders:'Orders', activity:'Activity', leaders:'Leaders', news:'News', settings:'Settings',
    price:'Price', qty:'Quantity', buy:'Buy', sell:'Sell', youHold:'You hold', cost:'Cost', proceeds:'Proceeds',
    last:'Last', candles:'Candles', seconds10:'10s', miniDepth:'Mini Depth',
    theme:'Theme', darkOn:'Dark • On', lightOn:'Light • On', language:'Language', ukr:'Ukrainian', eng:'English',
    notes:'Notes', orderPanel:'Order Panel', depth:'Depth', asset:'Asset', demo:'Demo',
    orderPlaced:'Order executed', buyShort:'Buy', sellShort:'Sell', amount:'Amount', side:'Side',
    notesBullets: [
      '10-second candles with live updates.',
      'Trade impact: ±1% per every 100 UAX.',
      'Dark/Light theme, compact depth.',
      'Floating line shows the current price.'
    ]
  }
};

/** ================= Live Market with Trade Impact ================= */





function useMarket(initial){
  const [charts, setCharts] = useState(() => {
    const cached = store.get('charts10', initial);
    const merged = { ...cached };
    for (const a of ASSETS) if (!merged[a.symbol]) merged[a.symbol] = genCandles(a.seed, a.start, 180);
    return merged;
  });

  const impactLeftRef = React.useRef(Object.fromEntries(ASSETS.map(a=>[a.symbol,0])));
  const impactStepRef = React.useRef(Object.fromEntries(ASSETS.map(a=>[a.symbol,0])));

  useEffect(()=>{
    const left = store.get('impactLeft', null);
    const step = store.get('impactPerTick', null);
    if (left) impactLeftRef.current = left;
    if (step) impactStepRef.current = step;
  }, []);

  useEffect(()=>{
    const id = setInterval(()=>{
      setCharts(prev => {
        const next = { ...prev };
        const bucketNow = now10();
        for (const sym of Object.keys(next)) {
          const arr = next[sym].slice();
          if (arr.length === 0) continue;
          let last = arr[arr.length-1];

          // Open new candle every 10s
          if (bucketNow > last.t) {
            arr.push({ t: bucketNow, o: last.c, h: last.c, l: last.c, c: last.c });
            if (arr.length > 360) arr.shift();
            last = arr[arr.length-1];
            // Clear impact at new candle
            impactLeftRef.current[sym] = 0;
            impactStepRef.current[sym] = 0;
          }

          // Motion
          const o = last.o;
          const prevC = last.c;
          const drift = Math.sin(Date.now()/22000) * (o * 0.0002);     // ~±0.02%
          const micro = (Math.random()-0.5) * (o * 0.0010);            // ~±0.10%
          const step = (impactLeftRef.current[sym] > 0) ? impactStepRef.current[sym] : 0;
          let c = prevC + step + drift + micro;

          // Update H/L explicitly each tick with soft envelope (no giant wicks but visible)
          let h = Math.max(last.h, c);
          let l = Math.min(last.l, c);
          // keep within ±0.25% around open to avoid huge wicks
          const cap = o * 0.0025;
          h = Math.min(h, o + cap);
          l = Math.max(l, o - cap);

          arr[arr.length-1] = { t: last.t, o, h, l, c: c + (Math.random()-0.5)*1e-7 }; // epsilon to force change
          next[sym] = arr;
        }
        store.set('charts10', next);
        store.set('impactLeft', impactLeftRef.current);
        store.set('impactPerTick', impactStepRef.current);
        return next;
      });
    }, 1000);
    return ()=> clearInterval(id);
  }, []);

  const applyImpact = (sym, qty, side, mode='QTY') => {
    const dir = side === 'BUY' ? +1 : -1;
    setCharts(prev => {
      const arr = prev[sym] || [];
      if (arr.length === 0) return prev;
      const last = arr[arr.length-1];
      const elapsed = Math.floor((Date.now() - last.t)/1000);
      const remaining = Math.max(1, 10 - (elapsed % 10));
      const price = last.c || last.o || ASSETS.find(a=>a.symbol===sym)?.start || 1;
      const totalDelta = price * 0.0005 * Math.max(0, qty||0) * dir;
      impactLeftRef.current[sym] = remaining;
      impactStepRef.current[sym] = totalDelta / remaining;
      store.set('impactLeft', impactLeftRef.current);
      store.set('impactPerTick', impactStepRef.current);
      return { ...prev };
    });
  };

  return [charts, applyImpact];
}

/** ================= UI Components ================= */
function ThemeIcon({ theme }){
  return theme==='dark' ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10 10h2v-3h-2v3zM4.22 19.78l1.8-1.8-1.8-1.79-1.79 1.79 1.79 1.8zM13 1h-2v3h2V1zm7.83 3.84l-1.79-1.79-1.8 1.79 1.8 1.8 1.79-1.8zM20 11v2h3v-2h-3zm-8 8a5 5 0 100-10 5 5 0 000 10z"/></svg>
  );
}

function Header({ t, theme, setTheme, balance, onReset }){
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-3 px-3 sm:px-4 border-b border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <img src={logo} alt="Trivex" className="header-logo w-7 h-7 sm:w-8 sm:h-8" />
        <div className="text-lg sm:text-xl font-semibold tracking-wide">TRIVEX</div>
        <span className="badge text-[10px] sm:text-xs">{t.demo}</span>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-2 text-xs sm:text-sm flex-wrap">
        <div className="truncate max-w-[160px] sm:max-w-none">
          {t.balance}: <b>{fmt(balance,2)} UAX</b>
        </div>
        <button onClick={onReset} className="btn-reset text-[10px] sm:text-xs">{t.reset}</button>
        <button
          className="theme-icon-btn switch-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? t.darkOn : t.lightOn}
        >
          <ThemeIcon theme={theme} />
        </button>
      </div>
    </div>
  )
}


function TopTabs({ t, active, setActive }){
  const tabs = [t.markets, t.portfolio, t.orders, t.activity, t.leaders, t.news, t.settings];
  const map = {
    [t.markets]:'Markets',
    [t.portfolio]:'Portfolio',
    [t.orders]:'Orders',
    [t.activity]:'Activity',
    [t.leaders]:'Leaders',
    [t.news]:'News',
    [t.settings]:'Settings',
  };
  return (
    <div className="flex gap-2 p-2 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      {tabs.map(lbl => (
        <button key={lbl} onClick={()=> setActive(map[lbl])} className={`tab ${active===map[lbl]?'tab-active':''}`}>{lbl}</button>
      ))}
    </div>
  )
}

function AssetTabs({ assets, active, setActive }){
  return (
    <div className="flex gap-2 p-2">
      {assets.map(a => (
        <button key={a.symbol} onClick={()=> setActive(a.symbol)} className={`tab ${active===a.symbol?'tab-active':''}`}>{a.symbol}</button>
      ))}
    </div>
  )
}

function CandleChart({ candles, height=280 }){
  const padding = 10, W=760, H=height;
  const view = Math.min(180, candles.length);
  const data = candles.slice(-view);
  const minY = Math.min(...data.map(d=>d.l));
  const maxY = Math.max(...data.map(d=>d.h));
  const bar = (W-padding*2) / Math.max(1, data.length);
  const bw = Math.max(1, bar*0.6);

  const last = data[data.length-1] || null;
  let yLast = null;
  if(last){
    yLast = padding + (1-(last.c-minY)/(maxY-minY||1))*(H-2*padding);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
      {data.map((d,i)=>{
        const x = padding + i*bar;
        const yH = padding + (1-(d.h-minY)/(maxY-minY||1))*(H-2*padding);
        const yL = padding + (1-(d.l-minY)/(maxY-minY||1))*(H-2*padding);
        const yO = padding + (1-(d.o-minY)/(maxY-minY||1))*(H-2*padding);
        const yC = padding + (1-(d.c-minY)/(maxY-minY||1))*(H-2*padding);
        const up = d.c>=d.o;
        const color = up ? '#16a34a' : '#dc2626';
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="1.2" />
            <rect x={x-bw/2} y={Math.min(yO,yC)} width={bw} height={Math.max(1, Math.abs(yC-yO))} fill={color} rx="1"/>
          </g>
        )
      })}
      {last && (
        <g>
          <line x1={padding} x2={W-padding} y1={yLast} y2={yLast} stroke="#F5BF3C" strokeWidth="1" strokeDasharray="4 4" />
          <rect x={W-padding-80} y={yLast-10} width="80" height="20" rx="10" fill="rgba(245,191,60,0.2)" />
          <text x={W-padding-40} y={yLast+4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#F5BF3C">{fmt(last.c,2)}</text>
        </g>
      )}
    </svg>
  )
}

function Depth({ mid }){
  const mk=()=>{ const s=Math.max(0.05, mid*0.0015); const b=[], a=[]; for(let i=5;i>=1;i--) b.push({p:mid-i*s,q:~~(Math.random()*40+10)}); for(let i=1;i<=5;i++) a.push({p:mid+i*s,q:~~(Math.random()*40+10)}); return {b,a} }
  const [d,setD]=React.useState(mk); React.useEffect(()=>{ const id=setInterval(()=>setD(mk),1500); return ()=>clearInterval(id)},[mid]);
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div>{d.b.map((x,i)=><div key={i} className="flex justify-between text-green-600 dark:text-green-400"><span>{fmt(x.p,2)}</span><span>{x.q}</span></div>)}</div>
      <div>{d.a.map((x,i)=><div key={i} className="flex justify-between text-red-600 dark:text-red-400"><span>{fmt(x.p,2)}</span><span>{x.q}</span></div>)}</div>
    </div>
  )
}

function TradePanel({ t, sym, price, balance, setBalance, holdings, setHoldings, onImpact, addOrder, addActivity }){
  const [side,setSide] = useState('BUY');
  const [qtyStr,setQtyStr] = useState('');
  const qty = qtyStr===''?0:Math.max(0, parseInt(qtyStr,10) || 0);
  const notional = qty*price;
  const canBuy = side==='BUY' ? (qty>0 && notional<=balance) : (qty>0 && (holdings[sym]||0)>=qty);

  const submit = ()=>{
    if(!canBuy) return;
    if(side==='BUY'){ setBalance(b=> b - notional); setHoldings(h=> ({...h, [sym]:(h[sym]||0)+qty })); }
    else { setBalance(b=> b + notional); setHoldings(h=> ({...h, [sym]:Math.max(0,(h[sym]||0)-qty)})); }
    onImpact(sym, qty, side, 'QTY');
    addOrder({ time: ts(), asset: sym, side, qty, price, notional });
    addActivity(`${t.orderPlaced}: ${side==='BUY'?t.buyShort:t.sellShort} ${qty} ${sym} @ ${fmt(price,2)} (${fmt(notional,2)} UAX)`);
    setQtyStr('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={()=>setSide('BUY')} className={`btn ${side==='BUY'?'btn-brand':''}`}>{t.buy}</button>
        <button onClick={()=>setSide('SELL')} className={`btn ${side==='SELL'?'btn-ghost':''}`}>{t.sell}</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="opacity-70">{t.price}</div><div className="text-right font-semibold">{fmt(price,2)} UAX</div>
        <div className="opacity-70">{t.youHold}</div><div className="text-right">{holdings[sym]||0}</div>
      </div>
      <div>
        <label className="text-xs opacity-70">{t.qty} (ціле число)</label>
        <input value={qtyStr} onChange={(e)=>{ const v=e.target.value; if(v===''||/^[0-9]+$/.test(v)) setQtyStr(v) }} placeholder="0" className="input" />
      </div>
      <div className="flex justify-between text-sm opacity-80">
        <span>{side==='BUY'?t.cost:t.proceeds}</span><span>{fmt(notional,2)} UAX</span>
      </div>
      <button onClick={submit} disabled={!canBuy} className={`w-full btn ${canBuy?'btn-brand':'bg-neutral-200 dark:bg-neutral-800 opacity-60 cursor-not-allowed'}`}>{side==='BUY'?t.buy:t.sell}</button>
      <div className="text-xs opacity-70">Поле кількості: лише цілі числа, можна повністю очистити. Угоди впливають на тренд.</div>
    </div>
  )
}

/** ================= Pages ================= */
function MarketsPage({ t, active, setActive, charts, balance, setBalance, holdings, setHoldings, onImpact, addOrder, addActivity }){
  const candles = charts[active]||[];
  const last = candles[candles.length-1]||{c:0};
  const mid = last.c;
  return (
    <div className="p-4 space-y-3">
      <AssetTabs assets={ASSETS} active={active} setActive={setActive} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold flex items-center gap-2">{t.asset}: {active} <span className="badge">{t.seconds10} • {t.candles}</span></div>
            <div className="text-sm opacity-80">{t.last}: <b>{fmt(mid,2)}</b></div>
          </div>
          <CandleChart candles={candles} />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="mb-2 text-sm font-semibold">{t.miniDepth}</div>
              <Depth mid={mid} />
            </div>
            <div className="card p-4">
              <div className="mb-2 text-sm font-semibold">{t.orderPanel}</div>
              <TradePanel
                t={t} sym={active} price={mid}
                balance={balance} setBalance={setBalance}
                holdings={holdings} setHoldings={setHoldings}
                onImpact={onImpact} addOrder={addOrder} addActivity={addActivity}
              />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="card p-4">
            <div className="text-sm font-semibold mb-2">{t.portfolio}</div>
            <ul className="text-sm space-y-1">
              {ASSETS.map(a=>{
                const q = holdings[a.symbol]||0;
                const p = (charts[a.symbol]||[]).slice(-1)[0]?.c||0;
                const v = q*p;
                return <li key={a.symbol} className="flex justify-between"><span>{a.symbol}</span><span>{q} • {fmt(v,2)} UAX</span></li>
              })}
            </ul>
          </div>
          <div className="card p-4">
            <div className="text-sm font-semibold mb-2">{t.notes}</div>
            <ul className="list-disc ml-5 text-xs leading-5 opacity-80">
              {t.notesBullets.map((b,i)=>(<li key={i}>{b}</li>))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function PortfolioPage({ t, charts, holdings }){
  const rows = ASSETS.map(a=>{
    const q = holdings[a.symbol]||0;
    const p = (charts[a.symbol]||[]).slice(-1)[0]?.c||0;
    const v = q*p; return { asset:a.symbol, qty:q, price:p, value:v };
  });
  const total = rows.reduce((s,r)=>s+r.value,0);
  return (
    <div className="p-4">
      <div className="card p-4">
        <div className="text-lg font-semibold mb-2">{t.portfolio}</div>
        <table className="table">
          <thead><tr><th>Актив</th><th>{t.qty}</th><th>{t.price}</th><th>Вартість</th></tr></thead>
          <tbody>{rows.map(r=>(<tr key={r.asset}><td>{r.asset}</td><td>{r.qty}</td><td>{fmt(r.price,2)}</td><td>{fmt(r.value,2)} UAX</td></tr>))}</tbody>
          <tfoot><tr><td colSpan="3" className="text-right font-semibold">Разом</td><td className="font-semibold">{fmt(total,2)} UAX</td></tr></tfoot>
        </table>
      </div>
    </div>
  )
}

function OrdersPage({ t, orders }){
  return (
    <div className="p-4">
      <div className="card p-4">
        <div className="text-lg font-semibold mb-2">{t.orders}</div>
        <table className="table">
          <thead><tr><th>Час</th><th>{t.asset}</th><th>{t.side}</th><th>{t.qty}</th><th>{t.price}</th><th>{t.amount}</th></tr></thead>
          <tbody>
            {orders.map((o,i)=>(<tr key={i}><td>{o.time}</td><td>{o.asset}</td><td>{o.side}</td><td>{o.qty}</td><td>{fmt(o.price,2)}</td><td>{fmt(o.notional,2)} UAX</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ActivityPage({ t, activity }){
  return (
    <div className="p-4">
      <div className="card p-4">
        <div className="text-lg font-semibold mb-2">{t.activity}</div>
        <ul className="text-sm space-y-2">
          {activity.map((a,i)=>(<li key={i}>• {a}</li>))}
        </ul>
      </div>
    </div>
  )
}

function LeadersPage({ t }){
  const rows = [
    { user:'TraderAlpha', pnl:+12.4 },
    { user:'TrivexWhale', pnl:+9.8 },
    { user:'CityBull', pnl:+7.1 },
    { user:'ShopBear', pnl:+5.9 },
    { user:'FoodNinja', pnl:+4.3 },
  ];
  return (
    <div className="p-4">
      <div className="card p-4">
        <div className="text-lg font-semibold mb-2">{t.leaders}</div>
        <table className="table">
          <thead><tr><th>Користувач</th><th>PNL %</th></tr></thead>
          <tbody>{rows.map((r,i)=>(<tr key={i}><td>{r.user}</td><td className={`${r.pnl>=0?'text-green-600 dark:text-green-400':'text-red-600 dark:text-red-400'}`}>{r.pnl>=0?'+':''}{r.pnl}%</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  )
}

function NewsPage({ t, active }){
  const news = [
    { time: ts(), title:`${active}: Місцеві інвестори збільшують ліквідність`, src:'Trivex Wire' },
    { time: ts(), title:`${active}: Підтверджено план розширення мережі`, src:'Market Daily' },
    { time: ts(), title:`${active}: Ком’юніті-облігації розкуплено`, src:'City Finance' },
  ];
  return (
    <div className="p-4">
      <div className="card p-4">
        <div className="text-lg font-semibold mb-2">{t.news}</div>
        <ul className="space-y-2 text-sm">{news.map((n,i)=>(<li key={i}><b>{n.time}</b> — {n.title} <span className="opacity-60">[{n.src}]</span></li>))}</ul>
      </div>
    </div>
  )
}



function SettingsPage({ t, theme, setTheme, lang, setLang, onReset }){
  return (
    <div className="p-4">
      <div className="card p-4 space-y-4">
        <div className="text-lg font-semibold">{t.settings}</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-semibold mb-2">{t.theme}</div>
            <button
              className="theme-icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? t.darkOn : t.lightOn}
            >
              <ThemeIcon theme={theme} />
            </button>
          </div>
          <div>
            <div className="text-sm font-semibold mb-2">{t.language}</div>
            <select value={lang} onChange={(e)=> setLang(e.target.value)} className="select">
              <option value="UKR">{t.ukr}</option>
              <option value="ENG">{t.eng}</option>
            </select>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold mb-1">{t.reset}</div>
          <button onClick={onReset} className="btn-reset">{t.reset}</button>
        </div>
      </div>
    </div>
  )
}

/** ================= Root App ================= */
export default function App(){
  const [theme,setTheme] = useTheme();
  const [lang,setLang] = useLang();
  const t = I18N[lang];

  const [charts, impact] = useMarket(useMemo(()=> makeInitialCharts(), []));
  const [activeAsset, setActiveAsset] = useState(ASSETS[0].symbol);
  const [activePage, setActivePage] = useState('Markets');

  const [balance, setBalance] = useState(()=> store.get('balance', 1000));
  const [holdings, setHoldings] = useState(()=> store.get('holdings', {}));
  const [orders, setOrders] = useState(()=> store.get('orders', []));
  const [activity, setActivity] = useState(()=> store.get('activity', []));

  useEffect(()=> store.set('balance', balance), [balance]);
  useEffect(()=> store.set('holdings', holdings), [holdings]);
  useEffect(()=> store.set('orders', orders), [orders]);
  useEffect(()=> store.set('activity', activity), [activity]);

  const addOrder = (o)=> setOrders(list => [o, ...list].slice(0,200));
  const addActivity = (msg)=> setActivity(list => [msg, ...list].slice(0,200));

  const doReset = ()=>{ store.clear(); location.reload(); };

  return (
    <div className="min-h-screen">
      <Header t={t} theme={theme} setTheme={setTheme} balance={balance} onReset={doReset} />
      <TopTabs t={t} active={activePage} setActive={setActivePage} />

      {activePage==='Markets' && (
        <MarketsPage
          t={t} active={activeAsset} setActive={setActiveAsset}
          charts={charts} balance={balance} setBalance={setBalance}
          holdings={holdings} setHoldings={setHoldings}
          onImpact={impact} addOrder={addOrder} addActivity={addActivity}
        />
      )}

      {activePage==='Portfolio' && <PortfolioPage t={t} charts={charts} holdings={holdings} />}
      {activePage==='Orders' && <OrdersPage t={t} orders={orders} />}
      {activePage==='Activity' && <ActivityPage t={t} activity={activity} />}
      {activePage==='Leaders' && <LeadersPage t={t} />}
      {activePage==='News' && <NewsPage t={t} active={activeAsset} />}
      {activePage==='Settings' && <SettingsPage t={t} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} onReset={doReset} />}
    </div>
  )
}
