# FlixAnime — JavaScript build

## Chạy thử
Mở thư mục bằng một static web server (không mở `index.html` bằng `file://`):
```bash
python3 -m http.server 8080
```
Sau đó truy cập `http://localhost:8080`.

## Lưu ý quan trọng về CORS
Module `js/animevietsub.js` gọi `https://animevietsub.site` trực tiếp. Trình duyệt có thể chặn do CORS hoặc website có biện pháp chống truy cập tự động. Khi đó giao diện sẽ báo lỗi rõ ràng. Để hoạt động ổn định, cần triển khai backend cùng origin có quyền truy cập hợp lệ tới website nguồn. Không sử dụng proxy để lấy cookie Cloudflare, vượt CAPTCHA, giả mạo phiên đăng nhập hay giải mã nội dung bảo vệ.

## Các phần đã có
- Giao diện responsive nền tối/tím, bố cục poster, thanh điều hướng bo tròn.
- Tìm kiếm AnimeVietsub bằng adapter JavaScript.
- Trang chi tiết, thông tin và danh sách tập.
- Khám phá server/iframe/M3U8 từ trang tập.
- Lưu phim yêu thích bằng localStorage.
- Mục Cá nhân ở chế độ khách.

## Chưa được đảm bảo
- CORS và thay đổi cấu trúc HTML của AnimeVietsub có thể khiến tìm kiếm/phân tích trang không hoạt động.
- Không có bảo đảm server HDX luôn tồn tại hoặc cho phép nhúng; plugin nguồn không chứng minh điều đó.
- Không tự động giải mã HLS/DRM hoặc vượt cơ chế bảo vệ.
- Chưa có tài khoản/đồng bộ cloud, lịch sử xem, hay backend lưu dữ liệu.
