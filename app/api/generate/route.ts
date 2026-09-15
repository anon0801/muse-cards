import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 300;
const sizes = { portrait: "1024x1536", square: "1024x1024", landscape: "1536x1024" } as const;
type Format = keyof typeof sizes;

function referenceFile(value: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("PNG, JPG 또는 WEBP 이미지를 업로드해 주세요.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 3 * 1024 * 1024) throw new Error("캐릭터 이미지는 3MB 이하로 업로드해 주세요.");
  return new File([bytes], `reference.${match[1].split("/")[1]}`, { type: match[1] });
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI API 키가 아직 설정되지 않았습니다." }, { status: 503 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ error: "Supabase 연결이 아직 설정되지 않았습니다." }, { status: 503 });
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return NextResponse.json({ error: "로그인 후 생성할 수 있습니다." }, { status: 401 });
    const storageClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await storageClient.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "로그인이 만료되었습니다. 다시 로그인해 주세요." }, { status: 401 });
    const userId = user.id;
    const input = await req.json();
    const action = String(input.action || "");
    const persona = String(input.persona || "").trim().slice(0, 1200);
    const topic = String(input.topic || "").trim().slice(0, 500);
    const count = Math.min(10, Math.max(2, Number(input.count) || 5));
    const format: Format = input.format in sizes ? input.format : "portrait";
    if (!persona || !topic) return NextResponse.json({ error: "브랜드 페르소나와 주제를 입력해 주세요." }, { status: 400 });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    async function storeImage(b64: string) {
      const path = `${userId}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await storageClient.storage.from("card-assets").upload(path, Buffer.from(b64, "base64"), { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data, error: signError } = await storageClient.storage.from("card-assets").createSignedUrl(path, 60 * 60 * 24);
      if (signError) throw signError;
      return { image: data.signedUrl, imagePath: path };
    }
    async function sheetFile(path: string) {
      if (!path.startsWith(`${userId}/`)) throw new Error("본인의 캐릭터 시트만 사용할 수 있습니다.");
      const { data, error: downloadError } = await storageClient.storage.from("card-assets").download(path);
      if (downloadError || !data) throw downloadError || new Error("캐릭터 시트를 읽지 못했습니다.");
      return new File([await data.arrayBuffer()], "character-sheet.png", { type: "image/png" });
    }

    if (action === "plan") {
      const plan = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "한국어 카드뉴스 편집자입니다. 브랜드 말투를 일관되게 유지하고, 검증되지 않은 숫자나 사실을 단정하지 마세요. JSON만 반환하세요." },
          { role: "user", content: `페르소나: ${persona}\n주제: ${topic}\n정확히 ${count}장. 각 장에 짧은 한국어 제목, 1~2문장 본문, 글자가 없는 장면의 영어 이미지 연출 설명을 써 주세요. 첫 장은 강한 표지, 마지막 장은 마무리로 구성하세요.` }
        ],
        response_format: { type: "json_schema", json_schema: { name: "card_plan", strict: true, schema: { type: "object", properties: { cards: { type: "array", items: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, visual: { type: "string" } }, required: ["title", "body", "visual"], additionalProperties: false } } }, required: ["cards"], additionalProperties: false } } }
      });
      const cards = JSON.parse(plan.choices[0]?.message?.content || "{}")?.cards;
      if (!Array.isArray(cards) || cards.length !== count) throw new Error("카드 구성이 완성되지 않았습니다. 다시 시도해 주세요.");
      return NextResponse.json({ cards: cards.map((card: { title: string; body: string; visual: string }) => ({ id: crypto.randomUUID(), title: card.title, body: card.body, visual: card.visual, image: "", design: { accent: "#d9ff66", align: "left", overlay: 0.24, layout: "bottom" } })) });
    }

    if (action === "sheet") {
      if (!input.referenceImage) return NextResponse.json({ error: "캐릭터 이미지를 업로드해 주세요." }, { status: 400 });
      const sheet = await openai.images.edit({ model: "gpt-image-2", image: referenceFile(input.referenceImage), size: "1024x1024", prompt: `Create a single clean CHARACTER REFERENCE SHEET from the uploaded person or character. Preserve their exact recognizable facial identity, hair, distinctive marks and body proportions. Establish ONE consistent outfit and ONE illustration medium fitting this brand: ${persona}. Show front full body, three-quarter full body, and facial close-up. Keep the same outfit in every view. Plain neutral studio background. No words, letters, numbers, labels, logos, or watermark.` });
      const b64 = sheet.data?.[0]?.b64_json;
      if (!b64) throw new Error("캐릭터 시트 이미지가 반환되지 않았습니다.");
      return NextResponse.json(await storeImage(b64));
    }

    if (action === "image") {
      const card = input.card;
      if (!card || typeof card.visual !== "string") return NextResponse.json({ error: "카드 장면이 없습니다." }, { status: 400 });
      const hasCharacter = Boolean(input.characterSheetPath);
      const prompt = `Create ONE premium, text-free editorial card-news image. Topic: ${topic}. Brand persona: ${persona}. Scene: ${String(card.visual).slice(0, 1500)}. ${hasCharacter ? "The uploaded image is the MASTER CHARACTER SHEET. Include this exact same character, recognizable face, hair, outfit, colors, body proportions and illustration medium. Do not redesign or change their clothes. Treat the sheet as authoritative for identity and style." : "Maintain a coherent editorial art direction with the brand persona."} Compose for a ${format} social media slide. Keep useful negative space for a Korean headline and body that will be added separately in the browser. Absolutely no text, glyphs, letters, numbers, Korean, signage, logos, or watermarks anywhere in the image.`;
      const image = hasCharacter
        ? await openai.images.edit({ model: "gpt-image-2", image: await sheetFile(String(input.characterSheetPath)), size: sizes[format], prompt })
        : await openai.images.generate({ model: "gpt-image-2", size: sizes[format], output_format: "png", prompt });
      const b64 = image.data?.[0]?.b64_json;
      if (!b64) throw new Error("카드 이미지가 반환되지 않았습니다.");
      return NextResponse.json(await storeImage(b64));
    }
    return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    console.error("generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
