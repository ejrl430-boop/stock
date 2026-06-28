export interface MarketIndexInfo {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  isAboveVwap: boolean;
  direction: "Bullish" | "Neutral" | "Bearish";
}

export interface SectorData {
  symbol: string;
  name: string;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeStrengthVsSPY: number;
  relativeStrengthVsQQQ: number;
  status: "Strong" | "Neutral" | "Weak";
}

export interface StockCandidate {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
  dollarVolume: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  is20DayHigh: boolean;
  is55DayHigh?: boolean;
  is52WkHighNear?: boolean;
  relativeStrengthVsSPY?: number;
  relativeStrengthVsQQQ?: number;
  score: number;
  grade: "A" | "B" | "C" | "EXCLUDE";
  reasons: string[];
  warnings: string[];
  memo?: string;
  isBioLowPrice?: boolean;
  isVolumeHighPriceTooLow?: boolean;
  isSpreadWide?: boolean;
  isNewsPumpSuspect?: boolean;
}

export interface ORBPlan {
  ticker: string;
  openingRangeHigh: number;
  openingRangeLow: number;
  vwap: number;
  pullbackLow: number;
  entryPrice: number;
  stopLoss: number;
  target1R: number;
  target2R: number;
  riskPercent: number;
  suggestedPositionSize: number;
  decision: "ENTRY_OK" | "WATCH" | "NO_TRADE";
}

export interface JournalEntry {
  id: string;
  date: string;
  symbol: string;
  sector: string;
  score: number;
  isTraded: boolean;
  entryPrice?: number;
  stopLoss?: number;
  target1R?: number;
  target2R?: number;
  resultPrice?: number;
  resultType?: "PROFIT_1R" | "PROFIT_2R" | "STOP_LOSS" | "BREAKEVEN" | "CLEARED_2355" | "NO_TRADE";
  rValue?: number;
  violations: string[];
  emotionInvolved: boolean;
  memo: string;
}

// Sector Mapping
export const SECTOR_MAP: Record<string, string> = {
  "SMH": "반도체",
  "SOXX": "반도체",
  "XLK": "기술주",
  "XLC": "커뮤니케이션",
  "XLY": "소비재/성장주",
  "XLF": "금융",
  "XLV": "헬스케어",
  "XBI": "바이오",
  "IBB": "바이오",
  "XLE": "에너지",
  "XLI": "산업재",
  "ARKK": "고성장주 투심",
};

/**
 * Evaluates overall market status based on SPY and QQQ
 */
export function evaluateMarketStatus(indices: MarketIndexInfo[]): {
  status: "LONG 가능" | "선별 매매" | "신규 롱 매매 금지";
  color: "text-green" | "text-yellow" | "text-red";
  description: string;
} {
  const spy = indices.find((i) => i.symbol === "SPY");
  const qqq = indices.find((i) => i.symbol === "QQQ");

  if (!spy || !qqq) {
    return {
      status: "선별 매매",
      color: "text-yellow",
      description: "지수 데이터가 부족하여 중립 판정합니다.",
    };
  }

  const bothPositive = spy.changePercent > 0 && qqq.changePercent > 0;
  const bothAboveVwap = spy.isAboveVwap && qqq.isAboveVwap;
  const bothNegative = spy.changePercent < 0 && qqq.changePercent < 0;
  const bothBelowVwap = !spy.isAboveVwap && !qqq.isAboveVwap;

  if (bothPositive && bothAboveVwap) {
    return {
      status: "LONG 가능",
      color: "text-green",
      description: "SPY와 QQQ가 모두 플러스 등락률이며 VWAP 위에 있어 적극적인 돌파/눌림 매수 진입이 가능합니다.",
    };
  } else if (bothNegative || bothBelowVwap) {
    return {
      status: "신규 롱 매매 금지",
      color: "text-red",
      description: "지수가 동반 하락하거나 VWAP 아래에 있어 하방 압력이 큽니다. 신규 매수를 전면 금지합니다.",
    };
  } else {
    return {
      status: "선별 매매",
      color: "text-yellow",
      description: "지수의 흐름이 엇갈리거나 약보합세입니다. 섹터 및 주도주 강도가 아주 뚜렷한 종목만 선별 매매해야 합니다.",
    };
  }
}

/**
 * Process and rank Sector ETFs
 */
