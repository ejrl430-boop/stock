"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  MarketIndexInfo,
  SectorData,
  StockCandidate,
  ORBPlan,
  JournalEntry,
  SECTOR_MAP,
  evaluateMarketStatus,
  processSectors,
  processCandidatesList,
  calculateORBPlan
} from "../lib/orbScanner";

// Initial Mock Data
const INITIAL_MARKET_INDICES: MarketIndexInfo[] = [
  { symbol: "SPY", name: "S&P 500 ETF", price: 545.20, changePercent: 0.45, volume: 45000000, isAboveVwap: true, direction: "Bullish" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 480.10, changePercent: 0.65, volume: 38000000, isAboveVwap: true, direction: "Bullish" },
  { symbol: "IWM", name: "Russell 2000 ETF", price: 202.40, changePercent: -0.12, volume: 18000000, isAboveVwap: false, direction: "Neutral" },
  { symbol: "DIA", name: "Dow 30 ETF", price: 390.80, changePercent: 0.05, volume: 5000000, isAboveVwap: true, direction: "Neutral" },
];

const INITIAL_RAW_SECTORS = [
  { symbol: "SMH", changePercent: 1.25, volume: 4200000, avgVolume: 3500000 },
  { symbol: "SOXX", changePercent: 1.15, volume: 1100000, avgVolume: 900000 },
  { symbol: "XLK", changePercent: 0.85, volume: 8500000, avgVolume: 7800000 },
  { symbol: "XLC", changePercent: 0.45, volume: 4100000, avgVolume: 4300000 },
  { symbol: "XLY", changePercent: 0.25, volume: 3800000, avgVolume: 4200000 },
  { symbol: "XLF", changePercent: -0.15, volume: 5500000, avgVolume: 5100000 },
  { symbol: "XLV", changePercent: 0.55, volume: 6200000, avgVolume: 5800000 },
  { symbol: "XBI", changePercent: 1.85, volume: 3500000, avgVolume: 2900000 },
  { symbol: "IBB", changePercent: 1.45, volume: 1500000, avgVolume: 1200000 },
  { symbol: "XLE", changePercent: -0.75, volume: 7200000, avgVolume: 8000000 },
  { symbol: "XLI", changePercent: 0.05, volume: 3200000, avgVolume: 3500000 },
  { symbol: "ARKK", changePercent: 0.95, volume: 2200000, avgVolume: 2000000 },
];

const INITIAL_CANDIDATES: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings">[] = [
  { ticker: "VRTX", name: "Vertex Pharmaceuticals", sector: "헬스케어", price: 420.50, changePercent: 4.5, volume: 1800000, dollarVolume: 1800000 * 420.50, previousClose: 402.39, dayHigh: 422.00, dayLow: 401.50, is20DayHigh: true, is55DayHigh: true, is52WkHighNear: true, relativeStrengthVsSPY: 4.05, relativeStrengthVsQQQ: 3.85 },
  { ticker: "NVDA", name: "NVIDIA Corp", sector: "반도체", price: 125.20, changePercent: 6.2, volume: 45000000, dollarVolume: 45000000 * 125.20, previousClose: 117.89, dayHigh: 126.00, dayLow: 118.00, is20DayHigh: true, relativeStrengthVsSPY: 5.75, relativeStrengthVsQQQ: 5.55 },
  { ticker: "MU", name: "Micron Technology", sector: "반도체", price: 142.10, changePercent: 8.5, volume: 18000000, dollarVolume: 18000000 * 142.10, previousClose: 130.97, dayHigh: 143.00, dayLow: 131.50, is20DayHigh: true, relativeStrengthVsSPY: 8.05, relativeStrengthVsQQQ: 7.85 },
  { ticker: "LLY", name: "Eli Lilly & Co", sector: "헬스케어", price: 890.30, changePercent: 1.2, volume: 3200000, dollarVolume: 3200000 * 890.30, previousClose: 879.74, dayHigh: 892.00, dayLow: 878.00, is20DayHigh: false, relativeStrengthVsSPY: 0.75, relativeStrengthVsQQQ: 0.55 },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "반도체", price: 165.40, changePercent: 3.1, volume: 15000000, dollarVolume: 15000000 * 165.40, previousClose: 160.43, dayHigh: 166.50, dayLow: 160.00, is20DayHigh: false, relativeStrengthVsSPY: 2.65, relativeStrengthVsQQQ: 2.45 },
  { ticker: "SMCI", name: "Super Micro Computer", sector: "기술주", price: 820.00, changePercent: 21.5, volume: 800000, dollarVolume: 800000 * 820.00, previousClose: 674.90, dayHigh: 835.00, dayLow: 685.00, is20DayHigh: true, is55DayHigh: true, isNewsPumpSuspect: true, relativeStrengthVsSPY: 21.05, relativeStrengthVsQQQ: 20.85 },
  { ticker: "BMEA", name: "Biomea Fusion", sector: "바이오", price: 8.20, changePercent: 15.4, volume: 2500000, dollarVolume: 2500000 * 8.20, previousClose: 7.10, dayHigh: 8.50, dayLow: 7.05, is20DayHigh: true, isBioLowPrice: true, relativeStrengthVsSPY: 14.95, relativeStrengthVsQQQ: 14.75 }
];

const INITIAL_JOURNAL: JournalEntry[] = [
  { id: "1", date: "2026-06-25", symbol: "NVDA", sector: "반도체", score: 85, isTraded: true, entryPrice: 122.50, stopLoss: 120.00, target1R: 126.25, target2R: 130.00, resultPrice: 126.50, resultType: "PROFIT_1R", rValue: 1.5, violations: [], emotionInvolved: false, memo: "첫 30분 박스 상단 돌파 후 정확한 9EMA 지지 눌림 진입. 원칙 완벽 준수." },
  { id: "2", date: "2026-06-26", symbol: "BMEA", sector: "바이오", score: 45, isTraded: true, entryPrice: 7.80, stopLoss: 7.50, target1R: 8.25, target2R: 8.70, resultPrice: 7.50, resultType: "STOP_LOSS", rValue: -1.0, violations: ["30분 전 진입", "눌림 없이 추격"], emotionInvolved: true, memo: "조급하게 박스 돌파 전 뇌동매매 진입하여 손절. 저가 바이오 리스크 간과함." }
];

