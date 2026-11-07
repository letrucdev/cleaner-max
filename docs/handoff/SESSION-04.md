# Phiên 04 — Tác vụ Admin, Lịch sử, Cài đặt, đóng gói (06/11/2026)

## Mục tiêu phiên
Hoàn thiện các phần còn lại của bản đầu: tác vụ cần UAC, màn Lịch sử, Cài đặt đầy đủ, rà soát animation, icon và bộ cài.

## Đã làm

### Backend — `src-tauri/src/admin.rs` (mới)
| Tác vụ | Cách chạy | Kiểm tra đầu vào / an toàn |
|---|---|---|
| Nén vhdx (`compactVhdx`) | Script PS chạy qua UAC: `wsl --shutdown`, rồi `diskpart /s` (select / attach **readonly** / compact / detach) | Đường dẫn phải trùng một ổ ảo trong `overview()`, không chứa `"`. Từ chối nếu Docker Desktop đang chạy |
| Bật sparse (`setSparse`) | UAC: `wsl --shutdown`, rồi `wsl --manage <distro> --set-sparse true` | Distro phải có trong registry Lxss. Tên được escape kiểu PowerShell |
| Dọn Docker (`dockerPrune`) | **Không cần UAC**: `docker image prune -a -f`, `docker builder prune -a -f` (timeout 30 phút) | Không động tới volume. Đọc "Total reclaimed space" để tính dung lượng |
| Tắt ngủ đông (`hibernateOff`) | UAC: `powercfg /h off` | Dung lượng giải phóng = kích thước hiberfil trước đó |
| Dọn Windows Update (`dismCleanup`) | UAC: `DISM /Online /Cleanup-Image /StartComponentCleanup /NoRestart` | Dung lượng = chênh lệch dung lượng trống của ổ C: |

- Script được ghi vào `%TEMP%\disk-cleaner` (UTF-8 có BOM), log ghi ra file rồi đọc lại. Dòng `EXIT=<mã>` cho biết thành công hay không. Ký tự NUL do output UTF-16 của `wsl.exe` được loại bỏ.
- Bấm **No** ở UAC (lỗi 1223) thì kết quả là `skipped` với message "cancelled", không tính là lỗi.
- Command mới `run_admin_task(task, recordHistory)`, trả về `ItemResult`, ghi vào lịch sử nếu bật.
- `clean()` có thêm tham số `recordHistory`, tương ứng switch "Ghi lịch sử" trong Cài đặt.
- Bản release không còn cảnh báo (export bindings chỉ có ở debug/test).

### Frontend
| Phần | File |
|---|---|
| Tác vụ nâng cao: danh sách dựng từ dữ liệu thật; hộp thoại cảnh báo riêng cho từng tác vụ; nút hiện trạng thái đang chạy; toast kết quả | `features/system/AdminTasks.tsx`, `SystemPage.tsx` (2 cột như design) |
| Lịch sử: nhóm theo ngày (Hôm nay/Hôm qua), từng lần mở rộng được, trạng thái từng mục kèm lý do bỏ qua/lỗi, tổng đã giải phóng đếm dần | `features/history/HistoryPage.tsx` |
| Cài đặt: ngôn ngữ, giao diện, thư mục quét (thêm/bỏ), ngưỡng "dự án cũ" (30/90/180), ngưỡng "đang làm" (7/14/30), switch an toàn (2 mục luôn bật + "Ghi lịch sử") | `features/settings/SettingsPage.tsx` |
| Store: `recordHistory`; API: `adminTask`, `useHistory` | `stores/settings.ts`, `lib/api.ts` |
| Mock: `run_admin_task`, `set_window_theme`, lịch sử mẫu | `mocks/ipc.ts` |

### Rà soát animation (theo skill `review-animations`)
- **#7 (chỉ animate transform/opacity):** thanh dung lượng, thanh ổ đĩa, thanh tiến trình đổi từ `width` sang `scaleX`; phần mở rộng ở Lịch sử và dòng thư mục ở Cài đặt đổi từ `height` sang opacity + dịch chuyển.
- **#4:** thanh ổ đĩa từ 0,8s xuống 0,5s. Donut (0,7s), số đếm (0,5s) và hiệu ứng đổi theme (0,52s) giữ nguyên vì là thao tác hiếm và mang tính giải thích dữ liệu.
- Đạt: không có `ease-in`, không phóng từ `scale(0)`, có reduced-motion (MotionConfig `user` + CSS), có stagger, spring ngắt giữa chừng được.

### Sửa thêm
- Định dạng dung lượng: chuyển đơn vị khi vượt 1000, nên không còn hiện "1.003,5 MB" (thành "1 GB").
- Toast chuyển lên trên, không đè thanh chọn.
- Switch xanh lá khi bật (theo design / macOS).
- Cảnh báo riêng cho Docker ("Docker Desktop cần đang chạy…").

### Icon & đóng gói
- `assets/app-icon.svg`: ổ đĩa trắng trên nền xanh bo góc. Bộ icon sinh bằng `npx tauri icon`; đã xóa phần Android/iOS.
- `npm run tauri build` (3m50s):
  - `src-tauri/target/release/bundle/nsis/Disk Cleaner_0.1.0_x64-setup.exe` (**2,49 MB**)
  - `src-tauri/target/release/bundle/msi/Disk Cleaner_0.1.0_x64_en-US.msi` (3,46 MB)
