import { CandleData } from "./dataProvider";

export interface BreakoutDetectionResult {
  index: number;
  candle: CandleData;
  low: number; // The START LOW price
}

export interface PeakDetectionResult {
  index: number;
  price: number; // The HIGH price
}

export interface FibonacciLevel {
  level: number; // e.g., 0.382
  price: number; // Calculated price
  isInterest: boolean; // true if it's 0.5, 0.618, 0.730, 0.786
}

// 10 Fibonacci levels defined by user
export const FIB_LEVELS = [0.236, 0.382, 0.500, 0.618, 0.730, 0.786, 0.820, 0.886, 0.950, 1.000];

// Key Fibonacci levels to watch for bounce checklist
export const INTEREST_LEVELS = [0.500, 0.618, 0.730, 0.786];

/**
 * Returns a local date string (YYYY-MM-DD) based on UNIX timestamp.
 * Handled based on Local/Korean Time.
 */
export function getLocalDateString(time: number): string {
  const date = new Date(time * 1000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Finds the absolute peak high price in the entire candle array.
 */
export function detectPeakHighAll(candles: CandleData[]): PeakDetectionResult {
  if (candles.length === 0) {
    throw new Error("Candles array is empty");
  }

  let peakHigh = candles[0].high;
  let peakIndex = 0;

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].high > peakHigh) {
      peakHigh = candles[i].high;
      peakIndex = i;
    }
  }

  return {
    index: peakIndex,
    price: peakHigh,
  };
}

/**
 * Detects the first breakout candle within a specific target date:
 * 1. Bullish candle: close > open
 * 2. Increase rate >= 3% compared to previous close
 * 3. Volume >= 3x of the average volume of the previous 20 candles
 * 4. High price breaks the maximum high of the previous 20 candles
 */
export function detectBreakoutCandleOnDate(
  candles: CandleData[],
  targetDate: string
): BreakoutDetectionResult | null {
  if (candles.length < 21) {
    return null;
  }

  for (let i = 20; i < candles.length; i++) {
    const current = candles[i];
    const currentDateStr = getLocalDateString(current.time);

    if (currentDateStr !== targetDate) continue;

    const prevClose = candles[i - 1].close;

    if (current.close <= current.open) continue;

    const increaseRate = (current.close - prevClose) / prevClose;
    if (increaseRate < 0.03) continue;

    const prev20 = candles.slice(i - 20, i);

    const avgVolume = prev20.reduce((sum, c) => sum + c.volume, 0) / 20;
    if (current.volume < avgVolume * 3) continue;

    const maxHigh = Math.max(...prev20.map((c) => c.high));
    if (current.high <= maxHigh) continue;

    return {
      index: i,
      candle: current,
      low: current.low,
    };
  }

  return null;
}

/**
 * Detects the first breakout candle in the entire history (Legacy fallback)
 */
export function detectBreakoutCandle(candles: CandleData[]): BreakoutDetectionResult | null {
  if (candles.length < 21) return null;

  for (let i = 20; i < candles.length; i++) {
    const current = candles[i];
    const prevClose = candles[i - 1].close;

    if (current.close <= current.open) continue;

    const increaseRate = (current.close - prevClose) / prevClose;
    if (increaseRate < 0.03) continue;

    const prev20 = candles.slice(i - 20, i);
    const avgVolume = prev20.reduce((sum, c) => sum + c.volume, 0) / 20;
    if (current.volume < avgVolume * 3) continue;

    const maxHigh = Math.max(...prev20.map((c) => c.high));
    if (current.high <= maxHigh) continue;

    return {
      index: i,
      candle: current,
      low: current.low,
    };
  }

  return null;
}

/**
 * Finds the peak high price starting from the breakout candle index to the end.
 */
export function detectPeakHigh(candles: CandleData[], breakoutIndex: number): PeakDetectionResult {
  if (breakoutIndex < 0 || breakoutIndex >= candles.length) {
    throw new Error("Invalid breakout index");
  }

  let peakHigh = candles[breakoutIndex].high;
  let peakIndex = breakoutIndex;

  for (let i = breakoutIndex + 1; i < candles.length; i++) {
    if (candles[i].high > peakHigh) {
      peakHigh = candles[i].high;
      peakIndex = i;
    }
  }

  return {
    index: peakIndex,
    price: peakHigh,
  };
}

/**
 * Calculates Fibonacci retracement price levels.
 * Formula: fib price = high - (high - low) * level
 */
export function calculateFibonacciLevels(low: number, high: number): FibonacciLevel[] {
  const range = high - low;
  
  return FIB_LEVELS.map((level) => {
    const price = high - range * level;
    const isInterest = INTEREST_LEVELS.includes(level);
    return {
      level,
      price: Number(price.toFixed(4)),
      isInterest,
    };
  });
}

/**
 * Check if the current price is near any of the key interest levels
 */
export function getNearInterestLevels(
  currentPrice: number,
  fibLevels: FibonacciLevel[],
  thresholdPercent = 0.5
): FibonacciLevel[] {
  const threshold = thresholdPercent / 100;
  
  return fibLevels.filter((fib) => {
    if (!fib.isInterest) return false;
    const diffPercent = Math.abs(currentPrice - fib.price) / fib.price;
    return diffPercent <= threshold;
  });
}

