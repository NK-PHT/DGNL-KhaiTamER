// =========================================================================
// TỰ LUYỆN CÁC MÔN NGOÀI TOÁN: Tiếng Việt, Tiếng Anh, Tư duy khoa học,
// và đề đầy đủ 120 câu — mỗi lần bấm "Tạo đề" TRỘN NGẪU NHIÊN từ tất cả
// các đề đang có, nhưng TRỘN THEO ĐÚNG VỊ TRÍ CÂU để đề luôn đúng ma trận
// đề thật: câu/cụm ở vị trí nào chỉ lấy từ đúng vị trí đó của một đề khác
// (VD cụm đọc hiểu câu 21–25 chỉ thay bằng cụm 21–25 của đề khác; cụm Hóa
// 103–105 chỉ thay bằng cụm 103–105). Cụm dùng chung đoạn văn giữ nguyên.
// Thêm đề mới vào data/de-mon/ là kho câu tự lớn lên, không cần sửa gì.
//
// Dữ liệu: data/de-mon/manifest.js + data/de-mon/lN.js (tải khi cần), phần
// Toán + Logic (câu 61–102) lấy từ data/de-that.js.
//   Tiếng Việt : câu 1–30         Tiếng Anh : câu 31–60
//   Toán       : câu 61–90        Tư duy KH : câu 91–102 (logic, số liệu)
//                                            + câu 103–120 (suy luận KH)
// (Làm chung 1 đề cho cả lớp: dùng "Bài tập tuần".)
// =========================================================================
(function () {
    const MON = {
        tv: { ten: 'Tiếng Việt', bd: 1, phut: 38 },
        anh: { ten: 'Tiếng Anh', bd: 31, phut: 38 },
        kh: { ten: 'Tư duy khoa học', bd: 91, phut: 38 },
        full: { ten: 'Đề đầy đủ 120 câu', bd: 1, phut: 150 }
    };
    const SO_CAU = { tv: 30, anh: 30, kh: 18 };
    const $ = id => document.getElementById(id);
    const dsDe = () => window.DGNL_DE_MON_MANIFEST || [];
    const demCau = nhom => (nhom || []).reduce((s, g) => s + g.cauHoi.length, 0);
    const ngauNhien = arr => arr[Math.floor(Math.random() * arr.length)];

    // ---- Trộn theo vị trí ----
    // dsPhan: mảng các "phần" (mỗi phần = mảng nhóm câu của 1 đề, đủ số câu).
    // Lấy cấu trúc nhóm của 1 phần ngẫu nhiên làm khung; với mỗi nhóm trong
    // khung (bắt đầu ở vị trí p, gồm s câu), chọn ngẫu nhiên trong mọi đề 1
    // nhóm cũng bắt đầu ở p và có đúng s câu.
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

    // Phần Toán (42 câu = 30 Toán + 12 Logic) của các đề trong de-that.js
    function cacPhanToan() {
        return (window.DGNL_DE_THAT || []).map(d => d.nhom).filter(n => demCau(n) === 42);
    }
    function tachToanLogic(nhom42) {
        let n = 0; const toan = [], logic = [];
        nhom42.forEach(g => { (n < 30 ? toan : logic).push(g); n += g.cauHoi.length; });
        return { toan, logic };
    }

    let dangNap = null;
    function napTatCa() {
        window.DGNL_DE_MON = window.DGNL_DE_MON || {};
        if (!dangNap) {
            dangNap = Promise.all(dsDe().map(m => window.DGNL_DE_MON[m.id] ? Promise.resolve() :
                napMotFileDuLieu(m.file).catch(e => console.error('Không tải được', m.file, e))))
                .then(() => dsDe().map(m => window.DGNL_DE_MON[m.id]).filter(Boolean));
            dangNap.catch(() => { dangNap = null; });
        }
        return dangNap;
    }
    const cacPhan = (de, mon) => de.filter(d => demCau(d[mon]) === SO_CAU[mon]).map(d => d[mon]);

    function soDeCo(mon) {
        const so = m => m.so || {};
        if (mon === 'full') return Math.min(dsDe().filter(m => so(m).tv === 30).length, dsDe().filter(m => so(m).kh === 18).length);
        return dsDe().filter(m => so(m)[mon] === SO_CAU[mon]).length;
    }

    function capNhatGiaoDien() {
        const mon = $('select-mon').value;
        const laToan = mon === 'toan';
        $('wrap-chuyen-de').style.display = laToan ? '' : 'none';
        $('wrap-de-mon').style.display = laToan ? 'none' : '';
        if (laToan) {
            if (typeof capNhatHienThiTheoCheDo === 'function') capNhatHienThiTheoCheDo();
            $('btn-generate').disabled = false;
            return;
        }
        $('wrap-so-cau').style.display = 'none';
        $('wrap-check-timer').style.display = 'none';
        $('timer-minutes-wrap').style.display = 'none';
        const n = soDeCo(mon), t = MON[mon];
        $('ghi-chu-de-mon').textContent = !n ? 'Chưa có đề nào cho mục này.'
            : `Mỗi lần tạo là một đề mới, trộn ngẫu nhiên từ ${n} đề thi thử nhưng vẫn đúng thứ tự và dạng câu như đề thật. Đếm giờ ${t.phut} phút.`;
        $('btn-generate').disabled = !n;
    }

    const danNhan = (nhom, tieuDe, phan) => nhom.map((g, i) => Object.assign({}, g, { phan, tieuDePhan: i === 0 ? tieuDe : '' }));

    async function taoDe() {
        const mon = $('select-mon').value;
        const t = MON[mon];
        const btn = $('btn-generate'); btn.disabled = true;
        if (typeof THONG_TIN_MAY_CHU !== 'undefined' && THONG_TIN_MAY_CHU) {
            try {
                const d = await window.DGNL_MAY_CHU.layDe({ mon });
                batDauLamBai(d.ten, d.nhom.map(xaoTronDapAnNhom), true, d.phut, d.bd);
            } catch (e) {
                console.error(e);
                alert(e.message || 'Không tạo được đề, vui lòng thử lại.');
            } finally {
                btn.disabled = false;
            }
            return;
        }
        try {
            const de = await napTatCa();
            let groups = [], bd = t.bd;
            if (mon === 'tv' || mon === 'anh') {
                groups = danNhan(tronTheoViTri(cacPhan(de, mon)), '', t.ten);
            } else if (mon === 'kh') {
                const logic = tronTheoViTri(cacPhanToan().map(n => tachToanLogic(n).logic));
                bd = 103 - demCau(logic);
                groups = danNhan(logic, 'Logic, phân tích số liệu', 'Logic, số liệu')
                    .concat(danNhan(tronTheoViTri(cacPhan(de, 'kh')), 'Suy luận khoa học', 'Suy luận khoa học'));
            } else if (mon === 'full') {
                const { toan: toan30, logic } = tachToanLogic(tronTheoViTri(cacPhanToan()));
                groups = danNhan(tronTheoViTri(cacPhan(de, 'tv')), 'PHẦN 1 · Tiếng Việt (câu 1–30)', 'Tiếng Việt')
                    .concat(danNhan(tronTheoViTri(cacPhan(de, 'anh')), 'PHẦN 1 · Tiếng Anh (câu 31–60)', 'Tiếng Anh'))
                    .concat(danNhan(toan30, 'PHẦN 2 · Toán học (câu 61–90)', 'Toán'))
                    .concat(danNhan(logic, 'PHẦN 3 · Logic, phân tích số liệu (câu 91–102)', 'Logic, số liệu'))
                    .concat(danNhan(tronTheoViTri(cacPhan(de, 'kh')), 'PHẦN 3 · Suy luận khoa học (câu 103–120)', 'Suy luận khoa học'));
            }
            if (!groups.length) { alert('Chưa có đề cho mục này.'); return; }
            batDauLamBai(`${t.ten} — đề trộn ngẫu nhiên`, groups.map(xaoTronDapAnNhom), true, t.phut, bd);
        } catch (e) {
            console.error(e);
            alert('Không tải được đề, vui lòng tải lại trang (Ctrl+F5) rồi thử lại.');
        } finally {
            btn.disabled = false;
        }
    }

    window.DGNL_MON_KHAC = { taoDe, tronTheoViTri, cacPhanToan };
    $('select-mon').addEventListener('change', capNhatGiaoDien);
})();