const RISK_CHECKLIST_ITEMS = [
  { id: 1, text: "SPY 또는 QQQ 지수가 오늘 무너지지 않고 하방 지지되는 상태인가?" },
  { id: 2, text: "해당 종목이 오늘 활성화된 강세(Strong) 섹터군에 소속되어 있는가?" },
  { id: 3, text: "조건검색 점수 평가 결과 A등급(80점 이상)을 획득했는가?" },
  { id: 4, text: "개장 후 첫 30분 동안의 박스권 고점과 저점이 차트상 명확한가?" },
  { id: 5, text: "30분 박스 상단선을 거래량을 동반하여 캔들 종가상 돌파했는가?" },
  { id: 6, text: "돌파할 때 추격매수하지 않고 박스 상단 재지지를 기다렸는가?" },
  { id: 7, text: "눌림 조정이 30분 박스 상단선 또는 당일 VWAP선 근처에서 나왔는가?" },
  { id: 8, text: "눌림 저점에서 양봉(5분봉)이 뜨며 하락이 멈춘 것이 확인되었는가?" },
  { id: 9, text: "현재 주가가 당일 누적 평균단가선인 VWAP 위에 안전하게 있는가?" },
  { id: 10, text: "눌림 저점 또는 VWAP선 바로 아래에 명확한 손절가를 설정했는가?" },
  { id: 11, text: "수익 목표선(1.5R 이상) 대비 진입 예정 가격의 손익비가 우수한가?" },
  { id: 12, text: "한국 시간 23:55 장중 전량 청산 원칙을 지키고 정해진 시간 내 매도 가능한가?" }
];

