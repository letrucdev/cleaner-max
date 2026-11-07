# Cleaner Max — hướng dẫn cho Claude

> Tên cũ trong thời gian phát triển: "Disk Cleaner". Thư mục dự án vẫn là `D:\dev\disk-cleaner`.

App desktop **Windows native** (Tauri v2 + React 19) dọn dung lượng ổ C:: cache dev (Windows + WSL), build artifact của dự án cũ, rác Windows, và các tác vụ Admin (nén `.vhdx`, sparse WSL, Docker prune, hiberfil, DISM).

- Kế hoạch tổng: `docs/PLAN.md`
- Trạng thái và việc tiếp theo: `HANDOFF.md`. **Đọc trước tiên** ở mỗi phiên.
- Thiết kế đã duyệt: Claude Design https://claude.ai/artifact/59vGLBPgwYMRZzCXJb1p3t. Bản sao nguồn ở `docs/design/*.dc.html`, chứa token màu, kích thước, copy.

## Quy tắc bắt buộc

1. **Mỗi phiên kết thúc bằng file bàn giao** `docs/handoff/SESSION-XX.md`, rồi cập nhật bảng trong `HANDOFF.md`.
2. **Ưu tiên thư viện có sẵn, chỉ tự viết khi không có thư viện phù hợp.**
   - Ngày giờ dùng `date-fns` (locale `vi`/`enUS`). Dung lượng dùng `filesize`. Gom nhóm/sắp xếp/debounce dùng `lodash-es`.
   - Animation dùng `motion` (`motion/react`). Component dùng shadcn/ui (`npx shadcn@latest add <name>`).
   - **Tìm và dùng component shadcn/ui có sẵn trước khi tự viết.** Xem `src/components/ui` và các variant của nó trước (ví dụ đường dẫn bấm được thì dùng `<Button variant="link">`, không viết `<button>` trần). Chưa có thì tìm trong registry (skill `shadcn`, `npx shadcn@latest search`) rồi `add`. Chỉnh giao diện bằng `className`, vì `cn` tự ghi đè lớp xung đột (`h-8` thành `h-auto`, `px-2.5` thành `p-0`). Chỉ tự viết khi shadcn không có component phù hợp.
   - Bảng dùng `@tanstack/react-table` + `@tanstack/react-virtual`. Async gọi Rust dùng `@tanstack/react-query`. State dùng `zustand`. i18n dùng `i18next`.
   - Rust: quét dự án dùng `kondo-lib`; duyệt thư mục dùng `jwalk` + `rayon`; ổ đĩa/tiến trình dùng `sysinfo`; xóa dùng `remove_dir_all`; UAC dùng `runas`; vibrancy dùng `window-vibrancy`; bindings dùng `tauri-specta`.
3. **Giao diện theo Apple HIG**: rõ ràng, tôn trọng nội dung, có chiều sâu (vibrancy/Mica). Dùng spring animation, tôn trọng `prefers-reduced-motion`. Contrast chữ ≥ 4.5:1. Hỗ trợ cả sáng lẫn tối. UI mặc định tiếng Việt, có tiếng Anh.
   - Dùng class Tailwind dạng chuẩn (`h-7.5`, không viết `h-[30px]`). Riêng bo góc thì giữ giá trị tùy ý, vì thang `--radius-*` đã bị override (`rounded-lg` = 10px).
   - **Nhãn nút không có dấu ba chấm** (viết "Nén", không viết "Nén…"). Đây là góp ý của người dùng trên design.
