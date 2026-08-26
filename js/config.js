/* Supabase 연결 설정.
 *
 * 비워 두면 데모 모드(localStorage)로 돕니다. 그대로 두어도 사이트는 동작합니다.
 * 붙이는 방법은 SUPABASE-설정.md 를 보세요.
 *
 * ⚠ 여기에는 **anon 키만** 넣습니다. anon 키는 브라우저에 그대로 실리는
 *   공개 값이고, 실제 방어는 RLS 가 합니다(supabase/schema.sql).
 * ⚠ **service_role 키는 절대 여기에 넣지 마세요.** 그 키는 RLS 를 통째로
 *   우회하므로, 사이트에 실리는 순간 누구나 전 사양서를 지울 수 있습니다.
 */
(function (root) {
  root.SUPABASE_CONFIG = {
    url: '',      // 예: https://xxxxxxxx.supabase.co
    anonKey: ''   // 예: eyJhbGciOi...
  };
}(typeof self !== 'undefined' ? self : this));