export function processSectors(
  rawSectors: { symbol: string; changePercent: number; volume: number; avgVolume: number }[],
  spyChange: number,
  qqqChange: number
): SectorData[] {
  return rawSectors.map((s) => {
    const relativeStrength = s.changePercent - Math.max(spyChange, qqqChange);
    const rsSpy = s.changePercent - spyChange;
    const rsQqq = s.changePercent - qqqChange;
    
    // Status Logic: Positive + stronger than benchmarks + volume ratio > 1.0 -> Strong
    const isPositive = s.changePercent > 0;
    const isStrongerThanIndices = s.changePercent > spyChange || s.changePercent > qqqChange;
    const isVolumeUp = s.volume > s.avgVolume;
    
    let status: "Strong" | "Neutral" | "Weak" = "Neutral";
    if (isPositive && isStrongerThanIndices && isVolumeUp) {
      status = "Strong";
    } else if (s.changePercent < 0 && s.changePercent < Math.min(spyChange, qqqChange)) {
      status = "Weak";
    }

    return {
      symbol: s.symbol,
      name: SECTOR_MAP[s.symbol] || "기타",
      changePercent: s.changePercent,
      volume: s.volume,
      avgVolume: s.avgVolume,
      relativeStrengthVsSPY: Number(rsSpy.toFixed(2)),
      relativeStrengthVsQQQ: Number(rsQqq.toFixed(2)),
      status,
    };
  });
}

/**
 * Calculates candidate score and sets final grades
 */
export function scoreCandidate(
  c: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings">,
  strongSectors: string[],
  dollarVolumeStats: { top10: number; top30: number; avg: number }
): StockCandidate {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let isExcluded = false;

  // 1. Sector Strength (25 points)
  const isStrongSector = strongSectors.includes(c.sector);
  if (isStrongSector) {
    score += 25;
    reasons.push("오늘의 주도 섹터 소속 (+25점)");
  } else {
    score += 10;
    reasons.push("중립 섹터 소속 (+10점)");
  }

  // 2. Liquidity / Dollar Volume (20 points)
  if (c.dollarVolume >= dollarVolumeStats.top10) {
    score += 20;
    reasons.push(`거래대금 최상위 10% 이내 ($${(c.dollarVolume / 1000000).toFixed(1)}M, +20점)`);
  } else if (c.dollarVolume >= dollarVolumeStats.top30) {
    score += 15;
    reasons.push(`거래대금 상위 30% 이내 ($${(c.dollarVolume / 1000000).toFixed(1)}M, +15점)`);
  } else if (c.dollarVolume >= dollarVolumeStats.avg) {
    score += 10;
    reasons.push("거래대금 평균 이상 (+10점)");
  } else {
    warnings.push("거래대금이 평균 미달 수준으로 다소 낮음");
  }

  // 3. Change Percent 적정성 (15 points)
  if (c.changePercent >= 2 && c.changePercent <= 7) {
    score += 15;
    reasons.push(`상승 등락률 적정 범위 +2%~+7% (${c.changePercent.toFixed(1)}%, +15점)`);
  } else if (c.changePercent > 7 && c.changePercent <= 12) {
    score += 10;
    reasons.push(`상승 등락률 양호 범위 +7%~+12% (${c.changePercent.toFixed(1)}%, +10점)`);
  } else if (c.changePercent > 12 && c.changePercent <= 20) {
    score += 5;
    reasons.push(`등락률 다소 과열 범위 +12%~+20% (${c.changePercent.toFixed(1)}%, +5점)`);
  } else if (c.changePercent > 20) {
    warnings.push(`⚠️ 등락률 과열 경계 (+20% 초과, ${c.changePercent.toFixed(1)}%)`);
  }

  // 4. Price Stability (10 points)
  if (c.price >= 20) {
    score += 10;
    reasons.push(`안정적 중대형가 조건 $20 이상 ($${c.price.toFixed(2)}, +10점)`);
  } else if (c.price >= 10 && c.price < 20) {
    score += 5;
    reasons.push(`양호한 중저가 조건 $10~$20 ($${c.price.toFixed(2)}, +5점)`);
  } else {
    isExcluded = true;
    warnings.push("❌ 10달러 미만 동전주 조건 제외");
  }

  // 5. New High / Breakout Condition (15 points)
  if (c.is20DayHigh) {
    score += 10;
    reasons.push("20일 신고가 달성 (+10점)");
  }
  if (c.is55DayHigh || c.is52WkHighNear) {
    score += 5;
    reasons.push("55일 신고가 혹은 52주 신고가 근접 (+5점)");
  }

  // 6. Relative Strength vs Indices (10 points)
  const isStrongerThanSPY = c.relativeStrengthVsSPY !== undefined && c.relativeStrengthVsSPY > 0;
  const isStrongerThanQQQ = c.relativeStrengthVsQQQ !== undefined && c.relativeStrengthVsQQQ > 0;
  
  if (isStrongerThanSPY && isStrongerThanQQQ) {
    score += 10;
    reasons.push("시장(SPY/QQQ) 대비 압도적 강세 (+10점)");
  } else if (isStrongerThanSPY || isStrongerThanQQQ) {
    score += 5;
    reasons.push("시장 평균 대비 양호한 상대적 강세 (+5점)");
  }

  // 7. Risk Penalties (Reductions of 10 points each)
  if (c.isBioLowPrice) {
    score -= 10;
    warnings.push("⚠️ 리스크 페널티: 저가 바이오 급등주 성격 (-10점)");
  }
  if (c.changePercent > 20) {
    score -= 10;
    warnings.push("⚠️ 리스크 페널티: 등락률 20% 초과 오버슈팅 (-10점)");
  }
  if (c.isVolumeHighPriceTooLow) {
    score -= 10;
    warnings.push("⚠️ 리스크 페널티: 거래량은 많지만 가격이 낮음 (-10점)");
  }
  if (c.isSpreadWide) {
    score -= 10;
    warnings.push("⚠️ 리스크 페널티: 호가 스프레드가 넓고 슬리피지 우려 (-10점)");
  }
  if (c.isNewsPumpSuspect) {
    score -= 10;
    warnings.push("⚠️ 리스크 페널티: 특정 테마성/뉴스 펌핑 의심 (-10점)");
  }

  // Final Grade Assessment
  let grade: "A" | "B" | "C" | "EXCLUDE" = "C";
  if (isExcluded || score < 50) {
    grade = "EXCLUDE";
  } else if (score >= 80) {
    grade = "A";
  } else if (score >= 65) {
    grade = "B";
  } else {
    grade = "C";
  }

  return {
    ...c,
    score: Math.min(100, Math.max(0, score)),
    grade,
    reasons,
    warnings,
  };
}

