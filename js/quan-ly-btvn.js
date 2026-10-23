// =========================================================================
// TRANG "QUẢN LÝ BÀI TẬP TUẦN" (quan-ly-btvn.html) — chỉ giáo viên.
//  - Giao bài tuần mới: tên, số câu, hạn nộp, link đề, đáp án.
//  - Xem ai đã nộp (đúng hạn / trễ / chưa nộp), điểm, xuất Excel.
//  - Thống kê từng câu: % đúng, học sinh hay chọn sai đáp án nào.
// Điểm luôn tính lại từ đáp án ở đây (không tin điểm do máy học sinh gửi
// lên), nên sửa đáp án sau khi giao thì điểm tự cập nhật.
// =========================================================================
(function () {
    const TEACHER_EMAIL = 'thuthuy611103@gmail.com';
    const LC = ['A', 'B', 'C', 'D'];
    let auth, db;
    try { firebase.initializeApp(window.DGNL_FIREBASE_CONFIG); auth = firebase.auth(); db = firebase.firestore(); }
    catch (e) { console.error('Không khởi tạo được Firebase', e); }

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ngayGio = t => t ? t.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const pad = n => String(n).padStart(2, '0');
    const choInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const thang10 = (dung, soCau) => Math.round(dung / soCau * 1000) / 100;

    let dsTuan = [], dapAnCua = {}, demNop = {}, dangSua = null, dangXem = null;
    let hocSinh = [];      // [{email, ten}]
    let bangHS = [], bangCau = [];

    // ---------- Đọc đáp án dán vào ----------
    // Trả về {chuoi (dài soCau, '-' = chưa có), thieu: [số câu], thua} hoặc {loi}
    function docDapAn(text, soCau) {
        const kq = Array(soCau).fill('-');
        const s = (text || '').toUpperCase();
        let thua = 0;
        if (/\d/.test(s)) {
            const re = /(\d{1,3})\s*[.\-:)\]]?\s*([ABCD])(?![A-Z])/g;
            let m, co = false;
            while ((m = re.exec(s))) { co = true; const i = +m[1] - 1; if (i >= 0 && i < soCau) kq[i] = m[2]; else thua++; }
            if (!co) return { loi: 'Không đọc được dạng "số câu + đáp án". Ví dụ đúng: 1A 2B 3.C' };
        } else {
            s.replace(/[^ABCD]/g, '').split('').forEach((c, i) => { if (i < soCau) kq[i] = c; else thua++; });
        }
        return { chuoi: kq.join(''), thieu: kq.map((c, i) => c === '-' ? i + 1 : 0).filter(Boolean), thua };
    }
    // Hiện đáp án đã lưu trong ô nhập: đủ thì chuỗi liền, thiếu thì dạng "1A 2B"
    function dapAnRaChu(da) {
        if (!da || !/[ABCD]/.test(da)) return '';
        if (!da.includes('-')) return da;
        return da.split('').map((c, i) => c === '-' ? '' : (i + 1) + c).filter(Boolean).join(' ');
    }
    function capNhatDemDapAn() {
        const t = $('f-dap-an').value.trim(), n = +$('f-so-cau').value || 120;
        if (!t) { $('f-dap-an-dem').textContent = 'Chưa nhập đáp án (có thể nhập sau).'; return; }
        const r = docDapAn(t, n);
        if (r.loi) { $('f-dap-an-dem').innerHTML = `<span class="text-danger">${r.loi}</span>`; return; }
        let m = `Đọc được ${n - r.thieu.length}/${n} câu.`;
        if (r.thieu.length) m += ` Thiếu: ${r.thieu.slice(0, 20).join(', ')}${r.thieu.length > 20 ? '…' : ''}.`;
        if (r.thua) m += ` Thừa ${r.thua} đáp án (bị bỏ qua).`;
        $('f-dap-an-dem').innerHTML = r.thieu.length || r.thua ? `<span class="text-danger">${m}</span>` : `<span class="text-success">✓ ${m}</span>`;
    }

    // ---------- Tải dữ liệu ----------
    async function taiTatCa() {
        const [sT, sD, sH] = await Promise.all([db.collection('btvn').get(), db.collection('btvn_dapan').get(), db.collection('hocsinh').get()]);
        dsTuan = sT.docs.map(d => { const x = d.data(); return { id: d.id, ten: x.ten || d.id, soCau: x.soCau || 120, hanNop: x.hanNop ? x.hanNop.toDate() : new Date(0), linkDe: x.linkDe || '' }; })
            .sort((a, b) => b.hanNop - a.hanNop);
        dapAnCua = {}; sD.docs.forEach(d => { dapAnCua[d.id] = d.data().dapAn || ''; });
        hocSinh = sH.docs.map(d => ({ email: d.id, ten: d.data().ten || '' }));
        await Promise.all(dsTuan.map(async t => {
            try { demNop[t.id] = (await db.collection('btvn_bainop').where('tuanId', '==', t.id).get()).size; } catch (e) { demNop[t.id] = '?'; }
        }));
        veDsTuan();
    }

    function veDsTuan() {
        if (!dsTuan.length) { $('ds-tuan').innerHTML = '<div class="text-muted small">Chưa giao tuần nào — tạo ở khung phía trên.</div>'; return; }
        $('ds-tuan').innerHTML = dsTuan.map(t => {
            const coDA = (dapAnCua[t.id] || '').replace(/-/g, '').length;
            const het = Date.now() > t.hanNop;
            return `<div class="tuan-row ${dangXem === t.id ? 'active' : ''}">
                <div><div class="fw-bold">${esc(t.ten)}</div>
                <div class="small text-muted">Hạn: ${ngayGio(t.hanNop)} ${het ? '<span class="badge-st st-none">đã hết hạn</span>' : '<span class="badge-st st-ok">đang mở</span>'} · ${t.soCau} câu · đã nộp: <b>${demNop[t.id] ?? 0}</b>/${hocSinh.length} · đáp án: ${coDA === t.soCau ? '✓ đủ' : `<span class="text-danger">${coDA}/${t.soCau}</span>`}</div></div>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-success" data-xem="${esc(t.id)}"><i class="fa-solid fa-table"></i> Kết quả</button>
                    <button class="btn btn-sm btn-outline-secondary" data-sua="${esc(t.id)}"><i class="fa-solid fa-pen"></i> Sửa</button>
                    <button class="btn btn-sm btn-outline-secondary" data-copy="${esc(t.id)}" title="Copy link gửi học sinh"><i class="fa-solid fa-link"></i></button>
                    <button class="btn btn-sm btn-outline-danger" data-xoa="${esc(t.id)}" title="Xoá tuần"><i class="fa-solid fa-trash"></i></button>
                </div></div>`;
        }).join('');
    }

    // ---------- Tạo / sửa ----------
    function datForm(t) {
        dangSua = t ? t.id : null;
        $('form-tieu-de').innerHTML = t ? '<i class="fa-solid fa-pen"></i> Sửa: ' + esc(t.ten) : '<i class="fa-solid fa-plus"></i> Giao bài tập tuần mới';
        $('btn-huy-sua').style.display = t ? '' : 'none';
        $('f-ten').value = t ? t.ten : '';
        $('f-so-cau').value = t ? t.soCau : 120;
        const macDinh = new Date(); macDinh.setDate(macDinh.getDate() + 7); macDinh.setHours(21, 0, 0, 0);
        $('f-han').value = choInput(t ? t.hanNop : macDinh);
        $('f-link').value = t ? t.linkDe : '';
        $('f-dap-an').value = t ? dapAnRaChu(dapAnCua[t.id]) : '';
        $('f-msg').innerHTML = '';
        capNhatDemDapAn();
        if (t) window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const linkTuan = id => location.origin + location.pathname.replace(/[^/]+$/, '') + 'btvn.html?tuan=' + encodeURIComponent(id);

    async function luu() {
        const ten = $('f-ten').value.trim(), soCau = parseInt($('f-so-cau').value, 10), han = new Date($('f-han').value);
        const linkDe = $('f-link').value.trim();
        const fmsg = (k, m) => { $('f-msg').innerHTML = `<div class="msg msg-${k}">${m}</div>`; };
        if (!ten) return fmsg('err', 'Chưa nhập tên bài.');
        if (!(soCau >= 1 && soCau <= 200)) return fmsg('err', 'Số câu phải từ 1 đến 200.');
        if (isNaN(han)) return fmsg('err', 'Chưa chọn hạn nộp.');
        if (linkDe && !/^https?:\/\//i.test(linkDe)) return fmsg('err', 'Link đề phải bắt đầu bằng https://');
        const cu = dangSua && dsTuan.find(t => t.id === dangSua);
        if (cu && cu.soCau !== soCau && demNop[cu.id] > 0) return fmsg('err', `Tuần này đã có ${demNop[cu.id]} học sinh nộp — không đổi số câu được nữa.`);
        let dapAn = '-'.repeat(soCau);
        if ($('f-dap-an').value.trim()) {
            const r = docDapAn($('f-dap-an').value, soCau);
            if (r.loi) return fmsg('err', r.loi);
            dapAn = r.chuoi;
        }
        const id = dangSua || ('tuan-' + han.getFullYear() + pad(han.getMonth() + 1) + pad(han.getDate()) + '-' + Date.now().toString(36).slice(-4));
        const btn = $('btn-luu'); btn.disabled = true;
        try {
            const b = db.batch();
            b.set(db.collection('btvn').doc(id), { ten, soCau, hanNop: firebase.firestore.Timestamp.fromDate(han), linkDe, capNhat: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            b.set(db.collection('btvn_dapan').doc(id), { dapAn });
            await b.commit();
            const daSua = !!dangSua;
            await taiTatCa();
            datForm(null);
            fmsg('ok', (daSua ? 'Đã cập nhật.' : 'Đã giao bài tuần mới.') + '\nLink gửi học sinh: ' + linkTuan(id));
            if (dangXem === id) await xemKetQua(id);
        } catch (e) {
            console.error(e);
            fmsg('err', 'Lỗi khi lưu: ' + (e.code === 'permission-denied' ? 'không có quyền — đã dán firestore.rules mới vào Firebase Console chưa?' : esc(e.message)));
        } finally { btn.disabled = false; }
    }

    async function xoa(id) {
        const t = dsTuan.find(x => x.id === id);
        if (!t || !window.confirm(`Xoá "${t.ten}"? Toàn bộ ${demNop[id] || 0} bài nộp của tuần này cũng bị xoá vĩnh viễn.`)) return;
        try {
            const nop = await db.collection('btvn_bainop').where('tuanId', '==', id).get();
            const refs = nop.docs.map(d => d.ref).concat([db.collection('btvn_dapan').doc(id), db.collection('btvn').doc(id)]);
            for (let i = 0; i < refs.length; i += 400) { const b = db.batch(); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
            if (dangXem === id) { dangXem = null; $('khung-kq').style.display = 'none'; }
            await taiTatCa();
        } catch (e) { alert('Không xoá được: ' + e.message); }
    }

    // ---------- Kết quả ----------
    async function xemKetQua(id) {
        const t = dsTuan.find(x => x.id === id); if (!t) return;
        dangXem = id; veDsTuan();
        $('khung-kq').style.display = 'block';
        $('kq-ten').textContent = t.ten;
        $('tab-hs').innerHTML = '<div class="text-muted small p-3"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';
        const snap = await db.collection('btvn_bainop').where('tuanId', '==', id).get();
        const nop = {};
        snap.docs.forEach(d => { const x = d.data(); nop[x.email] = { ten: x.ten, traLoi: x.traLoi || '', nopLuc: x.nopLuc ? x.nopLuc.toDate() : null }; });
        const da = dapAnCua[id] || '';
        const coDA = /[ABCD]/.test(da);
        const het = Date.now() > t.hanNop;

        const tenDS = new Map(hocSinh.map(h => [h.email, h.ten]));
        const emails = new Set(hocSinh.map(h => h.email).concat(Object.keys(nop)));
        bangHS = Array.from(emails, email => {
            const p = nop[email];
            const r = { email, ten: tenDS.get(email) || (p && p.ten) || '', nop: !!p, nopLuc: p && p.nopLuc, tre: !!(p && p.nopLuc && p.nopLuc > t.hanNop), dung: null, trong: null, ngoaiDS: !tenDS.has(email) };
            if (p) {
                r.trong = (p.traLoi.match(/-/g) || []).length;
                if (coDA) { r.dung = 0; for (let i = 0; i < t.soCau; i++) if (p.traLoi[i] !== '-' && p.traLoi[i] === da[i]) r.dung++; }
            }
            return r;
        }).sort((a, b) => (a.ten || a.email).localeCompare(b.ten || b.email, 'vi'));

        const daNop = bangHS.filter(r => r.nop), soTre = bangHS.filter(r => r.tre).length;
        const tb = coDA && daNop.length ? daNop.reduce((s, r) => s + r.dung, 0) / daNop.length : null;
        $('kq-tom-tat').innerHTML = `Hạn nộp ${ngayGio(t.hanNop)} · đã nộp <b>${daNop.length}</b>/${bangHS.length} (${soTre} trễ)` +
            (tb != null ? ` · trung bình <b>${tb.toFixed(1)}</b>/${t.soCau} câu đúng` : ' · <span class="text-danger">chưa có đáp án — chưa chấm được</span>') +
            ` · link gửi học sinh: <a href="${linkTuan(id)}" target="_blank">${esc(linkTuan(id))}</a>`;

        $('tab-hs').innerHTML = `<table><thead><tr><th>#</th><th>Họ và tên</th><th>Email</th><th>Trạng thái</th><th>Nộp lúc</th><th>Đúng</th><th>Thang 10</th><th>Bỏ trống</th></tr></thead><tbody>` +
            bangHS.map((r, i) => {
                const st = r.nop ? (r.tre ? ['st-late', 'Nộp trễ'] : ['st-ok', 'Đúng hạn']) : (het ? ['st-miss', 'Chưa nộp'] : ['st-none', 'Chưa nộp']);
                return `<tr><td>${i + 1}</td><td>${esc(r.ten)}${r.ngoaiDS ? ' <span class="text-muted small">(không còn trong DS)</span>' : ''}</td><td>${esc(r.email)}</td>
                    <td><span class="badge-st ${st[0]}">${st[1]}</span></td><td>${r.nopLuc ? ngayGio(r.nopLuc) : ''}</td>
                    <td>${r.dung != null ? `<b>${r.dung}</b>/${t.soCau}` : ''}</td><td>${r.dung != null ? thang10(r.dung, t.soCau) : ''}</td><td>${r.trong != null ? r.trong : ''}</td></tr>`;
            }).join('') + '</tbody></table>';

        const ds = Object.values(nop);
        bangCau = Array.from({ length: t.soCau }, (_, i) => {
            const dem = { A: 0, B: 0, C: 0, D: 0, '-': 0 };
            ds.forEach(p => { const c = p.traLoi[i] || '-'; dem[c] = (dem[c] || 0) + 1; });
            const dungLa = da[i] && da[i] !== '-' ? da[i] : '';
            const saiNhat = LC.filter(c => c !== dungLa).sort((a, b) => dem[b] - dem[a])[0];
            return { cau: i + 1, da: dungLa || '-', dem, tong: ds.length, tiLe: dungLa && ds.length ? dem[dungLa] / ds.length : null, saiNhat: dungLa && dem[saiNhat] ? saiNhat : '' };
        });
        veThongKe();
    }

    function veThongKe() {
        const rows = bangCau.slice();
        if ($('tk-sap-xep').checked) rows.sort((a, b) => (a.tiLe ?? 2) - (b.tiLe ?? 2) || a.cau - b.cau);
        const pc = (n, tong) => tong ? Math.round(n / tong * 100) + '%' : '';
        $('tk-bang').innerHTML = !bangCau.length || !bangCau[0].tong ? '<div class="text-muted small p-3">Chưa có bài nộp.</div>' :
            `<table><thead><tr><th>Câu</th><th>Đáp án</th><th>% đúng</th><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>Bỏ trống</th><th>Hay chọn sai</th></tr></thead><tbody>` +
            rows.map(r => `<tr class="${r.tiLe != null && r.tiLe < 0.5 ? 'tk-thap' : ''}"><td><b>${r.cau}</b></td><td><b>${r.da}</b></td>
                <td>${r.tiLe != null ? Math.round(r.tiLe * 100) + '%' : '—'}</td><td><div class="bar"><div style="width:${r.tiLe != null ? r.tiLe * 100 : 0}%"></div></div></td>
                ${LC.map(c => `<td class="${c === r.da ? 'text-success fw-bold' : ''}">${pc(r.dem[c], r.tong)}</td>`).join('')}
                <td>${pc(r.dem['-'], r.tong)}</td><td>${r.saiNhat ? `<b class="text-danger">${r.saiNhat}</b> (${pc(r.dem[r.saiNhat], r.tong)})` : ''}</td></tr>`).join('') + '</tbody></table>';
    }

    function xuatExcel() {
        const t = dsTuan.find(x => x.id === dangXem); if (!t) return;
        const wb = XLSX.utils.book_new();
        const a1 = [['STT', 'Họ và tên', 'Email', 'Trạng thái', 'Nộp lúc', 'Số câu đúng', 'Tổng số câu', 'Thang 10', 'Bỏ trống']];
        bangHS.forEach((r, i) => a1.push([i + 1, r.ten, r.email, r.nop ? (r.tre ? 'Nộp trễ' : 'Đúng hạn') : 'Chưa nộp', r.nopLuc ? ngayGio(r.nopLuc) : '', r.dung ?? '', t.soCau, r.dung != null ? thang10(r.dung, t.soCau) : '', r.trong ?? '']));
        const ws1 = XLSX.utils.aoa_to_sheet(a1);
        ws1['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 30 }, { wch: 11 }, { wch: 17 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 9 }];
        XLSX.utils.book_append_sheet(wb, ws1, 'Học sinh');
        const a2 = [['Câu', 'Đáp án', '% đúng', 'A', 'B', 'C', 'D', 'Bỏ trống', 'Hay chọn sai']];
        bangCau.forEach(r => a2.push([r.cau, r.da, r.tiLe != null ? Math.round(r.tiLe * 100) : '', r.dem.A, r.dem.B, r.dem.C, r.dem.D, r.dem['-'], r.saiNhat]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a2), 'Thống kê câu');
        XLSX.writeFile(wb, ('BTVN-' + t.ten).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) + '.xlsx');
    }

    // ---------- Sự kiện ----------
    $('btn-luu').addEventListener('click', luu);
    $('btn-huy-sua').addEventListener('click', () => datForm(null));
    $('f-dap-an').addEventListener('input', capNhatDemDapAn);
    $('f-so-cau').addEventListener('input', capNhatDemDapAn);
    $('tk-sap-xep').addEventListener('change', veThongKe);
    $('btn-excel').addEventListener('click', xuatExcel);
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
        $('tab-hs').style.display = b.dataset.tab === 'hs' ? '' : 'none';
        $('tab-cau').style.display = b.dataset.tab === 'cau' ? '' : 'none';
    }));
    $('ds-tuan').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.xem) xemKetQua(b.dataset.xem).catch(err => { console.error(err); $('tab-hs').innerHTML = '<div class="msg msg-err">Lỗi tải kết quả: ' + esc(err.message) + '</div>'; });
        if (b.dataset.sua) datForm(dsTuan.find(t => t.id === b.dataset.sua));
        if (b.dataset.xoa) xoa(b.dataset.xoa);
        if (b.dataset.copy) {
            navigator.clipboard.writeText(linkTuan(b.dataset.copy)).then(() => {
                b.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => { b.innerHTML = '<i class="fa-solid fa-link"></i>'; }, 1500);
            });
        }
    });

    // ---------- Đăng nhập giáo viên ----------
    const setLoading = on => { $('login-loading').style.display = on ? 'block' : 'none'; $('btn-dang-nhap').disabled = on; };
    const loginErr = m => { const b = $('login-error'); b.textContent = m; b.style.display = 'block'; };
    if (!auth) { loginErr('Chưa cấu hình Firebase.'); return; }
    auth.onAuthStateChanged(u => {
        setLoading(false);
        if (!u) { $('login-overlay').style.display = 'flex'; $('app-root').style.display = 'none'; return; }
        if ((u.email || '').toLowerCase() !== TEACHER_EMAIL) {
            const e = u.email; auth.signOut();
            loginErr('Trang này chỉ dành cho giáo viên quản trị. Email ' + e + ' không có quyền.');
            return;
        }
        $('login-overlay').style.display = 'none'; $('app-root').style.display = 'block';
        datForm(null);
        taiTatCa().catch(e => { console.error(e); $('ds-tuan').innerHTML = '<div class="msg msg-err">Không tải được dữ liệu (' + esc(e.code || e.message) + '). Đã dán firestore.rules mới vào Firebase Console chưa?</div>'; });
    });
    $('btn-dang-nhap').addEventListener('click', () => {
        $('login-error').style.display = 'none'; setLoading(true);
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(() => { setLoading(false); loginErr('Đăng nhập thất bại, vui lòng thử lại.'); });
    });
    $('btn-logout').addEventListener('click', () => { auth.signOut(); location.reload(); });
})();
