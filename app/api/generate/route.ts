import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sizeMap: Record<string, "1024x1024"|"1024x1536"|"1536x1024"> = { square:"1024x1024", portrait:"1024x1536", landscape:"1536x1024" };
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({error:"OPENAI_API_KEY가 설정되지 않았습니다."},{status:503});
    const { persona, topic, count, format, referenceImage, makeCharacterSheet, card: requestedCard } = await req.json();
    if (requestedCard) {
      const prompt = `Create a premium editorial illustration for a Korean social media card about "${topic}". Brand voice: ${persona}. Scene: ${requestedCard.visual}. ${referenceImage ? "Use the supplied reference to keep exactly the same character face, hair, outfit and illustration style." : "Create a distinctive editorial illustration style."} Absolutely NO text, letters, Korean, typography, logos, or watermarks. Leave clean negative space for title overlay.`;
      const image = referenceImage ? await openai.images.edit({model:"gpt-image-2",image:new File([Buffer.from(referenceImage.split(",")[1],"base64")],"reference.png",{type:"image/png"}),size:sizeMap[format] || "1024x1536",output_format:"png",prompt}) : await openai.images.generate({model:"gpt-image-2",size:sizeMap[format] || "1024x1536",output_format:"png",prompt});
      return NextResponse.json({image:`data:image/png;base64,${image.data?.[0]?.b64_json}`});
    }
    const brief = `브랜드 페르소나: ${persona}\n주제: ${topic}\n${count}장의 한국어 카드뉴스를 기획해. 각 카드에 짧고 정확한 한국어 제목과 1~2문장 본문, 그리고 텍스트 없는 이미지 연출 설명을 제안해.`;
    const plan = await openai.chat.completions.create({
      model: "gpt-5-mini", messages: [{role:"system",content:"You are an exceptional Korean social media editor. Return only valid JSON."},{role:"user",content:brief}],
      response_format: { type:"json_schema", json_schema:{name:"card_plan",strict:true,schema:{type:"object",properties:{cards:{type:"array",items:{type:"object",properties:{title:{type:"string"},body:{type:"string"},visual:{type:"string"}},required:["title","body","visual"],additionalProperties:false}}},required:["cards"],additionalProperties:false}}}
    });
    const cards = JSON.parse(plan.choices[0].message.content || '{"cards":[]}').cards.slice(0, count);
    let characterSheet: string | undefined;
    if (referenceImage && makeCharacterSheet) {
      const bytes = Buffer.from(referenceImage.split(",")[1], "base64");
      const sheet = await openai.images.edit({ model:"gpt-image-2", image: new File([bytes],"reference.png",{type:"image/png"}), size:"1024x1024", output_format:"png", prompt:`Create a clean, text-free character sheet of the person or character in this reference. Preserve identity, face, hair and distinctive traits. Establish one consistent outfit and illustration style appropriate for this brand: ${persona}. Include full body front, 3/4 and expressive face views on a plain studio background. No words, letters, labels, logos, watermarks.` });
      characterSheet = `data:image/png;base64,${sheet.data?.[0]?.b64_json}`;
    }
    const reference = characterSheet || referenceImage;
    const completed = await Promise.all(cards.map(async (card: {title:string;body:string;visual:string}, index:number) => {
      const prompt = `Create a premium editorial illustration for slide ${index+1} of a Korean social media card series about "${topic}". Brand voice: ${persona}. Scene: ${card.visual}. ${reference ? "Use the supplied reference to keep the same person/character, identical face, hair, outfit and illustration style across every slide." : "Create a distinctive consistent editorial illustration style."} Absolutely NO text, no letters, no Korean, no typography, no logos, no watermarks. Leave clean negative space for a title overlay.`;
      const img = reference ? await openai.images.edit({model:"gpt-image-2", image:new File([Buffer.from(reference.split(",")[1],"base64")],"reference.png",{type:"image/png"}), size:sizeMap[format] || "1024x1536", output_format:"png", prompt}) : await openai.images.generate({model:"gpt-image-2",size:sizeMap[format] || "1024x1536",output_format:"png",prompt});
      return {...card, id: crypto.randomUUID(), image:`data:image/png;base64,${img.data?.[0]?.b64_json}`, design:{accent:"#D9FF66",align:"left",overlay:0.18}};
    }));
    return NextResponse.json({cards:completed,characterSheet});
  } catch (error) { console.error(error); return NextResponse.json({error:error instanceof Error ? error.message : "생성 중 오류가 발생했습니다."},{status:500}); }
}
