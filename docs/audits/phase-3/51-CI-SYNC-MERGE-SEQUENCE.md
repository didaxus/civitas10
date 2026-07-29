# CI synchronization merge sequence

1. Merge the CI alignment PR into `main` after all new independent checks are green.
2. Rebase or merge the updated `main` into PR #252.
3. Re-run PR #252 on its new head SHA.
4. Classify any remaining failures as Data Scope v2 or Logto contract failures, not shared CI bootstrap failures.
5. Regenerate same-SHA evidence only after the final #252 head is stable.
