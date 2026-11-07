# Phiên 02 — Lõi Rust (06/11/2026)

## Mục tiêu phiên
Sửa design theo góp ý, sau đó viết toàn bộ backend: registry, quét, engine dọn có dry-run, lịch sử, binding TypeScript có kiểu, và test.

## Góp ý design đã xử lý
| Thread | Góp ý | Đã làm |
|---|---|---|
| 9c1602e3 (Hệ thống & Admin) | "bỏ 3 chấm ở cuối chữ ở mỗi nút" | "Nén…/Tắt…/Chạy…" thành "Nén/Tắt/Chạy". Bỏ luôn ở "+ Thêm thư mục" (Cài đặt) cho đồng bộ. Đã ghi thành quy ước trong `CLAUDE.md` |

Thread này **chưa được gửi cho Claude** ("Send to Claude") nên mình không resolve được. Người dùng cần tự đánh dấu resolved.

## Đã làm — `src-tauri/src/`

| File | Nội dung |
|---|---|
| `model.rs` | Kiểu dùng chung: `Target`, `Project`/`Artifact`, `Overview` (disks, vhdx, hiberfil, thùng rác), `CleanItem`, `CleanEvent` (stream qua Channel), `CleanReport`. Mọi `f64` được xuất ra TS là `number` |
| `registry.rs` | 31 mục khai báo dạng dữ liệu: 11 cache Windows, 6 mục rác Windows, 14 cache WSL. Lấy theo những gì đã dọn tay ở 2 phiên trước |
| `fsutil.rs` | Đo dung lượng / xóa nội dung, lọc theo tuổi file (`%TEMP%` chỉ xóa file > 7 ngày). **Không dừng khi gặp file bị khóa** (ghi lại tối đa 20 đường dẫn + tổng số). Tự gỡ read-only. Không đi theo symlink/junction |
| `proc.rs` | Chạy tiến trình con: stdin null, `CREATE_NO_WINDOW`, **timeout rồi kill**. Đây là bài học từ vụ PowerShell treo 50 phút |
| `wsl.rs` | Đọc distro từ registry Lxss (bỏ qua `docker-desktop*`). Script POSIX để đo/xóa/quét dự án trong distro. Đường dẫn truyền qua `"$@"`, không nối vào chuỗi script. Hỗ trợ đường dẫn `\\wsl.localhost\…` và `\\wsl$\…` |
| `projects.rs` | `kondo-lib` cho dự án trên ổ Windows, script cho dự án trong WSL. Node có thêm `.next`, `.nuxt`, `.svelte-kit`, `.parcel-cache`, `.turbo` |
| `recycle.rs` | `SHQueryRecycleBinW` / `SHEmptyRecycleBinW` (crate `windows`) |
| `scan.rs` | `overview()` (sysinfo + vhdx kèm trạng thái sparse + hiberfil + thùng rác + có docker CLI không), `targets()` |
| `clean.rs` | Engine: dry-run đo **chính xác** những gì sẽ xóa. Mỗi mục được tra lại từ registry. Artifact phải nằm trong kết quả quét dự án gần nhất **và** có tên artifact hợp lệ |
| `history.rs` | Lưu `history.json` (tauri-plugin-store), tối đa 200 lần, mới nhất trước. Dry run không được ghi |
| `lib.rs` | 5 command (`get_overview`, `scan_targets`, `scan_projects`, `clean`, `get_history`), tauri-specta, các plugin store/log/dialog/window-state/os/opener |
| `build.rs` + `windows-app-manifest.xml` | Sửa lỗi `cargo test` bị `STATUS_ENTRYPOINT_NOT_FOUND`: nhúng manifest qua linker cho mọi target |

Binding TypeScript tự sinh ở **`src/lib/bindings.ts`**. Không sửa tay file này.

## Quyết định & lý do
- **`walkdir` thay cho `jwalk`**: tác giả `jwalk` đã khuyến nghị bỏ crate này.
- **`f64` cho byte/timestamp**: specta-typescript cấm `u64`. Dùng `#[specta(type = Num)]` để TS nhận `number` thay vì `number | null` (giá trị luôn hữu hạn).
- **`dist`/`build` không coi là artifact**: một số dự án commit thư mục này. kondo cũng không xóa chúng.
- **pnpm store: chỉ chạy `pnpm store prune`** qua `bash -lic`, vì store dùng hardlink chung với dự án đang làm. Dung lượng mục này hiển thị là "không rõ" cho đến khi chạy xong.
- **Dự án "đang làm"** (sửa trong N ngày, mặc định 14) có `active: true` và không được đưa vào danh sách cho phép xóa ở backend, kể cả khi frontend gửi lên.
- Đã thêm `winreg` (đọc Lxss) và `which` (tìm docker). Đã cài thêm component `clippy` và `rustfmt`.

## Trạng thái test
- `cargo test`: **26 pass**, 1 ignored (smoke). Gồm: file bị khóa được báo lại còn file khác vẫn xóa; read-only; min_age; dry-run không xóa; từ chối đường dẫn không đến từ lần quét; từ chối tên không phải artifact; timeout kill tiến trình; stdin đóng nên prompt không treo được; nhóm dự án lồng nhau; parse UNC; export bindings.
- `cargo clippy --all-targets`: sạch. `cargo fmt`: đã áp dụng.
- `npx tsc --noEmit` + `npm run build`: OK.
- **Smoke test trên máy thật** (chỉ đọc, dry run):
  - Tổng quan 1,9s: `docker_data.vhdx` 26,8 GB **chưa sparse**; `ext4.vhdx` 26,1 GB sparse; hiberfil 13,5 GB.
  - Quét cache 2,2s: tìm thêm **npm cache Windows 662 MB** và **Electron 436 MB**.
  - Quét dự án WSL 4,1s: `dj-discord-bot` được đánh dấu active, nên được bảo vệ.
  - Dry run toàn bộ: 1,2 GB có thể giải phóng.

## Việc còn dở / rủi ro
- **Chưa commit git.** Chưa được yêu cầu.
- `runas` và `window-vibrancy` đã thêm nhưng chưa dùng (dành cho phiên 3/4).
- Chưa chạy `npm run tauri dev`: UI vẫn là placeholder.
- `kondo::last_modified` duyệt cả cây thư mục (theo `.gitignore`), nên có thể chậm với repo rất lớn trên Windows.
- Không còn thấy model AI của Chrome trên máy, có lẽ Chrome đã tự xóa. Mục này vẫn nằm trong registry.
- Artifact rất nhỏ (ví dụ `.turbo` ≈ 0 MB) vẫn được liệt kê. Phiên 3 có thể ẩn mục < 1 MB ở UI.

## Bước tiếp theo (Phiên 3 — UI chính)
1. Thay token màu/font của shadcn bằng token trong `docs/design/*.dc.html` (#0071E3, nền #F5F5F7/#1C1C1E…). Bỏ Geist, dùng system stack + Inter.
2. Cài thư viện: `motion`, `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual`, `zustand`, `i18next` + `react-i18next` + detector, `date-fns`, `filesize`, `lodash-es`, `zod`, `@fontsource-variable/inter`. Thêm component shadcn: sidebar, card, checkbox, switch, toggle-group, dialog, progress, sonner, table, badge, tooltip.
3. Layout sidebar + Mica (`window-vibrancy`, cửa sổ trong suốt), các màn Tổng quan / Cache dev / Dự án cũ, luồng Xác nhận → Tiến trình (Channel) → Xong, i18n vi/en.
4. Kiểm tra UI bằng `vite dev` + `mockIPC` trong trình duyệt, rồi chạy `npm run tauri dev` trên máy thật.