// ==========================================
// 보조지표 계산 로직 (RSI, EMA, SMA)
// ==========================================

/**
 * Calculates RSI(14) using Wilder's smoothing technique.
 * Returns an array of RSI values aligned with candles.
 */
export function calculateRSI(candles: CandleData[], period = 14): number[] {
  const rsi: number[] = [];
  if (candles.length === 0) return [];
  if (candles.length <= period) {
    return Array(candles.length).fill(50);
  }

  let gains = 0;
  let losses = 0;

  // First change values
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < period; i++) {
    rsi.push(50); // padding for initial period
  }
  
  rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));
  }

  return rsi;
}

/**
 * Calculates Exponential Moving Average (EMA).
 */
export function calculateEMA(candles: CandleData[], period: number): number[] {
  const ema: number[] = [];
  if (candles.length === 0) return [];
  if (candles.length < period) {
    return Array(candles.length).fill(candles[candles.length - 1]?.close ?? 0);
  }

  // Calculate initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  const initialSMA = sum / period;

  for (let i = 0; i < period - 1; i++) {
    ema.push(candles[i].close);
  }
  ema.push(Number(initialSMA.toFixed(4)));

  const k = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    const nextVal = candles[i].close * k + ema[i - 1] * (1 - k);
    ema.push(Number(nextVal.toFixed(4)));
  }

  return ema;
}

/**
 * Calculates Simple Moving Average (SMA).
 */
export function calculateSMA(candles: CandleData[], period: number): number[] {
  const sma: number[] = [];
  if (candles.length === 0) return [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      sma.push(candles[i].close);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      sma.push(Number((sum / period).toFixed(4)));
    }
  }

  return sma;
}

// ==========================================
// 점수 시스템 및 반등 체크리스트
// ==========================================

export interface ScoreBreakdown {
  total: number;
  grade: string;
  trend: number;
  fibonacci: number;
  volume: number;
  rsi: number;
  candle: number;
  reasons: string[];
  // 추가 거래대금 및 거래량 패턴 정보
  valueGrade: string; // "우수", "보통", "관망", "제외"
  valueUsd: number;
  volumePatternPassed: boolean;
  volumePatternStatus: string;
}

/**
 * Momentum Alive Score (급등 지속 가능성 점수) 계산
 */
