"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { 
  fetchCandles, 
  CandleData, 
  SUPPORTED_TICKERS, 
  SUPPORTED_TIMEFRAMES,
  GainerInfo,
  fetchGainers,
  getKoreanOrCleanName,
  FmpGainerInfo,
  fetchFmpGainers
} from "../lib/dataProvider";
import { 
  detectBreakoutCandle, 
  detectPeakHigh, 
  calculateFibonacciLevels, 
  getNearInterestLevels,
  FibonacciLevel,
  BreakoutDetectionResult,
  PeakDetectionResult,
  detectPeakHighAll,
  detectBreakoutCandleOnDate,
  getLocalDateString,
  calculateMomentumScore,
  calculateBounceChecklist,
  calculateRiskRewardTable,
  getBestEntryCandidate,
  ScoreBreakdown,
  BounceChecklist,
  RiskRewardRow,
  BestEntryResult,
  calculateRSI,
  calculateSectorLeadership,
  SectorStats,
  calculateVWAP,
  calculateEMA
} from "../lib/fibonacci";

// Prevent SSR for TradingChart
const TradingChart = dynamic(() => import("./TradingChart"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#11151d] text-[#94a3b8]">
      <div className="loading-spinner"></div>
      <span className="ml-3 text-sm font-medium">차트 라이브러리 로딩 중...</span>
    </div>
  ),
});

