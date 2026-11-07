# Phiên 06 — Ổ hệ thống, dialog tiến trình tác vụ Admin, bảng Dự án cũ (07/11/2026)

## Mục tiêu phiên
1. Không giả định ổ hệ thống là `C:`.
2. Thêm padding đáy cho cụm "Tác vụ nâng cao" ở trang Hệ thống & Admin.
3. Có dialog tiến trình cho các tác vụ Admin (nén, dọn Docker, tắt ngủ đông, dọn Windows Update, sparse). Trong lúc chạy không cho chuyển trang.
4. Bảng Dự án cũ: đặt min width cho cột "Có thể xóa". Đường dẫn dự án tối đa 3 dòng, bấm vào thì mở thư mục.

## Quyết định của người dùng
| Câu hỏi | Chọn |
|---|---|
| Phạm vi ổ hệ thống | Chỉ ổ hệ thống (lấy từ Rust), không thêm UI chọn ổ |
| Kiểu tiến trình | Thanh không xác định + đồng hồ thời gian đã chạy. Kết quả hiện ngay trong dialog |
| Mức chặn khi đang chạy | Chặn chuyển trang **và chặn đóng app** |
| Bấm đường dẫn dự án | Mở chính thư mục đó trong Explorer (WSL qua `\\wsl.localhost`) |

## Đã làm

### Rust
- `fsutil::system_drive()`: đọc `%SystemDrive%`, nếu không có thì lấy chữ ổ từ `%windir%`, cuối cùng mới về `C:`. Có test `drive_letters`.
- `Overview.system_drive` (tạo binding `systemDrive`). `scan::hiberfil_size` và `admin::system_drive_free` đều dùng helper này.
- Lệnh mới `open_folder(path, distro)`: nếu có `distro` thì đổi sang UNC bằng `wsl::to_unc` (kiểm tra tên distro, không cho `..`, `\`, `/`, `:`). Chỉ mở đường dẫn là **thư mục đang tồn tại**, mở qua `tauri_plugin_opener::open_path`. Test `linux_to_unc`.
- `AppState.admin_running` bật trong suốt `run_admin_task`. `on_window_event` chặn `CloseRequested` khi cờ đang bật, rồi phát event `close-blocked` cho frontend.

### Frontend
- `selectors.systemDrive` tìm theo `overview.systemDrive`. Dòng `hiberfil.sys` ở Tổng quan và các câu `system.sparseDesc`/`hibernateDesc` lấy ổ qua `{{drive}}`.
- `features/system/AdminTaskDialog.tsx`: dialog modal không đóng được bằng Esc hay bấm ra ngoài khi đang chạy. Có thanh tiến trình không xác định (CSS `animate-indeterminate`, khi giảm chuyển động thì đổi sang `motion-reduce:animate-pulse`), đồng hồ thời gian đã chạy, và cảnh báo khi người dùng thử đóng app. Xong thì hiện kết quả (thành công / đã hủy UAC / lỗi kèm log) cùng nút "Xong". Toast cũ của tác vụ Admin đã bỏ.
- `SystemPage`: thêm `pb-8` cho grid.
- `ProjectsPage`: cột "Có thể xóa" có `min-w-44`, badge "Đang làm" có `whitespace-nowrap`. Tên dự án vẫn là label của checkbox. Đường dẫn giờ là `<Button variant="link">` của shadcn, ghi đè `h-auto p-0 whitespace-normal justify-start`. Bên trong là span `line-clamp-3 break-all`, có tooltip. Bấm thì gọi `api.openFolder`, lỗi thì báo bằng toast. Bản đầu dùng `<button>` tự viết với `rounded-[4px]` nên bị IntelliSense cảnh báo. Người dùng đã góp ý: **dùng component shadcn có sẵn trước khi tự viết**. Đã thêm thành quy tắc trong CLAUDE.md (quy tắc 2).
- Mock IPC: thêm `systemDrive`, `open_folder`, `plugin:event|listen/unlisten`. `run_admin_task` giả lập chạy 4 giây để xem được dialog.

### Bài học
- `AnimatePresence initial={false}` khiến animation `repeat: Infinity` của motion bên trong nhảy thẳng tới trạng thái cuối và đứng yên. Hoạt ảnh lặp vô hạn nên dùng CSS keyframes (khai báo trong `@theme` ở `index.css`).

## Kiểm tra
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`: sạch. `cargo test`: 34 qua, 1 bỏ qua.
- `npm run build`, `npm run lint:tw`: sạch.
- UI mock (Chrome, :1420): dialog Dọn Docker không đóng được bằng Esc khi đang chạy, thanh tiến trình chạy, kết quả hiện đúng. Bấm đường dẫn dự án gọi `open_folder` với đúng distro/path và không tick checkbox. Đường dẫn bị cắt ở 3 dòng, badge không bị co.

## Chưa kiểm tra / việc tiếp theo
- **Chưa chạy trong app thật**: phần chặn đóng cửa sổ (`close-blocked`) và mở Explorer cho cả đường dẫn Windows lẫn WSL. Chạy `npm run tauri dev`, bấm thử một tác vụ nhẹ như Dọn Docker rồi bấm X.
- Chưa thử trên máy có Windows cài ở ổ khác `C:`.
- `CleanDialog` (dọn cache/dự án) vẫn cho đóng app khi đang xóa. Nếu muốn chặn giống tác vụ Admin thì dùng lại cờ ở `AppState`.