export default function TradingDashboard() {
  // --- States ---
  const [marketIndices, setMarketIndices] = useState<MarketIndexInfo[]>(INITIAL_MARKET_INDICES);
  const [rawSectors, setRawSectors] = useState(INITIAL_RAW_SECTORS);
  const [candidates, setCandidates] = useState<StockCandidate[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [orbPlans, setOrbPlans] = useState<Record<string, ORBPlan>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean[]>>({});
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  // Manual inputs for Screener Form
  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");
  const [newSector, setNewSector] = useState("반도체");
  const [newPrice, setNewPrice] = useState("");
  const [newChange, setNewChange] = useState("");
  const [newVolume, setNewVolume] = useState("");
  const [newIs20High, setNewIs20High] = useState(true);
  const [csvText, setCsvText] = useState("");

  // Plan Inputs for current ticker
  const [planRangeHigh, setPlanRangeHigh] = useState("");
  const [planRangeLow, setPlanRangeLow] = useState("");
  const [planVwap, setPlanVwap] = useState("");
  const [planPullbackLow, setPlanPullbackLow] = useState("");
  const [planEntry, setPlanEntry] = useState("");
  const [planStop, setPlanStop] = useState("");
  const [currentTimeStr, setCurrentTimeStr] = useState("22:45");

  // Journal Inputs
  const [journalSymbol, setJournalSymbol] = useState("");
  const [journalScore, setJournalScore] = useState("");
  const [journalIsTraded, setJournalIsTraded] = useState(true);
  const [journalEntryPrice, setJournalEntryPrice] = useState("");
  const [journalStopLoss, setJournalStopLoss] = useState("");
  const [journalResultPrice, setJournalResultPrice] = useState("");
  const [journalResultType, setJournalResultType] = useState<JournalEntry["resultType"]>("PROFIT_1R");
  const [journalViolations, setJournalViolations] = useState<string[]>([]);
  const [journalEmotion, setJournalEmotion] = useState(false);
  const [journalMemo, setJournalMemo] = useState("");

  // Load from local storage
  useEffect(() => {
    const savedCandidates = localStorage.getItem("orb_candidates");
    const savedJournal = localStorage.getItem("orb_journal");
    const savedPlans = localStorage.getItem("orb_plans");

    if (savedCandidates) {
      setCandidates(JSON.parse(savedCandidates));
    } else {
      // Initialize with mock
      const spy = INITIAL_MARKET_INDICES.find(i => i.symbol === "SPY")?.changePercent || 0;
      const qqq = INITIAL_MARKET_INDICES.find(i => i.symbol === "QQQ")?.changePercent || 0;
      const processedSecs = processSectors(INITIAL_RAW_SECTORS, spy, qqq);
      const strongSecNames = processedSecs.filter(s => s.status === "Strong").map(s => s.name);
      const processedCands = processCandidatesList(INITIAL_CANDIDATES, strongSecNames);
      setCandidates(processedCands);
      if (processedCands.length > 0) {
        setSelectedTicker(processedCands[0].ticker);
      }
    }

    if (savedJournal) {
      setJournal(JSON.parse(savedJournal));
    } else {
      setJournal(INITIAL_JOURNAL);
    }

    if (savedPlans) {
      setOrbPlans(JSON.parse(savedPlans));
    }
  }, []);

  // Save candidates & journal
  const saveCandidates = (list: StockCandidate[]) => {
    setCandidates(list);
    localStorage.setItem("orb_candidates", JSON.stringify(list));
  };

  const saveJournal = (list: JournalEntry[]) => {
    setJournal(list);
    localStorage.setItem("orb_journal", JSON.stringify(list));
  };

  // --- Computed Stats ---
  const spy = marketIndices.find(i => i.symbol === "SPY");
  const qqq = marketIndices.find(i => i.symbol === "QQQ");
  
  const marketStatus = useMemo(() => {
    return evaluateMarketStatus(marketIndices);
  }, [marketIndices]);

  const sectors = useMemo(() => {
    return processSectors(rawSectors, spy?.changePercent || 0, qqq?.changePercent || 0);
  }, [rawSectors, spy, qqq]);

  const strongSectors = useMemo(() => {
    return sectors.filter(s => s.status === "Strong").map(s => s.name);
  }, [sectors]);

  // Watchlist: Top 3~5 Candidates with A or B Grade
  const watchlist = useMemo(() => {
    return candidates
      .filter(c => c.grade === "A" || c.grade === "B")
      .slice(0, 5);
  }, [candidates]);

  // Set default selected ticker from watchlist
  useEffect(() => {
    if (watchlist.length > 0 && !selectedTicker) {
      setSelectedTicker(watchlist[0].ticker);
    }
  }, [watchlist, selectedTicker]);

  // Load current ticker's plan and checklist
  const currentPlan = orbPlans[selectedTicker];
  const currentChecklist = checklist[selectedTicker] || Array(12).fill(false);
  const checklistYesCount = currentChecklist.filter(Boolean).length;

  useEffect(() => {
    if (currentPlan) {
      setPlanRangeHigh(currentPlan.openingRangeHigh.toString());
      setPlanRangeLow(currentPlan.openingRangeLow.toString());
      setPlanVwap(currentPlan.vwap.toString());
      setPlanPullbackLow(currentPlan.pullbackLow.toString());
      setPlanEntry(currentPlan.entryPrice.toString());
      setPlanStop(currentPlan.stopLoss.toString());
    } else {
      setPlanRangeHigh("");
      setPlanRangeLow("");
      setPlanVwap("");
      setPlanPullbackLow("");
      setPlanEntry("");
      setPlanStop("");
    }
  }, [selectedTicker, orbPlans]);

  // --- Market Status Presets ---
  const applyMarketPreset = (preset: "bull" | "bear" | "neutral") => {
    if (preset === "bull") {
      setMarketIndices([
        { symbol: "SPY", name: "S&P 500 ETF", price: 546.20, changePercent: 0.85, volume: 55000000, isAboveVwap: true, direction: "Bullish" },
        { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 482.10, changePercent: 1.15, volume: 48000000, isAboveVwap: true, direction: "Bullish" },
        { symbol: "IWM", name: "Russell 2000 ETF", price: 204.20, changePercent: 0.42, volume: 20000000, isAboveVwap: true, direction: "Bullish" },
        { symbol: "DIA", name: "Dow 30 ETF", price: 392.10, changePercent: 0.25, volume: 6000000, isAboveVwap: true, direction: "Bullish" },
      ]);
      setRawSectors([
        { symbol: "SMH", changePercent: 2.15, volume: 5200000, avgVolume: 3500000 },
        { symbol: "SOXX", changePercent: 1.95, volume: 1500000, avgVolume: 900000 },
        { symbol: "XLK", changePercent: 1.45, volume: 9500000, avgVolume: 7800000 },
        { symbol: "XLC", changePercent: 0.85, volume: 5100000, avgVolume: 4300000 },
        { symbol: "XLY", changePercent: 0.65, volume: 4800000, avgVolume: 4200000 },
        { symbol: "XLF", changePercent: 0.15, volume: 6000000, avgVolume: 5100000 },
        { symbol: "XLV", changePercent: 0.85, volume: 6500000, avgVolume: 5800000 },
        { symbol: "XBI", changePercent: 2.25, volume: 4500000, avgVolume: 2900000 },
        { symbol: "IBB", changePercent: 1.85, volume: 1900000, avgVolume: 1200000 },
        { symbol: "XLE", changePercent: -0.15, volume: 7500000, avgVolume: 8000000 },
        { symbol: "XLI", changePercent: 0.35, volume: 3800000, avgVolume: 3500000 },
        { symbol: "ARKK", changePercent: 1.85, volume: 3200000, avgVolume: 2000000 },
      ]);
    } else if (preset === "bear") {
      setMarketIndices([
        { symbol: "SPY", name: "S&P 500 ETF", price: 539.10, changePercent: -0.95, volume: 60000000, isAboveVwap: false, direction: "Bearish" },
        { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 471.50, changePercent: -1.35, volume: 55000000, isAboveVwap: false, direction: "Bearish" },
        { symbol: "IWM", name: "Russell 2000 ETF", price: 198.10, changePercent: -1.15, volume: 22000000, isAboveVwap: false, direction: "Bearish" },
        { symbol: "DIA", name: "Dow 30 ETF", price: 386.40, changePercent: -0.65, volume: 8000000, isAboveVwap: false, direction: "Bearish" },
      ]);
      setRawSectors([
        { symbol: "SMH", changePercent: -1.95, volume: 6100000, avgVolume: 3500000 },
        { symbol: "SOXX", changePercent: -2.15, volume: 1800000, avgVolume: 900000 },
        { symbol: "XLK", changePercent: -1.85, volume: 11000000, avgVolume: 7800000 },
        { symbol: "XLC", changePercent: -1.15, volume: 6200000, avgVolume: 4300000 },
        { symbol: "XLY", changePercent: -1.45, volume: 5800000, avgVolume: 4200000 },
        { symbol: "XLF", changePercent: -0.85, volume: 7200000, avgVolume: 5100000 },
        { symbol: "XLV", changePercent: -0.65, volume: 8000000, avgVolume: 5800000 },
        { symbol: "XBI", changePercent: -1.95, volume: 5000000, avgVolume: 2900000 },
        { symbol: "IBB", changePercent: -1.75, volume: 2200000, avgVolume: 1200000 },
        { symbol: "XLE", changePercent: -1.55, volume: 9000000, avgVolume: 8000000 },
        { symbol: "XLI", changePercent: -0.95, volume: 4800000, avgVolume: 3500000 },
        { symbol: "ARKK", changePercent: -2.85, volume: 4200000, avgVolume: 2000000 },
      ]);
    } else {
      // Mixed
      setMarketIndices([
        { symbol: "SPY", name: "S&P 500 ETF", price: 543.80, changePercent: -0.15, volume: 41000000, isAboveVwap: false, direction: "Neutral" },
        { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 479.50, changePercent: 0.25, volume: 42000000, isAboveVwap: true, direction: "Bullish" },
        { symbol: "IWM", name: "Russell 2000 ETF", price: 201.20, changePercent: -0.55, volume: 17000000, isAboveVwap: false, direction: "Bearish" },
        { symbol: "DIA", name: "Dow 30 ETF", price: 389.50, changePercent: -0.10, volume: 4800000, isAboveVwap: false, direction: "Neutral" },
      ]);
      setRawSectors([
        { symbol: "SMH", changePercent: 0.85, volume: 4100000, avgVolume: 3500000 },
        { symbol: "SOXX", changePercent: 0.75, volume: 1050000, avgVolume: 900000 },
        { symbol: "XLK", changePercent: 0.45, volume: 8100000, avgVolume: 7800000 },
        { symbol: "XLC", changePercent: 0.15, volume: 3800000, avgVolume: 4300000 },
        { symbol: "XLY", changePercent: -0.25, volume: 3200000, avgVolume: 4200000 },
        { symbol: "XLF", changePercent: -0.45, volume: 5100000, avgVolume: 5100000 },
        { symbol: "XLV", changePercent: 0.35, volume: 6000000, avgVolume: 5800000 },
        { symbol: "XBI", changePercent: 0.15, volume: 3000000, avgVolume: 2900000 },
        { symbol: "IBB", changePercent: 0.05, volume: 1100000, avgVolume: 1200000 },
        { symbol: "XLE", changePercent: -1.25, volume: 8500000, avgVolume: 8000000 },
        { symbol: "XLI", changePercent: -0.35, volume: 2900000, avgVolume: 3500000 },
        { symbol: "ARKK", changePercent: -0.15, volume: 1800000, avgVolume: 2000000 },
      ]);
    }
  };

  // --- Add/Remove Candidate ---
  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker || !newPrice || !newChange || !newVolume) return;
    
    const priceNum = parseFloat(newPrice);
    const changeNum = parseFloat(newChange);
    const volNum = parseInt(newVolume, 10);

    const newObj: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings"> = {
      ticker: newTicker.toUpperCase().trim(),
      name: newName.trim() || newTicker.toUpperCase().trim(),
      sector: newSector,
      price: priceNum,
      changePercent: changeNum,
      volume: volNum,
      dollarVolume: priceNum * volNum,
      previousClose: priceNum / (1 + changeNum / 100),
      dayHigh: priceNum * 1.02,
      dayLow: priceNum * 0.98,
      is20DayHigh: newIs20High,
      relativeStrengthVsSPY: changeNum - (spy?.changePercent || 0),
      relativeStrengthVsQQQ: changeNum - (qqq?.changePercent || 0),
    };

    const updatedCands = [...candidates.map(c => ({
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      price: c.price,
      changePercent: c.changePercent,
      volume: c.volume,
      dollarVolume: c.dollarVolume,
      previousClose: c.previousClose,
      dayHigh: c.dayHigh,
      dayLow: c.dayLow,
      is20DayHigh: c.is20DayHigh,
      is55DayHigh: c.is55DayHigh,
      is52WkHighNear: c.is52WkHighNear,
      isBioLowPrice: c.isBioLowPrice,
      isVolumeHighPriceTooLow: c.isVolumeHighPriceTooLow,
      isSpreadWide: c.isSpreadWide,
      isNewsPumpSuspect: c.isNewsPumpSuspect,
      relativeStrengthVsSPY: c.relativeStrengthVsSPY,
      relativeStrengthVsQQQ: c.relativeStrengthVsQQQ,
      memo: c.memo
    })), newObj];

    const processed = processCandidatesList(updatedCands, strongSectors);
    saveCandidates(processed);
    setSelectedTicker(newObj.ticker);

    setNewTicker("");
    setNewName("");
    setNewPrice("");
    setNewChange("");
    setNewVolume("");
  };

  const handleRemoveCandidate = (tickerToRemove: string) => {
    const updated = candidates.filter(c => c.ticker !== tickerToRemove);
    saveCandidates(updated);
    if (selectedTicker === tickerToRemove) {
      setSelectedTicker(updated[0]?.ticker || "");
    }
  };

  // --- CSV Bulk Parse Upload ---
  const handleCsvUpload = () => {
    if (!csvText.trim()) return;

    try {
      const lines = csvText.split("\n");
      const headers = lines[0].toLowerCase().split(",");
      const parsed: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings">[] = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(",");
        
        const getVal = (headerName: string) => {
          const idx = headers.findIndex(h => h.includes(headerName));
          return idx !== -1 ? cols[idx]?.trim() : "";
        };

        const ticker = getVal("ticker").toUpperCase();
        if (!ticker) continue;

        const price = parseFloat(getVal("price")) || 0;
        const changePercent = parseFloat(getVal("change")) || 0;
        const volume = parseInt(getVal("volume"), 10) || 0;

        parsed.push({
          ticker,
          name: getVal("name") || ticker,
          sector: getVal("sector") || "기술주",
          price,
          changePercent,
          volume,
          dollarVolume: price * volume,
          previousClose: price / (1 + changePercent / 100),
          dayHigh: price * 1.02,
          dayLow: price * 0.98,
          is20DayHigh: getVal("20dayhigh") === "true" || getVal("20day") === "true",
          relativeStrengthVsSPY: changePercent - (spy?.changePercent || 0),
          relativeStrengthVsQQQ: changePercent - (qqq?.changePercent || 0),
        });
      }

      const processed = processCandidatesList(parsed, strongSectors);
      saveCandidates(processed);
      if (processed.length > 0) {
        setSelectedTicker(processed[0].ticker);
      }
      setCsvText("");
      alert(`${processed.length}개의 종목이 스크리너에 로드 및 자동 채점되었습니다.`);
    } catch (e) {
      alert("CSV 형식이 잘못되었습니다. ticker,name,sector,price,change,volume 헤더를 맞춰주세요.");
    }
  };

  // --- Checklist Toggle ---
  const handleChecklistChange = (index: number) => {
    const nextArr = [...currentChecklist];
    nextArr[index] = !nextArr[index];
    
    const updated = {
      ...checklist,
      [selectedTicker]: nextArr
    };
    setChecklist(updated);
    
    // Recalculate plan with checklist count
    if (currentPlan) {
      const nextPlan = calculateORBPlan(
        selectedTicker,
        currentPlan.openingRangeHigh,
        currentPlan.openingRangeLow,
        currentPlan.vwap,
        currentPlan.pullbackLow,
        currentPlan.entryPrice,
        currentPlan.stopLoss,
        nextArr.filter(Boolean).length,
        currentTimeStr
      );
      const nextPlans = {
        ...orbPlans,
        [selectedTicker]: nextPlan
      };
      setOrbPlans(nextPlans);
      localStorage.setItem("orb_plans", JSON.stringify(nextPlans));
    }
  };

  // --- Calculate and Save Plan ---
  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicker) return;

    const rHigh = parseFloat(planRangeHigh) || 0;
    const rLow = parseFloat(planRangeLow) || 0;
    const vwapVal = parseFloat(planVwap) || 0;
    const pLow = parseFloat(planPullbackLow) || 0;
    const entryVal = parseFloat(planEntry) || 0;
    const stopVal = parseFloat(planStop) || 0;

    const plan = calculateORBPlan(
      selectedTicker,
      rHigh,
      rLow,
      vwapVal,
      pLow,
      entryVal,
      stopVal,
      checklistYesCount,
      currentTimeStr
    );

    const updatedPlans = {
      ...orbPlans,
      [selectedTicker]: plan
    };
    setOrbPlans(updatedPlans);
    localStorage.setItem("orb_plans", JSON.stringify(updatedPlans));
  };

  // --- Add Journal Entry ---
  const handleAddJournal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalSymbol || !journalScore) return;

    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split("T")[0],
      symbol: journalSymbol.toUpperCase().trim(),
      sector: candidates.find(c => c.ticker === journalSymbol.toUpperCase())?.sector || "기술주",
      score: parseInt(journalScore, 10) || 0,
      isTraded: journalIsTraded,
      entryPrice: journalIsTraded ? parseFloat(journalEntryPrice) || undefined : undefined,
      stopLoss: journalIsTraded ? parseFloat(journalStopLoss) || undefined : undefined,
      resultPrice: journalIsTraded ? parseFloat(journalResultPrice) || undefined : undefined,
      resultType: journalIsTraded ? journalResultType : "NO_TRADE",
      rValue: journalIsTraded ? calculateRValue(parseFloat(journalEntryPrice), parseFloat(journalStopLoss), parseFloat(journalResultPrice), journalResultType) : undefined,
      violations: journalViolations,
      emotionInvolved: journalEmotion,
      memo: journalMemo.trim()
    };

    saveJournal([newEntry, ...journal]);
    
    // Clear inputs
    setJournalSymbol("");
    setJournalScore("");
    setJournalEntryPrice("");
    setJournalStopLoss("");
    setJournalResultPrice("");
    setJournalViolations([]);
    setJournalEmotion(false);
    setJournalMemo("");
  };

  const calculateRValue = (entry: number, stop: number, result: number, type: JournalEntry["resultType"]): number => {
    if (!entry || !stop || !result) return 0;
    const risk = entry - stop;
    if (risk <= 0) return 0;
    
    if (type === "STOP_LOSS") return -1.0;
    if (type === "BREAKEVEN") return 0;
    return Number(((result - entry) / risk).toFixed(2));
  };

  // Journal Statistics
  const journalStats = useMemo(() => {
    const tradedList = journal.filter(j => j.isTraded);
    const totalTraded = tradedList.length;
    if (totalTraded === 0) return { total: 0, complianceRate: 100, avgR: 0, stopCompliance: 100, noTradeSuccess: 0, mostViolated: "없음" };

    const complianceCount = journal.filter(j => j.violations.length === 0).length;
    const complianceRate = Math.round((complianceCount / journal.length) * 100);

    const sumR = tradedList.reduce((acc, curr) => acc + (curr.rValue || 0), 0);
    const avgR = Number((sumR / totalTraded).toFixed(2));

    const stopViolationCount = journal.filter(j => j.violations.includes("손절 미준수")).length;
    const stopCompliance = Math.round(((totalTraded - stopViolationCount) / totalTraded) * 100);

    const noTradeSuccess = journal.filter(j => !j.isTraded && j.resultType === "NO_TRADE").length;

    // Most Violated Rule
    const ruleCounts: Record<string, number> = {};
    journal.forEach(j => {
      j.violations.forEach(v => {
        ruleCounts[v] = (ruleCounts[v] || 0) + 1;
      });
    });
    let mostViolated = "없음";
    let maxCount = 0;
    Object.entries(ruleCounts).forEach(([rule, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostViolated = rule;
      }
    });

    return {
      total: journal.length,
      complianceRate,
      avgR,
      stopCompliance,
      noTradeSuccess,
      mostViolated
    };
  }, [journal]);

  return (
    <div className="flex-1 p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <header className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-3 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white glow-blue">
          오늘 볼 종목은 많지 않습니다. 기준에 맞는 3~5개만 남깁니다.
        </h1>
        <p className="text-slate-400 text-sm font-medium">
          시장 → 섹터 → 신고가 후보 → 유동성 → ORB 눌림 지지 순서로 매매 후보를 압축합니다.
        </p>
        <div className="text-xs bg-red-950/40 border border-red-900/60 rounded px-4 py-2 text-red-400 inline-block font-bold">
          ⚠️ 이 시스템은 매수 추천이 아니라 원칙 기반 후보 선별 도구입니다. 최종 매수 판단과 책임은 사용자에게 있습니다.
        </div>
      </header>

      {/* Grid Row 1: Market & Sector Check */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Market Check Section */}
        <section className="trading-card flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-200">1. Market Check</h2>
              <div className="flex gap-2">
                <button onClick={() => applyMarketPreset("bull")} className="px-2 py-1 text-xs bg-green-950 border border-green-800 text-green-400 font-bold rounded">Bullish</button>
                <button onClick={() => applyMarketPreset("neutral")} className="px-2 py-1 text-xs bg-yellow-950 border border-yellow-800 text-yellow-400 font-bold rounded">Mixed</button>
                <button onClick={() => applyMarketPreset("bear")} className="px-2 py-1 text-xs bg-red-950 border border-red-800 text-red-400 font-bold rounded">Bearish</button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs">
                    <th className="pb-2">ETF</th>
                    <th className="pb-2">현재가</th>
                    <th className="pb-2">등락률</th>
                    <th className="pb-2">VWAP 여부</th>
                    <th className="pb-2">방향성</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {marketIndices.map(idx => (
                    <tr key={idx.symbol} className="text-slate-300">
                      <td className="py-2 font-bold">{idx.symbol}</td>
                      <td className="py-2">${idx.price.toFixed(2)}</td>
                      <td className={`py-2 font-bold ${idx.changePercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {idx.changePercent >= 0 ? "+" : ""}{idx.changePercent}%
                      </td>
                      <td className="py-2 text-xs">
                        <span className={`px-2 py-0.5 rounded font-bold ${idx.isAboveVwap ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
                          {idx.isAboveVwap ? "VWAP 위" : "VWAP 아래"}
                        </span>
                      </td>
                      <td className="py-2 text-xs">{idx.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Market Status:</span>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${
                marketStatus.color === "text-green" ? "text-green-500 glow-green" :
                marketStatus.color === "text-yellow" ? "text-yellow-500 glow-yellow" : "text-red-500 glow-red"
              }`}>
                ● {marketStatus.status}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 bg-slate-900/60 p-2 rounded border border-slate-800">
            {marketStatus.description}
          </p>
        </section>

        {/* Sector Strength Section */}
        <section className="trading-card">
          <h2 className="text-lg font-bold text-slate-200 mb-4">2. Sector Strength</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-indigo-950/30 border border-indigo-900/60 rounded-lg p-3">
              <span className="text-xs text-indigo-400 font-bold block mb-1">오늘의 강세 섹터 (Strong)</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {strongSectors.length > 0 ? (
                  strongSectors.map(s => (
                    <span key={s} className="px-2 py-0.5 text-xs bg-green-950 border border-green-800 text-green-400 rounded font-bold">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">강세 섹터 없음</span>
                )}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-xs text-slate-400 font-bold block mb-1">우선 볼 섹터 추천</span>
              <span className="text-sm font-extrabold text-slate-200 block">
                {strongSectors.length > 0 ? `${strongSectors[0]} 관련주 가산점 적용` : "지수 흐름 관망 권장"}
              </span>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[160px]">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="pb-1">ETF (섹터)</th>
                  <th className="pb-1">등락률</th>
                  <th className="pb-1">SPY 상대강도</th>
                  <th className="pb-1">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sectors.slice(0, 8).map(sec => (
                  <tr key={sec.symbol} className="text-slate-300">
                    <td className="py-1.5 font-bold">{sec.symbol} <span className="text-slate-500 font-normal">({sec.name})</span></td>
                    <td className={`py-1.5 ${sec.changePercent >= 0 ? "text-green-500" : "text-red-500"}`}>{sec.changePercent}%</td>
                    <td className="py-1.5">{sec.relativeStrengthVsSPY > 0 ? `+${sec.relativeStrengthVsSPY}` : sec.relativeStrengthVsSPY}</td>
                    <td className="py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                        sec.status === "Strong" ? "bg-green-950 text-green-400" :
                        sec.status === "Weak" ? "bg-red-950 text-red-400" : "bg-slate-800 text-slate-400"
                      }`}>
                        {sec.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Grid Row 2: Screener Results */}
      <section className="trading-card">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-200">3. Screener Results</h2>
            <p className="text-xs text-slate-500">영웅문 글로벌 조건검색(신고가, 거래대금 필터링) 결과를 파싱 및 연동합니다.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <input
              type="text"
              placeholder="CSV 데이터 직접 복사 붙여넣기 (ticker,name,sector,price,change,volume)"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="text-xs flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-300"
            />
            <button onClick={handleCsvUpload} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-bold rounded">
              CSV 파싱
            </button>
          </div>
        </div>

        {/* Input/Add New Row Form */}
        <form onSubmit={handleAddCandidate} className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-4 p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
          <input type="text" placeholder="티커" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} className="text-xs bg-slate-900 border border-slate-800 rounded p-2 text-white" />
          <input type="text" placeholder="종목명" value={newName} onChange={(e) => setNewName(e.target.value)} className="text-xs bg-slate-900 border border-slate-800 rounded p-2 text-white" />
          <select value={newSector} onChange={(e) => setNewSector(e.target.value)} className="text-xs bg-slate-900 border border-slate-800 rounded p-2 text-white">
            {Object.values(SECTOR_MAP).filter((v, i, self) => self.indexOf(v) === i).map(secName => (
              <option key={secName} value={secName}>{secName}</option>
            ))}
            <option value="기타">기타</option>
          </select>
          <input type="number" step="0.01" placeholder="현재가 ($)" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="text-xs bg-slate-900 border border-slate-800 rounded p-2 text-white" />
          <input type="number" step="0.01" placeholder="등락률 (%)" value={newChange} onChange={(e) => setNewChange(e.target.value)} className="text-xs bg-slate-900 border border-slate-800 rounded p-2 text-white" />
          <input type="number" placeholder="거래량" value={newVolume} onChange={(e) => setNewVolume(e.target.value)} className="text-xs bg-slate-900 border border-slate-800 rounded p-2 text-white" />
          <button type="submit" className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded p-2">
            종목 추가
          </button>
        </form>

        {/* Candidates Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs">
                <th className="pb-2">종목</th>
                <th className="pb-2">섹터</th>
                <th className="pb-2">현재가</th>
                <th className="pb-2">등락률</th>
                <th className="pb-2">거래량</th>
                <th className="pb-2">거래대금</th>
                <th className="pb-2">상태</th>
                <th className="pb-2 text-right">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {candidates.map(cand => {
                const isExcluded = cand.price < 10;
                const isWarnVolume = cand.volume < 1000000;
                return (
                  <tr
                    key={cand.ticker}
                    onClick={() => setSelectedTicker(cand.ticker)}
                    className={`cursor-pointer transition-colors ${
                      selectedTicker === cand.ticker ? "bg-indigo-950/20 border-l-2 border-indigo-500" : "hover:bg-slate-900/30"
                    } ${isExcluded ? "opacity-40" : ""}`}
                  >
                    <td className="py-3 font-bold text-slate-200">
                      {cand.ticker} <span className="text-slate-500 text-xs font-normal">({cand.name})</span>
                    </td>
                    <td className="py-3 text-xs text-slate-400">{cand.sector}</td>
                    <td className={`py-3 font-mono ${isExcluded ? "text-red-500 font-bold" : ""}`}>
                      ${cand.price.toFixed(2)}
                    </td>
                    <td className={`py-3 font-bold ${cand.changePercent > 20 ? "text-yellow-500" : cand.changePercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {cand.changePercent >= 0 ? "+" : ""}{cand.changePercent}%
                    </td>
                    <td className={`py-3 font-mono text-xs ${isWarnVolume ? "text-red-400 font-bold" : ""}`}>
                      {cand.volume.toLocaleString()} {isWarnVolume && "⚠️"}
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-300">
                      ${(cand.dollarVolume / 1000000).toFixed(2)}M
                    </td>
                    <td className="py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded font-black ${
                        cand.grade === "A" ? "bg-green-950 text-green-400" :
                        cand.grade === "B" ? "bg-indigo-950 text-indigo-400" :
                        cand.grade === "C" ? "bg-slate-800 text-slate-400" : "bg-red-950 text-red-400"
                      }`}>
                        {cand.grade}등급 ({cand.score}점)
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCandidate(cand.ticker);
                        }}
                        className="text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Grid Row 3: Candidate Scoring & Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidate Scoring Card */}
        <section className="trading-card lg:col-span-1">
          <h2 className="text-lg font-bold text-slate-200 mb-4">4. Candidate Scoring</h2>
          {(() => {
            const activeCand = candidates.find(c => c.ticker === selectedTicker);
            if (!activeCand) return <div className="text-slate-500 text-sm">종목을 선택해 주세요.</div>;
            return (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-sm font-bold text-white block">{activeCand.ticker} ({activeCand.name})</span>
                    <span className="text-xs text-slate-500">{activeCand.sector}</span>
                  </div>
                  <span className={`text-2xl font-black px-3 py-1 rounded ${
                    activeCand.grade === "A" ? "bg-green-950 text-green-400 glow-green" :
                    activeCand.grade === "B" ? "bg-indigo-950 text-indigo-400" : "bg-red-950 text-red-400"
                  }`}>
                    {activeCand.score}점
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">선정 사유 및 점수 가산</span>
                  <ul className="text-xs space-y-1 bg-slate-900/40 border border-slate-800/80 p-3 rounded-lg">
                    {activeCand.reasons.map((r, i) => (
                      <li key={i} className="text-green-400 flex items-start gap-1">
                        <span>✓</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {activeCand.warnings.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block text-red-400">주의 / 감점 요인</span>
                    <ul className="text-xs space-y-1 bg-slate-900/40 border border-red-950/40 p-3 rounded-lg">
                      {activeCand.warnings.map((w, i) => (
                        <li key={i} className="text-red-400 flex items-start gap-1">
                          <span>!</span> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* Watchlist Section */}
        <section className="trading-card lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-200 mb-4">5. Today's Top 3~5 Watchlist</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {watchlist.length > 0 ? (
              watchlist.map((item, idx) => (
                <div
                  key={item.ticker}
                  onClick={() => setSelectedTicker(item.ticker)}
                  className={`cursor-pointer border p-4 rounded-xl space-y-3 transition-all relative ${
                    selectedTicker === item.ticker
                      ? "bg-indigo-950/20 border-indigo-500 shadow-lg shadow-indigo-950/20"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <span className="text-xs text-indigo-400 font-black">#{idx + 1}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      item.grade === "A" ? "bg-green-950 text-green-400" : "bg-indigo-950 text-indigo-400"
                    }`}>
                      {item.grade}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white">{item.ticker}</h3>
                    <p className="text-xs text-slate-500 truncate">{item.name} | {item.sector}</p>
                  </div>

                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">핵심 선정 사유</span>
                    <div className="text-slate-300 space-y-0.5">
                      {item.reasons.slice(0, 3).map((r, i) => (
                        <div key={i} className="truncate">• {r.split("(")[0]}</div>
                      ))}
                    </div>
                  </div>

                  {item.warnings.length > 0 && (
                    <div className="bg-red-950/20 border border-red-900/40 rounded p-2 text-[10px] text-red-400">
                      <strong>주의:</strong> {item.warnings[0]}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center text-slate-500 text-sm py-8">
                80점 이상(A급) 또는 65점 이상(B급) 압축 후보군이 아직 없습니다.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Grid Row 4: ORB Trading Plan & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ORB Trading Plan Section */}
        <section className="trading-card lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-200 mb-4">6. ORB Trading Plan</h2>
          
          <form onSubmit={handleSavePlan} className="space-y-4">
            <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
              <span className="text-sm font-bold text-white">분석 대상: <strong className="text-indigo-400">{selectedTicker || "선택 없음"}</strong></span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold">진입 시간 제한 기준:</span>
                <input 
                  type="text"
                  value={currentTimeStr}
                  onChange={(e) => setCurrentTimeStr(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-xs text-white rounded px-2 py-0.5 w-16 text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-bold">30분 박스 상단 ($)</label>
                <input type="number" step="0.01" value={planRangeHigh} onChange={(e) => setPlanRangeHigh(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-bold">30분 박스 하단 ($)</label>
                <input type="number" step="0.01" value={planRangeLow} onChange={(e) => setPlanRangeLow(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-bold">VWAP 위치 ($)</label>
                <input type="number" step="0.01" value={planVwap} onChange={(e) => setPlanVwap(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-bold">눌림 저점 ($)</label>
                <input type="number" step="0.01" value={planPullbackLow} onChange={(e) => setPlanPullbackLow(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-bold">진입 예정가 ($)</label>
                <input type="number" step="0.01" value={planEntry} onChange={(e) => setPlanEntry(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block font-bold">손절가 ($)</label>
                <input type="number" step="0.01" value={planStop} onChange={(e) => setPlanStop(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white" />
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-bold p-2.5 rounded-lg">
                수식 계산 및 시나리오 갱신
              </button>
            </div>
          </form>

          {/* Computed Results */}
          {currentPlan && (
            <div className="mt-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold block">손절폭 (%)</span>
                <span className={`text-sm font-extrabold ${currentPlan.riskPercent > 5 ? "text-red-500" : "text-slate-200"}`}>
                  {currentPlan.riskPercent}% {currentPlan.riskPercent > 5 && "⚠️"}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold block">1R 익절 목표가</span>
                <span className="text-sm font-extrabold text-green-500">${currentPlan.target1R}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold block">2R 익절 목표가</span>
                <span className="text-sm font-extrabold text-green-500">${currentPlan.target2R}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold block">권장 매수금액 (5천원 리스크)</span>
                <span className="text-sm font-extrabold text-slate-200">
                  {currentPlan.suggestedPositionSize > 0 ? `${currentPlan.suggestedPositionSize.toLocaleString()}원` : "N/A"}
                </span>
              </div>
              <div className="space-y-0.5 col-span-2 md:col-span-1">
                <span className="text-[10px] text-slate-500 font-bold block">최종 판정</span>
                <span className={`text-sm font-black px-2 py-0.5 rounded ${
                  currentPlan.decision === "ENTRY_OK" ? "bg-green-950 text-green-400 glow-green" :
                  currentPlan.decision === "WATCH" ? "bg-yellow-950 text-yellow-400" : "bg-red-950 text-red-400"
                }`}>
                  {currentPlan.decision}
                </span>
              </div>
            </div>
          )}

          {/* Scenario Alerts */}
          <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2 text-xs">
            <span className="font-bold text-slate-400 uppercase tracking-wider block">🚨 시나리오 대응 매뉴얼</span>
            {currentPlan && (
              <div className="space-y-1.5 text-slate-300">
                <p>• <strong>시나리오 1 (눌림 없음)</strong>: 30분 박스 돌파 후 되돌림 지지 없이 계속 오르면 ➡ <span className="text-red-400 font-bold">“추격매수 금지. 내 자리가 아님.”</span></p>
                <p>• <strong>시나리오 2 (눌림 지지)</strong>: 돌파 후 박스 상단(${(currentPlan.openingRangeHigh).toFixed(2)}) 또는 VWAP(${(currentPlan.vwap).toFixed(2)}) 근처에서 양봉 지지 발생 시 ➡ <span className="text-green-400 font-bold">“진입 검토 가능.”</span></p>
                <p>• <strong>시나리오 3 (박스 재진입)</strong>: 돌파 후 다시 박스 안으로 하향 침범 시 ➡ <span className="text-red-500 font-bold">“돌파 실패. 진입 금지/이미 진입했다면 즉시 손절.”</span></p>
                <p>• <strong>시간 및 청산 규칙</strong>: 현재 입력 시각 <strong>{currentTimeStr}</strong> 기준, <strong>23:40</strong> 이후 신규 진입을 전면 금지하며, <strong>23:55 전 전량 당일 청산 완료</strong> 원칙을 준수하세요.</p>
              </div>
            )}
          </div>
        </section>

        {/* Risk Checklist Section */}
        <section className="trading-card lg:col-span-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-200">7. Risk Checklist</h2>
            <span className={`text-xs font-black px-2 py-0.5 rounded ${checklistYesCount >= 10 ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
              {checklistYesCount} / 12 YES
            </span>
          </div>
          
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {RISK_CHECKLIST_ITEMS.map((item, idx) => (
              <label key={item.id} className="flex items-start gap-2.5 p-2 bg-slate-900/40 border border-slate-800/60 rounded cursor-pointer hover:bg-slate-900/60 transition-colors">
                <input
                  type="checkbox"
                  checked={currentChecklist[idx] || false}
                  onChange={() => handleChecklistChange(idx)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800 w-4 h-4"
                />
                <span className="text-xs text-slate-300 leading-normal">{idx + 1}. {item.text}</span>
              </label>
            ))}
          </div>

          <p className="text-[10px] text-slate-500 mt-3 text-center">
            * 최소 10개 이상 요건이 충족(YES)되어야만 ORB Plan에서 진입 승인(ENTRY_OK) 판정이 내려집니다.
          </p>
        </section>
      </div>

      {/* Row 5: Trading Journal & Statistics */}
      <section className="trading-card">
        <h2 className="text-lg font-bold text-slate-200 mb-4">8. Trading Journal</h2>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Add Journal Form */}
          <form onSubmit={handleAddJournal} className="space-y-3 bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl lg:col-span-1 text-xs">
            <span className="font-bold text-slate-300 block mb-2">오늘 매매 복기 작성</span>
            
            <div className="space-y-1">
              <label className="text-slate-400 block font-bold">종목 (Ticker)</label>
              <input type="text" placeholder="예: NVDA" value={journalSymbol} onChange={(e) => setJournalSymbol(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white" />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 block font-bold">조건검색 점수 (Score)</label>
              <input type="number" placeholder="예: 85" value={journalScore} onChange={(e) => setJournalScore(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white" />
            </div>

            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={journalIsTraded} onChange={(e) => setJournalIsTraded(e.target.checked)} className="rounded text-indigo-600 bg-slate-950 border-slate-800" />
              <span className="text-slate-300">실제 진입 매매 완료 건</span>
            </label>

            {journalIsTraded && (
              <div className="space-y-2 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.01" placeholder="진입가" value={journalEntryPrice} onChange={(e) => setJournalEntryPrice(e.target.value)} className="bg-slate-900 border border-slate-800 rounded p-2 text-white w-full" />
                  <input type="number" step="0.01" placeholder="손절가" value={journalStopLoss} onChange={(e) => setJournalStopLoss(e.target.value)} className="bg-slate-900 border border-slate-800 rounded p-2 text-white w-full" />
                </div>
                <input type="number" step="0.01" placeholder="체결 청산가" value={journalResultPrice} onChange={(e) => setJournalResultPrice(e.target.value)} className="bg-slate-900 border border-slate-800 rounded p-2 text-white w-full" />
                
                <select value={journalResultType} onChange={(e) => setJournalResultType(e.target.value as any)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white">
                  <option value="PROFIT_1R">1R 목표 도달</option>
                  <option value="PROFIT_2R">2R 이상 도달</option>
                  <option value="STOP_LOSS">손절 컷아웃</option>
                  <option value="BREAKEVEN">본절 청산</option>
                  <option value="CLEARED_2355">23:55 강제청산</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-slate-400 block font-bold">위반 원칙 체크</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-900/20 p-2 rounded max-h-[100px] overflow-y-auto">
                {["30분 전 진입", "눌림 없이 추격", "손절 미준수", "물타기", "23:55 이후 보유", "하루 2회 이상 진입", "체크리스트 미작성"].map(vRule => (
                  <label key={vRule} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={journalViolations.includes(vRule)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setJournalViolations([...journalViolations, vRule]);
                        } else {
                          setJournalViolations(journalViolations.filter(v => v !== vRule));
                        }
                      }}
                      className="rounded text-indigo-600 bg-slate-950 border-slate-800 w-3 h-3"
                    />
                    <span className="text-[10px] text-slate-300">{vRule}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={journalEmotion} onChange={(e) => setJournalEmotion(e.target.checked)} className="rounded text-indigo-600 bg-slate-950 border-slate-800" />
              <span className="text-slate-300">매매 과정 감정 개입</span>
            </label>

            <textarea placeholder="복기 및 학습 메모 입력" value={journalMemo} onChange={(e) => setJournalMemo(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white h-16 resize-none" />

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-bold p-2.5 rounded-lg">
              일지 저장
            </button>
          </form>

          {/* Journal Entries List & Stats */}
          <div className="lg:col-span-3 space-y-6">
            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">총 매매 일수</span>
                <span className="text-base font-extrabold text-white">{journalStats.total}일</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-indigo-400 font-bold block">원칙 준수율</span>
                <span className="text-base font-extrabold text-indigo-400">{journalStats.complianceRate}%</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">평균 손익비 R</span>
                <span className={`text-base font-extrabold ${journalStats.avgR >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {journalStats.avgR >= 0 ? "+" : ""}{journalStats.avgR}R
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">손절선 준수율</span>
                <span className="text-base font-extrabold text-slate-200">{journalStats.stopCompliance}%</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">무매매 성공 일수</span>
                <span className="text-base font-extrabold text-slate-200">{journalStats.noTradeSuccess}일</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] text-red-400 font-bold block">최다 위반 규칙</span>
                <span className="text-xs font-bold text-red-400 truncate block mt-0.5">{journalStats.mostViolated}</span>
              </div>
            </div>

            {/* Entries list table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="pb-2">날짜</th>
                    <th className="pb-2">종목</th>
                    <th className="pb-2">구분</th>
                    <th className="pb-2">결과</th>
                    <th className="pb-2">수익비</th>
                    <th className="pb-2">위반원칙</th>
                    <th className="pb-2">감정</th>
                    <th className="pb-2 text-right">메모</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {journal.map(j => (
                    <tr key={j.id} className="text-slate-300">
                      <td className="py-2 text-slate-500 font-mono">{j.date}</td>
                      <td className="py-2 font-bold">{j.symbol}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${j.isTraded ? "bg-slate-800 text-slate-200" : "bg-red-950/40 text-red-400"}`}>
                          {j.isTraded ? "매매완료" : "무매매"}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`text-[10px] font-black ${
                          j.resultType === "PROFIT_1R" || j.resultType === "PROFIT_2R" ? "text-green-500" :
                          j.resultType === "STOP_LOSS" ? "text-red-500" : "text-slate-400"
                        }`}>
                          {j.resultType}
                        </span>
                      </td>
                      <td className="py-2 font-mono font-bold">
                        {j.rValue !== undefined ? `${j.rValue >= 0 ? "+" : ""}${j.rValue}R` : "-"}
                      </td>
                      <td className="py-2">
                        {j.violations.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {j.violations.map(v => (
                              <span key={v} className="px-1.5 py-0.5 bg-red-950/40 border border-red-900/60 text-red-400 rounded-[3px] text-[9px] font-bold">
                                {v}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-green-500 font-bold">원칙준수 ✓</span>
                        )}
                      </td>
                      <td className="py-2">
                        {j.emotionInvolved ? (
                          <span className="text-yellow-500 font-bold">개입 ⚠️</span>
                        ) : (
                          <span className="text-slate-500">차분함</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-slate-400 max-w-[200px] truncate" title={j.memo}>
                        {j.memo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
