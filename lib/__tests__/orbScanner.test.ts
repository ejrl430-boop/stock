import {
  evaluateMarketStatus,
  processSectors,
  scoreCandidate,
  calculateORBPlan,
  MarketIndexInfo,
  StockCandidate
} from "../orbScanner";

describe("ORB Scanner Unit Tests", () => {
  describe("evaluateMarketStatus", () => {
    it("should return LONG 가능 when both SPY and QQQ are positive and above VWAP", () => {
      const indices: MarketIndexInfo[] = [
        { symbol: "SPY", name: "S&P 500", price: 500, changePercent: 0.5, volume: 1000, isAboveVwap: true, direction: "Bullish" },
        { symbol: "QQQ", name: "Nasdaq 100", price: 400, changePercent: 0.8, volume: 1000, isAboveVwap: true, direction: "Bullish" }
      ];
      const result = evaluateMarketStatus(indices);
      expect(result.status).toBe("LONG 가능");
      expect(result.color).toBe("text-green");
    });

    it("should return 신규 롱 매매 금지 when both SPY and QQQ are negative or below VWAP", () => {
      const indices: MarketIndexInfo[] = [
        { symbol: "SPY", name: "S&P 500", price: 500, changePercent: -0.2, volume: 1000, isAboveVwap: false, direction: "Bearish" },
        { symbol: "QQQ", name: "Nasdaq 100", price: 400, changePercent: -0.4, volume: 1000, isAboveVwap: false, direction: "Bearish" }
      ];
      const result = evaluateMarketStatus(indices);
      expect(result.status).toBe("신규 롱 매매 금지");
      expect(result.color).toBe("text-red");
    });

    it("should return 선별 매매 when one index is positive and one is negative", () => {
      const indices: MarketIndexInfo[] = [
        { symbol: "SPY", name: "S&P 500", price: 500, changePercent: 0.2, volume: 1000, isAboveVwap: true, direction: "Bullish" },
        { symbol: "QQQ", name: "Nasdaq 100", price: 400, changePercent: -0.1, volume: 1000, isAboveVwap: false, direction: "Bearish" }
      ];
      const result = evaluateMarketStatus(indices);
      expect(result.status).toBe("선별 매매");
      expect(result.color).toBe("text-yellow");
    });
  });

  describe("scoreCandidate", () => {
    const defaultStats = { top10: 100000000, top30: 50000000, avg: 20000000 };

    it("should exclude candidates with price below 10", () => {
      const candidate: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings"> = {
        ticker: "TEST",
        name: "Test Stock",
        sector: "반도체",
        price: 8.5,
        changePercent: 5.0,
        volume: 1000000,
        dollarVolume: 8500000,
        previousClose: 8.09,
        dayHigh: 8.9,
        dayLow: 8.0,
        is20DayHigh: true
      };

      const result = scoreCandidate(candidate, ["반도체"], defaultStats);
      expect(result.grade).toBe("EXCLUDE");
      expect(result.warnings).toContain("❌ 10달러 미만 동전주 조건 제외");
    });

    it("should score candidates correctly and assign proper grade", () => {
      const candidate: Omit<StockCandidate, "score" | "grade" | "reasons" | "warnings"> = {
        ticker: "AAPL",
        name: "Apple Inc",
        sector: "기술주",
        price: 180.0,
        changePercent: 4.5,
        volume: 30000000,
        dollarVolume: 5400000000, // top10
        previousClose: 172.24,
        dayHigh: 182.0,
        dayLow: 171.0,
        is20DayHigh: true,
        relativeStrengthVsSPY: 3.5,
        relativeStrengthVsQQQ: 3.0
      };

      const result = scoreCandidate(candidate, ["기술주"], defaultStats);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.grade).toBe("A");
    });
  });

  describe("calculateORBPlan", () => {
    it("should calculate risk percent, targets, and size correctly", () => {
      // Entry: 100, Stop: 98 -> Risk: 2%
      // 5,000 Won max loss limit. Position size: 5,000 / (2 / 100) = 250,000 Won
      const plan = calculateORBPlan("TEST", 100, 95, 99, 98.5, 100, 98, 11, "22:45");
      
      expect(plan.riskPercent).toBe(2.0);
      expect(plan.target1R).toBe(103.0); // 100 + 2 * 1.5 = 103
      expect(plan.target2R).toBe(106.0); // 100 + 2 * 3.0 = 106
      expect(plan.suggestedPositionSize).toBe(250000);
      expect(plan.decision).toBe("ENTRY_OK");
    });

    it("should reject entry if risk is higher than 5%", () => {
      // Entry: 100, Stop: 94 -> Risk: 6% (>5%)
      const plan = calculateORBPlan("TEST", 100, 90, 99, 95, 100, 94, 11, "22:45");
      expect(plan.riskPercent).toBe(6.0);
      expect(plan.decision).toBe("NO_TRADE");
    });

    it("should restrict entry if time is past 23:40", () => {
      const plan = calculateORBPlan("TEST", 100, 95, 99, 98.5, 100, 98, 11, "23:45");
      expect(plan.decision).toBe("NO_TRADE");
    });
  });
});
