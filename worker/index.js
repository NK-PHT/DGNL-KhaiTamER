// =========================================================================
// MÁY CHỦ PHÁT ĐỀ ĐGNL (Cloudflare Worker "dgnl-api")
// Kho câu hỏi nằm ở đây (worker/kho.json, gom từ data/*.js lúc build), KHÔNG
// còn là tệp công khai trên dgnl.irismath.com. Học sinh đăng nhập (Firebase,
// như cũ) → trang gửi vé đăng nhập lên đây → máy chủ kiểm tra học sinh có
// trong danh sách (Firestore hocsinh/<email>) → rút đề → chỉ trả về đúng các
// câu của đề đó.
//   GET  /api/thongtin   danh sách chuyên đề + số câu, số đề (không có nội dung câu)
//   POST /api/de         { mon: 'toan', chuyenDe: '<id>' | '__TONG_HOP__', soCau }
//                        { mon: 'tv' | 'anh' | 'kh' | 'full' }
// =========================================================================
import KHO from './kho.json';

const FIREBASE_PROJECT = 'dgnl-2027';
const TEACHER_EMAIL = 'thuthuy611103@gmail.com';
// Trang được gọi máy chủ này (thêm địa chỉ nếu đổi tên miền)
const NGUON_DUOC_PHEP = [
  'https://dgnl.irismath.com',
  'https://dgnl-2027.web.app',
  'https://dgnl-2027.firebaseapp.com',
  'http://localhost:5000', 'http://127.0.0.1:5000'
];
// Giới hạn mỗi học sinh (chống gom kho): số đề trong 1 giờ / 1 ngày
const GIOI_HAN = [{ giay: 3600, toiDa: 60 }, { giay: 86400, toiDa: 300 }];
const SO_CAU_TOI_DA = 100;

// ---------------- CORS ----------------
function dauCors(request) {
  const goc = request.headers.get('Origin') || '';
  const h = { 'Vary': 'Origin' };
  if (NGUON_DUOC_PHEP.includes(goc)) {
    h['Access-Control-Allow-Origin'] = goc;
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
function json(request, obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...dauCors(request) }
  });
}

// ---------------- Đăng nhập Firebase ----------------
let khoaGoogle = null, khoaGoogleLuc = 0;
function b64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function layKhoaGoogle() {
  if (khoaGoogle && Date.now() - khoaGoogleLuc < 3600e3) return khoaGoogle;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('Khong lay duoc khoa Google');
  const { keys } = await r.json();
  const moi = {};
  for (const k of keys) {
    moi[k.kid] = await crypto.subtle.importKey('jwk', { kty: k.kty, n: k.n, e: k.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  khoaGoogle = moi; khoaGoogleLuc = Date.now();
  return khoaGoogle;
}
async function kiemTraVe(ve) {
  try {
    const [h, p, sig] = ve.split('.');
    const dau = JSON.parse(new TextDecoder().decode(b64url(h)));
    const than = JSON.parse(new TextDecoder().decode(b64url(p)));
    if (dau.alg !== 'RS256') return null;
    let khoa = (await layKhoaGoogle())[dau.kid];
    if (!khoa) { khoaGoogle = null; khoa = (await layKhoaGoogle())[dau.kid]; }
    if (!khoa) return null;
    const dung = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', khoa, b64url(sig), new TextEncoder().encode(h + '.' + p));
    if (!dung) return null;
    const bayGio = Date.now() / 1000;
    if (than.aud !== FIREBASE_PROJECT || than.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT) return null;
    if (!than.exp || than.exp < bayGio || (than.iat && than.iat > bayGio + 300)) return null;
    if (!than.email || than.email_verified !== true) return null;
    return { email: String(than.email).toLowerCase(), uid: than.user_id || than.sub };
  } catch (e) {
    console.log('Loi kiem tra ve:', String(e));
    return null;
  }
}
// Học sinh có trong danh sách? Hỏi Firestore bằng CHÍNH vé của học sinh (quy tắc
// Firestore cho phép mỗi em đọc đúng tài liệu hocsinh/<email> của mình).
const daKiem = new Map(); // email -> { ok, luc }
async function coTrongDanhSach(email, ve) {
  if (email === TEACHER_EMAIL) return true;
  const c = daKiem.get(email);
  if (c && Date.now() - c.luc < 10 * 60e3) return c.ok;
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/hocsinh/${encodeURIComponent(email)}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + ve } });
  const ok = r.status === 200;
  if (r.status === 200 || r.status === 404 || r.status === 403) daKiem.set(email, { ok, luc: Date.now() });
  else throw new Error('Firestore tra ' + r.status);
  return ok;
}
async function nguoiDung(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/);
  if (!m) return { loi: 401 };
  const ai = await kiemTraVe(m[1]);
  if (!ai) return { loi: 401 };
  if (!(await coTrongDanhSach(ai.email, m[1]))) return { loi: 403, email: ai.email };
  return ai;
}