export function calculateMomentumScore(
  candles: CandleData[],
  fibLevels: FibonacciLevel[],
  breakoutIndex: number | null,
  peakIndex: number | null
): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    total: 0,
    grade: "관망",
    trend: 0,
    fibonacci: 0,
    volume: 0,
    rsi: 0,
    candle: 0,
    reasons: [],
    valueGrade: "제외",
    valueUsd: 0,
    volumePatternPassed: false,
    volumePatternStatus: "데이터 부족",
  };

  if (candles.length < 5 || fibLevels.length === 0) {
    breakdown.reasons.push("데이터 부족으로 점수 연산 불가");
    return breakdown;
  }

  const lastIdx = candles.length - 1;
  const currentPrice = candles[lastIdx].close;
  const avgVolume20 = candles.slice(Math.max(0, lastIdx - 20), lastIdx).reduce((s, c) => s + c.volume, 0) / 20;

  // 당일 거래대금 계산 (마지막 봉과 동일한 날짜의 봉 거래량 합산)
  const lastDateStr = getLocalDateString(candles[lastIdx].time);
  const todayCandles = candles.filter(c => getLocalDateString(c.time) === lastDateStr);
  const todayVolume = todayCandles.reduce((sum, c) => sum + c.volume, 0);
  const valueUsd = Math.round(todayVolume * currentPrice);
  breakdown.valueUsd = valueUsd;

  if (valueUsd >= 10000000) {
    breakdown.valueGrade = "우수";
    breakdown.reasons.push(`당일 거래대금 우수: $${(valueUsd / 1000000).toFixed(2)}M (>= $10M)`);
  } else if (valueUsd >= 5000000) {
    breakdown.valueGrade = "보통";
    breakdown.reasons.push(`당일 거래대금 보통: $${(valueUsd / 1000000).toFixed(2)}M (>= $5M)`);
  } else if (valueUsd >= 1000000) {
    breakdown.valueGrade = "관망";
    breakdown.reasons.push(`당일 거래대금 관망: $${(valueUsd / 1000000).toFixed(2)}M (>= $1M)`);
  } else {
    breakdown.valueGrade = "제외";
    breakdown.reasons.push(`⚠️ 당일 거래대금 미흡: $${(valueUsd / 1000000).toFixed(2)}M (< $1M, 제외 대상)`);
  }

  // 거래량 3단계 분석
  let volStep1 = false; // 돌파 시 터짐
  let volStep2 = false; // 눌림 시 줆
  let volStep3 = false; // 반등 시 늚

  if (breakoutIndex !== null && breakoutIndex >= 0 && breakoutIndex < candles.length) {
    // 1단계: 돌파 시 거래량 터짐 검증
    const preBreakoutCandles = candles.slice(Math.max(0, breakoutIndex - 20), breakoutIndex);
    const avgPreVol = preBreakoutCandles.length > 0 
      ? preBreakoutCandles.reduce((s, c) => s + c.volume, 0) / preBreakoutCandles.length
      : 1;
    const boVol = candles[breakoutIndex].volume;
    if (boVol >= avgPreVol * 2.5) {
      volStep1 = true;
    }

    // 2단계: 고점 이후 눌림 시 거래량 감소 검증
    const peakIdx = peakIndex !== null ? peakIndex : breakoutIndex;
    if (peakIdx >= breakoutIndex && peakIdx < candles.length) {
      const retracementCandles = candles.slice(peakIdx + 1, lastIdx + 1);
      const downCandles = retracementCandles.filter(c => c.close < c.open);
      
      if (downCandles.length > 0) {
        const avgDownVol = downCandles.reduce((sum, c) => sum + c.volume, 0) / downCandles.length;
        if (avgDownVol <= boVol * 0.40) {
          volStep2 = true;
        } else {
          breakdown.reasons.push("⚠️ 눌림(조정) 거래량이 돌파 분출량 대비 과다함");
        }
      } else {
        volStep2 = true; // 음봉이 아예 없는 초강세 지대
      }
    }

    // 3단계: 반등 시 거래량 증가 검증
    let bounceDetected = false;
    for (let i = Math.max(breakoutIndex, lastIdx - 4); i <= lastIdx; i++) {
      if (i > 0 && candles[i].close > candles[i].open) {
        const currentVol = candles[i].volume;
        const prevVol = candles[i - 1].volume;
        if (candles[i - 1].close < candles[i - 1].open && currentVol > prevVol) {
          bounceDetected = true;
          break;
        }
        if (currentVol > avgVolume20 * 1.2) {
          bounceDetected = true;
          break;
        }
      }
    }
    if (bounceDetected) {
      volStep3 = true;
    } else {
      breakdown.reasons.push("⚠️ 지지 반등 양봉 시 거래량 유입 미흡");
    }
  }

  // 거래량 3단계 종합 평가
  if (breakoutIndex === null) {
    breakdown.volumePatternStatus = "돌파점 미확인";
    breakdown.volumePatternPassed = false;
  } else if (volStep1 && volStep2 && volStep3) {
    breakdown.volumePatternStatus = "합격";
    breakdown.volumePatternPassed = true;
    breakdown.reasons.push("✨ 거래량 3단계 패턴 통과 (급등 시 터짐 -> 눌림 시 감소 -> 반등 시 증가) (+5)");
  } else {
    const failedSteps = [];
    if (!volStep1) failedSteps.push("돌파 분출 부족");
    if (!volStep2) failedSteps.push("조정 거래량 과다");
    if (!volStep3) failedSteps.push("반등 거래량 미흡");
    breakdown.volumePatternStatus = failedSteps.join(", ");
    breakdown.volumePatternPassed = false;
  }

  // Calculate Indicators
  const ema5 = calculateEMA(candles, 5);
  const ema20 = calculateEMA(candles, 20);
  const sma60 = calculateSMA(candles, 60);
  const sma120 = calculateSMA(candles, 120);
  const rsiVal = calculateRSI(candles, 14);

  // 1. 추세 구조 (최대 25점)
  let trendScore = 0;
  if (currentPrice > ema20[lastIdx]) {
    trendScore += 5;
    breakdown.reasons.push("현재가가 20 EMA 위 유지 (+5)");
  } else {
    breakdown.reasons.push("현재가가 20 EMA 아래로 이탈");
  }
  if (currentPrice > sma60[lastIdx]) {
    trendScore += 5;
    breakdown.reasons.push("현재가가 60 SMA 위 유지 (+5)");
  }
  if (currentPrice > sma120[lastIdx]) {
    trendScore += 5;
    breakdown.reasons.push("현재가가 120 SMA 위 유지 (+5)");
  }
  // 20 EMA 기울기 상승
  const slope20 = ema20[lastIdx] - ema20[lastIdx - 1];
  if (slope20 > 0) {
    trendScore += 5;
    breakdown.reasons.push("20 EMA 기울기 상승세 (+5)");
  }
  if (ema5[lastIdx] > ema20[lastIdx]) {
    trendScore += 5;
    breakdown.reasons.push("5 EMA > 20 EMA 골든크로스 상태 (+5)");
  }
  breakdown.trend = trendScore;

  // 2. 피보나치 지지 유지력 (최대 25점)
  let fibScore = 0;
  const fib050 = fibLevels.find(f => f.level === 0.500)?.price ?? 0;
  const fib0618 = fibLevels.find(f => f.level === 0.618)?.price ?? 0;
  const fib0786 = fibLevels.find(f => f.level === 0.786)?.price ?? 0;

  if (currentPrice > fib050) {
    fibScore += 8;
    breakdown.reasons.push("0.500 레벨 위 지지 중 (+8)");
  }
  if (currentPrice > fib0618) {
    fibScore += 8;
    breakdown.reasons.push("0.618 레벨 위 지지 중 (+8)");
  }

  // 0.500 또는 0.618 이탈 후 즉시 회복 여부 (최근 5봉)
  let quickRecover = false;
  for (let i = Math.max(0, lastIdx - 4); i < lastIdx; i++) {
    const low = candles[i].low;
    const close = candles[i].close;
    if ((low < fib050 && close >= fib050) || (low < fib0618 && close >= fib0618)) {
      quickRecover = true;
      break;
    }
  }
  if (quickRecover) {
    fibScore += 9;
    breakdown.reasons.push("주요 레벨(0.500/0.618) 이탈 후 즉시 복구 흔적 감지 (+9)");
  }

  // 0.786 아래 지속 체류 감점 (-10)
  let stayBelow786Count = 0;
  for (let i = Math.max(0, lastIdx - 4); i <= lastIdx; i++) {
    if (candles[i].close < fib0786) {
      stayBelow786Count++;
    }
  }
  if (stayBelow786Count >= 3) {
    fibScore -= 10;
    breakdown.reasons.push("⚠️ 0.786 레벨 아래 장기 체류 중 (-10)");
  }
  breakdown.fibonacci = Math.max(0, fibScore);

  // 3. 거래량 구조 (최대 20점)
  let volScore = 0;
  if (breakdown.volumePatternPassed) {
    volScore += 10; // 3단계 패턴 통과 시 10점 부여
  }

  const isDownCandle = candles[lastIdx].close < candles[lastIdx].open;
  const isUpCandle = candles[lastIdx].close > candles[lastIdx].open;
  
  if (isDownCandle && candles[lastIdx].volume < avgVolume20) {
    volScore += 5;
    breakdown.reasons.push("눌림(음봉) 구간 거래량 감소 - 건전한 조정 (+5)");
  } else if (isUpCandle && candles[lastIdx].volume > candles[lastIdx - 1].volume) {
    volScore += 5;
    breakdown.reasons.push("반등(양봉) 구간 거래량 증가 (+5)");
  }

  if (isDownCandle && candles[lastIdx].volume > avgVolume20 * 1.5) {
    volScore -= 10;
    breakdown.reasons.push("⚠️ 하락 봉 거래량 재급증 - 매도세 강함 (-10)");
  }

  if (peakIndex !== null && lastIdx > peakIndex) {
    const postPeakVol = candles.slice(peakIndex + 1).reduce((s, c) => s + c.volume, 0) / (lastIdx - peakIndex);
    const prePeakVol = candles.slice(Math.max(0, peakIndex - 20), peakIndex + 1).reduce((s, c) => s + c.volume, 0) / (peakIndex - Math.max(0, peakIndex - 20) + 1);
    if (postPeakVol < prePeakVol * 0.25) {
      volScore -= 5;
      breakdown.reasons.push("⚠️ 고점 형성 후 거래량 완전 급감 (-5)");
    }
  }
  breakdown.volume = Math.max(0, volScore);

  // 4. RSI 구조 (최대 15점)
  let rsiScore = 0;
  const currentRsi = rsiVal[lastIdx] ?? 50;

  if (currentRsi > 50) {
    rsiScore += 7;
    breakdown.reasons.push("RSI > 50 강세 구간 위치 (+7)");
  }
  
  if ((rsiVal[lastIdx] ?? 50) > (rsiVal[lastIdx - 1] ?? 50) && (rsiVal[lastIdx - 1] ?? 50) > (rsiVal[lastIdx - 2] ?? 50)) {
    rsiScore += 8;
    breakdown.reasons.push("RSI 상승 전환 확인 (+8)");
  }

  let rsiBelow45Count = 0;
  for (let i = Math.max(0, lastIdx - 4); i <= lastIdx; i++) {
    if ((rsiVal[i] ?? 50) < 45) rsiBelow45Count++;
  }
  if (rsiBelow45Count >= 3) {
    rsiScore -= 5;
    breakdown.reasons.push("⚠️ RSI 45 이하 지속 체류 (-5)");
  }

  let rsiDivergence = false;
  if (peakIndex !== null && lastIdx > peakIndex + 2) {
    const recentMaxPriceIdx = candles.slice(peakIndex + 1).reduce((maxIdx, c, idx) => c.high > candles[maxIdx].high ? peakIndex + 1 + idx : maxIdx, peakIndex + 1);
    if (candles[recentMaxPriceIdx].high > candles[peakIndex].high && (rsiVal[recentMaxPriceIdx] ?? 50) < (rsiVal[peakIndex] ?? 50)) {
      rsiDivergence = true;
    }
  }
  if (rsiDivergence) {
    rsiScore -= 5;
    breakdown.reasons.push("⚠️ 가격 고점 상승 대비 RSI 고점 하락 다이버전스 감지 (-5)");
  }
  breakdown.rsi = Math.max(0, rsiScore);

  // 5. 캔들 구조 (최대 15점)
  let candleScore = 0;

  let higherLow = false;
  if (lastIdx >= 10) {
    const recentLows = candles.slice(lastIdx - 9, lastIdx + 1).map(c => c.low);
    const chunk1 = Math.min(...recentLows.slice(0, 5));
    const chunk2 = Math.min(...recentLows.slice(5));
    if (chunk2 > chunk1) {
      higherLow = true;
    }
  }
  if (higherLow) {
    candleScore += 5;
    breakdown.reasons.push("최근 캔들 저점 상승 (Higher Low) (+5)");
  }

  const prevMaxClose = Math.max(...candles.slice(Math.max(0, lastIdx - 5), lastIdx).map(c => c.close));
  if (candles[lastIdx].close > prevMaxClose) {
    candleScore += 5;
    breakdown.reasons.push("최근 5봉 내 최고가 돌파 발생 (+5)");
  }

  let doubleBottomSupport = false;
  if (lastIdx >= 10) {
    const minLow10 = Math.min(...candles.slice(lastIdx - 10, lastIdx - 2).map(c => c.low));
    const recentLows2 = candles.slice(lastIdx - 2).map(c => c.low);
    if (Math.min(...recentLows2) > minLow10) {
      doubleBottomSupport = true;
    }
  }
  if (doubleBottomSupport) {
    candleScore += 5;
    breakdown.reasons.push("재눌림 시 이전 저점 지지력 유지 (+5)");
  }

  let longUpperWickCount = 0;
  for (let i = Math.max(0, lastIdx - 4); i <= lastIdx; i++) {
    const body = Math.abs(candles[i].close - candles[i].open);
    const upperWick = candles[i].high - Math.max(candles[i].close, candles[i].open);
    if (upperWick > body * 1.5 && upperWick > 0) {
      longUpperWickCount++;
    }
  }
  if (longUpperWickCount >= 2) {
    candleScore -= 5;
    breakdown.reasons.push("⚠️ 윗꼬리가 긴 캔들 반복 출현 - 매물 출회 (-5)");
  }
  breakdown.candle = Math.max(0, candleScore);

  // Total Score 계산 (A+B+C+D+E)
  breakdown.total = Math.min(100, Math.max(0, breakdown.trend + breakdown.fibonacci + breakdown.volume + breakdown.rsi + breakdown.candle));

  // 등급 산출
  if (breakdown.total >= 80) {
    breakdown.grade = "매우 강함 / 급등 구조 살아있음";
  } else if (breakdown.total >= 65) {
    breakdown.grade = "양호 / 눌림 반등 후보";
  } else if (breakdown.total >= 50) {
    breakdown.grade = "중립 / 관찰 필요";
  } else if (breakdown.total >= 35) {
    breakdown.grade = "약화 / 진입 주의";
  } else {
    breakdown.grade = "붕괴 위험 / 관망";
  }

  return breakdown;
}

