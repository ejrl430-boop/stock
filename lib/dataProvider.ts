export interface CandleData {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerInfo {
  symbol: string;
  name: string;
}

export const SUPPORTED_TICKERS: TickerInfo[] = [
  // Cryptocurrencies (No API key, No CORS, 24/7)
  { symbol: "BTCUSDT", name: "Bitcoin / Tether" },
  { symbol: "ETHUSDT", name: "Ethereum / Tether" },
  { symbol: "SOLUSDT", name: "Solana / Tether" },
  { symbol: "DOGEUSDT", name: "Dogecoin / Tether" },
  // US/KR Stocks (Yahoo Finance API)
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "005930", name: "삼성전자" },
];

export const SUPPORTED_TIMEFRAMES = [
  { value: "1m", label: "1 Minute" },
  { value: "3m", label: "3 Minutes" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
];

/**
 * Fetches real-time candle data for cryptocurrency (Binance) or stocks (Yahoo Finance).
 * @param symbol Stock ticker or Coin symbol
 * @param timeframe Timeframe (1m, 3m, 5m, 15m)
 * @returns Array of CandleData
 */
export async function fetchCandles(symbol: string, timeframe: string): Promise<CandleData[]> {
  const isCoin =
    symbol.toUpperCase().endsWith("USDT") ||
    ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "BNB"].some((c) =>
      symbol.toUpperCase().startsWith(c)
    );

  if (isCoin) {
    // Fetch cryptocurrency candles from Binance Public API (CORS-free)
    const binanceSymbol = symbol.toUpperCase();
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${timeframe}&limit=300`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Binance API returned status ${res.status}`);
      }
      const data = await res.json();

      return data.map((item: any) => {
        const open = Number(item[1]);
        const high = Number(item[2]);
        const low = Number(item[3]);
        const close = Number(item[4]);
        const volume = Number(item[5]);

        return {
          time: Math.floor(Number(item[0]) / 1000), // convert ms to seconds
          open: open,
          high: high,
          low: low,
          close: close,
          volume: Math.round(volume),
        };
      });
    } catch (error) {
      console.error("Failed to fetch candles from Binance:", error);
      throw error;
    }
  } else {
    // Fetch stock candles from FMP via our Next.js API Route
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${baseUrl}/api/fmp/candles?symbol=${symbol}&timeframe=${timeframe}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Stock API Route (FMP) returned status ${res.status}`);
      }
      const data = await res.json();
      return data.candles || [];
    } catch (error) {
      console.error("Failed to fetch stock candles from FMP:", error);
      throw error;
    }
  }
}

export interface GainerInfo {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  marketCap: number;
}

/**
 * Fetches real-time stock gainers list from Yahoo Finance predefined gainers list.
 */
export async function fetchGainers(count = 25): Promise<GainerInfo[]> {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${baseUrl}/api/stock-gainers?count=${count}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Stock Gainers API returned status ${res.status}`);
    }
    const data = await res.json();
    return data.gainers || [];
  } catch (error) {
    console.error("Failed to fetch stock gainers:", error);
    return [];
  }
}

export const TICKER_KOREAN_NAMES: Record<string, string> = {
  // Major US Stocks
  "TSLA": "테슬라",
  "AAPL": "애플",
  "NVDA": "엔비디아",
  "MSFT": "마이크로소프트",
  "AMZN": "아마존 닷컴",
  "GOOGL": "알파벳 A",
  "GOOG": "알파벳 C",
  "META": "메타 플랫폼스",
  "AVGO": "브로드컴",
  "LLY": "일라이 릴리",
  "NFLX": "넷플릭스",
  "AMD": "AMD",
  "QCOM": "퀄컴",
  "INTC": "인텔",
  "COIN": "코인베이스",
  "PLTR": "팔란티어",
  "HOOD": "로빈후드",
  "DJT": "트럼프 미디어",
  "GME": "게임스톱",
  "AMC": "AMC 엔터테인먼트",
  "SOXL": "반도체 3배 레버리지 ETF",
  "SOXS": "반도체 인버스 3배 ETF",
  "TQQQ": "나스닥 3배 레버리지 ETF",
  "SQQQ": "나스닥 인버스 3배 ETF",

  // Gainers / Hot Stocks (Toss match)
  "BFLY": "버터플라이 네트워크",
  "WOLF": "울프스피드",
  "QS": "퀀텀스케이프",
  "BE": "블룸 에너지",
  "OUST": "아우스터",
  "LNKS": "링커스 인더스트리스",
  "PRCT": "프리캐스트",
  "APWC": "아시아 퍼시픽 와이어",
  "AATP": "아가페 ATP",
  "BMEA": "비머젠 에너지",
  "CRDG": "카디건",
  "HRZN": "호라이즌 퀀텀 홀딩스",
  "VELL": "벨",
  "ADXT": "애디텍스트",
  "CAST": "캐스트",
  "ACMR": "ACM 리서치",
  "ENTG": "엔테그리스",
  "CHRN": "크로노스케일",
  "PENG": "펭귄 솔루션즈",
  "SNDK": "샌디스크",

  // KOSPI
  "005930": "삼성전자",
  "000660": "SK하이닉스",
  "035420": "NAVER",
  "035720": "카카오",
  "005380": "현대차",
  "000270": "기아",
  "068270": "셀트리온",
  "207940": "삼성바이오",
  "051910": "LG화학",
  "006400": "삼성SDI",
};

/**
 * Returns Korean translated stock name if available, otherwise return cleaned English name.
 */
export function getKoreanOrCleanName(symbol: string, rawName: string): string {
  const upperSymbol = symbol.toUpperCase();
  if (TICKER_KOREAN_NAMES[upperSymbol]) {
    return TICKER_KOREAN_NAMES[upperSymbol];
  }

  if (upperSymbol.endsWith("USDT")) {
    const coin = upperSymbol.replace("USDT", "");
    return `${coin} / 테더`;
  }

  // Strip common corporate suffixes for English name cleanup
  let clean = rawName;
  clean = clean.replace(/,?\s+(Inc|Co|Corp|Ltd|Company|Holdings|Group|Incorporated|Corporation|L\.P\.|L\.P|LP)\.?\s*$/i, "");
  clean = clean.replace(/,?\s+(Class [A-Z])\s*$/i, "");
  
  return clean.trim();
}

export interface FmpGainerInfo {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  valueUsd: number;
  avgVolume: number;
  rvol: number;
  sector: string;
  industry: string;
}

/**
 * Fetches real-time stock gainers list from FMP API (via Next.js API route)
 */
export async function fetchFmpGainers(limit = 30): Promise<FmpGainerInfo[]> {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${baseUrl}/api/fmp/gainers?limit=${limit}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`FMP Gainers API returned status ${res.status}`);
    }
    const data = await res.json();
    return data.gainers || [];
  } catch (error) {
    console.error("Failed to fetch FMP gainers:", error);
    return [];
  }
}

