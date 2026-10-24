// =========================================================================
// GOOGLE SHEET "BẢNG NỘP BÀI TẬP TUẦN" — làm 2 việc cho web ĐGNL
// (Firestore project dgnl-2027):
//  1) CHẤM BÀI (mỗi 1 phút): phiếu nào mới nộp (daCham = false) thì so với
//     đáp án, ghi số câu đúng (soDung) vào phiếu → học sinh thấy ngay trên
//     web. Đáp án chỉ nằm ở máy chủ, máy học sinh không đọc được.
//  2) VẼ BẢNG (mỗi 5 phút) — tab "Nộp BTVN", tô màu từng ô:
//   xanh  = nộp đúng hạn (kèm số câu đúng, nếu đã nhập đáp án)
//   vàng  = nộp trễ
//   đỏ    = đã hết hạn mà chưa nộp
//   trống = chưa nộp, chưa hết hạn
// Cách cài: xem file HUONG_DAN.md của web, mục "Bài tập tuần → Google Sheet".
// Script chạy bằng CHÍNH tài khoản Google của giáo viên (chủ project
// Firebase), nên đọc được toàn bộ dữ liệu mà không cần khoá bí mật nào.
// =========================================================================
const PROJECT_ID = 'dgnl-2027';
const TEN_TAB = 'Nộp BTVN';
const MAU = { xanh: '#b7e1cd', vang: '#fce8b2', do: '#f4c7c3', trang: '#ffffff', tieuDe: '#d9ead3' };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ĐGNL')
    .addItem('Cập nhật ngay (chấm bài + vẽ bảng)', 'capNhatNgay')
    .addItem('Bật tự động (chấm mỗi 1 phút, bảng mỗi 5 phút)', 'batTuDong')
    .addItem('Tắt tự động', 'tatTuDong')
    .addSeparator()
    .addItem('Chấm lại tất cả (sau khi sửa đáp án)', 'chamLaiTatCa')
    .addToUi();
}

function batTuDong() {
  tatTuDong();
  ScriptApp.newTrigger('chamBai').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('capNhatBang').timeBased().everyMinutes(5).create();
  capNhatNgay();
  SpreadsheetApp.getActive().toast('Đã bật: chấm bài mỗi 1 phút, bảng cập nhật mỗi 5 phút.', 'ĐGNL');
}

function tatTuDong() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['capNhatBang', 'chamBai'].indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function capNhatNgay() {
  chamBai();
  capNhatBang();
}

// ---------- Chấm bài ----------
const API_ = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
function goi_(method, url, body) {
  const res = UrlFetchApp.fetch(url, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT_ID },
    payload: body ? JSON.stringify(body) : undefined
  });
  if (res.getResponseCode() !== 200) throw new Error(method + ' ' + url.slice(-60) + ' → mã ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText() || '{}');
}

function demDung_(traLoi, dapAn, soCau) {
  let d = 0;
  for (let k = 0; k < soCau; k++) if (traLoi[k] && traLoi[k] !== '-' && traLoi[k] === dapAn[k]) d++;
  return d;
}

function ghiDiem_(id, soDung) {
  goi_('patch', API_ + '/btvn_bainop/' + encodeURIComponent(id) +
    '?updateMask.fieldPaths=soDung&updateMask.fieldPaths=daCham&updateMask.fieldPaths=chamLuc', {
    fields: { soDung: { integerValue: String(soDung) }, daCham: { booleanValue: true }, chamLuc: { timestampValue: new Date().toISOString() } }
  });
}

// Chấm các phiếu chưa chấm (daCham = false). Phiếu của tuần chưa có đáp án thì để lại, lần sau chấm.
function chamBai() {
  const kq = goi_('post', API_ + ':runQuery', { structuredQuery: {
    from: [{ collectionId: 'btvn_bainop' }],
    where: { fieldFilter: { field: { fieldPath: 'daCham' }, op: 'EQUAL', value: { booleanValue: false } } },
    limit: 500 } });
  const phieu = (kq || []).filter(r => r.document).map(r => Object.assign({ _id: decodeURIComponent(r.document.name.split('/').pop()) }, giaiMa_(r.document.fields || {})));
  if (!phieu.length) return 0;
  const tuan = {}, dapAn = {};
  docCollection_('btvn').forEach(t => { tuan[t._id] = t; });
  docCollection_('btvn_dapan').forEach(d => { dapAn[d._id] = d.dapAn || ''; });
  let n = 0;
  phieu.forEach(p => {
    const t = tuan[p.tuanId], da = dapAn[p.tuanId] || '';
    if (!t || !/[ABCD]/.test(da)) return;
    ghiDiem_(p._id, demDung_(p.traLoi || '', da, t.soCau));
    n++;
  });
  return n;
}

// Sau khi giáo viên sửa đáp án: chấm lại toàn bộ phiếu đã nộp.
function chamLaiTatCa() {
  const tuan = {}, dapAn = {};
  docCollection_('btvn').forEach(t => { tuan[t._id] = t; });
  docCollection_('btvn_dapan').forEach(d => { dapAn[d._id] = d.dapAn || ''; });
  let n = 0;
  docCollection_('btvn_bainop').forEach(p => {
    const t = tuan[p.tuanId], da = dapAn[p.tuanId] || '';
    if (!t || !/[ABCD]/.test(da)) return;
    const moi = demDung_(p.traLoi || '', da, t.soCau);
    if (moi !== p.soDung || !p.daCham) { ghiDiem_(p._id, moi); n++; }
  });
  capNhatBang();
  SpreadsheetApp.getActive().toast('Đã chấm lại ' + n + ' phiếu.', 'ĐGNL');
}