4. **An toàn khi xóa**: luôn quét thử → xem trước → xác nhận → xóa → ghi lịch sử. Không bao giờ xóa dự án sửa trong N ngày gần đây. Gặp file bị khóa thì bỏ qua và báo lại, không dừng cả lượt.
5. **Dùng skill trước khi làm, tìm thêm trên [skills.sh](https://skills.sh) khi còn thiếu.**
   - Bắt đầu một việc thì xem bảng [Skills đã cài](#skills-đã-cài) và gọi skill khớp với việc đó.
   - Việc chưa có skill phù hợp (công nghệ mới, loại tác vụ mới như i18n, đóng gói, hiệu năng) thì tìm bằng `npx -y skills find <từ khóa>`, hoặc tìm trên https://skills.sh.
   - **Chỉ đề xuất, không tự cài.** Liệt kê 2–4 ứng viên kèm `owner/repo@skill`, số lượt cài và lý do chọn, rồi hỏi người dùng. Ưu tiên nguồn chính chủ (anthropics, vercel-labs, github, microsoft, getsentry, chủ thư viện) và skill nhiều lượt cài.
   - Người dùng đồng ý thì cài vào dự án: `npx -y skills add <owner/repo> --skill <tên> -a claude-code --copy -y`. Lệnh này tự cập nhật `skills-lock.json`.
   - Sau khi cài: mở các file không phải `.md` (script, hook) xem có gì bất thường, thêm skill vào bảng bên dưới, và ghi vào file bàn giao của phiên.

## Môi trường (Claude Code chạy trong WSL, dự án ở `D:\dev\disk-cleaner` = `/mnt/d/dev/disk-cleaner`)

- **Mọi lệnh npm/cargo/tauri phải chạy bằng toolchain Windows** qua wrapper:
  ```bash
  cd /mnt/c && powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File 'D:\dev\disk-cleaner\scripts\win.ps1' "npm run build" </dev/null 2>&1 | tr -d '\r'
  ```
  Không chạy `npm install` từ WSL, vì sẽ cài binary Linux vào `node_modules`.
- Rust nằm ở `D:\rust` (`RUSTUP_HOME`/`CARGO_HOME`). MSVC Build Tools nằm ở `D:\BuildTools`. Wrapper đã tự đặt PATH.
- Lệnh PowerShell gọi từ WSL luôn cần `-NonInteractive` và `</dev/null`, kèm `timeout`. Một lời nhắc ẩn từng làm treo lệnh 50 phút.
- Sửa file trực tiếp qua `/mnt/d/...` bằng Edit/Write là bình thường.
- `win.ps1` đặt `CI=true` (không phải `1`), vì Tauri CLI từ chối giá trị khác `true`/`false`.
- **Không tự chạy thật tác vụ có `wsl --shutdown`** (nén vhdx, bật sparse): lệnh này tắt luôn phiên Claude Code đang chạy trong WSL. Chỉ test phần sinh script, còn chạy thật thì để người dùng làm trong app.
- Khi chạy lệnh dài (`tauri dev`, `npm run dev`) ở chế độ nền mà có lọc qua `grep`, **phải thêm `--line-buffered`**. Nếu không, output nằm kẹt trong buffer, script chờ dòng "Running" sẽ treo mãi.

## Lệnh

| Việc | Lệnh (truyền vào `win.ps1`) |
|---|---|
| Dev (app thật) | `npm run tauri dev` |
| Dev UI trong trình duyệt (mock IPC, dữ liệu giả) | `npm run dev` rồi mở http://localhost:1420 |
| Build frontend | `npm run build` |
| Kiểm tra Rust | `cd src-tauri && cargo test` / `cargo clippy --all-targets` / `cargo fmt` |
| Sinh lại `src/lib/bindings.ts` | `cd src-tauri && cargo test export_bindings` (debug run cũng tự sinh) |
| Smoke test trên máy thật (chỉ đọc, dry run) | `cd src-tauri && cargo test smoke -- --ignored --nocapture` |
| Đóng gói | `npm run tauri build` (NSIS + MSI) |
| Thêm component | `npx shadcn@latest add dialog` |
| Chụp lại ảnh cho README (cần `npm run dev` đang chạy) | `powershell -File scripts\screenshots.ps1` |
| Kiểm tra class Tailwind chưa chuẩn (cảnh báo IntelliSense) | `npm run lint:tw` / `npm run lint:tw:fix` |
| Chạy giống CI trước khi push | `npm run build && cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` |

## CI và phát hành (GitHub Actions)

Repo: `git@github-letruc:letrucdev/cleaner-max.git` (alias SSH `github-letruc` trong `~/.ssh/config`).

- `.github/workflows/ci.yml` chạy khi push lên `main` và khi mở PR, trên `windows-latest`. Các bước: `npm ci`, `npm run build`, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`. Clippy có warning là CI đỏ.
- `.github/workflows/release.yml` chạy khi push tag `v*`. Nó build NSIS + MSI bằng `tauri-action` rồi tạo **Release nháp**. Người dùng tự xem lại và bấm Publish.
- Các bước phát hành:
  1. Nâng version ở **cả ba nơi**: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. Nếu tag không khớp cả ba, workflow sẽ dừng.
  2. Commit, rồi `git tag v0.2.0 && git push origin main --tags`.
- Bộ cài **chưa ký số**, và app chưa có updater. Muốn thêm thì xem `tauri-plugin-updater` và secret `TAURI_SIGNING_PRIVATE_KEY`.
- Action được pin theo SHA, kèm comment ghi phiên bản. Dependabot mở PR cập nhật hằng tháng. Trước khi sửa workflow, đọc skill `github-actions-hardening` và `gha-security-review`.
- Commit theo Conventional Commits (`feat:`, `fix:`, `ci:`, `docs:`, `chore:`), xem skill `conventional-commits`.

## Skills đã cài

Skill nằm ở `.claude/skills`, phiên bản khóa trong `skills-lock.json`. Khôi phục bằng `npx -y skills experimental_install`. Muốn thêm skill thì làm theo quy tắc 5.

| Việc | Skill |
|---|---|
| UI, component, design | shadcn, frontend-design, apple-design, emil-design-eng, web-design-guidelines |
| Animation | review-animations, apple-design |
| React | vercel-react-best-practices |
| Tauri, Rust | tauri-v2, rust-best-practices |
| Test | rust-testing, vitest (khi thêm test frontend), playwright-best-practices (E2E qua UI mock ở :1420), windows-desktop-e2e (E2E app thật), tdd |
| Debug | systematic-debugging |
| Git, review | conventional-commits, code-review, git-guardrails-claude-code (dùng để cài hook chặn lệnh git nguy hiểm) |
| CI, phát hành | github-actions-templates, github-actions-hardening, gha-security-review, release-skills |
| Bảo mật | security-review (logic xóa file, UAC, sinh script chạy dưới quyền Admin) |
| PowerShell | powershell-windows, powershell-master (script Admin do app sinh ra, `scripts/*.ps1`) |

## Bài học từ lần dọn tay (cần đưa vào logic)

- pnpm: chỉ chạy `pnpm store prune`, không xóa store, vì store dùng hardlink chung với dự án đang làm. Corepack có thể tải bản pnpm hỏng, nên gọi đúng phiên bản trong `packageManager`.
- `Clear-RecycleBin` báo lỗi giả trên một số máy. Dùng `SHEmptyRecycleBinW` qua crate `windows`.
- Chrome đang mở thì bỏ qua `OptGuideOnDeviceModel`. Không tìm thấy lệnh `docker` thì báo "Mở Docker Desktop".
- Xóa trong WSL **không** trả dung lượng cho ổ C: nếu `ext4.vhdx` chưa ở chế độ sparse hoặc chưa được nén.
