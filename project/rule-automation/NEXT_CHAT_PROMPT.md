デュエマのルール自動化プロジェクトの続きです。

GitHub `Motokiyo-DXP/Price_DM` の `project/rule-automation/` をSource of Truthとして読み、まず現在のmainと以下の引き継ぎ資料を確認してください。

- HANDOFF.md
- PROJECT_STATE.md
- CURRENT_TASK.md
- IMPLEMENTATION_PLAN_V10.md
- HUMAN_ROADMAP.md
- CONVENIENCE_FEATURE_RESEARCH_BRIEF.md
- CAPABILITY_MATRIX.md
- REPO_MAP.md
- CURRENT_ARCHITECTURE.md

今回の最優先タスクは `CONVENIENCE_FEATURE_DEEP_DIVE` です。

まだ実装には進まず、まず現在サイトに存在する便利機能・マーカー・ポップアップ・操作補助・ジェスチャー・通知・Undo・オンライン補助などをGitHubから可能な限り網羅的に棚卸ししてください。

その後、既存機能の再利用を前提として、新しい便利機能候補を幅広く検討してください。

特に、
- 操作回数削減
- ミス防止
- Rule説明
- 選択支援
- Active Effect表示
- 処理待ち / Pending表示
- マナ支払い
- 攻撃 / ブロック支援
- 履歴
- オンラインでの待機状態
- スマホ操作
- PC操作
- 初心者支援
- 上級者向けショートカット
- MANUAL / ASSIST / AUTOそれぞれでの価値

を深掘りしてください。

便利機能を単なる思いつきリストにせず、
既存実装の有無、Rule Engine依存、Decision依存、Presentation依存、優先度、実装コストまで整理してください。

この検討が終わるまでは、Decision Systemや複雑なルール処理の新規実装には進まないでください。
