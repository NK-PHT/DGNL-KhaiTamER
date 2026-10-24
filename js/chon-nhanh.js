// =========================================================================
// HIỆN SẴN CÁC LỰA CHỌN (Môn, Chuyên đề) THÀNH NÚT BẤM thay vì danh sách thả
// xuống — học sinh nhìn thấy hết và bấm chọn ngay. Ô <select> gốc vẫn giữ
// (ẩn đi) để phần code tạo đề dùng như cũ; nút chỉ đặt giá trị cho ô đó.
// Danh sách nút tự vẽ lại khi ô <select> được nạp lại lựa chọn.
// =========================================================================
(function () {
    function tachSoCau(text) {
        // "Tổ hợp - Xác suất (Lớp 10) (160 câu)" -> ["Tổ hợp - Xác suất (Lớp 10)", "160 câu"]
        const m = text.match(/^(.*?)\s*\((\d+)\s*câu[^)]*\)\s*$/);
        return m ? [m[1], m[2] + ' câu'] : [text, ''];
    }

    function gan(selectId, khungId, kieu) {
        const sel = document.getElementById(selectId);
        const khung = document.getElementById(khungId);
        if (!sel || !khung) return;
        sel.classList.add('visually-hidden');
        sel.setAttribute('tabindex', '-1');

        function ve() {
            khung.innerHTML = '';
            Array.from(sel.options).forEach(o => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'lua-chon' + (o.value === sel.value ? ' dang-chon' : '');
                b.setAttribute('role', 'radio');
                b.setAttribute('aria-checked', o.value === sel.value ? 'true' : 'false');
                b.dataset.value = o.value;
                if (kieu === 'mon') {
                    b.innerHTML = `<span class="lc-ten">${o.dataset.ten || o.textContent}</span>` +
                        (o.dataset.phu ? `<span class="lc-phu">${o.dataset.phu}</span>` : '');
                    if (o.dataset.rong) b.classList.add('lc-rong');
                } else {
                    const [ten, so] = tachSoCau(o.textContent.replace(/^⭐\s*/, ''));
                    b.innerHTML = `<span class="lc-ten">${ten}</span>${so ? `<span class="lc-so">${so}</span>` : ''}`;
                    if (o.value === '__TONG_HOP__') b.classList.add('lc-noi-bat');
                }
                b.addEventListener('click', () => {
                    if (sel.value === o.value) return;
                    sel.value = o.value;
                    sel.dispatchEvent(new Event('change'));
                });
                khung.appendChild(b);
            });
        }
        sel.addEventListener('change', () => {
            khung.querySelectorAll('.lua-chon').forEach(b => {
                const on = b.dataset.value === sel.value;
                b.classList.toggle('dang-chon', on);
                b.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        });
        new MutationObserver(ve).observe(sel, { childList: true });
        ve();
    }

    gan('select-mon', 'nut-mon', 'mon');
    gan('select-chuyen-de', 'nut-chuyen-de', 'chuyen-de');
})();
