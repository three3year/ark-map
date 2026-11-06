# claude_rea_arknight

## Agent skills

### Issue tracker

Issues 以本機 markdown 檔案存放在 `.scratch/<feature-slug>/`,每個 feature 一個目錄,spec 在 `spec.md`,tickets 在 `issues/NN-<slug>.md`。See `docs/agents/issue-tracker.md`.

### Triage labels

使用預設的五個角色標籤:`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`;在 issue 檔案頂部以 `Status:` 行記錄。See `docs/agents/triage-labels.md`.

### Domain docs

單一 context:根目錄一個 `GLOSSARY.md`,ADR 放 `docs/adr/`。See `docs/agents/domain.md`.
