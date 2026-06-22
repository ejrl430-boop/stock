import { NextRequest, NextResponse } from "next/server";

// Fallback Sector/Industry Map for main hot symbols
const FALLBACK_SECTORS: Record<string, { sector: string; industry: string }> = {
  "AAPL": { sector: "Technology", industry: "Consumer Electronics" },
  "MSFT": { sector: "Technology", industry: "Software—Infrastructure" },
  "NVDA": { sector: "Technology", industry: "Semiconductors" },
  "TSLA": { sector: "Consumer Cyclical", industry: "Auto Manufacturers" },
  "AMZN": { sector: "Consumer Cyclical", industry: "Internet Retail" },
  "GOOGL": { sector: "Communication Services", industry: "Internet Content & Information" },
  "GOOG": { sector: "Communication Services", industry: "Internet Content & Information" },
  "META": { sector: "Communication Services", industry: "Internet Content & Information" },
  "BFLY": { sector: "Healthcare", industry: "Medical Devices" },
  "WOLF": { sector: "Technology", industry: "Semiconductors" },
  "QS": { sector: "Auto Parts", industry: "Batteries" },
  "BE": { sector: "Utilities", industry: "Renewable Energy" },
  "OUST": { sector: "Technology", industry: "Scientific & Technical Instruments" },
  "ADXT": { sector: "Healthcare", industry: "Biotechnology" },
  "CAST": { sector: "Technology", industry: "Software—Application" },
  "LNKS": { sector: "Technology", industry: "Software—Application" },
  "PRCT": { sector: "Healthcare", industry: "Medical Instruments" },
  "APWC": { sector: "Industrials", industry: "Electrical Equipment" },
  "AATP": { sector: "Consumer Defensive", industry: "Education Services" },
  "BMEA": { sector: "Healthcare", industry: "Biotechnology" },
  "CRDG": { sector: "Healthcare", industry: "Biotechnology" },
  "HRZN": { sector: "Financials", industry: "Asset Management" },
  "VELL": { sector: "Industrials", industry: "Industrial Distribution" },
  "ACMR": { sector: "Technology", industry: "Semiconductor Equipment" },
  "ENTG": { sector: "Technology", industry: "Semiconductor Materials" },
  "CHRN": { sector: "Healthcare", industry: "Biotechnology" },
  "PENG": { sector: "Technology", industry: "Computer Hardware" },
  "SNDK": { sector: "Technology", industry: "Computer Storage" },
};

