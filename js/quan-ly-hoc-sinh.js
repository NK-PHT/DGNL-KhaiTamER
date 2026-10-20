// =========================================================================
// TRANG "DANH SÁCH GMAIL HỌC SINH" — chỉ dành cho giáo viên quản trị.
// Thêm / xoá Gmail được phép vào web. Dữ liệu nằm trong Firestore, collection
// "hocsinh", mỗi tài liệu có MÃ = email viết thường, gồm: ten, themLuc.
// Quyền thêm/xoá/xem cả danh sách được Firestore Rules (firestore.rules)
// giới hạn cho đúng Gmail giáo viên — kiểm tra ở đây chỉ để hiện thông báo.
// =========================================================================
(function () {
    const TEACHER_EMAIL = 'thuthuy611103@gmail.com';
    const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;

    let auth, db;
    try {
        firebase.initializeApp(window.DGNL_FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (e) {
        console.error('Không khởi tạo được Firebase. Kiểm tra js/firebase-config.js', e);
    }

    let allRows = [];

    const $ = id => document.getElementById(id);
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function showLoginError(msg) { const b = $('login-error'); b.textContent = msg; b.style.display = 'block'; }
    function setLoading(on) { $('login-loading').style.display = on ? 'block' : 'none'; const b = $('btn-dang-nhap'); if (b) b.disabled = on; }
    function showMsg(kind, text) { const b = $('msg-them'); b.className = 'msg-box msg-' + kind; b.textContent = text; b.style.display = 'block'; }
    function formatNgay(t) { try { if (t && t.toDate) return t.toDate().toLocaleDateString('vi-VN'); } catch (e) {} return ''; }

    // Khoảng cách chỉnh sửa (để bắt lỗi gõ nhầm như "gmai.com", "gmial.com")
    function khoangCach(a, b) {
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0)));
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return d[a.length][b.length];
    }

    // Đọc nội dung ô nhập -> { hopLe: [{email, ten}], loi: [chuỗi] }
    function docDanhSach(text) {
        const hopLe = [], loi = [], daThay = new Set();
        text.split(/\r?\n/).forEach((dong, i) => {
            const raw = dong.trim();
            if (!raw) return;
            const phan = raw.split(/[,;\t]+/).map(s => s.trim()).filter(Boolean);
            const viTri = phan.findIndex(p => p.includes('@'));
            if (viTri === -1) { loi.push(`Dòng ${i + 1}: không thấy email — "${raw}"`); return; }
            const email = phan[viTri].toLowerCase().replace(/^mailto:/, '');
            const ten = phan.filter((_, k) => k !== viTri).join(' ').trim();
            if (!EMAIL_RE.test(email)) { loi.push(`Dòng ${i + 1}: email không hợp lệ — "${email}"`); return; }
            const mien = email.split('@')[1];
            if (mien !== 'gmail.com' && khoangCach(mien, 'gmail.com') <= 2) {
                loi.push(`Dòng ${i + 1}: "${email}" — có phải gõ nhầm "@gmail.com" không? (chưa thêm, sửa lại rồi thêm)`);
                return;
            }
            if (daThay.has(email)) return;
            daThay.add(email);
            hopLe.push({ email, ten });
        });
        return { hopLe, loi };
    }

    async function taiDanhSach() {
        try {
            const snap = await db.collection('hocsinh').get();
            allRows = snap.docs.map(d => Object.assign({ email: d.id }, d.data()))
                .sort((a, b) => (a.ten || a.email).localeCompare(b.ten || b.email, 'vi'));
            $('loading-box').style.display = 'none';
            $('err-box').style.display = 'none';
            $('bang-wrap').style.display = 'block';
            renderBang();
        } catch (e) {
            console.error('Lỗi khi tải danh sách học sinh:', e);
            $('loading-box').style.display = 'none';
            $('err-box').style.display = 'block';
            $('err-box').textContent = 'Không tải được danh sách. Nếu báo lỗi quyền (permission), hãy chắc chắn đã dán nội dung file firestore.rules vào Firebase Console → Firestore Database → Rules → Publish.';
        }
    }

    function renderBang() {
        const q = ($('o-tim').value || '').trim().toLowerCase();
        const rows = q ? allRows.filter(r => r.email.includes(q) || (r.ten || '').toLowerCase().includes(q)) : allRows;
        $('tong-so').textContent = allRows.length;
        $('table-body').innerHTML = rows.length ? rows.map((r, i) => `<tr>
                <td>${i + 1}</td>
                <td class="email">${esc(r.email)}</td>
                <td>${esc(r.ten || '')}</td>
                <td>${formatNgay(r.themLuc)}</td>
                <td class="text-end"><button class="btn btn-outline-danger btn-sm" data-xoa="${esc(r.email)}"><i class="fa-solid fa-trash"></i> Xoá</button></td>
            </tr>`).join('')
            : `<tr><td colspan="5" class="text-center text-muted py-4">${allRows.length ? 'Không tìm thấy.' : 'Chưa có học sinh nào — thêm ở khung phía trên.'}</td></tr>`;
    }

    async function themHocSinh() {
        const { hopLe, loi } = docDanhSach($('o-nhap').value);
        if (!hopLe.length) { showMsg(loi.length ? 'err' : 'warn', loi.length ? loi.join('\n') : 'Chưa nhập email nào.'); return; }
        const btn = $('btn-them'); btn.disabled = true;
        try {
            const daCo = new Set(allRows.map(r => r.email));
            for (let i = 0; i < hopLe.length; i += 400) {
                const batch = db.batch();
                hopLe.slice(i, i + 400).forEach(({ email, ten }) => {
                    const ref = db.collection('hocsinh').doc(email);
                    const data = { ten: ten || '' };
                    if (!daCo.has(email)) data.themLuc = firebase.firestore.FieldValue.serverTimestamp();
                    else if (!ten) return; // đã có, không đổi gì
                    batch.set(ref, data, { merge: true });
                });
                await batch.commit();
            }
            const moi = hopLe.filter(h => !daCo.has(h.email)).length;
            let text = `Đã thêm ${moi} học sinh mới` + (hopLe.length - moi ? `, ${hopLe.length - moi} email đã có sẵn (cập nhật tên nếu có).` : '.');
            if (loi.length) text += '\n\nCác dòng chưa thêm:\n' + loi.join('\n');
            showMsg(loi.length ? 'warn' : 'ok', text);
            // Chỉ giữ lại các dòng lỗi trong ô nhập để sửa
            $('o-nhap').value = loi.length ? $('o-nhap').value.split(/\r?\n/).filter((_, i) => loi.some(l => l.startsWith(`Dòng ${i + 1}:`))).join('\n') : '';
            await taiDanhSach();
        } catch (e) {
            console.error(e);
            showMsg('err', 'Lỗi khi lưu: ' + (e.code === 'permission-denied' ? 'không có quyền — kiểm tra Firestore Rules và Gmail giáo viên.' : e.message));
        } finally {
            btn.disabled = false;
        }
    }

    async function xoaHocSinh(email) {
        if (!window.confirm('Xoá ' + email + ' khỏi danh sách? Học sinh này sẽ không vào web được nữa (kết quả cũ vẫn giữ nguyên).')) return;
        try {
            await db.collection('hocsinh').doc(email).delete();
            allRows = allRows.filter(r => r.email !== email);
            renderBang();
        } catch (e) {
            console.error(e);
            alert('Không xoá được: ' + e.message);
        }
    }

    function showApp() {
        $('login-overlay').style.display = 'none';
        $('app-root').style.display = 'block';
        taiDanhSach();
    }

    if (!auth) { showLoginError('Chưa cấu hình Firebase (xem js/firebase-config.js).'); return; }

    auth.onAuthStateChanged(function (user) {
        setLoading(false);
        if (!user) {
            $('login-overlay').style.display = 'flex';
            $('app-root').style.display = 'none';
            return;
        }
        if ((user.email || '').trim().toLowerCase() !== TEACHER_EMAIL) {
            const email = user.email;
            auth.signOut();
            showLoginError('Trang này chỉ dành cho giáo viên quản trị. Email ' + email + ' không có quyền truy cập.');
            return;
        }
        showApp();
    });

    $('btn-dang-nhap').addEventListener('click', function () {
        $('login-error').style.display = 'none';
        setLoading(true);
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function (err) {
            setLoading(false);
            console.error(err);
            showLoginError(err.code === 'auth/unauthorized-domain'
                ? 'Tên miền này chưa được thêm vào Firebase → Authentication → Settings → Authorized domains.'
                : 'Đăng nhập thất bại, vui lòng thử lại.');
        });
    });
    $('btn-logout').addEventListener('click', function () { auth.signOut(); location.reload(); });
    $('btn-them').addEventListener('click', themHocSinh);
    $('o-tim').addEventListener('input', renderBang);
    $('table-body').addEventListener('click', function (e) {
        const b = e.target.closest('[data-xoa]');
        if (b) xoaHocSinh(b.getAttribute('data-xoa'));
    });
})();
