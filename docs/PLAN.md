# Kế hoạch: App dọn dung lượng "Disk Cleaner" (Tauri, Windows)

## Context
Phiên vừa rồi dọn tay ổ C: từ 9.6 GB lên 35 GB trống. Cách làm: quét dung lượng, xác định nguyên nhân (file `ext4.vhdx` của WSL và `docker_data.vhdx` phình to), dọn cache dev ở cả WSL lẫn Windows, xóa build output và `node_modules` của dự án cũ, dọn rác Windows và thùng rác, sau đó nén/sparse vhdx.
Mục tiêu là gói toàn bộ quy trình đó vào một app desktop **Windows native** viết bằng Tauri v2. App phải an toàn (luôn cho xem trước rồi mới xác nhận), giao diện **theo phong cách Apple (HIG)**, có animation chuyên nghiệp, hỗ trợ **Việt + Anh**, và ưu tiên dùng thư viện có sẵn.

Các quyết định đã chốt với người dùng:
- Chạy native trên Windows; dọn WSL qua `wsl.exe`.
- Bản đầu có đủ 4 nhóm tính năng: Tổng quan, Cache dev, Dự án cũ, Rác Windows + tác vụ Admin.
- Xóa: quét thử → hiển thị dung lượng sẽ giải phóng → xác nhận → xóa vĩnh viễn → ghi lịch sử.
- UI dùng shadcn/ui + Motion. Mã nguồn đặt ở `D:\dev\disk-cleaner`. Rust cài trên Windows, `RUSTUP_HOME`/`CARGO_HOME` đặt ở `D:\rust`.
- Quy trình: làm design trên Claude Design → **người dùng duyệt** → rồi mới code.
- Mỗi phiên làm việc kết thúc bằng một file bàn giao.

## Môi trường (đã kiểm tra)
- Windows: Node v24.11, có MSVC Build Tools, có WebView2. **Chưa có Rust** và chưa có pnpm.
- Claude Code chạy trong WSL. Mọi lệnh build và cài gói phải chạy bằng toolchain Windows: `cmd.exe /c "cd /d D:\dev\disk-cleaner && npm ..."`. **Không** chạy `npm install` từ WSL trên `/mnt/d`, vì sẽ cài binary Linux.
- Mọi lệnh PowerShell gọi từ WSL phải có `-NonInteractive` và `</dev/null`, kèm timeout. Bài học từ phiên trước: một lời nhắc ẩn đã treo lệnh suốt 50 phút.

## Tech stack (ưu tiên thư viện có sẵn)
**Frontend:** React 19 + Vite + TypeScript, chạy với npm trên Windows.
| Nhu cầu | Thư viện |
|---|---|
| Component | shadcn/ui (Radix) + Tailwind v4, token tùy chỉnh theo Apple HIG |
| Animation/transition | `motion` (motion/react): layout animation, AnimatePresence, spring |
| Icon | `lucide-react` |
| Toast | `sonner` (qua shadcn) |
| Biểu đồ (donut/bar dung lượng) | shadcn Charts (`recharts`) |
| Bảng lớn | `@tanstack/react-table` + `@tanstack/react-virtual` |
| Trạng thái async gọi Rust | `@tanstack/react-query` |
| State UI | `zustand` |
| i18n | `i18next`, `react-i18next`, `i18next-browser-languagedetector` |
| Ngày giờ / "3 tháng trước" | `date-fns` (+ locale `vi`) |
| Format dung lượng | `filesize` |
| Gom nhóm, sắp xếp, debounce | `lodash-es` (groupBy, sumBy, orderBy, debounce) |
| Validate dữ liệu | `zod` |
| Font | `@fontsource-variable/inter`, fallback sang system stack (`Segoe UI Variable`). Không nhúng SF Pro vì vướng license |

