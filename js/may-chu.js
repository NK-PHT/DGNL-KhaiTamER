// =========================================================================
// GỌI MÁY CHỦ PHÁT ĐỀ (Cloudflare Worker "dgnl-api", mã trong thư mục worker/)
// Kho câu hỏi không còn tải về trình duyệt: mỗi lần "Tạo đề", trang gửi vé
// đăng nhập Firebase lên máy chủ, máy chủ chỉ trả về đúng các câu của đề đó.
// Địa chỉ máy chủ: window.DGNL_API (khai báo trong js/firebase-config.js).
// =========================================================================
(function () {
    function api() { return (window.DGNL_API || '').replace(/\/+$/, ''); }
    async function goi(duong, than) {
        const u = firebase.auth().currentUser;
        if (!u) throw new Error('Bạn chưa đăng nhập.');
        const ve = await u.getIdToken();
        const r = await fetch(api() + duong, {
            method: than ? 'POST' : 'GET',
            headers: Object.assign({ Authorization: 'Bearer ' + ve }, than ? { 'Content-Type': 'application/json' } : {}),
            body: than ? JSON.stringify(than) : undefined,
            cache: 'no-store'
        });
        let kq = null;
        try { kq = await r.json(); } catch (e) { /* bỏ qua */ }
        if (!r.ok) {
            const loi = new Error((kq && kq.loi) || ('Máy chủ trả lỗi ' + r.status));
            loi.status = r.status;
            throw loi;
        }
        return kq;
    }
    window.DGNL_MAY_CHU = {
        co: () => !!api(),
        thongTin: () => goi('/api/thongtin'),
        layDe: yeuCau => goi('/api/de', yeuCau)
    };
})();
