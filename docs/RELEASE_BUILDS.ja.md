<!-- i18n: language-switcher -->
[English](RELEASE_BUILDS.md) | [日本語](RELEASE_BUILDS.ja.md)

# リリースビルド

Pixel Petはまだローカルプロトタイプのため、リリースビルドはデフォルトで署名されていません。リリースワークフローは、インストーラー出力をコミットする代わりに、生成されたバンドルをGitHub Actionsアーティファクトとしてアップロードします。Tauriアップデーター署名キーがビルド環境で利用可能な場合、アップデーターアーティファクトが生成されます。

## ローカルの前提条件

すべてのプラットフォーム:

```txt
Node.js 24
Rust stable
package-lock.jsonからのnpm依存関係
ターゲットOSのTauri v2システム前提条件
```

LinuxはさらにWebKitGTKとtray/appindicatorパッケージが必要です。Ubuntuの場合:

```bash
sudo apt-get update
sudo apt-get install -y \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libwebkit2gtk-4.1-dev \
  patchelf
```

ローカルでビルド:

```bash
npm ci
npm run assets:check
npm run tauri:build
```

CIスタイルの署名なしプロトタイプバンドルの場合:

```bash
npm run tauri -- build --ci --no-sign
```

## GitHubリリースワークフロー

`.github/workflows/release.yml`は`v*`に一致するタグと手動ディスパッチで実行されます。ビルドは以下で行われます:

```txt
ubuntu-latest
macos-latest
windows-latest
```

アーティファクトは以下からアップロードされます:

```txt
src-tauri/target/release/bundle/**/*
```

`src-tauri/target`はgitによって無視されるため、生成されたインストーラーやアプリバンドルはソース管理から除外されます。

## アップデーターアーティファクト

アプリは最新のGitHubリリースを`latest.json`で確認します。署名キー、アップデーターアーティファクト、およびマニフェストの公開フローについては`docs/UPDATER.md`を参照してください。

GitHub Actionsは署名されたアップデーターアーティファクトを生成するために、このリポジトリのシークレットが必要です:

```txt
TAURI_SIGNING_PRIVATE_KEY
```

キーにパスワードがある場合は、次も設定してください:

```txt
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

## プラットフォームの注意点

Windows:

- 現在、ビルドは署名されていません。
- Authenticode署名が設定されるまで、SmartScreenの警告が予想されます。
- WebView2ランタイムの可用性は、公開リリース前に配布の決定が必要です。

macOS:

- このプロトタイプは透明なウィンドウのために`macOSPrivateApi`を使用しています。
- 署名されていない`.app`または`.dmg`出力はGatekeeperによってブロックされる可能性があります。
- App Store配布は現在の透明性アプローチと互換性がありません。
- ノータリゼーションとハードンランタイムは意図的に延期されています。

Linux:

- バンドル出力はビルドイメージ内のホストパッケージに依存します。
- AppImage/deb/rpmの動作は公開前に実際のデスクトップでテストする必要があります。
- トレイの動作はデスクトップ環境によって異なります。

## 署名パス

後の製品リリースでは以下を追加する必要があります:

```txt
Windows: AuthenticodeまたはAzure Trusted Signing
macOS: Developer ID署名、ハードンランタイム、ノータリゼーション、スタプリング
Linux: アップロードされたアーティファクトのチェックサム/署名ファイル
```

署名キー、証明書、APIトークン、およびノータリゼーションの資格情報は、GitHub Actionsのシークレットまたはローカル開発者キーチェーンに保存する必要があります。コミットしてはいけません。