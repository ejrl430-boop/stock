import { CandleData } from "../dataProvider";
import { 
  detectBreakoutCandle, 
  detectPeakHigh, 
  calculateFibonacciLevels, 
  getNearInterestLevels,
  detectPeakHighAll,
  detectBreakoutCandleOnDate,
  getLocalDateString,
  calculateEMA,
  calculateSMA,
  calculateRSI,
  calculateMomentumScore,
  calculateBounceChecklist,
  calculateRiskRewardTable,
  getBestEntryCandidate,
  calculateVWAP,
  calculateSectorLeadership
} from "../fibonacci";

function createBaseCandle(time: number, price: number, volume: number): CandleData {
  return {
    time,
    open: price,
    high: price * 1.001,
    low: price * 0.999,
    close: price,
    volume,
  };
}

describe("Fibonacci and Breakout Detection Logic", () => {
  describe("getLocalDateString", () => {
    it("should format timestamps into YYYY-MM-DD format", () => {
      const timestamp = 1718784000;
      const dateStr = getLocalDateString(timestamp);
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("detectPeakHighAll", () => {
    it("should find absolute peak high in the entire array", () => {
      const candles: CandleData[] = [
        createBaseCandle(0, 100, 100),
        { time: 60, open: 100, high: 250, low: 99, close: 104, volume: 1000 },
        createBaseCandle(120, 150, 100),
        createBaseCandle(180, 120, 100),
      ];
      const result = detectPeakHighAll(candles);
      expect(result.index).toBe(1);
      expect(result.price).toBe(250);
    });
  });

  describe("detectBreakoutCandleOnDate", () => {
    it("should only detect breakout candles that match the target date", () => {
      const baseTime = 1718800000;
      const oneDaySeconds = 86400;

      const candles: CandleData[] = [];
      
      for (let i = 0; i < 20; i++) {
        candles.push(createBaseCandle(baseTime - oneDaySeconds + i * 60, 100, 1000));
      }

      const targetDate = getLocalDateString(baseTime);
      const breakoutCandle: CandleData = {
        time: baseTime,
        open: 100,
        high: 105,
        low: 99,
        close: 104,
        volume: 4000,
      };
      candles.push(breakoutCandle);

      const result = detectBreakoutCandleOnDate(candles, targetDate);
      expect(result).not.toBeNull();
      expect(result?.index).toBe(20);
      expect(result?.low).toBe(99);

      const prevDate = getLocalDateString(baseTime - oneDaySeconds);
      const resultPrevDay = detectBreakoutCandleOnDate(candles, prevDate);
      expect(resultPrevDay).toBeNull();
    });
  });

  describe("detectBreakoutCandle", () => {
    let mockCandles: CandleData[] = [];
    const basePrice = 100;
    const baseVolume = 1000;

    beforeEach(() => {
      mockCandles = [];
      for (let i = 0; i < 20; i++) {
        mockCandles.push(createBaseCandle(i * 60, basePrice, baseVolume));
      }
    });

    it("should return null if there are fewer than 21 candles", () => {
      const shortCandles = mockCandles.slice(0, 15);
      expect(detectBreakoutCandle(shortCandles)).toBeNull();
    });

    it("should return null if there is no breakout candle", () => {
      mockCandles.push(createBaseCandle(20 * 60, basePrice, baseVolume));
      expect(detectBreakoutCandle(mockCandles)).toBeNull();
    });

    it("should detect breakout when all conditions are met", () => {
      const breakoutCandle: CandleData = {
        time: 20 * 60,
        open: 100,
        high: 104.5,
        low: 99.5,
        close: 104,
        volume: 4000,
      };
      mockCandles.push(breakoutCandle);

      const result = detectBreakoutCandle(mockCandles);
      expect(result).not.toBeNull();
      expect(result?.index).toBe(20);
      expect(result?.low).toBe(99.5);
    });
  });

  describe("calculateEMA", () => {
    it("should calculate EMA correctly", () => {
      const candles: CandleData[] = [
        createBaseCandle(0, 10, 100),
        createBaseCandle(60, 11, 100),
        createBaseCandle(120, 12, 100),
      ];
      const ema = calculateEMA(candles, 2);
      expect(ema.length).toBe(3);
      // First is close, second is SMA (10.5), third is EMA(2): 12 * (2/3) + 10.5 * (1/3) = 8 + 3.5 = 11.5
      expect(ema[2]).toBeCloseTo(11.5, 2);
    });
  });

  describe("calculateSMA", () => {
    it("should calculate SMA correctly", () => {
      const candles: CandleData[] = [
        createBaseCandle(0, 10, 100),
        createBaseCandle(60, 12, 100),
        createBaseCandle(120, 14, 100),
      ];
      const sma = calculateSMA(candles, 2);
      expect(sma.length).toBe(3);
      expect(sma[2]).toBe(13); // Average of 12 and 14
    });
  });

  describe("calculateRSI", () => {
    it("should calculate RSI values", () => {
      const candles: CandleData[] = Array.from({ length: 20 }, (_, i) => 
        createBaseCandle(i * 60, 100 + i, 1000)
      );
      const rsi = calculateRSI(candles, 14);
      expect(rsi.length).toBe(20);
      // Since it only went up, RSI should be near 100 at index 14+
      expect(rsi[14]).toBe(100);
    });
  });

  describe("calculateMomentumScore", () => {
    it("should compute momentum score and grade", () => {
      const candles: CandleData[] = Array.from({ length: 30 }, (_, i) => 
        createBaseCandle(i * 60, 100 + i * 2, 1000) // ascending trend
      );
      const fibLevels = calculateFibonacciLevels(100, 160);
      const score = calculateMomentumScore(candles, fibLevels, 0, 29);
      expect(score.total).toBeGreaterThan(0);
      expect(score.reasons.length).toBeGreaterThan(0);
    });

    it("should verify valueUsd calculation and 3-step volume pattern passing conditions", () => {
      const candles: CandleData[] = [];
      const baseTime = 1718800000;
      
      // 20 pre-breakout candles with low volume
      for (let i = 0; i < 20; i++) {
        candles.push(createBaseCandle(baseTime + i * 60, 100, 1000));
      }
      
      // Breakout candle at index 20 with high volume (Step 1 pass: 5000 >= 1000 * 2.5)
      candles.push({
        time: baseTime + 20 * 60,
        open: 100,
        high: 110,
        low: 99,
        close: 108,
        volume: 5000
      });

      // Peak candle at index 21
      candles.push({
        time: baseTime + 21 * 60,
        open: 108,
        high: 120,
        low: 107,
        close: 118,
        volume: 3000
      });

      // Retracement candle with low volume (Step 2 pass: 1500 <= 5000 * 0.40)
      candles.push({
        time: baseTime + 22 * 60,
        open: 118,
        high: 118,
        low: 105,
        close: 106,
        volume: 1500
      });

      // Bounce candle with increasing volume (Step 3 pass: 106 -> 112 with volume 2500 > 1500)
      candles.push({
        time: baseTime + 23 * 60,
        open: 106,
        high: 114,
        low: 105,
        close: 112,
        volume: 2500
      });

      const fibLevels = calculateFibonacciLevels(99, 120);
      const score = calculateMomentumScore(candles, fibLevels, 20, 21);

      expect(score.valueUsd).toBeGreaterThan(0);
      expect(score.valueGrade).toBeDefined();
      expect(score.volumePatternPassed).toBe(true);
      expect(score.volumePatternStatus).toBe("합격");
    });
  });

  describe("calculateBounceChecklist", () => {
    it("should calculate checklist for key levels", () => {
      const candles: CandleData[] = Array.from({ length: 30 }, (_, i) => 
        createBaseCandle(i * 60, 100 + i, 1000)
      );
      const fibLevels = calculateFibonacciLevels(100, 130);
      const checklist = calculateBounceChecklist(candles, fibLevels, 0);
      expect(checklist[0.500]).toBeDefined();
      expect(checklist[0.618]).toBeDefined();
    });
  });

  describe("calculateRiskRewardTable", () => {
    it("should calculate Entry, Stop, and targets", () => {
      const fibLevels = calculateFibonacciLevels(100, 200);
      const table = calculateRiskRewardTable(150, fibLevels);
      expect(table.length).toBe(9); // 0.236 to 0.950 (1.000 excluded)
      const row050 = table.find(r => r.level === 0.500);
      expect(row050).toBeDefined();
      expect(row050?.entry).toBe(150);
      expect(row050?.tp10).toBe(165);
    });
  });

  describe("calculateVWAP", () => {
    it("should compute typical price volume weighted average correctly", () => {
      const candles: CandleData[] = [
        { time: 100, open: 10, high: 12, low: 8, close: 10, volume: 100 }, // Typical: (12+8+10)/3 = 10, value: 1000
        { time: 200, open: 20, high: 22, low: 18, close: 20, volume: 200 }, // Typical: (22+18+20)/3 = 20, value: 4000
      ];
      // Total value = 1000 + 4000 = 5000. Total volume = 300. VWAP = 5000 / 300 = 16.6667
      const vwap = calculateVWAP(candles);
      expect(vwap).toBeCloseTo(16.6667, 4);
    });
  });

  describe("calculateSectorLeadership", () => {
    it("should calculate Sector Leadership Score and segment gainers with candidate rankings", () => {
      const gainers = [
        { symbol: "AAPL", name: "Apple", price: 150, changePercent: 5.0, valueUsd: 10000000, rvol: 2.5, sector: "Technology" },
        { symbol: "MSFT", name: "Microsoft", price: 300, changePercent: 4.0, valueUsd: 8000000, rvol: 1.8, sector: "Technology" },
        { symbol: "JPM", name: "JPMorgan", price: 120, changePercent: 2.0, valueUsd: 5000000, rvol: 1.2, sector: "Financials" },
      ];

      const candlesMap = {
        AAPL: [
          { time: 1718800000, open: 145, high: 152, low: 144, close: 150, volume: 10000 },
          { time: 1718800300, open: 150, high: 153, low: 149, close: 151, volume: 12000 },
        ]
      };

      const result = calculateSectorLeadership(gainers, candlesMap);
      expect(result.length).toBe(2); // 빅테크 & 인공지능(AI), 금융 & 핀테크
      expect(result[0].sector).toBe("빅테크 & 인공지능(AI)"); // Mapped from Technology
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].candidates.length).toBe(2);
      expect(result[0].candidates[0].symbol).toBe("AAPL");
      expect(result[0].candidates[0].isRvolHigh).toBe(true); // AAPL rvol = 2.5 >= 2.0
    });
  });
});
