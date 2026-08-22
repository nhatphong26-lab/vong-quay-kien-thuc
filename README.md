# Vòng Quay Kiến Thức

Trò chơi học tập được đóng gói lại từ bản thiết kế Gemini Canvas, gồm vòng quay, câu hỏi, cửa hàng lượt quay, bảng xếp hạng và trang quản trị giáo viên.

## Chạy trên máy

1. Chạy `npm install`.
2. Chạy `npm run dev`.

Dự án dùng Supabase cho ngân hàng câu hỏi dùng chung. Câu hỏi do quản trị thêm hoặc xóa sẽ được cập nhật theo thời gian thực cho mọi thiết bị. Tài khoản học sinh, xu và tiến trình vẫn được giữ trong Local Storage của từng thiết bị để bảo toàn dữ liệu hiện có.

Supabase được khởi tạo sẵn với 50 câu hỏi tiểu học, bật Row Level Security: mọi người được đọc câu hỏi nhưng chỉ tài khoản quản trị đã xác thực mới được ghi dữ liệu. Đầu mỗi ngày mới, lượt quay được đặt lại về 5 nhưng số xu được giữ nguyên.

Thông tin đăng nhập quản trị không được hiển thị trên giao diện hoặc ghi trực tiếp trong tài liệu công khai.

## Xuất bản GitHub Pages

Repo đã kèm workflow tự động build và xuất bản khi đẩy mã lên nhánh `main`.
