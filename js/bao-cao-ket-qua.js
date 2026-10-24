// =========================================================================
// TRANG "BÁO CÁO KẾT QUẢ HỌC SINH" — chỉ dành cho giáo viên quản trị.
// Đăng nhập bằng đúng Gmail quản trị (TEACHER_EMAIL) mới xem/xuất được toàn
// bộ kết quả của tất cả học sinh. Quyền đọc toàn bộ collection "ketqua" này
// PHẢI được cấp trong Firestore Security Rules (xem HUONG_DAN.md) — nếu
// chưa cấp, trang sẽ báo lỗi "Bạn không có quyền xem dữ liệu này".
// =========================================================================
(function () {
    const TEACHER_EMAIL = 'thuthuy611103@gmail.com';

    let app, auth, db;
    try {
        app = firebase.initializeApp(window.DGNL_FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (e) {
        console.error('Không khởi tạo được Firebase. Kiểm tra js/firebase-config.js', e);
    }

    let allRows = [];

    function showLoginError(msg) {
        const box = document.getElementById('login-error');
        box.textContent = msg;
        box.style.display = 'block';
    }
    function setLoading(isLoading) {
        document.getElementById('login-loading').style.display = isLoading ? 'block' : 'none';
        const btn = document.getElementById('btn-dang-nhap');
        if (btn) btn.disabled = isLoading;
    }
    function showErr(msg) {
        document.getElementById('loading-box').style.display = 'none';
        const err = document.getElementById('err-box');
        err.style.display = 'block';
        err.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;color:#ef4444;"></i><p class="mt-3">${msg}</p>`;
    }

    function formatNgay(thoiDiem) {
        try { if (thoiDiem && thoiDiem.toDate) return thoiDiem.toDate().toLocaleString('vi-VN'); } catch (e) {}
        return '';
    }
    function formatThoiGian(giay) {
        if (!giay && giay !== 0) return '';
        const p = Math.floor(giay / 60), g = giay % 60;
        return `${p} phút ${g} giây`;
    }

    async function taiDuLieu() {
        try {
            const snap = await db.collection('ketqua').orderBy('thoiDiem', 'desc').limit(5000).get();
            allRows = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
            renderBang();
        } catch (e) {
            console.error('Lỗi khi tải dữ liệu kết quả:', e);
            showErr('Bạn không có quyền xem dữ liệu này, hoặc đã có lỗi xảy ra. Hãy chắc chắn Firestore Security Rules đã được cấu hình đúng cho Gmail quản trị.');
        }
    }

    function renderBang() {
        document.getElementById('loading-box').style.display = 'none';
        document.getElementById('content-box').style.display = 'block';
        document.getElementById('tong-so').textContent = `Tổng cộng: ${allRows.length} lượt nộp bài`;

        const origin = location.origin + location.pathname.replace(/[^/]+$/, '');
        const tbody = document.getElementById('table-body');
        tbody.innerHTML = allRows.map((r, i) => {
            const good = r.soCau ? (r.soDung || 0) / r.soCau >= 0.5 : false;
            const xemLai = (r.chiTiet && r.chiTiet.length)
                ? `<a href="${origin}xem-lai.html?id=${encodeURIComponent(r.id)}" target="_blank">Xem lại</a>`
                : '<span class="text-muted">(không có)</span>';
            return `<tr>
                <td>${i + 1}</td>
                <td>${formatNgay(r.thoiDiem)}</td>
                <td>${r.ten || ''}</td>
                <td>${r.email || ''}</td>
                <td>${r.chuyenDe || ''}</td>
                <td class="${good ? 'score-good' : 'score-bad'}">${r.soDung ?? ''}/${r.soCau ?? ''}</td>
                <td>${formatThoiGian(r.thoiGianLamBai)}</td>
                <td>${xemLai}</td>
            </tr>`;
        }).join('');
    }

    function xuatExcel() {
        const origin = location.origin + location.pathname.replace(/[^/]+$/, '');
        const header = ['Thời gian nộp', 'Họ và tên', 'Email', 'Đề đã làm', 'Số câu đúng', 'Tổng số câu', 'Thời gian làm bài (giây)', 'Link xem lại'];
        const aoa = [header];
        allRows.forEach(r => {
            aoa.push([
                formatNgay(r.thoiDiem),
                r.ten || '',
                r.email || '',
                r.chuyenDe || '',
                r.soDung ?? '',
                r.soCau ?? '',
                r.thoiGianLamBai ?? '',
                (r.chiTiet && r.chiTiet.length) ? `${origin}xem-lai.html?id=${r.id}` : ''
            ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Gắn link bấm được (hyperlink thật) cho cột "Link xem lại"
        for (let i = 1; i < aoa.length; i++) {
            const url = aoa[i][8];
            if (url) {
                const cellRef = XLSX.utils.encode_cell({ r: i, c: 8 });
                ws[cellRef].l = { Target: url };
            }
        }
        ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 26 }, { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kết quả');
        const tenFile = 'ket-qua-hoc-sinh-' + new Date().toISOString().slice(0, 10) + '.xlsx';
        XLSX.writeFile(wb, tenFile);
    }

    function showApp() {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-root').style.display = 'block';
        taiDuLieu();
    }
    function showLogin() {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app-root').style.display = 'none';
    }

    if (auth) {
        auth.onAuthStateChanged(function (user) {
            setLoading(false);
            if (user) {
                if ((user.email || '').trim().toLowerCase() !== TEACHER_EMAIL) {
                    auth.signOut();
                    showLoginError('Trang này chỉ dành cho giáo viên quản trị. Email ' + user.email + ' không có quyền truy cập.');
                    return;
                }
                showApp();
            } else {
                showLogin();
            }
        });

        const btnDangNhap = document.getElementById('btn-dang-nhap');
        if (btnDangNhap) {
            btnDangNhap.addEventListener('click', function () {
                document.getElementById('login-error').style.display = 'none';
                setLoading(true);
                const provider = new firebase.auth.GoogleAuthProvider();
                auth.signInWithPopup(provider).catch(function (err) {
                    setLoading(false);
                    console.error(err);
                    showLoginError('Đăng nhập thất bại, vui lòng thử lại.');
                });
            });
        }
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) btnLogout.addEventListener('click', function () { auth.signOut(); location.reload(); });
        const btnXuat = document.getElementById('btn-xuat-excel');
        if (btnXuat) btnXuat.addEventListener('click', xuatExcel);
    } else {
        showLoginError('Chưa cấu hình Firebase (xem js/firebase-config.js).');
    }
})();
