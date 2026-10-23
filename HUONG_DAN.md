# Hướng dẫn cài đặt Web ĐGNL Online

## 0. Chuyển sang Firebase Hosting (để giữ kho code Private, không ai tìm ra)

Trước đây web dùng **GitHub Pages**, mà GitHub Pages ở gói miễn phí bắt buộc
kho code (repo) phải **công khai (Public)** thì mới đăng web lên được — ai
cũng có thể vào GitHub tìm thấy toàn bộ code, tên trường, lịch sử chỉnh sửa.
Để tránh việc này, web đã được cấu hình sẵn để đăng qua **Firebase
Hosting** thay vì GitHub Pages — web vẫn public bình thường (ai có link
vẫn vào luyện tập được), nhưng kho code trên GitHub thì bạn có thể để
**Private (riêng tư)** thoải mái, không ảnh hưởng gì tới web.

Mọi file cấu hình (`firebase.json`, `.firebaserc`, workflow tự động deploy)
đã có sẵn trong repo. Bạn chỉ cần làm **1 lần duy nhất** các bước sau (mất
khoảng 5-10 phút):

1. **Lấy "chìa khoá" cho phép GitHub tự động đăng web lên Firebase:**
   - Vào https://console.firebase.google.com → chọn project **dgnl-2027**.
   - Bấm biểu tượng bánh răng (góc trên bên trái) → **Project settings**.
   - Vào tab **Service accounts** → bấm **"Generate new private key"** →
     xác nhận → 1 file `.json` sẽ được tải về máy bạn (file này giữ kín,
     KHÔNG chia sẻ hay đăng công khai ở đâu cả).

2. **Dán chìa khoá đó vào GitHub (dưới dạng "Secret" — GitHub sẽ giữ kín,
   kể cả bạn cũng không xem lại được sau khi lưu):**
   - Vào trang repo trên GitHub (github.com/I-Math-HighSchool/DGNL-KhaiTamER)
     → **Settings** → mục **Secrets and variables** → **Actions**.
   - Bấm **"New repository secret"**.
   - Ô **Name**, gõ đúng: `FIREBASE_SERVICE_ACCOUNT_DGNL_2027`
   - Ô **Secret**, mở file `.json` vừa tải bằng Notepad, copy TOÀN BỘ nội
     dung, dán vào đây.
   - Bấm **Add secret**.

3. **Bật Firebase Hosting cho project (nếu chưa từng bật):**
   - Vào Firebase Console → project `dgnl-2027` → mục **Hosting** (bên
     trái, mục "Build") → nếu thấy nút **"Get started"** thì bấm và làm
     theo (chỉ cần bấm qua các bước giới thiệu, không cần cài gì trên máy
     bạn — phần cài đặt dòng lệnh có thể bỏ qua vì đã có sẵn trong repo).

4. **Đưa code lên GitHub như bình thường** (qua GitHub Desktop, Commit rồi
   Push lên nhánh `main`) — GitHub sẽ tự động chạy quy trình đăng web lên
   Firebase Hosting (xem tiến trình ở tab **Actions** trên trang GitHub của
   repo, có dấu tích xanh là xong). Web lúc này có thêm 2 địa chỉ mới (vẫn
   dùng chung 1 web, chọn 1 trong 2 địa chỉ gửi cho học sinh):
   - `https://dgnl-2027.web.app`
   - `https://dgnl-2027.firebaseapp.com`

5. **Sau khi xác nhận web chạy tốt ở địa chỉ Firebase Hosting mới**, bạn có
   thể (không bắt buộc phải làm ngay):
   - Chuyển repo GitHub sang **Private**: vào repo → **Settings** → cuộn
     xuống mục **Danger Zone** → **Change visibility** → **Make private**.
   - Tắt GitHub Pages (không dùng nữa): repo → **Settings** → **Pages** →
     mục **Build and deployment**, đổi **Source** thành **None**.
   - Muốn gắn tên miền riêng (nếu sau này mua) thì làm ngay trong Firebase
     Console → **Hosting** → **Add custom domain**, dễ hơn cách làm với
     GitHub Pages trước đây.

## 1. Cấu trúc thư mục

```
WebDGNL/
├── index.html                 (trang chính)
├── js/
│   ├── firebase-config.js     (bạn cần điền cấu hình Firebase)
│   ├── auth.js                (đăng nhập Gmail, kiểm tra danh sách học sinh, lưu lịch sử Firestore)
│   └── app.js                 (engine tạo đề, chấm điểm)
├── data/
│   ├── manifest.js            (danh sách các chuyên đề đang có)
│   └── chuyen-de/
│       ├── ToHopXacSuat.js
│       ├── MatPhangOxy.js
│       └── ... (mỗi chuyên đề 1 file)
└── assets/                    (logo, favicon)
```