- Sửa `scripts/win.ps1`: `CI=true` (Tauri CLI không nhận `1`).

## Kiểm thử
- `cargo test`: **32 pass** (thêm 6 test admin: script diskpart, escape tham số, đọc Docker reclaimed, làm sạch log UTF-16, từ chối đầu vào lạ trước khi gọi UAC, key ổn định). `cargo clippy --all-targets` sạch. `cargo check --release` không cảnh báo.
- `tsc --noEmit` OK.
- Trình duyệt + mock: màn Hệ thống (2 cột, cảnh báo, trạng thái đang chạy), Lịch sử, Cài đặt hiển thị đúng.
- **Bản release** khởi động OK với dữ liệu thật, icon mới.
- **Chưa chạy thật tác vụ Admin nào.** Nén vhdx và bật sparse gọi `wsl --shutdown`, sẽ tắt luôn phiên Claude Code đang chạy trong WSL. Những tác vụ này cần người dùng tự thử trong app.

## Dọn cảnh báo (theo yêu cầu cuối phiên)
- **Tailwind (IntelliSense "suggestCanonicalClasses")**: có 60 class chưa ở dạng chuẩn, ví dụ `h-[30px]` → `h-7.5`, `break-words` → `wrap-break-word`, `group-has-[:focus-visible]` → `group-has-focus-visible`.
  - Thêm `scripts/tw-canonical.mjs` (`npm run lint:tw` / `lint:tw:fix`): dùng `@tailwindcss/node` nạp chính `src/index.css`, rồi gọi `canonicalizeCandidates` giống IntelliSense.
  - Đã sửa 59 class, hiện còn **0**.
  - **Bỏ qua 1 gợi ý sai**: `rounded-[4px] → rounded-lg`. Công cụ dùng thang bo góc mặc định, nhưng dự án đã override `--radius-lg` = 10px. Script tự bỏ qua mọi gợi ý rơi vào khóa radius bị override.
- **Vite**: `__dirname` → `import.meta.dirname` (cảnh báo `configLoader: 'native'`).
- **Chunk > 500 kB**: tách bằng `build.rolldownOptions.output.codeSplitting.groups` thành react 219 kB / motion 154 kB / radix 112 kB / vendor 253 kB / app 89 kB.
- `npm run build`: **không còn cảnh báo**.

## Đổi tên, README (theo yêu cầu cuối phiên)
- **Tên app: Cleaner Max**, developer **letrucdev**.
  - `productName`, tiêu đề cửa sổ, i18n, `index.html`.
  - `identifier` = `com.letrucdev.cleanermax`. Đổi identifier nên thư mục dữ liệu app cũng đổi theo: cài đặt và lịch sử của các bản dev trước sẽ không còn.
  - `mainBinaryName` = `cleaner-max`; Cargo package `cleaner-max` / lib `cleaner_max_lib`; npm package `cleaner-max`.
  - Bundle: `publisher` letrucdev, `copyright`, mô tả ngắn/dài, category Utility.
  - Thư mục tạm của tác vụ admin: `%TEMP%\cleaner-max`.
  - **Thư mục dự án vẫn là `D:\dev\disk-cleaner`**, vì đổi tên sẽ làm hỏng script, `CLAUDE.md` và memory.
- **Tắt menu chuột phải ở bản release** (`main.tsx`, `import.meta.env.PROD`). Ô nhập liệu vẫn giữ menu để copy/paste. Bản dev vẫn có menu để Inspect.
- **README.md** viết lại theo kiểu README giới thiệu dự án: logo, badge, ảnh chụp, lý do ra đời, tính năng, nguyên tắc an toàn, cài đặt, build, kiến trúc (mermaid), công nghệ, danh sách mục dọn được, lộ trình. Không dùng emoji.
- **Ảnh chụp README**: `scripts/screenshots.ps1` dùng Edge headless (profile tạm, 1440×900, scale 2×) chụp 7 màn từ `npm run dev` + mock vào `docs/images/`. Mock có "chế độ chụp" qua tham số URL (`?page=&theme=&lang=&dialog=clean`), chỉ có trong DEV. Tên user trong mock đổi thành `user`.

## Việc còn dở / rủi ro
- **Chưa commit git.**
- README ghi "Chưa chọn giấy phép". Cần người dùng chọn license (MIT, Apache-2.0…).
- Tác vụ Admin chưa được chạy thật. Nên thử theo thứ tự rủi ro thấp đến cao: Dọn Docker (không UAC), Tắt ngủ đông, Nén ổ ảo Docker (thoát Docker Desktop trước), DISM (lâu).
- Nén ổ ảo trên file sparse: dung lượng đo bằng `len()` (kích thước logic), nên có thể báo ít hơn thực tế.
- Bộ cài chưa ký số (code signing), Windows SmartScreen sẽ cảnh báo khi cài.
- MSI chỉ có giao diện cài tiếng Anh (`en-US`). NSIS dùng ngôn ngữ mặc định.
- `@tanstack/react-virtual` vẫn chưa dùng.

## Gợi ý bước tiếp theo (nếu làm tiếp)
1. Người dùng chạy thử các tác vụ Admin, rồi sửa theo log thực tế.
2. Ký số bộ cài; thêm cập nhật tự động (`tauri-plugin-updater`).
3. Chạy dry-run ngay trong hộp thoại xác nhận cho mục có kích thước "Chưa rõ" (pnpm prune).
4. Chạy định kỳ (nhắc khi ổ C: dưới X GB).