**Backend Rust (Tauri v2):**
| Nhu cầu | Crate / plugin |
|---|---|
| Binding TS có kiểu cho command | `tauri-specta` + `specta` |
| Quét dự án và build artifact | `kondo-lib` (hỗ trợ sẵn Node, .NET, Cargo, Python, Composer…) |
| Duyệt thư mục song song, tính size | `jwalk` + `rayon` |
| Thông tin ổ đĩa, tiến trình (Chrome đang chạy?) | `sysinfo` |
| Xóa thư mục bền vững trên Windows | `remove_dir_all` |
| Thùng rác (truy vấn/làm rỗng) | `windows` crate: `SHQueryRecycleBinW`, `SHEmptyRecycleBinW`. Không dùng `Clear-RecycleBin`, vì đã lỗi ở phiên trước |
| Chạy tác vụ với quyền Admin (UAC) | `runas` |
| Hiệu ứng Mica/Acrylic giống vibrancy macOS | `window-vibrancy` |
| Thư mục hệ thống | `dirs` |
| Lỗi | `thiserror`, `anyhow` |
| Plugin Tauri | `store` (settings + lịch sử), `log`, `dialog` (chọn thư mục), `opener` (mở trong Explorer), `window-state`, `os` |

## Skills cài từ skills.sh (cài ở mức project)
Tìm thấy trên skills.sh: `npx skills add <owner/repo>`.
- `shadcn/ui` → skill **shadcn**
- `emilkowalski/skills` → **apple-design**, **emil-design-eng**, **review-animations**
- `anthropics/skills` → **frontend-design**
- `vercel-labs/agent-skills` → **vercel-react-best-practices**, **web-design-guidelines**

Trên skills.sh không có skill nào cho Tauri hoặc Rust. Ở phiên 1 sẽ chạy `npx skills find tauri` / `rust` bằng CLI để thử lại. Phiên 1 cũng kiểm tra `npx skills add --help` xem có cờ chọn từng skill hay chạy không tương tác không, để chỉ cài đúng các skill trên.

## Kiến trúc
```
D:\dev\disk-cleaner\
  src-tauri\src\
    main.rs / lib.rs          # đăng ký command, plugin, vibrancy
    model.rs                  # ScanItem, CleanTarget, Risk, Platform (specta types)
    registry\                 # danh sách cleaner khai báo dạng dữ liệu
      dev_caches.rs           # npm, pnpm, NuGet, pip, uv, composer, Playwright, VS Code, electron, node-gyp…
      windows_junk.rs         # Temp(>7 ngày), CrashDumps, SquirrelTemp, installer cũ, Chrome model…
    scan\ disk.rs vhdx.rs folders.rs projects.rs(kondo-lib) wsl.rs
    clean\ engine.rs          # dry-run → xóa có kiểm soát; bỏ qua file bị khóa, báo lại
    admin\ elevate.rs tasks.rs # compact vhdx, set-sparse, docker prune, hiberfil, DISM
    history.rs
  src\  (React)
    app\ layout (sidebar kiểu macOS), routes
    features\ overview | caches | projects | system | admin | history | settings
    components\ui (shadcn)  lib\ ipc (bindings sinh tự động), format.ts (date-fns/filesize)
    locales\ vi.json en.json
  docs\handoff\SESSION-01.md …  HANDOFF.md (mục lục + trạng thái)  CLAUDE.md
```

**Cleaner registry:** mỗi mục là dữ liệu, gồm `id`, `platform` (windows | wsl), `paths`, `native_cmd` tùy chọn (`npm cache clean --force`, `pnpm store prune`, `dotnet nuget locals all --clear`, `uv cache clean`…), `blocked_by_process` (ví dụ `chrome.exe`), và `risk` (safe | rebuildable | user-data). Engine chỉ đọc registry nên thêm cleaner mới không cần sửa logic.

**Phía WSL:** liệt kê distro bằng `wsl.exe -l -v`. Tính size và xóa bằng `wsl.exe -d <distro> -- sh -c '...'` với một script POSIX đóng gói sẵn, trả về JSON lines. Không duyệt qua `\\wsl.localhost` vì rất chậm.

**Bài học từ phiên trước, đưa thành logic:**
- pnpm: chỉ `store prune`, không xóa store. Store dùng hardlink chung với dự án đang làm.
- pnpm qua corepack có thể hỏng bản mới (12.16.1). Cần gọi đúng phiên bản trong `packageManager` của dự án.
- Chrome đang mở thì bỏ qua model AI và báo người dùng.
- Không thấy `docker` thì báo "Mở Docker Desktop".
- Xóa trong Linux xong chưa có nghĩa là ổ C: trống ra. Màn Tổng quan phải hiện kích thước vhdx và trạng thái sparse, gợi ý nén.
- Thư mục có hàng chục nghìn file nhỏ: xóa bằng Rust native, có thanh tiến độ, không gọi PowerShell.

