import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const symbols = [
    "SPY", "QQQ", "IWM", "DIA", // Indices
    "SMH", "SOXX", "XLK", "XLC", "XLY", "XLF", "XLV", "XBI", "IBB", "XLE", "XLI", "ARKK" // Sectors
  ];

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 5 }, // Cache for 5 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance API returned status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const quotes = data.quoteResponse?.result || [];

    const formattedData = quotes.map((q: any) => {
      // Use pre-market or regular market price depending on market state
      const marketState = q.marketState;
      let price = q.regularMarketPrice || 0;
      let changePercent = q.regularMarketChangePercent || 0;
      let volume = q.regularMarketVolume || 0;

      if (marketState === "PRE" && q.preMarketPrice) {
        price = q.preMarketPrice;
        changePercent = q.preMarketChangePercent || 0;
      } else if (marketState === "POST" && q.postMarketPrice) {
        price = q.postMarketPrice;
        changePercent = q.postMarketChangePercent || 0;
      }

      return {
        symbol: q.symbol,
        price,
        changePercent: Number(changePercent.toFixed(2)),
        volume,
        // Estimate vwap above/below status: if price > regularMarketDayLow + (regularMarketDayHigh - regularMarketDayLow) * 0.5
        // Or if we check regularMarketPrice vs regularMarketPreviousClose, etc.
        // We'll estimate isAboveVwap based on price > average of day high/low
        isAboveVwap: q.regularMarketDayHigh && q.regularMarketDayLow 
          ? price > (q.regularMarketDayHigh + q.regularMarketDayLow) / 2
          : price > (q.regularMarketPreviousClose || 0),
        direction: changePercent > 0.5 ? "Bullish" : changePercent < -0.5 ? "Bearish" : "Neutral"
      };
    });

    return NextResponse.json({ quotes: formattedData });
  } catch (error: any) {
    console.error("Failed to fetch market data from Yahoo Finance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
