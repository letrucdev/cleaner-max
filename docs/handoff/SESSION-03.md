# Phiên 03 — Giao diện chính (06/11/2026)

## Mục tiêu phiên
Dựng UI theo design đã duyệt: token màu/font, layout sidebar + Mica, các màn Tổng quan / Cache dev / Dự án cũ, luồng Xác nhận → Tiến trình → Xong, i18n vi/en, animation. Sau đó chạy thử trên app Tauri thật.

## Đã làm

### Backend (bổ sung nhỏ)
- Command `get_app_info` → `{ vibrancy, defaultProjectRoots }`.
- `setup()` áp Mica bằng `window_vibrancy::apply_mica`, lưu kết quả vào `AppState.vibrancy`. Cửa sổ đặt `transparent: true`.
- `projects::default_roots()`: lấy `\\wsl.localhost\<distro>\home` của mỗi distro, cộng thêm `~\source\repos`, `~\projects`, `~\dev`, `~\workspace`, `~\Documents\GitHub` nếu thư mục tồn tại.

### Frontend (`src/`)
| Phần | File |
|---|---|
| Token từ design (sáng/tối, `html.vibrant` cho Mica, `prefers-reduced-transparency`) | `index.css` |
| Preset chuyển động (spring bounce 0, ease-out mạnh, stagger) | `lib/motion.ts` |
| Format byte (`filesize`, JEDEC, dấu thập phân theo ngôn ngữ), ngày (`date-fns` vi/en) | `lib/format.ts` |
| Bọc bindings thành Promise ném lỗi, hook `react-query`, `api.clean` dùng `Channel` | `lib/api.ts` |
| Tổng hợp số liệu (`lodash-es`), `itemKey` khớp với key bên Rust | `lib/selectors.ts` |
| Store: settings (persist localStorage), UI (trang hiện tại, hàng đợi dọn) | `stores/` |
| i18n vi (mặc định) / en, gồm tên 31 mục registry | `i18n/` |
| Mock IPC cho chạy trong trình duyệt (chỉ ở DEV, không có Tauri) | `mocks/ipc.ts` |
| Sidebar (thanh chọn trượt bằng `layoutId`, badge dung lượng, thẻ ổ C:) | `components/app/Sidebar.tsx` |
| Hộp thoại dọn 3 bước (stream qua Channel, tự cuộn tới mục đang chạy, chặn đóng khi đang chạy) | `components/app/CleanDialog.tsx` |
| Segmented control (Radix ToggleGroup + thumb trượt), SelectionBar nổi, AnimatedBytes, States | `components/app/` |
| Tổng quan: donut vẽ dần từng phần (ổ ảo / hiberfil / thùng rác / còn lại / trống), Nguyên nhân chính, 3 thẻ "có thể dọn", các ổ đĩa | `features/overview/` |
| Danh sách mục dùng chung cho Cache dev và Rác Windows | `features/targets/TargetList.tsx` |
| Dự án cũ: bảng TanStack Table **v9** (`rowSortingFeature`), chips thư mục + chọn thư mục (plugin dialog), segmented 30/90/180 ngày | `features/projects/` |
| Hệ thống (hiện chỉ có rác Windows), Cài đặt (ngôn ngữ + giao diện) | `features/system/`, `features/settings/` |

Thư viện đã thêm: `motion`, `@tanstack/react-query`, `@tanstack/react-table` (v9), `@tanstack/react-virtual`, `zustand`, `i18next`, `react-i18next`, `i18next-browser-languagedetector`, `date-fns`, `filesize`, `lodash-es`, `@fontsource-variable/inter`, các plugin Tauri (store/dialog/os). Component shadcn: checkbox, switch, toggle-group, dialog, alert-dialog, progress, sonner, badge, tooltip, separator, scroll-area, skeleton, select. Đã bỏ `next-themes` và `@fontsource-variable/geist`.

## Quyết định & lý do
- **Giữ thanh tiêu đề gốc của Windows** thay vì vẽ nút giả như trong design: hành vi kéo, snap, maximize đều chuẩn Windows.
- **Sidebar rộng 248px** (design ghi 232px): ở 232px, nhãn "Hệ thống & Admin" kèm badge bị cắt.
- **Bỏ ô Tìm kiếm** trong sidebar: chưa có tính năng tìm kiếm thật, không nên đặt control giả.
- **Không có bước dry-run riêng**: con số trên danh sách đã là kết quả đo bằng đúng hàm mà lệnh xóa dùng, và hộp thoại xác nhận liệt kê đúng từng mục cùng dung lượng.
- **Trang chuyển bằng state (zustand), không dùng router**: chỉ có 6 màn, không cần URL.
- **TanStack Table v9** (npm tự cài bản mới nhất): API khác v8. Làm theo hướng dẫn kèm trong gói (`node_modules/@tanstack/*/skills`).
- **Màn Lịch sử** tạm hiện "Sẽ có ở bản tiếp theo". **Màn Hệ thống** đã có phần rác Windows, phần tác vụ Admin sẽ làm ở phiên 4.

