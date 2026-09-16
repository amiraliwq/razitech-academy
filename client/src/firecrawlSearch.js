const SUPABASE_URL = 'https://zhexlpaugdnhnbylpoda.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NtW6JGT8nKdAWYMu-xrVCg_MY9NcyN3';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/firecrawl-search`;

function getAccessToken() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value?.access_token) return value.access_token;
    } catch {}
  }
  return null;
}

const style = document.createElement('style');
style.textContent = `
.fcSearchFab{position:fixed;left:20px;bottom:24px;z-index:9998;border:1px solid rgba(120,160,255,.35);background:rgba(8,12,25,.9);color:#fff;border-radius:999px;padding:12px 17px;font:700 14px Vazirmatn,system-ui;box-shadow:0 12px 40px rgba(0,0,0,.35);backdrop-filter:blur(16px);cursor:pointer}.fcSearchFab:hover{transform:translateY(-2px)}
.fcOverlay{position:fixed;inset:0;z-index:9999;background:rgba(2,5,14,.72);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px}.fcPanel{width:min(820px,100%);max-height:88vh;overflow:auto;background:#0b1020;border:1px solid rgba(130,160,255,.2);border-radius:24px;padding:22px;color:#eef2ff;direction:rtl;box-shadow:0 30px 100px rgba(0,0,0,.55);font-family:Vazirmatn,system-ui}.fcHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.fcHead h3{margin:0;font-size:20px}.fcClose{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:8px 11px;cursor:pointer}.fcForm{display:flex;gap:10px;margin:18px 0}.fcInput{flex:1;border:1px solid rgba(255,255,255,.12);background:#11182c;color:#fff;border-radius:14px;padding:13px;font:500 14px Vazirmatn}.fcSubmit{border:0;background:#6d7cff;color:#fff;border-radius:14px;padding:0 18px;font:800 14px Vazirmatn;cursor:pointer}.fcResult{padding:16px 0;border-top:1px solid rgba(255,255,255,.08)}.fcResult a{color:#aab7ff;font-weight:800;text-decoration:none}.fcResult p{color:#b8c0d8;line-height:1.8;margin:8px 0}.fcEmpty{color:#9aa4bf;text-align:center;padding:25px}.fcBadge{font-size:11px;color:#8fa0c8;margin-bottom:10px;display:block}
`;
document.head.appendChild(style);

const fab = document.createElement('button');
fab.className = 'fcSearchFab';
fab.textContent = '🌐 جستجوی زنده وب';
document.body.appendChild(fab);

const overlay = document.createElement('div');
overlay.className = 'fcOverlay';
overlay.hidden = true;
overlay.innerHTML = `<section class="fcPanel"><div class="fcHead"><div><span class="fcBadge">POWERED BY FIRECRAWL</span><h3>جستجوی زنده وب رازی‌تک</h3></div><button class="fcClose">✕</button></div><form class="fcForm"><input class="fcInput" placeholder="مثلاً آموزش ESP32 برای مبتدی‌ها" autocomplete="off"><button class="fcSubmit">جستجو</button></form><div class="fcResults"><div class="fcEmpty">عبارتت را جستجو کن تا نتایج وب را همین‌جا ببینی.</div></div></section>`;
document.body.appendChild(overlay);

const input = overlay.querySelector('.fcInput');
const results = overlay.querySelector('.fcResults');
overlay.querySelector('.fcClose').onclick = () => { overlay.hidden = true; };
fab.onclick = () => { overlay.hidden = false; input.focus(); };
overlay.onclick = e => { if (e.target === overlay) overlay.hidden = true; };

overlay.querySelector('form').onsubmit = async e => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  const token = getAccessToken();
  if (!token) {
    results.innerHTML = '<div class="fcEmpty">برای استفاده از جستجوی زنده، ابتدا وارد حساب رازی‌تک شوید.</div>';
    return;
  }
  results.innerHTML = '<div class="fcEmpty">در حال جستجو در وب…</div>';
  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, limit: 8 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'خطا در جستجو');
    if (!data.results?.length) {
      results.innerHTML = '<div class="fcEmpty">نتیجه‌ای پیدا نشد.</div>';
      return;
    }
    results.innerHTML = data.results.map(item => `<article class="fcResult"><a href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><p>${escapeHtml(item.description || 'بدون توضیح')}</p></article>`).join('');
  } catch (error) {
    results.innerHTML = `<div class="fcEmpty">${escapeHtml(error.message || 'خطای اتصال به Firecrawl')}</div>`;
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
}