## 2. Cài đặt Firebase (đăng nhập + lưu lịch sử điểm)

1. Vào https://console.firebase.google.com, đăng nhập bằng Gmail của bạn,
   bấm **"Add project"** để tạo project mới (miễn phí).
2. Trong project vừa tạo, vào **Project settings** (biểu tượng bánh răng) →
   mục **"Your apps"** → bấm biểu tượng **"</>"** (Web) → đặt tên app tùy ý
   → Firebase sẽ hiện ra 1 đoạn code `firebaseConfig = {...}`.
3. Mở file `js/firebase-config.js`, copy đè các giá trị vào object
   `window.DGNL_FIREBASE_CONFIG`.
4. Vào mục **Authentication** (bên trái) → tab **Sign-in method** → bấm
   **Google** → bật (Enable) → chọn email hỗ trợ → Save. (Web này đăng
   nhập bằng **Gmail của học sinh**, không dùng mã + mật khẩu riêng.)
5. Vẫn trong mục **Authentication** → tab **Settings** → **Authorized
   domains** → bấm **Add domain** → thêm tên miền GitHub Pages của bạn
   — **bắt buộc có `dgnl.irismath.com`** (thiếu là học sinh bấm đăng nhập
   Google sẽ báo lỗi "Tên miền này chưa được cấp phép").
6. Vào mục **Firestore Database** → **Create database** → chọn chế độ
   **Production mode** → chọn khu vực gần Việt Nam (ví dụ
   `asia-southeast1`) → Create.
7. Vào tab **Rules** của Firestore, mở file **`firestore.rules`** trong
   repo bằng Notepad, copy TOÀN BỘ nội dung dán đè vào ô Rules rồi bấm
   **Publish**. Quy tắc này:
   - chỉ Gmail **có trong danh sách học sinh** (collection `hocsinh`) mới
     nộp bài/lưu kết quả được — chặn ngay ở máy chủ Firebase, kể cả khi
     ai đó cố vượt qua màn hình đăng nhập;
   - mỗi học sinh chỉ đọc được kết quả của chính mình, và chỉ "hỏi" được
     email của chính mình có trong danh sách hay không (không xem được
     danh sách của người khác);
   - riêng Gmail giáo viên quản trị (`thuthuy611103@gmail.com`) được xem
     toàn bộ kết quả và thêm/xoá danh sách học sinh.

   **Mỗi lần sửa file `firestore.rules` phải dán lại vào Console** — GitHub
   chỉ tự đăng web (Hosting), không tự cập nhật Rules.

## 3. Cấp quyền vào web cho từng học sinh (danh sách Gmail được phép)

Học sinh đăng nhập bằng **chính Gmail của mình** qua Google — không có mã
hay mật khẩu riêng. Chỉ Gmail **giáo viên đã thêm vào danh sách** mới vào
làm bài được; Gmail lạ đăng nhập sẽ bị đăng xuất ngay và báo "Email chưa
được đăng ký sử dụng web này".

**Cách thêm/bớt học sinh** (không cần sửa code, không cần commit/push):

1. Vào **`https://dgnl.irismath.com/quan-ly-hoc-sinh.html`**, đăng nhập
   bằng Gmail quản trị `thuthuy611103@gmail.com`.
2. **Thêm:** dán vào khung "Thêm học sinh", mỗi dòng 1 em — `email` hoặc
   `email, Họ và tên` (dán thẳng 2 cột từ Excel cũng được) → bấm **Thêm**.
   Trang tự chuyển chữ thường, bỏ trùng, và từ chối các email nghi gõ nhầm
   (VD `@gmai.com`, `@gmial.com`).
3. **Xoá:** bấm nút **Xoá** cạnh email. Em đó không vào được nữa từ lần
   đăng nhập kế tiếp; kết quả cũ vẫn giữ nguyên trong báo cáo.

Danh sách nằm trong Firestore (collection `hocsinh`, mã tài liệu = email
viết thường) — **không còn công khai trong code web** như file
`js/danh-sach-duoc-phep.js` trước đây (file đó đã bỏ).

**Lưu ý:** phần câu hỏi (`data/*.js`) vẫn là file tĩnh trên Hosting — màn
hình đăng nhập chặn việc làm bài, lưu điểm, xem lại; nhưng người rành kỹ
thuật biết đường dẫn file vẫn tải được file câu hỏi thô.

## 4. Đưa web lên mạng (hosting)

Có thể dùng GitHub Pages giống hệt cách bạn đang host web 21-NganHangDe:
đẩy toàn bộ thư mục `WebDGNL` lên 1 repository GitHub, vào Settings →
Pages → chọn nhánh chứa code → Save. Firebase Auth hoạt động tốt trên
GitHub Pages vì mọi xử lý đăng nhập diễn ra ở phía trình duyệt.

