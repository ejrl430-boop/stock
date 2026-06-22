import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = searchParams.get("count") || "25";

  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=day_gainers&count=${count}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 30 }, // Cache day_gainers response for 30 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance Screener API returned status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    if (
      !data.finance ||
      !data.finance.result ||
      data.finance.result.length === 0 ||
      !data.finance.result[0].quotes
    ) {
      return NextResponse.json(
        { error: "No day gainer data found" },
        { status: 404 }
      );
    }

    const quotes = data.finance.result[0].quotes;
    
    // Format the quotes list for the client
    const gainers = quotes.map((q: any) => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice || 0,
      changePercent: q.regularMarketChangePercent || 0,
      volume: q.regularMarketVolume || 0,
      marketCap: q.marketCap || 0,
    }));

    return NextResponse.json({ gainers });
  } catch (error: any) {
    console.error("Failed to fetch day gainers from Yahoo Finance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch day gainers" },
      { status: 500 }
    );
  }
}
