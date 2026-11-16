const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const colors = { colibri: 'var(--ink-soft)', 'llama.cpp-official': 'var(--hero-lavender)', strata: 'var(--accent-on-dark)', 'strata-q8-engram': 'var(--accent-soft)', inferssd: 'var(--accent)', 'ik_llama.cpp': 'var(--accent-hover)', 'llama.cpp-v4.1': 'var(--hero-lavender)', tensorsharp: 'var(--ink-mute)', 'colibri-q8-local': 'var(--ink-soft)' };
const metrics = {
  server_prefill_tps: ['Prefill speed', 'tokens/s'], decode: ['Decode speed', 'tokens/s'],
  ttft_s: ['Time to first token', 'seconds']
};
// Retain the detail implementation while measurement drill-down is paused.
const runDetailsEnabled = false;
const state = { model: 'deepseek', hardware: 'rtx5090', memory: 32, tier: 4096, query: '', status: 'all', sort: 'server_prefill_tps', direction: -1, selected: new Set() };
let data, visible = [], detailRequest = 0;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, digits = 2) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const mean = (g, key) => g.values[key] ?? null;
const displayStatus = g => g.status;
const badge = g => `<span class="status ${escape(displayStatus(g))}"><i></i>${displayStatus(g) === 'completed' ? 'Completed' : displayStatus(g) === 'oom' ? 'OOM' : escape(displayStatus(g))}</span>`;
const engineLabel = g => escape(g.engine_label);
const modelName = g => data.models[g.model].name;
function current() { return data.groups.filter(g => g.model === state.model && g.device_id === state.hardware); }
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 3800);
}
function chart(metric, title, subtitle) {
    const groups = current().filter(g => mean(g, metric) !== null);
    const latency = metric === 'ttft_s';
    groups.sort((a, b) => (mean(a, metric) - mean(b, metric)) * (latency ? 1 : -1));
    const highest = Math.max(...groups.map(g => mean(g, metric)), .001);
    const magnitude = 10 ** Math.floor(Math.log10(highest));
    const max = ([1, 2, 3, 4, 5, 6, 8, 10].find(n => n * magnitude >= highest) || 10) * magnitude;
    const intervals = latency ? 3 : 4;
    const ticks = Array.from({ length: intervals + 1 }, (_, i) => `<span>${fmt(max * (latency ? 1 - i / intervals : i / intervals), Number.isInteger(max / intervals) ? 0 : 1)}</span>`).join('');
    const rows = groups.map(g => {
        const value = mean(g, metric);
        const position = (latency ? 1 - value / max : value / max) * 100;
        return `<button class="metric-row" data-run="${g.id}" ${runDetailsEnabled ? '' : 'disabled'} aria-label="${engineLabel(g)} ${title}: ${fmt(value)} ${metrics[metric][1]}"><span class="metric-label">${engineLabel(g)}</span><span class="metric-track"><span class="${latency ? 'metric-point' : 'metric-fill'}" style="${latency ? 'left' : 'width'}:${position}%;--series-color:${g.engine === 'inferssd' ? 'var(--accent)' : 'var(--hero-lavender)'}"></span></span><strong>${fmt(value)}</strong></button>`;
    }).join('');
    return `<article class="chart-card"><div class="chart-head"><h3>${title}</h3><p>${subtitle}</p></div>${groups.length ? `<div class="horizontal-chart ${latency ? 'latency-chart' : ''}"><div class="chart-direction"><span>Slower</span><span>Faster →</span></div><div class="metric-rows">${rows}</div><div class="chart-axis" aria-hidden="true">${ticks}</div></div>` : '<div class="empty">No measurements for this selection.</div>'}</article>`;
}
function renderCharts() {
    $('#charts').innerHTML = chart('server_prefill_tps', 'Prefill speed', 'Tokens/s · Higher is better') + chart('decode', 'Decode speed', 'Tokens/s · Higher is better') + chart('ttft_s', 'Time to first token', 'Seconds · Lower is better');
    const inputs = [...new Set(current().flatMap(g => g.actual_input_tokens))].sort((a, b) => a - b);
    $('#selection-label').textContent = `GGUF / safetensors · ${inputs.length ? inputs.map(n => fmt(n, 0)).join(' / ') : '—'} actual input · 256 output tokens`;
    $('#chart-selection').textContent = `DeepSeek V4.1 · RTX 5090 · ${state.memory} GiB · ${fmt(state.tier, 0)} input tier`;
    $('#result-footnotes').textContent = '';
    $('#result-footnotes').hidden = true;
    $('#data-note').textContent = 'Cache preparation, loader behavior and native timing boundaries are recorded per configuration.';
    $$('[data-tier]').forEach(b => { const selected = +b.dataset.tier === state.tier; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
}
function renderTable() {
  visible = current().filter(g => (state.status === 'all' || state.status === displayStatus(g)) && `${g.engine_label} ${modelName(g)}`.toLowerCase().includes(state.query.toLowerCase()));
  visible.sort((a, b) => {
    const value = g => state.sort === 'engine' ? g.engine_label : state.sort === 'tier' ? g.tier : mean(g, state.sort);
    const av = value(a), bv = value(b);
    if (av === null && bv === null) return 0; if (av === null) return 1; if (bv === null) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * state.direction;
  });
  $('#result-count').textContent = visible.length;
  const cell = (g, key) => `<td class="metric">${fmt(mean(g, key))}</td>`;
  const version = g => escape(`${g.revision ?? 'Not provided'}${['tensorsharp', 'colibri-q8-local', 'strata-q8-engram'].includes(g.engine) ? ' + local fixes' : g.engine === 'llama.cpp-v4.1' ? ' · fork' : ''}`);
  $('#rows').innerHTML = visible.length ? visible.map(g => `<tr><td><input type="checkbox" data-select="${g.id}" aria-label="Compare ${engineLabel(g)}" ${state.selected.has(g.id) ? 'checked' : ''}></td><td><div class="engine-cell"><span class="engine-icon" style="--color:${colors[g.engine]}">${escape(g.engine_label[0])}</span><div><strong title="${version(g)}">${engineLabel(g)}</strong></div></div></td><td>${fmt(g.actual_input_tokens[0], 0)}</td><td>${badge(g)}</td>${cell(g, 'server_prefill_tps')}${cell(g, 'decode')}${cell(g, 'ttft_s')}</tr>`).join('') : '<tr><td colspan="7" class="empty">No matching results.</td></tr>';
  $$('[data-sort]').forEach(b => { b.closest('th').setAttribute('aria-sort', b.dataset.sort === state.sort ? state.direction === 1 ? 'ascending' : 'descending' : 'none'); $('span', b).textContent = b.dataset.sort === state.sort ? state.direction === 1 ? '↑' : '↓' : '↕'; });
  renderCompareBar();
}
function renderCompareBar() { $('#compare-bar').hidden = !state.selected.size; $('#compare-count').textContent = `${state.selected.size} / 3 runs selected`; $('#compare').disabled = state.selected.size < 2; }
function render() { renderCharts(); renderTable(); }
function renderHardware(id = 'rtx5090') {
  $$('[data-bed]').forEach(b => { const selected = b.dataset.bed === id; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
  const spark = id === 'spark';
  const rows = spark ? [['Unified memory','128 GB nominal'],['Test memory limit','32 / 96 GiB · swap disabled'],['Model storage','Direct NVMe partition'],['Architecture / driver','aarch64 / 580.82.09']] : [['GPU memory','32 GB nominal · 32,607 MiB reported'],['Test memory limit','32 / 96 GiB · swap disabled'],['CPU / vCPUs','AMD EPYC 7B13 · 61 vCPUs'],['Architecture / driver','x86_64 / 580.105.08']];
  $('#hardware-specs').innerHTML = `<div class="hardware-layout"><a class="hardware-photo" href="${spark ? 'https://www.nvidia.com/en-us/products/workstations/dgx-spark/' : 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/'}" target="_blank" rel="noopener noreferrer" aria-label="${spark ? 'NVIDIA DGX Spark' : 'NVIDIA GeForce RTX 5090'} product sketch and specifications (opens in a new tab)"><img src="../../images/lab/${spark ? 'dgx-spark' : 'rtx-5090'}-sketch.png?v=20261112o" alt="${spark ? 'NVIDIA DGX Spark desktop AI computer, graphite sketch' : 'NVIDIA GeForce RTX 5090 Founders Edition graphics card, graphite sketch'}" width="1254" height="1254" loading="lazy"></a><dl>${rows.map(([k,v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div><p class="hardware-foot">${spark ? 'SAMSUNG MZALC4T0HBL1-00B07 · Specifications only; results are not enabled.' : 'KVM virtual machine · Virtual disk; physical SSD details are unavailable.'}</p>`;
}
function showDialog(title, content, label = 'Run details') {
  detailRequest++; $('#dialog-title').textContent = title; $('#dialog-eyebrow').textContent = label; $('#dialog-content').innerHTML = content;
  if (!$('#dialog').open) $('#dialog').showModal();
}
function method() {
  showDialog('Benchmark methodology', `<div class="dialog-body method-content"><h3>Environment</h3><p>DeepSeek V4.1 Flash 1017 on RTX 5090, with a 32 GiB process-memory limit and swap disabled. Each request has 4,104 input tokens and 256 outputs. Engine defaults are retained except necessary documented compatibility or resource changes. Colibri uses official safetensors; other engines use GGUF. Context, threads, batch sizes and computation modes are recorded per configuration.</p><h3>Cache preparation</h3><p>Each new run starts a fresh process after model-file page-cache eviction and zero-residency verification in the guest. Intrinsic loader warmup and prefetch are retained. Physical SSD and hypervisor caches are uncontrolled.</p><h3>Timing</h3><p>Prefill uses native counters. Decode uses native counters where available. Colibri generation speed is calculated as 256 / (native request duration − prefill duration), with its own metric key; it is not an independent decode timer. Native token boundaries vary by engine. TTFT is the time from request start to first output. Loading is separate.</p><h3>Versions</h3><p>The current llama.cpp result uses upstream commit 281e7dad. Strata and TensorSharp retain their documented compatibility patches. TensorSharp retains default approximate YOCO; Colibri retains default DSpark. Model formats and computation modes differ, and quality parity is unverified. No overall ranking is assigned. InferSSD display rates supplied by the user remain separate from archived statistics.</p><a class="button" href="data/ssdbench.zip" download>Download results ↓</a></div>`, 'Measurement notes');
}
function runDetails(id) {
  if (!runDetailsEnabled) return;
  const g = current().find(row => row.id === id); if (!g) return;
  showDialog(`${g.engine_label} / ${g.tier.toLocaleString()} tokens`, `<div class="dialog-body"><p class="detail-subtitle">${escape(modelName(g))} · RTX 5090 · ${g.memory_GiB} GiB</p><div class="detail-metrics">${Object.entries(metrics).map(([key,[label,unit]]) => `<div><span>${label} · ${unit}</span><strong>${fmt(mean(g,key))}</strong></div>`).join('')}</div><a class="button" href="data/${g.download}" download>Download CSV ↓</a></div>`);
}
function compare() {
  const groups = current().filter(g => state.selected.has(g.id)); if (groups.length < 2) return;
  showDialog('Compare results', `<div class="dialog-body"><p class="detail-note">RTX 5090 · 32 GiB · 4,104 input tokens · 256 output tokens.</p><div class="compare-table"><table><thead><tr><th>Measurement</th>${groups.map(g => `<th>${engineLabel(g)}</th>`).join('')}</tr></thead><tbody>${[['Memory limit (GiB)',g => g.memory_GiB],['Measured input tier',g => g.tier],...Object.entries(metrics).map(([k,[label,unit]]) => [`${label} (${unit})`,g => fmt(mean(g,k))])].map(([label,f]) => `<tr><td>${label}</td>${groups.map(g => `<td>${escape(f(g))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`, 'Comparison');
}
function exportCSV() {
  const header = ['engine','model','hardware','memory_GiB','input_tier','actual_input_tokens','output_tokens',...Object.keys(metrics)];
  const rows = visible.map(g => [g.engine_label,modelName(g),'RTX 5090',g.memory_GiB,g.tier,g.actual_input_tokens[0],g.output_tokens,...Object.keys(metrics).map(k => mean(g,k))]);
  const csv = [header,...rows].map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href=url; a.download=`ssdbench-deepseek-5090-${state.memory}g-${state.tier}-view.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast(`Exported ${visible.length} records`);
}
document.addEventListener('click',e => {
  const b=e.target.closest('button'); if (!b || b.disabled) return;
  if (b.id==='close-dialog') { $('#dialog').close(); return; }
  if (b.dataset.bed) { renderHardware(b.dataset.bed); return; }
  if (!data) return;
  if (b.hasAttribute('data-method')) method();
  else if (b.dataset.tier) { state.tier=+b.dataset.tier; state.selected.clear(); render(); }
  else if (b.dataset.sort) { if(state.sort===b.dataset.sort) state.direction*=-1; else { state.sort=b.dataset.sort; state.direction=['engine','tier'].includes(state.sort)||state.sort.endsWith('_s')?1:-1; } renderTable(); }
  else if (b.dataset.run) runDetails(b.dataset.run);
  else if (b.id==='reset') { Object.assign(state,{memory:32,tier:4096,query:'',status:'all',sort:'server_prefill_tps',direction:-1}); state.selected.clear(); $('#search').value=''; $('#status').value='all'; render(); }
  else if (b.id==='export') exportCSV();
  else if (b.id==='clear-compare') { state.selected.clear(); renderTable(); }
  else if (b.id==='compare') compare();
});
document.addEventListener('change',e => {
  const el=e.target;
  if(el.dataset.select) { if(el.checked && state.selected.size>=3) { el.checked=false; toast('Select up to 3 configurations.'); return; } if(el.checked) state.selected.add(el.dataset.select); else state.selected.delete(el.dataset.select); renderCompareBar(); }
  if(el.id==='status') { state.status=el.value; renderTable(); }
});
document.addEventListener('input',e => { if(e.target.id==='search') { state.query=e.target.value; renderTable(); } });
$('#dialog').addEventListener('click',e => { if(e.target===$('#dialog')) { const r=$('#dialog').getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) $('#dialog').close(); } });
$('#dialog').addEventListener('close',()=>detailRequest++);
renderHardware();
try { const response=await fetch('data/results.json?v=20261112o'); if(!response.ok) throw new Error('Dataset unavailable.'); data=await response.json(); $('#snapshot-count').textContent = `${data.groups.length} engines · 4K view`; render(); }
catch(e) { $('#charts').innerHTML=`<p class="empty">Unable to load results. ${escape(e.message)}</p>`; }