**Lưu ý:** nhớ thêm đúng tên miền GitHub Pages vào **Authorized domains**
ở bước 5 của mục 2, nếu không học sinh sẽ không đăng nhập Google được khi
vào web qua GitHub Pages.

## 5. Thêm chuyên đề mới sau này

Khi có thêm file `.tex` chuyên đề mới (theo đúng định dạng `\begin{ex}`,
`\choice`, `\True`, `\loigiai{}`), chạy lại script bóc tách dữ liệu:

```
python3 parse_dgnl.py --build-all <thư_mục_chứa_file_tex> data/chuyen-de
```

Script sẽ tự tạo lại toàn bộ file `data/chuyen-de/*.js` và
`data/manifest.js`. Câu hỏi thiếu đáp án đúng (`\True`) hoặc có
`\includegraphics` (thiếu file ảnh gốc) sẽ tự động bị bỏ qua và báo cáo ra
màn hình để bạn bổ sung sau.

## 8. Xem lại bài làm & xuất báo cáo Excel cho giáo viên

- **`xem-lai.html?id=<mã bài làm>`**: xem lại đúng y hệt 1 bài đã làm (câu
  hỏi, đáp án đã chọn, đáp án đúng, lời giải) — mở được từ nút "Xem lại"
  trong khung "Lịch sử làm bài" của chính học sinh, hoặc từ cột "Xem lại"
  trong trang báo cáo/file Excel (giáo viên). Chỉ chính học sinh làm bài đó
  hoặc giáo viên quản trị mới xem được (do Firestore Rules ở mục 2 kiểm
  soát).
- **`bao-cao-ket-qua.html`**: trang riêng cho giáo viên — đăng nhập bằng
  đúng Gmail `thuthuy611103@gmail.com` sẽ thấy bảng TOÀN BỘ lượt nộp bài
  của mọi học sinh (thời gian nộp, họ tên, email, đề đã làm, điểm, thời
  gian làm bài) và có nút **"Xuất ra Excel"** để tải về file `.xlsx` (có
  kèm cột link "Xem lại" bấm được thẳng vào từng bài). Gmail khác đăng nhập
  vào trang này sẽ bị từ chối.
- Muốn đổi Gmail quản trị (VD dùng Gmail khác thay vì
  `thuthuy611103@gmail.com`): sửa hằng số `TEACHER_EMAIL` ở đầu 2 file
  `js/xem-lai.js` và `js/bao-cao-ket-qua.js`, VÀ sửa lại đúng địa chỉ đó
  trong quy tắc Firestore ở mục 2 (bước 7).

## 9. Bài tập tuần (BTVN) — cả lớp làm chung 1 đề, nộp phiếu trả lời

**Ý tưởng:** đề vẫn là file PDF/giấy như bình thường (để in, sửa trên lớp).
Web chỉ là **phiếu trả lời trắc nghiệm**: học sinh làm trên giấy rồi bấm
chọn A/B/C/D cho từng câu và nộp. Web tự chấm, tự ghi nhận ai nộp đúng hạn.

**Giáo viên** — `quan-ly-btvn.html` (đăng nhập Gmail quản trị):
1. Điền tên bài, số câu (mặc định 120), hạn nộp, link đề (không bắt buộc —
   VD link Google Drive file PDF), dán đáp án (`ABCD...` liền, hoặc dạng
   `1A 2B 3.C`). Đáp án có thể nhập sau.
2. Bấm **Lưu** → copy link (nút 🔗) gửi lớp, hoặc học sinh vào trang chính
   bấm nút xanh **"Bài tập tuần"**.
3. Bấm **Kết quả**: bảng học sinh (đúng hạn / trễ / chưa nộp, số câu đúng,
   thang 10), tab **Thống kê từng câu** (câu nào sai nhiều, học sinh hay
   chọn nhầm đáp án nào — dùng để chọn câu sửa trên lớp), **Xuất Excel**.
4. Sửa đáp án sau khi giao: bấm **Sửa** → sửa → Lưu, điểm tự tính lại.

**Học sinh** — `btvn.html`:
- Trước hạn: nộp, sửa, nộp lại thoải mái; chỉ thấy "Đã nộp", CHƯA thấy
  điểm/đáp án. Đáp án chọn dở được lưu nháp trên máy.
- Sau hạn: thấy điểm + đáp án đúng (chỉ khi đã nộp). Chưa nộp thì vẫn nộp
  được 1 lần, ghi **nộp trễ**, nộp rồi là khoá.
- Tất cả quyền trên do `firestore.rules` kiểm soát ở máy chủ.

### Google Sheet tự tô màu ai đã nộp