**Tác vụ Admin** (chạy qua `runas`, ghi log ra file tạm, hiện kết quả trong app, luôn cảnh báo trước):
- Nén vhdx: cảnh báo `wsl --shutdown` sẽ đóng mọi phiên WSL, rồi chạy script diskpart (select / attach readonly / compact / detach).
- `wsl --manage <distro> --set-sparse true`
- Docker: `system df`, `image prune -a`, `builder prune -a`. Không động tới volume nếu người dùng chưa chọn rõ.
- `powercfg /h off` (kèm cảnh báo tắt Fast Startup).
- `Dism /Online /Cleanup-Image /StartComponentCleanup`.

## Màn hình (sẽ thiết kế ở Claude Design trước)
1. **Tổng quan:** donut dung lượng từng ổ, thẻ "Nguyên nhân chính" (vhdx, Docker, hiberfil, thùng rác), nút "Quét nhanh".
2. **Cache dev:** danh sách nhóm theo Windows/WSL, chọn nhiều mục, tổng dung lượng sẽ giải phóng cập nhật kèm animation số.
3. **Dự án cũ:** chọn thư mục gốc; bảng dự án có ngày sửa cuối (date-fns relative) và các artifact; lọc theo "không sửa > N tháng".
4. **Hệ thống & Admin:** rác Windows, thùng rác, tác vụ cần UAC kèm badge khiên.
5. **Lịch sử:** timeline các lần dọn. **Cài đặt:** ngôn ngữ, theme sáng/tối/hệ thống, thư mục quét, ngưỡng ngày.
- Luồng xác nhận: dùng sheet/dialog kiểu macOS, liệt kê chính xác những gì sẽ xóa.
- Animation: chuyển trang kiểu spring, thanh tiến độ, số đếm, danh sách stagger. Giới hạn theo `prefers-reduced-motion`.

## Lộ trình theo phiên (mỗi phiên kết thúc bằng `docs/handoff/SESSION-XX.md` và cập nhật `HANDOFF.md`)
**Phiên 1: Setup + Design**
- Cài rustup (`RUSTUP_HOME`/`CARGO_HOME` = `D:\rust`). Tạo `D:\dev\disk-cleaner` bằng `create-tauri-app` (React-TS, npm), `git init`.
- `shadcn init`, cài các skill ở trên, viết `CLAUDE.md` ghi các quy ước (dùng thư viện, chạy lệnh qua Windows, làm theo HIG).
- Tạo **Design artifact** qua Artifact quickstart (`intent: "design"`) cho 5 màn hình, cả sáng lẫn tối, và luồng xác nhận.
- Viết handoff. **Dừng lại chờ người dùng duyệt design.**

**Phiên 2: Lõi Rust**
- model, registry, scan (disk/vhdx/folders/kondo/wsl), clean engine dry-run, history, tauri-specta bindings, unit test.

**Phiên 3: UI chính**
- Layout + vibrancy, Tổng quan, Cache dev, Dự án cũ, i18n, animation. Bám theo design đã duyệt.

**Phiên 4: Admin + hoàn thiện**
- Rác Windows, thùng rác, tác vụ UAC, Lịch sử, Cài đặt, review animation (skill review-animations), đóng gói NSIS/MSI.

**Nội dung file bàn giao:** đã làm gì, quyết định và lý do, lệnh chạy/build, trạng thái test, việc còn dở, rủi ro, bước tiếp theo.

## Kiểm thử
- `cargo test`: test registry và engine trên thư mục tạm (`tempfile`), gồm dự án giả có `node_modules`/`.next`/`bin`. Dry-run tuyệt đối không xóa gì. File bị khóa phải được báo lại chứ không làm hỏng cả lượt chạy.
- `cmd.exe /c "cd /d D:\dev\disk-cleaner && npm run tauri dev"`: chạy app thật, quét thử rồi đối chiếu số liệu với kết quả phiên trước (vhdx, cache, Chrome model…).
- Kiểm tra UI: chạy `vite dev` với `mockIPC` của `@tauri-apps/api/mocks`, mở bằng Claude in Chrome để chụp màn hình và so với design (sáng/tối, vi/en, reduced-motion).
- Tác vụ Admin: kiểm tra với vhdx/sandbox thử hoặc chỉ dừng ở bước xác nhận. Không chạy tác vụ phá hủy trên máy thật khi chưa có người dùng đồng ý.
- `npm run tauri build`: cài thử bản NSIS trên Windows.
