// 브라우저에 그대로 공개되는 값만 둡니다 (규칙 R8).
// service_role(비밀) 키는 절대 여기에 넣지 마세요. 이 앱은 쓰지 않습니다.
// 값은 docs/supabase-setup.md 5번에서 확인한 Project URL과 Publishable(anon) 키예요.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-PUBLISHABLE-KEY",
};