export interface BounceChecklistItem {
  reached: boolean;
  tail: boolean;
  recover: boolean;
  closeAbove: boolean;
  breakout: boolean;
  volumeUp: boolean;
  doubleBottom: boolean;
  status: string;
  satisfyCount: number;
}

export interface BounceChecklist {
  [level: number]: BounceChecklistItem;
}

/**
 * 각 주요 피보나치 레벨별 반등 확인 체크리스트 계산
 */
export function calculateBounceChecklist(
  candles: CandleData[],
  fibLevels: FibonacciLevel[],
  activeStartIndex: number | null
): BounceChecklist {
  const checklist: BounceChecklist = {};
  if (candles.length === 0 || fibLevels.length === 0 || activeStartIndex === null) return checklist;

  const lastIdx = candles.length - 1;
  const recentCandles = candles.slice(activeStartIndex);

  INTEREST_LEVELS.forEach((level) => {
    const fibPrice = fibLevels.find((f) => f.level === level)?.price ?? 0;
    if (fibPrice === 0) return;

    const reached = recentCandles.some((c) => c.low <= fibPrice);

    const tail = recentCandles.some((c) => {
      if (c.low > fibPrice * 1.01) return false;
      const body = Math.abs(c.close - c.open);
      const lowerWick = Math.min(c.close, c.open) - c.low;
      return lowerWick > body * 1.2 && lowerWick > 0;
    });

    const recover = recentCandles.some((c) => c.low < fibPrice && c.close >= fibPrice);

    const closeAbove = candles[lastIdx].close >= fibPrice;

    let breakout = false;
    if (reached && lastIdx >= 5) {
      const currentClose = candles[lastIdx].close;
      const prev4MaxHigh = Math.max(...candles.slice(lastIdx - 5, lastIdx).map(c => c.high));
      breakout = currentClose > prev4MaxHigh && candles[lastIdx].close > candles[lastIdx].open;
    }

    let volumeUp = false;
    for (let i = Math.max(activeStartIndex, lastIdx - 4); i <= lastIdx; i++) {
      if (i > 0 && candles[i].close > candles[i].open && candles[i].volume > candles[i - 1].volume) {
        volumeUp = true;
        break;
      }
    }

    let doubleBottom = false;
    if (reached) {
      const reachedIndices: number[] = [];
      recentCandles.forEach((c, idx) => {
        if (c.low <= fibPrice) reachedIndices.push(activeStartIndex + idx);
      });
      if (reachedIndices.length >= 2) {
        const firstReachIdx = reachedIndices[0];
        const lastReachIdx = reachedIndices[reachedIndices.length - 1];
        let bounceOccurred = false;
        for (let idx = firstReachIdx + 1; idx < lastReachIdx; idx++) {
          if (candles[idx].close > fibPrice * 1.005) {
            bounceOccurred = true;
            break;
          }
        }
        if (bounceOccurred && candles[lastReachIdx].low >= candles[firstReachIdx].low) {
          doubleBottom = true;
        }
      } else if (reachedIndices.length === 1) {
        doubleBottom = candles[lastIdx].low > candles[reachedIndices[0]].low;
      }
    }

    let satisfyCount = 0;
    if (reached) satisfyCount++;
    if (tail) satisfyCount++;
    if (recover) satisfyCount++;
    if (closeAbove) satisfyCount++;
    if (breakout) satisfyCount++;
    if (volumeUp) satisfyCount++;
    if (doubleBottom) satisfyCount++;

    const status = satisfyCount >= 5 ? "반등 확인 완료" : "반등 확인 미완성";

    checklist[level] = {
      reached,
      tail,
      recover,
      closeAbove,
      breakout,
      volumeUp,
      doubleBottom,
      status,
      satisfyCount,
    };
  });

  return checklist;
}

