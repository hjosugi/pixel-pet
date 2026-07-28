<!-- i18n: language-switcher -->
[English](UPDATER.md) | [日本語](UPDATER.ja.md)

# アップデーター

Pixel PetはTauri v2アップデータープラグインを使用しています。アップデートはペット設定パネルの`upd`ボタンからオプトインできます。

## セキュリティモデル

Tauriアップデーターパッケージは署名されている必要があります。公開鍵は`src-tauri/tauri.conf.json`にコミットされており、秘密鍵はgitから除外する必要があります。

現在のローカル秘密鍵のパスは次のとおりです：

```bash
.tauri/updater.key
```

この鍵を失うと、すでにインストールされているアプリは将来のアップデートを信頼できなくなります。ユーザーに配布する前に、パスワードマネージャーや秘密ストアにバックアップしてください。

GitHub Actionsビルドでは、リポジトリのシークレットとして鍵の内容を保存します：

```txt
TAURI_SIGNING_PRIVATE_KEY
```

後でパスワード保護された鍵を使用する場合は、次も設定してください：

```txt
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

## 署名されたアップデートアーティファクトのビルド

ローカルLinux/macOS：

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH=.tauri/updater.key
npm run tauri:build
```

GitHub Actionsはリポジトリシークレットから`TAURI_SIGNING_PRIVATE_KEY`を使用します。

`bundle.createUpdaterArtifacts`が有効になっている場合、Tauriは通常のバンドルの隣にアップデータアーティファクトと`.sig`ファイルを生成します。

## 公開マニフェスト

アプリは次をチェックします：

```txt
https://github.com/hjosugi/pixel-pet/releases/latest/download/latest.json
```

アップロードされたアップデータアーティファクトと署名から`latest.json`を作成します：

```bash
npm run updater:manifest -- \
  --version 0.2.1 \
  --out latest.json \
  --notes "Pixel Pet 0.2.1" \
  --platform linux-x86_64=https://github.com/hjosugi/pixel-pet/releases/download/v0.2.1/Pixel.Pet.AppImage.tar.gz,path/to/Pixel.Pet.AppImage.tar.gz.sig
```

GitHubリリースに添付する各ターゲットについて`--platform`を繰り返します。`latest.json`を同じリリースにアップロードします。`latest`リリースは最新の安定版を指す必要があるため、エンドポイントが正しく解決されます。

## 実行時の動作

- ブラウザプレビューは`desktop only`を表示します。
- デスクトップは要求に応じて設定されたエンドポイントをチェックします。
- アップデートが利用可能な場合、ユーザーはダウンロード/インストールの前に確認します。
- インストール後、アプリはTauriプロセスプラグインを通じて再起動します。