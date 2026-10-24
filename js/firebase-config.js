// =========================================================================
// CẤU HÌNH FIREBASE — GIÁO VIÊN CẦN ĐIỀN THÔNG TIN Ở ĐÂY
// =========================================================================
// 1) Vào https://console.firebase.google.com -> Tạo project mới (miễn phí).
// 2) Trong project, vào "Project settings" -> mục "Your apps" -> bấm biểu
//    tượng "</>" (Web) để tạo 1 Web App -> Firebase sẽ đưa cho bạn 1 đoạn
//    cấu hình y hệt object bên dưới. Copy toàn bộ giá trị đó dán đè vào đây.
// 3) Vào mục "Authentication" -> "Sign-in method" -> bật "Google".
//    (Web này đăng nhập bằng Gmail của học sinh qua Google, sau đó kiểm
//    tra email có nằm trong danh sách Firestore "hocsinh" hay không).
// 4) Vào mục "Authentication" -> "Settings" -> tab "Authorized domains" ->
//    thêm tên miền của web (dgnl.irismath.com) nếu chưa có sẵn trong danh sách.
// 5) Vào mục "Firestore Database" -> "Create database" (chọn chế độ
//    production, khu vực gần Việt Nam, ví dụ asia-southeast1).
// =========================================================================
window.DGNL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyARUgY--HM5YZIF3_04WAibeZnrHxYexHs",
    authDomain: "dgnl-2027.firebaseapp.com",
    projectId: "dgnl-2027",
    storageBucket: "dgnl-2027.firebasestorage.app",
    messagingSenderId: "304374841717",
    appId: "1:304374841717:web:26577502bfedc7314d533c"
};

// =========================================================================
// LƯU Ý VỀ TÀI KHOẢN HỌC SINH (đăng nhập bằng Gmail)
// =========================================================================
// Học sinh đăng nhập bằng chính tài khoản Google (Gmail) của mình — Google
// lo việc xác thực mật khẩu, web này không hề biết/lưu mật khẩu của ai.
//
// Muốn cho phép thêm/bớt học sinh nào được vào web: giáo viên đăng nhập
// trang quan-ly-hoc-sinh.html (bằng Gmail quản trị) để thêm/xoá. Danh sách
// nằm trong Firestore (collection "hocsinh"), không công khai trong code.

// =========================================================================
// MÁY CHỦ PHÁT ĐỀ (Cloudflare Worker "dgnl-api", mã trong thư mục worker/)
// Kho câu hỏi nằm trên máy chủ này, trang chỉ nhận đúng các câu của từng đề.
// =========================================================================
window.DGNL_API = 'https://dgnl-api.thuthuy611103.workers.dev';