// ---------- Đọc Firestore qua REST ----------
function docCollection_(ten) {
  const ketQua = [];
  let pageToken = '';
  do {
    const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/' + ten + '?pageSize=300' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT_ID },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Không đọc được "' + ten + '" (mã ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
    }
    const data = JSON.parse(res.getContentText());
    (data.documents || []).forEach(d => {
      const id = decodeURIComponent(d.name.split('/').pop());
      ketQua.push(Object.assign({ _id: id }, giaiMa_(d.fields || {})));
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return ketQua;
}

function giaiMa_(fields) {
  const o = {};
  Object.keys(fields).forEach(k => {
    const v = fields[k];
    if ('stringValue' in v) o[k] = v.stringValue;
    else if ('integerValue' in v) o[k] = Number(v.integerValue);
    else if ('doubleValue' in v) o[k] = v.doubleValue;
    else if ('timestampValue' in v) o[k] = new Date(v.timestampValue);
    else if ('booleanValue' in v) o[k] = v.booleanValue;
    else o[k] = null;
  });
  return o;
}

// ---------- Vẽ bảng ----------
function capNhatBang() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(TEN_TAB) || ss.insertSheet(TEN_TAB);
  const tz = ss.getSpreadsheetTimeZone();

  const dsTuan = docCollection_('btvn').sort((a, b) => a.hanNop - b.hanNop);
  const dapAn = {};
  docCollection_('btvn_dapan').forEach(d => { dapAn[d._id] = d.dapAn || ''; });
  const hocSinh = docCollection_('hocsinh');
  const bainop = docCollection_('btvn_bainop');

  // Danh sách học sinh: theo danh sách Gmail + ai đã nộp mà không còn trong DS
  const ten = {};
  hocSinh.forEach(h => { ten[h._id] = h.ten || ''; });
  const nop = {}; // email -> tuanId -> phiếu
  bainop.forEach(p => {
    if (!(p.email in ten)) ten[p.email] = p.ten || '';
    (nop[p.email] = nop[p.email] || {})[p.tuanId] = p;
  });
  const emails = Object.keys(ten).sort((a, b) => (ten[a] || a).localeCompare(ten[b] || b, 'vi'));

  const bay = Date.now();
  const tieuDe = ['STT', 'Họ và tên', 'Email'].concat(dsTuan.map(t =>
    (t.ten || t._id) + '\nHạn ' + Utilities.formatDate(t.hanNop, tz, 'dd/MM HH:mm')));
  tieuDe.push('Đã nộp');
  const giaTri = [tieuDe], mau = [tieuDe.map(() => MAU.tieuDe)];

  emails.forEach((email, i) => {
    const dong = [i + 1, ten[email], email], mauDong = [MAU.trang, MAU.trang, MAU.trang];
    let soNop = 0;
    dsTuan.forEach(t => {
      const p = nop[email] && nop[email][t._id];
      const da = dapAn[t._id] || '';
      if (p) {
        soNop++;
        const tre = p.nopLuc && p.nopLuc > t.hanNop;
        let o = (tre ? '✓ trễ' : '✓');
        if (/[ABCD]/.test(da) && p.traLoi) {
          let dung = 0;
          for (let k = 0; k < t.soCau; k++) if (p.traLoi[k] !== '-' && p.traLoi[k] === da[k]) dung++;
          o += ' ' + dung + '/' + t.soCau;
        }
        dong.push(o); mauDong.push(tre ? MAU.vang : MAU.xanh);
      } else if (bay > t.hanNop.getTime()) {
        dong.push('✗'); mauDong.push(MAU.do);
      } else {
        dong.push(''); mauDong.push(MAU.trang);
      }
    });
    dong.push(soNop + '/' + dsTuan.length); mauDong.push(MAU.trang);
    giaTri.push(dong); mau.push(mauDong);
  });

  sh.clear();
  const r = sh.getRange(1, 1, giaTri.length, tieuDe.length);
  r.setValues(giaTri).setBackgrounds(mau).setVerticalAlignment('middle');
  sh.getRange(1, 1, 1, tieuDe.length).setFontWeight('bold').setWrap(true).setHorizontalAlignment('center');
  if (giaTri.length > 1) sh.getRange(2, 4, giaTri.length - 1, tieuDe.length - 3).setHorizontalAlignment('center');
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
  sh.setColumnWidth(1, 45); sh.setColumnWidth(2, 190); sh.setColumnWidth(3, 230);
  for (let c = 4; c <= tieuDe.length; c++) sh.setColumnWidth(c, 130);
  sh.setRowHeight(1, 48);
  sh.getRange(giaTri.length + 2, 1).setValue('Cập nhật lúc ' + Utilities.formatDate(new Date(), tz, 'HH:mm dd/MM/yyyy') +
    ' · xanh: đúng hạn · vàng: trễ · đỏ: quá hạn chưa nộp').setFontColor('#666666').setFontStyle('italic');
}
