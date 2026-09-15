# Muse Cards

AI 카드뉴스 제작 서비스. `gpt-image-2`로 글자 없는 일러스트를 만들고, 브라우저에서 한글을 정확하게 합성합니다.

## 설정

1. `.env.example`을 `.env.local`로 복사하고 OpenAI 및 Supabase 값을 입력합니다. API 키는 서버 환경 변수로만 설정합니다.
2. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다. 개인별 RLS 정책과 비공개 이미지 버킷이 생성됩니다.
3. Supabase Authentication에서 이메일 OTP와 사이트 주소의 Redirect URL을 확인합니다.
4. `pnpm install` 후 `pnpm dev`를 실행합니다.

로그인 후 주제와 페르소나를 입력하면 한국어 카드 기획을 만들고, 선택한 캐릭터 이미지가 있으면 먼저 캐릭터 시트를 생성합니다. 카드 이미지는 모두 `gpt-image-2`로 생성하며 글자는 이미지에 직접 만들지 않습니다. 브라우저에서 한글을 합성한 카드별 PNG를 내려받고, 수정 결과와 이미지를 개인 기록에 저장합니다.

캐릭터 사진은 OpenAI로 전송되어 캐릭터 시트와 카드 이미지의 일관성 있는 참조로만 사용됩니다.
