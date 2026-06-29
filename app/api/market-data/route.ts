import { NextRequest, NextResponse } from "next/server";

async function fetchSymbolData(symbol: string) {
  let yahooSymbol = symbol;
  if (/^\d{6}$/.test(symbol)) {
    yahooSymbol = `${symbol}.KS`;
  }
  
  // Fetch intraday 5m candles to calculate VWAP and current price/change
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=1d&includePrePost=true`;
  
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    next: { revalidate: 10 } // Cache fetch for 10 seconds
  });

  if (!res.ok) {
    throw new Error(`Chart API returned status ${res.status} for ${symbol}`);
  }

  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) {
    throw new Error(`No chart result found for ${symbol}`);
  }

  const meta = result.meta || {};
  
  // Use pre/post market price if regular market is closed and those exist
  let price = meta.regularMarketPrice || 0;
  let prevClose = meta.previousClose || meta.chartPreviousClose || price;
  
  // Determine if we should use preMarketPrice/postMarketPrice
  const marketState = meta.marketState;
  if (marketState === "PRE" && meta.preMarketPrice) {
    price = meta.preMarketPrice;
  } else if (marketState === "POST" && meta.postMarketPrice) {
    price = meta.postMarketPrice;
  }

  // Calculate change percent
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  // Calculate VWAP from candles
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  let sumTypicalPriceVolume = 0;
  let sumVolume = 0;
  let totalVolume = 0;

  for (let i = 0; i < timestamps.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i];

    if (close !== null && close !== undefined && volume !== null && volume !== undefined) {
      const typicalPrice = (high + low + close) / 3;
      sumTypicalPriceVolume += typicalPrice * volume;
      sumVolume += volume;
      totalVolume += volume;
    }
  }

  const calculatedVwap = sumVolume > 0 ? sumTypicalPriceVolume / sumVolume : price;
  const isAboveVwap = price > calculatedVwap;

  return {
    symbol,
    price,
    changePercent: Number(changePercent.toFixed(2)),
    volume: totalVolume || meta.regularMarketVolume || 0,
    isAboveVwap,
    direction: changePercent > 0.5 ? "Bullish" as const : changePercent < -0.5 ? "Bearish" as const : "Neutral" as const
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  let symbols = [
    "SPY", "QQQ", "IWM", "DIA", // Indices
    "SMH", "SOXX", "XLK", "XLC", "XLY", "XLF", "XLV", "XBI", "IBB", "XLE", "XLI", "ARKK" // Sectors
  ];

  if (symbolsParam) {
    // Deduplicate and split by comma
    symbols = Array.from(new Set(symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)));
  }

  try {
    // Run all fetches in parallel
    const promises = symbols.map(sym => 
      fetchSymbolData(sym).catch(err => {
        console.error(`Failed to fetch for ${sym}, using default fallback:`, err);
        return {
          symbol: sym,
          price: 0,
          changePercent: 0,
          volume: 0,
          isAboveVwap: false,
          direction: "Neutral" as const
        };
      })
    );

    const quotes = await Promise.all(promises);
    return NextResponse.json({ quotes });
  } catch (error: any) {
    console.error("Critical error in market-data API route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
