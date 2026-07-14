/**
 * N.style お問い合わせフォーム用 Google Apps Script
 *
 * 【重要】デプロイ設定
 * - 種類: ウェブアプリ
 * - 実行するユーザー: 自分
 * - アクセスできるユーザー: 全員
 * - コード変更後は必ず「新しいデプロイ」または「デプロイを管理→編集→新バージョン」
 *
 * 【スプレッドシートの指定（推奨）】
 * 1. 書き込みたいシートを開く
 * 2. URLの /d/ と /edit の間が ID
 *    例: https://docs.google.com/spreadsheets/d/ここがID/edit
 * 3. Apps Script で setSpreadsheetId_() を1回実行（下記）
 */

var SHEET_NAME = 'お問い合わせ';
var HEADERS = [
  '送信日時',
  'お名前',
  'メールアドレス',
  '電話番号',
  'ご希望',
  'お問い合わせ内容'
];
var ALLOWED_SERVICES = {
  '無料面談を希望': true,
  '体験授業を希望': true,
  '無料面談と体験授業の両方': true,
  '料金・コースの確認': true,
  'まずは話を聞いてみたい': true,
  'その他': true
};
var RATE_LIMIT_SECONDS = 60;
var PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';

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

    var ss = getSpreadsheet_();
    var sheet = getOrCreateSheet_(ss);
    var inquiryText = buildInquiryText_(data);

    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      data.name,
      data.email,
      data.phone,
      data.service,
      inquiryText
    ]);
    SpreadsheetApp.flush();

    return jsonResponse_({
      status: 'success',
      message: 'お問い合わせを受け付けました。',
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      sheetName: sheet.getName(),
      savedRow: sheet.getLastRow()
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'サーバーでエラーが発生しました: ' + String(err && err.message ? err.message : err)
    });
  }
}

/**
 * ブラウザでWebアプリURLを開くと、接続先スプレッドシートが分かります。
 */
function doGet() {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET_NAME);
    return jsonResponse_({
      status: 'ok',
      message: 'N.style contact form endpoint is running',
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      spreadsheetId: ss.getId(),
      targetSheet: SHEET_NAME,
      targetSheetExists: !!sheet,
      targetSheetLastRow: sheet ? sheet.getLastRow() : 0,
      allSheets: ss.getSheets().map(function (s) { return s.getName(); })
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: String(err && err.message ? err.message : err)
    });
  }
}

/**
 * ★ 初回だけ手动実行してください
 * Apps Script画面で関数「setSpreadsheetId」を選んで実行。
 * 下の YOUR_SPREADSHEET_ID を実際のIDに書き換えてから実行。
 */
function setSpreadsheetId() {
  var id = 'YOUR_SPREADSHEET_ID'; // ← ここを書き換える
  if (!id || id === 'YOUR_SPREADSHEET_ID') {
    throw new Error('YOUR_SPREADSHEET_ID を実際のスプレッドシートIDに書き換えてください');
  }
  // IDが正しいか確認
  SpreadsheetApp.openById(id);
  PropertiesService.getScriptProperties().setProperty(PROP_SPREADSHEET_ID, id);
}

/** 設定確認用（Apps Scriptで実行） */
function showSpreadsheetSetting() {
  var ss = getSpreadsheet_();
  Logger.log('name: ' + ss.getName());
  Logger.log('url: ' + ss.getUrl());
  Logger.log('id: ' + ss.getId());
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (id) {
    return SpreadsheetApp.openById(id);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    return ss;
  }

  throw new Error(
    '書き込み先スプレッドシートが特定できません。' +
    'setSpreadsheetId を実行してシートIDを登録するか、' +
    'スプレッドシートから「拡張機能→Apps Script」で開いたプロジェクトを使ってください。'
  );
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
    service: normalizeText_(raw.service),
    concern: normalizeText_(raw.concern),
    message: normalizeText_(raw.message),
    privacy: !!raw.privacy,
    honeypot: normalizeText_(raw.website || raw.honeypot),
    elapsedMs: Number(raw.elapsedMs || 0)
  };
}

function validatePayload_(data) {
  if (data.honeypot) {
    return { ok: false, message: '送信に失敗しました。' };
  }

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

  if (!data.service || !ALLOWED_SERVICES[data.service]) {
    return { ok: false, message: 'ご希望の内容を選択してください。' };
  }

  if (data.message && data.message.length > 2000) {
    return { ok: false, message: 'メッセージが長すぎます（2000文字以内）。' };
  }

  if (data.concern && data.concern.length > 200) {
    return { ok: false, message: 'お悩みの内容が不正です。' };
  }

  var urlCount = (data.message.match(/https?:\/\//gi) || []).length;
  if (urlCount >= 3) {
    return { ok: false, message: '送信内容を確認できませんでした。' };
  }

  return { ok: true };
}

function buildInquiryText_(data) {
  var lines = [];
  lines.push('【ご希望】' + data.service);
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
  var ss = getSpreadsheet_();
  var sheet = getOrCreateSheet_(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var startRow = Math.max(2, lastRow - 30);
  var numRows = lastRow - startRow + 1;
  var values = sheet.getRange(startRow, 1, numRows, 3).getValues();
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

function getOrCreateSheet_(ss) {
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
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(6, 420);
    return sheet;
  }

  // 旧5列（E列=お問い合わせ内容）→ ご希望列を追加して6列構成へ移行
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var first = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colE = String(first[4] || '');
  var colF = String(first[5] || '');

  if (colE === 'お問い合わせ内容' && colF !== 'お問い合わせ内容') {
    sheet.insertColumnAfter(4);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(6, 420);
  } else if (String(first[0]) !== HEADERS[0] || colE !== HEADERS[4] || colF !== HEADERS[5]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(6, 420);
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
