import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "TSLA";
  const timeframe = searchParams.get("timeframe") || "1m";

  // Map our UI timeframe to Yahoo Finance intervals
  // Yahoo Finance intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, etc.
  // 3m is not supported by Yahoo, so we map it to 2m (closest).
  let interval = "1m";
  let range = "1d"; // Default range to fetch

  switch (timeframe) {
    case "1m":
      interval = "1m";
      range = "5d"; // Max recommended range for 1m
      break;
    case "3m":
      interval = "2m"; // Map 3m to 2m
      range = "7d";
      break;
    case "5m":
      interval = "5m";
      range = "10d";
      break;
    case "15m":
      interval = "15m";
      range = "15d";
      break;
    default:
      interval = "5m";
      range = "10d";
  }

  // Format Korean Ticker for Yahoo Finance (e.g. 005930 -> 005930.KS)
  let yahooSymbol = symbol;
  if (/^\d{6}$/.test(symbol)) {
    yahooSymbol = `${symbol}.KS`; // KOSPI
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}&includePrePost=true`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 2 }, // Cache response for 2 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance API returned status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      return NextResponse.json(
        { error: "No chart data found for the ticker" },
        { status: 404 }
      );
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];

    const candles = [];

    for (let i = 0; i < timestamps.length; i++) {
      const time = timestamps[i];
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];

      // Filter out null/undefined values which Yahoo sometimes returns for pre/post market sessions
      if (
        time !== null && time !== undefined &&
        open !== null && open !== undefined &&
        high !== null && high !== undefined &&
        low !== null && low !== undefined &&
        close !== null && close !== undefined &&
        volume !== null && volume !== undefined
      ) {
        candles.push({
          time,
          open: Number(Number(open).toFixed(6)),
          high: Number(Number(high).toFixed(6)),
          low: Number(Number(low).toFixed(6)),
          close: Number(Number(close).toFixed(6)),
          volume: Math.round(volume),
        });
      }
    }

    return NextResponse.json({ candles });
  } catch (error: any) {
    console.error("Failed to fetch stock candles from Yahoo Finance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stock candles" },
      { status: 500 }
    );
  }
}