Làm 1 lần (bằng Gmail `thuthuy611103@gmail.com` — đúng tài khoản sở hữu
project Firebase):
1. Tạo 1 Google Sheet mới (VD "Nộp BTVN lớp ĐGNL").
2. Menu **Tiện ích mở rộng (Extensions) → Apps Script**.
3. Bánh răng **Cài đặt dự án (Project settings)** → tick **"Hiển thị tệp
   kê khai appsscript.json trong trình chỉnh sửa"**.
4. Quay lại **Trình chỉnh sửa (Editor)**:
   - Mở `appsscript.json`, xoá hết, dán nội dung file
     `cong-cu-google-sheet/appsscript.json`.
   - Mở `Code.gs` (Mã.gs), xoá hết, dán nội dung file
     `cong-cu-google-sheet/BangNopBai.gs`. Bấm 💾 Lưu.
5. Chọn hàm `batTuDong` ở thanh trên → **Chạy (Run)** → cấp quyền (chọn
   tài khoản → Nâng cao → Đi tới … → Cho phép).
6. Quay lại Sheet: có tab **"Nộp BTVN"**, tự cập nhật mỗi 10 phút. Menu
   **ĐGNL → Cập nhật ngay** để cập nhật tức thì.

Màu: **xanh** = nộp đúng hạn (kèm số câu đúng), **vàng** = nộp trễ,
**đỏ** = quá hạn chưa nộp, trống = chưa tới hạn. Mỗi tuần là 1 cột, mỗi
học sinh (theo danh sách Gmail) là 1 dòng. Đừng sửa tay trong tab này — mỗi
lần cập nhật sẽ vẽ lại; muốn ghi chú thì tạo tab khác.

## 6. Các phần đã hoàn thành / còn giới hạn

- ✅ Chuyên đề riêng theo từng chương (dữ liệu từ thư mục `DanhGiaNangLuc`).
- ✅ "Đề tổng hợp phần Toán ĐGNL" — bốc ngẫu nhiên câu hỏi từ mọi chuyên đề.
- ✅ Đăng nhập bằng Gmail qua Google, chỉ cho phép các email giáo viên đã
  thêm ở trang `quan-ly-hoc-sinh.html` (mục 3), chặn cả ở Firestore Rules.
- ✅ Lưu lịch sử điểm từng học sinh vào Firestore, xem lại được.
- ⚠️ Các câu hỏi có hình ảnh chèn từ file `\includegraphics` (ảnh cắt từ
  PDF gốc) hiện KHÔNG có file ảnh đi kèm nên bị bỏ qua tạm thời — cần bổ
  sung thư mục ảnh gốc nếu muốn đưa các câu này vào.
- ⚠️ Các đề thi thử/đề minh họa đầy đủ (dạng "bộ câu hỏi dùng chung 1 nội
  dung cho 2-3 câu") từ các file đề tổng hợp lớn (`De-Minh-Hoa`,
  `De-Chinh-Thuc-Dot-...`) CHƯA được đưa vào bản này — đây là phần có thể
  làm tiếp nếu bạn muốn có thêm mục "Đề thi thử ĐGNL" dạng đề đầy đủ.

## 7. Số lượng câu hỏi trắc nghiệm đã bóc tách được (theo từng chuyên đề)

| Chuyên đề | Số câu OK |
|---|---|
| Tổ hợp - Xác suất | 160 |
| Mặt phẳng tọa độ Oxy | 76 |
| Khảo sát hàm số | 103 |
| Mũ - Lũy thừa - Logarit | 117 |
| Giới hạn dãy số | 63 |
| Hình học không gian | 70 |
| Hệ thức lượng trong tam giác | 57 |
| Hệ bất phương trình bậc nhất hai ẩn | 31 |
| Cấp số cộng - cấp số nhân | 74 |
| Phân tích số liệu | 18 |
| Phương trình, hệ phương trình | 2 |
| Lý thuyết đồ thị | 5 |
| Logic | 20 |
| Phương trình lượng giác | 27 |
| **Tổng cộng** | **823** |

Lưu ý: các chuyên đề gốc trong `DanhGiaNangLuc` là ngân hàng câu hỏi dùng
chung cho nhiều mục đích (có cả câu trắc nghiệm, đúng-sai, trả lời ngắn).
Vì ĐGNL chỉ dùng trắc nghiệm, script chỉ lấy các câu có `\choice` +
`\True` hợp lệ; các câu trả lời ngắn (`\dapso`), câu thiếu đáp án đúng,
hoặc câu có `\includegraphics` (thiếu ảnh gốc) được tự động bỏ qua. Hai
chuyên đề "Phương trình, hệ phương trình" (2 câu) và "Lý thuyết đồ thị"
(5 câu) hiện có rất ít câu trắc nghiệm hợp lệ trong nguồn — có thể cần bổ
sung thêm câu trắc nghiệm gốc nếu muốn chuyên đề này phong phú hơn.
