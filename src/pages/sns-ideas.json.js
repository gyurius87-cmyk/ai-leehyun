// 공부하면서 Claude가 쌓은 콘텐츠 기획 → SNS 통합 관리(AI이현 기획실)가 키 없이 읽는 정적 파일
import ideas from "../../data/sns-ideas.json";

export const GET = () => new Response(JSON.stringify(ideas), { headers: { "Content-Type": "application/json; charset=utf-8" } });
