# Muse Cards

AI 카드뉴스 제작 서비스. `gpt-image-2`로 글자 없는 일러스트를 만들고, 브라우저에서 한글을 정확하게 합성합니다.

## 설정

1. `.env.example`을 `.env.local`로 복사하고 OpenAI 및 Supabase 값을 입력합니다.
2. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다.
3. `npm install && npm run dev`

캐릭터 사진은 OpenAI로 전송되어 캐릭터 시트와 카드 이미지의 일관성 있는 참조로만 사용됩니다.