export interface RiskRewardRow {
  level: number;
  entry: number;
  stop: number;
  tp10: number;
  tp15: number;
  riskPercent: number;
  rewardPercent: number;
  rrRatio: number;
  distPercent: number;
}

/**
 * 손익비 참고 정보 계산
 */
export function calculateRiskRewardTable(
  currentPrice: number,
  fibLevels: FibonacciLevel[]
): RiskRewardRow[] {
  const table: RiskRewardRow[] = [];
  if (fibLevels.length === 0) return table;

  const targetLevels = FIB_LEVELS.filter((l) => l < 1.000);

  targetLevels.forEach((level) => {
    const entryObj = fibLevels.find((f) => f.level === level);
    if (!entryObj) return;

    const entry = entryObj.price;
    
    const nextLevelIdx = FIB_LEVELS.indexOf(level) + 1;
    const stopLevel = FIB_LEVELS[nextLevelIdx] ?? 1.000;
    const stopObj = fibLevels.find((f) => f.level === stopLevel);
    const stop = stopObj ? stopObj.price : entry * 0.95;

    const tp10 = Number((entry * 1.10).toFixed(4));
    const tp15 = Number((entry * 1.15).toFixed(4));

    const riskPercent = Number((((entry - stop) / entry) * 100).toFixed(2));
    const rewardPercent = 10.0;
    const rrRatio = riskPercent > 0 ? Number((rewardPercent / riskPercent).toFixed(2)) : 0;
    const distPercent = Number((((currentPrice - entry) / entry) * 100).toFixed(2));

    table.push({
      level,
      entry,
      stop,
      tp10,
      tp15,
      riskPercent,
      rewardPercent,
      rrRatio,
      distPercent,
    });
  });

  return table;
}

