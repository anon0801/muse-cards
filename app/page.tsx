"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderOpen, ImagePlus, LoaderCircle, LogIn, LogOut, Save, Sparkles, Trash2 } from "lucide-react";
import { toPng } from "html-to-image";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Design = { accent: string; align: "left" | "center"; overlay: number; layout: "top" | "bottom" };
type Card = { id: string; title: string; body: string; visual: string; image: string; imagePath?: string; design: Design };
type Project = { id: string; title: string; persona: string; topic: string; settings: { format: Format; useCharacter: boolean }; cards: Card[]; character_sheet: string | null; updated_at: string };
type Format = "portrait" | "square" | "landscape";
const formats: { id: Format; name: string; ratio: string; width: number; height: number }[] = [
  { id: "portrait", name: "세로 4:5", ratio: "4 / 5", width: 1080, height: 1350 },
  { id: "square", name: "정사각형 1:1", ratio: "1 / 1", width: 1080, height: 1080 },
  { id: "landscape", name: "가로 16:9", ratio: "16 / 9", width: 1920, height: 1080 }
];
const imageBytes = (data: string) => fetch(data).then(r => r.blob());

export default function Studio() {
  const [persona, setPersona] = useState("따뜻하고 감각적인 라이프스타일 큐레이터");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<Format>("portrait");
  const [useCharacter, setUseCharacter] = useState(false);
  const [reference, setReference] = useState("");
  const [sheet, setSheet] = useState("");
  const [sheetPath, setSheetPath] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [history, setHistory] = useState<Project[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [projectId, setProjectId] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const card = cards[active];
  const selectedFormat = formats.find(x => x.id === format)!;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function api(action: string, extra: Record<string, unknown> = {}) {
    if (!supabase) throw new Error("Supabase 연결이 아직 설정되지 않았습니다.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setShowLogin(true); throw new Error("로그인 후 카드뉴스를 만들 수 있습니다."); }
    const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, persona, topic, count, format, ...extra }) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "요청에 실패했습니다.");
    return json;
  }

  async function upload(data: string, path: string) {
    if (!supabase || !user) throw new Error("로그인 후 저장할 수 있습니다.");
    const blob = await imageBytes(data);
    const { error: uploadError } = await supabase.storage.from("card-assets").upload(`${user.id}/${path}`, blob, { contentType: "image/png", upsert: true });
    if (uploadError) throw uploadError;
    return `${user.id}/${path}`;
  }

  async function signed(path: string) {
    if (!supabase) return "";
    const { data, error: signError } = await supabase.storage.from("card-assets").createSignedUrl(path, 60 * 60 * 24);
    if (signError) throw signError;
    return data.signedUrl;
  }

  async function loadHistory() {
    if (!supabase || !user) return;
    const { data, error: queryError } = await supabase.from("projects").select("id,title,persona,topic,settings,cards,character_sheet,updated_at").order("updated_at", { ascending: false }).limit(30);
    if (queryError) throw queryError;
    setHistory((data || []) as Project[]);
  }

  async function openProject(project: Project) {
    try {
      setBusy(true); setError("");
      const restored = await Promise.all(project.cards.map(async c => ({ ...c, image: c.imagePath ? await signed(c.imagePath) : c.image })));
      setCards(restored); setPersona(project.persona); setTopic(project.topic); setCount(restored.length);
      setFormat(project.settings?.format || "portrait"); setUseCharacter(Boolean(project.settings?.useCharacter));
      setSheetPath(project.character_sheet || ""); setSheet(project.character_sheet ? await signed(project.character_sheet) : "");
      setReference(""); setProjectId(project.id); setActive(0); setShowHistory(false);
      setNotice("저장한 카드뉴스를 열었습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "기록을 열지 못했습니다."); } finally { setBusy(false); }
  }

  async function generate() {
    if (!topic.trim() || !persona.trim()) { setError("브랜드 페르소나와 주제를 입력해 주세요."); return; }
    if (useCharacter && !reference) { setError("사용할 사진이나 캐릭터를 업로드해 주세요."); return; }
    setBusy(true); setError(""); setNotice(""); setProgress("카드 내용을 기획하고 있어요…");
    try {
      const plan = await api("plan");
      const planned = plan.cards as Card[];
      setCards(planned); setActive(0); setProjectId(""); setSheet(""); setSheetPath("");
      let characterSheetPath = "";
      if (useCharacter) { setProgress("같은 얼굴과 의상을 위한 캐릭터 시트를 만들고 있어요…"); const result = await api("sheet", { referenceImage: reference }); characterSheetPath = result.imagePath; setSheet(result.image); setSheetPath(characterSheetPath); }
      for (let index = 0; index < planned.length; index++) {
        setProgress(`${index + 1} / ${planned.length} 카드 이미지를 만들고 있어요…`);
        const result = await api("image", { card: planned[index], characterSheetPath });
        planned[index] = { ...planned[index], image: result.image, imagePath: result.imagePath };
        setCards([...planned]); setActive(index);
      }
      setProgress(""); setNotice("모든 카드가 완성됐습니다. 문구와 디자인을 수정하고 저장해 보세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "카드뉴스 생성에 실패했습니다."); }
    finally { setBusy(false); setProgress(""); }
  }

  async function regenerateImage() {
    if (!card) return;
    setBusy(true); setError(""); setProgress("선택한 카드 이미지를 다시 만들고 있어요…");
    try {
      const result = await api("image", { card, characterSheetPath: useCharacter ? sheetPath : "" });
      setCards(cs => cs.map((c, i) => i === active ? { ...c, image: result.image, imagePath: result.imagePath } : c));
    } catch (e) { setError(e instanceof Error ? e.message : "이미지를 다시 만들지 못했습니다."); }
    finally { setBusy(false); setProgress(""); }
  }

  async function save() {
    if (!cards.length) { setError("먼저 카드뉴스를 만들어 주세요."); return; }
    if (!supabase || !user) { setShowLogin(true); setError("로그인 후 저장할 수 있습니다."); return; }
    setBusy(true); setError(""); setProgress("이미지와 카드뉴스를 저장하고 있어요…");
    try {
      const id = projectId || crypto.randomUUID();
      const savedCards = await Promise.all(cards.map(async (c, i) => {
        const imagePath = c.imagePath || (c.image.startsWith("data:") ? await upload(c.image, `${id}/card-${c.id}.png`) : "");
        return { ...c, image: "", imagePath, order: i };
      }));
      const characterPath = sheetPath || (sheet.startsWith("data:") ? await upload(sheet, `${id}/character-sheet.png`) : null);
      const payload = { id, user_id: user.id, title: topic, persona, topic, settings: { format, useCharacter, count: cards.length }, cards: savedCards, character_sheet: characterPath };
      const { error: saveError } = await supabase.from("projects").upsert(payload);
      if (saveError) throw saveError;
      setCards(cs => cs.map((c, i) => ({ ...c, imagePath: savedCards[i].imagePath })));
      setProjectId(id); setSheetPath(characterPath || ""); setNotice("카드뉴스와 이미지가 저장됐습니다.");
      await loadHistory();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); setProgress(""); }
  }

  async function login() {
    if (!supabase) { setError("Supabase 연결이 아직 설정되지 않았습니다."); return; }
    const { error: loginError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (loginError) setError(loginError.message);
    else { setShowLogin(false); setNotice("이메일로 로그인 링크를 보냈습니다. 링크를 열고 돌아와 주세요."); }
  }

  function onUpload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) { setError("3MB 이하의 PNG, JPG 또는 WEBP 이미지를 선택해 주세요."); return; }
    const reader = new FileReader(); reader.onload = () => { setReference(String(reader.result)); setError(""); }; reader.readAsDataURL(file);
  }

  function edit(changes: Partial<Card>) { setCards(cs => cs.map((c, i) => i === active ? { ...c, ...changes } : c)); }
  function editDesign(changes: Partial<Design>) { if (card) edit({ design: { ...card.design, ...changes } }); }
  function move(dir: -1 | 1) { const next = active + dir; if (next < 0 || next >= cards.length) return; const copy = [...cards]; [copy[active], copy[next]] = [copy[next], copy[active]]; setCards(copy); setActive(next); }
  function remove() { setCards(cs => cs.filter((_, i) => i !== active)); setActive(Math.max(0, active - 1)); }

  async function download() {
    if (!card || !cardRef.current || !card.image) return;
    try {
      setError("");
      const png = await toPng(cardRef.current, { cacheBust: false, pixelRatio: selectedFormat.width / cardRef.current.clientWidth, width: cardRef.current.clientWidth, height: cardRef.current.clientHeight });
      const link = document.createElement("a"); link.download = `${String(active + 1).padStart(2, "0")}-${card.title.replace(/[\\/:*?"<>|]/g, "-")}.png`; link.href = png; link.click();
    } catch (e) { setError(e instanceof Error ? e.message : "PNG를 저장하지 못했습니다."); }
  }

  return <main>
    <aside className="sidebar"><div className="logo"><Sparkles size={20} /> muse<span>cards</span></div><p className="eyebrow">AI CARD STUDIO</p><h1>당신의 이야기를<br /><i>한 장씩</i> 전하세요.</h1><p className="sidecopy">브랜드의 결을 담아 카드뉴스를 만듭니다.</p><div className="sidefoot">이미지는 <b>gpt-image-2</b>로 생성됩니다.<br />한글은 카드 위에 정확하게 합성됩니다.</div></aside>
    <section className="composer"><header><div><p className="eyebrow">CARD NEWS STUDIO</p><h2>새 카드뉴스</h2></div><div className="headerActions"><button className="ghost" onClick={async () => { try { await loadHistory(); setShowHistory(true); } catch (e) { setError(e instanceof Error ? e.message : "기록을 불러오지 못했습니다."); } }} disabled={!user}><FolderOpen size={16} /> 생성 기록</button><button className="ghost" onClick={() => user ? supabase?.auth.signOut() : setShowLogin(true)}>{user ? <LogOut size={16} /> : <LogIn size={16} />}{user ? "로그아웃" : "로그인"}</button></div></header>
      <div className="form"><label>브랜드 페르소나<textarea value={persona} onChange={e => setPersona(e.target.value)} rows={2} maxLength={1200} /></label><label>카드뉴스 주제<textarea placeholder="예: 바쁜 직장인을 위한 아침 루틴 5가지" value={topic} onChange={e => setTopic(e.target.value)} rows={3} maxLength={500} /></label>
        <div className="fieldrow"><label>카드 수<div className="stepper"><button aria-label="카드 수 줄이기" onClick={() => setCount(Math.max(2, count - 1))}>−</button><b>{count}장</b><button aria-label="카드 수 늘리기" onClick={() => setCount(Math.min(10, count + 1))}>+</button></div></label><label>이미지 크기<div className="segmented">{formats.map(f => <button key={f.id} className={format === f.id ? "selected" : ""} onClick={() => setFormat(f.id)}>{f.name}</button>)}</div><small className="dimension">완성 PNG: {selectedFormat.width} × {selectedFormat.height}px</small></label></div>
        <div className="character"><div><b>나의 사진·캐릭터 사용</b><span>먼저 캐릭터 시트를 만들고 모든 카드의 참조로 사용합니다.</span></div><button aria-label="나의 캐릭터 사용" aria-pressed={useCharacter} className={useCharacter ? "toggle on" : "toggle"} onClick={() => setUseCharacter(!useCharacter)}><i /></button></div>
        {useCharacter && <label className="upload">{reference ? <img src={reference} alt="업로드한 캐릭터" /> : <ImagePlus size={24} />}<span>{reference ? "이미지 바꾸기" : "사진 또는 캐릭터 업로드"}<small>PNG, JPG, WEBP · 3MB 이하</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => onUpload(e.target.files?.[0])} /></label>}
        {error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}{progress && <p className="progress" role="status"><LoaderCircle className="spin" size={15} /> {progress}</p>}
        <button className="generate" onClick={generate} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}{busy ? "제작 중…" : "카드뉴스 만들기"}</button>{cards.length > 0 && <button className="saveButton" onClick={save} disabled={busy}><Save size={16} /> 수정한 카드뉴스 저장</button>}</div>
      {sheet && <div className="sheet"><img src={sheet} alt="생성된 캐릭터 시트" /><span>모든 카드 이미지의 기준이 되는 캐릭터 시트</span></div>}
    </section>
    <section className="workspace">{!cards.length ? <div className="empty"><Sparkles /><h2>캔버스가 비어 있어요</h2><p>주제와 브랜드 페르소나를 입력하면<br />글과 글자 없는 이미지를 만듭니다.</p></div> : <><div className="toolbar"><span>{active + 1} / {cards.length}</span><div><button aria-label="카드를 앞 순서로 이동" onClick={() => move(-1)} disabled={active === 0}><ChevronLeft /></button><button aria-label="카드를 뒤 순서로 이동" onClick={() => move(1)} disabled={active === cards.length - 1}><ChevronRight /></button><button className="download" onClick={download} disabled={!card?.image}><Download size={16} /> PNG 다운로드</button></div></div>
      <div className="canvaswrap"><div ref={cardRef} className="card" style={{ aspectRatio: selectedFormat.ratio }}>{card.image ? <img src={card.image} alt="카드 배경 이미지" /> : <div className="imagePending"><LoaderCircle className="spin" /> 이미지 생성 대기 중</div>}<div className="shade" style={{ background: `linear-gradient(${card.design.layout === "top" ? "0deg" : "180deg"}, rgba(0,0,0,${card.design.overlay}) 0%, rgba(0,0,0,.78) 100%)` }} /><div className={`copy ${card.design.align} ${card.design.layout}`}><span style={{ background: card.design.accent }}>MUSE CARDS · {String(active + 1).padStart(2, "0")}</span><h3>{card.title}</h3><p>{card.body}</p></div></div></div>
      <div className="editor"><div className="thumbnails">{cards.map((x, i) => <button key={x.id} className={active === i ? "active" : ""} onClick={() => setActive(i)} aria-label={`${i + 1}번 카드 선택`}>{x.image && <img src={x.image} alt="" />}<span>{i + 1}</span></button>)}</div><div className="editfields"><label>카드 제목<input value={card.title} onChange={e => edit({ title: e.target.value })} /></label><label>본문<textarea value={card.body} onChange={e => edit({ body: e.target.value })} rows={3} /></label><label>이미지 장면 설명<textarea value={card.visual} onChange={e => edit({ visual: e.target.value })} rows={2} /></label><div className="designControls"><label>강조색<input type="color" value={card.design.accent} onChange={e => editDesign({ accent: e.target.value })} /></label><label>정렬<select value={card.design.align} onChange={e => editDesign({ align: e.target.value as Design["align"] })}><option value="left">왼쪽</option><option value="center">가운데</option></select></label><label>글 위치<select value={card.design.layout} onChange={e => editDesign({ layout: e.target.value as Design["layout"] })}><option value="bottom">아래</option><option value="top">위</option></select></label><label>어둡게 <input type="range" min="0" max="0.7" step="0.05" value={card.design.overlay} onChange={e => editDesign({ overlay: Number(e.target.value) })} /></label></div><div className="editActions"><button className="outline" onClick={regenerateImage} disabled={busy}><ImagePlus size={16} /> 이미지 다시 만들기</button><button className="outline danger" onClick={remove}><Trash2 size={16} /> 카드 삭제</button></div></div></div></>}</section>
    {showLogin && <div className="modalBackdrop" onClick={() => setShowLogin(false)}><div className="modal" onClick={e => e.stopPropagation()}><h2>이메일로 로그인</h2><p>로그인 링크를 보내드립니다. 로그인하면 카드뉴스와 생성 기록을 저장할 수 있습니다.</p><label>이메일 주소<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label><div className="modalActions"><button className="ghost" onClick={() => setShowLogin(false)}>닫기</button><button className="generate" onClick={login} disabled={!email.includes("@")}>로그인 링크 보내기</button></div></div></div>}
    {showHistory && <div className="modalBackdrop" onClick={() => setShowHistory(false)}><div className="modal historyModal" onClick={e => e.stopPropagation()}><h2>생성 기록</h2><p>저장한 카드뉴스를 선택해 다시 편집할 수 있습니다.</p>{history.length ? <div className="historyList">{history.map(p => <button key={p.id} onClick={() => openProject(p)}><strong>{p.title}</strong><span>{p.cards.length}장 · {new Date(p.updated_at).toLocaleDateString("ko-KR")}</span></button>)}</div> : <p>저장된 카드뉴스가 없습니다.</p>}<button className="ghost" onClick={() => setShowHistory(false)}>닫기</button></div></div>}
  </main>;
}
