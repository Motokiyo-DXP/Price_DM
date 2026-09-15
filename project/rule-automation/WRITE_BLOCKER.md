# GitHub Write Blocker

Observed: 2026-09-16

GitHub read access works.

Attempt to create a feature branch returned:

```text
HTTP 403
Resource not accessible by integration
```

Repository rules already require feature branches and Pull Requests, so do **not** bypass this by writing directly to `main`.

Safe workaround:
use the locally authenticated Codex/Git workflow to create the branch, commit these docs, push, and open a PR.