/**
 * Processes raw candidates list, sorts them by score, and applies grading
 */
export function processCandidatesList(
  candidates: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings">[],
  strongSectors: string[]
): StockCandidate[] {
  if (candidates.length === 0) return [];

  // Calculate statistics for dollarVolume
  const dollarVolumes = candidates.map((c) => c.dollarVolume).sort((a, b) => b - a);
  const total = dollarVolumes.length;
  
  const top10Val = dollarVolumes[Math.floor(total * 0.1)] || 0;
  const top30Val = dollarVolumes[Math.floor(total * 0.3)] || 0;
  const avgVal = dollarVolumes.reduce((sum, v) => sum + v, 0) / total;

  const stats = { top10: top10Val, top30: top30Val, avg: avgVal };

  return candidates
    .map((c) => scoreCandidate(c, strongSectors, stats))
    .sort((a, b) => b.score - a.score);
}

/**
 * Calculates ORB Plan position sizes and target bounds
 */
export function calculateORBPlan(
  ticker: string,
  rangeHigh: number,
  rangeLow: number,
  vwap: number,
  pullbackLow: number,
  entryPrice: number,
  stopLoss: number,
  checklistYesCount: number,
  currentTimeStr?: string // e.g. "23:45"
): ORBPlan {
  // 1. Calculate Risk Percent
  const riskPercent = entryPrice > stopLoss ? ((entryPrice - stopLoss) / entryPrice) * 100 : 0;
  
  // 2. Calculate Targets
  const riskAmount = entryPrice - stopLoss;
  const target1R = entryPrice + riskAmount * 1.5;
  const target2R = entryPrice + riskAmount * 3.0; // Dynamic 2R Target or Peak target

  // 3. Position Sizing: 1 Trade loss limit = 5,000 Won
  const maxLossLimit = 5000;
  let suggestedPositionSize = 0;
  if (riskPercent > 0) {
    // position size = maxLossLimit / (riskPercent / 100)
    suggestedPositionSize = Math.floor(maxLossLimit / (riskPercent / 100));
  }

  // 4. Decision Logic
  let decision: "ENTRY_OK" | "WATCH" | "NO_TRADE" = "NO_TRADE";
  
  const isTimeRestricted = currentTimeStr ? isTimeOver(currentTimeStr, "23:40") : false;
  const isRiskTooHigh = riskPercent > 5.0; // 5% risk check
  const isChecklistMet = checklistYesCount >= 10;
  const isWatchlistMet = checklistYesCount >= 8;

  if (isTimeRestricted || isRiskTooHigh || !isChecklistMet) {
    if (isChecklistMet && isRiskTooHigh) {
      decision = "NO_TRADE"; // Stop loss width exceeded
    } else if (isWatchlistMet && !isTimeRestricted) {
      decision = "WATCH";
    } else {
      decision = "NO_TRADE";
    }
  } else {
    decision = "ENTRY_OK";
  }

  return {
    ticker,
    openingRangeHigh: rangeHigh,
    openingRangeLow: rangeLow,
    vwap,
    pullbackLow,
    entryPrice,
    stopLoss,
    target1R: Number(target1R.toFixed(4)),
    target2R: Number(target2R.toFixed(4)),
    riskPercent: Number(riskPercent.toFixed(2)),
    suggestedPositionSize,
    decision,
  };
}

/**
 * Checks if current time is equal or past restricted time boundary
 */
function isTimeOver(currentTime: string, limitTime: string): boolean {
  try {
    const [cHour, cMin] = currentTime.split(":").map(Number);
    const [lHour, lMin] = limitTime.split(":").map(Number);

    if (cHour > lHour) return true;
    if (cHour === lHour && cMin >= lMin) return true;
    return false;
  } catch (e) {
    return false;
  }
}
