// =========================================================================
// TRANG "BÀI TẬP TUẦN" (btvn.html) — phiếu trả lời trắc nghiệm cho học sinh.
// Đề là file PDF/giấy giáo viên phát; học sinh chỉ chọn đáp án A/B/C/D cho
// từng câu rồi nộp. Dữ liệu (Firestore):
//   btvn/{tuan}          : ten, soCau, hanNop, linkDe
//   btvn_dapan/{tuan}    : dapAn ("ABCD..." — chỉ đọc được sau hạn + đã nộp)
//   btvn_bainop/{uid}_{tuan}: traLoi ("AB-C..." — '-' = bỏ trống), nopLuc
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

    let dsTuan = [];          // [{id, ten, soCau, hanNop: Date, linkDe}]
    let phieuCua = {};        // tuanId -> {traLoi, nopLuc: Date} | null
    let hienTai = null;       // tuần đang mở
    let traLoi = [];          // mảng ký tự đang chọn
    let khoa = false;

    function trangThai(t) {
        const p = phieuCua[t.id];
        const het = Date.now() > t.hanNop.getTime();
        if (p) return p.nopLuc && p.nopLuc > t.hanNop ? ['st-late', 'Nộp trễ'] : ['st-ok', 'Đã nộp'];
        return het ? ['st-miss', 'Chưa nộp — quá hạn'] : ['st-none', 'Chưa nộp'];
    }

    async function taiDanhSach() {
        const snap = await db.collection('btvn').get();
        dsTuan = snap.docs.map(d => {
            const x = d.data();
            return { id: d.id, ten: x.ten || d.id, soCau: x.soCau || 120, hanNop: x.hanNop ? x.hanNop.toDate() : new Date(0), linkDe: x.linkDe || '' };
        }).sort((a, b) => b.hanNop - a.hanNop);
        await Promise.all(dsTuan.map(async t => {
            try {
                const s = await db.collection('btvn_bainop').doc(user.uid + '_' + t.id).get();
                phieuCua[t.id] = s.exists ? { traLoi: s.data().traLoi, nopLuc: s.data().nopLuc ? s.data().nopLuc.toDate() : null } : null;
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
            return `<button class="tuan-item ${hienTai && hienTai.id === t.id ? 'active' : ''}" data-tuan="${esc(t.id)}">
                <div><div class="fw-bold">${esc(t.ten)}</div><div class="small text-muted">Hạn nộp: ${ngayGio(t.hanNop)}</div></div>
                <span class="badge-st ${cls}">${nhan}</span></button>`;
        }).join('');
    }

    const khoaNhap = () => 'btvn-nhap-' + (user && user.uid) + '-' + (hienTai && hienTai.id);
    function luuNhap() { try { localStorage.setItem(khoaNhap(), traLoi.join('')); $('nhap-luu').textContent = '· đã lưu nháp trên máy'; } catch (e) {} }
    function docNhap() { try { return localStorage.getItem(khoaNhap()); } catch (e) { return null; } }
    function xoaNhap() { try { localStorage.removeItem(khoaNhap()); } catch (e) {} }

    async function moTuan(id) {
        hienTai = dsTuan.find(t => t.id === id);
        if (!hienTai) return;
        veDanhSach();
        const t = hienTai, p = phieuCua[t.id];
        const het = Date.now() > t.hanNop.getTime();
        $('khung-phieu').style.display = 'block';
        $('p-ten').textContent = t.ten;
        $('p-han').textContent = 'Hạn nộp: ' + ngayGio(t.hanNop) + ' · ' + t.soCau + ' câu';
        const link = $('p-link-de');
        if (t.linkDe) { link.href = t.linkDe; link.style.display = ''; } else link.style.display = 'none';
        $('p-ket-qua').innerHTML = ''; $('p-msg').innerHTML = ''; $('nhap-luu').textContent = '';

        const nhap = !p ? docNhap() : null;
        const goc = (p && p.traLoi) || (nhap && nhap.length === t.soCau ? nhap : '');
        traLoi = Array.from({ length: t.soCau }, (_, i) => (goc[i] && goc[i] !== '-') ? goc[i] : '-');

        khoa = !!(p && het);   // nộp rồi + hết hạn => khoá, xem kết quả
        let dapAn = null;
        if (khoa) {
            try {
                const s = await db.collection('btvn_dapan').doc(t.id).get();
                if (s.exists) dapAn = s.data().dapAn || null;
            } catch (e) { console.error('Không đọc được đáp án:', e); }
        }

        if (p && !het) msg('ok', `<i class="fa-solid fa-circle-check"></i> Em đã nộp lúc ${ngayGio(p.nopLuc)}. Có thể sửa và nộp lại trước hạn. Điểm và đáp án sẽ hiện sau khi hết hạn.`);
        else if (p && het && p.nopLuc > t.hanNop) msg('warn', `Em nộp trễ lúc ${ngayGio(p.nopLuc)}.`);
        else if (p && het) msg('ok', `Em đã nộp đúng hạn lúc ${ngayGio(p.nopLuc)}.`);
        else if (!p && het) msg('warn', '<i class="fa-solid fa-triangle-exclamation"></i> Đã quá hạn nộp. Em vẫn có thể nộp (sẽ ghi nhận <b>nộp trễ</b>) — nộp trễ chỉ được nộp <b>1 lần</b>, kiểm tra kỹ trước khi bấm.');

        if (khoa && dapAn) {
            let dung = 0;
            for (let i = 0; i < t.soCau; i++) if (traLoi[i] !== '-' && traLoi[i] === dapAn[i]) dung++;
            const diem = Math.round(dung / t.soCau * 1000) / 100;
            $('p-ket-qua').innerHTML = `<div class="msg msg-info d-flex align-items-center gap-3 flex-wrap"><span class="diem-to">${dung}/${t.soCau}</span><span>câu đúng · thang 10: <b>${diem}</b><br><span class="small">Ô xanh = em chọn đúng · ô đỏ = em chọn sai · viền xanh = đáp án đúng</span></span></div>`;
        } else if (khoa) {
            $('p-ket-qua').innerHTML = '<div class="msg msg-info">Giáo viên chưa nhập đáp án tuần này — quay lại sau nhé.</div>';
        }
        vePhieu(dapAn);
        $('thanh-nop').style.display = khoa ? 'none' : 'flex';
        $('p-huong-dan').style.display = khoa ? 'none' : '';
    }

    function msg(kind, html) { $('p-msg').innerHTML = `<div class="msg msg-${kind}">${html}</div>`; }

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
        if (!phieuCua[hienTai.id]) luuNhap();
    });

    $('btn-nop').addEventListener('click', async () => {
        const t = hienTai;
        const trong = traLoi.map((c, i) => c === '-' ? i + 1 : 0).filter(Boolean);
        const het = Date.now() > t.hanNop.getTime();
        let hoi = trong.length ? `Còn ${trong.length} câu chưa chọn (${trong.slice(0, 15).join(', ')}${trong.length > 15 ? '…' : ''}). Vẫn nộp?` : 'Nộp bài?';
        if (het) hoi += '\n\nĐã quá hạn: bài sẽ ghi NỘP TRỄ và không sửa lại được.';
        if (!window.confirm(hoi)) return;
        const btn = $('btn-nop'); btn.disabled = true;
        try {
            await db.collection('btvn_bainop').doc(user.uid + '_' + t.id).set({
                uid: user.uid,
                email: (user.email || '').toLowerCase(),
                ten: (user.displayName || '').slice(0, 100),
                tuanId: t.id,
                traLoi: traLoi.join(''),
                nopLuc: firebase.firestore.FieldValue.serverTimestamp()
            });
            xoaNhap();
            phieuCua[t.id] = { traLoi: traLoi.join(''), nopLuc: new Date() };
            await moTuan(t.id);
        } catch (e) {
            console.error(e);
            msg('err', 'Không nộp được: ' + (e.code === 'permission-denied'
                ? 'không có quyền (có thể đã hết hạn và em đã nộp rồi, hoặc Gmail chưa được đăng ký). Tải lại trang để xem trạng thái mới nhất.'
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
