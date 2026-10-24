#!/usr/bin/env node
/**
 * Gom toàn bộ kho câu hỏi ĐGNL (data/*.js) thành 1 tệp cho máy chủ phát đề (worker/).
 * TỰ CHẠY mỗi lần Cloudflare build Worker "dgnl-api" (wrangler.jsonc › build). Không cần chạy tay.
 * Chạy thử trên máy:  node tools/build_api.js
 * Kết quả: worker/kho.json (đã .gitignore).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const window = {};
const ctx = vm.createContext({ window });
function chay(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) { console.warn('Thieu ' + rel); return false; }
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: rel });
  return true;
}

chay('data/manifest.js');
const dsCD = (window.DGNL_MANIFEST && window.DGNL_MANIFEST.chuyenDe) || [];
dsCD.forEach(m => chay(m.file));
chay('data/de-that.js');
chay('data/de-mon/manifest.js');
const dsMon = window.DGNL_DE_MON_MANIFEST || [];
dsMon.forEach(m => chay(m.file));

const kho = {
  chuyenDe: dsCD.map(m => ({ id: m.id, ten: m.ten, nhom: (window.DGNL_CHUYEN_DE || {})[m.id] || [] })),
  deThat: window.DGNL_DE_THAT || [],
  deMon: dsMon.map(m => (window.DGNL_DE_MON || {})[m.id]).filter(Boolean)
};
const dem = n => n.reduce((s, g) => s + g.cauHoi.length, 0);
fs.writeFileSync(path.join(ROOT, 'worker', 'kho.json'), JSON.stringify(kho));
console.log('build_api: ' + kho.chuyenDe.length + ' chuyen de (' + kho.chuyenDe.reduce((s, c) => s + dem(c.nhom), 0) + ' cau), ' +
  kho.deThat.length + ' de that, ' + kho.deMon.length + ' de mon');
