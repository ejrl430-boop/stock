import { NextRequest, NextResponse } from "next/server";

// Helper to convert NY date string to Unix timestamp (seconds) dynamically handling DST offsets
function getUnixTimestampForNewYork(dateStr: string): number {
  try {
    const [datePart, timePart] = dateStr.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    // 1. Create a date object treating the values as UTC
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    
    // 2. Format the UTC date into NY time parts
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false
    });
    
    const formattedParts = formatter.formatToParts(utcDate);
    const getVal = (type: string) => {
      const part = formattedParts.find(p => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };
    
    const nyYear = getVal("year");
    const nyMonth = getVal("month");
    const nyDay = getVal("day");
    const nyHour = getVal("hour");
    const nyMin = getVal("minute");
    const nySec = getVal("second");

    // 3. Find difference in time to calculate DST offset
    const nyDateAsUtc = new Date(Date.UTC(nyYear, nyMonth - 1, nyDay, nyHour, nyMin, nySec));
    const offsetMs = utcDate.getTime() - nyDateAsUtc.getTime();
    
    return Math.floor((utcDate.getTime() + offsetMs) / 1000);
  } catch (e) {
    console.error("Failed to parse NY date:", dateStr, e);
    return Math.floor(new Date(dateStr).getTime() / 1000);
  }
}

async function getYahooCandlesFallback(symbol: string, timeframe: string) {
  let interval = "5m";
  let range = "3d";

  switch (timeframe) {
    case "1m":
      interval = "1m";
      range = "2d";
      break;
    case "3m":
      interval = "2m";
      range = "3d";
      break;
    case "5m":
      interval = "5m";
      range = "3d";
      break;
    case "15m":
      interval = "15m";
      range = "5d";
      break;
    default:
      interval = "5m";
      range = "3d";
  }

  let yahooSymbol = symbol;
  if (/^\d{6}$/.test(symbol)) {
    yahooSymbol = `${symbol}.KS`;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}&includePrePost=true`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    next: { revalidate: 2 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance Chart API returned status ${res.status}`);
  }

  const data = await res.json();
  if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
    throw new Error("No chart data found in Yahoo Finance response");
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
        open: Number(Number(open).toFixed(4)),
        high: Number(Number(high).toFixed(4)),
        low: Number(Number(low).toFixed(4)),
        close: Number(Number(close).toFixed(4)),
        volume: Math.round(volume),
      });
    }
  }

  return candles;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.FMP_API_KEY;
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "TSLA";
  const timeframe = searchParams.get("timeframe") || "5m"; // Default 5m

  // If apiKey is missing or is placeholder, immediately fallback to Yahoo
  if (!apiKey || apiKey === "YOUR_FMP_API_KEY_HERE" || apiKey === "demo") {
    try {
      console.warn(`FMP API Key is missing/placeholder. Using Yahoo Candles Fallback for ${symbol}.`);
      const candles = await getYahooCandlesFallback(symbol, timeframe);
      return NextResponse.json({ candles });
    } catch (e: any) {
      console.error(`Yahoo Candles Fallback failed for ${symbol}:`, e);
      return NextResponse.json({ error: "No API key and Fallback failed" }, { status: 500 });
    }
  }

  // Map timeframe to FMP intervals (1min, 5min, 15min, 30min, 1hour, 4hour, etc.)
  let interval = "5min";
  switch (timeframe) {
    case "1m":
      interval = "1min";
      break;
    case "3m":
      interval = "5min"; // FMP doesn't support 3min, map to 5min
      break;
    case "5m":
      interval = "5min";
      break;
    case "15m":
      interval = "15min";
      break;
    default:
      interval = "5min";
  }

  const url = `https://financialmodelingprep.com/api/v3/historical-chart/${interval}/${symbol.toUpperCase()}?apikey=${apiKey}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 5 }, // Cache for 5 seconds
    });

    if (!res.ok) {
      console.warn(`FMP Candles API returned ${res.status} for ${symbol}. Using Yahoo Candles Fallback.`);
      const candles = await getYahooCandlesFallback(symbol, timeframe);
      return NextResponse.json({ candles });
    }

    const data = await res.json();
    if (data["Error Message"] || !Array.isArray(data)) {
      console.warn(`FMP returned error for ${symbol}. Using Yahoo Candles Fallback.`);
      const candles = await getYahooCandlesFallback(symbol, timeframe);
      return NextResponse.json({ candles });
    }

    // FMP returns data descending (latest first). Reverse to ascending (chronological) for lightweight-charts
    const sortedData = [...data].reverse();

    const candles = sortedData.map((item: any) => ({
      time: getUnixTimestampForNewYork(item.date),
      open: Number(Number(item.open).toFixed(4)),
      high: Number(Number(item.high).toFixed(4)),
      low: Number(Number(item.low).toFixed(4)),
      close: Number(Number(item.close).toFixed(4)),
      volume: Math.round(item.volume),
    }));

    return NextResponse.json({ candles });
  } catch (error: any) {
    console.error(`Failed to fetch stock candles from FMP for ${symbol}:`, error);
    try {
      console.warn(`FMP candles processing failed. Using Yahoo Candles Fallback for ${symbol}.`);
      const candles = await getYahooCandlesFallback(symbol, timeframe);
      return NextResponse.json({ candles });
    } catch (e: any) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch stock candles" },
        { status: 500 }
      );
    }
  }
}
