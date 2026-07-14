/**
 * N.style お問い合わせフォーム用 Google Apps Script
 *
 * 【重要】訪問者にGoogleログインを求めないため、デプロイ設定は必ず次のとおりにしてください。
 * - 種類: ウェブアプリ
 * - 実行するユーザー: 自分（スクリプトの所有者）
 * - アクセスできるユーザー: 全員
 *
 * このスクリプトは「スプレッドシートに紐づいた Apps Script」として使います。
 * スプレッドシートIDや秘密情報をフロントエンドに書かないでください。
 */

var SHEET_NAME = 'お問い合わせ';
var HEADERS = [
  '送信日時',
  'お名前',
  'メールアドレス',
  '電話番号',
  'お問い合わせ内容'
];

// 簡易レート制限（同一メールの連続送信をブロック）
var RATE_LIMIT_SECONDS = 60;

function doPost(e) {
  try {
    var data = parseRequest_(e);
    var validation = validatePayload_(data);
    if (!validation.ok) {
      return jsonResponse_({ status: 'error', message: validation.message });
    }

    if (isDuplicateRecent_(data.email)) {
      return jsonResponse_({
        status: 'error',
        message: '短時間に同じ内容が送信されています。しばらくしてから再度お試しください。'
      });
    }

    var sheet = getOrCreateSheet_();
    var inquiryText = buildInquiryText_(data);

    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      data.name,
      data.email,
      data.phone,
      inquiryText
    ]);

    return jsonResponse_({
      status: 'success',
      message: 'お問い合わせを受け付けました。'
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'サーバーでエラーが発生しました。時間をおいて再度お試しください。'
    });
  }
}

/** 動作確認用（ブラウザでURLを開くとJSONが返ります） */
function doGet() {
  return jsonResponse_({
    status: 'ok',
    message: 'N.style contact form endpoint is running'
  });
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('empty body');
  }
  var raw = JSON.parse(e.postData.contents);
  return {
    name: normalizeText_(raw.name),
    email: normalizeText_(raw.email).toLowerCase(),
    phone: normalizeText_(raw.phone),
    grade: normalizeText_(raw.grade),
    concern: normalizeText_(raw.concern),
    message: normalizeText_(raw.message),
    privacy: !!raw.privacy,
    honeypot: normalizeText_(raw.website || raw.honeypot),
    elapsedMs: Number(raw.elapsedMs || 0)
  };
}

function validatePayload_(data) {
  // ボット対策: ハニーポットが埋まっていたら拒否（成功風の応答にして学習されにくくする）
  if (data.honeypot) {
    return { ok: false, message: '送信に失敗しました。' };
  }

  // ボット対策: フォーム表示から3秒未満の送信を拒否
  if (!data.elapsedMs || data.elapsedMs < 3000) {
    return { ok: false, message: '送信に失敗しました。ページを再読み込みしてから再度お試しください。' };
  }

  if (!data.privacy) {
    return { ok: false, message: 'プライバシーポリシーへの同意が必要です。' };
  }

  if (!data.name || data.name.length < 1 || data.name.length > 80) {
    return { ok: false, message: 'お名前を正しく入力してください。' };
  }

  if (!isValidEmail_(data.email) || data.email.length > 254) {
    return { ok: false, message: 'メールアドレスの形式が正しくありません。' };
  }

  if (!isValidPhone_(data.phone)) {
    return { ok: false, message: '電話番号の形式が正しくありません。' };
  }

  if (!data.grade || data.grade.length > 40) {
    return { ok: false, message: 'お子さんの学年を選択してください。' };
  }

  if (data.message && data.message.length > 2000) {
    return { ok: false, message: 'メッセージが長すぎます（2000文字以内）。' };
  }

  if (data.concern && data.concern.length > 200) {
    return { ok: false, message: 'お悩みの内容が不正です。' };
  }

  // 簡易スパム: メッセージ内の不審なURL過多
  var urlCount = (data.message.match(/https?:\/\//gi) || []).length;
  if (urlCount >= 3) {
    return { ok: false, message: '送信内容を確認できませんでした。' };
  }

  return { ok: true };
}

function buildInquiryText_(data) {
  var lines = [];
  lines.push('【学年】' + data.grade);
  if (data.concern) {
    lines.push('【お悩み】' + data.concern);
  }
  if (data.message) {
    lines.push('【ご質問・ご相談】' + data.message);
  } else {
    lines.push('【ご質問・ご相談】（なし）');
  }
  return lines.join('\n');
}

function isDuplicateRecent_(email) {
  var sheet = getOrCreateSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var startRow = Math.max(2, lastRow - 30);
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 3).getValues();
  var now = new Date().getTime();

  for (var i = values.length - 1; i >= 0; i--) {
    var rowEmail = String(values[i][2] || '').toLowerCase();
    if (rowEmail !== email) continue;

    var ts = values[i][0];
    var rowTime = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
    if (!isNaN(rowTime) && (now - rowTime) < RATE_LIMIT_SECONDS * 1000) {
      return true;
    }
  }
  return false;
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('bound spreadsheet not found');
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 140);
    sheet.setColumnWidth(3, 220);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 420);
  }

  return sheet;
}

function normalizeText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone_(phone) {
  var digits = phone.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