async function getYahooGainersFallback(limit: number) {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=day_gainers&count=${limit}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance Screener returned status ${res.status}`);
  }

  const data = await res.json();
  const quotes = data.finance?.result?.[0]?.quotes || [];
  
  return quotes.map((q: any) => {
    const symbol = q.symbol;
    const fallback = FALLBACK_SECTORS[symbol] || { sector: "Technology", industry: "Other" }; // Default to Technology so it ranks on dashboard
    const volume = q.regularMarketVolume || 0;
    const price = q.regularMarketPrice || 0;
    const avgVolume = q.averageDailyVolume3Month || 1;
    const rvol = avgVolume > 0 ? Number((volume / avgVolume).toFixed(2)) : 1.0;
    
    return {
      symbol,
      name: q.shortName || q.longName || symbol,
      price,
      changePercent: q.regularMarketChangePercent || 0,
      volume,
      valueUsd: volume * price,
      avgVolume,
      rvol,
      sector: fallback.sector,
      industry: fallback.industry,
    };
  });
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.FMP_API_KEY;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "30", 10);

  // If apiKey is missing or is placeholder, immediately fallback to Yahoo
  if (!apiKey || apiKey === "YOUR_FMP_API_KEY_HERE" || apiKey === "demo") {
    try {
      console.warn("FMP API Key is missing or placeholder. Using Yahoo Screener Fallback.");
      const gainers = await getYahooGainersFallback(limit);
      return NextResponse.json({ gainers });
    } catch (e: any) {
      console.error("Yahoo Gainers Fallback failed:", e);
      return NextResponse.json({ error: "No API key and Fallback failed" }, { status: 500 });
    }
  }

  try {
    // 1. Fetch real-time gainers list
    const gainersUrl = `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`;
    const gainersRes = await fetch(gainersUrl, { next: { revalidate: 15 } }); // Cache for 15s

    if (!gainersRes.ok) {
      console.warn(`FMP Gainers API returned status ${gainersRes.status}. Using Yahoo Screener Fallback.`);
      const gainers = await getYahooGainersFallback(limit);
      return NextResponse.json({ gainers });
    }

    const gainersData = await gainersRes.json();
    if (gainersData["Error Message"] || !Array.isArray(gainersData) || gainersData.length === 0) {
      console.warn("FMP returned error or empty list. Using Yahoo Screener Fallback.");
      const gainers = await getYahooGainersFallback(limit);
      return NextResponse.json({ gainers });
    }

    // Limit the number of gainers to analyze to prevent hitting rate limits / large payloads
    const limitedGainers = gainersData.slice(0, limit);
    const tickers = limitedGainers.map((g: any) => g.symbol);

    if (tickers.length === 0) {
      return NextResponse.json({ gainers: [] });
    }

    // 2. Fetch Bulk Profiles & Quotes to get Sector, Industry, and Average Volume
    const tickersCsv = tickers.join(",");
    const profilesUrl = `https://financialmodelingprep.com/api/v3/profile/${tickersCsv}?apikey=${apiKey}`;
    const quotesUrl = `https://financialmodelingprep.com/api/v3/quote/${tickersCsv}?apikey=${apiKey}`;

    const [profilesRes, quotesRes] = await Promise.all([
      fetch(profilesUrl, { next: { revalidate: 3600 } }), // Profile is static, cache for 1 hour
      fetch(quotesUrl, { next: { revalidate: 15 } })      // Quote is live, cache for 15s
    ]);

    let profilesMap: Record<string, { sector: string; industry: string; name: string }> = {};
    let quotesMap: Record<string, { avgVolume: number; volume: number; price: number; changesPercentage: number }> = {};

    if (profilesRes.ok) {
      const profilesData = await profilesRes.json();
      if (Array.isArray(profilesData)) {
        profilesData.forEach((p: any) => {
          profilesMap[p.symbol] = {
            sector: p.sector || "Other",
            industry: p.industry || "Other",
            name: p.companyName || p.symbol
          };
        });
      }
    }

    if (quotesRes.ok) {
      const quotesData = await quotesRes.json();
      if (Array.isArray(quotesData)) {
        quotesData.forEach((q: any) => {
          quotesMap[q.symbol] = {
            avgVolume: q.avgVolume || 1,
            volume: q.volume || 0,
            price: q.price || 0,
            changesPercentage: q.changesPercentage || 0
          };
        });
      }
    }

    // 3. Merge data and calculate custom metrics (RVOL, ValueUsd)
    const gainers = limitedGainers.map((g: any) => {
      const symbol = g.symbol;
      const profile = profilesMap[symbol] || { sector: "Other", industry: "Other", name: g.name || symbol };
      const quote = quotesMap[symbol] || { avgVolume: 1, volume: g.volume || 0, price: g.price || 0, changesPercentage: g.changesPercentage || 0 };

      const volume = quote.volume;
      const price = quote.price;
      const avgVolume = quote.avgVolume;
      const valueUsd = volume * price;
      
      // Relative Volume (RVOL)
      const rvol = avgVolume > 0 ? Number((volume / avgVolume).toFixed(2)) : 1.0;

      return {
        symbol,
        name: profile.name,
        price,
        changePercent: quote.changesPercentage,
        volume,
        valueUsd,
        avgVolume,
        rvol,
        sector: profile.sector,
        industry: profile.industry
      };
    });

    return NextResponse.json({ gainers });
  } catch (error: any) {
    console.error("Failed to fetch FMP gainers:", error);
    // Ultimate fallback if FMP processing crashed
    try {
      console.warn("FMP gainers processing failed. Using Yahoo Screener Fallback.");
      const gainers = await getYahooGainersFallback(limit);
      return NextResponse.json({ gainers });
    } catch (e: any) {
      return NextResponse.json(
        { error: error.message || "Failed to process FMP gainers data" },
        { status: 500 }
      );
    }
  }
}
