// =========================================================================
// TRANG "BÀI TẬP TUẦN" (btvn.html) — phiếu trả lời trắc nghiệm cho học sinh.
// Đề là file PDF/giấy giáo viên phát; học sinh chỉ chọn đáp án A/B/C/D cho
// từng câu rồi nộp — MỖI TUẦN NỘP ĐÚNG 1 LẦN.
//   - Nộp xong: khoảng 1 phút sau hiện SỐ CÂU ĐÚNG (Google Sheet của giáo
//     viên chấm rồi ghi vào phiếu — máy học sinh không đọc được đáp án).
//   - Đáp án từng câu + lời giải: chỉ hiện từ ngày giáo viên đặt
//     ("Hiện đáp án & lời giải từ"), thường là sau buổi sửa bài trên lớp.
// Dữ liệu (Firestore):
//   btvn/{tuan}             : ten, soCau, hanNop, linkDe, moLoiGiai, linkLoiGiai
//   btvn_dapan/{tuan}       : dapAn ("ABCD...")
//   btvn_bainop/{uid}_{tuan}: traLoi ("AB-C..." — '-' = bỏ trống), nopLuc,
//                             daCham, soDung (do Sheet ghi)
// Quyền đọc/ghi do firestore.rules kiểm soát, không chỉ ở đây.
// =========================================================================
(function () {
    const TEACHER_EMAIL = 'thuthuy611103@gmail.com';
    const LUA_CHON = ['A', 'B', 'C', 'D'];
    let auth, db, user;
    try {
        firebase.initializeApp(window.DGNL_FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (e) { console.error('Không khởi tạo được Firebase', e); }

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ngayGio = t => t ? t.toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const toDate = v => (v && v.toDate) ? v.toDate() : null;

    let dsTuan = [];          // [{id, ten, soCau, hanNop, linkDe, moLoiGiai, linkLoiGiai}]
    let phieuCua = {};        // tuanId -> {traLoi, nopLuc, daCham, soDung} | null
    let hienTai = null;
    let traLoi = [];
    let khoa = false;
    let boNghe = null;        // huỷ theo dõi phiếu đang mở

    const daMoLoiGiai = t => !!(t.moLoiGiai && Date.now() >= t.moLoiGiai.getTime());

    function trangThai(t) {
        const p = phieuCua[t.id];
        const het = Date.now() > t.hanNop.getTime();
        if (p) return p.nopLuc && p.nopLuc > t.hanNop ? ['st-late', 'Nộp trễ'] : ['st-ok', 'Đã nộp'];
        return het ? ['st-miss', 'Chưa nộp — quá hạn'] : ['st-none', 'Chưa nộp'];
    }

    const tuPhieu = d => d ? { traLoi: d.traLoi, nopLuc: toDate(d.nopLuc), daCham: !!d.daCham, soDung: typeof d.soDung === 'number' ? d.soDung : null } : null;

    async function taiDanhSach() {
        const snap = await db.collection('btvn').get();
        dsTuan = snap.docs.map(d => {
            const x = d.data();
            return { id: d.id, ten: x.ten || d.id, soCau: x.soCau || 120, hanNop: toDate(x.hanNop) || new Date(0),
                linkDe: x.linkDe || '', moLoiGiai: toDate(x.moLoiGiai), linkLoiGiai: x.linkLoiGiai || '' };
        }).sort((a, b) => b.hanNop - a.hanNop);
        await Promise.all(dsTuan.map(async t => {
            try {
                const s = await db.collection('btvn_bainop').doc(user.uid + '_' + t.id).get();
                phieuCua[t.id] = s.exists ? tuPhieu(s.data()) : null;
            } catch (e) { console.error(e); phieuCua[t.id] = null; }
        }));
        veDanhSach();
        const q = new URLSearchParams(location.search).get('tuan');
        const mo = dsTuan.find(t => t.id === q) || dsTuan.find(t => !phieuCua[t.id] && Date.now() < t.hanNop) || dsTuan[0];
        if (mo) moTuan(mo.id);
    }

    function veDanhSach() {
        if (!dsTuan.length) { $('ds-tuan').innerHTML = '<div class="text-muted small">Chưa có bài tập tuần nào.</div>'; return; }
        $('ds-tuan').innerHTML = dsTuan.map(t => {
            const [cls, nhan] = trangThai(t);
            const p = phieuCua[t.id];
            const diem = p && p.soDung != null ? ` · ${p.soDung}/${t.soCau} câu đúng` : '';
            return `<button class="tuan-item ${hienTai && hienTai.id === t.id ? 'active' : ''}" data-tuan="${esc(t.id)}">
                <div><div class="fw-bold">${esc(t.ten)}</div><div class="small text-muted">Hạn nộp: ${ngayGio(t.hanNop)}${diem}</div></div>
                <span class="badge-st ${cls}">${nhan}</span></button>`;
        }).join('');
    }

    const khoaNhap = () => 'btvn-nhap-' + (user && user.uid) + '-' + (hienTai && hienTai.id);
    function luuNhap() { try { localStorage.setItem(khoaNhap(), traLoi.join('')); $('nhap-luu').textContent = '· đã lưu nháp trên máy'; } catch (e) {} }
    function docNhap() { try { return localStorage.getItem(khoaNhap()); } catch (e) { return null; } }
    function xoaNhap() { try { localStorage.removeItem(khoaNhap()); } catch (e) {} }
    function msg(kind, html) { $('p-msg').innerHTML = html ? `<div class="msg msg-${kind}">${html}</div>` : ''; }

    async function moTuan(id) {
        hienTai = dsTuan.find(t => t.id === id);
        if (!hienTai) return;
        if (boNghe) { boNghe(); boNghe = null; }
        veDanhSach();
        const t = hienTai, p = phieuCua[t.id];
        const het = Date.now() > t.hanNop.getTime();
        $('khung-phieu').style.display = 'block';
        $('p-ten').textContent = t.ten;
        $('p-han').textContent = 'Hạn nộp: ' + ngayGio(t.hanNop) + ' · ' + t.soCau + ' câu';
        const link = $('p-link-de');
        if (t.linkDe) { link.href = t.linkDe; link.style.display = ''; } else link.style.display = 'none';
        const lg = $('p-link-lg');
        lg.style.display = (p && daMoLoiGiai(t) && t.linkLoiGiai) ? '' : 'none';
        if (t.linkLoiGiai) lg.href = t.linkLoiGiai;
        $('p-ket-qua').innerHTML = ''; msg('', ''); $('nhap-luu').textContent = '';

        const nhap = !p ? docNhap() : null;
        const goc = (p && p.traLoi) || (nhap && nhap.length === t.soCau ? nhap : '');
        traLoi = Array.from({ length: t.soCau }, (_, i) => (goc[i] && goc[i] !== '-') ? goc[i] : '-');
        khoa = !!p;   // đã nộp => khoá phiếu

        let dapAn = null;
        if (p && daMoLoiGiai(t)) {
            try {
                const s = await db.collection('btvn_dapan').doc(t.id).get();
                if (s.exists && /[ABCD]/.test(s.data().dapAn || '')) dapAn = s.data().dapAn;
            } catch (e) { console.error('Không đọc được đáp án:', e); }
        }

        if (!p && het) msg('warn', '<i class="fa-solid fa-triangle-exclamation"></i> Đã quá hạn nộp. Em vẫn có thể nộp — bài sẽ ghi nhận là <b>nộp trễ</b>.');
        else if (p) {
            const tre = p.nopLuc && p.nopLuc > t.hanNop;
            let m = `<i class="fa-solid fa-circle-check"></i> Em đã nộp${tre ? ' <b>trễ</b>' : ''} lúc ${ngayGio(p.nopLuc)}.`;
            if (!daMoLoiGiai(t)) m += t.moLoiGiai ? ` Đáp án từng câu và lời giải sẽ hiện từ ${ngayGio(t.moLoiGiai)}.` : ' Đáp án từng câu và lời giải sẽ hiện sau buổi sửa bài trên lớp.';
            msg(tre ? 'warn' : 'ok', m);
        }
        veKetQua(p, dapAn);
        vePhieu(dapAn);
        $('thanh-nop').style.display = khoa ? 'none' : 'flex';
        $('p-huong-dan').style.display = khoa ? 'none' : '';

        // Theo dõi phiếu đã nộp để hiện số câu đúng ngay khi Sheet chấm xong
        const ref = db.collection('btvn_bainop').doc(user.uid + '_' + t.id);
        if (p && p.soDung == null && ref.onSnapshot) {
            boNghe = ref.onSnapshot(s => {
                if (!s.exists || hienTai !== t) return;
                const moi = tuPhieu(s.data());
                if (moi.soDung != null) { phieuCua[t.id] = moi; veKetQua(moi, dapAn); veDanhSach(); }
            }, e => console.error(e));
        }
    }

    function veKetQua(p, dapAn) {
        const t = hienTai;
        if (!p) { $('p-ket-qua').innerHTML = ''; return; }
        let soDung = p.soDung;
        if (soDung == null && dapAn) {
            soDung = 0;
            for (let i = 0; i < t.soCau; i++) if (traLoi[i] !== '-' && traLoi[i] === dapAn[i]) soDung++;
        }
        if (soDung == null) {
            $('p-ket-qua').innerHTML = `<div class="msg msg-info"><i class="fa-solid fa-spinner fa-spin"></i> Đang chấm bài… số câu đúng sẽ hiện ở đây sau khoảng 1 phút (không cần tải lại trang).</div>`;
            return;
        }
        const diem = Math.round(soDung / t.soCau * 1000) / 100;
        $('p-ket-qua').innerHTML = `<div class="msg msg-info d-flex align-items-center gap-3 flex-wrap"><span class="diem-to">${soDung}/${t.soCau}</span>
            <span>câu đúng${dapAn ? '<br><span class="small">Ô xanh = em chọn đúng · ô đỏ = em chọn sai · viền xanh = đáp án đúng</span>' : ''}</span></div>`;
    }

    function vePhieu(dapAn) {
        const t = hienTai;
        let html = '';
        for (let i = 0; i < t.soCau; i++) {
            if (i % 10 === 0) html += `<div class="khoi-10">Câu ${i + 1} – ${Math.min(i + 10, t.soCau)}</div>`;
            html += `<div class="dong"><span class="so">${i + 1}.</span>` + LUA_CHON.map(c => {
                let cls = traLoi[i] === c ? 'chon' : '';
                if (dapAn) {
                    if (traLoi[i] === c) cls = (dapAn[i] === c) ? 'dung' : 'sai';
                    else if (dapAn[i] === c) cls = 'dapan';
                }
                return `<button type="button" class="o ${cls}" data-cau="${i}" data-c="${c}" ${khoa ? 'disabled' : ''} aria-label="Câu ${i + 1} đáp án ${c}">${c}</button>`;
            }).join('') + '</div>';
        }
        $('phieu').innerHTML = html;
        demChon();
    }

    function demChon() {
        $('dem-chon').textContent = traLoi.filter(c => c !== '-').length;
        $('tong-cau').textContent = hienTai.soCau;
    }

    $('phieu').addEventListener('click', e => {
        const b = e.target.closest('.o');
        if (!b || khoa) return;
        const i = +b.dataset.cau, c = b.dataset.c;
        traLoi[i] = traLoi[i] === c ? '-' : c;   // bấm lại lần nữa để bỏ chọn
        b.parentElement.querySelectorAll('.o').forEach(o => o.classList.toggle('chon', traLoi[i] === o.dataset.c));
        demChon();
        luuNhap();
    });

    $('btn-nop').addEventListener('click', async () => {
        const t = hienTai;
        const trong = traLoi.map((c, i) => c === '-' ? i + 1 : 0).filter(Boolean);
        const het = Date.now() > t.hanNop.getTime();
        let hoi = (trong.length ? `Còn ${trong.length} câu chưa chọn (${trong.slice(0, 15).join(', ')}${trong.length > 15 ? '…' : ''}).\n` : '') +
            'Mỗi tuần chỉ nộp 1 lần — nộp rồi KHÔNG sửa được nữa. Nộp bài?';
        if (het) hoi += '\n\n(Đã quá hạn: bài sẽ ghi nhận là nộp trễ.)';
        if (!window.confirm(hoi)) return;
        const btn = $('btn-nop'); btn.disabled = true;
        try {
            await db.collection('btvn_bainop').doc(user.uid + '_' + t.id).set({
                uid: user.uid,
                email: (user.email || '').toLowerCase(),
                ten: (user.displayName || '').slice(0, 100),
                tuanId: t.id,
                traLoi: traLoi.join(''),
                nopLuc: firebase.firestore.FieldValue.serverTimestamp(),
                daCham: false
            });
            xoaNhap();
            phieuCua[t.id] = { traLoi: traLoi.join(''), nopLuc: new Date(), daCham: false, soDung: null };
            await moTuan(t.id);
        } catch (e) {
            console.error(e);
            msg('err', 'Không nộp được: ' + (e.code === 'permission-denied'
                ? 'em đã nộp bài tuần này rồi, hoặc Gmail chưa được đăng ký. Tải lại trang để xem trạng thái mới nhất.'
                : esc(e.message)) + ' — Đáp án em chọn vẫn còn trên trang, đừng tắt trang.');
        } finally { btn.disabled = false; }
    });

    $('ds-tuan').addEventListener('click', e => {
        const b = e.target.closest('[data-tuan]');
        if (b) moTuan(b.dataset.tuan);
    });

    // ---------------- Đăng nhập (giống trang chính) ----------------
    async function kiemTraDuocPhep(u) {
        const email = (u.email || '').trim().toLowerCase();
        if (!email || !u.emailVerified) return 'khong-co';
        if (email === TEACHER_EMAIL) return 'ok';
        try { return (await db.collection('hocsinh').doc(email).get()).exists ? 'ok' : 'khong-co'; }
        catch (e) { return e && e.code === 'permission-denied' ? 'khong-co' : 'loi'; }
    }
    const setLoading = on => { $('login-loading').style.display = on ? 'block' : 'none'; $('btn-dang-nhap').disabled = on; };
    const loginErr = m => { const b = $('login-error'); b.textContent = m; b.style.display = 'block'; };

    if (!auth) { loginErr('Chưa cấu hình Firebase.'); return; }
    auth.onAuthStateChanged(async u => {
        if (!u) { setLoading(false); $('login-overlay').style.display = 'flex'; $('app-root').style.display = 'none'; return; }
        setLoading(true);
        const kq = await kiemTraDuocPhep(u);
        setLoading(false);
        if (kq !== 'ok') {
            const email = u.email; await auth.signOut();
            loginErr(kq === 'loi' ? 'Lỗi kết nối, vui lòng tải lại trang.' : 'Email ' + email + ' chưa được đăng ký sử dụng web này.');
            return;
        }
        user = u;
        $('user-email').textContent = u.displayName || u.email;
        $('login-overlay').style.display = 'none';
        $('app-root').style.display = 'block';
        taiDanhSach().catch(e => { console.error(e); $('ds-tuan').innerHTML = '<div class="msg msg-err">Không tải được danh sách bài tập (' + esc(e.code || e.message) + ').</div>'; });
    });
    $('btn-dang-nhap').addEventListener('click', () => {
        $('login-error').style.display = 'none'; setLoading(true);
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err => { setLoading(false); loginErr('Đăng nhập thất bại, vui lòng thử lại.'); console.error(err); });
    });
    $('btn-logout').addEventListener('click', () => { auth.signOut(); location.reload(); });
})();
