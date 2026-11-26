// 从 gh-pages 站点抓取中国区源，逐个测试可用性，输出只含活频道的 live.m3u
const SITE = 'https://tekkener2026.github.io';
const SOURCES = ['o_s_cn_cctv.m3u', 'o_cn.m3u', 'o_s_cn.m3u'];
const CONCURRENCY = 24;
const TIMEOUT = 5000;

async function isAlive(url) {
  if (!/^https?:/i.test(url)) return false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'VLC/3.0.20' } });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    let head = '';
    if (res.body) {
      const reader = res.body.getReader();
      try {
        const r = await reader.read();
        if (r.value) head = Buffer.from(r.value.slice(0, 800)).toString('utf8');
      } catch (e) {}
      try {
        await reader.cancel();
      } catch (e) {}
    }
    if (/mpegurl|m3u|mp2t|video|octet-stream/i.test(ct)) return true;
    return /EXTM3U|EXT-X-|EXTINF/.test(head);
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const channels = [];
const seen = new Set();
for (const name of SOURCES) {
  const res = await fetch(SITE + '/' + name);
  if (!res.ok) {
    console.error('skip ' + name + ': HTTP ' + res.status);
    continue;
  }
  const lines = (await res.text()).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;
    const url = (lines[i + 1] || '').trim();
    if (!url || url.startsWith('#')) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const m = lines[i].match(/,(.*)$/);
    channels.push({ info: lines[i], url: url, name: m ? m[1].trim() : '' });
  }
}

const alive = new Array(channels.length).fill(false);
let next = 0;
async function worker() {
  while (next < channels.length) {
    const i = next++;
    alive[i] = await isAlive(channels[i].url);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const names = new Set();
const finalList = [];
for (let i = 0; i < channels.length; i++) {
  if (!alive[i]) continue;
  const c = channels[i];
  if (names.has(c.name)) continue;
  names.add(c.name);
  finalList.push(c);
}

const out = ['#EXTM3U x-tvg-url="' + SITE + '/epg/51zmt.xml"'];
for (const c of finalList) {
  out.push(c.info);
  out.push(c.url);
}
process.stdout.write(out.join('\n') + '\n');
console.error('tested=' + channels.length + ' alive=' + finalList.length);
