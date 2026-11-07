# Phiên 05 — Git, GitHub Actions, thêm skill (07/11/2026)

## Mục tiêu phiên
Đưa code lên GitHub, tự động build và tạo Release, bổ sung skill từ skills.sh, và thêm quy tắc tìm skill vào CLAUDE.md.

## Quyết định của người dùng
| Câu hỏi | Chọn |
|---|---|
| Khi nào tạo Release | Push tag `v*` thì tạo **Release nháp**, người dùng tự Publish |
| Ký số / auto-update | Chưa ký, chưa có updater |
| Tìm skill cho mảng nào | CI/GitHub Actions, Testing, Git & review, Bảo mật/Windows |
| Quy tắc cho agent | Tìm trên skills.sh, **đề xuất rồi hỏi**, chỉ cài khi được đồng ý |

## Đã làm

### Git
- Commit đầu tiên trên `main`. Remote `origin` = `git@github-letruc:letrucdev/cleaner-max.git`, alias SSH `github-letruc` dùng khóa `id_ed25519_neondev`.

### GitHub Actions
| File | Kích hoạt | Việc |
|---|---|---|
| `.github/workflows/ci.yml` | push `main`, PR | `npm ci` → `npm run build` → `cargo fmt --check` → `cargo clippy --all-targets -D warnings` → `cargo test` (windows-latest) |
| `.github/workflows/release.yml` | push tag `v*` | Kiểm tra tag khớp version ở 3 file → `tauri-action` build NSIS + MSI → Release nháp kèm release notes tự sinh và hướng dẫn vượt SmartScreen |
| `.github/dependabot.yml` | hằng tháng | Cập nhật các action đã pin |

- Làm cứng theo skill `github-actions-hardening`: pin action theo SHA, `permissions: contents: read` mặc định (chỉ job release có `contents: write`), `persist-credentials: false`, tag đi qua biến `env` chứ không nội suy `${{ }}` trực tiếp vào script.
- Phiên bản đã pin: checkout v7.0.1, setup-node v7.1.0, rust-cache v2.9.3, tauri-action v1.0.0, rust-toolchain (master, `toolchain: stable`). Node 24.

### Skill mới (16, từ skills.sh, cài kiểu copy vào `.claude/skills`)
| Mảng | Skill (nguồn) |
|---|---|
| CI / phát hành | github-actions-templates (wshobson/agents), gha-security-review (getsentry/skills), github-actions-hardening (github/awesome-copilot), release-skills (jimliu/baoyu-skills) |
| Test | rust-testing (affaan-m/ecc), vitest (antfu/skills), tdd (mattpocock/skills), playwright-best-practices (currents-dev) |
| Git / review / debug | code-review, git-guardrails-claude-code (mattpocock/skills), conventional-commits (patricio0312rev/skills), systematic-debugging (obra/superpowers) |
| Bảo mật / Windows | security-review (getsentry/skills), powershell-master (josiahsiegel), powershell-windows (vudovn/ag-kit), windows-desktop-e2e (affaan-m/ecc) |

- Đã đọc các script đi kèm: `git-guardrails-claude-code/scripts/block-dangerous-git.sh` (hook chặn lệnh git, **chưa bật**) và `systematic-debugging/find-polluter.sh`. Không có gì bất thường.
- `skills-lock.json` hiện có 25 skill.

### CLAUDE.md
- Quy tắc 5: dùng skill có sẵn trước; nếu thiếu thì tìm bằng `npx -y skills find`, đề xuất 2–4 ứng viên, hỏi người dùng rồi mới cài; sau khi cài thì rà script và cập nhật bảng.
- Mục mới **CI và phát hành**: các bước ra bản mới, lệnh chạy giống CI ở máy.
- Bảng skill sắp xếp theo việc.

## Kiểm tra
Đã chạy trên máy đúng chuỗi lệnh của CI, tất cả đều qua:
- `cargo fmt --check`: không có gì cần sửa.
- `cargo clippy --all-targets -- -D warnings`: không có warning.
- `cargo test`: 32 qua, 1 bỏ qua (smoke test).
- `npm run build`: thành công.

Workflow release chưa chạy thật, vì chưa push tag nào.

## Việc tiếp theo
- Push tag `v0.1.0` để thử workflow release, rồi xem bản nháp trên GitHub.
- Tùy chọn: bật hook `git-guardrails-claude-code`, thêm Vitest/Playwright cho frontend, thêm `tauri-plugin-updater` cùng khóa ký.
- Vẫn còn từ phiên 4: người dùng chạy thật các tác vụ Admin.
