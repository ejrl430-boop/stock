import { Metadata } from "next";
import TradingDashboard from "../components/TradingDashboard";

export const metadata: Metadata = {
  title: "Fibonacci Breakout Analyzer - 피보나치 자동 차트",
  description: "주식 급등주 자동 피보나치 되돌림 차트 분석 대시보드. 급등 시작 양봉과 고점을 자동 감지 및 분석합니다.",
  keywords: ["주식", "급등주", "피보나치 되돌림", "차트 분석", "TradingView"],
};

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TradingDashboard />
    </main>
  );
}