// Giới hạn số đề mỗi học sinh (đếm trong bộ nhớ của máy chủ: chặn gom kho
// nhanh; không tuyệt đối vì Cloudflare có thể chạy nhiều bản song song)
const luot = new Map(); // email -> [mốc thời gian]
function vuotGioiHan(email) {
  const bayGio = Date.now();
  const ds = (luot.get(email) || []).filter(t => bayGio - t < 86400e3);
  for (const g of GIOI_HAN) if (ds.filter(t => bayGio - t < g.giay * 1000).length >= g.toiDa) return true;
  ds.push(bayGio); luot.set(email, ds);
  return false;
}

// ---------------- Rút đề (cùng thuật toán với js/app.js, js/mon-khac.js cũ) ----------------
const ngauNhien = a => a[Math.floor(Math.random() * a.length)];
function tron(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const demCau = n => (n || []).reduce((s, g) => s + g.cauHoi.length, 0);

function tronTheoViTri(dsPhan) {
  if (!dsPhan.length) return [];
  const chiMuc = dsPhan.map(phan => {
    const m = {}; let p = 0;
    phan.forEach(g => { m[p + ':' + g.cauHoi.length] = g; p += g.cauHoi.length; });
    return m;
  });
  const khung = ngauNhien(dsPhan);
  const out = []; let p = 0;
  khung.forEach(g => {
    const key = p + ':' + g.cauHoi.length;
    const ungVien = chiMuc.map(m => m[key]).filter(Boolean);
    out.push(ungVien.length ? ngauNhien(ungVien) : g);
    p += g.cauHoi.length;
  });
  return out;
}
const cacPhanToan = () => KHO.deThat.map(d => d.nhom).filter(n => demCau(n) === 42);
function tachToanLogic(nhom42) {
  let n = 0; const toan = [], logic = [];
  nhom42.forEach(g => { (n < 30 ? toan : logic).push(g); n += g.cauHoi.length; });
  return { toan, logic };
}
const SO_CAU_MON = { tv: 30, anh: 30, kh: 18 };
const cacPhanMon = mon => KHO.deMon.filter(d => demCau(d[mon]) === SO_CAU_MON[mon]).map(d => d[mon]);
const danNhan = (nhom, tieuDe, phan) => nhom.map((g, i) => Object.assign({}, g, { phan, tieuDePhan: i === 0 ? tieuDe : '' }));
const MON = {
  tv: { ten: 'Tiếng Việt', bd: 1, phut: 38 },
  anh: { ten: 'Tiếng Anh', bd: 31, phut: 38 },
  kh: { ten: 'Tư duy khoa học', bd: 91, phut: 38 },
  full: { ten: 'Đề đầy đủ 120 câu', bd: 1, phut: 150 }
};

function rutDe(yc) {
  const mon = yc.mon;
  if (mon === 'toan') {
    const id = String(yc.chuyenDe || '');
    if (id === '__TONG_HOP__' && cacPhanToan().length) {
      return { ten: 'Toán — đề trộn ngẫu nhiên (42 câu)', nhom: tronTheoViTri(cacPhanToan()), phut: 50, bd: 61, coDinhGio: true };
    }
    const pool = id === '__TONG_HOP__' ? KHO.chuyenDe.flatMap(c => c.nhom) : ((KHO.chuyenDe.find(c => c.id === id) || {}).nhom || []);
    const tong = demCau(pool);
    if (!tong) return null;
    let soCau = Math.max(1, Math.min(parseInt(yc.soCau, 10) || 20, SO_CAU_TOI_DA, tong));
    const chon = []; let n = 0;
    for (const g of tron(pool)) { if (n >= soCau) break; chon.push(g); n += g.cauHoi.length; }
    return { nhom: chon, coDinhGio: false };
  }
  const t = MON[mon];
  if (!t) return null;
  let nhom = [], bd = t.bd;
  if (mon === 'tv' || mon === 'anh') {
    nhom = danNhan(tronTheoViTri(cacPhanMon(mon)), '', t.ten);
  } else if (mon === 'kh') {
    const logic = tronTheoViTri(cacPhanToan().map(n => tachToanLogic(n).logic));
    bd = 103 - demCau(logic);
    nhom = danNhan(logic, 'Logic, phân tích số liệu', 'Logic, số liệu')
      .concat(danNhan(tronTheoViTri(cacPhanMon('kh')), 'Suy luận khoa học', 'Suy luận khoa học'));
  } else if (mon === 'full') {
    const { toan, logic } = tachToanLogic(tronTheoViTri(cacPhanToan()));
    nhom = danNhan(tronTheoViTri(cacPhanMon('tv')), 'PHẦN 1 · Tiếng Việt (câu 1–30)', 'Tiếng Việt')
      .concat(danNhan(tronTheoViTri(cacPhanMon('anh')), 'PHẦN 1 · Tiếng Anh (câu 31–60)', 'Tiếng Anh'))
      .concat(danNhan(toan, 'PHẦN 2 · Toán học (câu 61–90)', 'Toán'))
      .concat(danNhan(logic, 'PHẦN 3 · Logic, phân tích số liệu (câu 91–102)', 'Logic, số liệu'))
      .concat(danNhan(tronTheoViTri(cacPhanMon('kh')), 'PHẦN 3 · Suy luận khoa học (câu 103–120)', 'Suy luận khoa học'));
  }
  if (!nhom.length) return null;
  return { ten: t.ten + ' — đề trộn ngẫu nhiên', nhom, phut: t.phut, bd, coDinhGio: true };
}

function thongTin() {
  return {
    chuyenDe: KHO.chuyenDe.map(c => ({ id: c.id, ten: c.ten, soCau: demCau(c.nhom) })),
    soDeThat: KHO.deThat.length,
    soPhanToan: cacPhanToan().length
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: dauCors(request) });
    if (p === '/api/ping') return json(request, { ok: true });
    if (p !== '/api/thongtin' && p !== '/api/de') return json(request, { loi: 'Khong tim thay' }, 404);
    let ai;
    try { ai = await nguoiDung(request); } catch (e) {
      console.log('Loi kiem tra danh sach:', String(e));
      return json(request, { loi: 'May chu tam thoi khong kiem tra duoc tai khoan, vui long thu lai.' }, 503);
    }
    if (ai.loi === 401) return json(request, { loi: 'Chua dang nhap' }, 401);
    if (ai.loi === 403) return json(request, { loi: 'Email chua duoc dang ky' }, 403);
    if (p === '/api/thongtin') return json(request, thongTin());
    if (request.method !== 'POST') return json(request, { loi: 'Sai phuong thuc' }, 405);
    let yc;
    try { yc = await request.json(); } catch { return json(request, { loi: 'Du lieu khong hop le' }, 400); }
    if (vuotGioiHan(ai.email)) {
      console.log('VUOT GIOI HAN', ai.email);
      return json(request, { loi: 'Bạn tạo đề quá nhiều lần trong thời gian ngắn. Vui lòng nghỉ một lát rồi thử lại.' }, 429);
    }
    const de = rutDe(yc || {});
    if (!de) return json(request, { loi: 'Chưa có đề cho mục này.' }, 404);
    console.log('PHAT DE', ai.email, yc.mon, yc.chuyenDe || '', demCau(de.nhom));
    return json(request, de);
  }
};