export interface BestEntryResult {
  bestLevel: number | null;
  waitingLevel: number | null;
  highRiskLevel: number | null;
}

/**
 * 현재 가장 유효한 진입 후보 레벨 자동 선정
 */
export function getBestEntryCandidate(
  currentPrice: number,
  fibLevels: FibonacciLevel[],
  bounceChecklist: BounceChecklist,
  rrRows: RiskRewardRow[],
  trendScore: number
): BestEntryResult {
  const result: BestEntryResult = {
    bestLevel: null,
    waitingLevel: null,
    highRiskLevel: null,
  };

  if (fibLevels.length === 0) return result;

  const activeLevels = INTEREST_LEVELS;

  let bestScore = -1;
  let bestLvl: number | null = null;

  let waitLvl: number | null = null;
  let minDistanceForWait = Infinity;

  activeLevels.forEach((level) => {
    const checklist = bounceChecklist[level];
    const rrInfo = rrRows.find((r) => r.level === level);
    if (!checklist || !rrInfo) return;

    const isReady = checklist.status === "반등 확인 완료";

    if (level === 0.786) {
      result.highRiskLevel = 0.786;
      return;
    }

    if (isReady && currentPrice >= rrInfo.entry) {
      const dist = (currentPrice - rrInfo.entry) / rrInfo.entry * 100;
      const score = (checklist.satisfyCount * 12) + (rrInfo.rrRatio * 5) - (dist * 2);
      if (score > bestScore) {
        bestScore = score;
        bestLvl = level;
      }
    } else {
      const dist = Math.abs(currentPrice - rrInfo.entry) / rrInfo.entry * 100;
      if (dist < minDistanceForWait) {
        minDistanceForWait = dist;
        waitLvl = level;
      }
    }
  });

  result.bestLevel = bestLvl;
  result.waitingLevel = waitLvl;

  if (trendScore < 35 && bestLvl !== null) {
    result.highRiskLevel = bestLvl;
    result.bestLevel = null;
  }

  return result;
}

/**
 * Calculates the Volume Weighted Average Price (VWAP) for the given intraday candles.
 * VWAP = sum(price * volume) / sum(volume)
 */
export function calculateVWAP(candles: CandleData[]): number {
  if (candles.length === 0) return 0;
  let totalValue = 0;
  let totalVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const price = (candles[i].high + candles[i].low + candles[i].close) / 3; // Typical price
    totalValue += price * candles[i].volume;
    totalVolume += candles[i].volume;
  }

  return totalVolume > 0 ? Number((totalValue / totalVolume).toFixed(4)) : 0;
}

