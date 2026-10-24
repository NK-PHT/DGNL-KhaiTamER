// =========================================================================
// TỰ LUYỆN CÁC MÔN NGOÀI TOÁN: Tiếng Việt, Tiếng Anh, Tư duy khoa học,
// và đề đầy đủ 120 câu.
// Dữ liệu: data/de-mon/manifest.js (danh sách đề) + data/de-mon/lN.js (nội
// dung từng đề, chỉ tải khi học sinh chọn đề đó). Được tạo tự động từ các
// file "ĐÁP ÁN" (Word) của các lần thi thử bằng công cụ chuyển đổi.
// Mỗi môn lấy NGUYÊN phần của 1 đề (giữ đúng thứ tự, đoạn văn dùng chung)
// để học sinh làm giống đề thật:
//   Tiếng Việt  : câu 1–30        Tiếng Anh : câu 31–60
//   Toán        : câu 61–90 (phần Toán có sẵn trên web)
//   Tư duy KH   : câu 91–102 (logic, số liệu — lấy từ phần Toán của web)
//                 + câu 103–120 (suy luận khoa học)
// =========================================================================
(function () {
    const MON = {
        tv: { ten: 'Tiếng Việt', bd: 1, phut: 38 },
        anh: { ten: 'Tiếng Anh', bd: 31, phut: 38 },
        kh: { ten: 'Tư duy khoa học', bd: 91, phut: 38 },
        full: { ten: 'Đề đầy đủ 120 câu', bd: 1, phut: 150 }
    };
    const $ = id => document.getElementById(id);
    const dsDe = () => window.DGNL_DE_MON_MANIFEST || [];
    const deToanCua = lan => (window.DGNL_DE_THAT || []).find(d => (d.ten || '').trim() === 'Đề luyện tập số ' + lan);
    const demCau = nhom => (nhom || []).reduce((s, g) => s + g.cauHoi.length, 0);

    function coDuDe(m) {
        const so = m.so || {};
        return so.tv === 30 && so.anh === 30 && so.kh === 18 && deToanCua(m.lan) && demCau(deToanCua(m.lan).nhom) === 42;
    }
    function deHopLe(mon) {
        if (mon === 'full') return dsDe().filter(coDuDe);
        return dsDe().filter(m => (m.so || {})[mon] > 0);
    }

    function capNhatGiaoDien() {
        const mon = $('select-mon').value;
        const laToan = mon === 'toan';
        $('wrap-chuyen-de').style.display = laToan ? '' : 'none';
        $('wrap-de-mon').style.display = laToan ? 'none' : '';
        if (laToan) {
            if (typeof capNhatHienThiTheoCheDo === 'function') capNhatHienThiTheoCheDo();
            return;
        }
        $('wrap-so-cau').style.display = 'none';
        $('wrap-check-timer').style.display = 'none';
        $('timer-minutes-wrap').style.display = 'none';
        const ds = deHopLe(mon);
        const sel = $('select-de-mon');
        sel.innerHTML = (ds.length ? '<option value="__RANDOM__">Ngẫu nhiên 1 đề</option>' : '') +
            ds.map(m => {
                const n = mon === 'full' ? 120 : (mon === 'kh' ? (m.so.kh + 12) : m.so[mon]);
                return `<option value="${m.id}">${m.ten} (${n} câu)</option>`;
            }).join('');
        const t = MON[mon];
        $('ghi-chu-de-mon').textContent = !ds.length ? 'Chưa có đề nào cho mục này.'
            : mon === 'full' ? `Làm cả đề 120 câu theo đúng cấu trúc đề thật, đếm giờ ${t.phut} phút.`
            : `Làm nguyên phần ${t.ten} của 1 đề, đếm giờ ${t.phut} phút, giữ đúng thứ tự câu như đề gốc.`;
        $('btn-generate').disabled = !ds.length;
    }

    function napDe(m) {
        window.DGNL_DE_MON = window.DGNL_DE_MON || {};
        if (window.DGNL_DE_MON[m.id]) return Promise.resolve(window.DGNL_DE_MON[m.id]);
        return napMotFileDuLieu(m.file).then(r => {
            if (!r.ok || !window.DGNL_DE_MON[m.id]) throw new Error('Không tải được ' + m.file);
            return window.DGNL_DE_MON[m.id];
        });
    }

    const danNhan = (nhom, tieuDe, phan) => nhom.map((g, i) => Object.assign({}, g, { phan, tieuDePhan: i === 0 ? tieuDe : '' }));

    // 12 câu cuối phần Toán (câu 91–102: logic, phân tích số liệu)
    function phanLogic(lan) {
        let de = deToanCua(lan);
        if (!de) {
            const ds = (window.DGNL_DE_THAT || []).filter(d => demCau(d.nhom) === 42);
            de = ds[Math.floor(Math.random() * ds.length)];
        }
        if (!de) return [];
        const out = []; let n = 0;
        for (let i = de.nhom.length - 1; i >= 0 && n < 12; i--) { out.unshift(de.nhom[i]); n += de.nhom[i].cauHoi.length; }
        return out;
    }

    async function taoDe() {
        const mon = $('select-mon').value;
        let ds = deHopLe(mon);
        const chon = $('select-de-mon').value;
        let m = chon === '__RANDOM__' ? ds[Math.floor(Math.random() * ds.length)] : ds.find(x => x.id === chon);
        if (!m) { alert('Chưa có đề cho mục này.'); return; }
        const btn = $('btn-generate'); btn.disabled = true;
        try {
            const de = await napDe(m);
            const t = MON[mon];
            let groups = [], bd = t.bd;
            if (mon === 'tv' || mon === 'anh') {
                groups = danNhan(de[mon], '', t.ten);
            } else if (mon === 'kh') {
                const logic = phanLogic(m.lan);
                bd = 103 - demCau(logic);
                groups = danNhan(logic, 'Logic, phân tích số liệu', 'Logic, số liệu')
                    .concat(danNhan(de.kh, 'Suy luận khoa học', 'Suy luận khoa học'));
            } else if (mon === 'full') {
                const toan = deToanCua(m.lan).nhom;
                let n = 0; const toan30 = [], logic = [];
                toan.forEach(g => { (n < 30 ? toan30 : logic).push(g); n += g.cauHoi.length; });
                groups = danNhan(de.tv, 'PHẦN 1 · Tiếng Việt (câu 1–30)', 'Tiếng Việt')
                    .concat(danNhan(de.anh, 'PHẦN 1 · Tiếng Anh (câu 31–60)', 'Tiếng Anh'))
                    .concat(danNhan(toan30, 'PHẦN 2 · Toán học (câu 61–90)', 'Toán'))
                    .concat(danNhan(logic, 'PHẦN 3 · Logic, phân tích số liệu (câu 91–102)', 'Logic, số liệu'))
                    .concat(danNhan(de.kh, 'PHẦN 3 · Suy luận khoa học (câu 103–120)', 'Suy luận khoa học'));
            }
            const nhom = groups.map(xaoTronDapAnNhom);
            batDauLamBai(`${t.ten} — ${m.ten}`, nhom, true, t.phut, bd);
        } catch (e) {
            console.error(e);
            alert('Không tải được đề, vui lòng thử lại (Ctrl+F5).');
        } finally {
            btn.disabled = false;
        }
    }

    window.DGNL_MON_KHAC = { taoDe };
    $('select-mon').addEventListener('change', capNhatGiaoDien);
})();
