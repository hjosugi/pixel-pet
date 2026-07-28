<!-- i18n: language-switcher -->
[English](ACTIVITY_HOOKS.md) | [日本語](ACTIVITY_HOOKS.ja.md)

# アクティビティフック

ペットはアクティビティレイヤーを通じて実際の作業に反応できます。ホストプロセスは何が起こっているかを報告し、ペットは短い反応を再生します（`README.md`の「アクティビティイベント」セクションを参照）。トランスポートは2つあります：

1. ウェブビュー内：`pixel-pet:activity` `CustomEvent`をディスパッチします（ブラウザプレビューまたは埋め込みホスト）。
2. デスクトップファイル受信ボックス：ローカルファイルにアクティビティオブジェクトを追加し、実行中のアプリが低頻度でポーリングして排出します。これが、Claude Codeのような外部ツールがペットに情報を提供する方法です。

## デスクトップ受信ボックス

デスクトップアプリは、アプリデータディレクトリ内の`activity-inbox.jsonl`を読み取り、クリアします：

- macOS: `~/Library/Application Support/dev.local.pixel-pet/activity-inbox.jsonl`
- Windows: `%APPDATA%\dev.local.pixel-pet\activity-inbox.jsonl`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/dev.local.pixel-pet/activity-inbox.jsonl`

各行は1つのJSONオブジェクトです：

```json
{ "kind": "done", "source": "claude-code", "label": "build" }
```

`kind`は`start`、`working`、`waiting`、`done`、`error`のいずれかです。排出は最善の努力であり、ローカル専用です：ファイルは読み取り後に削除され、形式が不正な行はスキップされ、最新のイベントのみが適用されます。

## Claude Codeフック

`tools/claude-code-activity-hook.mjs`は受信ボックスにイベントを追加します。標準入力からClaude Codeの`hook_event_name`を読み取り、それを種類にマッピングするか、明示的に`--kind <kind>`を取ります。ホストを失敗させることは決してありません — いかなるエラーも0で終了します。

イベントマッピング：

| Claude Codeイベント   | アクティビティの種類 |
| --------------------- | ------------------- |
| `SessionStart`        | `start`             |
| `UserPromptSubmit`    | `working`           |
| `PreToolUse`          | `working`           |
| `Notification`        | `waiting`           |
| `Stop`                | `done`              |
| `SubagentStop`        | `done`              |

スクリプトへの絶対パスを使用して、Claude Codeの設定に登録します：

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "PreToolUse":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }]
  }
}
```

配線をテストするために、手動でペットを操作することもできます：

```bash
node tools/claude-code-activity-hook.mjs --kind done --label "manual test"
```

## 別のソースを追加する

ソースはエージェントに依存しません。1つを追加するには（git、エディタ、別のエージェント）、`{ kind, source, label }`行で受信ボックスファイルに追加するか、`src/pet/activitySource.ts`に`ActivitySource`を追加し、`main.ts`で登録します。ペットは常に正規化された`ActivityEvent`のみを認識するため、新しいソースはペット自体に変更を必要としません。