export interface LeaderCandidate {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  valueUsd: number;
  rvol: number;
  isTopValue: boolean;
  isTopChange: boolean;
  isRvolHigh: boolean;
  isAboveVwapEma: boolean;
  isFibBounceConfirmed: boolean;
  score: number; // 0~5 count
}

export interface SectorStats {
  sector: string;
  avgChangePercent: number;
  gainerCount: number;
  totalValueUsd: number;
  score: number;
  candidates: LeaderCandidate[];
}

/**
 * Maps raw English sectors/industries to localized Korean market theme keywords.
 */
export function getKoreanTheme(sector: string, industry: string, symbol: string): string {
  const sec = (sector || "").toLowerCase();
  const ind = (industry || "").toLowerCase();
  const sym = (symbol || "").toUpperCase();

  // 1. 반도체 (Semiconductors)
  if (
    ind.includes("semiconductor") || 
    ["NVDA", "AMD", "INTC", "WOLF", "ACMR", "ENTG", "AVGO", "QCOM", "TXN", "MU", "AMAT", "ASML", "LRCX", "KLAC"].includes(sym)
  ) {
    return "반도체";
  }

  // 2. 방산 & 우주항공 (Defense & Aerospace)
  if (
    ind.includes("aerospace") || 
    ind.includes("defense") || 
    ["LMT", "NOC", "RTX", "GD", "HWM", "BA", "LHX", "TXT", "HII"].includes(sym)
  ) {
    return "방산 & 우주항공";
  }

  // 3. 조선 & 해운 (Shipbuilding & Marine)
  if (
    ind.includes("marine") || 
    ind.includes("shipbuilding") || 
    ind.includes("shipping") ||
    ["HMM", "PANOCEAN", "SBLK", "GNK", "DSX", "DAC", "ZIM"].includes(sym)
  ) {
    return "조선 & 해운";
  }

  // 4. 전기차 & 배터리 (EV & Battery)
  if (
    ind.includes("auto manufacturer") || 
    ind.includes("auto parts") || 
    ind.includes("batteries") || 
    ["TSLA", "QS", "LCID", "RIVN", "NIO", "BYDDF", "LI", "XPEV", "ALV", "MGA"].includes(sym)
  ) {
    return "전기차 & 배터리";
  }

  // 5. 바이오 & 헬스케어 (Biotech & Pharma)
  if (
    sec.includes("health") || 
    ind.includes("biotechnology") || 
    ind.includes("drug") || 
    ind.includes("pharmaceutical") || 
    ind.includes("medical") ||
    ["LLY", "NVO", "MRK", "JNJ", "ABBV", "AMGN", "PFE", "BFLY", "ADXT", "BMEA", "CRDG", "CHRN", "PRCT"].includes(sym)
  ) {
    return "바이오 & 헬스케어";
  }

  // 6. 빅테크 & AI (Big Tech & AI)
  if (
    ["MSFT", "AAPL", "GOOGL", "GOOG", "AMZN", "META", "NFLX", "PLTR", "IBM", "ORCL", "CRM", "SAP"].includes(sym) ||
    ind.includes("software") || 
    ind.includes("internet content") || 
    ind.includes("information technology services")
  ) {
    return "빅테크 & 인공지능(AI)";
  }

  // 7. 에너지 & 친환경 (Energy & Clean Tech)
  if (
    sec.includes("energy") || 
    sec.includes("utilities") || 
    ind.includes("oil") || 
    ind.includes("gas") || 
    ind.includes("solar") || 
    ind.includes("wind") || 
    ind.includes("renewable") || 
    ind.includes("electricity") || 
    ind.includes("coal") ||
    ["BE", "SMR", "CEG", "VST", "NEE", "XOM", "CVX", "SHEL", "TTE", "ENB"].includes(sym)
  ) {
    return "에너지 & 친환경";
  }

  // 8. 금융 & 핀테크 (Financials & Fintech)
  if (
    sec.includes("financial") || 
    ind.includes("bank") || 
    ind.includes("insurance") || 
    ind.includes("credit") || 
    ind.includes("asset management") ||
    ["JPM", "BAC", "WFC", "MS", "GS", "C", "AXP", "V", "MA", "COIN", "HOOD", "HRZN"].includes(sym)
  ) {
    return "금융 & 핀테크";
  }

  // 9. 소비재 & 유통 (Consumer Goods & Retail)
  if (
    sec.includes("consumer") || 
    ind.includes("retail") || 
    ind.includes("beverage") || 
    ind.includes("food") || 
    ind.includes("apparel") ||
    ["WMT", "COST", "TGT", "HD", "LOW", "KO", "PEP", "NKE", "EL", "PG"].includes(sym)
  ) {
    return "소비재 & 유통";
  }

  // 10. 산업재 & 소재 (Industrials & Materials)
  if (
    sec.includes("industrial") || 
    sec.includes("material") || 
    ind.includes("chemical") || 
    ind.includes("steel") || 
    ind.includes("building") || 
    ind.includes("machinery")
  ) {
    return "산업재 & 소재";
  }

  // 11. 통신 & 미디어 (Telecom & Media)
  if (
    sec.includes("communication") || 
    ind.includes("telecom") || 
    ind.includes("entertainment") || 
    ind.includes("media") || 
    ind.includes("broadcasting")
  ) {
    return "통신 & 미디어";
  }

  // Default fallback mappings based on sector names
  if (sec.includes("tech")) return "빅테크 & 인공지능(AI)";
  if (sec.includes("health")) return "바이오 & 헬스케어";
  if (sec.includes("energy")) return "에너지 & 친환경";
  if (sec.includes("finance")) return "금융 & 핀테크";
  if (sec.includes("indust")) return "산업재 & 소재";
  if (sec.includes("mater")) return "산업재 & 소재";
  if (sec.includes("cons")) return "소비재 & 유통";
  if (sec.includes("util")) return "에너지 & 친환경";

  return "기타 테마";
}