export default function TradingDashboard() {
  const [ticker, setTicker] = useState("TSLA");
  const [timeframe, setTimeframe] = useState("5m"); // 기본 타임프레임 5분봉 세팅
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // FMP & Sector Leadership states
  const [activeView, setActiveView] = useState<"sector" | "chart" | "proStrategy">("chart"); // 기본 뷰를 차트로 설정하여 기존 분석 도구가 먼저 노출되도록 복구
  const [selectedStrategy, setSelectedStrategy] = useState<"breakout" | "vwap" | "fibonacci">("breakout");
  const [fmpGainers, setFmpGainers] = useState<FmpGainerInfo[]>([]);
  const [candlesMap, setCandlesMap] = useState<Record<string, CandleData[]>>({});
  const [sectorStats, setSectorStats] = useState<SectorStats[]>([]);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  
  const [gainerFilter, setGainerFilter] = useState<"all" | "5m" | "10m">("all");
  const [gainerAnalyses, setGainerAnalyses] = useState<Record<string, { score: ScoreBreakdown; currentPrice: number }>>({});
  const [isGainersLoading, setIsGainersLoading] = useState(false);
  const [isScannerCollapsed, setIsScannerCollapsed] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isBeginnerGuideExpanded, setIsBeginnerGuideExpanded] = useState(false);

  // Price lock state for order book guide
  const [lockedPrices, setLockedPrices] = useState<Record<string, { entryZone: string; tp1: number; tp2: number; sl: number; lockedAt: number }>>({});

  // Manual configuration mode
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualStartCandleTime, setManualStartCandleTime] = useState<number | null>(null);

  // Computed states
  const [breakoutResult, setBreakoutResult] = useState<BreakoutDetectionResult | null>(null);
  const [peakResult, setPeakResult] = useState<PeakDetectionResult | null>(null);
  const [fibLevels, setFibLevels] = useState<FibonacciLevel[]>([]);
  const [nearLevels, setNearLevels] = useState<FibonacciLevel[]>([]);

  // Advanced Analysis states
  const [momentumScore, setMomentumScore] = useState<ScoreBreakdown | null>(null);
  const [bounceChecklist, setBounceChecklist] = useState<BounceChecklist>({});
  const [rrRows, setRrRows] = useState<RiskRewardRow[]>([]);
  const [bestEntry, setBestEntry] = useState<BestEntryResult | null>(null);
  const [currentRsi, setCurrentRsi] = useState<number | null>(null);

  // User interaction: highlight TP lines for a specific fib level
  const [selectedFibLevelForTP, setSelectedFibLevelForTP] = useState<number | null>(null);

  // 1.1 Fetch Gainers & Perform Background Analysis
  const loadGainersAndAnalyze = useCallback(async () => {
    setIsGainersLoading(true);
    try {
      const gainerList = await fetchFmpGainers(30); // FMP 실시간 게이너 30개 수집
      setFmpGainers(gainerList);
      setScannerError(null);

      const analyses: Record<string, { score: ScoreBreakdown; currentPrice: number }> = {};
      const newCandlesMap: Record<string, CandleData[]> = {};

      // 과도한 병렬 API 요청으로 인한 브라우저 커넥션 풀 마비 및 야후 API 차단을 방지하기 위해,
      // 당일 가장 거래대금과 상승률이 높은 상위 10개 핵심 종목만 백그라운드에서 정밀분석(캔들 수집)을 진행합니다.
      // 순차적으로 150ms 딜레이를 주며 페칭하여 메인 차트 캔들 요청이 즉시 최우선으로 완료되도록 네트워크 대역폭을 보장합니다.
      const targetList = gainerList.slice(0, 10);

      for (const g of targetList) {
        try {
          const data = await fetchCandles(g.symbol, "5m");
          if (data.length === 0) continue;

          newCandlesMap[g.symbol] = data;

          const lastIdx = data.length - 1;
          const currentPrice = data[lastIdx].close;

          const lastCandle = data[lastIdx];
          let todayStr = getLocalDateString(lastCandle.time);
          let todayCandles = data.filter(c => getLocalDateString(c.time) === todayStr);

          if (todayCandles.length < 10 && data.length > 20) {
            let prevDateStr = todayStr;
            for (let i = data.length - 1; i >= 0; i--) {
              const dStr = getLocalDateString(data[i].time);
              if (dStr !== todayStr) {
                prevDateStr = dStr;
                break;
              }
            }
            todayStr = prevDateStr;
          }

          let todayStartIdx = -1;
          let todayEndIdx = data.length - 1;
          for (let i = 0; i < data.length; i++) {
            if (getLocalDateString(data[i].time) === todayStr) {
              todayStartIdx = i;
              break;
            }
          }
          for (let i = data.length - 1; i >= 0; i--) {
            if (getLocalDateString(data[i].time) === todayStr) {
              todayEndIdx = i;
              break;
            }
          }

          if (todayStartIdx === -1) {
            todayStartIdx = Math.max(0, data.length - 60);
            todayEndIdx = data.length - 1;
          }

          let peakHigh = data[todayStartIdx].high;
          let peakIdx = todayStartIdx;
          for (let i = todayStartIdx + 1; i <= todayEndIdx; i++) {
            if (data[i].high > peakHigh) {
              peakHigh = data[i].high;
              peakIdx = i;
            }
          }

          let startLow = data[todayStartIdx].low;
          let startIdx = todayStartIdx;
          for (let i = todayStartIdx + 1; i <= peakIdx; i++) {
            if (data[i].low < startLow) {
              startLow = data[i].low;
              startIdx = i;
            }
          }

          const levels = calculateFibonacciLevels(startLow, peakHigh);
          const score = calculateMomentumScore(data, levels, startIdx, peakIdx);

          analyses[g.symbol] = {
            score,
            currentPrice,
          };

          // API 요청 간에 150ms 딜레이를 부여하여 야후 파이낸스 서버가 락을 걸지 않게 유도
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (err) {
          console.error(`Background analysis failed for ${g.symbol}:`, err);
        }
      }

      setCandlesMap(prev => ({ ...prev, ...newCandlesMap }));
      setGainerAnalyses(analyses);

      // Sector leadership 연산
      const stats = calculateSectorLeadership(gainerList, { ...candlesMap, ...newCandlesMap });
      setSectorStats(stats);
      
      // 첫 진입 시 혹은 선택 섹터가 없을 때 첫 번째 섹터 기본 선택
      setSelectedSector(prev => {
        if (prev) return prev;
        return stats.length > 0 ? stats[0].sector : null;
      });
    } catch (error: any) {
      console.error("Failed to load or analyze gainers:", error);
      setScannerError(error.message || "FMP API 연동 실패");
    } finally {
      setIsGainersLoading(false);
    }
  }, [candlesMap]);

  // Poll gainers list every 30 seconds
  useEffect(() => {
    loadGainersAndAnalyze();
    const intervalId = setInterval(() => {
      loadGainersAndAnalyze();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [loadGainersAndAnalyze]);

  // 1. Fetch Candles with Live Polling (5 seconds interval)
  useEffect(() => {
    let isMounted = true;
    let timerId: NodeJS.Timeout;

    async function loadData(isInitial = false) {
      if (isInitial && isMounted) {
        setIsLoading(true);
      }
      try {
        const data = await fetchCandles(ticker, timeframe);
        if (isMounted) {
          setCandles(data);
          if (isInitial) {
            setManualStartCandleTime(null);
            setIsManualMode(false);
            setSelectedFibLevelForTP(null); // Reset highlighted level on symbol/timeframe changes
          }
        }
      } catch (error) {
        console.error("Failed to load candles:", error);
      } finally {
        if (isInitial && isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData(true);

    timerId = setInterval(() => {
      loadData(false);
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(timerId);
    };
  }, [ticker, timeframe]);

  // 2. Perform Breakout Detection, Fibonacci, and Advanced Analysis
  useEffect(() => {
    if (candles.length === 0) return;

    let startIdx: number | null = null;
    let autoResult: BreakoutDetectionResult | null = null;
    let peakRes: PeakDetectionResult | null = null;

    if (manualStartCandleTime !== null) {
      const foundIdx = candles.findIndex((c) => c.time === manualStartCandleTime);
      if (foundIdx !== -1) {
        startIdx = foundIdx;
        peakRes = detectPeakHigh(candles, startIdx);
        setPeakResult(peakRes);
      }
    } else {
      try {
        const lastCandle = candles[candles.length - 1];
        let todayStr = getLocalDateString(lastCandle.time);

        // Extract today's candles
        let todayCandles = candles.filter(c => getLocalDateString(c.time) === todayStr);

        // If today is a market holiday (or early pre-market) with sparse data (less than 10 candles)
        if (todayCandles.length < 10 && candles.length > 20) {
          let prevDateStr = todayStr;
          for (let i = candles.length - 1; i >= 0; i--) {
            const dStr = getLocalDateString(candles[i].time);
            if (dStr !== todayStr) {
              prevDateStr = dStr;
              break;
            }
          }
          // Shift analysis target date to the most recent active trading day (e.g. yesterday)
          todayStr = prevDateStr;
        }

        // Find the start index for target active trading day
        let todayStartIdx = -1;
        let todayEndIdx = candles.length - 1;
        
        for (let i = 0; i < candles.length; i++) {
          if (getLocalDateString(candles[i].time) === todayStr) {
            todayStartIdx = i;
            break;
          }
        }

        // Limit todayEndIdx to the last candle of that target day to exclude newer sparse candles
        for (let i = candles.length - 1; i >= 0; i--) {
          if (getLocalDateString(candles[i].time) === todayStr) {
            todayEndIdx = i;
            break;
          }
        }

        // Final fallback if index was not found
        if (todayStartIdx === -1) {
          todayStartIdx = Math.max(0, candles.length - 60);
          todayEndIdx = candles.length - 1;
        }

        // 1. Detect Peak High within the target trading day
        let peakHigh = candles[todayStartIdx].high;
        let peakIdx = todayStartIdx;

        for (let i = todayStartIdx + 1; i <= todayEndIdx; i++) {
          if (candles[i].high > peakHigh) {
            peakHigh = candles[i].high;
            peakIdx = i;
          }
        }

        // 2. Detect Start Low (minimum low before the peak high occurred on that day)
        let startLow = candles[todayStartIdx].low;
        let startIdxTemp = todayStartIdx;

        for (let i = todayStartIdx + 1; i <= peakIdx; i++) {
          if (candles[i].low < startLow) {
            startLow = candles[i].low;
            startIdxTemp = i;
          }
        }

        startIdx = startIdxTemp;
        peakRes = {
          index: peakIdx,
          price: peakHigh,
        };
        
        setPeakResult(peakRes);
        setBreakoutResult({
          index: startIdx,
          candle: candles[startIdx],
          low: startLow,
        });
      } catch (e) {
        console.error("당일 자동 피보나치 감지 실패:", e);
        setBreakoutResult(null);
        setPeakResult(null);
      }
    }

    const lastIdx = candles.length - 1;
    const currentPrice = candles[lastIdx].close;

    // RSI(14)
    const rsiVal = calculateRSI(candles, 14);
    if (rsiVal.length > 0) {
      setCurrentRsi(rsiVal[rsiVal.length - 1]);
    }

    if (startIdx !== null && startIdx >= 0 && startIdx < candles.length && peakRes) {
      const lowPrice = candles[startIdx].low;
      const highPrice = peakRes.price;

      // 2.1 Calculate Fibonacci Levels
      const levels = calculateFibonacciLevels(lowPrice, highPrice);
      setFibLevels(levels);

      // 2.2 Alert Levels Check
      const near = getNearInterestLevels(currentPrice, levels, 0.5);
      setNearLevels(near);

      // 2.3 Calculate Momentum Score
      const score = calculateMomentumScore(candles, levels, startIdx, peakRes.index);
      setMomentumScore(score);

      // 2.4 Calculate Bounce Checklist
      const checklist = calculateBounceChecklist(candles, levels, startIdx);
      setBounceChecklist(checklist);

      // 2.5 Calculate Risk Reward Table
      const rrTable = calculateRiskRewardTable(currentPrice, levels);
      setRrRows(rrTable);

      // 2.6 Select Best Entry Candidate
      const best = getBestEntryCandidate(currentPrice, levels, checklist, rrTable, score.total);
      setBestEntry(best);
    } else {
      setFibLevels([]);
      setNearLevels([]);
      setMomentumScore(null);
      setBounceChecklist({});
      setRrRows([]);
      setBestEntry(null);
    }
  }, [candles, manualStartCandleTime]);

  // Auto-fill search box with selected ticker name
  useEffect(() => {
    const selected = SUPPORTED_TICKERS.find((t) => t.symbol === ticker);
    if (selected) {
      setSearchQuery(`${selected.symbol} - ${getKoreanOrCleanName(selected.symbol, selected.name)}`);
    } else {
      setSearchQuery(ticker);
    }
  }, [ticker]);

  const handleTickerSelect = (symbol: string) => {
    setTicker(symbol);
    setShowDropdown(false);
    if (activeView !== "proStrategy") {
      setActiveView("chart"); // 차트 뷰로 즉시 전환
    }
  };

  const handleSearchSubmit = () => {
    if (!searchQuery.trim()) return;
    const cleanSymbol = searchQuery.split("-")[0].trim().toUpperCase();
    if (cleanSymbol) {
      setTicker(cleanSymbol);
      setShowDropdown(false);
      if (activeView !== "proStrategy") {
        setActiveView("chart");
      }
    }
  };

  const handleManualCandleSelect = useCallback((index: number) => {
    if (isManualMode && candles[index]) {
      setManualStartCandleTime(candles[index].time);
      setIsManualMode(false);
    }
  }, [isManualMode, candles]);

  const resetToAuto = () => {
    setManualStartCandleTime(null);
    setIsManualMode(false);
    setSelectedFibLevelForTP(null);
  };

  const handleTogglePriceLock = (symbol: string, strategy: string, currentStratInfo: any) => {
    const key = `${symbol}-${strategy}`;
    setLockedPrices((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      } else {
        return {
          ...prev,
          [key]: {
            entryZone: currentStratInfo.entryZone,
            tp1: currentStratInfo.tp1,
            tp2: currentStratInfo.tp2,
            sl: currentStratInfo.sl,
            lockedAt: Date.now()
          }
        };
      }
    });
  };

  // Click on row of Fibonacci Risk Reward table
  const handleFibRowClick = (level: number) => {
    if (selectedFibLevelForTP === level) {
      setSelectedFibLevelForTP(null); // toggle off
    } else {
      setSelectedFibLevelForTP(level); // highlight
    }
  };

  const activeStartIndex = manualStartCandleTime !== null ? candles.findIndex((c) => c.time === manualStartCandleTime) : (breakoutResult?.index ?? null);
  const startPrice = activeStartIndex !== null && activeStartIndex !== undefined && activeStartIndex !== -1 && candles[activeStartIndex] ? candles[activeStartIndex].low : null;
  const peakPrice = peakResult ? peakResult.price : null;
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;
  const detectionStatus = manualStartCandleTime !== null 
    ? "manual" 
    : breakoutResult 
      ? "auto" 
      : "failed";

  // RSI status and color
  const getRsiStatus = (rsi: number) => {
    if (rsi > 70) return { label: "과열 경고", color: "text-red" };
    if (rsi >= 50) return { label: "강세 유지", color: "text-green" };
    if (rsi >= 45) return { label: "중립 / 약화 구간", color: "text-yellow" };
    return { label: "약세 주의", color: "text-red" };
  };

  const rsiStatus = currentRsi !== null ? getRsiStatus(currentRsi) : null;

  // Score status color
  const getScoreGradeColor = (score: number) => {
    if (score >= 80) return "grade-strong";
    if (score >= 65) return "grade-good";
    if (score >= 50) return "grade-neutral";
    if (score >= 35) return "grade-weak";
    return "grade-risk";
  };

  // Filter gainers based on user select
  const filteredGainers = fmpGainers.filter((g) => {
    const analysis = gainerAnalyses[g.symbol];
    const valueUsd = g.valueUsd || (analysis ? analysis.score.valueUsd : (g.volume * g.price));

    if (gainerFilter === "5m") {
      return valueUsd >= 5000000;
    }
    if (gainerFilter === "10m") {
      return valueUsd >= 10000000;
    }
    return true; 
  });

  // Sort gainers:
  // 1. 거래대금 $100만 미만은 제외 대상이므로 맨 뒤로 보냄
  // 2. 거래량 패턴이 합격한 종목들을 최상단으로 우선 배치
  // 3. 그 안에서는 Momentum Score(총점) 순서로 정렬
  const sortedGainers = [...filteredGainers].sort((a, b) => {
    const anaA = gainerAnalyses[a.symbol];
    const anaB = gainerAnalyses[b.symbol];
    
    const valA = a.valueUsd || (anaA ? anaA.score.valueUsd : (a.volume * a.price));
    const valB = b.valueUsd || (anaB ? anaB.score.valueUsd : (b.volume * b.price));

    const isExcludeA = valA < 1000000;
    const isExcludeB = valB < 1000000;

    if (isExcludeA && !isExcludeB) return 1;
    if (!isExcludeA && isExcludeB) return -1;

    const passA = anaA ? anaA.score.volumePatternPassed : false;
    const passB = anaB ? anaB.score.volumePatternPassed : false;
    if (passA && !passB) return -1;
    if (!passA && passB) return 1;

    const scoreA = anaA ? anaA.score.total : 0;
    const scoreB = anaB ? anaB.score.total : 0;
    return scoreB - scoreA;
  });

  const getStrategyData = (symbol: string, strategy: "breakout" | "vwap" | "fibonacci") => {
    const candles = candlesMap[symbol] || [];
    const gainer = fmpGainers.find(g => g.symbol === symbol);
    const analysis = gainerAnalyses[symbol];
    
    const valueUsd = gainer ? gainer.valueUsd : (analysis ? analysis.score.valueUsd : 0);
    const rvol = gainer ? gainer.rvol : 1.0;
    const currentPrice = gainer ? gainer.price : (analysis ? analysis.currentPrice : 0);
    const rawName = gainer ? gainer.name : symbol;

    let score = 0;
    let entryZone = "";
    let tp1 = 0;
    let tp2 = 0;
    let sl = 0;
    let statusText = "대기";
    let statusColor = "text-muted";
    
    if (candles.length > 5 && currentPrice > 0) {
      const lastIdx = candles.length - 1;
      const lastCandle = candles[lastIdx];
      
      // Find daily high and low
      const todayStr = getLocalDateString(lastCandle.time);
      let todayStartIdx = candles.findIndex((c) => getLocalDateString(c.time) === todayStr);
      if (todayStartIdx === -1) todayStartIdx = Math.max(0, candles.length - 60);
      
      let peakHigh = candles[todayStartIdx].high;
      let peakIdx = todayStartIdx;
      for (let i = todayStartIdx + 1; i < candles.length; i++) {
        if (candles[i].high > peakHigh) {
          peakHigh = candles[i].high;
          peakIdx = i;
        }
      }
      
      let startLow = candles[todayStartIdx].low;
      for (let i = todayStartIdx + 1; i <= peakIdx; i++) {
        if (candles[i].low < startLow) {
          startLow = candles[i].low;
        }
      }

      const vwap = calculateVWAP(candles);
      const ema9 = calculateEMA(candles, 9)[lastIdx];
      const ema20 = calculateEMA(candles, 20)[lastIdx];
      
      const rsiVal = calculateRSI(candles, 14);
      const rsi = rsiVal.length > 0 ? rsiVal[rsiVal.length - 1] : 50;

      const fibLevels = calculateFibonacciLevels(startLow, peakHigh);
      const fib050 = fibLevels.find(l => l.level === 0.500)?.price || (startLow + peakHigh) / 2;
      const fib0618 = fibLevels.find(l => l.level === 0.618)?.price || (startLow + (peakHigh - startLow) * 0.382);
      const fib0786 = fibLevels.find(l => l.level === 0.786)?.price || (startLow + (peakHigh - startLow) * 0.214);

      if (strategy === "breakout") {
        sl = ema9;
        if (sl >= currentPrice) sl = currentPrice * 0.985;
        const risk = currentPrice - sl;
        tp1 = currentPrice + risk * 1.5;
        tp2 = peakHigh * 1.05;
        entryZone = `$${peakHigh.toFixed(2)} ~ $${(peakHigh * 1.01).toFixed(2)}`;

        if (rvol >= 3.0) score += 35;
        else if (rvol >= 1.5) score += 20;
        if (currentPrice > ema9 && ema9 > ema20) score += 25;

        const distPercent = ((peakHigh - currentPrice) / currentPrice) * 100;
        if (currentPrice >= peakHigh) {
          score += 40;
          statusText = "돌파 완료 🔥";
          statusColor = "text-green";
        } else if (distPercent <= 1.5) {
          score += 35;
          statusText = "돌파 임박 ⚡";
          statusColor = "text-yellow";
        } else if (distPercent <= 5) {
          score += 20;
          statusText = "추세 추종 📈";
          statusColor = "text-accent";
        } else {
          score += 5;
          statusText = "대기 관찰";
          statusColor = "text-muted";
        }
        if (valueUsd < 5000000) score -= 15;
      } 
      else if (strategy === "vwap") {
        sl = vwap * 0.99;
        if (sl >= currentPrice) sl = currentPrice * 0.985;
        const risk = currentPrice - sl;
        tp1 = currentPrice + risk * 2.0;
        tp2 = peakHigh;
        entryZone = `$${vwap.toFixed(2)} ~ $${(vwap * 1.015).toFixed(2)}`;

        if (rvol >= 2.0) score += 30;
        if (valueUsd >= 5000000) score += 15;

        const distFromVwap = ((currentPrice - vwap) / vwap) * 100;
        if (currentPrice >= vwap && distFromVwap <= 1.5) {
          score += 55;
          statusText = "진입권 진입 🎯";
          statusColor = "text-green";
        } else if (currentPrice >= vwap && distFromVwap <= 4.0) {
          score += 30;
          statusText = "조정 대기";
          statusColor = "text-yellow";
        } else if (currentPrice < vwap) {
          score += 5;
          statusText = "이탈 경계 ⚠️";
          statusColor = "text-red";
        } else {
          score += 15;
          statusText = "이격 과다";
          statusColor = "text-muted";
        }
      } 
      else {
        sl = fib0786 * 0.99;
        if (sl >= currentPrice) sl = currentPrice * 0.985;
        tp1 = peakHigh;
        tp2 = peakHigh + (peakHigh - startLow) * 0.618;
        entryZone = `$${fib0618.toFixed(2)} ~ $${fib050.toFixed(2)}`;

        if (rvol >= 2.0) score += 20;
        if (rsi >= 40 && rsi <= 58) score += 20;

        const isInsideFibZone = currentPrice >= fib0618 && currentPrice <= (fib050 * 1.01);
        if (isInsideFibZone) {
          score += 60;
          statusText = "되돌림 진입 🎯";
          statusColor = "text-green";
        } else if (currentPrice > fib050) {
          score += 30;
          statusText = "조정 대기";
          statusColor = "text-yellow";
        } else if (currentPrice < fib0618 && currentPrice >= fib0786) {
          score += 25;
          statusText = "과매도 지지";
          statusColor = "text-accent";
        } else {
          score += 5;
          statusText = "추세 이탈";
          statusColor = "text-red";
        }
      }
    } else {
      entryZone = `$${(currentPrice * 0.995).toFixed(2)} ~ $${(currentPrice * 1.005).toFixed(2)}`;
      sl = currentPrice * 0.985;
      tp1 = currentPrice * 1.03;
      tp2 = currentPrice * 1.06;
      score = 30;
      statusText = "분석 대기";
    }

    score = Math.min(100, Math.max(0, Math.round(score)));

    return {
      score,
      entryZone,
      tp1,
      tp2,
      sl,
      statusText,
      statusColor,
      currentPrice,
      rawName
    };
  };

  // 3대 전략 매칭 랭킹 데이터 메모이제이션 (성능 병목 해결)
  const rankedStrategyData = useMemo(() => {
    const data = fmpGainers.map((g) => {
      const strat = getStrategyData(g.symbol, selectedStrategy);
      return {
        symbol: g.symbol,
        name: strat.rawName,
        price: strat.currentPrice,
        changePercent: g.changePercent,
        valueUsd: g.valueUsd || (g.volume * g.price),
        rvol: g.rvol,
        score: strat.score,
        statusText: strat.statusText,
        statusColor: strat.statusColor
      };
    });

    // Sort by Strategy Fit Score descending
    return data.sort((a, b) => b.score - a.score || b.valueUsd - a.valueUsd);
  }, [fmpGainers, selectedStrategy, gainerAnalyses, candlesMap]);

  return (
    <div className="dashboard-container">
      {/* Disclaimer Banner */}
      <div className="disclaimer-banner">
        ⚠️ 본 프로그램은 투자 추천이 아닌 데이터 기반 분석 보조 도구입니다. 실제 주문 및 매매는 토스증권, 영웅문 글로벌, 카카오증권 등 공인 브로커리지를 통해 사용자의 책임 하에 진행해 주시기 바랍니다.
      </div>

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-logo">
          <span className="logo-icon">📊</span>
          <div className="logo-text-group">
            <h1>Fibonacci Breakout Analyzer</h1>
            <p className="subtitle">급등주 단기 눌림반등 분석 시스템</p>
          </div>
          <span className="logo-badge">PRO v2.0</span>
        </div>

        {/* Navigation Tabs */}
        <div className="header-nav-tabs">
          <button 
            className={`nav-tab-btn ${activeView === "chart" ? "active" : ""}`}
            onClick={() => setActiveView("chart")}
          >
            📈 차트 분석 도구
          </button>
          <button 
            className={`nav-tab-btn ${activeView === "sector" ? "active" : ""}`}
            onClick={() => setActiveView("sector")}
          >
            🏆 주도 섹터 & 대장주
          </button>
          <button 
            className={`nav-tab-btn ${activeView === "proStrategy" ? "active" : ""}`}
            onClick={() => setActiveView("proStrategy")}
          >
            🔥 고수들의 단타 전략
          </button>
        </div>

        {/* Ticker Search & Dropdown */}
        <div className="search-timeframe-row">
          <div className="ticker-search-container">
            <input
              ref={inputRef}
              type="text"
              className="ticker-search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearchSubmit();
                }
              }}
              placeholder="종목코드 입력..."
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => {
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                title="지우기"
              >
                ✕
              </button>
            )}
            {showDropdown && (
              <div className="ticker-dropdown">
                {SUPPORTED_TICKERS.filter(
                  (t) =>
                    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.name.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((t) => (
                  <div
                    key={t.symbol}
                    className={`ticker-item ${t.symbol === ticker ? "active" : ""}`}
                    onClick={() => handleTickerSelect(t.symbol)}
                  >
                    <span className="ticker-sym">{t.symbol}</span>
                    <span className="ticker-nm">{getKoreanOrCleanName(t.symbol, t.name)}</span>
                  </div>
                ))}
              </div>
            )}
            {showDropdown && (
              <div className="dropdown-overlay" onClick={() => setShowDropdown(false)} />
            )}
          </div>

          {/* Timeframe Selection */}
          <div className="timeframe-group">
            {SUPPORTED_TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                className={`timeframe-btn ${timeframe === tf.value ? "active" : ""}`}
                onClick={() => setTimeframe(tf.value)}
              >
                {tf.value}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className={`dashboard-grid ${isScannerCollapsed ? "scanner-collapsed" : ""} ${isSidebarExpanded ? "sidebar-expanded" : ""}`}>
        {isScannerCollapsed && (
          <div 
            className="scanner-expand-handle"
            onClick={() => setIsScannerCollapsed(false)}
            title="실시간 급등 스캐너 펼치기"
          >
            ▶
          </div>
        )}

        {/* Leftmost Sidebar: Real-time Gainers Scanner */}
        <section className="scanner-sidebar">
          <div className="scanner-header">
            <div className="title-row">
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <h3>실시간 급등 스캐너 ⚡</h3>
                <button 
                  className="collapse-sidebar-btn" 
                  onClick={() => setIsScannerCollapsed(true)} 
                  title="스캐너 접기"
                >
                  ◀
                </button>
              </div>
              <button 
                className="refresh-btn" 
                onClick={loadGainersAndAnalyze} 
                disabled={isGainersLoading}
                title="새로고침"
              >
                {isGainersLoading ? "⏳" : "🔄"}
              </button>
            </div>
            {/* Filter Tabs */}
            <div className="scanner-filter-tabs">
              <button 
                className={`filter-tab ${gainerFilter === "all" ? "active" : ""}`}
                onClick={() => setGainerFilter("all")}
              >
                전체
              </button>
              <button 
                className={`filter-tab ${gainerFilter === "5m" ? "active" : ""}`}
                onClick={() => setGainerFilter("5m")}
              >
                $500만+
              </button>
              <button 
                className={`filter-tab ${gainerFilter === "10m" ? "active" : ""}`}
                onClick={() => setGainerFilter("10m")}
              >
                $1,000만+
              </button>
            </div>
          </div>

          <div className="scanner-list-container">
            {scannerError ? (
              <div className="scanner-error-panel">
                <span className="error-icon">⚠️</span>
                <p className="error-msg">FMP API 연동 오류</p>
                <p className="error-tip">프로젝트 루트 폴더에 <code>.env.local</code> 파일을 생성하고 <code>FMP_API_KEY</code>를 등록해 주세요.</p>
                <button className="retry-btn" onClick={loadGainersAndAnalyze}>🔄 다시 시도</button>
              </div>
            ) : isGainersLoading && fmpGainers.length === 0 ? (
              <div className="scanner-loading">
                <div className="loading-spinner"></div>
                <p>급등 종목 분석 중...</p>
              </div>
            ) : sortedGainers.length === 0 ? (
              <div className="scanner-empty">조건에 맞는 급등 종목이 없습니다.</div>
            ) : (
              <div className="scanner-list">
                {sortedGainers.map((g) => {
                  const analysis = gainerAnalyses[g.symbol];
                  const score = analysis ? analysis.score.total : null;
                  const valueUsd = analysis ? analysis.score.valueUsd : (g.volume * g.price);
                  const isExclude = valueUsd < 1000000;
                  const valueGrade = analysis ? analysis.score.valueGrade : (valueUsd >= 10000000 ? "우수" : valueUsd >= 5000000 ? "보통" : valueUsd >= 1000000 ? "관망" : "제외");
                  const volPass = analysis ? analysis.score.volumePatternPassed : false;
                  const volStatus = analysis ? analysis.score.volumePatternStatus : "분석중";

                  return (
                    <div 
                      key={g.symbol} 
                      className={`scanner-item ${g.symbol === ticker ? "active" : ""} ${isExclude ? "exclude" : ""}`}
                      onClick={() => handleTickerSelect(g.symbol)}
                    >
                      <div className="item-main-row">
                        <span className="item-symbol">{g.symbol}</span>
                        <span className={`item-change ${g.changePercent >= 0 ? "text-green" : "text-red"}`}>
                          +{g.changePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="item-sub-row">
                        <span className="item-name">{getKoreanOrCleanName(g.symbol, g.name)}</span>
                        <span className="item-price">${g.price.toFixed(4)}</span>
                      </div>
                      
                      <div className="item-stats-row">
                        <span className={`value-badge grade-${valueGrade}`}>
                          대금: ${(valueUsd / 1000000).toFixed(2)}M
                        </span>
                        
                        {analysis ? (
                          <>
                            <span className={`vol-pattern-badge ${volPass ? "pass" : "fail"}`} title={volStatus}>
                              거래량: {volPass ? "합격" : "미흡"}
                            </span>
                            <span className="item-score" title="모멘텀 점수">
                              점수: <span className="font-bold text-accent">{score}</span>
                            </span>
                          </>
                        ) : (
                          <span className="item-analyzing">데이터 연산 중...</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {activeView === "sector" ? (
          <>
            {/* Center Area: Sector Leadership Card List */}
            <div className="sector-leadership-container">
              <div className="section-title-row">
                <h2>실시간 주도 테마 랭킹 🏆</h2>
                <span className="subtitle">거래량, 등락률, 밀집도 기반 테마 주도 점수</span>
              </div>
              
              <div className="sector-grid">
                {sectorStats.map((stat, idx) => {
                  const leader = stat.candidates.length > 0 ? stat.candidates[0] : null;
                  return (
                    <div 
                      key={stat.sector}
                      className={`sector-card ${selectedSector === stat.sector ? "active" : ""}`}
                      onClick={() => setSelectedSector(stat.sector)}
                    >
                      <div className="sector-card-header">
                        <div className="sector-title-group">
                          <span className="sector-rank-badge">No.{idx + 1}</span>
                          <span className="sector-name">{stat.sector}</span>
                        </div>
                        <span className={`sector-score-badge ${stat.score >= 70 ? "strong" : stat.score >= 40 ? "neutral" : "weak"}`}>
                          {stat.score}점
                        </span>
                      </div>
                      
                      <div className="sector-card-body">
                        <div className="metric">
                          <span className="lbl">평균 등락률</span>
                          <span className={`val ${stat.avgChangePercent >= 0 ? "text-green" : "text-red"}`}>
                            +{stat.avgChangePercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="metric">
                          <span className="lbl">급등 종목 수</span>
                          <span className="val">{stat.gainerCount}개</span>
                        </div>
                        <div className="metric">
                          <span className="lbl">총 거래대금</span>
                          <span className="val">${(stat.totalValueUsd / 1000000).toFixed(2)}M</span>
                        </div>
                        {leader && (
                          <div className="sector-card-leader-summary">
                            <span className="leader-lbl">👑 주도 대장주</span>
                            <span className="leader-sym text-accent">
                              {leader.symbol} <span className={leader.changePercent >= 0 ? "text-green" : "text-red"}>({leader.changePercent >= 0 ? "+" : ""}{leader.changePercent.toFixed(2)}%)</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {sectorStats.length === 0 && (
                  <div className="empty-panel">테마 통계 데이터를 연산할 수 없습니다.</div>
                )}
              </div>
            </div>

            {/* Right Area: Selected Sector Leader Candidates & Gainers breakdown */}
            <aside className="sector-leaders-sidebar">
              {(() => {
                const currentSectorData = sectorStats.find(s => s.sector === selectedSector);
                const candidates = currentSectorData ? currentSectorData.candidates : [];
                const primaryLeader = candidates.length > 0 ? candidates[0] : null;
                const keyStocks = candidates.slice(1).filter(c => c.score >= 3);
                const themeGainers = candidates.slice(1).filter(c => c.score < 3);

                return (
                  <>
                    <div className="section-title-row border-bottom">
                      <h2>{selectedSector ? `[${selectedSector}] 테마 분석` : "테마 분석"} 👑</h2>
                      <span className="subtitle">대장주 판별 조건 및 주도 강세 구분</span>
                    </div>

                    {!selectedSector ? (
                      <div className="empty-panel">좌측 테마 목록에서 테마를 선택해 주세요.</div>
                    ) : (
                      <div className="theme-analysis-wrapper">
                        {/* 1. Primary Leader (대장주) */}
                        <div className="theme-sub-section">
                          <div className="theme-category-title">
                            <span className="icon">👑</span> 1대장주 (Primary Leader)
                          </div>
                          {primaryLeader ? (
                            <div className="primary-leader-card-premium">
                              <div className="premium-header">
                                <div className="symbol-group">
                                  <span className="sym">{primaryLeader.symbol}</span>
                                  <span className="nm">{getKoreanOrCleanName(primaryLeader.symbol, primaryLeader.name)}</span>
                                </div>
                                <span className="premium-match-score">지표 부합: {primaryLeader.score}/5</span>
                              </div>
                              
                              <div className="premium-metrics">
                                <div className="p-metric">
                                  <span className="lbl">현재가</span>
                                  <span className="val">${primaryLeader.price.toFixed(4)}</span>
                                </div>
                                <div className="p-metric">
                                  <span className="lbl">등락률</span>
                                  <span className={`val ${primaryLeader.changePercent >= 0 ? "text-green" : "text-red"}`}>
                                    +{primaryLeader.changePercent.toFixed(2)}%
                                  </span>
                                </div>
                                <div className="p-metric">
                                  <span className="lbl">거래대금</span>
                                  <span className="val">${(primaryLeader.valueUsd / 1000000).toFixed(2)}M</span>
                                </div>
                                <div className="p-metric">
                                  <span className="lbl">상대거래량(RVOL)</span>
                                  <span className="val">{primaryLeader.rvol.toFixed(2)}x</span>
                                </div>
                              </div>

                              <div className="premium-checklist-grid">
                                <div className={`checklist-item ${primaryLeader.isTopValue ? "pass" : "fail"}`}>
                                  <span className="chk">{primaryLeader.isTopValue ? "✓" : "✗"}</span> 거래대금 상위
                                </div>
                                <div className={`checklist-item ${primaryLeader.isTopChange ? "pass" : "fail"}`}>
                                  <span className="chk">{primaryLeader.isTopChange ? "✓" : "✗"}</span> 상승률 상위
                                </div>
                                <div className={`checklist-item ${primaryLeader.isRvolHigh ? "pass" : "fail"}`}>
                                  <span className="chk">{primaryLeader.isRvolHigh ? "✓" : "✗"}</span> RVOL &gt;= 2.0
                                </div>
                                <div className={`checklist-item ${primaryLeader.isAboveVwapEma ? "pass" : "fail"}`}>
                                  <span className="chk">{primaryLeader.isAboveVwapEma ? "✓" : "✗"}</span> 가격 &gt; VWAP/20EMA
                                </div>
                                <div className={`checklist-item ${primaryLeader.isFibBounceConfirmed ? "pass" : "fail"}`}>
                                  <span className="chk">{primaryLeader.isFibBounceConfirmed ? "✓" : "✗"}</span> 피보나치 지지반등
                                </div>
                              </div>

                              <button 
                                className="premium-action-btn"
                                onClick={() => {
                                  setTicker(primaryLeader.symbol);
                                  setActiveView("chart");
                                }}
                              >
                                📈 실시간 피보나치 차트 분석하기
                              </button>
                            </div>
                          ) : (
                            <div className="empty-panel">부합하는 대장주 후보가 없습니다.</div>
                          )}
                        </div>

                        {/* 2. Key Stocks (핵심 종목) */}
                        <div className="theme-sub-section">
                          <div className="theme-category-title">
                            <span className="icon">⭐</span> 핵심 핵심 종목 (Key Stocks)
                          </div>
                          {keyStocks.length > 0 ? (
                            <div className="key-stocks-grid">
                              {keyStocks.map((c) => (
                                <div 
                                  key={c.symbol} 
                                  className="mini-candidate-card"
                                  onClick={() => {
                                    setTicker(c.symbol);
                                    setActiveView("chart");
                                  }}
                                >
                                  <div className="mini-card-header">
                                    <span className="symbol">{c.symbol}</span>
                                    <span className="score">{c.score}/5</span>
                                  </div>
                                  <div className="mini-card-body">
                                    <span className="name">{getKoreanOrCleanName(c.symbol, c.name)}</span>
                                    <div className="metrics">
                                      <span className="price">${c.price.toFixed(2)}</span>
                                      <span className={`change ${c.changePercent >= 0 ? "text-green" : "text-red"}`}>
                                        +{c.changePercent.toFixed(2)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-panel-dense">조건을 만족하는 핵심 종목이 없습니다.</div>
                          )}
                        </div>

                        {/* 3. Theme Gainers (당일 급등주) */}
                        <div className="theme-sub-section">
                          <div className="theme-category-title">
                            <span className="icon">🔥</span> 테마 내 급등주 (Day Gainers)
                          </div>
                          {themeGainers.length > 0 ? (
                            <div className="theme-gainers-list">
                              {themeGainers.map((c) => (
                                <div 
                                  key={c.symbol}
                                  className="theme-gainer-row"
                                  onClick={() => {
                                    setTicker(c.symbol);
                                    setActiveView("chart");
                                  }}
                                >
                                  <div className="gainer-info">
                                    <span className="symbol">{c.symbol}</span>
                                    <span className="name">{getKoreanOrCleanName(c.symbol, c.name)}</span>
                                  </div>
                                  <div className="gainer-metrics">
                                    <span className="price">${c.price.toFixed(2)}</span>
                                    <span className={`change ${c.changePercent >= 0 ? "text-green" : "text-red"}`}>
                                      +{c.changePercent.toFixed(2)}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-panel-dense">테마 내 기타 급등주가 없습니다.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </aside>
          </>
        ) : activeView === "proStrategy" ? (
          <>
            {/* Center Area: Strategy Selection & Strategy Match List */}
            <div className="pro-strategy-container">
              <div className="section-title-row">
                <h2>고수들의 실시간 단타 전략 ⚡</h2>
                <span className="subtitle">미국 전문 트레이더들이 당일 급등주 매매 시 사용하는 핵심 3대 전략</span>
              </div>

              {/* Strategy Selector Cards */}
              <div className="strategy-cards-grid">
                <div 
                  className={`strategy-selector-card ${selectedStrategy === "breakout" ? "active" : ""}`}
                  onClick={() => setSelectedStrategy("breakout")}
                >
                  <div className="card-header-row">
                    <span className="title">돌파 매매 전략 (Breakout)</span>
                    <span className="badge">추세 돌파형</span>
                  </div>
                  <p className="desc">당일 전고점 또는 피크 저항선을 강력한 거래량으로 돌파할 때 진입하여 탄성을 먹는 전략 (Ross Cameron 스타일)</p>
                </div>

                <div 
                  className={`strategy-selector-card ${selectedStrategy === "vwap" ? "active" : ""}`}
                  onClick={() => setSelectedStrategy("vwap")}
                >
                  <div className="card-header-row">
                    <span className="title">VWAP 지지반등 전략 (VWAP Pullback)</span>
                    <span className="badge">기관 기준선 지지형</span>
                  </div>
                  <p className="desc">급등 후 당일 거래량 가중평균가격(VWAP) 부근까지 조정받은 후 아래꼬리 지지를 확인하고 진입하는 손익비 최강 전략</p>
                </div>

                <div 
                  className={`strategy-selector-card ${selectedStrategy === "fibonacci" ? "active" : ""}`}
                  onClick={() => setSelectedStrategy("fibonacci")}
                >
                  <div className="card-header-row">
                    <span className="title">피보나치 눌림목 전략 (Fib Pullback)</span>
                    <span className="badge">되돌림 반등형</span>
                  </div>
                  <p className="desc">당일 파동의 0.500 또는 0.618 황금 분할 레벨까지 눌림을 확인하고, 캔들 및 거래량 반등 신호와 함께 진입하는 정밀 매수법</p>
                </div>
              </div>

              {/* Active Strategy Rules Cheatsheet */}
              <div className="strategy-cheatsheet-box">
                {selectedStrategy === "breakout" && (
                  <>
                    <h4>📊 돌파 매매 핵심 가이드 (Breakout Cheatsheet)</h4>
                    <div className="cheatsheet-grid">
                      <div className="rule-item"><span className="label">진입 조건:</span> 당일 고점(Or 전고점) 돌파 직전 매수 대기 혹은 돌파 컨펌 시 불타기 진입</div>
                      <div className="rule-item"><span className="label">손절 기준:</span> 직전 캔들의 저가(1m/5m) 혹은 돌파 직전 이평선(9 EMA) 이탈 시 칼손절</div>
                      <div className="rule-item"><span className="label">익절 목표:</span> 돌파 탄력 둔화 시(1차 1.5R, 2차 호가창 저항선 근처 분할 청산)</div>
                      <div className="rule-item"><span className="label">필수 필터:</span> 상대 거래량(RVOL) 2.0 이상(3.0+ 권장), 당일 거래대금 $500만 이상</div>
                    </div>
                  </>
                )}
                {selectedStrategy === "vwap" && (
                  <>
                    <h4>📊 VWAP 지지반등 핵심 가이드 (VWAP Pullback Cheatsheet)</h4>
                    <div className="cheatsheet-grid">
                      <div className="rule-item"><span className="label">진입 조건:</span> 상승 파동 후 VWAP 근처로 조정 받았을 때 양봉 지지 캔들 발생 시 매수</div>
                      <div className="rule-item"><span className="label">손절 기준:</span> VWAP 선을 종가 기준 하방 이탈하거나 VWAP 아래 1% 이탈 시 즉시 종가 청산</div>
                      <div className="rule-item"><span className="label">익절 목표:</span> 1차 VWAP 반등분(2R), 2차 당일 Peak 고점 부근 전량 익절</div>
                      <div className="rule-item"><span className="label">필수 필터:</span> VWAP 이격 1.5% 이내 근접, 지지 시점의 일시적 거래량 소폭 반등</div>
                    </div>
                  </>
                )}
                {selectedStrategy === "fibonacci" && (
                  <>
                    <h4>📊 피보나치 눌림목 핵심 가이드 (Fib Pullback Cheatsheet)</h4>
                    <div className="cheatsheet-grid">
                      <div className="rule-item"><span className="label">진입 조건:</span> 피보나치 0.500 또는 0.618 비율 터치 및 지지반등 체크리스트 4가지 만족 시 매수</div>
                      <div className="rule-item"><span className="label">손절 기준:</span> 0.786 하방 이탈(손절선 타이트화) 또는 1.000(출발저가) 붕괴 시 청산</div>
                      <div className="rule-item"><span className="label">익절 목표:</span> 1차 당일 고점 전량/반량 익절, 2차 피보나치 1.618 확장 가격대</div>
                      <div className="rule-item"><span className="label">필수 필터:</span> RSI가 40~55 수준으로 식었는지 확인(과매수 상태 진입 방지)</div>
                    </div>
                  </>
                )}
              </div>

              {/* Strategic Matching Rank Table */}
              <div className="strategy-table-wrapper">
                <h3>실시간 전략 적합도 랭킹 🏆</h3>
                <div className="table-scroll-container">
                  <table className="strategy-ranking-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>종목 코드</th>
                        <th>종목명</th>
                        <th>현재가</th>
                        <th>등락률</th>
                        <th>거래대금</th>
                        <th>RVOL</th>
                        <th>상태</th>
                        <th>적합 점수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedStrategyData.map((item, idx) => (
                        <tr 
                          key={item.symbol}
                          className={`strategy-table-row ${ticker === item.symbol ? "active" : ""}`}
                          onClick={() => handleTickerSelect(item.symbol)}
                        >
                          <td className="col-rank">
                            <span className="rank-num">{idx + 1}</span>
                          </td>
                          <td className="col-symbol">{item.symbol}</td>
                          <td className="col-name">{getKoreanOrCleanName(item.symbol, item.name)}</td>
                          <td className="col-price">${item.price.toFixed(4)}</td>
                          <td className={`col-change ${item.changePercent >= 0 ? "text-green" : "text-red"}`}>
                            +{item.changePercent.toFixed(2)}%
                          </td>
                          <td className="col-value">${(item.valueUsd / 1000000).toFixed(2)}M</td>
                          <td className="col-rvol">{item.rvol.toFixed(2)}x</td>
                          <td className={`col-status ${item.statusColor}`}>{item.statusText}</td>
                          <td className="col-score">
                            <span className={`score-badge ${item.score >= 70 ? "high" : item.score >= 40 ? "mid" : "low"}`}>
                              {item.score}점
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Area: Strategy Card for the selected stock */}
            <aside className="pro-strategy-sidebar">
              {(() => {
                const rawStratInfo = getStrategyData(ticker, selectedStrategy);
                const lockKey = `${ticker}-${selectedStrategy}`;
                const isLocked = !!lockedPrices[lockKey];
                const stratInfo = isLocked ? {
                  ...rawStratInfo,
                  entryZone: lockedPrices[lockKey].entryZone,
                  tp1: lockedPrices[lockKey].tp1,
                  tp2: lockedPrices[lockKey].tp2,
                  sl: lockedPrices[lockKey].sl,
                } : rawStratInfo;
                const gainerObj = fmpGainers.find(g => g.symbol === ticker);
                const valUsd = gainerObj ? (gainerObj.valueUsd || gainerObj.volume * gainerObj.price) : 0;
                const rvolVal = gainerObj ? gainerObj.rvol : 1.0;
                
                // Calculate risk and reward percents
                const riskPercent = stratInfo.currentPrice > 0 ? Math.abs((stratInfo.currentPrice - stratInfo.sl) / stratInfo.currentPrice * 100) : 0;
                const rewardPercent = stratInfo.currentPrice > 0 ? Math.abs((stratInfo.tp1 - stratInfo.currentPrice) / stratInfo.currentPrice * 100) : 0;
                const rrRatio = riskPercent > 0 ? (rewardPercent / riskPercent).toFixed(1) : "0.0";

                const candles = candlesMap[ticker] || [];
                
                // Calculate Fibonacci levels for mini chart
                let miniFibLevels: FibonacciLevel[] = [];
                let miniBreakoutIdx: number | null = null;
                let miniPeakIdx: number | null = null;
                
                if (candles.length > 5) {
                  const lastIdx = candles.length - 1;
                  const lastCandle = candles[lastIdx];
                  const todayStr = getLocalDateString(lastCandle.time);
                  let todayStartIdx = candles.findIndex((c) => getLocalDateString(c.time) === todayStr);
                  if (todayStartIdx === -1) todayStartIdx = Math.max(0, candles.length - 60);
                  
                  let peakHigh = candles[todayStartIdx].high;
                  let peakIdx = todayStartIdx;
                  for (let i = todayStartIdx + 1; i < candles.length; i++) {
                    if (candles[i].high > peakHigh) {
                      peakHigh = candles[i].high;
                      peakIdx = i;
                    }
                  }
                  
                  let startLow = candles[todayStartIdx].low;
                  let startIdx = todayStartIdx;
                  for (let i = todayStartIdx + 1; i <= peakIdx; i++) {
                    if (candles[i].low < startLow) {
                      startLow = candles[i].low;
                      startIdx = i;
                    }
                  }
                  
                  miniFibLevels = calculateFibonacciLevels(startLow, peakHigh);
                  miniPeakIdx = peakIdx;
                  miniBreakoutIdx = startIdx;
                }

                return (
                  <>
                    <div className="section-title-row border-bottom" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h2>{ticker} 오더북 가이드 🎯</h2>
                        <span className="subtitle">실시간 전략 기반 손익비 및 핵심 목표치 산출</span>
                      </div>
                      <button 
                        className="expand-sidebar-toggle-btn"
                        onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                        title={isSidebarExpanded ? "기본 크기로 축소" : "정보창 크게 보기"}
                      >
                        {isSidebarExpanded ? "🗗 기본 크기" : "⛶ 크게 보기"}
                      </button>
                    </div>

                    <div className="strategy-detail-card-wrapper">
                      {/* Ticker title */}
                      <div className="ticker-badge-header">
                        <div className="sym-nm">
                          <span className="symbol">{ticker}</span>
                          <span className="name">{getKoreanOrCleanName(ticker, stratInfo.rawName)}</span>
                        </div>
                        <span className={`status-badge ${stratInfo.statusColor}`}>{stratInfo.statusText}</span>
                      </div>

                      {/* Mini Chart */}
                      <div className="mini-chart-container" style={{ height: isSidebarExpanded ? "420px" : "200px", width: "100%", marginTop: "12px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border-color)", backgroundColor: "#11151d" }}>
                        {candles.length > 0 ? (
                          <TradingChart
                            candles={candles}
                            breakoutIndex={miniBreakoutIdx}
                            peakIndex={miniPeakIdx}
                            manualStartIndex={null}
                            fibLevels={miniFibLevels}
                            onSelectManualCandle={() => {}}
                            isManualMode={false}
                            selectedFibLevelForTP={null}
                            isMini={true}
                            activeStrategy={selectedStrategy}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "12px" }}>
                            실시간 캔들 로딩 중...
                          </div>
                        )}
                      </div>

                      {/* R/R Ratio Visual Bar */}
                      <div className="rr-ratio-visual-block" style={{ marginTop: "14px" }}>
                        <div className="rr-stats-text">
                          <span>손익비 (R/R Ratio): <strong>{rrRatio}x</strong></span>
                          <span>적합 스코어: <strong className="text-accent">{stratInfo.score}점</strong></span>
                        </div>
                        <div className="rr-bar-wrapper">
                          <div className="rr-bar-part risk" style={{ width: `${Math.min(50, riskPercent * 3)}%` }} title={`위험(손절): -${riskPercent.toFixed(1)}%`}></div>
                          <div className="rr-bar-part reward" style={{ width: `${Math.min(50, rewardPercent * 3)}%` }} title={`수익(익절): +${rewardPercent.toFixed(1)}%`}></div>
                        </div>
                        <div className="rr-bar-legend">
                          <span className="text-red">손절폭: -{riskPercent.toFixed(1)}%</span>
                          <span className="text-green">익절폭: +{rewardPercent.toFixed(1)}%</span>
                        </div>
                      </div>

                      {/* Pro Order Guide */}
                      <div className="pro-order-guide-panel">
                        <div className="guide-header-line" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>미국 프로 트레이더 진입 매뉴얼</span>
                          <button 
                            className={`price-lock-btn ${isLocked ? "active" : ""}`}
                            onClick={() => handleTogglePriceLock(ticker, selectedStrategy, rawStratInfo)}
                            title={isLocked ? "추천 가격 고정 해제" : "현재 추천 가격 고정하기"}
                            style={{
                              backgroundColor: isLocked ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.05)",
                              border: isLocked ? "1px solid var(--color-warning)" : "1px solid var(--border-color)",
                              color: isLocked ? "var(--color-warning)" : "var(--text-muted)",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: "700",
                              cursor: "pointer",
                              transition: "all 0.2s ease"
                            }}
                          >
                            {isLocked ? "🔒 추천가 고정됨" : "🔓 추천가 고정"}
                          </button>
                        </div>
                        
                        <div className="order-target-line tp2">
                          <div className="left">
                            <span className="dot bg-green"></span>
                            <span className="lbl">2차 익절 목표치 (TP2)</span>
                          </div>
                          <span className="val">${stratInfo.tp2.toFixed(4)}</span>
                        </div>

                        <div className="order-target-line tp1">
                          <div className="left">
                            <span className="dot bg-yellow"></span>
                            <span className="lbl">1차 익절 목표치 (TP1)</span>
                          </div>
                          <span className="val">${stratInfo.tp1.toFixed(4)}</span>
                        </div>

                        <div className="order-target-line entry active">
                          <div className="left">
                            <span className="dot bg-blue"></span>
                            <span className="lbl">추천 진입 밴드 (Entry)</span>
                          </div>
                          <span className="val">{stratInfo.entryZone}</span>
                        </div>

                        <div className="order-target-line current">
                          <div className="left">
                            <span className="dot bg-white"></span>
                            <span className="lbl">실시간 현재가</span>
                          </div>
                          <span className="val font-bold text-accent">${stratInfo.currentPrice.toFixed(4)}</span>
                        </div>

                        <div className="order-target-line sl">
                          <div className="left">
                            <span className="dot bg-red"></span>
                            <span className="lbl">필수 손절 컷라인 (SL)</span>
                          </div>
                          <span className="val text-red">${stratInfo.sl.toFixed(4)}</span>
                        </div>
                      </div>

                      {/* Technical Checklist */}
                      <div className="strategy-indicator-checklist">
                        <h4>기술적 핵심 요건 매치도</h4>
                        <div className="indicator-check-chips">
                          <div className={`check-chip ${rvolVal >= 2.0 ? "checked" : ""}`}>RVOL &gt;= 2.0 ({rvolVal.toFixed(1)}x)</div>
                          <div className={`check-chip ${valUsd >= 5000000 ? "checked" : ""}`}>거래대금 $500만+ (${(valUsd/1000000).toFixed(1)}M)</div>
                          
                          {(() => {
                            const candles = candlesMap[ticker] || [];
                            if (candles.length > 5) {
                              const lastIdx = candles.length - 1;
                              const currentPrice = candles[lastIdx].close;
                              const vwap = calculateVWAP(candles);
                              const ema9 = calculateEMA(candles, 9)[lastIdx];
                              const ema20 = calculateEMA(candles, 20)[lastIdx];
                              const rsiVal = calculateRSI(candles, 14);
                              const rsi = rsiVal.length > 0 ? rsiVal[rsiVal.length - 1] : 50;

                              const todayStr = getLocalDateString(candles[lastIdx].time);
                              let todayStartIdx = candles.findIndex((c) => getLocalDateString(c.time) === todayStr);
                              if (todayStartIdx === -1) todayStartIdx = Math.max(0, candles.length - 60);
                              
                              let peakHigh = candles[todayStartIdx].high;
                              for (let i = todayStartIdx + 1; i < candles.length; i++) {
                                if (candles[i].high > peakHigh) peakHigh = candles[i].high;
                              }

                              const distFromPeak = ((peakHigh - currentPrice) / currentPrice) * 100;
                              const distFromVwap = ((currentPrice - vwap) / vwap) * 100;

                              if (selectedStrategy === "breakout") {
                                const isBreakoutSuccess = currentPrice >= peakHigh;
                                const isBreakoutNear = distFromPeak <= 1.5;
                                return (
                                  <>
                                    <div className={`check-chip ${currentPrice > vwap ? "checked" : ""}`}>가격 &gt; VWAP 지지선</div>
                                    <div className={`check-chip ${ema9 > ema20 ? "checked" : ""}`}>EMA 9 &gt; 20 정배열</div>
                                    <div className={`check-chip ${isBreakoutSuccess || isBreakoutNear ? "checked" : ""}`}>
                                      {isBreakoutSuccess ? "돌파 성공 🔥" : `돌파 임박 ⚡ (이격: ${distFromPeak.toFixed(1)}%)`}
                                    </div>
                                    <div className={`check-chip ${rsi < 68 ? "checked" : ""}`}>RSI 과열 해소 ({rsi.toFixed(1)})</div>
                                  </>
                                );
                              } else if (selectedStrategy === "vwap") {
                                const isVwapSupport = currentPrice >= vwap && distFromVwap <= 1.5;
                                return (
                                  <>
                                    <div className={`check-chip ${currentPrice >= vwap ? "checked" : ""}`}>
                                      {currentPrice >= vwap ? `VWAP 지지 중 (+${distFromVwap.toFixed(1)}%)` : `VWAP 하방 이탈 (-${Math.abs(distFromVwap).toFixed(1)}%)`}
                                    </div>
                                    <div className={`check-chip ${ema9 > ema20 ? "checked" : ""}`}>EMA 9 &gt; 20 정배열</div>
                                    <div className={`check-chip ${currentPrice > ema20 ? "checked" : ""}`}>가격 &gt; 20 EMA 지지</div>
                                    <div className={`check-chip ${rsi < 68 ? "checked" : ""}`}>RSI 과열 해소 ({rsi.toFixed(1)})</div>
                                  </>
                                );
                              } else {
                                const hasFibBounce = stratInfo.statusText.includes("반등") || stratInfo.statusText.includes("진입");
                                return (
                                  <>
                                    <div className={`check-chip ${currentPrice > vwap ? "checked" : ""}`}>가격 &gt; VWAP 지지선</div>
                                    <div className={`check-chip ${hasFibBounce ? "checked" : ""}`}>0.500/0.618 지지반등 완료</div>
                                    <div className={`check-chip ${currentPrice > ema20 ? "checked" : ""}`}>가격 &gt; 20 EMA 지지</div>
                                    <div className={`check-chip ${rsi < 55 ? "checked" : ""}`}>RSI 눌림목 범위 ({rsi.toFixed(1)})</div>
                                  </>
                                );
                              }
                            }
                            return (
                              <>
                                <div className="check-chip">가격 &gt; VWAP 지지선</div>
                                <div className="check-chip">EMA 9 &gt; 20 정배열</div>
                                <div className="check-chip">RSI 68 이하 안착</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Beginner Guide Collapsible Accordion */}
                      <div className={`beginner-guide-accordion ${isBeginnerGuideExpanded ? "expanded" : ""}`} style={{ marginTop: "12px", marginBottom: "12px" }}>
                        <button 
                          className="beginner-guide-toggle-btn"
                          onClick={() => setIsBeginnerGuideExpanded(!isBeginnerGuideExpanded)}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="icon">📖</span>
                            <span className="title">초보용 차트분석 & 선정근거</span>
                          </span>
                          <span className="chevron">{isBeginnerGuideExpanded ? "▲" : "▼"}</span>
                        </button>
                        
                        {isBeginnerGuideExpanded && (
                          <div className="beginner-guide-content">
                            <div className="guide-section">
                              <h5>🔍 왜 가능성이 높은 종목인가요?</h5>
                              <div className="rationale-text" style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.5", borderLeft: "2px solid var(--color-accent)", paddingLeft: "8px", margin: "4px 0" }}>
                                {(() => {
                                  let explanation = "";
                                  if (valUsd >= 5000000) {
                                    explanation += `• 당일 거래대금 $${(valUsd / 1000000).toFixed(1)}M 유입으로 기관/세력 관심도가 높은 시장 주도주 요건을 충족합니다. `;
                                  } else {
                                    explanation += `• 시가총액 대비 가벼운 $${(valUsd / 1000000).toFixed(1)}M 거래대금으로 변동성과 호가 탄력이 뛰어납니다. `;
                                  }
                                  if (rvolVal >= 2.0) {
                                    explanation += `• 평소 거래량의 ${rvolVal.toFixed(1)}배 폭발로 단타 거래 시 슬리피지(체결 밀림) 걱정 없는 풍부한 유동성이 보장됩니다. `;
                                  }
                                  
                                  if (selectedStrategy === "breakout") {
                                    explanation += `• (돌파 관점) 전고점 매도 저항 매물을 돌파 완료 혹은 바로 앞두고 있어 위쪽으로 매물이 없는 강력한 상승 가속도가 기대되는 자리입니다.`;
                                  } else if (selectedStrategy === "vwap") {
                                    explanation += `• (눌림목 관점) 상승 추세 이후 당일 평균 거래단가인 VWAP 부근까지 완만히 하락 조정되어 이격률이 좁혀진 상태로, 손절 폭은 극도로 작고 익절 기대치가 큰 높은 손익비 자리입니다.`;
                                  } else {
                                    explanation += `• (피보나치 관점) 급등 파동의 절반(0.500) 또는 황금 되돌림선(0.618) 부근에서 단기 하락 멈춤과 지지가 포착되어 기술적 반등 신뢰도가 극대화되는 시점입니다.`;
                                  }
                                  return explanation;
                                })()}
                              </div>
                            </div>
                            
                            <div className="guide-section" style={{ marginTop: "10px" }}>
                              <h5>📈 차트 보는 법 & 실전 진입 요령</h5>
                              <div className="step-list">
                                {selectedStrategy === "breakout" && (
                                  <>
                                    <div className="step-item">
                                      <span className="step-num">1</span>
                                      <div className="step-desc">주황선(EMA5)이 분홍선(EMA20)보다 위에 있는 정배열인지 확인하세요.</div>
                                    </div>
                                    <div className="step-item">
                                      <span className="step-num">2</span>
                                      <div className="step-desc">직전 최고점을 돌파하는 캔들이 형성될 때 거래량 막대가 크게 솟구쳐야 진짜 돌파입니다.</div>
                                    </div>
                                    <div className="step-item">
                                      <span className="step-num">3</span>
                                      <div className="step-desc">돌파 시 추격매수 혹은 돌파 대기하며, 단기 생명선인 **9 EMA**를 아래로 깨면 즉시 칼손절합니다.</div>
                                    </div>
                                  </>
                                )}
                                {selectedStrategy === "vwap" && (
                                  <>
                                    <div className="step-item">
                                      <span className="step-num">1</span>
                                      <div className="step-desc">차트에 추가된 당일 가중평균 가격선인 **하늘색(VWAP)선**을 먼저 찾으세요.</div>
                                    </div>
                                    <div className="step-item">
                                      <span className="step-num">2</span>
                                      <div className="step-desc">가격이 하늘색선에 접근한 뒤 꼬리를 달거나 양봉(초록색)으로 멈추며 지지받는지 봅니다.</div>
                                    </div>
                                    <div className="step-item">
                                      <span className="step-num">3</span>
                                      <div className="step-desc">하늘색 지지대에서 진입 밴드 내 매수하고, 하늘색선을 완전히 하방 이탈(종가 기준)하면 손절합니다.</div>
                                    </div>
                                  </>
                                )}
                                {selectedStrategy === "fibonacci" && (
                                  <>
                                    <div className="step-item">
                                      <span className="step-num">1</span>
                                      <div className="step-desc">차트에 표시되는 피보나치 수평선 중 특히 **0.500(초록선)**, **0.618(초록선)** 지점을 봅니다.</div>
                                    </div>
                                    <div className="step-item">
                                      <span className="step-num">2</span>
                                      <div className="step-desc">우측 반등 체크리스트에서 도달 및 종가안착 등의 만족도가 높은 수준인지 검증합니다.</div>
                                    </div>
                                    <div className="step-item">
                                      <span className="step-num">3</span>
                                      <div className="step-desc">최적 진입 후보에서 진입한 뒤, 손절 지지선인 0.786 혹은 당일 출발 저가 이탈 시 칼청산합니다.</div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Direct Navigation Button */}
                      <button 
                        className="strategy-nav-chart-btn"
                        onClick={() => {
                          setActiveView("chart");
                        }}
                      >
                        📈 실시간 피보나치 차트 분석하기
                      </button>
                    </div>
                  </>
                );
              })()}
            </aside>
          </>
        ) : (
          <>
            {/* Left Side: Chart View */}
            <div className="chart-wrapper">
              <div className="chart-back-bar">
                <button className="back-btn" onClick={() => setActiveView("sector")}>
                  ← 섹터 및 스캐너 목록으로 돌아가기
                </button>
                
                {/* 3대 고수 전략 신속 셀렉터 */}
                <div className="chart-strategy-pills">
                  <button 
                    className={`strategy-pill-btn ${selectedStrategy === "breakout" ? "active" : ""}`}
                    onClick={() => setSelectedStrategy("breakout")}
                    title="돌파 매매 전략"
                  >
                    💥 돌파
                  </button>
                  <button 
                    className={`strategy-pill-btn ${selectedStrategy === "vwap" ? "active" : ""}`}
                    onClick={() => setSelectedStrategy("vwap")}
                    title="VWAP 눌림목 전략"
                  >
                    🌊 VWAP
                  </button>
                  <button 
                    className={`strategy-pill-btn ${selectedStrategy === "fibonacci" ? "active" : ""}`}
                    onClick={() => setSelectedStrategy("fibonacci")}
                    title="피보나치 되돌림 전략"
                  >
                    🎯 피보나치
                  </button>
                </div>
                
                <span className="current-chart-info">현재 분석 중: <strong>{ticker}</strong> ({getKoreanOrCleanName(ticker, "")})</span>
              </div>
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#11151d] text-[#94a3b8]">
                  <div className="loading-spinner"></div>
                  <span className="mt-3 text-sm">실시간 차트 생성 중...</span>
                </div>
              ) : candles.length === 0 ? (
                <div className="flex-1 flex items-center justify-center bg-[#11151d] text-[#ef4444]">
                  ⚠️ 실시간 시세 데이터를 연동하지 못했습니다.
                </div>
              ) : (
                <TradingChart
                  candles={candles}
                  breakoutIndex={breakoutResult ? breakoutResult.index : null}
                  peakIndex={peakResult ? peakResult.index : null}
                  manualStartIndex={manualStartCandleTime !== null ? candles.findIndex((c) => c.time === manualStartCandleTime) : null}
                  fibLevels={fibLevels}
                  onSelectManualCandle={handleManualCandleSelect}
                  isManualMode={isManualMode}
                  selectedFibLevelForTP={selectedFibLevelForTP}
                  activeStrategy={selectedStrategy}
                />
              )}
            </div>

            {/* Right Side: Analysis Dashboard Info Panel */}
            <aside className="info-panel">
              
              {/* Summary / Price Info */}
              <section className="info-card flex-row-info">
                <div className="price-desc-box">
                  <span className="lbl">현재가</span>
                  <span className="price-val text-accent glow-text">
                    {currentPrice !== null 
                      ? (ticker.match(/^[0-9]+$/) ? `${currentPrice.toLocaleString()}원` : `$${currentPrice}`) 
                      : "-"}
                  </span>
                </div>
                
                <div className="price-desc-box">
                  <span className="lbl">RSI(14)</span>
                  {currentRsi !== null && rsiStatus ? (
                    <div className="rsi-val-wrapper">
                      <span className="price-val text-white">{currentRsi.toFixed(1)}</span>
                      <span className={`rsi-badge-lbl ${rsiStatus.color}`}>{rsiStatus.label}</span>
                    </div>
                  ) : (
                    <span className="price-val">-</span>
                  )}
                </div>

                <div className="status-badge-container">
                  {detectionStatus === "auto" && <span className="badge badge-success">자동 감지</span>}
                  {detectionStatus === "manual" && <span className="badge badge-warning">수동 보정</span>}
                  {detectionStatus === "failed" && <span className="badge badge-danger">기준 미지정</span>}
                </div>
              </section>

              {/* Low / High Reference Card */}
              <section className="info-card">
                <div className="card-header">
                  <h2>피보나치 기준점</h2>
                  {manualStartCandleTime !== null && (
                    <button className="reset-btn-link" onClick={resetToAuto}>자동 감지로 리셋</button>
                  )}
                </div>
                <div className="reference-grid">
                  <div className="ref-box">
                    <span className="ref-lbl text-green">START LOW (급등 출발)</span>
                    <span className="ref-val">
                      {startPrice !== null 
                        ? (ticker.match(/^[0-9]+$/) ? `${startPrice.toLocaleString()}원` : `$${startPrice}`) 
                        : "미감지"}
                    </span>
                  </div>
                  <div className="ref-box">
                    <span className="ref-lbl text-red">HIGH PEAK (당일 고점)</span>
                    <span className="ref-val">
                      {peakPrice !== null 
                        ? (ticker.match(/^[0-9]+$/) ? `${peakPrice.toLocaleString()}원` : `$${peakPrice}`) 
                        : "미감지"}
                    </span>
                  </div>
                </div>

                <button 
                  className={`calibration-btn ${isManualMode ? "calibrating" : ""}`}
                  onClick={() => setIsManualMode(!isManualMode)}
                  disabled={candles.length === 0}
                >
                  {isManualMode ? "🎯 캔들을 클릭하세요" : "🎯 수동 기준 캔들 선택"}
                </button>
              </section>

              {/* Momentum Alive Score (급등 지속 가능 점수) */}
              <section className="info-card">
                <div className="card-header">
                  <h2>Momentum Alive Score</h2>
                </div>
                {momentumScore ? (
                  <div className="score-area">
                    <div className="score-summary">
                      <div className={`score-radial ${getScoreGradeColor(momentumScore.total)}`}>
                        <span className="score-num">{momentumScore.total}</span>
                        <span className="score-max">/ 100</span>
                      </div>
                      <div className="score-text">
                        <span className="score-grade-label">상태: {momentumScore.grade.split("/")[0].trim()}</span>
                        <p className="score-desc">{momentumScore.grade.split("/")[1]?.trim() ?? ""}</p>
                      </div>
                    </div>

                    <div className="indicators-subscores">
                      <div className="subscore-item">
                        <span>추세 ({momentumScore.trend}/25)</span>
                        <div className="progress-bar"><div className="fill bg-blue" style={{ width: `${(momentumScore.trend/25)*100}%` }}></div></div>
                      </div>
                      <div className="subscore-item">
                        <span>피보나치 지지 ({momentumScore.fibonacci}/25)</span>
                        <div className="progress-bar"><div className="fill bg-purple" style={{ width: `${(momentumScore.fibonacci/25)*100}%` }}></div></div>
                      </div>
                      <div className="subscore-item">
                        <span>거래량 구조 ({momentumScore.volume}/20)</span>
                        <div className="progress-bar"><div className="fill bg-emerald" style={{ width: `${(momentumScore.volume/20)*100}%` }}></div></div>
                      </div>
                      <div className="subscore-item">
                        <span>RSI 동향 ({momentumScore.rsi}/15)</span>
                        <div className="progress-bar"><div className="fill bg-indigo" style={{ width: `${(momentumScore.rsi/15)*100}%` }}></div></div>
                      </div>
                      <div className="subscore-item">
                        <span>캔들 패턴 ({momentumScore.candle}/15)</span>
                        <div className="progress-bar"><div className="fill bg-amber" style={{ width: `${(momentumScore.candle/15)*100}%` }}></div></div>
                      </div>
                    </div>

                    <div className="score-reasons-list">
                      <h4>평가 근거 요약</h4>
                      <ul>
                        {momentumScore.reasons.map((r, i) => (
                          <li key={i} className={r.startsWith("⚠️") ? "warning-reason" : "success-reason"}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="empty-panel">기준 저점/고점이 지정되어야 점수가 산출됩니다.</div>
                )}
              </section>

              {/* Best Entry Candidates */}
              <section className="info-card">
                <div className="card-header">
                  <h2>실시간 최적 진입 후보 레벨</h2>
                </div>
                {bestEntry ? (
                  <div className="candidate-grid">
                    <div className="candidate-box best">
                      <span className="cand-title">🎯 현재 최적 진입</span>
                      <span className="cand-value">
                        {bestEntry.bestLevel !== null ? `${bestEntry.bestLevel.toFixed(3)} Level` : "조건 부합 레벨 없음"}
                      </span>
                    </div>
                    <div className="candidate-box wait">
                      <span className="cand-title">⏳ 대기/관찰 레벨</span>
                      <span className="cand-value">
                        {bestEntry.waitingLevel !== null ? `${bestEntry.waitingLevel.toFixed(3)} Level` : "-"}
                      </span>
                    </div>
                    <div className="candidate-box risk">
                      <span className="cand-title">⚠️ 리스크 경계 레벨</span>
                      <span className="cand-value">
                        {bestEntry.highRiskLevel !== null ? `${bestEntry.highRiskLevel.toFixed(3)} Level` : "-"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-panel">기준 정보가 부족합니다.</div>
                )}
              </section>

              {/* Bounce Checklist */}
              <section className="info-card">
                <div className="card-header">
                  <h2>반등 확인 체크리스트 (4대 주요 레벨)</h2>
                </div>
                {Object.keys(bounceChecklist).length > 0 ? (
                  <div className="bounce-checklist-wrapper">
                    {Object.entries(bounceChecklist).map(([lvlStr, item]) => {
                      const lvlNum = parseFloat(lvlStr);
                      return (
                        <div key={lvlStr} className="level-checklist-block">
                          <div className="level-checklist-title">
                            <span className="level-indicator">{lvlNum.toFixed(3)} 구간</span>
                            <span className={`level-status-tag ${item.status === "반등 확인 완료" ? "complete" : "incomplete"}`}>
                              {item.status} ({item.satisfyCount}/7)
                            </span>
                          </div>
                          <div className="checklist-subgrid">
                            <div className={`check-chip ${item.reached ? "checked" : ""}`}>도달: {item.reached ? "O" : "X"}</div>
                            <div className={`check-chip ${item.tail ? "checked" : ""}`}>아래꼬리: {item.tail ? "O" : "X"}</div>
                            <div className={`check-chip ${item.recover ? "checked" : ""}`}>이탈복구: {item.recover ? "O" : "X"}</div>
                            <div className={`check-chip ${item.closeAbove ? "checked" : ""}`}>종가안착: {item.closeAbove ? "O" : "X"}</div>
                            <div className={`check-chip ${item.breakout ? "checked" : ""}`}>고점돌파: {item.breakout ? "O" : "X"}</div>
                            <div className={`check-chip ${item.volumeUp ? "checked" : ""}`}>반등거래: {item.volumeUp ? "O" : "X"}</div>
                            <div className={`check-chip ${item.doubleBottom ? "checked" : ""}`}>재지지: {item.doubleBottom ? "O" : "X"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-panel">기준 저점/고점이 지정되어야 체크리스트가 가동됩니다.</div>
                )}
              </section>

              {/* Fibonacci Levels, Targets & R/R Table */}
              <section className="info-card fib-rr-section">
                <div className="card-header">
                  <h2>되돌림 진입/목표가 및 손익비 (R/R) 표</h2>
                  <span className="tooltip-helper">행을 클릭하면 차트에 TP 라인이 강조됩니다.</span>
                </div>
                {rrRows.length > 0 ? (
                  <div className="rr-table-container">
                    <table className="rr-table">
                      <thead>
                        <tr>
                          <th>레벨</th>
                          <th>진입가</th>
                          <th>손절가(SL)</th>
                          <th>TP10 목표</th>
                          <th>TP15 목표</th>
                          <th>R/R 비율</th>
                          <th>이격도</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rrRows.map((row) => (
                          <tr 
                            key={row.level} 
                            className={`rr-table-row ${selectedFibLevelForTP === row.level ? "highlighted-row" : ""} ${[0.5, 0.618, 0.73, 0.786].includes(row.level) ? "interest-level" : ""}`}
                            onClick={() => handleFibRowClick(row.level)}
                          >
                            <td className="col-level">
                              <span className={`fib-badge lvl-${row.level.toFixed(3).replace(".", "")}`}>
                                {row.level.toFixed(3)}
                              </span>
                            </td>
                            <td className="col-price">
                              {ticker.match(/^[0-9]+$/) ? `${Math.round(row.entry).toLocaleString()}` : `$${row.entry.toFixed(2)}`}
                            </td>
                            <td className="col-price text-red">
                              {ticker.match(/^[0-9]+$/) ? `${Math.round(row.stop).toLocaleString()}` : `$${row.stop.toFixed(2)}`}
                            </td>
                            <td className="col-price text-yellow">
                              {ticker.match(/^[0-9]+$/) ? `${Math.round(row.tp10).toLocaleString()}` : `$${row.tp10.toFixed(2)}`}
                            </td>
                            <td className="col-price text-green">
                              {ticker.match(/^[0-9]+$/) ? `${Math.round(row.tp15).toLocaleString()}` : `$${row.tp15.toFixed(2)}`}
                            </td>
                            <td className="col-rr font-bold text-accent">
                              {row.rrRatio}x <span className="small-risk">({row.riskPercent}%)</span>
                            </td>
                            <td className={`col-dist ${row.distPercent < 0 ? "text-red" : "text-green"}`}>
                              {row.distPercent > 0 ? `+${row.distPercent}%` : `${row.distPercent}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-panel">피보나치 라인이 연산되지 않았습니다.</div>
                )}
              </section>

            </aside>
          </>
        )}
      </div>

      {/* Styles */}
      <style jsx global>{`
        :root {
          --bg-main: #0b0e14;
          --bg-card: #151a24;
          --bg-input: #1b2230;
          --bg-card-hover: #1e2736;
          --border-color: #232a38;
          --border-focus: #3b82f6;
          --text-main: #f3f4f6;
          --text-muted: #8b9bb4;
          --text-dim: #5c6c84;
          --color-accent: #6366f1;
          --color-up: #10b981;
          --color-down: #ef4444;
          --color-warning: #f59e0b;
        }

        body {
          margin: 0;
          padding: 0;
          background-color: var(--bg-main);
          color: var(--text-main);
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
        }
      `}</style>
      <style jsx>{`
        .disclaimer-banner {
          background: linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.12) 100%);
          color: #fca5a5;
          border-bottom: 1px solid rgba(239, 68, 68, 0.25);
          padding: 8px 24px;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          letter-spacing: 0.3px;
          z-index: 110;
        }

        .scanner-error-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 16px;
          background-color: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 8px;
          text-align: center;
          gap: 12px;
          margin-top: 10px;
        }

        .scanner-error-panel .error-icon {
          font-size: 24px;
        }

        .scanner-error-panel .error-msg {
          font-size: 13px;
          font-weight: 700;
          color: #fca5a5;
          margin: 0;
        }

        .scanner-error-panel .error-tip {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .scanner-error-panel code {
          background-color: var(--bg-input);
          padding: 2px 4px;
          border-radius: 4px;
          color: #a5b4fc;
          font-family: monospace;
        }

        .scanner-error-panel .retry-btn {
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          color: var(--text-main);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .scanner-error-panel .retry-btn:hover {
          background-color: var(--bg-card-hover);
          border-color: var(--text-muted);
        }

        .sector-leadership-container {
          background-color: #11151d;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
          padding: 20px;
          gap: 20px;
        }

        .section-title-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .section-title-row.border-bottom {
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 12px;
          margin-bottom: 12px;
        }

        .section-title-row h2 {
          font-size: 15px;
          font-weight: 800;
          margin: 0;
          color: var(--text-main);
        }

        .section-title-row .subtitle {
          font-size: 11px;
          color: var(--text-muted);
        }

        .sector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }

        .sector-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sector-card:hover {
          border-color: var(--text-muted);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }

        .sector-card.active {
          border-color: var(--color-accent);
          background-color: rgba(99, 102, 241, 0.05);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
        }

        .sector-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sector-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sector-rank-badge {
          font-size: 10px;
          font-weight: 800;
          color: #fb923c;
          background-color: rgba(251, 146, 60, 0.1);
          padding: 1px 5px;
          border-radius: 4px;
          border: 1px solid rgba(251, 146, 60, 0.2);
        }

        .sector-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
        }

        .sector-score-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
        }

        .sector-score-badge.strong { background-color: rgba(16, 185, 129, 0.15); color: var(--color-up); border: 1px solid rgba(16, 185, 129, 0.3); }
        .sector-score-badge.neutral { background-color: rgba(245, 158, 11, 0.15); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.3); }
        .sector-score-badge.weak { background-color: rgba(239, 68, 68, 0.15); color: var(--color-down); border: 1px solid rgba(239, 68, 68, 0.3); }

        .sector-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-top: 1px dashed var(--border-color);
          padding-top: 10px;
        }

        .sector-card-body .metric {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }

        .sector-card-body .metric .lbl {
          color: var(--text-muted);
        }

        .sector-card-body .metric .val {
          font-weight: 600;
        }

        .sector-card-leader-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          margin-top: 4px;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.03);
        }

        .sector-card-leader-summary .leader-lbl {
          color: var(--text-muted);
        }

        .sector-card-leader-summary .leader-sym {
          font-weight: 700;
        }

        .sector-leaders-sidebar {
          background-color: var(--bg-main);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }

        .theme-analysis-wrapper {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .theme-sub-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .theme-category-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--text-main);
          display: flex;
          align-items: center;
          gap: 6px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border-color);
        }

        .theme-category-title .icon {
          font-size: 14px;
        }

        /* Premium Primary Leader Card */
        .primary-leader-card-premium {
          background: linear-gradient(135deg, rgba(21, 26, 36, 0.95) 0%, rgba(30, 27, 75, 0.3) 100%);
          border: 1px solid rgba(245, 158, 11, 0.4);
          box-shadow: 0 8px 30px rgba(245, 158, 11, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: relative;
          overflow: hidden;
        }

        .primary-leader-card-premium::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
        }

        .premium-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .premium-header .symbol-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .premium-header .sym {
          font-size: 16px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .premium-header .nm {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .premium-match-score {
          font-size: 10px;
          font-weight: 800;
          background-color: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .premium-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          background-color: rgba(0, 0, 0, 0.2);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.02);
        }

        .premium-metrics .p-metric {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .premium-metrics .p-metric .lbl {
          font-size: 9px;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .premium-metrics .p-metric .val {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
        }

        .premium-checklist-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 10px;
        }

        .premium-checklist-grid .checklist-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .premium-checklist-grid .checklist-item.pass {
          color: #34d399;
        }

        .premium-checklist-grid .checklist-item.pass .chk {
          color: #10b981;
          font-weight: bold;
        }

        .premium-checklist-grid .checklist-item.fail .chk {
          color: #ef4444;
          font-weight: bold;
        }

        .premium-action-btn {
          background: linear-gradient(90deg, #4f46e5 0%, #6366f1 100%);
          color: #ffffff;
          border: none;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
          text-align: center;
        }

        .premium-action-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
        }

        /* Key Stocks grid */
        .key-stocks-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .mini-candidate-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .mini-candidate-card:hover {
          border-color: var(--color-accent);
          background-color: var(--bg-card-hover);
          transform: translateY(-1px);
        }

        .mini-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .mini-card-header .symbol {
          font-size: 11px;
          font-weight: 800;
          color: #ffffff;
        }

        .mini-card-header .score {
          font-size: 9px;
          font-weight: 700;
          background-color: rgba(99, 102, 241, 0.1);
          color: #a5b4fc;
          padding: 1px 4px;
          border-radius: 4px;
        }

        .mini-card-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .mini-card-body .name {
          font-size: 9px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mini-card-body .metrics {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 700;
        }

        /* Theme Gainers List */
        .theme-gainers-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background-color: rgba(0, 0, 0, 0.15);
          border-radius: 10px;
          border: 1px solid var(--border-color);
          padding: 6px;
          max-height: 200px;
          overflow-y: auto;
        }

        .theme-gainer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .theme-gainer-row:hover {
          background-color: var(--bg-card-hover);
        }

        .theme-gainer-row .gainer-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-width: 60%;
        }

        .theme-gainer-row .gainer-info .symbol {
          font-size: 11px;
          font-weight: 800;
          color: #ffffff;
        }

        .theme-gainer-row .gainer-info .name {
          font-size: 9px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .theme-gainer-row .gainer-metrics {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .theme-gainer-row .gainer-metrics .price {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-main);
        }

        .theme-gainer-row .gainer-metrics .change {
          font-size: 10px;
          font-weight: 700;
        }

        .empty-panel-dense {
          background-color: rgba(255, 255, 255, 0.01);
          border: 1px dashed var(--border-color);
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          color: var(--text-dim);
          font-size: 11px;
        }

        /* Pro Strategy View CSS Styles */
        .pro-strategy-container {
          background-color: #11151d;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
          padding: 20px;
          gap: 20px;
        }

        .strategy-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .strategy-selector-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .strategy-selector-card:hover {
          border-color: var(--text-muted);
          transform: translateY(-1px);
        }

        .strategy-selector-card.active {
          border-color: var(--color-accent);
          background-color: rgba(99, 102, 241, 0.05);
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.12);
        }

        .strategy-selector-card .card-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .strategy-selector-card .card-header-row .title {
          font-size: 13px;
          font-weight: 800;
          color: #ffffff;
        }

        .strategy-selector-card .card-header-row .badge {
          font-size: 9px;
          font-weight: 700;
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--text-muted);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .strategy-selector-card.active .card-header-row .badge {
          background-color: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
        }

        .strategy-selector-card .desc {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .strategy-cheatsheet-box {
          background-color: #171d29;
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .strategy-cheatsheet-box h4 {
          font-size: 12px;
          font-weight: 800;
          color: #a5b4fc;
          margin: 0;
        }

        .strategy-cheatsheet-box .cheatsheet-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .strategy-cheatsheet-box .rule-item {
          font-size: 11px;
          color: var(--text-main);
          line-height: 1.5;
        }

        .strategy-cheatsheet-box .rule-item .label {
          font-weight: 800;
          color: var(--color-warning);
          margin-right: 6px;
        }

        .strategy-table-wrapper {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-grow: 1;
        }

        .strategy-table-wrapper h3 {
          font-size: 14px;
          font-weight: 800;
          margin: 0;
        }

        .table-scroll-container {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background-color: var(--bg-card);
          overflow: hidden;
        }

        .strategy-ranking-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }

        .strategy-ranking-table th, 
        .strategy-ranking-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .strategy-ranking-table th {
          background-color: var(--bg-input);
          font-weight: 700;
          color: var(--text-muted);
          font-size: 11px;
        }

        .strategy-table-row {
          cursor: pointer;
          transition: background-color 0.15s ease;
        }

        .strategy-table-row:hover {
          background-color: var(--bg-card-hover);
        }

        .strategy-table-row.active {
          background-color: rgba(99, 102, 241, 0.1);
        }

        .strategy-ranking-table .col-rank {
          font-weight: 800;
          color: var(--text-muted);
        }

        .strategy-ranking-table .col-symbol {
          font-weight: 800;
          color: #ffffff;
        }

        .strategy-ranking-table .col-rvol {
          font-family: monospace;
        }

        .strategy-ranking-table .col-status {
          font-weight: 700;
        }

        .strategy-ranking-table .score-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .strategy-ranking-table .score-badge.high { background-color: rgba(16, 185, 129, 0.15); color: var(--color-up); }
        .strategy-ranking-table .score-badge.mid { background-color: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
        .strategy-ranking-table .score-badge.low { background-color: rgba(239, 68, 68, 0.15); color: var(--color-down); }

        .pro-strategy-sidebar {
          background-color: var(--bg-main);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }

        .strategy-detail-card-wrapper {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .ticker-badge-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--bg-card);
          padding: 14px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }

        .ticker-badge-header .sym-nm {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ticker-badge-header .symbol {
          font-size: 16px;
          font-weight: 900;
          color: #ffffff;
        }

        .ticker-badge-header .name {
          font-size: 11px;
          color: var(--text-muted);
        }

        .ticker-badge-header .status-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 6px;
          background-color: rgba(255, 255, 255, 0.03);
        }

        .rr-ratio-visual-block {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .rr-stats-text {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-main);
        }

        .rr-bar-wrapper {
          display: flex;
          height: 8px;
          background-color: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          overflow: hidden;
        }

        .rr-bar-part.risk {
          background: linear-gradient(90deg, #ef4444 0%, #b91c1c 100%);
          border-top-left-radius: 4px;
          border-bottom-left-radius: 4px;
        }

        .rr-bar-part.reward {
          background: linear-gradient(90deg, #10b981 0%, #047857 100%);
          border-top-right-radius: 4px;
          border-bottom-right-radius: 4px;
        }

        .rr-bar-legend {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          font-weight: 700;
        }

        .pro-order-guide-panel {
          background-color: #0b0e14;
          border: 1px dashed var(--border-color);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .guide-header-line {
          font-size: 9px;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          padding-bottom: 6px;
        }

        .price-lock-btn:hover {
          background-color: rgba(255, 255, 255, 0.08) !important;
          color: var(--text-main) !important;
        }

        .price-lock-btn.active:hover {
          background-color: rgba(245, 158, 11, 0.25) !important;
          color: #fcd34d !important; /* light yellow */
        }

        .order-target-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 10px;
          border-radius: 6px;
          background-color: rgba(255, 255, 255, 0.01);
          border: 1px solid transparent;
        }

        .order-target-line.active {
          background-color: rgba(59, 130, 246, 0.05);
          border-color: rgba(59, 130, 246, 0.2);
        }

        .order-target-line .left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .order-target-line .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .order-target-line .lbl {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
        }

        .order-target-line .val {
          font-size: 12px;
          font-weight: 700;
          font-family: monospace;
          color: var(--text-main);
        }

        .order-target-line.active .val {
          color: #60a5fa;
        }

        .strategy-indicator-checklist {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .strategy-indicator-checklist h4 {
          font-size: 11px;
          font-weight: 800;
          color: var(--text-muted);
          margin: 0;
          text-transform: uppercase;
        }

        .indicator-check-chips {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        /* Beginner Guide Accordion Styles */
        .beginner-guide-accordion {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background-color: rgba(255, 255, 255, 0.01);
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .beginner-guide-accordion.expanded {
          border-color: rgba(99, 102, 241, 0.3);
          background-color: rgba(99, 102, 241, 0.03);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.08);
        }

        .beginner-guide-toggle-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: none;
          border: none;
          padding: 10px 12px;
          cursor: pointer;
          color: var(--text-main);
          font-family: inherit;
          transition: background-color 0.2s ease;
        }

        .beginner-guide-toggle-btn:hover {
          background-color: rgba(255, 255, 255, 0.03);
        }

        .beginner-guide-toggle-btn .icon {
          font-size: 13px;
        }

        .beginner-guide-toggle-btn .title {
          font-size: 11px;
          font-weight: 800;
          color: var(--text-muted);
          text-align: left;
        }

        .beginner-guide-toggle-btn .chevron {
          font-size: 9px;
          color: var(--text-dim);
        }

        .beginner-guide-accordion.expanded .beginner-guide-toggle-btn .title {
          color: #a5b4fc;
        }

        .beginner-guide-content {
          padding: 0 12px 12px 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          animation: fadeIn 0.25s ease;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .guide-section {
          text-align: left;
        }

        .guide-section h5 {
          font-size: 10.5px;
          font-weight: 800;
          color: var(--text-main);
          margin: 0 0 6px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .step-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .step-num {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          background-color: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          border-radius: 50%;
          font-size: 9px;
          font-weight: 800;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .step-desc {
          font-size: 11px;
          line-height: 1.45;
          color: var(--text-muted);
          text-align: left;
        }

        .step-desc strong {
          color: var(--text-main);
        }

        .strategy-nav-chart-btn {
          background: linear-gradient(90deg, #4f46e5 0%, #6366f1 100%);
          color: #ffffff;
          border: none;
          padding: 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.2);
          text-align: center;
        }

        .strategy-nav-chart-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
        }

        .chart-back-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          background-color: var(--bg-card);
          border-bottom: 1px solid var(--border-color);
        }

        .chart-strategy-pills {
          display: flex;
          background-color: var(--bg-main);
          border: 1px solid var(--border-color);
          padding: 2px;
          border-radius: 20px;
          gap: 2px;
        }

        .strategy-pill-btn {
          background: none;
          border: none;
          padding: 4px 10px;
          border-radius: 14px;
          color: var(--text-muted);
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .strategy-pill-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.02);
        }

        .strategy-pill-btn.active {
          color: #ffffff;
          background: linear-gradient(90deg, #4f46e5 0%, #6366f1 100%);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
        }

        .back-btn {
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          color: #a5b4fc;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-btn:hover {
          background-color: var(--bg-card-hover);
          border-color: var(--text-muted);
        }

        .current-chart-info {
          font-size: 11px;
          color: var(--text-muted);
        }

        .current-chart-info strong {
          color: var(--text-main);
        }

        .dashboard-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background-color: var(--bg-main);
          color: var(--text-main);
        }

        .header-nav-tabs {
          display: flex;
          background-color: var(--bg-input);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          margin-right: auto;
          margin-left: 24px;
        }

        .nav-tab-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .nav-tab-btn:hover {
          color: var(--text-main);
          background-color: rgba(255, 255, 255, 0.02);
        }

        .nav-tab-btn.active {
          background-color: var(--bg-card-hover);
          color: #a5b4fc;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px;
          background-color: var(--bg-card);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          font-size: 26px;
        }

        .logo-text-group h1 {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .logo-text-group .subtitle {
          font-size: 10px;
          color: var(--text-muted);
          margin: 2px 0 0 0;
        }

        .logo-badge {
          font-size: 9px;
          background-color: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .search-timeframe-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .ticker-search-container {
          position: relative;
        }

        .ticker-search-input {
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          color: var(--text-main);
          padding: 8px 36px 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          width: 220px;
          transition: all 0.2s ease;
          font-weight: 600;
        }

        .clear-search-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
          padding: 2px;
        }

        .clear-search-btn:hover {
          color: var(--text-main);
        }

        .ticker-search-input:focus {
          border-color: var(--border-focus);
          outline: none;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .ticker-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 260px;
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          z-index: 200;
          max-height: 250px;
          overflow-y: auto;
        }

        .ticker-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 13px;
          transition: background-color 0.2s ease;
        }

        .ticker-item:hover {
          background-color: var(--bg-card-hover);
        }

        .ticker-item.active {
          background-color: rgba(99, 102, 241, 0.15);
        }

        .ticker-sym {
          font-weight: 700;
        }

        .ticker-nm {
          color: var(--text-muted);
        }

        .dropdown-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 150;
        }

        .timeframe-group {
          display: flex;
          background-color: var(--bg-input);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }

        .timeframe-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .timeframe-btn:hover {
          color: var(--text-main);
        }

        .timeframe-btn.active {
          background-color: var(--bg-card-hover);
          color: #a5b4fc;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 280px 2.2fr 1fr;
          flex-grow: 1;
          height: calc(100vh - 58px);
          overflow: hidden;
          transition: grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .dashboard-grid.sidebar-expanded {
          grid-template-columns: 280px 1fr 1.8fr;
        }

        .dashboard-grid.scanner-collapsed {
          grid-template-columns: 0px 2.2fr 1fr;
        }

        .dashboard-grid.scanner-collapsed.sidebar-expanded {
          grid-template-columns: 0px 1fr 1.8fr;
        }

        .expand-sidebar-toggle-btn {
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
          user-select: none;
        }

        .expand-sidebar-toggle-btn:hover {
          background-color: var(--bg-card-hover);
          color: var(--text-main);
          border-color: var(--border-focus);
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.2);
        }

        .mini-chart-container {
          transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scanner-expand-handle {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 60px;
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-left: none;
          border-radius: 0 8px 8px 0;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 100;
          font-size: 10px;
          transition: all 0.2s ease;
          box-shadow: 2px 0 10px rgba(0,0,0,0.3);
          user-select: none;
        }

        .scanner-expand-handle:hover {
          background-color: var(--bg-card-hover);
          color: var(--text-main);
          width: 20px;
        }

        .collapse-sidebar-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
        }

        .collapse-sidebar-btn:hover {
          background-color: var(--bg-card-hover);
          color: var(--text-main);
          border-color: var(--border-color);
        }

        .chart-wrapper {
          position: relative;
          background-color: #11151d;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
        }

        .info-panel {
          background-color: var(--bg-main);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }

        .info-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
        }

        .flex-row-info {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .price-desc-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .price-desc-box .lbl {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .price-desc-box .price-val {
          font-size: 20px;
          font-weight: 800;
        }

        .rsi-val-wrapper {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .rsi-badge-lbl {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 4px;
          border-radius: 4px;
          background-color: rgba(255, 255, 255, 0.05);
        }

        .glow-text {
          text-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }

        .status-badge-container {
          display: flex;
          align-items: center;
        }

        .badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 6px;
        }

        .badge-success { background-color: rgba(16, 185, 129, 0.15); color: var(--color-up); border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-warning { background-color: rgba(245, 158, 11, 0.15); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-danger { background-color: rgba(239, 68, 68, 0.15); color: var(--color-down); border: 1px solid rgba(239, 68, 68, 0.3); }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 8px;
          margin-bottom: 4px;
        }

        .card-header h2 {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
        }

        .reset-btn-link {
          background: none;
          border: none;
          color: var(--color-down);
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .reference-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .ref-box {
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ref-lbl {
          font-size: 9px;
          font-weight: 700;
        }

        .ref-val {
          font-size: 14px;
          font-weight: 800;
        }

        .calibration-btn {
          width: 100%;
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          color: var(--text-main);
          padding: 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .calibration-btn:hover {
          background-color: var(--bg-card-hover);
          border-color: var(--text-muted);
        }

        .calibration-btn.calibrating {
          background-color: var(--color-warning);
          color: #0b0e14;
          border-color: var(--color-warning);
          animation: pulseGlow 1.5s infinite ease-in-out;
        }

        /* Score area */
        .score-area {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .score-summary {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .score-radial {
          width: 65px;
          height: 65px;
          border-radius: 50%;
          border: 4px solid var(--border-color);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background-color: var(--bg-input);
        }

        .score-radial.grade-strong { border-color: var(--color-up); box-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
        .score-radial.grade-good { border-color: #a5b4fc; }
        .score-radial.grade-neutral { border-color: var(--color-warning); }
        .score-radial.grade-weak { border-color: #f97316; }
        .score-radial.grade-risk { border-color: var(--color-down); box-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }

        .score-num {
          font-size: 20px;
          font-weight: 800;
        }

        .score-max {
          font-size: 9px;
          color: var(--text-muted);
        }

        .score-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .score-grade-label {
          font-size: 14px;
          font-weight: 700;
        }

        .score-desc {
          font-size: 11px;
          color: var(--text-muted);
          margin: 0;
        }

        .indicators-subscores {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background-color: var(--bg-input);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }

        .subscore-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
        }

        .progress-bar {
          width: 100px;
          height: 6px;
          background-color: var(--bg-main);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar .fill {
          height: 100%;
          border-radius: 3px;
        }

        .bg-blue { background-color: #3b82f6; }
        .bg-purple { background-color: #8b5cf6; }
        .bg-emerald { background-color: #10b981; }
        .bg-indigo { background-color: #6366f1; }
        .bg-amber { background-color: #f59e0b; }

        .score-reasons-list h4 {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          margin: 0 0 8px 0;
          text-transform: uppercase;
        }

        .score-reasons-list ul {
          margin: 0;
          padding-left: 14px;
          font-size: 11px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .success-reason {
          color: var(--text-main);
        }

        .warning-reason {
          color: var(--color-warning);
          font-weight: 600;
        }

        /* Candidate info */
        .candidate-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }

        .candidate-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 10px 4px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background-color: var(--bg-input);
          text-align: center;
        }

        .candidate-box.best {
          border-color: rgba(16, 185, 129, 0.4);
          background-color: rgba(16, 185, 129, 0.05);
        }

        .candidate-box.wait {
          border-color: rgba(245, 158, 11, 0.4);
          background-color: rgba(245, 158, 11, 0.05);
        }

        .candidate-box.risk {
          border-color: rgba(239, 68, 68, 0.4);
          background-color: rgba(239, 68, 68, 0.05);
        }

        .cand-title {
          font-size: 9px;
          font-weight: 700;
          color: var(--text-muted);
        }

        .cand-value {
          font-size: 12px;
          font-weight: 800;
        }

        .candidate-box.best .cand-value { color: var(--color-up); }
        .candidate-box.wait .cand-value { color: var(--color-warning); }
        .candidate-box.risk .cand-value { color: var(--color-down); }

        /* Checklist */
        .bounce-checklist-wrapper {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .level-checklist-block {
          background-color: var(--bg-input);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 12px;
        }

        .level-checklist-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 4px;
        }

        .level-indicator {
          font-size: 12px;
          font-weight: 700;
          color: #a5b4fc;
        }

        .level-status-tag {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .level-status-tag.complete {
          background-color: rgba(16, 185, 129, 0.15);
          color: var(--color-up);
        }

        .level-status-tag.incomplete {
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--text-muted);
        }

        .checklist-subgrid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }

        .check-chip {
          font-size: 9px;
          background-color: var(--bg-main);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 4px 2px;
          text-align: center;
          color: var(--text-dim);
          font-weight: 600;
        }

        .check-chip.checked {
          border-color: rgba(99, 102, 241, 0.4);
          background-color: rgba(99, 102, 241, 0.08);
          color: #a5b4fc;
        }

        /* RR Table */
        .tooltip-helper {
          font-size: 9px;
          color: var(--text-dim);
        }

        .rr-table-container {
          overflow-x: auto;
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .rr-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 11px;
        }

        .rr-table th {
          background-color: var(--bg-input);
          color: var(--text-muted);
          font-weight: 600;
          padding: 8px;
          border-bottom: 1px solid var(--border-color);
        }

        .rr-table td {
          padding: 8px;
          border-bottom: 1px solid var(--border-color);
        }

        .rr-table-row {
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .rr-table-row:hover {
          background-color: var(--bg-card-hover);
        }

        .highlighted-row {
          background-color: rgba(99, 102, 241, 0.15) !important;
          border-left: 3px solid var(--color-accent);
        }

        .interest-level {
          background-color: rgba(255, 255, 255, 0.01);
        }

        .col-level {
          font-weight: 700;
        }

        .col-price {
          font-family: monospace;
          font-size: 11px;
        }

        .font-bold {
          font-weight: 700;
        }

        .small-risk {
          font-size: 9px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .fib-badge {
          padding: 2px 4px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 700;
        }

        .lvl-0236 { background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; }
        .lvl-0382 { background-color: rgba(52, 211, 153, 0.15); color: #34d399; }
        .lvl-0500 { background-color: rgba(251, 191, 36, 0.15); color: #fbbf24; }
        .lvl-0618 { background-color: rgba(167, 139, 250, 0.2); color: #c084fc; border: 1.5px solid rgba(167, 139, 250, 0.4); }
        .lvl-0730 { background-color: rgba(129, 140, 248, 0.15); color: #818cf8; }
        .lvl-0786 { background-color: rgba(244, 114, 182, 0.15); color: #f472b6; }
        .lvl-0820 { background-color: rgba(236, 72, 153, 0.15); color: #ec4899; }
        .lvl-0886 { background-color: rgba(251, 146, 60, 0.15); color: #fb923c; }
        .lvl-0950 { background-color: rgba(248, 113, 113, 0.15); color: #f87171; }

        .text-green { color: var(--color-up); }
        .text-red { color: var(--color-down); }
        .text-yellow { color: var(--color-warning); }
        .text-white { color: #ffffff; }
        .text-accent { color: #a5b4fc; }

        .empty-panel {
          font-size: 11px;
          color: var(--text-dim);
          text-align: center;
          padding: 24px 0;
          background-color: var(--bg-input);
          border-radius: 8px;
          border: 1px dotted var(--border-color);
        }

        .loading-spinner {
          border: 3px solid rgba(148, 163, 184, 0.1);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border-left-color: var(--color-accent);
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes pulseGlow {
          0% { opacity: 0.9; box-shadow: 0 0 5px rgba(245, 158, 11, 0.3); }
          50% { opacity: 1; box-shadow: 0 0 15px rgba(245, 158, 11, 0.6); }
          100% { opacity: 0.9; box-shadow: 0 0 5px rgba(245, 158, 11, 0.3); }
        }

        /* Responsive Layout */
        @media (max-width: 1200px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
            height: auto;
            overflow-y: auto;
          }
          
          .scanner-sidebar {
            height: 300px;
            border-right: none;
            border-bottom: 1px solid var(--border-color);
          }

          .chart-wrapper {
            height: 500px;
            border-right: none;
            border-bottom: 1px solid var(--border-color);
          }

          .info-panel {
            overflow-y: visible;
          }
        }

        /* Real-time Scanner Sidebar Styles */
        .scanner-sidebar {
          background-color: var(--bg-main);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          width: 280px;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
        }

        .dashboard-grid.scanner-collapsed .scanner-sidebar {
          width: 0px;
          opacity: 0;
          border-right: none;
        }

        .scanner-header {
          padding: 14px 16px;
          background-color: var(--bg-card);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .scanner-header .title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .scanner-header h3 {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          margin: 0;
        }

        .refresh-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 14px;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .refresh-btn:hover {
          background-color: var(--bg-input);
          color: var(--text-main);
        }

        .scanner-filter-tabs {
          display: flex;
          background-color: var(--bg-input);
          padding: 2px;
          border-radius: 6px;
          border: 1px solid var(--border-color);
        }

        .filter-tab {
          flex: 1;
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 5px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
          text-align: center;
        }

        .filter-tab:hover {
          color: var(--text-main);
        }

        .filter-tab.active {
          background-color: var(--bg-card-hover);
          color: #a5b4fc;
        }

        .scanner-list-container {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }

        .scanner-loading, .scanner-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 10px;
          color: var(--text-muted);
          font-size: 12px;
          text-align: center;
          gap: 12px;
        }

        .scanner-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .scanner-item {
          background-color: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 10px 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .scanner-item:hover {
          background-color: var(--bg-card-hover);
          border-color: var(--text-muted);
          transform: translateY(-1px);
        }

        .scanner-item.active {
          border-color: var(--color-accent);
          background-color: rgba(99, 102, 241, 0.08);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
        }

        .scanner-item.exclude {
          opacity: 0.45;
        }

        .scanner-item.exclude:hover {
          opacity: 0.75;
        }

        .item-main-row, .item-sub-row, .item-stats-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .item-symbol {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
        }

        .item-change {
          font-size: 12px;
          font-weight: 700;
        }

        .item-name {
          font-size: 10px;
          color: var(--text-muted);
          max-width: 140px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-price {
          font-size: 11px;
          font-family: monospace;
          color: var(--text-main);
        }

        .item-stats-row {
          margin-top: 2px;
          border-top: 1px dashed rgba(255, 255, 255, 0.04);
          padding-top: 6px;
          gap: 6px;
        }

        .value-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .value-badge.grade-우수 { background-color: rgba(16, 185, 129, 0.12); color: var(--color-up); }
        .value-badge.grade-보통 { background-color: rgba(99, 102, 241, 0.12); color: #a5b4fc; }
        .value-badge.grade-관망 { background-color: rgba(245, 158, 11, 0.12); color: var(--color-warning); }
        .value-badge.grade-제외 { background-color: rgba(255, 255, 255, 0.05); color: var(--text-dim); }

        .vol-pattern-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .vol-pattern-badge.pass { background-color: rgba(16, 185, 129, 0.12); color: var(--color-up); }
        .vol-pattern-badge.fail { background-color: rgba(239, 68, 68, 0.12); color: var(--color-down); }

        .item-score {
          font-size: 9px;
          color: var(--text-muted);
        }

        .item-analyzing {
          font-size: 9px;
          color: var(--text-dim);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
