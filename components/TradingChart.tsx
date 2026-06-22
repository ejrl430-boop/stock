"use client";

import React, { useEffect, useRef, useState } from "react";
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  SeriesMarker, 
  Time,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  LineSeries,
  AreaSeries
} from "lightweight-charts";
import { CandleData } from "../lib/dataProvider";
import { 
  FibonacciLevel, 
  calculateEMA, 
  calculateSMA, 
  calculateRSI,
  getLocalDateString
} from "../lib/fibonacci";

function calculateIntradayVWAPSeries(candles: CandleData[]): number[] {
  const vwapValues: number[] = [];
  let cumVolume = 0;
  let cumValue = 0;
  let lastDateStr = "";

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const dateStr = getLocalDateString(c.time);
    
    if (dateStr !== lastDateStr) {
      cumVolume = 0;
      cumValue = 0;
      lastDateStr = dateStr;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumVolume += c.volume;
    cumValue += typicalPrice * c.volume;

    vwapValues.push(cumVolume > 0 ? cumValue / cumVolume : c.close);
  }

  return vwapValues;
}

interface TradingChartProps {
  candles: CandleData[];
  breakoutIndex: number | null;
  peakIndex: number | null;
  manualStartIndex: number | null;
  fibLevels: FibonacciLevel[];
  onSelectManualCandle: (index: number) => void;
  isManualMode: boolean;
  selectedFibLevelForTP: number | null;
  isMini?: boolean;
  activeStrategy?: "breakout" | "vwap" | "fibonacci";
}