/**
 * Calculates Sector Leadership Scores and segments gainers by sector.
 */
export function calculateSectorLeadership(
  gainers: any[],
  candlesMap?: Record<string, CandleData[]>
): SectorStats[] {
  if (gainers.length === 0) return [];

  // 1. Group gainers by sector (Korean Theme Mapping)
  const sectorGroups: Record<string, any[]> = {};
  let totalMarketValue = 0;
  let totalMarketGainers = gainers.length;
  let maxSingleChange = 0;

  gainers.forEach((g) => {
    const sec = getKoreanTheme(g.sector, g.industry, g.symbol);
    if (!sectorGroups[sec]) {
      sectorGroups[sec] = [];
    }
    sectorGroups[sec].push(g);
    totalMarketValue += g.valueUsd || 0;
    if (g.changePercent > maxSingleChange) {
      maxSingleChange = g.changePercent;
    }
  });

  if (maxSingleChange === 0) maxSingleChange = 1;
  if (totalMarketValue === 0) totalMarketValue = 1;

  const sectors: SectorStats[] = [];

  // 2. Calculate metrics for each sector
  Object.entries(sectorGroups).forEach(([sector, items]) => {
    const gainerCount = items.length;
    const totalValueUsd = items.reduce((sum, item) => sum + (item.valueUsd || 0), 0);
    const avgChangePercent = items.reduce((sum, item) => sum + (item.changePercent || 0), 0) / gainerCount;

    // Sector Leadership Score = 40% AvgChange + 30% CountDensity + 30% ValueDensity
    const changeScore = (avgChangePercent / maxSingleChange) * 100 * 0.4;
    const countScore = (gainerCount / totalMarketGainers) * 100 * 0.3;
    const valueScore = (totalValueUsd / totalMarketValue) * 100 * 0.3;
    const rawScore = changeScore + countScore + valueScore;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    // Sort items inside sector to find rank for 대장주 candidates
    const sortedByValue = [...items].sort((a, b) => b.valueUsd - a.valueUsd);
    const sortedByChange = [...items].sort((a, b) => b.changePercent - a.changePercent);

    // Build candidates list
    const candidates: LeaderCandidate[] = items.map((item) => {
      const isTopValue = sortedByValue.slice(0, 3).some((x) => x.symbol === item.symbol);
      const isTopChange = sortedByChange.slice(0, 3).some((x) => x.symbol === item.symbol);
      const isRvolHigh = item.rvol >= 2.0;

      // Intraday technical indicators if candles are loaded
      let isAboveVwapEma = false;
      let isFibBounceConfirmed = false;

      const candles = candlesMap?.[item.symbol];
      if (candles && candles.length > 5) {
        const lastIdx = candles.length - 1;
        const currentPrice = candles[lastIdx].close;
        const vwap = calculateVWAP(candles);
        const ema20 = calculateEMA(candles, 20)[lastIdx];
        isAboveVwapEma = currentPrice > vwap && currentPrice > ema20;

        // Fibonacci Bounce Confirmation
        try {
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

          const fibLevels = calculateFibonacciLevels(startLow, peakHigh);
          const checklist = calculateBounceChecklist(candles, fibLevels, startIdx);
          
          // Check if either 0.500 or 0.618 bounce is completed
          const check050 = checklist[0.500];
          const check0618 = checklist[0.618];
          isFibBounceConfirmed = 
            (check050 && check050.status === "반등 확인 완료") || 
            (check0618 && check0618.status === "반등 확인 완료");
        } catch (e) {
          // Fallback if fibonacci calculation fails
        }
      }

      // Calculate candidate matching score (0 to 5)
      let scoreCount = 0;
      if (isTopValue) scoreCount++;
      if (isTopChange) scoreCount++;
      if (isRvolHigh) scoreCount++;
      if (isAboveVwapEma) scoreCount++;
      if (isFibBounceConfirmed) scoreCount++;

      return {
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        changePercent: item.changePercent,
        valueUsd: item.valueUsd,
        rvol: item.rvol,
        isTopValue,
        isTopChange,
        isRvolHigh,
        isAboveVwapEma,
        isFibBounceConfirmed,
        score: scoreCount,
      };
    });

    // Sort candidates: highest match score first, then value
    candidates.sort((a, b) => b.score - a.score || b.valueUsd - a.valueUsd);

    sectors.push({
      sector,
      avgChangePercent,
      gainerCount,
      totalValueUsd,
      score,
      candidates,
    });
  });

  // Sort sectors by Sector Leadership Score descending
  return sectors.sort((a, b) => b.score - a.score);
}