## Kiểm thử
- `tsc --noEmit` + `vite build`: OK. `cargo clippy` + `cargo test` (26 pass): OK.
- **Trình duyệt + mock IPC** (Claude in Chrome, 1280×860):
  - Tổng quan, Cache dev, Dự án cũ, Cài đặt hiển thị đúng ở cả tối và sáng, cả vi và en.
  - Luồng xác nhận → tiến trình (tick, spinner, đếm) → xong (có thông báo tệp bị khóa) chạy đúng.
  - Đã sửa sau khi thử: nhãn sidebar xuống dòng, chữ "Đo sau khi chạy" xuống dòng, tự cuộn danh sách tiến trình, ẩn mục 0 B trong chú thích donut.
- **App Tauri thật** (`npm run tauri dev`): khởi chạy OK, dữ liệu thật hiển thị đúng (C: còn 33,5 GB; Docker 24,9 GB "Có thể nén"; Ubuntu sparse; hiberfil 12,6 GB; cache 1,2 GB; dự án cũ 603,8 MB; rác 490 KB).
- **Chưa bấm xóa thật** trong app (cần người dùng đồng ý).

## Sửa theo phản hồi của người dùng (cuối phiên)
| Vấn đề | Nguyên nhân | Cách sửa |
|---|---|---|
| Thanh chọn (SelectionBar) "giật xuống" khi vào Cache dev / Dự án cũ / Hệ thống | Trang có `transform` khi chuyển cảnh, nên phần tử `absolute` bên trong lấy trang làm mốc, đến khi animation xong thì nhảy về đáy cửa sổ | Render qua **portal** vào lớp phủ `#page-overlay` trong `App.tsx`, nằm ngoài vùng animation. Đã đo từng khung hình: chỉ còn hiệu ứng trượt lên 18px |
| Sidebar khó nhìn ở chế độ sáng | Mica theo theme **Windows** (tối), lớp sidebar sáng bán trong suốt nằm trên đó thành xám đục | Command mới `set_window_theme(dark, followSystem)`: `window.set_theme` + `apply_mica(Some(dark))`, gọi mỗi khi đổi theme. Sidebar khi bật Mica đặc hơn (72% sáng / 60% tối) |
| Chưa có animation khi đổi sáng/tối | — | **View Transitions API** (WebView2 hỗ trợ): theme mới lan ra hình tròn từ vị trí bấm, 520ms ease-out; chuyển thành mờ dần 200ms nếu bật reduced-motion; khi khởi động thì không animate (`hooks/useAppearance.ts`) |

Đã kiểm tra: đo khung hình + kiểm tra animation View Transition trong trình duyệt; chụp cửa sổ app thật ở chế độ sáng, sidebar và thanh tiêu đề đúng màu.

## Việc còn dở / rủi ro
- **Chưa commit git.**
- Hiệu ứng lan tròn khi đổi theme mới được kiểm tra trong Chrome. Cần người dùng thử trực tiếp trong app.
- Bundle JS 749 KB trong 1 chunk. Có thể tách chunk sau, không gấp với app desktop.
- `@tanstack/react-virtual` đã cài nhưng chưa dùng, vì danh sách hiện chưa tới trăm dòng.
- `npm audit` có cảnh báo trong devDependencies, chưa xem chi tiết.

## Bước tiếp theo (Phiên 4)
1. Tác vụ Admin qua `runas` (UAC): nén vhdx (cảnh báo `wsl --shutdown`, chạy script diskpart), `wsl --manage --set-sparse`, Docker prune (`image`/`builder`, không động tới volume), `powercfg /h off`, DISM. Có hộp thoại cảnh báo và log kết quả.
2. Màn Lịch sử (timeline từ `get_history`, mở/thu từng lần).
3. Cài đặt đầy đủ: thư mục quét, ngưỡng "đang làm", các tùy chọn an toàn.
4. Review animation (skill `review-animations`), audit a11y (`web-design-guidelines`).
5. Đóng gói NSIS/MSI (`npm run tauri build`), icon app.
