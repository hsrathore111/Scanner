import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { comparableStatusLabel, confidenceLabel, formatRange, formatUsd } from './format';
import { photoBase64 } from './images';
import type { Item } from './types';

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function buildHtml(item: Item): Promise<string> {
  const a = item.appraisal;
  const photos = (
    await Promise.all((item.photos ?? []).slice(0, 4).map((name) => photoBase64(item.id, name)))
  ).filter((b): b is string => !!b);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const row = (label: string, value: string) =>
    value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1E1914; margin: 36px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; color: #7E5410; margin: 28px 0 8px; border-bottom: 1px solid #E3DACB; padding-bottom: 4px; }
  .muted { color: #7A7064; font-size: 12px; }
  .value { font-size: 30px; font-weight: bold; margin: 8px 0 2px; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .photos img { width: 48%; max-height: 260px; object-fit: cover; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; width: 32%; color: #4A4239; font-weight: normal; padding: 5px 8px 5px 0; vertical-align: top; }
  td { padding: 5px 0; vertical-align: top; }
  .comp td, .comp th { border-bottom: 1px solid #EFE8DC; padding: 6px 4px; }
  .comp th { font-weight: bold; width: auto; }
  a { color: #7E5410; word-break: break-all; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; }
  .disclaimer { margin-top: 32px; font-size: 10.5px; color: #7A7064; line-height: 1.5; }
</style></head><body>
  <div class="muted">Item record · Prepared ${esc(date)}</div>
  <h1>${esc(a.item_name)}</h1>
  <div class="muted">${esc([a.category, a.maker, a.era].filter(Boolean).join(' · '))}</div>
  ${photos.length ? `<div class="photos">${photos.map((b) => `<img src="data:image/jpeg;base64,${b}"/>`).join('')}</div>` : ''}

  <h2>Estimated resale value (USD)</h2>
  <div class="value">${esc(formatRange(a.value_low, a.value_high))}</div>
  <div class="muted">${esc(confidenceLabel[a.value_confidence])} · ${esc(a.value_basis)}</div>

  <h2>Description</h2>
  <p style="font-size:13px; line-height:1.5">${esc(a.summary)}</p>
  <table>
    ${row('Maker', a.maker)}${row('Era', a.era)}${row('Materials', a.materials)}
    ${row('Condition (from photos)', a.condition_notes)}
    ${row('Identification', confidenceLabel[a.identification_confidence])}
    ${row('Owner notes', item.note ?? '')}
  </table>

  ${
    a.comparables.length
      ? `<h2>Comparable sales</h2><table class="comp"><tr><th>Item</th><th>Price</th><th>Type</th><th>Source</th></tr>
      ${a.comparables
        .map(
          (c) => `<tr><td>${esc(c.title)}<br/><a href="${esc(c.url)}">${esc(c.url)}</a></td>
          <td>${esc(formatUsd(c.price))}</td><td>${esc(comparableStatusLabel[c.status] ?? c.status)}</td>
          <td>${esc(c.source)}${c.date ? `<br/><span class="muted">${esc(c.date)}</span>` : ''}</td></tr>`,
        )
        .join('')}</table>`
      : ''
  }

  ${a.value_factors.length ? `<h2>What affects the value</h2><ul>${a.value_factors.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}

  <p class="disclaimer">This report is an automated estimate based on the photos provided and publicly available
  sales data at the time it was prepared. It is not a certified appraisal and does not authenticate the item.
  For insurance coverage of high-value items, estate tax filings, or donations, ask a qualified appraiser
  (for example, a member of the American Society of Appraisers) for a formal written appraisal.</p>
</body></html>`;
}

export async function createAndShareReport(item: Item) {
  const html = await buildHtml(item);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Item report' });
  }
  return uri;
}
