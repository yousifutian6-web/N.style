/**
 * 送信先設定（HTMLには平文URLを書きません）
 * GitHub Pages のブランチ公開でも必ず配信されるよう、このファイルをコミットします。
 */
window.NSTYLE_CONFIG = {
  gasEndpoint: (function () {
    var encoded =
      'aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J3amZORDQ3cFNZTUVoWW04cjk5QUJtU21RUVhEUzRFQnItMHM0bzBpTFozbWZFc053SC1WZlFwZEVkcjZkdExVUmwvZXhlYw==';
    try {
      return atob(encoded);
    } catch (e) {
      return '';
    }
  })()
};
