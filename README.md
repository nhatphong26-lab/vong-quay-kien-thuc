# Vòng Quay Kiến Thức

Trò chơi học tập được đóng gói lại từ bản thiết kế Gemini Canvas, gồm vòng quay, câu hỏi, cửa hàng lượt quay, bảng xếp hạng và trang quản trị giáo viên.

## Chạy trên máy

1. Chạy `npm install`.
2. Chạy `npm run dev`.

Dữ liệu được lưu ngay trong trình duyệt của thiết bị bằng Local Storage, vì vậy bản GitHub Pages chạy độc lập và không cần Firebase.

Ứng dụng tự tạo ngân hàng 50 câu hỏi tiểu học khi trình duyệt chưa có câu hỏi. Câu hỏi do quản trị thêm, tài khoản, xu và tiến trình được giữ lại trên cùng trình duyệt. Đầu mỗi ngày mới, lượt quay được đặt lại về 5 nhưng số xu được giữ nguyên.

Thông tin đăng nhập quản trị không được hiển thị trên giao diện hoặc ghi trực tiếp trong tài liệu công khai.

## Xuất bản GitHub Pages

Repo đã kèm workflow tự động build và xuất bản khi đẩy mã lên nhánh `main`.