export default function TradingChart({
  candles,
  breakoutIndex,
  peakIndex,
  manualStartIndex,
  fibLevels,
  onSelectManualCandle,
  isManualMode,
  selectedFibLevelForTP,
  isMini = false,
  activeStrategy = "breakout",
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  
  // Charts
  const candleChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);

  // Series
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  
  // Moving Average Series Refs
  const ema5SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma60SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma120SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  // Controls for Indicator Visibility
  const [showEMA5, setShowEMA5] = useState(true);
  const [showEMA20, setShowEMA20] = useState(true);
  const [showSMA60, setShowSMA60] = useState(true);
  const [showSMA120, setShowSMA120] = useState(true);
  const [showSMA200, setShowSMA200] = useState(true);

  // Ruler (Measure) Tool States
  const [isRulerActive, setIsRulerActive] = useState(false); // UI Button trigger
  const [shiftPressed, setShiftPressed] = useState(false);  // Shift key trigger
  const [measureStart, setMeasureStart] = useState<{ time: number; price: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ time: number; price: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [visibleRangeTrigger, setVisibleRangeTrigger] = useState(0); // For coordinate recalculation on scroll/zoom

  const priceLinesRef = useRef<any[]>([]); // Fibonacci lines
  const tpLinesRef = useRef<any[]>([]); // Target Profit lines (TP10, TP15)
  
  const candlesRef = useRef(candles);
  const isFirstLoadRef = useRef(true);

  // Sync candles ref
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // Handle Visibility Updates
  useEffect(() => {
    if (ema5SeriesRef.current) ema5SeriesRef.current.applyOptions({ visible: showEMA5 });
  }, [showEMA5]);

  useEffect(() => {
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: showEMA20 });
  }, [showEMA20]);

  useEffect(() => {
    if (sma60SeriesRef.current) sma60SeriesRef.current.applyOptions({ visible: showSMA60 });
  }, [showSMA60]);

  useEffect(() => {
    if (sma120SeriesRef.current) sma120SeriesRef.current.applyOptions({ visible: showSMA120 });
  }, [showSMA120]);

  useEffect(() => {
    if (sma200SeriesRef.current) sma200SeriesRef.current.applyOptions({ visible: showSMA200 });
  }, [showSMA200]);

  // Key Listeners for Shift Key (Shortcut for Ruler tool)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftPressed(true);
      }
      if (e.key === "Escape") {
        // Cancel measurement
        setMeasureStart(null);
        setMeasureEnd(null);
        setIsDrawing(false);
        setIsRulerActive(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 1. Initialize Charts (ONCE on mount)
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!isMini && !rsiContainerRef.current) return;

    // Create Main Candle Chart
    const candleChart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#11151d" },
        textColor: "#94a3b8",
        fontFamily: "'Outfit', sans-serif",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: { color: "#6366f1", width: 1, style: 3, labelBackgroundColor: "#6366f1" },
        horzLine: { color: "#6366f1", width: 1, style: 3, labelBackgroundColor: "#6366f1" },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Create RSI Chart
    let rsiChart: IChartApi | null = null;
    let rsiSeries: ISeriesApi<"Area"> | null = null;

    if (!isMini && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        layout: {
          background: { color: "#11151d" },
          textColor: "#94a3b8",
          fontFamily: "'Outfit', sans-serif",
        },
        grid: {
          vertLines: { color: "#1e293b" },
          horzLines: { color: "#1e293b" },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: "#6366f1", width: 1, style: 3 },
          horzLine: { color: "#6366f1", width: 1, style: 3, labelBackgroundColor: "#6366f1" },
        },
        rightPriceScale: {
          borderColor: "#1e293b",
          visible: true,
        },
        timeScale: {
          borderColor: "#1e293b",
          timeVisible: true,
          visible: false,
        },
      });

      // Add RSI Series to RSI Chart
      rsiSeries = rsiChart.addSeries(AreaSeries, {
        topColor: "rgba(99, 102, 241, 0.3)",
        bottomColor: "rgba(99, 102, 241, 0.0)",
        lineColor: "#6366f1",
        lineWidth: 1,
        priceLineVisible: false,
      });

      // Add RSI Threshold Lines
      rsiSeries.createPriceLine({
        price: 70,
        color: "#ef4444",
        lineWidth: 1 as any,
        lineStyle: 2 as any,
        axisLabelVisible: true,
        title: "70 OVERBOUGHT",
      });
      rsiSeries.createPriceLine({
        price: 50,
        color: "#94a3b8",
        lineWidth: 1 as any,
        lineStyle: 2 as any,
        axisLabelVisible: true,
        title: "50 BULLISH",
      });
      rsiSeries.createPriceLine({
        price: 45,
        color: "#f59e0b",
        lineWidth: 1 as any,
        lineStyle: 3 as any,
        axisLabelVisible: true,
        title: "45 WEAKNESS",
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: "#10b981",
        lineWidth: 1 as any,
        lineStyle: 2 as any,
        axisLabelVisible: true,
        title: "30 OVERSOLD",
      });

      rsiChart.priceScale("right").applyOptions({
        autoScale: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      });
    }

    // Add Candlestick Series to Main Chart
    const candlestickSeries = candleChart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#10b981",
      wickDownColor: "#ef4444",
      wickUpColor: "#10b981",
    });

    // Add Volume Series
    const volumeSeries = candleChart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    candleChart.priceScale("").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    candlestickSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.25 },
    });

    // Add Moving Averages
    const ema5Series = candleChart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ema20Series = candleChart.addSeries(LineSeries, {
      color: "#ec4899",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const sma60Series = candleChart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const sma120Series = candleChart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const sma200Series = candleChart.addSeries(LineSeries, {
      color: "#64748b",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const vwapSeries = candleChart.addSeries(LineSeries, {
      color: "#10b981", // 형광 에메랄드 그린
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Sync TimeScales
    const candleTimeScale = candleChart.timeScale();
    
    if (rsiChart) {
      const rsiTimeScale = rsiChart.timeScale();
      let isSyncing = false;

      candleTimeScale.subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing) return;
        if (range) {
          isSyncing = true;
          rsiTimeScale.setVisibleLogicalRange(range);
          setVisibleRangeTrigger((prev) => prev + 1); // Trigger pixel coords recalculation on scroll/zoom
          isSyncing = false;
        }
      });
      rsiTimeScale.subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncing) return;
        if (range) {
          isSyncing = true;
          candleTimeScale.setVisibleLogicalRange(range);
          setVisibleRangeTrigger((prev) => prev + 1);
          isSyncing = false;
        }
      });
    } else {
      candleTimeScale.subscribeVisibleLogicalRangeChange(() => {
        setVisibleRangeTrigger((prev) => prev + 1);
      });
    }

    // Save refs
    candleChartRef.current = candleChart;
    rsiChartRef.current = rsiChart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;
    if (rsiSeries) rsiSeriesRef.current = rsiSeries;

    ema5SeriesRef.current = ema5Series;
    ema20SeriesRef.current = ema20Series;
    sma60SeriesRef.current = sma60Series;
    sma120SeriesRef.current = sma120Series;
    sma200SeriesRef.current = sma200Series;
    vwapSeriesRef.current = vwapSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && candleChartRef.current) {
        const width = chartContainerRef.current.clientWidth;
        candleChartRef.current.applyOptions({
          width: width,
          height: chartContainerRef.current.clientHeight,
        });
        
        if (!isMini && rsiContainerRef.current && rsiChartRef.current) {
          rsiChartRef.current.applyOptions({
            width: width,
            height: rsiContainerRef.current.clientHeight,
          });
        }
      }
    };
    window.addEventListener("resize", handleResize);

    // Subscribe click for manual candle selection
    candleChart.subscribeClick((param) => {
      if (!param.time || !candlestickSeriesRef.current) return;
      const clickedTime = param.time;
      const index = candlesRef.current.findIndex((c) => c.time === (clickedTime as number));
      if (index !== -1) {
        onSelectManualCandle(index);
      }
    });

    // Initial resize trigger
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener("resize", handleResize);
      candleChart.remove();
      if (rsiChart) rsiChart.remove();
    };
  }, [onSelectManualCandle]);

  // 2. Set Data (Whenever candles or other dependencies update)
  useEffect(() => {
    const candleChart = candleChartRef.current;
    const candlestickSeries = candlestickSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const rsiSeries = rsiSeriesRef.current;
    
    const ema5Series = ema5SeriesRef.current;
    const ema20Series = ema20SeriesRef.current;
    const sma60Series = sma60SeriesRef.current;
    const sma120Series = sma120SeriesRef.current;
    const sma200Series = sma200SeriesRef.current;

    if (!candleChart || !candlestickSeries || !volumeSeries || (!isMini && !rsiSeries) || candles.length === 0) return;

    // 2.1 Deduplicate and sort candles by time to prevent lightweight-charts library crashes (Assertion: unique & ordered ascending)
    const seenTimes = new Set<number>();
    const uniqueCandles = candles
      .filter((c) => {
        if (!c.time || seenTimes.has(c.time)) return false;
        seenTimes.add(c.time);
        return true;
      })
      .sort((a, b) => a.time - b.time);

    if (uniqueCandles.length === 0) return;

    // 2.2 Set Candle Data
    const formattedCandles = uniqueCandles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candlestickSeries.setData(formattedCandles);

    // 2.3 Set Volume Data
    const formattedVolume = uniqueCandles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)",
    }));
    volumeSeries.setData(formattedVolume);

    // 2.4 Set Moving Average Data
    const ema5Val = calculateEMA(uniqueCandles, 5);
    const ema20Val = calculateEMA(uniqueCandles, 20);
    const sma60Val = calculateSMA(uniqueCandles, 60);
    const sma120Val = calculateSMA(uniqueCandles, 120);
    const sma200Val = calculateSMA(uniqueCandles, 200);

    if (ema5Series) {
      ema5Series.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: ema5Val[i] })));
    }
    if (ema20Series) {
      ema20Series.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: ema20Val[i] })));
    }
    if (sma60Series) {
      sma60Series.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: sma60Val[i] })));
    }
    if (sma120Series) {
      sma120Series.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: sma120Val[i] })));
    }
    if (sma200Series) {
      sma200Series.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: sma200Val[i] })));
    }

    // 2.5 Set RSI Data
    if (rsiSeries && !isMini) {
      const rsiVal = calculateRSI(uniqueCandles, 14);
      rsiSeries.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: rsiVal[i] })));
    }

    // 2.6 Set VWAP Data
    const vwapSeries = vwapSeriesRef.current;
    if (vwapSeries) {
      const vwapVal = calculateIntradayVWAPSeries(uniqueCandles);
      vwapSeries.setData(uniqueCandles.map((c, i) => ({ time: c.time as Time, value: vwapVal[i] })));
    }

    // 2.7 Apply Dynamic Styling based on activeStrategy
    if (ema5Series) ema5Series.applyOptions({ lineWidth: activeStrategy === "breakout" ? 2 : 1 });
    if (ema20Series) ema20Series.applyOptions({ lineWidth: activeStrategy === "breakout" ? 2 : 1 });
    if (vwapSeries) {
      vwapSeries.applyOptions({
        lineWidth: activeStrategy === "vwap" ? 3 : 1,
        color: activeStrategy === "vwap" ? "#00ffff" : "rgba(16, 185, 129, 0.4)", // VWAP 전략 시 형광 시안, 비활성 시 반투명 에메랄드
      });
    }

    // Fit content on first load only
    if (isFirstLoadRef.current) {
      candleChart.timeScale().fitContent();
      isFirstLoadRef.current = false;
    }

    // 2.5 Draw Markers
    const markers: SeriesMarker<Time>[] = [];
    const activeStartIndex = manualStartIndex !== null ? manualStartIndex : breakoutIndex;

    if (activeStartIndex !== null && activeStartIndex >= 0 && activeStartIndex < candles.length) {
      const isManual = manualStartIndex !== null;
      markers.push({
        time: candles[activeStartIndex].time as Time,
        position: "belowBar",
        color: isManual ? "#fb923c" : "#10b981",
        shape: "arrowUp",
        text: isManual ? "MANUAL START LOW" : "START LOW",
        size: 1.2,
      });
    }

    if (peakIndex !== null && peakIndex >= 0 && peakIndex < candles.length) {
      markers.push({
        time: candles[peakIndex].time as Time,
        position: "aboveBar",
        color: "#ef4444",
        shape: "arrowDown",
        text: "HIGH PEAK",
        size: 1.2,
      });
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(candlestickSeries, markers);

    // 2.6 Draw Fibonacci Lines
    priceLinesRef.current.forEach((line) => {
      candlestickSeries.removePriceLine(line);
    });
    priceLinesRef.current = [];

    if (fibLevels.length > 0 && activeStartIndex !== null && peakIndex !== null) {
      const getLineColor = (level: number) => {
        switch (level) {
          case 0.236: return "#38bdf8";
          case 0.382: return "#34d399";
          case 0.500: return "#fbbf24";
          case 0.618: return "#a78bfa";
          case 0.730: return "#818cf8";
          case 0.786: return "#f472b6";
          case 0.820: return "#ec4899";
          case 0.886: return "#fb923c";
          case 0.950: return "#f87171";
          case 1.000: return "#94a3b8";
          default: return "#94a3b8";
        }
      };

      const isFibStrategy = activeStrategy === "fibonacci";

      fibLevels.forEach((fib) => {
        const color = getLineColor(fib.level);
        const title = `FIB ${fib.level.toFixed(3)} (${fib.price})`;
        
        const lineOptions = {
          price: fib.price,
          color: color,
          lineWidth: (isFibStrategy ? (fib.isInterest ? 2.5 : 1.5) : 1) as any,
          lineStyle: (isFibStrategy ? (fib.isInterest ? 0 : 2) : 3) as any, // 3은 Sparse 점선
          axisLabelVisible: isFibStrategy,
          title: title,
        };

        const priceLine = candlestickSeries.createPriceLine(lineOptions);
        priceLinesRef.current.push(priceLine);
      });
    }
  }, [candles, breakoutIndex, peakIndex, manualStartIndex, fibLevels, activeStrategy]);

  // 3. Highlight Selected Level's TP10 and TP15 Lines
  useEffect(() => {
    const candlestickSeries = candlestickSeriesRef.current;
    if (!candlestickSeries) return;

    tpLinesRef.current.forEach((line) => {
      candlestickSeries.removePriceLine(line);
    });
    tpLinesRef.current = [];

    if (selectedFibLevelForTP !== null && fibLevels.length > 0) {
      const selectedFib = fibLevels.find((f) => f.level === selectedFibLevelForTP);
      if (selectedFib) {
        const entryPrice = selectedFib.price;
        const tp10Price = Number((entryPrice * 1.10).toFixed(4));
        const tp15Price = Number((entryPrice * 1.15).toFixed(4));

        const tp10Line = candlestickSeries.createPriceLine({
          price: tp10Price,
          color: "#f59e0b",
          lineWidth: 2 as any,
          lineStyle: 1 as any,
          axisLabelVisible: true,
          title: `🎯 TP +10% (${tp10Price})`,
        });

        const tp15Line = candlestickSeries.createPriceLine({
          price: tp15Price,
          color: "#10b981",
          lineWidth: 2 as any,
          lineStyle: 1 as any,
          axisLabelVisible: true,
          title: `🎯 TP +15% (${tp15Price})`,
        });

        tpLinesRef.current.push(tp10Line, tp15Line);
      }
    }
  }, [selectedFibLevelForTP, fibLevels]);

  // ==========================================
  // Ruler (Measure) Mouse Drag Handlers
  // ==========================================
  
  const handleMeasureMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const chart = candleChartRef.current;
    const series = candlestickSeriesRef.current;
    const container = chartContainerRef.current;
    if (!chart || !series || !container) return;

    // Reset old measurement on new click
    if (!isDrawing) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const time = chart.timeScale().coordinateToTime(x) as number;
      const price = series.coordinateToPrice(y) as number;

      if (time && price) {
        setMeasureStart({ time, price });
        setMeasureEnd({ time, price });
        setIsDrawing(true);

        // Lock chart scroll & scale during measurement drawing
        chart.applyOptions({
          handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
          handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
        });
      }
    }
  };

  const handleMeasureMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const chart = candleChartRef.current;
    const series = candlestickSeriesRef.current;
    const container = chartContainerRef.current;
    if (!chart || !series || !container || !isDrawing || !measureStart) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(x) as number;
    const price = series.coordinateToPrice(y) as number;

    if (time && price) {
      setMeasureEnd({ time, price });
    }
  };

  const handleMeasureMouseUp = () => {
    const chart = candleChartRef.current;
    if (isDrawing) {
      setIsDrawing(false);
      setIsRulerActive(false); // Turn off ruler tool once drag is completed

      // Unlock chart scroll & scale
      if (chart) {
        chart.applyOptions({
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
          handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
        });
      }
    }
  };

  // Convert time & price coordinates to pixels for rendering the DOM overlay box
  const getMeasurePixels = () => {
    const chart = candleChartRef.current;
    const series = candlestickSeriesRef.current;
    if (!chart || !series || !measureStart || !measureEnd) return null;

    const x1 = chart.timeScale().timeToCoordinate(measureStart.time as any);
    const x2 = chart.timeScale().timeToCoordinate(measureEnd.time as any);
    const y1 = series.priceToCoordinate(measureStart.price);
    const y2 = series.priceToCoordinate(measureEnd.price);

    if (x1 === null || x2 === null || y1 === null || y2 === null) return null;

    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    // Calculate metrics
    const priceDiff = measureEnd.price - measureStart.price;
    const percentDiff = (priceDiff / measureStart.price) * 100;
    
    // Calculate candle bars count
    const idx1 = candles.findIndex((c) => c.time === measureStart.time);
    const idx2 = candles.findIndex((c) => c.time === measureEnd.time);
    const bars = idx1 !== -1 && idx2 !== -1 ? Math.abs(idx2 - idx1) + 1 : 0;

    return {
      left,
      top,
      width,
      height,
      priceDiff,
      percentDiff,
      bars,
      isUp: priceDiff >= 0,
    };
  };

  const measurePixels = getMeasurePixels();
  const isOverlayActive = isRulerActive || shiftPressed;

  return (
    <div className="chart-layout-wrapper">
      {/* Side Toolbar (TradingView style) */}
      {!isMini && (
        <div className="chart-side-toolbar">
          <button 
            className={`toolbar-btn ruler-btn ${isRulerActive ? "active" : ""}`}
            onClick={() => {
              setIsRulerActive(!isRulerActive);
              // Cancel current drawing if toggled off
              if (isRulerActive) {
                setMeasureStart(null);
                setMeasureEnd(null);
              }
            }}
            title="측정 도구 (자) - 단축키: Shift + 드래그"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19.5 3h-15C3.67 3 3 3.67 3 4.5v15c0 .83.67 1.5 1.5 1.5h15c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zm-5 16h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V5h2v2z" />
            </svg>
          </button>
        </div>
      )}

      {/* Main Chart Pane Container */}
      <div className="chart-main-pane">
        {/* Indicator Controls */}
        {!isMini && (
          <div className="indicators-legend">
            <label className="legend-item text-yellow">
              <input 
                type="checkbox" 
                checked={showEMA5} 
                onChange={(e) => setShowEMA5(e.target.checked)} 
              />
              <span className="dot dot-ema5"></span>
              EMA 5
            </label>
            <label className="legend-item text-pink">
              <input 
                type="checkbox" 
                checked={showEMA20} 
                onChange={(e) => setShowEMA20(e.target.checked)} 
              />
              <span className="dot dot-ema20"></span>
              EMA 20
            </label>
            <label className="legend-item text-blue">
              <input 
                type="checkbox" 
                checked={showSMA60} 
                onChange={(e) => setShowSMA60(e.target.checked)} 
              />
              <span className="dot dot-sma60"></span>
              SMA 60
            </label>
            <label className="legend-item text-purple">
              <input 
                type="checkbox" 
                checked={showSMA120} 
                onChange={(e) => setShowSMA120(e.target.checked)} 
              />
              <span className="dot dot-sma120"></span>
              SMA 120
            </label>
            <label className="legend-item text-slate">
              <input 
                type="checkbox" 
                checked={showSMA200} 
                onChange={(e) => setShowSMA200(e.target.checked)} 
              />
              <span className="dot dot-sma200"></span>
              SMA 200
            </label>
          </div>
        )}

        {isManualMode && (
          <div className="manual-mode-banner">
            🎯 수동 기준 캔들 지정 모드 활성화 (차트의 캔들을 클릭하세요)
          </div>
        )}

        {/* Absolute DOM Overlay for Ruler (Measure tool) */}
        <div 
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            flex: 3,
          }}
        >
          {/* Interactive Mouse Event Trap Layer */}
          <div 
            className={`measure-trap-overlay ${isOverlayActive ? "active" : ""}`}
            onMouseDown={handleMeasureMouseDown}
            onMouseMove={handleMeasureMouseMove}
            onMouseUp={handleMeasureMouseUp}
            onClick={() => {
              // Click once without dragging to clear measurements
              if (!isDrawing && !isOverlayActive) {
                setMeasureStart(null);
                setMeasureEnd(null);
              }
            }}
          />

          {/* Visual Measure Box */}
          {measurePixels && (
            <div 
              className={`measure-visual-box ${measurePixels.isUp ? "up" : "down"}`}
              style={{
                left: `${measurePixels.left}px`,
                top: `${measurePixels.top}px`,
                width: `${measurePixels.width}px`,
                height: `${measurePixels.height}px`,
              }}
            >
              {/* Measure Statistics Info Badge */}
              <div 
                className="measure-info-badge"
                style={{
                  transform: measurePixels.isUp ? "translateY(-110%)" : "translateY(110%)",
                  left: `${Math.max(0, (measurePixels.width / 2) - 80)}px`,
                }}
              >
                <span className="badge-change">
                  {measurePixels.isUp ? "▲ " : "▼ "}
                  {measurePixels.priceDiff > 0 ? "+" : ""}
                  {measurePixels.priceDiff.toFixed(4)}
                </span>
                <span className="badge-percent">
                  ({measurePixels.percentDiff > 0 ? "+" : ""}
                  {measurePixels.percentDiff.toFixed(2)}%)
                </span>
                <span className="badge-bars">
                  {measurePixels.bars} bars
                </span>
              </div>
            </div>
          )}

          {/* Candle Series Pane */}
          <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }} />
        </div>

        {/* RSI Pane */}
        {!isMini && (
          <>
            <div className="rsi-pane-header">
              <span>RSI (14)</span>
            </div>
            <div ref={rsiContainerRef} className="rsi-pane-container" />
          </>
        )}
      </div>

      <style jsx>{`
        .chart-layout-wrapper {
          display: flex;
          flex-direction: row;
          position: relative;
          width: 100%;
          height: 100%;
          background-color: #11151d;
        }

        /* Side Toolbar style */
        .chart-side-toolbar {
          width: 42px;
          background-color: #151a24;
          border-right: 1px solid #1e293b;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 12px;
          gap: 8px;
          z-index: 20;
        }

        .toolbar-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: all 0.2s ease;
        }

        .toolbar-btn:hover {
          background-color: #1b2230;
          color: #f3f4f6;
        }

        .toolbar-btn.active {
          background-color: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          border: 1px solid rgba(99, 102, 241, 0.4);
        }

        .chart-main-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .indicators-legend {
          display: flex;
          gap: 16px;
          padding: 8px 16px;
          background-color: #151a24;
          border-bottom: 1px solid #1e293b;
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          z-index: 10;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
        }

        .legend-item input {
          cursor: pointer;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .dot-ema5 { background-color: #f59e0b; }
        .dot-ema20 { background-color: #ec4899; }
        .dot-sma60 { background-color: #3b82f6; }
        .dot-sma120 { background-color: #8b5cf6; }
        .dot-sma200 { background-color: #64748b; }

        .text-yellow { color: #f59e0b; }
        .text-pink { color: #ec4899; }
        .text-blue { color: #3b82f6; }
        .text-purple { color: #8b5cf6; }
        .text-slate { color: #94a3b8; }

        .manual-mode-banner {
          position: absolute;
          top: 40px;
          left: 12px;
          z-index: 15;
          background: rgba(245, 158, 11, 0.9);
          color: #0b0e14;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          pointer-events: none;
        }

        .rsi-pane-header {
          background-color: #151a24;
          border-top: 1px solid #1e293b;
          border-bottom: 1px solid #1e293b;
          padding: 4px 16px;
          font-size: 11px;
          font-weight: 700;
          color: #6366f1;
        }

        .rsi-pane-container {
          flex: 1;
          width: 100%;
          min-height: 100px;
        }

        /* Measure Tool CSS styles */
        .measure-trap-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10;
          background-color: transparent;
          pointer-events: none;
        }

        .measure-trap-overlay.active {
          pointer-events: auto;
          cursor: crosshair;
        }

        .measure-visual-box {
          position: absolute;
          border: 1px dashed #6366f1;
          pointer-events: none;
          z-index: 9;
          transition: border-color 0.15s ease;
        }

        .measure-visual-box.up {
          background-color: rgba(16, 185, 129, 0.12);
          border-color: #10b981;
        }

        .measure-visual-box.down {
          background-color: rgba(239, 68, 68, 0.12);
          border-color: #ef4444;
        }

        .measure-info-badge {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          background-color: rgba(21, 26, 36, 0.95);
          border: 1px solid #3b82f6;
          border-radius: 6px;
          padding: 6px 12px;
          width: 160px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
          font-size: 11px;
          font-weight: 700;
          color: #f3f4f6;
          z-index: 12;
        }

        .measure-visual-box.up .measure-info-badge {
          border-color: #10b981;
        }

        .measure-visual-box.down .measure-info-badge {
          border-color: #ef4444;
        }

        .badge-change {
          font-size: 12px;
        }
        
        .measure-visual-box.up .badge-change { color: #10b981; }
        .measure-visual-box.down .badge-change { color: #ef4444; }

        .badge-percent {
          font-size: 11px;
          color: #e2e8f0;
        }

        .badge-bars {
          font-size: 9px;
          color: #94a3b8;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
