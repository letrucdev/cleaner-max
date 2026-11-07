# HANDOFF — Cleaner Max

> Đọc file này đầu mỗi phiên. Cuối mỗi phiên: viết `docs/handoff/SESSION-XX.md` rồi cập nhật bảng bên dưới.

## Trạng thái hiện tại
**Phiên 4 xong — bản đầu đã hoàn thiện.** Đủ các màn theo design, tác vụ Admin (UAC), Lịch sử, Cài đặt; bộ cài NSIS (2,49 MB) và MSI ở `src-tauri/target/release/bundle/`. Tác vụ Admin **chưa chạy thật**, người dùng cần thử (xem SESSION-04).
**Phiên 5:** code đã lên https://github.com/letrucdev/cleaner-max. CI chạy ở mỗi lần push/PR; push tag `v*` thì có Release nháp (xem CLAUDE.md, mục "CI và phát hành").
Design (đã duyệt, đã sửa theo góp ý): https://claude.ai/artifact/59vGLBPgwYMRZzCXJb1p3t

## Các phiên

| # | Ngày | Nội dung | Trạng thái | Bàn giao |
|---|---|---|---|---|
| 1 | 06/11/2026 | Setup toolchain (Build Tools, Rust ở D:), khung Tauri + shadcn, 9 skills, design 8 màn | ✅ Xong | [SESSION-01](docs/handoff/SESSION-01.md) |
| 2 | 06/11/2026 | Sửa design theo góp ý; lõi Rust: registry, scan, WSL, clean engine (dry-run), history, tauri-specta, 26 test | ✅ Xong | [SESSION-02](docs/handoff/SESSION-02.md) |
| 3 | 06/11/2026 | UI chính: token theo design, sidebar + Mica, Tổng quan, Cache dev, Dự án cũ, Rác Windows, luồng xác nhận/tiến trình, i18n vi/en, animation, mock IPC | ✅ Xong | [SESSION-03](docs/handoff/SESSION-03.md) |
| 4 | 06/11/2026 | Tác vụ UAC (nén vhdx, sparse, Docker prune, hiberfil, DISM), Lịch sử, Cài đặt đầy đủ, rà soát animation, icon, bộ cài NSIS/MSI | ✅ Xong | [SESSION-04](docs/handoff/SESSION-04.md) |
| 5 | 07/11/2026 | Commit + push GitHub, CI (build/fmt/clippy/test), release nháp theo tag `v*`, 16 skill mới, quy tắc tìm skill trên skills.sh | ✅ Xong | [SESSION-05](docs/handoff/SESSION-05.md) |
| 6 | 07/11/2026 | Ổ hệ thống lấy từ `%SystemDrive%`, dialog tiến trình tác vụ Admin (chặn chuyển trang + đóng app), mở thư mục dự án, sửa layout bảng Dự án cũ và padding trang Hệ thống | ✅ Xong (chưa thử app thật) | [SESSION-06](docs/handoff/SESSION-06.md) |

## Liên kết nhanh
- Kế hoạch: [docs/PLAN.md](docs/PLAN.md)
- Quy ước: [CLAUDE.md](CLAUDE.md)
- Nguồn design: [docs/design/](docs/design/)
- API backend (tự sinh): [src/lib/bindings.ts](src/lib/bindings.ts)
