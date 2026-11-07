# Phiên 01 — Setup môi trường + Thiết kế (06/11/2026)

## Mục tiêu phiên
Dựng môi trường build Tauri trên Windows, khởi tạo dự án, cài skills, làm design trên Claude Design để người dùng duyệt. **Chưa viết logic app.**

## Đã làm

| Việc | Kết quả |
|---|---|
| Visual Studio Build Tools 2022 (VCTools + Windows SDK) | Cài qua winget vào `D:\BuildTools`. Lúc đầu máy **chưa có**: "MSVC: True" khi kiểm tra trước đó thực ra là `vswhere.exe` của SSMS |
| Rust | rustup, bản stable 1.99.1, profile minimal. `RUSTUP_HOME=D:\rust\rustup`, `CARGO_HOME=D:\rust\cargo` (biến môi trường User + PATH) |
| Khung dự án | `create-tauri-app` (React + TS, npm) ở `D:\dev\disk-cleaner`, `git init -b main` (**chưa commit**) |
| Kiểm tra Rust | `cargo check` chạy được (1m31s lần đầu) |
| Frontend | Tailwind v4 (`@tailwindcss/vite`), alias `@/*`, shadcn/ui (`radix-nova`, base Radix, icon Lucide). `npm run build` chạy được |
| Cấu hình Tauri | productName "Disk Cleaner", cửa sổ 1200×800 (tối thiểu 960×640), đóng gói NSIS + MSI |
| Wrapper lệnh | `scripts/win.ps1`: chạy lệnh trong root dự án bằng toolchain Windows, không tương tác |
| Skills | 9 skill trong `.claude/skills` (bản copy, khóa ở `skills-lock.json`). Đã rà: chỉ có Markdown + 1 script đọc file của shadcn, không có lệnh mạng hay lệnh nguy hiểm |
| Thiết kế | Claude Design: https://claude.ai/artifact/59vGLBPgwYMRZzCXJb1p3t (8 artboard). Nguồn sao lưu ở `docs/design/` |
| Tài liệu | `CLAUDE.md` (quy ước), `docs/PLAN.md` (kế hoạch đã duyệt), file này, `HANDOFF.md` |

### Skills đã cài
| Skill | Nguồn | Dùng cho |
|---|---|---|
| shadcn | shadcn/ui | Thêm/tùy biến component |
| apple-design, emil-design-eng, review-animations | emilkowalski/skills | Phong cách Apple, spring, review animation |
| frontend-design | anthropics/skills | Chất lượng giao diện |
| vercel-react-best-practices, web-design-guidelines | vercel-labs/agent-skills | Hiệu năng React, audit UI/a11y |
| tauri-v2 | nodnarbnitram/claude-code-extensions (8.3K lượt cài) | Command, IPC, capabilities |
| rust-best-practices | apollographql/skills (22.4K lượt cài) | Rust idiomatic, xử lý lỗi, test |

Trên web skills.sh không tìm được skill nào cho Tauri hoặc Rust, nhưng `npx skills find` (CLI) thì tìm ra. Skill về Apple HIG trên đó có rất ít lượt cài, nên mình dùng `apple-design` thay thế.

## Thiết kế (chờ duyệt)
Bản design có 8 artboard: Tổng quan, Cache dev, Dự án cũ, Hệ thống & Admin, Lịch sử, Cài đặt, Xác nhận & tiến trình (3 bước), Tổng quan Dark. Trong chế độ Play có thể bấm điều hướng sidebar, tick chọn mục, đổi tab, đổi ngưỡng ngày, và đi qua luồng xác nhận → tiến trình → xong. Mỗi artboard có tweak `dark`.

Các quyết định thiết kế:
- Ngôn ngữ hình ảnh theo HIG nhưng là thiết kế gốc, không sao chép chrome của macOS. Nút cửa sổ đặt bên phải theo chuẩn Windows, vì đây là app Windows.
- Màu nhấn #0071E3: chữ trắng trên nền này đạt contrast ~4.6:1. Chữ màu nhấn trên nền sáng dùng #0066CC. Màu ngữ nghĩa: xanh lá = an toàn/đã bật, cam = cần chú ý, đỏ chỉ dùng cho nút xóa.
- Font: system stack (`-apple-system`, `SF Pro Text`), sau đó Inter, rồi `Segoe UI Variable`. Không nhúng SF Pro vì vướng license.
- Số liệu lấy từ máy thật, theo hai lần dọn ngày 05–06/11/2026.

## Quyết định & lý do
- Dự án đặt ở **D:** vì ổ C: chỉ còn khoảng 35–38 GB, còn thư mục `target` của Rust có thể chiếm 3–5 GB.
- Build bằng toolchain Windows, gọi từ WSL qua `win.ps1`, vì build Tauri cho Windows trên đường dẫn `\\wsl$` rất chậm và binary sẽ sai nền tảng.
- Chọn shadcn preset `nova`, nhưng token màu và font **sẽ được thay** bằng bộ của bản design ở phiên 3.

## Trạng thái test
- `cargo check`: OK.
- `npm run build`: OK.
- Chưa chạy `npm run tauri dev`, vì chưa có gì để xem.

## Việc còn dở / rủi ro
- **Chưa commit git.** Người dùng chưa yêu cầu commit.
- `@types/node` đã cài, nhưng `tsconfig.node.json` vẫn là bản mặc định của scaffold.
- shadcn đã tự thêm font Geist (`@fontsource-variable/geist`). Phiên 3 sẽ thay bằng Inter/system stack theo design.
- Ổ C: vẫn còn ~2–3 GB phần SDK/shared của Build Tools (bắt buộc).

## Bước tiếp theo (Phiên 2 — sau khi người dùng duyệt design)
1. Áp dụng góp ý design, nếu có.
2. Thêm crate: `tauri-specta`, `specta`, `kondo-lib`, `jwalk`, `rayon`, `sysinfo`, `remove_dir_all`, `windows`, `runas`, `window-vibrancy`, `dirs`, `thiserror`, `anyhow`, `tempfile` (dev), cùng các plugin `store`, `log`, `dialog`, `window-state`, `os`.
3. Viết `model.rs`, `registry/` (cache dev, rác Windows), `scan/` (disk, vhdx, folders, projects, wsl), `clean/engine.rs` (dry-run), `history.rs`. Sinh binding TS bằng tauri-specta.
4. Unit test trên thư mục tạm.
