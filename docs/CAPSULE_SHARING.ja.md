<!-- i18n: language-switcher -->
[English](CAPSULE_SHARING.md) | [日本語](CAPSULE_SHARING.ja.md)

# カプセル共有

Pixel-petの交換はローカルファーストです。カプセルは、ユーザーがエクスポート、送信、スキャン、またはインポートすることを選択するJSONファイルです。このリポジトリにはマーケットプレイスの信頼モデルはありません。

## QRデザイン

QR共有は、別のスキーマではなく、同じカプセルスキーマの輸送手段であるべきです。

小さなカプセルは直接エンコードできます：

```txt
pixel-pet-capsule:v1:<base64url-json>
```

大きなカプセルは、ユーザーが作成したローカル共有リンクを使用する必要があります：

```txt
pixel-pet-capsule-link:v1:<https-url-or-file-token>
```

QRペイロードルール：

- エンコードされたペイロードが実用的なスキャナーの制限内に収まる場合のみ、直接QRを優先してください。
- 所有者のメモは短く保ってください。
- APIキー、チャット履歴、ローカルファイルパス、またはマシン固有の状態を含めないでください。
- インポートは、ファイルインポートで使用されるのと同じJSON検証パスを実行する必要があります。

## 署名フィールド

JSONスキーマは、現在このフィールドを予約しています：

```json
{
  "signature": {
    "status": "unsigned",
    "algorithm": null,
    "publicKeyId": null,
    "value": null,
    "signedFields": ["schema", "schemaVersion", "compatibility", "exportedAt", "pet"]
  }
}
```

将来の署名付きカプセルは次のように設定する必要があります：

```json
{
  "status": "signed",
  "algorithm": "ed25519",
  "publicKeyId": "owner-key-id",
  "value": "base64url-signature"
}
```

署名は`signedFields`の標準JSONをカバーします。インポートは、署名検証が存在し、署名がこれらのフィールドと一致しない場合、カプセルを改ざんされたものとして拒否しなければなりません。

## 信頼状態

現在のインポート状態：

```txt
unsigned           valid schema, no signature
unverified-signed  signature fields present, verification not implemented yet
invalid            malformed, unknown pack, unsupported schema, bad progression
```

アプリは、スキーマ検証の後にのみ、署名されていないカプセルと未検証の署名付きカプセルをインポートできます。どちらも信頼されたものとして表示してはいけません。将来の信頼状態は、ユーザー承認済みの公開鍵に対するEd25519の検証が成功することを要求する必要があります。